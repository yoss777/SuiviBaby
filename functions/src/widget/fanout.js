// Widget « Bébé maintenant » en temps réel (plan-temps-reel.md, étape E5).
// À chaque écriture d'un événement du jour ou de la tétée partagée d'un enfant,
// le serveur relit l'état COURANT de l'enfant, calcule les données du widget
// avec le module partagé (functions/shared/widget, le même code que l'app),
// pour chaque appareil du foyer dans son fuseau, puis les envoie en message de
// données (Android). Le récepteur natif (modules/widget-push) les écrit sans
// démarrer l'app. iPhone (E7, option 1) : même message en notification
// silencieuse (content-available, priorité normale) ; iOS réveille l'app en
// arrière-plan au mieux (services/widgetPushIos.ts). Activé à part :
// app_config/widgetPush.ios === true.
//
// Sûreté :
// - désactivé tant que app_config/widgetPush n'a pas enabled: true (bêta :
//   allowUids limite les destinataires) ;
// - seulement les membres de l'enfant (children/{c}/access), avec un
//   consentement santé valide, hors comptes en cours de suppression ;
// - seulement les appareils qui affichent cet enfant (widgetChildId), avec un
//   récepteur (widgetCap >= 1) ;
// - rien de plus que ce que le widget affiche ; jamais d'auteur ;
// - journaux sans prénom ni contenu.
const { Buffer } = require("node:buffer");
const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const widget = require("../../shared/widget");
const reminderLib = require("../../lib/reminders");
const { hasWidgetHealthConsent, widgetMinConsentVersion } = require("../shared/consent");
const { subscriptionStateFrom, isEntitledStatus } = require("../billing/subscription");
const { usersWithPendingDeletion } = require("../notifications/eligibility");
const { getExpoClient, getExpoModule } = require("../shared/runtime");
const { wipeWidgetForUser } = require("./wipe");

const HOUR = 3600 * 1000;
/** Capacité minimale pour recevoir les données du widget (voir pushTokenService). */
const DATA_CAP = 3;
/**
 * iPhone : Apple tolère 2-3 notifications silencieuses par heure ; au-delà,
 * iOS les retarde ou les abandonne. Plafond par appareil : début/fin de
 * session au plus toutes les 2 min, le reste toutes les 20 min.
 */
const IOS_MIN_GAP_URGENT_MS = 2 * 60 * 1000;
const IOS_MIN_GAP_MS = 20 * 60 * 1000;
/** Événements lus : de quoi couvrir « aujourd'hui » dans tout fuseau, et hier pour le dernier repas. */
const LOOKBACK_MS = 48 * HOUR;
/** Un événement plus ancien ne change pas le widget. */
const RELEVANT_AGE_MS = 36 * HOUR;
const MAX_MESSAGE_BYTES = 3500;
const MESSAGE_TTL_S = 900;
const DEFAULT_TZ = "Europe/Paris";

/** Types d'événements que le widget affiche (sessions, compteurs, fil du jour). */
const WIDGET_TYPES = new Set([
  "tetee", "biberon", "solide", "miction", "selle", "sommeil", "activite",
  "vitamine", "medicament", "temperature", "symptome", "vaccin", "bain",
  "nettoyage_nez", "pompage", "croissance",
]);

