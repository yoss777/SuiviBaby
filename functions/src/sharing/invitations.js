const admin = require("firebase-admin");
const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { hasChildRole } = require("../../accessControl");
const { getSharingQuotaStatus } = require("../billing/quotas");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");
const { assertVerifiedEmail, isValidDocId } = require("../shared/validation");
const { CONTRIBUTOR_PERMISSIONS, assertJoinStillValid } = require("./join");

const createShareInvitation = onCall(
  withAppCheck({ region: "europe-west1" }, "createShareInvitation"),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "createShareInvitation");

    const uid = request.auth.uid;
    const inviterEmail = request.auth.token?.email;
    // childName du client est ignoré : le nom vient de children/{id}.
    const { childId, invitedEmail } = request.data || {};
    const db = admin.firestore();

    assertVerifiedEmail(request);
    await checkRateLimit(db, uid, "share_invite", 5);

    if (!childId || typeof childId !== "string" || !isValidDocId(childId)) {
      throw new HttpsError("invalid-argument", "childId est requis.");
    }
    if (!invitedEmail || typeof invitedEmail !== "string" || invitedEmail.length > 254) {
      throw new HttpsError("invalid-argument", "invitedEmail est requis.");
    }
    if (!inviterEmail) {
      throw new HttpsError("failed-precondition", "Email utilisateur introuvable.");
    }

    const invitedEmailLower = invitedEmail.trim().toLowerCase();
    if (invitedEmailLower === inviterEmail.toLowerCase()) {
      throw new HttpsError(
        "invalid-argument",
        "Vous ne pouvez pas vous inviter vous-même.",
        { reason: "self-invite" }
      );
    }

    const accessDoc = await db.doc(`children/${childId}/access/${uid}`).get();
    if (!accessDoc.exists || !hasChildRole(accessDoc.data(), ["owner", "admin"])) {
      throw new HttpsError(
        "permission-denied",
        "Accès insuffisant à cet enfant.",
        { reason: "insufficient-access" }
      );
    }

    const childDoc = await db.doc(`children/${childId}`).get();
    if (!childDoc.exists || childDoc.data()?.deletedAt) {
      throw new HttpsError("not-found", "Enfant introuvable.", { reason: "child-not-found" });
    }

    const sharingQuota = await getSharingQuotaStatus(db, uid, childId);
    if (!sharingQuota.isUnlimited && sharingQuota.remaining <= 0) {
      throw new HttpsError(
        "resource-exhausted",
        "Le plan gratuit permet 2 co-parents maximum. Passez en Famille pour inviter plus de personnes.",
        { reason: "sharing-limit" }
      );
    }

    // Résolution via Firebase Auth (source de vérité de l'e-mail du compte),
    // pas via users/{uid}.email que chaque utilisateur peut réécrire : sinon
    // un attaquant y mettait l'e-mail d'une victime pour recevoir ses invitations.
    let invitedUserId;
    try {
      invitedUserId = (await admin.auth().getUserByEmail(invitedEmailLower)).uid;
    } catch (err) {
      if (err?.code !== "auth/user-not-found") throw err;
      // Réponse neutre : même forme que le succès, rien n'est créé. Sinon la
      // fonction confirmait quelles adresses ont un compte SuiviBaby.
      return { id: randomNeutralId() };
    }
    const targetAccessDoc = await db.doc(`children/${childId}/access/${invitedUserId}`).get();
    if (targetAccessDoc.exists) {
      // Même réponse neutre qu'un compte inconnu : sinon l'erreur disait qui
      // a déjà accès à l'enfant (énumération).
      return { id: randomNeutralId() };
    }

    const existingInvites = await db
      .collection("shareInvitations")
      .where("childId", "==", childId)
      .where("invitedEmail", "==", invitedEmailLower)
      .where("inviterId", "==", uid)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingInvites.empty) {
      return { id: randomNeutralId() };
    }

    const invitationRef = await db.collection("shareInvitations").add({
      childId,
      childName: childDoc.data()?.name || "",
      inviterId: uid,
      inviterEmail,
      invitedEmail: invitedEmailLower,
      invitedUserId,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { id: invitationRef.id };
  }
);

/** 20 alphanumeric characters, the shape of a Firestore auto id (neutral invitation answer). */
function randomNeutralId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 20 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}

/**
 * acceptInvitationCF — Accepte une invitation par email de manière transactional.
 *
 * Avant : 3 calls Firestore séparés côté client (read invitation, read access,
 * grantChildAccess + update status). Deux acceptations concurrentes pouvaient
 * créer deux docs access (status check pas atomique).
 *
 * Garanties :
 *  - Transaction : read invitation + check status + create access + mark
 *    accepted, atomique. Race acceptation concurrente impossible.
 *  - Rate limit 5/min/uid.
 *  - Vérification que l'utilisateur est bien destinataire (uid ou email).
 *  - Si l'access existe déjà, on marque juste l'invitation accepted (idempotent).
 */
const acceptInvitationCF = onCall(
  withAppCheck({ region: "europe-west1" }, "acceptInvitationCF"),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "acceptInvitationCF");
    assertVerifiedEmail(request);

    const uid = request.auth.uid;
    const userEmail = (request.auth.token.email || "").toLowerCase();
    const invitationId = request.data?.invitationId;

    if (typeof invitationId !== "string" || invitationId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "invitationId requis (string).");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "accept_invite", 5);

    const invitationRef = db.doc(`shareInvitations/${invitationId}`);

    try {
      await db.runTransaction(async (tx) => {
        const inviteDoc = await tx.get(invitationRef);
        if (!inviteDoc.exists) {
          throw new HttpsError("not-found", "Invitation introuvable.");
        }
        const invitation = inviteDoc.data();

        // Destinataire : on accepte si invitedUserId === uid, OU si
        // invitedEmail correspond à l'email du user.
        const matchByUid = invitation.invitedUserId === uid;
        const matchByEmail = (invitation.invitedEmail || "").toLowerCase() === userEmail && userEmail.length > 0;
        if (!matchByUid && !matchByEmail) {
          throw new HttpsError("permission-denied", "Cette invitation ne vous est pas destinée.");
        }

        if (invitation.status !== "pending") {
          throw new HttpsError("failed-precondition", "Cette invitation a déjà été traitée.");
        }

        const childId = invitation.childId;
        if (!childId) {
          throw new HttpsError("internal", "Invitation corrompue (childId absent).");
        }

        const accessRef = db.doc(`children/${childId}/access/${uid}`);
        const existingAccess = await tx.get(accessRef);

        if (!existingAccess.exists) {
          await assertJoinStillValid(tx, db, childId, invitation.inviterId, "Invitation introuvable.");

          // Créer l'access (rôle contributor : likes et commentaires uniquement).
          tx.set(accessRef, {
            userId: uid,
            role: "contributor",
            ...CONTRIBUTOR_PERMISSIONS,
            grantedBy: invitation.inviterId,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
            invitationId,
          });

          // Index user_child_access.
          tx.set(db.doc(`user_child_access/${uid}_${childId}`), {
            userId: uid,
            childId,
            invitationId,
            grantedBy: invitation.inviterId,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        // Marquer l'invitation acceptée (idempotent : marche aussi si access
        // existait déjà → on signale juste qu'elle est traitée).
        tx.update(invitationRef, { status: "accepted" });
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("acceptInvitationCF transaction error:", err);
      throw new HttpsError("internal", "Erreur lors de l'acceptation de l'invitation.");
    }

    return { success: true };
  }
);

module.exports = {
  acceptInvitationCF,
  createShareInvitation,
};
