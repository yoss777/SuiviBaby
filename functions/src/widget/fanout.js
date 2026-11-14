// Widget « Bébé maintenant » en temps réel (plan-temps-reel.md, étape E5).
// À chaque écriture d'un événement du jour ou de la tétée partagée d'un enfant,
// le serveur relit l'état COURANT de l'enfant, calcule les données du widget
// avec le module partagé (functions/shared/widget, le même code que l'app),
// pour chaque appareil du foyer dans son fuseau, puis les envoie en message de
// données (Android). Le récepteur natif (modules/widget-push) les écrit sans
// démarrer l'app.
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
const { hasValidHealthConsent } = require("../shared/consent");
const { subscriptionStateFrom, isEntitledStatus } = require("../billing/subscription");
const { usersWithPendingDeletion } = require("../notifications/eligibility");
const { getExpoClient, getExpoModule } = require("../shared/runtime");

const HOUR = 3600 * 1000;
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

function isPremium(subscriptionSnap, nowMs) {
  const state = subscriptionStateFrom(subscriptionSnap);
  if (state.grandfathered) return true;
  const paid = state.tier === "premium" || state.tier === "family";
  return paid && isEntitledStatus(state, nowMs);
}

/** Événements bruts de l'enfant → sources du module partagé (heures en ms). */
function splitEvents(eventDocs) {
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
          if (Number.isFinite(startMs) && e.heureFin == null && (!out.sleepNow || startMs > out.sleepNow.startMs)) {
            out.sleepNow = { startMs, isNap: typeof e.isNap === "boolean" ? e.isNap : null };
          }
        }
        if (e.type === "activite" && e.typeActivite === "promenade" && Number.isFinite(startMs) && e.heureFin == null) {
          if (!out.walkNow || startMs > out.walkNow.startMs) out.walkNow = { startMs };
        }
        // Champs utiles aux libellés du fil seulement (pas de note, pas d'auteur).
        out.others.push({
          ms,
          type: e.type,
          nomVitamine: e.nomVitamine,
          nomMedicament: e.nomMedicament,
          valeur: e.valeur,
          nomVaccin: e.nomVaccin,
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
function propsForDevice({ childId, childName, split, nursing, lastAbsoluteMealMs, tz, premium, reminders, nowMs }) {
  let env;
  try {
    env = widget.zonedEnv(tz || DEFAULT_TZ);
  } catch {
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
      sleepTotalMinutes: widget.sleepMinutesInDay(split.sleeps, dayStart, dayEnd, nowMs),
      lastAbsoluteMealMs,
      isPremium: premium,
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
async function fanOutWidget(db, childId, { urgent }) {
  const startedAt = Date.now();
  const stats = { recipients: 0, devices: 0, sent: 0, failed: 0, skipped: 0, deadTokens: 0, errors: 0 };
  const log = (reason) =>
    reminderLib.logJobSummary("widgetFanout", startedAt, { reason, urgent, ...stats });

  const config = (await db.doc("app_config/widgetPush").get()).data() || {};
  if (config.enabled !== true) return log("disabled");
  const allowUids = Array.isArray(config.allowUids) ? new Set(config.allowUids) : null;

  const childSnap = await db.doc(`children/${childId}`).get();
  if (!childSnap.exists || childSnap.data()?.deletedAt) return log("no-child");
  const child = childSnap.data();

  const accessSnap = await db.collection(`children/${childId}/access`).get();
  let members = accessSnap.docs.map((d) => d.id).filter((uid) => !allowUids || allowUids.has(uid));
  if (members.length === 0) return log("no-member");
  const leaving = await usersWithPendingDeletion(db, members);
  members = members.filter((uid) => !leaving.has(uid));

  // État courant de l'enfant : l'exécution la plus tardive lit le plus frais
  // (readTime croissant = séquence du message).
  const nowMs = Date.now();
  const since = admin.firestore.Timestamp.fromMillis(nowMs - LOOKBACK_MS);
  const [eventsSnap, liveSnap] = await Promise.all([
    db.collection("events").where("childId", "==", childId).where("date", ">=", since).get(),
    db.doc(`children/${childId}/live/nursing`).get(),
  ]);
  const seq = eventsSnap.readTime && typeof eventsSnap.readTime.toMillis === "function" ? eventsSnap.readTime.toMillis() : nowMs;
  const split = splitEvents(eventsSnap.docs);
  const nursing = widget.usableNursing(liveSnap.exists ? liveSnap.data() : null, nowMs);
  const lastAbsoluteMealMs = await reminderLib.getLastEventMillis(db, childId, child, "repas", null);

  const messages = [];
  const tokenDocs = [];
  for (const uid of members) {
    const prefsSnap = await db.doc(`user_preferences/${uid}`).get();
    const prefs = prefsSnap.exists ? prefsSnap.data() : {};
    if (!hasValidHealthConsent(prefs)) {
      stats.skipped++;
      continue;
    }
    const devicesSnap = await db
      .collection("device_tokens")
      .where("userId", "==", uid)
      .where("widgetChildId", "==", childId)
      .get();
    const devices = devicesSnap.docs.filter((d) => {
      const t = d.data();
      return t.widgetPush === true && Number(t.widgetCap) >= 1 && t.platform === "android" &&
        getExpoModule().Expo.isExpoPushToken(t.token);
    });
    if (devices.length === 0) continue;
    stats.recipients++;

    const premium = isPremium(await db.doc(`subscriptions/${uid}`).get(), nowMs);
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
        tz: t.tz,
        premium,
        reminders,
        nowMs,
      });
      const data = widgetMessageData(childId, seq, props);
      if (!data) {
        stats.errors++;
        console.warn("widgetFanout: message too big even without the day feed", { childId });
        continue;
      }
      stats.devices++;
      tokenDocs.push({ ref: device.ref, token: t.token });
      messages.push({ to: t.token, data, priority: urgent ? "high" : "normal", ttl: MESSAGE_TTL_S });
    }
  }
  if (messages.length === 0) return log("no-device");

  const { delivered, failed, dead, chunkErrors } = await reminderLib.sendPushWithTickets(getExpoClient(), messages);
  stats.sent = delivered;
  stats.failed = failed;
  stats.errors += chunkErrors;
  if (dead.size > 0) stats.deadTokens = await reminderLib.removeDeadTokens(tokenDocs, dead);
  return log(delivered === 0 && failed > 0 ? "failed" : "sent");
}

const TRIGGER_OPTIONS = { region: "europe-west1", memory: "256MiB", timeoutSeconds: 60, retry: false };

const onWidgetEventWrite = onDocumentWritten({ ...TRIGGER_OPTIONS, document: "events/{eventId}" }, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const change = eventChange(before, after, Date.now());
  if (!change) return;
  await fanOutWidget(admin.firestore(), change.childId, { urgent: change.urgent });
});

const onWidgetLiveWrite = onDocumentWritten(
  { ...TRIGGER_OPTIONS, document: "children/{childId}/live/{sessionId}" },
  async (event) => {
    await fanOutWidget(admin.firestore(), event.params.childId, { urgent: true });
  },
);

module.exports = {
  onWidgetEventWrite,
  onWidgetLiveWrite,
  // Tests
  eventChange,
  splitEvents,
  propsForDevice,
  widgetMessageData,
  fanOutWidget,
};
