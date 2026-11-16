// Effacement à distance du widget « Bébé maintenant ».
// Un membre retiré d'un foyer, un consentement santé retiré ou un compte
// supprimé : le widget de ses appareils ne doit plus montrer le prénom ni les
// données du bébé. Le serveur envoie un message « w0 » (données vides) aux
// appareils qui affichent cet enfant, puis efface l'enfant de leur jeton.
// - Android : le récepteur natif (modules/widget-push) vide le widget.
// - iPhone : notification silencieuse traitée par services/widgetPushIos.ts,
//   livraison au mieux (le widget expire de lui-même après 24 h).
// Seuls les appareils qui comprennent « w0 » le reçoivent (widgetCap >= 2) :
// une version plus ancienne pourrait le prendre pour une notification.
// Interrupteur d'urgence : app_config/widgetPush.wipe === false.
const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const widget = require("../../shared/widget");
const reminderLib = require("../../lib/reminders");
const { hasValidHealthConsent } = require("../shared/consent");
const { getExpoClient, getExpoModule } = require("../shared/runtime");

const WIPE_CAP = 2;
const MESSAGE_TTL_S = 24 * 3600;

/** Appareil capable d'effacer son widget. */
function canWipe(t) {
  return (
    t.widgetPush === true &&
    Number(t.widgetCap) >= WIPE_CAP &&
    (t.platform === "android" || t.platform === "ios") &&
    getExpoModule().Expo.isExpoPushToken(t.token)
  );
}

/** Message « w0 » : enfant à effacer et données vides à écrire à la place. */
function wipeMessageData(childId, nowMs) {
  return { t: "w0", c: childId, s: nowMs, p: widget.toNativeWidgetProps({ ...widget.EMPTY_NOW_WIDGET, generatedAtMs: nowMs }) };
}

/**
 * Efface le widget des appareils de `uid` qui affichent `childId` (ou tout
 * enfant si `childId` est null). Ne lève jamais : un échec est journalisé.
 * @returns { devices, sent, failed, skippedOldCap, ok } — ok faux si l'envoi
 *   a échoué (l'appelant peut garder les jetons pour réessayer).
 */
async function wipeWidgetForUser(db, uid, childId, { nowMs = Date.now() } = {}) {
  const stats = { devices: 0, sent: 0, failed: 0, errors: 0, skippedOldCap: 0 };
  const result = () => ({ ...stats, ok: stats.failed === 0 && stats.errors === 0 });
  const startedAt = Date.now();
  try {
    const config = (await db.doc("app_config/widgetPush").get()).data() || {};
    if (config.wipe === false) {
      reminderLib.logJobSummary("widgetWipe", startedAt, { reason: "disabled", ...stats });
      return result();
    }
    let q = db.collection("device_tokens").where("userId", "==", uid);
    if (childId) q = q.where("widgetChildId", "==", childId);
    const snap = await q.get();
    const shown = snap.docs.filter((d) => d.data().widgetChildId);
    const targets = shown.filter((d) => canWipe(d.data()));
    // Anciennes versions (cap < 2) : pas de « w0 » possible, seule
    // l'expiration à 24 h les protège. Compté, et journalisé en warn.
    stats.skippedOldCap = shown.length - targets.length;
    const messages = targets.map((d) => {
      const t = d.data();
      const data = wipeMessageData(t.widgetChildId, nowMs);
      return t.platform === "ios"
        ? { to: t.token, data, _contentAvailable: true, priority: "normal", ttl: MESSAGE_TTL_S }
        : { to: t.token, data, priority: "high", ttl: MESSAGE_TTL_S };
    });
    stats.devices = messages.length;
    if (messages.length > 0) {
      const { delivered, failed } = await reminderLib.sendPushWithTickets(getExpoClient(), messages);
      stats.sent = delivered;
      stats.failed = failed;
    }
    // L'appareil ne reçoit plus rien pour cet enfant, même ancien (cap < 2).
    const updateErrors = [];
    await Promise.all(
      shown.map((d) =>
        d.ref.update({ widgetChildId: admin.firestore.FieldValue.delete() }).catch((e) => {
          stats.errors += 1;
          updateErrors.push(e?.code ?? "unknown");
        }),
      ),
    );
    reminderLib.logJobSummary("widgetWipe", startedAt, {
      reason: stats.failed > 0 && stats.sent === 0 ? "failed" : "sent",
      ...stats,
      ...(updateErrors.length ? { updateErrors } : {}),
    });
    return result();
  } catch (error) {
    stats.errors += 1;
    reminderLib.logJobSummary("widgetWipe", startedAt, {
      reason: "failed",
      error: reminderLib.maskPushTokens(error?.message ?? String(error)),
      ...stats,
    });
    return result();
  }
}

const TRIGGER_OPTIONS = { region: "europe-west1", memory: "256MiB", timeoutSeconds: 60, retry: false };

/** Membre retiré du foyer : son widget n'affiche plus ce bébé. */
const onWidgetAccessRemoved = onDocumentWritten(
  { ...TRIGGER_OPTIONS, document: "children/{childId}/access/{uid}" },
  async (event) => {
    // Suppression seulement (accès retiré) ; création et changement de rôle : rien.
    if (!event.data?.before?.exists || event.data?.after?.exists) return;
    await wipeWidgetForUser(admin.firestore(), event.params.uid, event.params.childId);
  },
);

/** Consentement santé retiré : plus aucun bébé sur le widget de ses appareils. */
const onWidgetConsentChanged = onDocumentWritten(
  { ...TRIGGER_OPTIONS, document: "user_preferences/{uid}" },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (before && hasValidHealthConsent(before) && !(after && hasValidHealthConsent(after))) {
      await wipeWidgetForUser(admin.firestore(), event.params.uid, null);
    }
  },
);

module.exports = {
  onWidgetAccessRemoved,
  onWidgetConsentChanged,
  wipeWidgetForUser,
  wipeMessageData,
  WIPE_CAP,
};
