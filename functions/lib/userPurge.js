// Collections that hold a user's data, used by purgeUserData (index.js) when
// an account is deleted (audit A3). __tests__/purgeCoverage.test.js fails if a
// collection used by the code or the rules is missing from these lists and
// from its list of non-personal collections.

/** Author id kept on events of shared children once their author is deleted. */
const DELETED_USER_ID = "deleted-user";

/**
 * Every collection holding a user's data, found by a field equal to the uid.
 */
const USER_DATA_BY_FIELD = [
  ["eventLikes", "userId"],
  ["eventComments", "userId"],
  ["babyAttachmentRequests", "userId"],
  ["shareCodes", "createdBy"],
  ["device_tokens", "userId"],
  ["notification_history", "userId"],
  ["recap_history", "userId"],
  ["webhook_logs", "appUserId"],
  ["referrals", "parrainUid"],
  ["referrals", "filleulUid"],
  ["referral_codes", "uid"],
  ["childDeletionRequests", "requestedBy"],
  ["user_hidden_photos", "userId"],
  ["pending_assemblyai_deletes", "userId"],
  ["voice_transcribe_cache", "uid"],
  ["reports", "reporterUserId"],
];

/** Documents whose id is the uid. `users/{uid}` is deleted last, separately. */
const USER_DOCS_BY_ID = [
  "users_public",
  "user_preferences",
  "user_content",
  "user_promos",
  "subscriptions",
  "rate_limits",
  "usage_limits",
];

module.exports = { DELETED_USER_ID, USER_DATA_BY_FIELD, USER_DOCS_BY_ID };
