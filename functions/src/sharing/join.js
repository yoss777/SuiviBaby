const { HttpsError } = require("firebase-functions/v2/https");
const { hasChildRole } = require("../../accessControl");

// Rôle contributor (miroir de DEFAULT_ROLE_PERMISSIONS côté app) : likes et
// commentaires sur les photos uniquement, aucune écriture d'événement.
const CONTRIBUTOR_PERMISSIONS = Object.freeze({
  canWriteEvents: false,
  canWriteLikes: true,
  canWriteComments: true,
});

// ============================================
// SHARING — REDEEM CODE (B1.1)
// ============================================


// Vérifie, dans une transaction, que l'enfant existe et n'est pas en cours de
// suppression, et que la personne qui a émis l'invitation ou le code est
// toujours owner/admin (un admin révoqué ne doit plus pouvoir faire entrer
// quelqu'un avec une invitation encore en attente).
async function assertJoinStillValid(tx, db, childId, grantorUid, notFoundMessage) {
  const [childSnap, grantorAccess] = await Promise.all([
    tx.get(db.doc(`children/${childId}`)),
    tx.get(db.doc(`children/${childId}/access/${grantorUid}`)),
  ]);
  if (!childSnap.exists || childSnap.data()?.deletedAt) {
    throw new HttpsError("not-found", notFoundMessage);
  }
  if (!grantorAccess.exists || !hasChildRole(grantorAccess.data(), ["owner", "admin"])) {
    throw new HttpsError("failed-precondition", "Cette invitation n'est plus valide.");
  }
}

module.exports = {
  CONTRIBUTOR_PERMISSIONS,
  assertJoinStillValid,
};
