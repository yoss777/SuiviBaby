// Révocation du jeton de notification d'un téléphone, sans compte connecté
// (SUIVI_ACTIONS R22).
//
// Cas visé : déconnexion hors ligne (ou forcée) sur un iPhone. Le document
// device_tokens/<jeton> ne peut plus être supprimé par l'app (les règles
// exigent l'authentification du propriétaire), et sur iOS la désinscription
// locale ne rend pas le jeton invalide : l'ancien compte continuait de
// recevoir ses rappels (prénom de l'enfant, type de soin) sur ce téléphone
// jusqu'à la prochaine connexion. L'app garde le jeton en attente et appelle
// cette fonction au retour du réseau.
//
// Preuve : le jeton Expo lui-même (aléatoire, connu seulement du téléphone et
// du serveur). L'identifiant de l'ancien compte est exigé en plus : si un
// autre compte a repris le jeton sur ce téléphone (même document), son
// document n'est jamais supprimé. Réponse identique dans tous les cas, pour
// ne rien révéler sur l'existence d'un jeton.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");

const FUNCTION_NAME = "revokeDeviceToken";
const TOKEN_RE = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PER_MINUTE = 10;

/** Même identifiant de document que l'app (services/pushTokenService.ts). */
function tokenDocId(token) {
  return token.replace(/[^a-zA-Z0-9]/g, "_");
}

/** Clé de limitation de débit par adresse IP (sans compte, pas d'uid). */
function rateLimitKey(ip) {
  const clean = String(ip || "unknown").replace(/[^A-Za-z0-9]/g, "_").slice(0, 64);
  return `revoke_ip_${clean || "unknown"}`;
}

async function revokeDeviceTokenCore(db, data, ip) {
  const token = data?.token;
  const userId = data?.userId;
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    throw new HttpsError("invalid-argument", "Jeton invalide.");
  }
  if (typeof userId !== "string" || !UID_RE.test(userId)) {
    throw new HttpsError("invalid-argument", "Compte invalide.");
  }
  await checkRateLimit(db, rateLimitKey(ip), "revokeDeviceToken", MAX_PER_MINUTE);

  const ref = db.doc(`device_tokens/${tokenDocId(token)}`);
  let revoked = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const doc = snap.data() || {};
    if (doc.token !== token || doc.userId !== userId) return;
    tx.delete(ref);
    revoked = true;
  });
  console.log(JSON.stringify({ job: FUNCTION_NAME, revoked }));
  return { ok: true };
}

const revokeDeviceToken = onCall(
  withAppCheck({ region: "europe-west1" }, FUNCTION_NAME),
  async (request) => {
    monitorAppCheck(request, FUNCTION_NAME);
    return revokeDeviceTokenCore(admin.firestore(), request.data, request.rawRequest?.ip);
  },
);

module.exports = {
  revokeDeviceToken,
  revokeDeviceTokenCore,
  tokenDocId,
  rateLimitKey,
};
