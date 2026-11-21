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
 * Écriture de la tétée partagée (children/{c}/live/nursing) : tout changement
 * visible est urgent (début, fin, pause, reprise, changement de côté ;
 * décision du 18/11). Le débit est limité par enfant dans coalescedFanOut (R14).
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
 * urgent : priorité haute Android et écart iPhone de 2 min ; capped (mode
 * plafonné, R14) : priorité normale Android, l'iPhone garde l'écart urgent ;
 * logExtra : champs ajoutés au journal (déclenchement, origine), sans
 * pouvoir écraser reason ni urgent. Exporté pour les tests.
 */
async function fanOutWidget(db, childId, { urgent, capped = false, logExtra = {}, config: preloadedConfig, iosOnly = false }) {
  const startedAt = Date.now();
  const stats = { recipients: 0, devices: 0, sent: 0, failed: 0, skipped: 0, deadTokens: 0, errors: 0 };
  // Renvoie aussi l'heure à laquelle un iPhone écarté par le plafond pourra
  // recevoir (rattrapage d'un envoi urgent, coalescedFanOut).
  let iosRetryAtMs = null;
  const log = (reason) => {
    reminderLib.logJobSummary("widgetFanout", startedAt, { ...logExtra, reason, urgent, ...(iosOnly ? { iosOnly } : {}), ...stats });
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
          // Le plus TARD des iPhone écartés : au rattrapage, tous sont libres
          // (avec le plus tôt, le second iPhone d'un foyer restait plafonné et
          // n'était jamais rattrapé). Borné par l'écart (2 min au plus).
          iosRetryAtMs = Math.max(iosRetryAtMs ?? 0, iosLast + gap);
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
            : { to: t.token, data, priority: urgent && !capped ? "high" : "normal", ttl: MESSAGE_TTL_S },
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
 * 2 s, et n'envoie que s'il est toujours le dernier. Un envoi urgent (début
 * ou fin de sommeil ou de promenade, tout changement visible d'une tétée)
 * suit le débit limité de R14 (ci-dessous) et rend caducs les envois en
 * attente : il lit l'état le plus récent. Collection réservée au serveur
 * (règle par défaut : aucun accès client), jeton, heure et compteurs.
 */
const COALESCE_MS = 2000;
let coalesceMs = COALESCE_MS;

/**
 * Débit des envois urgents par enfant (R14). Tout changement visible d'une
 * tétée part en urgent (décision du 18/11) : sans limite, des changements de
 * côté rapides ou un téléphone qui écrit en boucle déclenchaient autant
 * d'envois que d'écritures (coût, notifications en rafale sur Android).
 * - Écart minimal entre deux envois urgents : un urgent qui arrive plus tôt
 *   n'est pas perdu, il part en urgent à la fin de l'écart avec l'état le plus
 *   récent (un seul pour toute la rafale).
 * - Urgence héritée : un urgent en attente pose urgentPending sur le marqueur.
 *   Si un déclenchement non urgent prend la main entre-temps (l'enregistrement
 *   de la tétée dans l'historique, par exemple), c'est lui qui envoie, en
 *   urgent. Sans cela, la fin d'une tétée partait en priorité normale et un
 *   iPhone pouvait l'afficher « en cours » jusqu'à 20 min (revue ECC).
 * - Plafond par fenêtre d'une heure (ouverte au premier urgent) : au-delà,
 *   regroupé et en priorité normale sur Android ; l'iPhone garde l'écart
 *   urgent et son rattrapage.
 * Réglables sans redéploiement (app_config/widgetPush.urgentGapMs,
 * urgentPerHour) ; 0 coupe la limite correspondante.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const URGENT_GAP_MS = 5000;
// 15 s au plus : avec le regroupement (10 s au plus), l'envoi et son nouvel
// essai, puis le rattrapage iPhone (jusqu'à 2 min), le déclenchement reste
// sous son délai de 180 s (pire cas ≈ 156 s, revue ECC du 21/11).
const URGENT_GAP_MAX_MS = 15_000;
const URGENT_PER_HOUR = 60;
// L'attente se fait par tranches : un urgent remplacé par un autre s'arrête tôt.
const WAIT_SLICE_MS = 1000;
let urgentGapMs = URGENT_GAP_MS;
let waitSliceMs = WAIT_SLICE_MS;

/** Réglage numérique de app_config/widgetPush ; une valeur invalide ou trop grande est signalée. */
function configNumber(config, key, fallback, max) {
  const value = config[key];
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    if (value > max) console.warn("widgetFanout: config value capped", { key, max });
    return Math.min(value, max);
  }
  console.warn("widgetFanout: invalid config value, default used", { key });
  return fallback;
}

/**
 * Un urgent en attente plus vieux que cela n'est plus « en attente » : son
 * déclenchement a disparu (délai, erreur). Le drapeau est alors ignoré, pour
 * qu'une saisie normale ne parte pas en urgent à tort.
 */
// 3 min : couvre une suite de saisies rapprochées qui se passent la main
// (chacune dans la fenêtre de regroupement) sans rafraîchir le drapeau.
const URGENT_PENDING_STALE_MS = 3 * 60_000;
// Nouvelles réservations après attente : au-delà, envoi en mode plafonné.
const MAX_RECLAIMS = 2;
// Le rattrapage iPhone est sauté s'il finirait trop près du délai de 180 s.
const CATCHUP_DEADLINE_MS = 160_000;

/**
 * Réserve un créneau urgent pour cet enfant (transaction : deux déclenchements
 * simultanés ne partent pas tous les deux). Première réservation : pose le
 * jeton du déclenchement (tokenUrgent : vrai). Renvoie :
 * - { action: "send" } : créneau pris (urgentPending remis à faux) ;
 * - { action: "wait", waitMs } : écart pas écoulé (urgentPending posé, pour
 *   qu'un déclenchement qui prendrait la main hérite de l'urgence) ;
 * - { action: "downgrade" } : plafond de la fenêtre d'une heure atteint
 *   (urgentPending posé aussi : celui qui garde la main envoie en mode plafonné,
 *   qui protège l'iPhone) ;
 * - { action: "superseded" } : nouvelle réservation (reclaim) alors qu'un autre
 *   déclenchement a pris la main ; rien n'est écrit.
 * reclaim : après une attente, ne réécrit pas le jeton ; s'il faut encore
 * attendre, rien n'est écrit (on garde le jeton déjà posé).
 */
async function claimUrgentSlot(db, ref, token, { gapMs, perHour, nowMs, reclaim = false, trig = null }) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    if (reclaim && data.token !== token) return { action: "superseded", byUrgent: data.tokenUrgent === true };
    // Une heure dans le futur (horloge décalée, donnée abîmée) est ignorée :
    // sinon chaque réservation redonnait un écart entier, en boucle.
    const lastUrgentAt = typeof data.lastUrgentAt === "number" && data.lastUrgentAt <= nowMs ? data.lastUrgentAt : 0;
    const sameHour = typeof data.urgentHourStart === "number" && nowMs - data.urgentHourStart < HOUR;
    const hourStart = sameHour ? data.urgentHourStart : nowMs;
    const hourCount = sameHour && typeof data.urgentHourCount === "number" ? data.urgentHourCount : 0;
    const base = {
      token,
      tokenUrgent: true,
      at: nowMs,
      expireAt: admin.firestore.Timestamp.fromMillis(nowMs + 24 * HOUR),
    };
    // urgentTrig : le déclenchement qui attend, pour relier son héritier au bilan.
    const pending = { urgentPending: true, urgentPendingAt: nowMs, ...(trig ? { urgentTrig: trig } : {}) };
    if (perHour > 0 && hourCount >= perHour) {
      tx.set(ref, { ...base, ...pending }, { merge: true });
      return { action: "downgrade" };
    }
    // Borné à l'écart : une heure enregistrée dans le futur (horloge décalée,
    // donnée abîmée) ne fait pas dormir jusqu'au délai de la fonction.
    const waitMs = gapMs > 0 ? lastUrgentAt + gapMs - nowMs : 0;
    if (waitMs > 0) {
      if (!reclaim) tx.set(ref, { ...base, ...pending }, { merge: true });
      return { action: "wait", waitMs };
    }
    tx.set(
      ref,
      { ...base, urgentPending: false, lastUrgentAt: nowMs, urgentHourStart: hourStart, urgentHourCount: hourCount + 1 },
      { merge: true },
    );
    return { action: "send" };
  });
}