const toMs = (value) => {
  if (value == null) return NaN;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

/**
 * L'écriture d'un événement concerne-t-elle un widget ? Renvoie
 * { childId, urgent } ou null. urgent : début ou fin d'une session (sommeil,
 * promenade), qui part en priorité haute ; le reste en priorité normale.
 */
function eventChange(before, after, nowMs) {
  const doc = after || before;
  if (!doc || !WIDGET_TYPES.has(doc.type) || !doc.childId) return null;
  const recent = [before, after].some((d) => d && nowMs - toMs(d.date) <= RELEVANT_AGE_MS);
  if (!recent) return null;
  const session = doc.type === "sommeil" || (doc.type === "activite" && doc.typeActivite === "promenade");
  const endChanged = (before?.heureFin == null) !== (after?.heureFin == null);
  const urgent = session && (!before || !after || endChanged);
  return { childId: doc.childId, urgent };
}

/**
 * Écriture de la tétée partagée (children/{c}/live/nursing) : seuls le début
 * et la fin sont urgents. Une bascule de côté, une pause ou une reprise part en
 * priorité normale : sinon elle consomme le plafond iPhone de 2 min et peut
 * retarder l'envoi de la fin de tétée.
 * Le document n'est jamais supprimé : la fin d'une tétée écrit un état vide
 * (EMPTY_NURSING_TIMER). On compare donc « une tétée est en cours (utilisable) »
 * avant et après, pas l'existence du document.
 */
function liveChange(before, after, nowMs = Date.now()) {
  const was = widget.usableNursing(before, nowMs);
  const is = widget.usableNursing(after, nowMs);
  // Tout changement visible d'une tétée est urgent (début, fin, pause,
  // reprise, changement de côté) : les autres téléphones du foyer doivent
  // suivre en direct (décision du 18/11). Seule une écriture sans tétée ni
  // avant ni après (état vide réécrit) ne l'est pas.
  return { urgent: was != null || is != null };
}

function isPremium(subscriptionSnap, nowMs) {
  const state = subscriptionStateFrom(subscriptionSnap);
  if (state.grandfathered) return true;
  const paid = state.tier === "premium" || state.tier === "family";
  return paid && isEntitledStatus(state, nowMs);
}

/** Événements bruts de l'enfant → sources du module partagé (heures en ms). */
// Comme la garde « déjà en cours » (events/callables.js) : au-delà de 24 h,
// une session ouverte est oubliée, elle n'est plus « en cours ».
const RUNNING_MAX_MS = 24 * 3600 * 1000;

function splitEvents(eventDocs, nowMs = Date.now()) {
  const out = { tetees: [], biberons: [], solides: [], mictions: [], selles: [], others: [], sleeps: [], sleepNow: null, walkNow: null };
  for (const d of eventDocs) {
    const e = d.data();
    if (e.deletedAt) continue;
    const ms = toMs(e.date);
    if (!Number.isFinite(ms)) continue;
    const startMs = toMs(e.heureDebut);
    const endMs = toMs(e.heureFin);
    switch (e.type) {
      case "tetee":
        out.tetees.push({ ms, dureeGauche: e.dureeGauche, dureeDroite: e.dureeDroite, coteGauche: e.coteGauche, coteDroit: e.coteDroit });
        break;
      case "biberon":
        out.biberons.push({ ms, typeBiberon: e.typeBiberon, quantite: e.quantite });
        break;
      case "solide":
        out.solides.push({ ms });
        break;
      case "miction":
        out.mictions.push({ ms });
        break;
      case "selle":
        out.selles.push({ ms });
        break;
      default: {
        if (e.type === "sommeil") {
          out.sleeps.push({ ms, startMs, endMs });
          if (Number.isFinite(startMs) && e.heureFin == null && nowMs - startMs < RUNNING_MAX_MS && (!out.sleepNow || startMs > out.sleepNow.startMs)) {
            out.sleepNow = { startMs, isNap: typeof e.isNap === "boolean" ? e.isNap : null };
          }
        }
        if (e.type === "activite" && e.typeActivite === "promenade" && Number.isFinite(startMs) && e.heureFin == null && nowMs - startMs < RUNNING_MAX_MS) {
          if (!out.walkNow || startMs > out.walkNow.startMs) out.walkNow = { startMs };
        }
        // Champs utiles aux libellés du fil seulement (pas de note, pas d'auteur).
        out.others.push({
          ms,
          type: e.type,
          nomVitamine: e.nomVitamine,
          // Ni nom de médicament ou de vaccin (saisie libre) : libellés
          // génériques. Température : la valeur mesurée (choix produit,
          // 16/11/2026, décrit dans la politique 2.3), comme l'app.
          valeur: e.type === "temperature" && typeof e.valeur === "number" ? e.valeur : undefined,
          typeActivite: e.typeActivite,
          duree: e.duree,
          isNap: e.isNap,
          // Jalons : type et humeur seulement (jamais le titre ni la description libres).
          typeJalon: e.typeJalon,
          humeur: e.humeur,
          heureDebut: e.heureDebut ?? null,
          heureFin: e.heureFin ?? null,
        });
      }
    }
  }
  return out;
}

/** Données du widget pour un appareil (son fuseau) et son utilisateur (Premium, rappels). */
function propsForDevice({ childId, childName, split, nursing, lastAbsoluteMealMs, lastAbsoluteDiaperMs, tz, premium, canWrite, reminders, nowMs }) {
  let env;
  try {
    env = widget.zonedEnv(tz || DEFAULT_TZ);
  } catch {
    // Fuseau illisible : jour du widget calculé à Paris. Signalé, sans le
    // fuseau lui-même (donnée de l'appareil).
    console.warn("widgetFanout: invalid device time zone, using default");
    env = widget.zonedEnv(DEFAULT_TZ);
  }
  const [dayStart, dayEnd] = env.dayBounds(nowMs);
  const input = widget.assembleNowWidgetInput(
    {
      childName,
      nursing,
      tetees: split.tetees,
      biberons: split.biberons,
      solides: split.solides,
      mictions: split.mictions,
      selles: split.selles,
      others: split.others,
      sleepStartMs: split.sleepNow ? split.sleepNow.startMs : null,
      sleepIsNap: split.sleepNow ? split.sleepNow.isNap : null,
      walkStartMs: split.walkNow ? split.walkNow.startMs : null,
      // Sommeils terminés seulement (comme l'Accueil) : le widget ajoute
      // lui-même le sommeil en cours, qui avance (day.sleepRunningFromMs).
      sleepTotalMinutes: widget.sleepMinutesInDay(
        split.sleeps.filter((s) => Number.isFinite(s.endMs)),
        dayStart,
        dayEnd,
        nowMs,
      ),
      lastAbsoluteMealMs,
      // getLastEventMillis : null = aucun évènement de la catégorie (prouvé) ;
      // absent (anciens appels) = inconnu.
      // undefined (date illisible) = inconnu pour cette catégorie seulement.
      lastEventAt: { repas: lastAbsoluteMealMs, changes: lastAbsoluteDiaperMs },
      isPremium: premium,
      canWrite: canWrite !== false,
      reminders,
      now: nowMs,
    },
    env,
  );
  return { ...widget.buildNowWidgetProps(input, env), childId };
}

/** Message « w1 » sous la taille limite : le fil du jour est raccourci si besoin. */
function widgetMessageData(childId, seq, props) {
  const native = widget.toNativeWidgetProps(props);
  for (const keep of [native.recent.length, 10, 5, 0]) {
    const data = { t: "w1", c: childId, s: seq, p: { ...native, recent: native.recent.slice(0, keep) } };
    if (Buffer.byteLength(JSON.stringify(data), "utf8") <= MAX_MESSAGE_BYTES) return data;
  }
  return null;
}

/**
 * Relit l'enfant et envoie les données du widget à chaque appareil concerné.
 * Exporté pour les tests.
 */
async function fanOutWidget(db, childId, { urgent, config: preloadedConfig, iosOnly = false }) {
  const startedAt = Date.now();
  const stats = { recipients: 0, devices: 0, sent: 0, failed: 0, skipped: 0, deadTokens: 0, errors: 0 };
  // Renvoie aussi l'heure à laquelle un iPhone écarté par le plafond pourra
  // recevoir (rattrapage d'un envoi urgent, coalescedFanOut).
  let iosRetryAtMs = null;
  const log = (reason) => {
    reminderLib.logJobSummary("widgetFanout", startedAt, { reason, urgent, ...(iosOnly ? { iosOnly } : {}), ...stats });
    return { reason, iosRetryAtMs };
  };

  const config = preloadedConfig || (await db.doc("app_config/widgetPush").get()).data() || {};
  if (config.enabled !== true) return log("disabled");
  const allowUids = Array.isArray(config.allowUids) ? new Set(config.allowUids) : null;
  const minConsent = widgetMinConsentVersion(config);

  // Lectures de départ en parallèle (avant : l'une après l'autre).
  const nowMs = Date.now();
  const since = admin.firestore.Timestamp.fromMillis(nowMs - LOOKBACK_MS);
  const [childSnap, accessSnap, eventsSnap, liveSnap, devicesSnap] = await Promise.all([
    db.doc(`children/${childId}`).get(),
    db.collection(`children/${childId}/access`).get(),
    // État courant de l'enfant : l'exécution la plus tardive lit le plus frais
    // (readTime croissant = séquence du message).
    db.collection("events").where("childId", "==", childId).where("date", ">=", since).get(),
    db.doc(`children/${childId}/live/nursing`).get(),
    // Tous les appareils qui affichent cet enfant, en une requête (avant : une
    // par membre) ; filtrés ensuite sur les membres retenus.
    // widgetPush : un widget est vraiment posé (widgetChildId est inscrit dès
    // l'ouverture de l'Accueil) ; les autres appareils ne sont plus lus.
    db.collection("device_tokens").where("widgetChildId", "==", childId).where("widgetPush", "==", true).get(),
  ]);
  if (!childSnap.exists || childSnap.data()?.deletedAt) return log("no-child");
  const child = childSnap.data();

  // Droit de saisie par membre (owner/admin) : un Proche reçoit canWrite=false.
  const writers = new Set(
    accessSnap.docs.filter((d) => ["owner", "admin"].includes(d.data()?.role)).map((d) => d.id),
  );
  let members = accessSnap.docs.map((d) => d.id).filter((uid) => !allowUids || allowUids.has(uid));
  if (members.length === 0) return log("no-member");
  // Appareils par membre (une seule requête plus haut).
  const devicesByUid = new Map();
  for (const d of devicesSnap.docs) {
    const uid = d.data()?.userId;
    if (typeof uid !== "string") {
      stats.badDeviceDoc = (stats.badDeviceDoc || 0) + 1;
      continue;
    }
    if (!devicesByUid.has(uid)) devicesByUid.set(uid, []);
    devicesByUid.get(uid).push(d);
  }
  // Membres sans appareil pour cet enfant : rien à lire ni à envoyer.
  members = members.filter((uid) => devicesByUid.has(uid));
  if (members.length === 0) return log("no-device");

  const unknown = { unknownOnInvalid: true };
  // Une lecture en erreur n'arrête pas l'envoi (comme avant, membre par
  // membre) : dernier repas / change « inconnu », préférences relues une à une.
  // Seule la liste des comptes en suppression est indispensable (sûreté).
  const lastOrUnknown = (category) =>
    reminderLib.getLastEventMillis(db, childId, child, category, null, unknown).catch((error) => {
      stats.errors++;
      stats.lastEventUnreadable = (stats.lastEventUnreadable || 0) + 1;
      console.warn("widgetFanout: last event unreadable", { code: error?.code ?? "unknown" });
      return undefined;
    });
  const memberRefs = members.flatMap((uid) => [db.doc(`user_preferences/${uid}`), db.doc(`subscriptions/${uid}`)]);
  const [leaving, lastAbsoluteMealMs, lastAbsoluteDiaperMs, memberDocs] = await Promise.all([
    usersWithPendingDeletion(db, members),
    // Date illisible : « inconnu » (undefined), jamais « aucun repas noté ».
    lastOrUnknown("repas"),
    lastOrUnknown("changes"),
    // Préférences et abonnements de tous les membres en un aller-retour.
    db.getAll(...memberRefs).catch((error) => {
      stats.errors++;
      console.warn("widgetFanout: grouped member read failed", { code: error?.code ?? "unknown" });
      // Repli : une lecture par document ; un document illisible = membre écarté.
      return Promise.all(memberRefs.map((r) => r.get().catch(() => null)));
    }),
  ]);
  const prefsByUid = new Map();
  const subByUid = new Map();
  members.forEach((uid, i) => {
    prefsByUid.set(uid, memberDocs[2 * i]);
    subByUid.set(uid, memberDocs[2 * i + 1]);
  });
  members = members.filter((uid) => !leaving.has(uid));
  // Mesure du jalon 4 : temps des lectures (avant : en série, membre par membre).
  stats.readMs = Date.now() - startedAt;
  stats.members = members.length;

  const seq = eventsSnap.readTime && typeof eventsSnap.readTime.toMillis === "function" ? eventsSnap.readTime.toMillis() : nowMs;
  const split = splitEvents(eventsSnap.docs, nowMs);
  const nursing = widget.usableNursing(liveSnap.exists ? liveSnap.data() : null, nowMs);

  const messages = [];
  const tokenDocs = [];
  const consentWipeUids = [];
  for (const uid of members) {
    // Un membre en erreur (lecture refusée, réseau) n'arrête pas l'envoi aux
    // autres : compté, journalisé sans identifiant.
    try {
      const prefsSnap = prefsByUid.get(uid);
      // Préférences illisibles : pas de preuve du consentement, membre écarté.
      if (prefsSnap == null) {
        stats.errors++;
        stats.prefsUnreadable = (stats.prefsUnreadable || 0) + 1;
        continue;
      }
      const prefs = prefsSnap.exists ? prefsSnap.data() : {};
      // Consentement santé d'une version qui couvre le widget (shared/consent).
      if (!hasWidgetHealthConsent(prefs, minConsent)) {
        stats.skipped++;
        // Consentement donné, mais d'une version qui ne couvre plus le widget
        // (version exigée relevée, p. ex. 2.2 → 2.3) : son widget garde les
        // données reçues avant. Effacé à distance ; l'enfant est retiré du
        // jeton, donc une seule fois par appareil tant que l'app ne le
        // réinscrit pas.
        if (prefs?.healthDataConsent?.granted === true && (devicesByUid.get(uid) || []).length > 0) {
          consentWipeUids.push(uid);
        }
        continue;
      }
      const devices = (devicesByUid.get(uid) || []).filter((d) => {
        const t = d.data();
        const iosLast = typeof t.lastIosPushAt === "number" ? t.lastIosPushAt : 0;
        const gap = urgent ? IOS_MIN_GAP_URGENT_MS : IOS_MIN_GAP_MS;
        const iosAllowed = t.platform !== "ios" || nowMs - iosLast >= gap;
        const receiver = t.widgetPush === true && Number(t.widgetCap) >= DATA_CAP;
        if (t.platform === "ios" && config.ios === true && !iosAllowed && receiver) {
          stats.iosThrottled = (stats.iosThrottled || 0) + 1;
          iosRetryAtMs = Math.min(iosRetryAtMs ?? Infinity, iosLast + gap);
        }
        const platformOk =
          (t.platform === "android" && !iosOnly) || (t.platform === "ios" && config.ios === true && iosAllowed);
        // widgetCap >= 3 : version qui n'annonce widgetPush que si un widget est
        // posé (les plus anciennes le gardaient vrai sans widget : plus rien).
        return t.widgetPush === true && Number(t.widgetCap) >= DATA_CAP && platformOk &&
          getExpoModule().Expo.isExpoPushToken(t.token);
      });
      if (devices.length === 0) continue;
      stats.recipients++;

      // Abonnement illisible : membre écarté (comme avant le jalon 4, où la
      // lecture en erreur arrêtait ce membre) ; le widget garde son dernier
      // état au lieu de passer à tort en version gratuite.
      const subSnap = subByUid.get(uid);
      if (subSnap == null) {
        stats.errors++;
        stats.subUnreadable = (stats.subUnreadable || 0) + 1;
        continue;
      }
      const premium = isPremium(subSnap, nowMs);
      const r = prefs.notifications?.reminders || {};
      const reminders = {
        enabled: r.enabled === true,
        repasHours: Number(r.thresholds?.repas) || 0,
        changesHours: Number(r.thresholds?.changes) || 0,
      };
      for (const device of devices) {
        const t = device.data();
        const props = propsForDevice({
          childId,
          childName: child.name || "",
          split,
          nursing,
          lastAbsoluteMealMs,
          lastAbsoluteDiaperMs,
          tz: t.tz,
          premium,
          canWrite: writers.has(uid),
          reminders,
          nowMs,
        });
        // Clé des liens de cet appareil (posée par l'app) : les liens du widget
        // réécrit par le serveur restent utilisables sans confirmation.
        if (typeof t.widgetLinkKey === "string" && /^[0-9a-f]{16,64}$/.test(t.widgetLinkKey)) {
          props.linkKey = t.widgetLinkKey;
        }
        const data = widgetMessageData(childId, seq, props);
        if (!data) {
          stats.errors++;
          stats.tooBig = (stats.tooBig || 0) + 1;
          // Sans identifiant (règle du fichier) : compté dans stats.tooBig.
          console.warn("widgetFanout: message too big even without the day feed");
          continue;
        }
        stats.devices++;
        tokenDocs.push({ ref: device.ref, token: t.token, platform: t.platform });
        // iPhone : notification silencieuse, sans titre ni son. Apple exige la
        // priorité normale (5) pour une notification d'arrière-plan.
        messages.push(
          t.platform === "ios"
            ? { to: t.token, data, _contentAvailable: true, priority: "normal", ttl: MESSAGE_TTL_S }
            : { to: t.token, data, priority: urgent ? "high" : "normal", ttl: MESSAGE_TTL_S },
        );
      }
    } catch (error) {
      stats.errors++;
      // Code seulement : le message peut contenir un chemin (uid, enfant).
      console.error("widgetFanout: member failed", { code: error?.code ?? "unknown" });
    }
  }
  if (consentWipeUids.length > 0) {
    // wipeWidgetForUser ne lève jamais (échecs journalisés par lui).
    const wiped = await Promise.all(consentWipeUids.map((uid) => wipeWidgetForUser(db, uid, childId)));
    stats.consentWiped = wiped.reduce((n, r) => n + (r?.sent ?? 0), 0);
  }
  // Aucun message parce que des membres ont échoué : une vraie panne.
  // Raison précise : un widget iPhone périmé par le plafond ne doit pas passer
  // pour « aucun appareil ».
  if (messages.length === 0) {
    return log(stats.errors > 0 ? "failed" : stats.iosThrottled ? "throttled" : stats.skipped ? "no-consent" : "no-device");
  }

  const sendStartedAt = Date.now();
  const { delivered, failed, dead, chunkErrors, errorsByCode } = await reminderLib.sendPushWithTickets(getExpoClient(), messages);
  stats.sendMs = Date.now() - sendStartedAt;
  // iPhone : heure du dernier envoi, pour le plafond (champ serveur seulement).
  const iosSent = tokenDocs.filter((d) => d.platform === "ios" && !dead.has(d.token));
  await Promise.all(
    iosSent.map((d) =>
      d.ref.update({ lastIosPushAt: nowMs }).catch(() => {
        // Sans cette heure, le plafond iPhone ne s'applique plus : compté.
        stats.iosStampFailed = (stats.iosStampFailed || 0) + 1;
        stats.errors++;
      }),
    ),
  );
  if (errorsByCode && Object.keys(errorsByCode).length > 0) stats.errorsByCode = errorsByCode;
  stats.sent = delivered;
  stats.failed = failed;
  stats.errors += chunkErrors;
  if (dead.size > 0) stats.deadTokens = await reminderLib.removeDeadTokens(tokenDocs, dead);
  return log(delivered === 0 && failed > 0 ? "failed" : "sent");
}

/**
 * Regroupement des envois rapprochés : plusieurs saisies coup sur coup (fil du
 * jour, notes, compteurs) ne déclenchent qu'un envoi, celui de la dernière, qui
 * relit l'état complet. Chaque déclenchement pose un jeton par enfant, attend
 * 2 s, et n'envoie que s'il est toujours le dernier. Un envoi urgent (début ou
 * fin de session) part tout de suite et rend caducs les envois en attente :
 * il lit l'état le plus récent. Collection réservée au serveur (règle par
 * défaut : aucun accès client), jeton et heure seulement.
 */
const COALESCE_MS = 2000;
let coalesceMs = COALESCE_MS;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function coalescedFanOut(db, childId, { urgent }) {
  const startedAt = Date.now();
  // Interrupteur lu d'abord : widget désactivé, ni marqueur ni attente.
  const config = (await db.doc("app_config/widgetPush").get()).data() || {};
  if (config.enabled !== true) {
    reminderLib.logJobSummary("widgetFanout", startedAt, { reason: "disabled", urgent });
    return;
  }
  // Réglable sans redéploiement (app_config/widgetPush.coalesceMs) ; 0 coupe
  // le regroupement.
  // Seulement un vrai nombre : null, "" ou false ne coupent pas le regroupement.
  const configured = config.coalesceMs;
  const waitMs =
    typeof configured === "number" && Number.isFinite(configured) && configured >= 0
      ? Math.min(configured, 10_000)
      : coalesceMs;
  if (waitMs === 0) return fanOutWidget(db, childId, { urgent, config });
  // Aucun appareil n'affiche cet enfant (la plupart des familles) : ni
  // marqueur, ni attente de 2 s ; une seule lecture.
  try {
    // widgetPush : un widget est vraiment posé (widgetChildId est inscrit dès
    // l'ouverture de l'Accueil, widget ou pas).
    const any = await db
      .collection("device_tokens")
      .where("widgetChildId", "==", childId)
      .where("widgetPush", "==", true)
      .limit(1)
      .get();
    if (any.empty) {
      reminderLib.logJobSummary("widgetFanout", startedAt, { reason: "no-device", urgent, precheck: true });
      return;
    }
  } catch (error) {
    // Lecture impossible : on continue (au pire, un marqueur pour rien).
    console.warn("widgetFanout: pre-check failed", { code: error?.code ?? "unknown" });
  }
  const ref = db.doc(`widget_fanout/${childId}`);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    // expireAt : politique TTL Firestore sur widget_fanout (marqueur jamais
    // orphelin, même posé par un déclenchement tardif après la suppression de
    // l'enfant).
    // merge : la réservation du rattrapage iPhone (iosCatchUpFor) survit aux
    // déclenchements suivants.
    await ref.set(
      { token, at: Date.now(), expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 24 * HOUR) },
      { merge: true },
    );
  } catch (error) {
    // Marqueur impossible : on envoie sans regrouper plutôt que de perdre l'envoi.
    // Journal sans identifiant (règle du fichier).
    console.warn("widgetFanout: coalesce marker failed", { code: error?.code ?? "unknown" });
    return fanOutWidget(db, childId, { urgent, config });
  }
  if (urgent) {
    const result = await sendOnce(db, childId, { urgent, config });
    return iosCatchUp(db, childId, config, result);
  }
  await sleep(waitMs);
  try {
    const snap = await ref.get();
    if (snap.exists && snap.data()?.token !== token) {
      reminderLib.logJobSummary("widgetFanout", startedAt, { reason: "coalesced", urgent, waitedMs: waitMs });
      return;
    }
  } catch (error) {
    // Lecture impossible : on envoie (au pire un envoi de plus).
    console.warn("widgetFanout: coalesce marker unreadable", { code: error?.code ?? "unknown" });
  }
  return sendOnce(db, childId, { urgent, config });
}

