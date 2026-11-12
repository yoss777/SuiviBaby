const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { getSubscriptionState, hasUnlimitedFeature } = require("./subscription");

const FREE_DAILY_VOICE_LIMIT = 3;
// Premium is not unlimited: each command costs AssemblyAI + Anthropic, and an
// honest « jusqu'à 50 commandes vocales par jour » beats a hidden fair-use cap
// (decision 2026-11-11, ~3x real usage, still profitable on the annual plan).
const PREMIUM_DAILY_VOICE_LIMIT = 50;
const FREE_TOTAL_PDF_EXPORTS = 1;

// Daily counters reset at midnight in France, not at midnight UTC.
const QUOTA_TIME_ZONE = "Europe/Paris";
function quotaDayKey(date = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: QUOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dailyVoiceLimit(subscriptionState) {
  return hasUnlimitedFeature(subscriptionState, "voice")
    ? PREMIUM_DAILY_VOICE_LIMIT
    : FREE_DAILY_VOICE_LIMIT;
}

function voiceLimitMessage(limit) {
  return limit === PREMIUM_DAILY_VOICE_LIMIT
    ? `Vous avez atteint vos ${limit} commandes vocales du jour. Le compteur repart à zéro à minuit ; la saisie manuelle reste disponible.`
    : `Limite quotidienne atteinte (${limit} commandes vocales par jour). Passez à Premium pour aller jusqu'à ${PREMIUM_DAILY_VOICE_LIMIT} commandes par jour.`;
}

async function getVoiceQuotaStatus(db, uid) {
  const subscriptionState = await getSubscriptionState(db, uid);
  const limit = dailyVoiceLimit(subscriptionState);

  const usageRef = db.doc(`usage_limits/${uid}`);
  const usageDoc = await usageRef.get();
  const usageData = usageDoc.exists ? usageDoc.data() : {};
  const today = quotaDayKey();
  const used =
    usageData.voiceCommandDate === today ? usageData.voiceCommandCount || 0 : 0;

  return {
    feature: "voice",
    allowed: used < limit,
    isUnlimited: false,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetDate: today,
  };
}

/**
 * Refund a previously-reserved voice quota slot. Called when the downstream
 * AssemblyAI pipeline fails after we have already incremented the counter.
 * Best-effort: a refund failure is logged but does not surface to the user —
 * the original error from AssemblyAI matters more than a lost quota slot.
 */
async function refundVoiceQuota(db, uid) {
  try {
    const usageRef = db.doc(`usage_limits/${uid}`);
    await db.runTransaction(async (tx) => {
      const usageDoc = await tx.get(usageRef);
      if (!usageDoc.exists) return;
      const usageData = usageDoc.data() ?? {};
      const today = quotaDayKey();
      // Only refund if the reservation is from today — older counters have
      // already been reset by the date check in reserveVoiceQuota.
      if (usageData.voiceCommandDate !== today) return;
      const current = usageData.voiceCommandCount || 0;
      if (current <= 0) return;
      tx.update(usageRef, {
        voiceCommandCount: current - 1,
        lastVoiceQuotaRefundAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    console.error(`refundVoiceQuota failed for uid=${uid}:`, err?.message ?? err);
  }
}

async function reserveVoiceQuota(db, uid) {
  const subscriptionState = await getSubscriptionState(db, uid);
  const limit = dailyVoiceLimit(subscriptionState);

  const usageRef = db.doc(`usage_limits/${uid}`);
  return await db.runTransaction(async (tx) => {
    const usageDoc = await tx.get(usageRef);
    const usageData = usageDoc.exists ? usageDoc.data() : {};
    const today = quotaDayKey();
    const used =
      usageData.voiceCommandDate === today ? usageData.voiceCommandCount || 0 : 0;

    if (used >= limit) {
      throw new HttpsError("resource-exhausted", voiceLimitMessage(limit), {
        reason: "voice-limit",
        limit,
      });
    }

    tx.set(
      usageRef,
      {
        voiceCommandDate: today,
        voiceCommandCount: used + 1,
        lastVoiceCommandAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      feature: "voice",
      allowed: true,
      isUnlimited: false,
      used: used + 1,
      limit,
      remaining: Math.max(0, limit - (used + 1)),
      resetDate: today,
    };
  });
}

async function getExportQuotaStatus(db, uid) {
  const subscriptionState = await getSubscriptionState(db, uid);

  if (hasUnlimitedFeature(subscriptionState, "export")) {
    return {
      feature: "export",
      allowed: true,
      isUnlimited: true,
      used: 0,
      limit: null,
      remaining: null,
      resetDate: null,
    };
  }

  const usageRef = db.doc(`usage_limits/${uid}`);
  const usageDoc = await usageRef.get();
  const usageData = usageDoc.exists ? usageDoc.data() : {};
  const used = usageData.pdfExportCount || 0;

  return {
    feature: "export",
    allowed: used < FREE_TOTAL_PDF_EXPORTS,
    isUnlimited: false,
    used,
    limit: FREE_TOTAL_PDF_EXPORTS,
    remaining: Math.max(0, FREE_TOTAL_PDF_EXPORTS - used),
    resetDate: null,
  };
}

// Sharing is unlimited for every plan (decision 2026-11-11): each invited
// caregiver is a new user, and limiting it penalised the core co-parent loop.
// Kept as a function so older apps asking for the "sharing" quota still get
// a valid answer.
async function getSharingQuotaStatus() {
  return {
    feature: "sharing",
    allowed: true,
    isUnlimited: true,
    used: 0,
    limit: null,
    remaining: null,
    resetDate: null,
  };
}

module.exports = {
  FREE_DAILY_VOICE_LIMIT,
  FREE_TOTAL_PDF_EXPORTS,
  PREMIUM_DAILY_VOICE_LIMIT,
  quotaDayKey,
  getExportQuotaStatus,
  getSharingQuotaStatus,
  getVoiceQuotaStatus,
  refundVoiceQuota,
  reserveVoiceQuota,
};