/** Remet urgentPending à faux si ce déclenchement a toujours la main (au mieux). */
async function clearUrgentPendingIfMine(db, ref, token) {
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.token === token) tx.set(ref, { urgentPending: false }, { merge: true });
    });
  } catch (error) {
    console.warn("widgetFanout: urgent pending reset failed", { code: error?.code ?? "unknown" });
  }
}

/**
 * Envoi final en échec après la prise du créneau : remet urgentPending si ce
 * déclenchement a toujours la main, pour qu'une saisie suivante reprenne
 * l'envoi urgent au lieu de le perdre (au mieux).
 */
async function restoreUrgentPendingIfMine(db, ref, token, trig) {
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.token === token) {
        tx.set(ref, { urgentPending: true, urgentPendingAt: Date.now(), ...(trig ? { urgentTrig: trig } : {}) }, { merge: true });
      }
    });
  } catch (error) {
    console.warn("widgetFanout: urgent pending restore failed", { trig, code: error?.code ?? "unknown" });
  }
}

/**
 * Attend la fin de l'écart par tranches. Renvoie { turn, readFailures } avec
 * turn : "mine" (toujours le dernier déclenchement), "urgent-superseded" (un
 * urgent plus récent a pris la main : il enverra) ou "handed-over" (un
 * déclenchement non urgent a pris la main : il héritera de l'urgence).
 */
