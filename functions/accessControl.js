/**
 * Retourne true uniquement si le rôle fait partie des rôles requis. Le rôle
 * seul décide (les anciens drapeaux canWriteEvents d'un document d'accès ne
 * donnent aucun droit) : écriture d'événements, partage, invitations.
 *
 * @param {{ role?: string } | null | undefined} accessData
 * @param {string[]} requiredRoles
 * @returns {boolean}
 */
function hasChildRole(accessData, requiredRoles) {
  if (!accessData || !Array.isArray(requiredRoles)) return false;
  return requiredRoles.includes(accessData.role);
}

module.exports = {
  hasChildRole,
};
