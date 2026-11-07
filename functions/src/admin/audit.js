const admin = require("firebase-admin");

/**
 * B6.S5 — TTL Firestore sur adminAuditLog : 90 jours après l'action.
 * Injecte `expireAt` automatiquement sur tous les writes. Le TTL field
 * doit être provisionné via functions/scripts/enable-admin-audit-ttl.js.
 *
 * Wrapper centralisé pour ne pas dupliquer le calcul à chaque call site.
 * Garde la signature `add()` simple : passer juste le payload, le wrapper
 * ajoute `expireAt` et appelle `writeAdminAudit(db,...)`.
 */
const ADMIN_AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
async function writeAdminAudit(db, payload) {
  return db.collection("adminAuditLog").add({
    ...payload,
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + ADMIN_AUDIT_RETENTION_MS),
  });
}

module.exports = {
  writeAdminAudit,
};