async function waitForUrgentTurn(ref, token, deadlineMs) {
  let readFailures = 0;
  for (;;) {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) return { turn: "mine", readFailures };
    await sleep(Math.min(remaining, waitSliceMs));
    let data = null;
    try {
      const snap = await ref.get();
      data = snap.exists ? snap.data() : null;
    } catch (error) {
      // Lecture impossible : on continue d'attendre ; la nouvelle réservation
      // revérifie qui a la main.
      readFailures += 1;
      if (readFailures === 1) console.warn("widgetFanout: urgent wait read failed", { code: error?.code ?? "unknown" });
      continue;
    }
    if (data && data.token !== token) {
      return { turn: data.tokenUrgent === true ? "urgent-superseded" : "handed-over", readFailures };
    }
  }
}

/**
 * Envoi urgent limité : réserve un créneau, attend si besoin, envoie et
 * rattrape les iPhone. Renvoie { capped: true } si le plafond est atteint
 * (l'appelant regroupe et envoie en mode plafonné). logExtra porte le
 * déclenchement (trig) et l'origine (urgentRequested ou inheritedUrgent).
 */
async function sendUrgent(db, childId, ref, token, config, startedAt, logExtra) {
  const gapMs = configNumber(config, "urgentGapMs", urgentGapMs, URGENT_GAP_MAX_MS);
  const perHour = configNumber(config, "urgentPerHour", URGENT_PER_HOUR, 10_000);
  const coalesced = (extra) =>
    reminderLib.logJobSummary("widgetFanout", startedAt, { ...logExtra, reason: "coalesced", urgent: true, rateLimited: true, ...extra });
  const trig = logExtra?.trig ?? null;
  let slot;
  try {
    slot = await claimUrgentSlot(db, ref, token, { gapMs, perHour, nowMs: Date.now(), trig });
  } catch (error) {
    // Réservation impossible : on envoie quand même, en mode plafonné (pas
    // compté, donc pas de priorité haute Android ; l'iPhone garde l'écart
    // urgent et son rattrapage), signalé.
    console.warn("widgetFanout: urgent slot failed", { trig, phase: "claim", code: error?.code ?? "unknown" });
    return sendCapped(db, childId, config, { ...logExtra, urgentSlot: "failopen" }, startedAt);
  }
  let waitedMs = 0;
  let readFailures = 0;
  let reclaims = 0;
  while (slot.action === "wait") {
    // Ne devrait pas se répéter (seul un envoi déplace l'écart, et il reprend
    // le jeton) : par sûreté, borné, puis mode plafonné.
    if (reclaims >= MAX_RECLAIMS) {
      console.warn("widgetFanout: urgent slot still waiting", { trig, reclaims });
      await clearUrgentPendingIfMine(db, ref, token);
      return sendCapped(db, childId, config, { ...logExtra, urgentSlot: "failopen", waitedMs }, startedAt);
    }
    waitedMs += slot.waitMs;
    const waited = await waitForUrgentTurn(ref, token, Date.now() + slot.waitMs);
    readFailures += waited.readFailures;
    const failures = readFailures > 0 ? { waitReadFailures: readFailures } : {};
    if (waited.turn !== "mine") {
      coalesced({ waitedMs, supersededBy: waited.turn === "urgent-superseded" ? "urgent" : "normal", ...failures });
      return null;
    }
    reclaims += 1;
    try {
      slot = await claimUrgentSlot(db, ref, token, { gapMs, perHour, nowMs: Date.now(), reclaim: true, trig });
    } catch (error) {
      console.warn("widgetFanout: urgent slot failed", { trig, phase: "reclaim", code: error?.code ?? "unknown" });
      await clearUrgentPendingIfMine(db, ref, token);
      return sendCapped(db, childId, config, { ...logExtra, urgentSlot: "failopen", waitedMs, ...failures }, startedAt);
    }
    if (slot.action === "superseded") {
      coalesced({ waitedMs, supersededBy: slot.byUrgent ? "urgent" : "normal", ...failures });
      return null;
    }
    // "wait" encore (un autre urgent est parti entre-temps sans reprendre le
    // jeton) : on attend la nouvelle fin d'écart, jeton conservé.
  }
  if (slot.action === "downgrade") return { capped: true };
  let result;
  try {
    result = await sendOnce(db, childId, {
      urgent: true,
      config,
      logExtra: {
        ...logExtra,
        urgentSlot: waitedMs > 0 ? "deferred" : "send",
        ...(waitedMs > 0 ? { waitedMs } : {}),
        ...(readFailures > 0 ? { waitReadFailures: readFailures } : {}),
      },
    });
  } catch (error) {
    // Créneau pris mais envoi en échec : une saisie suivante reprendra l'urgent.
    await restoreUrgentPendingIfMine(db, ref, token, trig);
    throw error;
  }
  return iosCatchUp(db, childId, config, result, logExtra, startedAt);
}

