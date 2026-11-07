const { HttpsError } = require("firebase-functions/v2/https");
const { hasChildRole } = require("../../accessControl");

// ============================================
// CLOUD FUNCTIONS
// ============================================

/**
 * Vérifie que l'utilisateur a accès à l'enfant (owner, admin ou contributor)
 */
async function checkChildAccess(db, uid, childId, requiredRoles) {
  const accessDoc = await db
    .doc(`children/${childId}/access/${uid}`)
    .get();

  if (!accessDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "Vous n'avez pas accès à cet enfant."
    );
  }

  const accessData = accessDoc.data();
  const role = accessData.role;
  // Le rôle seul décide (sprint 4.8, Q6) : le drapeau canWriteEvents d'un
  // contributeur ou d'un observateur n'ouvre plus l'écriture.
  if (!hasChildRole(accessData, requiredRoles)) {
    throw new HttpsError(
      "permission-denied",
      `Rôle '${role}' insuffisant. Requis: ${requiredRoles.join("/")}.`
    );
  }

  return role;
}

module.exports = {
  checkChildAccess,
};
