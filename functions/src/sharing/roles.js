const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { hasChildRole } = require("../../accessControl");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");
const { assertVerifiedEmail, isValidDocId } = require("../shared/validation");

// ============================================
// REFERRAL SYSTEM
// ============================================

// Sprint 12.6: roles (Parent/Proche) and share codes, server-side.
const roleHandlers = require("../../lib/roles").createRoleHandlers({
  admin, HttpsError, checkRateLimit, monitorAppCheck, assertVerifiedEmail, isValidDocId, hasChildRole,
});
const setMemberRole = onCall(withAppCheck({ region: "europe-west1" }), roleHandlers.setMemberRole);
const createShareCode = onCall(withAppCheck({ region: "europe-west1" }), roleHandlers.createShareCode);

module.exports = {
  createShareCode,
  setMemberRole,
};
