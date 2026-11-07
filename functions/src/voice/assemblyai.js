const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logExpireAt } = require("../shared/logging");

/**
 * Awaited best-effort DELETE on an AssemblyAI transcript.
 * Returns true on success, false on any failure (network, non-2xx, timeout).
 * Bounded by a 3s timeout so it can't keep the parent CF hanging.
 */
async function deleteAssemblyAITranscript(transcriptId, apiKey, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      {
        method: "DELETE",
        headers: { authorization: apiKey },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new Error(`AssemblyAI DELETE returned status ${response.status}`);
    }
    return true;
  } catch (err) {
    console.warn(
      `deleteAssemblyAITranscript: failed for ${transcriptId}:`,
      err?.message ?? err
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queue a failed AssemblyAI delete for the retry scheduler. The doc id mirrors
 * the transcriptId so a duplicate enqueue is a no-op (idempotent on retry).
 *
 * T0.5 — userId attaché pour permettre la purge RGPD au delete user. Avant,
 * un transcriptId orphelin restait indéfiniment sans moyen de tracer son
 * propriétaire. La back-fill des anciens docs sans userId reste à faire en
 * one-shot (laisser tels quels = orphelins, ou supprimer-tous au cleanup mensuel).
 */
async function enqueueAssemblyAIDelete(db, transcriptId, reason, userId) {
  try {
    await db.doc(`pending_assemblyai_deletes/${transcriptId}`).set(
      {
        transcriptId,
        userId: userId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: admin.firestore.FieldValue.increment(0), // create field
        lastError: String(reason || "delete failed"),
      },
      { merge: true }
    );
  } catch (err) {
    console.error(
      `enqueueAssemblyAIDelete: could not queue ${transcriptId}:`,
      err?.message ?? err
    );
  }
}

/**
 * retryAssemblyAIDeletes — drain the pending_assemblyai_deletes queue.
 * Runs hourly. For each queued transcriptId:
 *   - retry DELETE on AssemblyAI
 *   - on success: remove the doc
 *   - on failure: bump attempts; after MAX_DELETE_ATTEMPTS, keep the doc for
 *     manual audit (and log loudly so it shows up in Sentry / Cloud Logs).
 * Bounded batch size to keep one execution under the 540s scheduler cap.
 */
const retryAssemblyAIDeletes = onSchedule(
  {
    schedule: "every 60 minutes",
    region: "europe-west1",
    timeoutSeconds: 540,
    secrets: ["ASSEMBLYAI_API_KEY"],
  },
  async () => {
    const db = admin.firestore();
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      console.error("retryAssemblyAIDeletes: ASSEMBLYAI_API_KEY missing");
      return;
    }

    const MAX_DELETE_ATTEMPTS = 5;
    const BATCH = 50;

    const snapshot = await db
      .collection("pending_assemblyai_deletes")
      .orderBy("lastAttemptAt")
      .limit(BATCH)
      .get();

    if (snapshot.empty) {
      console.log("retryAssemblyAIDeletes: queue empty");
      return;
    }

    let succeeded = 0;
    let stillFailing = 0;
    let abandoned = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() || {};
      const attempts = (data.attempts || 0) + 1;
      const transcriptId = data.transcriptId || docSnap.id;

      const ok = await deleteAssemblyAITranscript(transcriptId, apiKey);
      if (ok) {
        await docSnap.ref.delete();
        succeeded++;
        continue;
      }

      if (attempts >= MAX_DELETE_ATTEMPTS) {
        // Keep the doc for manual audit, mark it so it stops being retried.
        await docSnap.ref.update({
          attempts,
          lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
          abandonedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Kept for audit, then removed by the TTL policy on expireAt.
          expireAt: logExpireAt(),
          lastError: `Abandoned after ${attempts} attempts`,
        });
        console.error(
          `retryAssemblyAIDeletes: abandoning ${transcriptId} after ${attempts} attempts`
        );
        abandoned++;
      } else {
        await docSnap.ref.update({
          attempts,
          lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        stillFailing++;
      }
    }

    console.log(
      `retryAssemblyAIDeletes: succeeded=${succeeded} stillFailing=${stillFailing} abandoned=${abandoned}`
    );
  }
);

module.exports = {
  deleteAssemblyAITranscript,
  enqueueAssemblyAIDelete,
  retryAssemblyAIDeletes,
};
