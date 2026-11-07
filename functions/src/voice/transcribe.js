const admin = require("firebase-admin");
const { Buffer } = require("node:buffer");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { refundVoiceQuota, reserveVoiceQuota } = require("../billing/quotas");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");
const { deleteAssemblyAITranscript, enqueueAssemblyAIDelete } = require("./assemblyai");

/**
 * transcribeAudio — Proxy sécurisé pour AssemblyAI
 * - Auth obligatoire
 * - Rate limiting : max 10 requêtes/min/user
 * - Quota voix consommé côté serveur avant l'appel fournisseur coûteux
 */
const transcribeAudio = onCall(
  withAppCheck({
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: ["ASSEMBLYAI_API_KEY"],
    // S4-T4: keep one instance warm + allow batching so voice commands
    // don't pay a 3-8s cold start on Node 22. ~5€/month at current volume.
    concurrency: 30,
    minInstances: 1,
  }),
  async (request) => {
    // 1. Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "transcribeAudio");

    const uid = request.auth.uid;
    const { audioBase64, idempotencyKey } = request.data;

    if (!audioBase64 || typeof audioBase64 !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "audioBase64 est requis (string base64)."
      );
    }

    // Limit audio size (10MB base64 ≈ 7.5MB raw)
    if (audioBase64.length > 10 * 1024 * 1024) {
      throw new HttpsError(
        "invalid-argument",
        "Fichier audio trop volumineux (max 10MB)."
      );
    }

    // T3.3 — bottom bound: ~5KB base64 ≈ 3.7KB raw ≈ < 0.5s of HIGH_QUALITY
    // audio. Anything smaller is either a silent tap or a corrupted record.
    // Bail before consuming quota / hitting AssemblyAI. The client mirrors
    // this check on the file size so most empties never reach here, but
    // the server is the source of truth (quota gate sits behind this).
    if (audioBase64.length < 6_667) {
      throw new HttpsError(
        "invalid-argument",
        "Enregistrement trop court ou silencieux. Parlez plus fort ou plus longtemps."
      );
    }

    // Optional idempotency key: max 100 chars, alphanum/dash/underscore only.
    // Lets the client safely retry a flaky upload without double-charging the
    // user's daily quota or re-running AssemblyAI on the same audio.
    let safeIdempotencyKey = null;
    if (idempotencyKey !== undefined && idempotencyKey !== null) {
      if (typeof idempotencyKey !== "string" || idempotencyKey.length > 100 ||
          !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)) {
        throw new HttpsError(
          "invalid-argument",
          "idempotencyKey doit être une chaîne alphanumérique (max 100 caractères, _ et - autorisés)."
        );
      }
      safeIdempotencyKey = idempotencyKey;
    }

    const db = admin.firestore();
    const apiKey = process.env.ASSEMBLYAI_API_KEY;

    if (!apiKey) {
      throw new HttpsError(
        "internal",
        "AssemblyAI API key non configurée sur le serveur."
      );
    }

    // 2. Rate limiting — max 10 requêtes/min/user
    await checkRateLimit(db, uid, "transcribe", 10);

    // 3. Idempotency cache lookup — short-circuit if the client retried with
    // the same key within the TTL window (5 min). Cached response is returned
    // without re-consuming quota or hitting AssemblyAI.
    const TRANSCRIBE_CACHE_TTL_MS = 5 * 60 * 1000;
    const cacheDocId = safeIdempotencyKey ? `${uid}_${safeIdempotencyKey}` : null;
    if (cacheDocId) {
      const cacheRef = db.doc(`voice_transcribe_cache/${cacheDocId}`);
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const cachedAt = cached.createdAt?.toMillis?.() ?? 0;
        if (Date.now() - cachedAt < TRANSCRIBE_CACHE_TTL_MS) {
          return { text: cached.text || "", cached: true };
        }
      }
    }

    // 4. Business quota — enforced server-side, client checks are UX only.
    await reserveVoiceQuota(db, uid);
    let quotaReserved = true;
    // Declared outside the try so the finally below always knows what to drop
    // at AssemblyAI (HC4), whatever path ends the call (success, error, timeout).
    let transcriptId = null;

    try {
      // 4. Upload audio to AssemblyAI
      const audioBuffer = Buffer.from(audioBase64, "base64");

      const uploadResponse = await fetch(
        "https://api.assemblyai.com/v2/upload",
        {
          method: "POST",
          headers: {
            authorization: apiKey,
            "Content-Type": "application/octet-stream",
          },
          body: audioBuffer,
        }
      );

      if (!uploadResponse.ok) {
        const err = await uploadResponse.text();
        throw new HttpsError("internal", `Upload AssemblyAI échoué: ${err}`);
      }

      const uploadData = await uploadResponse.json();
      const uploadUrl = uploadData.upload_url;

      // 5. Create transcription
      const transcriptResponse = await fetch(
        "https://api.assemblyai.com/v2/transcript",
        {
          method: "POST",
          headers: {
            authorization: apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audio_url: uploadUrl,
            language_code: "fr",
            speech_model: "best",
          }),
        }
      );

      if (!transcriptResponse.ok) {
        const err = await transcriptResponse.text();
        throw new HttpsError(
          "internal",
          `Transcription AssemblyAI échouée: ${err}`
        );
      }

      const transcript = await transcriptResponse.json();
      transcriptId = transcript.id || null;

      // 6. Poll for completion (max 60s)
      let result = transcript;
      const maxPolls = 60;
      let polls = 0;

      while (
        result.status !== "completed" &&
        result.status !== "error" &&
        polls < maxPolls
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        polls++;

        const pollingResponse = await fetch(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { authorization: apiKey } }
        );

        result = await pollingResponse.json();
      }

      if (result.status === "error") {
        throw new HttpsError(
          "internal",
          `Erreur transcription: ${result.error}`
        );
      }

      if (result.status !== "completed") {
        throw new HttpsError("deadline-exceeded", "Transcription timeout.");
      }

      const text = result.text || "";

      // 8. Cache result for the idempotency window so a client retry within
      //    TRANSCRIBE_CACHE_TTL_MS returns the same transcript without
      //    re-spending quota or hitting AssemblyAI again. Best-effort: a
      //    cache write failure is non-fatal.
      if (cacheDocId) {
        try {
          await db.doc(`voice_transcribe_cache/${cacheDocId}`).set({
            text,
            uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            // TTL field — configure a Firestore TTL policy on `expireAt` to
            // auto-purge cache entries server-side without extra cost.
            expireAt: admin.firestore.Timestamp.fromMillis(
              Date.now() + TRANSCRIBE_CACHE_TTL_MS
            ),
          });
        } catch (cacheErr) {
          console.warn(
            `transcribeAudio: cache write failed for ${cacheDocId}:`,
            cacheErr?.message ?? cacheErr
          );
        }
      }

      // Quota was rightfully spent — disarm the refund.
      quotaReserved = false;

      return { text };
    } catch (error) {
      // Refund the quota slot we reserved up front so a failed transcription
      // doesn't eat into the user's daily limit (T1.3).
      if (quotaReserved) {
        await refundVoiceQuota(db, uid);
        quotaReserved = false;
      }

      // Re-throw HttpsError as-is
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error("transcribeAudio error:", error);
      throw new HttpsError(
        "internal",
        "Erreur lors de la transcription audio."
      );
    } finally {
      // 7. Tell AssemblyAI to drop the transcript (and its audio) on EVERY
      //    path: success, provider error, timeout, polling failure (T2.1,
      //    GDPR Art. 17/33). Bounded by a 3s timeout; if the DELETE fails or
      //    throws, the transcriptId is queued for retryAssemblyAIDeletes.
      //    Limit: when the upload worked but the transcript could not be
      //    created there is no id and no documented DELETE endpoint for
      //    /v2/upload files: the provider's own expiry applies (see report).
      if (transcriptId) {
        let deleted = false;
        try {
          deleted = await deleteAssemblyAITranscript(transcriptId, apiKey);
        } catch (delErr) {
          console.warn("transcribeAudio: transcript delete threw:", delErr?.message ?? delErr);
        }
        if (!deleted) {
          await enqueueAssemblyAIDelete(db, transcriptId, "initial-delete-failed", uid);
        }
      }
    }
  }
);

module.exports = {
  transcribeAudio,
};
