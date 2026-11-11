const admin = require("firebase-admin");
const { quotaDayKey } = require("../billing/quotas");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const voiceParse = require("../../lib/voiceParse");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");

/**
 * Daily ceiling on LLM parses per user. Cost guard, not a product quota: the
 * product quota (FREE_DAILY_VOICE_LIMIT) is already charged by
 * transcribeAudio. This bounds what a scripted client could spend calling
 * parseVoiceCommand directly with typed text (~0.03 ¢ per call on Haiku 5.5).
 */
const VOICE_PARSE_DAILY_CAP = 200;

async function reserveVoiceParseSlot(db, uid) {
  const usageRef = db.doc(`usage_limits/${uid}`);
  const today = quotaDayKey();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const data = snap.exists ? snap.data() : {};
    const used = data.voiceParseDate === today ? (data.voiceParseCount || 0) : 0;
    if (used >= VOICE_PARSE_DAILY_CAP) {
      throw new HttpsError("resource-exhausted", "Limite quotidienne d'analyse vocale atteinte.");
    }
    tx.set(usageRef, { voiceParseDate: today, voiceParseCount: used + 1 }, { merge: true });
  });
}

/**
 * Give back a slot when the model produced nothing usable, so an Anthropic
 * outage doesn't eat a heavy user's daily budget. Best-effort.
 */
async function refundVoiceParseSlot(db, uid) {
  const usageRef = db.doc(`usage_limits/${uid}`);
  const today = quotaDayKey();
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const data = snap.exists ? snap.data() : {};
      if (data.voiceParseDate === today && (data.voiceParseCount || 0) > 0) {
        tx.set(usageRef, { voiceParseCount: data.voiceParseCount - 1 }, { merge: true });
      }
    });
  } catch (err) {
    console.warn("refundVoiceParseSlot failed:", err?.message ?? err);
  }
}

/** Anthropic statuses that mean our setup is broken, not a transient blip. */
const VOICE_PARSE_CONFIG_ERRORS = new Set([400, 401, 403, 404]);

/**
 * parseVoiceCommand — interprets a voice transcript with Claude and returns
 * sanitized, structured events (see functions/lib/voiceParse.js).
 *
 * Writes nothing to events: the client shows the result for confirmation and
 * then goes through validateAndCreateEvent as before. Any failure surfaces
 * as `unavailable`, on which the client falls back to its rule-based parser.
 * The transcript is never logged (child health data).
 *
 * Kill switch: deploy with VOICE_LLM_PARSE_ENABLED=false.
 */
const parseVoiceCommand = onCall(
  withAppCheck({
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 15,
    concurrency: 40,
    secrets: ["ANTHROPIC_API_KEY"],
  }, "parseVoiceCommand"),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "parseVoiceCommand");

    if (process.env.VOICE_LLM_PARSE_ENABLED === "false") {
      throw new HttpsError("unavailable", "Analyse vocale avancée désactivée.");
    }

    const { text, localTime } = request.data || {};
    if (typeof text !== "string" || !text.trim()) {
      throw new HttpsError("invalid-argument", "text est requis.");
    }
    if (text.length > voiceParse.MAX_INPUT_CHARS) {
      throw new HttpsError("invalid-argument", "Commande trop longue.");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("parseVoiceCommand: ANTHROPIC_API_KEY not configured");
      throw new HttpsError("unavailable", "Service IA non configuré.");
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "voice_parse", 20);
    await reserveVoiceParseSlot(db, uid);

    const model = process.env.VOICE_PARSE_MODEL || voiceParse.DEFAULT_MODEL;
    const startedAt = Date.now();
    try {
      const { result, usage } = await voiceParse.parseWithClaude({
        client: getAnthropicClient(apiKey),
        text: text.trim(),
        localTime,
        model,
      });
      console.log("parseVoiceCommand", JSON.stringify({
        model,
        ms: Date.now() - startedAt,
        action: result.action,
        events: result.events.length,
        truncated: result.truncated,
        inputTokens: usage.input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        outputTokens: usage.output_tokens,
      }));
      return result;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      await refundVoiceParseSlot(db, uid);
      // Anthropic errors (rate limit, overload, timeout, auth) and unusable
      // answers all degrade the same way for the parent: the client uses its
      // local parser. A broken setup (revoked key, retired model) would do so
      // silently for every user, so it is logged as an error to be alerted on.
      const details = JSON.stringify({
        model,
        ms: Date.now() - startedAt,
        reason: error.reason || error.name,
        status: error.status,
      });
      if (VOICE_PARSE_CONFIG_ERRORS.has(error.status)) {
        console.error("parseVoiceCommand: configuration error", details);
      } else {
        console.warn("parseVoiceCommand: unavailable", details);
      }
      throw new HttpsError("unavailable", "Analyse vocale indisponible.");
    }
  }
);

let anthropicClient = null;
let anthropicClientKey = null;
/** One client per instance (keeps the HTTP agent warm across invocations). */
function getAnthropicClient(apiKey) {
  if (!anthropicClient || anthropicClientKey !== apiKey) {
    const Anthropic = require("@anthropic-ai/sdk").default;
    anthropicClient = new Anthropic({ apiKey });
    anthropicClientKey = apiKey;
  }
  return anthropicClient;
}

module.exports = {
  parseVoiceCommand,
};
