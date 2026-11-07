const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const reminderLib = require("../../lib/reminders");
const { reconcileAccessIndex } = require("../../lib/accessReconciliation");

// ============================================
// ACCESS INDEX RECONCILIATION (Scheduled, S12.5)
// ============================================

/**
 * reconcileAccessIndexNightly — 03:15 Europe/Paris.
 * children/{id}/access/{uid} fait foi ; user_child_access/{uid}_{childId} en
 * est l'index. Crée les entrées manquantes, supprime les orphelines (voir
 * lib/accessReconciliation.js). Idempotent, par lots bornés.
 */
const reconcileAccessIndexNightly = onSchedule(
  {
    schedule: "15 3 * * *",
    timeZone: "Europe/Paris",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const startedAt = Date.now();
    const stats = await reconcileAccessIndex(admin.firestore());
    reminderLib.logJobSummary("reconcileAccessIndex", startedAt, stats);
  }
);

module.exports = {
  reconcileAccessIndexNightly,
};
