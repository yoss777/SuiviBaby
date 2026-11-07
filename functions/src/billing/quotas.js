const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { getSubscriptionState, hasUnlimitedFeature } = require("./subscription");

const FREE_DAILY_VOICE_LIMIT = 3;
const FREE_TOTAL_PDF_EXPORTS = 1;
const FREE_MAX_SHARED_USERS = 2;

async function getVoiceQuotaStatus(db, uid) {
  const subscriptionState = await getSubscriptionState(db, uid);

  if (hasUnlimitedFeature(subscriptionState, "voice")) {
    return {
      feature: "voice",
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
  const today = new Date().toISOString().split("T")[0];
  const used =
    usageData.voiceCommandDate === today ? usageData.voiceCommandCount || 0 : 0;

  return {
    feature: "voice",
    allowed: used < FREE_DAILY_VOICE_LIMIT,
    isUnlimited: false,
    used,
    limit: FREE_DAILY_VOICE_LIMIT,
    remaining: Math.max(0, FREE_DAILY_VOICE_LIMIT - used),
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
      const today = new Date().toISOString().split("T")[0];
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

  if (hasUnlimitedFeature(subscriptionState, "voice")) {
    return {
      feature: "voice",
      allowed: true,
      isUnlimited: true,
      used: 0,
      limit: null,
      remaining: null,
      resetDate: null,
    };
  }

  const usageRef = db.doc(`usage_limits/${uid}`);
  return await db.runTransaction(async (tx) => {
    const usageDoc = await tx.get(usageRef);
    const usageData = usageDoc.exists ? usageDoc.data() : {};
    const today = new Date().toISOString().split("T")[0];
    const used =
      usageData.voiceCommandDate === today ? usageData.voiceCommandCount || 0 : 0;

    if (used >= FREE_DAILY_VOICE_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        `Limite quotidienne atteinte (${FREE_DAILY_VOICE_LIMIT} commandes vocales/jour). Passez en Premium pour un usage illimité.`
      );
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
      limit: FREE_DAILY_VOICE_LIMIT,
      remaining: Math.max(0, FREE_DAILY_VOICE_LIMIT - (used + 1)),
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

async function getSharingQuotaStatus(db, uid, childId) {
  const subscriptionState = await getSubscriptionState(db, uid);

  if (hasUnlimitedFeature(subscriptionState, "sharing")) {
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

  const [childAccessSnapshot, pendingInvitesSnapshot] = await Promise.all([
    db.collection(`children/${childId}/access`).get(),
    db
      .collection("shareInvitations")
      .where("childId", "==", childId)
      .where("status", "==", "pending")
      .get(),
  ]);

  const linkedCoparents = childAccessSnapshot.docs.filter((docSnap) => {
    const accessData = docSnap.data();
    return accessData.role !== "owner";
  }).length;
  const pendingInvites = pendingInvitesSnapshot.size;
  const used = linkedCoparents + pendingInvites;

  return {
    feature: "sharing",
    allowed: used < FREE_MAX_SHARED_USERS,
    isUnlimited: false,
    used,
    limit: FREE_MAX_SHARED_USERS,
    remaining: Math.max(0, FREE_MAX_SHARED_USERS - used),
    resetDate: null,
  };
}

module.exports = {
  FREE_TOTAL_PDF_EXPORTS,
  getExportQuotaStatus,
  getSharingQuotaStatus,
  getVoiceQuotaStatus,
  refundVoiceQuota,
  reserveVoiceQuota,
};
