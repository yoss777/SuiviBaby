const admin = require("firebase-admin");
const { setGlobalOptions } = require("firebase-functions/v2");

// Every function runs in the EU unless it says otherwise (only the legacy US
// bucket mirrors do). Without this, a function without an explicit region
// silently landed in us-central1 (SUIVI_ACTIONS 4.5 / D9).
setGlobalOptions({ region: "europe-west1" });

admin.initializeApp();

// Entry point only: every Cloud Function lives in src/<domain>/ and is
// re-exported here under its deployed name. Renaming or dropping an export
// deletes the deployed function, so __tests__/exportsSnapshot.test.js pins the
// full list (names, triggers, options). Helpers stay in their domain modules.

const sharingShareCodes = require("./src/sharing/shareCodes");
exports.cleanupExpiredShareCodes = sharingShareCodes.cleanupExpiredShareCodes;
exports.redeemShareCodeCF = sharingShareCodes.redeemShareCodeCF;

const sharingInvitations = require("./src/sharing/invitations");
exports.acceptInvitationCF = sharingInvitations.acceptInvitationCF;
exports.createShareInvitation = sharingInvitations.createShareInvitation;

const sharingRoles = require("./src/sharing/roles");
exports.createShareCode = sharingRoles.createShareCode;
exports.setMemberRole = sharingRoles.setMemberRole;

const eventsCallables = require("./src/events/callables");
exports.deleteEventCascade = eventsCallables.deleteEventCascade;
exports.validateAndCreateEvent = eventsCallables.validateAndCreateEvent;
exports.validateAndUpdateEvent = eventsCallables.validateAndUpdateEvent;

const voiceTranscribe = require("./src/voice/transcribe");
exports.transcribeAudio = voiceTranscribe.transcribeAudio;

const voiceAssemblyai = require("./src/voice/assemblyai");
exports.retryAssemblyAIDeletes = voiceAssemblyai.retryAssemblyAIDeletes;

const voiceParse = require("./src/voice/parse");
exports.parseVoiceCommand = voiceParse.parseVoiceCommand;

const billingUsage = require("./src/billing/usage");
exports.consumeUsageQuota = billingUsage.consumeUsageQuota;
exports.getUsageQuotaStatus = billingUsage.getUsageQuotaStatus;

const billingRevenuecat = require("./src/billing/revenuecat");
exports.cleanupExpiredSubscriptions = billingRevenuecat.cleanupExpiredSubscriptions;
exports.revenueCatWebhook = billingRevenuecat.revenueCatWebhook;

const billingReferral = require("./src/billing/referral");
exports.ensureReferralCode = billingReferral.ensureReferralCode;
exports.validateReferralCode = billingReferral.validateReferralCode;

const deletionConsent = require("./src/deletion/consent");
exports.recordHealthConsent = deletionConsent.recordHealthConsent;
exports.withdrawHealthConsent = deletionConsent.withdrawHealthConsent;

const deletionApple = require("./src/deletion/apple");
exports.registerAppleRevocation = deletionApple.registerAppleRevocation;

const deletionAccount = require("./src/deletion/account");
exports.cancelAccountDeletion = deletionAccount.cancelAccountDeletion;
exports.deleteUserAccount = deletionAccount.deleteUserAccount;
exports.processScheduledDeletions = deletionAccount.processScheduledDeletions;
exports.requestAccountDeletion = deletionAccount.requestAccountDeletion;
exports.sendDeletionRequestEmail = deletionAccount.sendDeletionRequestEmail;

const deletionChild = require("./src/deletion/child");
exports.cancelChildDeletion = deletionChild.cancelChildDeletion;
exports.createDeletionRequest = deletionChild.createDeletionRequest;
exports.getOwnershipBlockers = deletionChild.getOwnershipBlockers;
exports.purgeDeletedChildren = deletionChild.purgeDeletedChildren;
exports.transferAndLeave = deletionChild.transferAndLeave;
exports.voteDeletionRequest = deletionChild.voteDeletionRequest;

const notificationsReminders = require("./src/notifications/reminders");
exports.checkAndSendReminders = notificationsReminders.checkAndSendReminders;

const notificationsRecap = require("./src/notifications/recap");
exports.sendWeeklyRecap = notificationsRecap.sendWeeklyRecap;
exports.unsubscribeRecap = notificationsRecap.unsubscribeRecap;

const moderationReports = require("./src/moderation/reports");
exports.handleReportCreated = moderationReports.handleReportCreated;
exports.onReportCreated = moderationReports.onReportCreated;
exports.resolveReport = moderationReports.resolveReport;
exports.submitContentReportCF = moderationReports.submitContentReportCF;

const adminClaims = require("./src/admin/claims");
exports.setAdminClaim = adminClaims.setAdminClaim;

const adminMaintenance = require("./src/admin/maintenance");
exports.reconcileAccessIndexNightly = adminMaintenance.reconcileAccessIndexNightly;

const mediaPhotos = require("./src/media/photos");
exports.deletePhotoThumbnail = mediaPhotos.deletePhotoThumbnail;
exports.generatePhotoThumbnail = mediaPhotos.generatePhotoThumbnail;
exports.mirrorLegacyPhotoDelete = mediaPhotos.mirrorLegacyPhotoDelete;
exports.mirrorLegacyPhotoUpload = mediaPhotos.mirrorLegacyPhotoUpload;

const sharedPhotos = require("./src/shared/photos");
exports.photoRefToPath = sharedPhotos.photoRefToPath;

// Widget « Bébé maintenant » en temps réel (plan-temps-reel.md, E5) :
// désactivé tant que app_config/widgetPush.enabled n'est pas true.
const widgetFanout = require("./src/widget/fanout");
exports.onWidgetEventWrite = widgetFanout.onWidgetEventWrite;
exports.onWidgetLiveWrite = widgetFanout.onWidgetLiveWrite;
