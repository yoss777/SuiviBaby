const admin = require("firebase-admin");
const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { hasUnlimitedFeature, subscriptionStateFrom } = require("./subscription");
const { withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");

// Referral codes are created by the server only (audit A2): the client can no
// longer write referralCode / referredBy / referralCount (firestore.rules), and
// referral_codes/{code} maps a code to its owner without a forgeable query.
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Rewards granted to one referrer (the referred user is always rewarded once).
const REFERRAL_REWARD_CAP = 10;

function generateServerReferralCode() {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) code += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  return `SAM-${code.slice(0, 4)}-${code.slice(4)}`;
}

function normalizeReferralCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * ensureReferralCode — Renvoie le code parrainage de l'utilisateur, en le
 * créant côté serveur s'il n'existe pas. Un ancien code généré par l'app est
 * repris s'il n'appartient à personne d'autre.
 */
const ensureReferralCode = onCall(
  withAppCheck({ region: "europe-west1" }, "ensureReferralCode"),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "referralCode", 10);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = await db.runTransaction(async (tx) => {
        const promosRef = db.doc(`user_promos/${uid}`);
        const promosSnap = await tx.get(promosRef);
        const stored = normalizeReferralCode(promosSnap.exists ? promosSnap.data()?.referralCode : "");
        // An old app-written code becomes a document id: reject odd values.
        const current = /^[A-Z0-9-]{4,20}$/.test(stored) ? stored : "";
        if (current) {
          const mappingRef = db.doc(`referral_codes/${current}`);
          const mapping = await tx.get(mappingRef);
          if (mapping.exists && mapping.data()?.uid === uid) return current;
          if (!mapping.exists) {
            tx.create(mappingRef, { uid, createdAt: admin.firestore.Timestamp.now(), legacy: true });
            return current;
          }
        }
        const candidate = generateServerReferralCode();
        const candidateRef = db.doc(`referral_codes/${candidate}`);
        const taken = await tx.get(candidateRef);
        if (taken.exists) return null;
        tx.create(candidateRef, { uid, createdAt: admin.firestore.Timestamp.now() });
        tx.set(promosRef, { referralCode: candidate }, { merge: true });
        return candidate;
      });
      if (code) return { referralCode: code };
    }
    throw new HttpsError("resource-exhausted", "Impossible de créer un code, réessayez.");
  }
);

/**
 * validateReferralCode — Valide un code parrainage et attribue 1 mois Premium
 * au filleul, et au parrain dans la limite de REFERRAL_REWARD_CAP.
 * Un compte ne peut être parrainé qu'une fois : referrals/{filleulUid} est
 * créé dans la même transaction que les récompenses.
 */
const validateReferralCode = onCall(
  withAppCheck({ region: "europe-west1" }, "validateReferralCode"),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    if (request.auth.token?.email_verified !== true) {
      throw new HttpsError("failed-precondition", "Vérifiez votre adresse e-mail avant d'utiliser un code.");
    }

    const filleulUid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, filleulUid, "referral", 5);

    const referralCode = normalizeReferralCode(request.data?.referralCode);
    if (!/^[A-Z0-9-]{4,20}$/.test(referralCode)) {
      throw new HttpsError("invalid-argument", "Code parrainage invalide.");
    }

    // Parrain : table referral_codes (codes serveur), sinon ancien code stocké
    // dans user_promos (créé par l'app avant le correctif).
    let parrainUid = null;
    const mapping = await db.doc(`referral_codes/${referralCode}`).get();
    if (mapping.exists) {
      parrainUid = mapping.data()?.uid ?? null;
    } else {
      const legacy = await db
        .collection("user_promos")
        .where("referralCode", "==", referralCode)
        .limit(2)
        .get();
      // Two accounts with the same old code: one of them copied it, refuse.
      if (legacy.size === 1) parrainUid = legacy.docs[0].id;
    }
    if (!parrainUid) {
      throw new HttpsError("not-found", "Code parrainage introuvable.");
    }
    if (parrainUid === filleulUid) {
      throw new HttpsError("failed-precondition", "Vous ne pouvez pas utiliser votre propre code.");
    }

    // Parrainages enregistrés avant le correctif (identifiant aléatoire).
    const legacyUse = await db
      .collection("referrals")
      .where("filleulUid", "==", filleulUid)
      .limit(1)
      .get();
    if (!legacyUse.empty) {
      throw new HttpsError("already-exists", "Vous avez deja utilise un code parrainage.");
    }

    const now = admin.firestore.Timestamp.now();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    const reward = {
      tier: "premium",
      status: "active",
      startDate: now.toDate().toISOString(),
      expiresAt: oneMonthLater.toISOString(),
      source: "referral_reward",
    };

    let parrainRewarded = false;
    await db.runTransaction(async (tx) => {
      const referralRef = db.doc(`referrals/${filleulUid}`);
      const filleulPromosRef = db.doc(`user_promos/${filleulUid}`);
      const parrainPromosRef = db.doc(`user_promos/${parrainUid}`);
      const filleulSubRef = db.doc(`subscriptions/${filleulUid}`);
      const parrainSubRef = db.doc(`subscriptions/${parrainUid}`);
      const [used, filleulPromos, parrainPromos, filleulSub, parrainSub] = [
        await tx.get(referralRef),
        await tx.get(filleulPromosRef),
        await tx.get(parrainPromosRef),
        await tx.get(filleulSubRef),
        await tx.get(parrainSubRef),
      ];
      // Paid subscriptions are never overwritten by the reward (read here so
      // a purchase landing meanwhile is seen).
      const filleulState = subscriptionStateFrom(filleulSub);
      const parrainState = subscriptionStateFrom(parrainSub);
      if (used.exists || filleulPromos.data()?.referredBy) {
        throw new HttpsError("already-exists", "Vous avez deja utilise un code parrainage.");
      }
      const referralCount = Number(parrainPromos.data()?.referralCount) || 0;

      tx.create(referralRef, { parrainUid, filleulUid, referralCode, createdAt: now });
      tx.set(parrainPromosRef, { referralCount: referralCount + 1 }, { merge: true });
      tx.set(filleulPromosRef, { referredBy: parrainUid, referredAt: now }, { merge: true });

      if (!hasUnlimitedFeature(filleulState, "voice")) {
        tx.set(filleulSubRef, reward, { merge: true });
      }
      if (referralCount < REFERRAL_REWARD_CAP && !hasUnlimitedFeature(parrainState, "voice")) {
        tx.set(parrainSubRef, reward, { merge: true });
        parrainRewarded = true;
      }
    });

    console.log(`validateReferralCode: parrain=${parrainUid}, filleul=${filleulUid}, parrainRewarded=${parrainRewarded}`);
    return { success: true, parrainUid, message: "1 mois Premium offert !" };
  }
);

module.exports = {
  ensureReferralCode,
  validateReferralCode,
};
