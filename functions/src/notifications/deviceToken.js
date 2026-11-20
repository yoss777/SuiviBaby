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
// Plafond global : l'adresse IP vue par la fonction peut être falsifiée
// (X-Forwarded-For) ; ce plafond borne le coût d'un abus, quelle que soit
// l'adresse annoncée.
const MAX_GLOBAL_PER_MINUTE = 120;
const GLOBAL_KEY = "revoke_global";
// Compteurs par adresse effacés par la politique TTL (rate_limits.expireAt).
const RATE_DOC_TTL_MS = 24 * 60 * 60 * 1000;
// Demande plus vieille que 30 jours : ignorée (l'app la jette aussi).
const MAX_QUEUE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Même identifiant de document que l'app (services/pushTokenService.ts). */
function tokenDocId(token) {
  return token.replace(/[^a-zA-Z0-9]/g, "_");
}

/** Clé de limitation de débit par adresse IP (sans compte, pas d'uid). */
function rateLimitKey(ip) {
  const clean = String(ip || "unknown").replace(/[^A-Za-z0-9]/g, "_").slice(0, 64);
  return `revoke_ip_${clean || "unknown"}`;
}

function toMillis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? value : NaN;
}

async function revokeDeviceTokenCore(db, data, ip, nowMs = Date.now()) {
  const token = data?.token;
  const userId = data?.userId;
  const queuedAt = data?.queuedAt;
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    throw new HttpsError("invalid-argument", "Jeton invalide.");
  }
  if (typeof userId !== "string" || !UID_RE.test(userId)) {
    throw new HttpsError("invalid-argument", "Compte invalide.");
  }
  if (typeof queuedAt !== "number" || !Number.isFinite(queuedAt) || queuedAt <= 0) {
    throw new HttpsError("invalid-argument", "Date invalide.");
  }
  const ipKey = rateLimitKey(ip);
  await checkRateLimit(db, GLOBAL_KEY, "revokeDeviceToken", MAX_GLOBAL_PER_MINUTE);
  await checkRateLimit(db, ipKey, "revokeDeviceToken", MAX_PER_MINUTE);
  await db
    .doc(`rate_limits/${ipKey}`)
    .set({ expireAt: admin.firestore.Timestamp.fromMillis(nowMs + RATE_DOC_TTL_MS) }, { merge: true });
  if (nowMs - queuedAt > MAX_QUEUE_AGE_MS) {
    return { ok: true };
  }

  const ref = db.doc(`device_tokens/${tokenDocId(token)}`);
  let revoked = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const doc = snap.data() || {};
    if (doc.token !== token || doc.userId !== userId) return;
    // Jeton réinscrit après la demande (même compte reconnecté sur ce
    // téléphone, requête arrivée en retard) : on ne supprime pas le document
    // tout juste réécrit. lastUsedAt et queuedAt viennent de la même horloge,
    // celle du téléphone.
    const lastUsed = toMillis(doc.lastUsedAt);
    if (Number.isFinite(lastUsed) && lastUsed > queuedAt) return;
    tx.delete(ref);
    revoked = true;
  });
  console.log(JSON.stringify({ job: FUNCTION_NAME, revoked }));
  return { ok: true };
}

const revokeDeviceToken = onCall(
  withAppCheck({ region: "europe-west1", maxInstances: 2 }, FUNCTION_NAME),
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