/**
 * Rattrapage iPhone d'un envoi urgent (début ou fin de session, pause,
 * reprise, changement de côté de la tétée). Un iPhone écarté par le plafond
 * d'Apple (un envoi toutes les 2 min au plus) n'est plus abandonné : il reçoit
 * l'état le plus récent dès la fin de l'écart. Retard maximal entre appareils :
 * 2 min, au lieu d'un envoi perdu jusqu'à la saisie suivante. Android est déjà
 * servi : seuls les iPhone sont visés.
 */
async function iosCatchUp(db, childId, config, result) {
  const retryAt = result?.iosRetryAtMs;
  if (typeof retryAt !== "number") return result;
  const waitMs = retryAt - Date.now() + 500;
  // Au-delà de l'écart urgent (+ marge), ce n'est pas un plafond urgent.
  if (waitMs > IOS_MIN_GAP_URGENT_MS + 5000) return result;
  // Un seul rattrapage par fin d'écart : plusieurs urgents écartés pendant le
  // même écart (pauses, changements de côté) visent la même heure. Sans
  // réservation, chacun dormait puis envoyait (plafond d'Apple dépassé,
  // instances occupées pour rien). Le rattrapage retenu lit l'état au réveil :
  // il porte aussi les changements des suivants.
  if (!(await claimIosCatchUp(db, childId, retryAt))) {
    reminderLib.logJobSummary("widgetFanout", Date.now(), { reason: "ios-catchup-claimed", urgent: true, iosOnly: true });
    return { ...result, iosCatchUp: "claimed-elsewhere" };
  }
  await catchUpSleep(Math.max(0, waitMs));
  return fanOutWidget(db, childId, { urgent: true, config, iosOnly: true });
}
let catchUpSleep = sleep;

