const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { BATCH_LIMIT } = require("../shared/batch");
const { checkRateLimit } = require("../shared/rateLimit");
const { assertVerifiedEmail } = require("../shared/validation");
const { CONTRIBUTOR_PERMISSIONS, assertJoinStillValid } = require("./join");

const cleanupExpiredShareCodes = onSchedule("every 24 hours", async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  let deleted = 0;
  let lastDoc = null;

  while (true) {
    let query = db
      .collection("shareCodes")
      .where("expiresAt", "<=", now)
      .orderBy("expiresAt")
      .limit(BATCH_LIMIT);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deleted += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];

    if (snapshot.size < BATCH_LIMIT) break;
  }

  console.log(`cleanupExpiredShareCodes: deleted ${deleted} docs`);
});

/**
 * redeemShareCodeCF — Échange un code de partage contre un accès enfant.
 *
 * Avant cette CF, le redeem se faisait côté client en 3 calls Firestore
 * séparés (read shareCode, update used, setDoc access). Une race entre
 * deux calls concurrents pouvait créer deux accès avec un seul code,
 * et il n'y avait aucun rate limit (1B combos bruteforce-able).
 *
 * Garanties :
 *  - Transaction Firestore : read + update used + create access dans un
 *    seul commit atomique. Race conditions impossibles.
 *  - Rate limit 5/min/uid via checkRateLimit (anti brute-force codes).
 *  - Message d'erreur générique ("code invalide ou expiré") pour ne pas
 *    leak l'existence d'un childId (B1-S4).
 *  - Vérifications : auth, code uppercase, code existe, !used, !expired,
 *    user pas déjà accès, user a un email vérifié.
 *
 * Retourne le childId/childName pour navigation client immédiate.
 */
const redeemShareCodeCF = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "redeemShareCodeCF");

    const uid = request.auth.uid;
    const userEmail = request.auth.token.email;
    if (!userEmail) {
      throw new HttpsError(
        "failed-precondition",
        "Vous devez avoir un email associé à votre compte."
      );
    }
    assertVerifiedEmail(request);

    const rawCode = request.data?.code;
    if (typeof rawCode !== "string" || rawCode.trim().length === 0) {
      throw new HttpsError("invalid-argument", "code requis (string).");
    }
    const code = rawCode.trim().toUpperCase();
    // Garde fou cosmétique : codes attendus 6-12 chars alphanum. Permet de
    // rejeter immédiatement les inputs farfelus (1MB de string).
    if (!/^[A-Z0-9-]{4,16}$/.test(code)) {
      throw new HttpsError("invalid-argument", "Code invalide ou expiré.");
    }

    const db = admin.firestore();
    // T0 — rate limit anti brute-force. 5/min/uid laisse de la marge à un
    // utilisateur qui retape, mais bloque l'énumération automatisée.
    await checkRateLimit(db, uid, "redeem_share", 5);

    const codeRef = db.doc(`shareCodes/${code}`);

    let resultData;
    try {
      await db.runTransaction(async (tx) => {
        const codeDoc = await tx.get(codeRef);
        if (!codeDoc.exists) {
          throw new HttpsError("not-found", "Code invalide ou expiré.");
        }
        const shareCode = codeDoc.data();

        if (shareCode.used === true) {
          // Message générique : on ne distingue pas "déjà utilisé" de
          // "n'existe pas" pour ne pas confirmer à un attaquant qu'un code
          // a existé (info utilisable pour cartographier des childIds).
          throw new HttpsError("not-found", "Code invalide ou expiré.");
        }

        // expiresAt peut être un Timestamp Firestore. toMillis robuste.
        const expiresMs =
          shareCode.expiresAt?.toMillis?.() ??
          shareCode.expiresAt?._seconds * 1000 ??
          0;
        if (expiresMs && expiresMs < Date.now()) {
          throw new HttpsError("not-found", "Code invalide ou expiré.");
        }

        const childId = shareCode.childId;
        if (!childId) {
          throw new HttpsError("internal", "Code corrompu (childId absent).");
        }

        // Vérifier que l'utilisateur n'a pas déjà accès à cet enfant.
        const existingAccessRef = db.doc(`children/${childId}/access/${uid}`);
        const existingAccess = await tx.get(existingAccessRef);
        if (existingAccess.exists) {
          throw new HttpsError(
            "already-exists",
            "Vous avez déjà accès à cet enfant."
          );
        }

        await assertJoinStillValid(tx, db, childId, shareCode.createdBy, "Code invalide ou expiré.");

        // 1. Marquer le code comme utilisé (champs exigés par firestore.rules).
        tx.update(codeRef, {
          used: true,
          usedBy: uid,
          usedByEmail: userEmail,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 2. Créer le doc d'accès. Rôle contributor : likes et commentaires
        //    uniquement, pas d'écriture d'événements (DEFAULT_ROLE_PERMISSIONS
        //    côté client, décision D11 du 2026-11-02).
        tx.set(existingAccessRef, {
          userId: uid,
          role: "contributor",
          ...CONTRIBUTOR_PERMISSIONS,
          grantedBy: shareCode.createdBy,
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
          invitationId: code,
        });

        // 3. Créer l'entrée d'index user_child_access pour le listing rapide
        //    côté client.
        const indexRef = db.doc(`user_child_access/${uid}_${childId}`);
        tx.set(indexRef, {
          userId: uid,
          childId,
          invitationId: code,
          grantedBy: shareCode.createdBy,
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        resultData = {
          childId,
          childName: shareCode.childName ?? "",
        };
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("redeemShareCodeCF transaction error:", err);
      throw new HttpsError("internal", "Erreur lors de l'utilisation du code.");
    }

    return resultData;
  }
);

module.exports = {
  cleanupExpiredShareCodes,
  redeemShareCodeCF,
};
