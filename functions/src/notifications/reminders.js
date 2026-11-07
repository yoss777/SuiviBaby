const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const reminderLib = require("../../lib/reminders");
const { hasValidHealthConsent } = require("../deletion/consent");
const { JOB_USER_CONCURRENCY, usersWithPendingDeletion } = require("./eligibility");
const { logExpireAt } = require("../shared/logging");
const { getExpoClient, getExpoModule } = require("../shared/runtime");

/** Mapping catégorie de rappel → types d'événements Firestore (lib/reminders.js). */
const { REMINDER_CATEGORIES } = reminderLib;

const CATEGORY_LABELS = {
  repas: "repas",
  pompages: "pompage",
  changes: "change",
  vitamines: "vitamine",
};

/**
 * checkAndSendReminders — Vérification périodique (toutes les 30 min)
 * Pour chaque utilisateur ayant des rappels activés :
 *   - Lit le dernier événement par catégorie dans children/{id}.lastEventAt
 *     (requête sur events seulement si le champ manque : migration)
 *   - Si elapsed > threshold, envoie une notification push
 *   - Anti-spam : pas de re-notification si déjà envoyée il y a < 2h
 *   - Un ticket DeviceNotRegistered supprime le jeton ; un ticket en erreur
 *     n'écrit pas d'historique (nouvel essai au passage suivant)
 * Les utilisateurs sont traités par lots de JOB_USER_CONCURRENCY.
 */
const checkAndSendReminders = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const startedAt = Date.now();
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();

    // 1. Récupérer tous les utilisateurs avec rappels activés
    const prefsSnapshot = await db
      .collection("user_preferences")
      .where("notifications.reminders.enabled", "==", true)
      .get();

    if (prefsSnapshot.empty) {
      console.log("checkAndSendReminders: no users with reminders enabled");
      reminderLib.logJobSummary("checkAndSendReminders", startedAt, {
        users: 0, sent: 0, skipped: 0, errors: 0, deadTokens: 0, fallbackReads: 0,
      });
      return;
    }

    const stats = { sent: 0, skipped: 0, errors: 0, deadTokens: 0, fallbackReads: 0 };

    // No consent, no processing; accounts being deleted get nothing either.
    const consented = prefsSnapshot.docs.filter((d) => hasValidHealthConsent(d.data()));
    const leaving = await usersWithPendingDeletion(db, consented.map((d) => d.id));

    const processUser = async (prefDoc) => {
      const userId = prefDoc.id;
      if (leaving.has(userId)) return;
      const prefs = prefDoc.data();
      const thresholds = prefs.notifications?.reminders?.thresholds || {};

      // Skip si les notifications push sont désactivées par l'utilisateur
      if (prefs.notifications?.push === false) return;

      // 2. Récupérer les device_tokens actifs de cet utilisateur
      const tokensSnap = await db
        .collection("device_tokens")
        .where("userId", "==", userId)
        .where("enabled", "==", true)
        .get();

      if (tokensSnap.empty) return;

      let tokenDocs = tokensSnap.docs
        .map((d) => ({ ref: d.ref, token: d.data().token }))
        .filter((t) => getExpoModule().Expo.isExpoPushToken(t.token));

      if (tokenDocs.length === 0) return;

      // 3. Récupérer les enfants auxquels l'utilisateur a accès
      const accessSnap = await db
        .collection("user_child_access")
        .where("userId", "==", userId)
        .get();

      for (const accessDoc of accessSnap.docs) {
        const { childId } = accessDoc.data();
        if (!childId) continue;

        // L'index user_child_access peut survivre à une révocation : le document
        // d'accès (source de vérité) doit exister, comme pour le récap. L'audience
        // ne change pas : tout rôle ayant un accès reçoit les rappels.
        const roleSnap = await db.doc(`children/${childId}/access/${userId}`).get();
        if (!roleSnap.exists) {
          stats.skipped++;
          continue;
        }

        // Récupérer le nom de l'enfant (et lastEventAt) : une seule lecture
        const childDoc = await db.doc(`children/${childId}`).get();
        if (!childDoc.exists) continue;
        const childData = childDoc.data();
        const childName = childData.name || "Bébé";

        // 4. Pour chaque catégorie avec threshold > 0
        for (const category of Object.keys(REMINDER_CATEGORIES)) {
          if (tokenDocs.length === 0) return; // every token of the user turned out dead
          const thresholdHours = thresholds[category] || 0;
          if (thresholdHours <= 0) continue;

          const thresholdMs = thresholdHours * 3600 * 1000;

          // Dernier événement de cette catégorie pour cet enfant
          const lastEventDate = await reminderLib.getLastEventMillis(db, childId, childData, category, stats);
          if (lastEventDate === null) continue;
          const elapsedMs = nowMs - lastEventDate;

          if (elapsedMs <= thresholdMs) continue;

          // Anti-spam : vérifier si déjà notifié il y a < 2h
          const twoHoursAgo = admin.firestore.Timestamp.fromMillis(nowMs - 2 * 3600 * 1000);
          const recentNotifSnap = await db
            .collection("notification_history")
            .where("userId", "==", userId)
            .where("childId", "==", childId)
            .where("category", "==", category)
            .where("sentAt", ">", twoHoursAgo)
            .limit(1)
            .get();

          if (!recentNotifSnap.empty) {
            stats.skipped++;
            continue;
          }

          // 5. Envoyer la notification push
          const elapsedHours = Math.round(elapsedMs / 3600000);
          const label = CATEGORY_LABELS[category];
          const messages = tokenDocs.map(({ token }) => ({
            to: token,
            sound: "default",
            title: `Rappel ${label} — ${childName}`,
            body: `Plus de ${elapsedHours}h depuis le dernier ${label}`,
            data: {
              type: "reminder",
              category,
              childId,
              route: "/baby/home",
            },
          }));

          try {
            const { delivered, dead, chunkErrors } = await reminderLib.sendPushWithTickets(getExpoClient(), messages);
            // Lot partiel : les lots livrés comptent (historique ci-dessous), l'échec est signalé.
            if (chunkErrors > 0) stats.errors++;

            // Jeton mort (appli désinstallée) : on le supprime pour ne plus l'appeler.
            if (dead.size > 0) {
              stats.deadTokens += await reminderLib.removeDeadTokens(tokenDocs, dead);
              tokenDocs = tokenDocs.filter((t) => !dead.has(t.token));
            }

            // Aucun appareil joint : pas d'historique, nouvel essai au prochain passage.
            if (delivered === 0) continue;

            // Enregistrer dans l'historique
            await db.collection("notification_history").add({
              userId,
              childId,
              category,
              sentAt: now,
              thresholdHours,
              elapsedHours,
              expireAt: logExpireAt(),
            });

            stats.sent++;
          } catch (error) {
            stats.errors++;
            console.error(
              `checkAndSendReminders: error sending to ${userId}/${childId}/${category}:`,
              error.message
            );
          }
        }
      }
    };

    await reminderLib.mapInChunks(consented, JOB_USER_CONCURRENCY, async (prefDoc) => {
      try {
        await processUser(prefDoc);
      } catch (error) {
        stats.errors++;
        console.error(`checkAndSendReminders: user ${prefDoc.id} failed:`, error?.message ?? error);
      }
    });

    console.log(
      `checkAndSendReminders: sent=${stats.sent}, skipped=${stats.skipped}, users=${prefsSnapshot.size}`
    );
    reminderLib.logJobSummary("checkAndSendReminders", startedAt, { users: prefsSnapshot.size, ...stats });
  }
);

module.exports = {
  checkAndSendReminders,
};