/** Mode plafonné : priorité normale sur Android, écart urgent et rattrapage sur iPhone. */
async function sendCapped(db, childId, config, logExtra, startedAt = Date.now()) {
  const extra = { ...logExtra, urgentCapped: true };
  const result = await sendOnce(db, childId, { urgent: true, capped: true, config, logExtra: extra });
  return iosCatchUp(db, childId, config, result, extra, startedAt);
}

/**
 * Point d'entrée des déclencheurs. Une erreur non rattrapée (envoi en échec
 * après son nouvel essai, par exemple) laisse une ligne « error » portant le
 * déclenchement : le bilan voit qu'il n'a rien envoyé.
 */
async function coalescedFanOut(db, childId, change) {
  const ctx = { trig: null, urgentRequested: change?.urgent === true };
  try {
    return await coalescedFanOutInner(db, childId, change, ctx);
  } catch (error) {
    reminderLib.logJobSummary("widgetFanout", Date.now(), {
      ...(ctx.trig ? { trig: ctx.trig } : {}),
      ...(ctx.urgentRequested ? { urgentRequested: true } : {}),
      reason: "failed",
      urgent: ctx.urgentRequested,
      errorCode: error?.code ?? "unknown",
    });
    throw error;
  }
}

async function coalescedFanOutInner(db, childId, change, ctx) {
  const urgentRequested = change.urgent === true;
  const startedAt = Date.now();
  // Interrupteur lu d'abord : widget désactivé, ni marqueur ni attente.
  const config = (await db.doc("app_config/widgetPush").get()).data() || {};
  if (config.enabled !== true) {
    reminderLib.logJobSummary("widgetFanout", startedAt, { reason: "disabled", urgent: urgentRequested });
    return;
  }
  // Réglable sans redéploiement (app_config/widgetPush.coalesceMs) ; 0 coupe
  // le regroupement (et, comme interrupteur d'urgence, la limite des urgents).
  // Seulement un vrai nombre : null, "" ou false ne coupent pas le regroupement.
  const configured = config.coalesceMs;
  const waitMs =
    typeof configured === "number" && Number.isFinite(configured) && configured >= 0
      ? Math.min(configured, 10_000)
      : coalesceMs;
  if (waitMs === 0) return fanOutWidget(db, childId, { urgent: urgentRequested, config });
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
      reminderLib.logJobSummary("widgetFanout", startedAt, { reason: "no-device", urgent: urgentRequested, precheck: true });
      return;
    }
  } catch (error) {
    // Lecture impossible : on continue (au pire, un marqueur pour rien).
    console.warn("widgetFanout: pre-check failed", { code: error?.code ?? "unknown" });
  }
  const ref = db.doc(`widget_fanout/${childId}`);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  // Identifiant court du déclenchement (aléatoire, sans donnée personnelle) :
  // relie ses lignes de journal pour le bilan (aucun urgent perdu).
  const trig = token.slice(-8);
  ctx.trig = trig;
  const origin = urgentRequested ? { trig, urgentRequested: true } : { trig };
  let capped = false;
  if (urgentRequested) {
    // Une seule écriture : la réservation pose le jeton.
    const outcome = await sendUrgent(db, childId, ref, token, config, startedAt, origin);
    if (!outcome?.capped) return outcome;
    capped = true;
    reminderLib.logJobSummary("widgetFanout", startedAt, { ...origin, reason: "urgent-capped", urgent: true });
  } else {
    try {
      // expireAt : politique TTL Firestore sur widget_fanout (marqueur jamais
      // orphelin, même posé par un déclenchement tardif après la suppression de
      // l'enfant). merge : urgentPending, compteurs et réservation du
      // rattrapage iPhone (iosCatchUpFor) survivent aux déclenchements.
      await ref.set(
        { token, tokenUrgent: false, at: Date.now(), expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 24 * HOUR) },
        { merge: true },
      );
    } catch (error) {
      // Marqueur incertain (refusé, ou écrit malgré une erreur) : un urgent en
      // attente a peut-être passé la main. La réservation tranche (au pire un
      // urgent de plus) plutôt que d'envoyer en priorité normale.
      console.warn("widgetFanout: coalesce marker failed", { trig, code: error?.code ?? "unknown" });
      return inheritOrCap(db, childId, ref, token, config, startedAt, { trig, markerUncertain: true });
    }
  }
  await sleep(waitMs);
  let marker = null;
  let markerUnreadable = false;
  try {
    const snap = await ref.get();
    marker = snap.exists ? snap.data() : null;
    if (marker && marker.token !== token) {
      reminderLib.logJobSummary("widgetFanout", startedAt, {
        ...origin,
        reason: "coalesced",
        urgent: capped,
        waitedMs: waitMs,
        supersededBy: marker.tokenUrgent === true ? "urgent" : "normal",
      });
      return;
    }
  } catch (error) {
    console.warn("widgetFanout: coalesce marker unreadable", { trig, code: error?.code ?? "unknown" });
    markerUnreadable = true;
  }
  if (capped) {
    await clearUrgentPendingIfMine(db, ref, token);
    return sendCapped(db, childId, config, origin, startedAt);
  }
  // Un urgent attendait (ou on ne peut pas le savoir) et ce déclenchement a
  // la main : il hérite de l'urgence, avec la même limite (écart, plafond).
  const pendingAge = Date.now() - (typeof marker?.urgentPendingAt === "number" ? marker.urgentPendingAt : 0);
  if (markerUnreadable) {
    return inheritOrCap(db, childId, ref, token, config, startedAt, { trig, markerUncertain: true });
  }
  if (marker?.urgentPending === true) {
    if (pendingAge <= URGENT_PENDING_STALE_MS) {
      return inheritOrCap(db, childId, ref, token, config, startedAt, {
        trig,
        inheritedUrgent: true,
        ...(typeof marker.urgentTrig === "string" ? { inheritedFrom: marker.urgentTrig } : {}),
      });
    }
    // Drapeau trop ancien : son déclenchement a disparu ; envoi normal, signalé.
    return sendOnce(db, childId, { urgent: false, config, logExtra: { trig, stalePending: true } });
  }
  return sendOnce(db, childId, { urgent: false, config, logExtra: { trig } });
}

