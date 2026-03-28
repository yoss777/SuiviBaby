/**
 * Retourne true si le document d'accès satisfait les rôles requis
 * ou le fallback canWriteEvents.
 *
 * Cette fonction reste volontairement pure pour être testable sans
 * dépendance Firebase.
 *
 * @param {{ role?: string, canWriteEvents?: boolean } | null | undefined} accessData
 * @param {string[] | null | undefined} requiredRoles
 * @returns {boolean}
 */
function hasRequiredChildAccess(accessData, requiredRoles) {
  if (!accessData) return false;

  const role = accessData.role;
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  if (requiredRoles.includes(role)) {
    return true;
  }

  return accessData.canWriteEvents === true;
}

module.exports = {
  hasRequiredChildAccess,
};
