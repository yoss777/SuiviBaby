const admin = require("firebase-admin");

/** Operational logs (notification/recap history, webhook logs) live 90 days (TTL on expireAt). */
const LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const logExpireAt = () => admin.firestore.Timestamp.fromMillis(Date.now() + LOG_RETENTION_MS);

module.exports = {
  logExpireAt,
};