/** Réserve le rattrapage de cette fin d'écart ; faux s'il l'est déjà. */
async function claimIosCatchUp(db, childId, retryAt) {
  const ref = db.doc(`widget_fanout/${childId}`);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.iosCatchUpFor === retryAt) return false;
      tx.set(
        ref,
        { iosCatchUpFor: retryAt, expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 24 * HOUR) },
        { merge: true },
      );
      return true;
    });
  } catch (error) {
    // Réservation impossible : on rattrape quand même (au pire un envoi de plus).
    console.warn("widgetFanout: iOS catch-up claim failed", { code: error?.code ?? "unknown" });
    return true;
  }
}

/**
 * Envoi du gagnant : les déclenchements qu'il a rendus caducs comptent sur
 * lui (pas de nouvel essai de la plateforme, retry: false). Une erreur
 * passagère est donc réessayée une fois, 1 s plus tard.
 */
async function sendOnce(db, childId, opts) {
  try {
    return await fanOutWidget(db, childId, opts);
  } catch (error) {
    console.warn("widgetFanout: send failed, retrying once", { code: error?.code ?? "unknown" });
    await sleep(1000);
    return fanOutWidget(db, childId, opts);
  }
}

// 180 s : le rattrapage iPhone d'un envoi urgent peut attendre jusqu'à 2 min.
const TRIGGER_OPTIONS = { region: "europe-west1", memory: "256MiB", timeoutSeconds: 180, retry: false };

const onWidgetEventWrite = onDocumentWritten({ ...TRIGGER_OPTIONS, document: "events/{eventId}" }, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const change = eventChange(before, after, Date.now());
  if (!change) return;
  await coalescedFanOut(admin.firestore(), change.childId, { urgent: change.urgent });
});

const onWidgetLiveWrite = onDocumentWritten(
  { ...TRIGGER_OPTIONS, document: "children/{childId}/live/{sessionId}" },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    // Urgence propre à la tétée : seul document de live/ aujourd'hui. Un autre
    // type de session partagée reste urgent par défaut.
    const change = event.params.sessionId === "nursing" ? liveChange(before, after, Date.now()) : { urgent: true };
    await coalescedFanOut(admin.firestore(), event.params.childId, change);
  },
);

module.exports = {
  onWidgetEventWrite,
  onWidgetLiveWrite,
  // Tests
  eventChange,
  liveChange,
  coalescedFanOut,
  sendOnce,
  _setCoalesceMsForTests: (ms) => {
    coalesceMs = ms;
  },
  _setCatchUpSleepForTests: (fn) => {
    catchUpSleep = fn || sleep;
  },
  splitEvents,
  propsForDevice,
  widgetMessageData,
  fanOutWidget,
};