/** Héritage de l'urgence : envoi urgent limité, ou mode plafonné au-delà du plafond. */
async function inheritOrCap(db, childId, ref, token, config, startedAt, logExtra) {
  const outcome = await sendUrgent(db, childId, ref, token, config, startedAt, logExtra);
  if (!outcome?.capped) return outcome;
  await clearUrgentPendingIfMine(db, ref, token);
  return sendCapped(db, childId, config, logExtra, startedAt);
}

/**
 * Rattrapage iPhone d'un envoi urgent (début ou fin de session, pause,
 * reprise, changement de côté de la tétée). Un iPhone écarté par le plafond
 * d'Apple (un envoi toutes les 2 min au plus) n'est plus abandonné : il reçoit
 * l'état le plus récent dès la fin de l'écart. Retard maximal entre appareils :
 * 2 min, au lieu d'un envoi perdu jusqu'à la saisie suivante. Android est déjà
 * servi : seuls les iPhone sont visés.
 */
async function iosCatchUp(db, childId, config, result, logExtra = {}, startedAt = Date.now()) {
  const retryAt = result?.iosRetryAtMs;
  if (typeof retryAt !== "number") return result;
  const waitMs = retryAt - Date.now() + 500;
  // Au-delà de l'écart urgent (+ marge), ce n'est pas un plafond urgent.
  if (waitMs > IOS_MIN_GAP_URGENT_MS + 5000) return result;
  // Rattrapage qui finirait trop près du délai de la fonction (180 s) : sauté
  // et signalé (sinon l'instance serait coupée en plein sommeil, sans trace).
  if (Date.now() - startedAt + waitMs > CATCHUP_DEADLINE_MS) {
    reminderLib.logJobSummary("widgetFanout", startedAt, { ...logExtra, reason: "ios-catchup-skipped", urgent: true, iosOnly: true });
    return { ...result, iosCatchUp: "skipped-deadline" };
  }
  // Un seul rattrapage par fin d'écart : plusieurs urgents écartés pendant le
  // même écart (pauses, changements de côté) visent la même heure. Sans
  // réservation, chacun dormait puis envoyait (plafond d'Apple dépassé,
  // instances occupées pour rien). Le rattrapage retenu lit l'état au réveil :
  // il porte aussi les changements des suivants.
  if (!(await claimIosCatchUp(db, childId, retryAt))) {
    reminderLib.logJobSummary("widgetFanout", Date.now(), { ...logExtra, reason: "ios-catchup-claimed", urgent: true, iosOnly: true });
    return { ...result, iosCatchUp: "claimed-elsewhere" };
  }
  await catchUpSleep(Math.max(0, waitMs));
  return fanOutWidget(db, childId, { urgent: true, config, iosOnly: true, logExtra });
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
// Pas de maxInstances : ce plafond serait commun à toutes les familles, et une
// seule qui écrirait en boucle pourrait bloquer les envois des autres (revue
// ECC du 21/11). Le coût des écritures en boucle relève de SUIVI_ACTIONS R23.
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
  _setUrgentGapMsForTests: (ms) => {
    urgentGapMs = ms;
  },
  _iosCatchUpForTests: (...args) => iosCatchUp(...args),
  _clearUrgentPendingIfMineForTests: (...args) => clearUrgentPendingIfMine(...args),
  _setWaitSliceMsForTests: (ms) => {
    waitSliceMs = ms;
  },
  claimUrgentSlot,
  URGENT_GAP_MS,
  URGENT_PER_HOUR,
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
