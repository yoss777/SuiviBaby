const crypto = require("node:crypto");

/** deleted_idem tombstones live 30 days (TTL on expireAt). */
const IDEM_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================
// EVENT CRUD CLOUD FUNCTIONS
// ============================================

/** Clé d'idempotence acceptée : alphanumérique, `_` et `-`, 100 caractères max. */
function isValidIdempotencyKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 100 && /^[A-Za-z0-9_-]+$/.test(key);
}

/** Identifiant de document déterministe pour (uid, enfant, clé d'idempotence). */
function idempotentEventId(uid, childId, key) {
  const hash = crypto.createHash("sha256").update(`${uid}\u0000${childId}\u0000${key}`).digest("hex");
  return `idem_${hash.slice(0, 40)}`;
}

/** Event fields validateAndUpdateEvent never lets a client change. */
const IMMUTABLE_EVENT_FIELDS = ["id", "userId", "childId", "createdAt", "reported", "idempotencyKey"];

module.exports = {
  IDEM_TOMBSTONE_RETENTION_MS,
  IMMUTABLE_EVENT_FIELDS,
  idempotentEventId,
  isValidIdempotencyKey,
};
