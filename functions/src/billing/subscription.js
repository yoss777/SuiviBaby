
async function getSubscriptionState(db, uid) {
  return subscriptionStateFrom(await db.doc(`subscriptions/${uid}`).get());
}

function subscriptionStateFrom(snap) {
  const data = snap.exists ? snap.data() : {};

  return {
    tier: data.tier || "free",
    status: data.status || "active",
    grandfathered: data.grandfathered === true || data.status === "grandfathered",
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
  };
}

// Une annulation (ou un incident de paiement, pendant la période de grâce
// des stores) ne coupe pas l'accès : l'abonné garde Premium jusqu'à la fin
// de la période déjà payée (expiresAt). EXPIRATION repasse ensuite en free.
function isEntitledStatus(subscriptionState, nowMs = Date.now()) {
  const { status, expiresAt } = subscriptionState;
  if (status === "active" || status === "trial") return true;
  if (status === "cancelled" || status === "billing_issue") {
    const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
    return Number.isFinite(expiresMs) && expiresMs > nowMs;
  }
  return false;
}

function hasUnlimitedFeature(subscriptionState, feature) {
  if (!subscriptionState) return false;

  if (subscriptionState.grandfathered) {
    return true;
  }

  const isPaidTier =
    subscriptionState.tier === "premium" || subscriptionState.tier === "family";
  const isActiveStatus = isEntitledStatus(subscriptionState);

  if (!isPaidTier || !isActiveStatus) {
    return false;
  }

  if (feature === "sharing") {
    return subscriptionState.tier === "family" || subscriptionState.tier === "premium";
  }

  return true;
}

module.exports = {
  getSubscriptionState,
  hasUnlimitedFeature,
  isEntitledStatus,
  subscriptionStateFrom,
};
