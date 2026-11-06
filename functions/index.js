const admin = require("firebase-admin");
const { Buffer } = require("node:buffer");
const crypto = require("node:crypto");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onObjectFinalized, onObjectDeleted } = require("firebase-functions/v2/storage");
const { defineSecret } = require("firebase-functions/params");

// Every function runs in the EU unless it says otherwise (only the legacy US
// bucket mirrors do). Without this, a function without an explicit region
// silently landed in us-central1 (SUIVI_ACTIONS 4.5 / D9).
setGlobalOptions({ region: "europe-west1" });

const { Expo } = require("expo-server-sdk");
const { Resend } = require("resend");
const { buildRecapHTML } = require("./emailTemplates");
const { hasChildRole } = require("./accessControl");

// Rôle contributor (miroir de DEFAULT_ROLE_PERMISSIONS côté app) : likes et
// commentaires sur les photos uniquement, aucune écriture d'événement.
const CONTRIBUTOR_PERMISSIONS = Object.freeze({
  canWriteEvents: false,
  canWriteLikes: true,
  canWriteComments: true,
});
const VOICE_ENUMS = require("./lib/enums");
const voiceParse = require("./lib/voiceParse");
const Anthropic = require("@anthropic-ai/sdk").default;
const appleAuth = require("./lib/appleAuth");

admin.initializeApp();

const BATCH_LIMIT = 450;
const CHILD_DELETION_RETENTION_DAYS = 30;
/** Operational logs (notification/recap history, webhook logs) live 90 days (TTL on expireAt). */
const LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const logExpireAt = () => admin.firestore.Timestamp.fromMillis(Date.now() + LOG_RETENTION_MS);
const DELETION_REQUEST_EXPIRY_DAYS = 7;
const APP_CHECK_ENFORCED = process.env.APPCHECK_ENFORCE === "true";
const expo = new Expo();
const FREE_DAILY_VOICE_LIMIT = 3;
const FREE_TOTAL_PDF_EXPORTS = 1;
const FREE_MAX_SHARED_USERS = 2;

// Photos migrate from the US default bucket to an EU bucket
// (docs/MIGRATION_PHOTOS_EU.md). Until the legacy bucket is deleted, every
// deletion must hit both so no copy survives in either region.
const PHOTOS_BUCKET = "samaye-53723-photos-eu";
const LEGACY_PHOTOS_BUCKET = "samaye-53723.firebasestorage.app";
const PHOTO_BUCKETS = [PHOTOS_BUCKET, LEGACY_PHOTOS_BUCKET];

// Sign in with Apple key (Apple Developer > Keys). Bound only to the functions
// that call Apple: registerAppleRevocation and every caller of purgeUserData.
const APPLE_TEAM_ID = defineSecret("APPLE_TEAM_ID");
const APPLE_KEY_ID = defineSecret("APPLE_KEY_ID");
const APPLE_PRIVATE_KEY = defineSecret("APPLE_PRIVATE_KEY");
const APPLE_SECRETS = [APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY];
// HMAC key of the weekly recap unsubscribe links.
const RECAP_UNSUBSCRIBE_SECRET = defineSecret("RECAP_UNSUBSCRIBE_SECRET");

/** Version of the privacy policy the health data consent refers to (public/privacy.html). */
const HEALTH_CONSENT_VERSION = "2.2";
/** Proof of consent is kept this long after the account is deleted. */
const CONSENT_RETENTION_YEARS = 5;

/** Public URL of an europe-west1 HTTPS function of this project. */
const FUNCTIONS_BASE_URL = "https://europe-west1-samaye-53723.cloudfunctions.net";

/** Reads a secret from the environment without the SDK warning when it is unset. */
function secretValue(secret) {
  return process.env[secret.name] || "";
}

/** Apple key material, or null when the secrets are not configured. */
function getAppleCredentials() {
  const teamId = secretValue(APPLE_TEAM_ID);
  const keyId = secretValue(APPLE_KEY_ID);
  const privateKey = secretValue(APPLE_PRIVATE_KEY);
  // A placeholder value (secret created before the Apple key exists) counts as unset.
  const looksLikeKey = privateKey.includes("PRIVATE KEY");
  return teamId && keyId && looksLikeKey ? { teamId, keyId, privateKey } : null;
}

/** Deletes one photo path from every photo bucket. Missing objects are ignored. */
async function deletePhotoEverywhere(path) {
  await Promise.all(
    PHOTO_BUCKETS.map((name) =>
      admin.storage().bucket(name).file(path).delete({ ignoreNotFound: true }),
    ),
  );
}

/**
 * Storage path of a photo ref: legacy full download URL or plain `children/...`
 * path. Returns null for anything that is not strictly inside `children/`
 * (traversal, other folders, malformed encoding). With `childId`, the path
 * must also sit inside `children/{childId}/`.
 */
function photoRefToPath(ref, childId) {
  if (typeof ref !== "string" || !ref) return null;
  let path = ref;
  if (ref.startsWith("https://firebasestorage.googleapis.com/")) {
    const match = ref.match(/\/o\/([^?]+)/);
    if (!match) return null;
    try {
      path = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  if (!path.startsWith("children/") || path.includes("..")) return null;
  if (childId !== undefined && !path.startsWith(`children/${childId}/`)) return null;
  return path;
}

/** Escapes text before it is interpolated into HTML (e-mails to the team or to users). */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sharing someone's child (invitations, share codes) and administering the app
 * require an e-mail address the account really owns: an unverified password
 * account can claim any address (sprint 4.10).
 */
function assertVerifiedEmail(request) {
  if (request.auth?.token?.email_verified !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Vérifiez votre adresse e-mail pour continuer.",
      { reason: "email-not-verified" },
    );
  }
}

/** Firestore document ids the app generates: no slash, no dot, bounded length. */
function isValidDocId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * Deletes the photos a user attached to events (including events of children
 * shared with other parents, which survive the account deletion).
 */
async function deleteUserEventPhotos(db, uid) {
  const snap = await db.collection("events").where("userId", "==", uid).get();
  const paths = new Set();
  snap.docs.forEach((doc) => {
    const { childId, photos } = doc.data();
    if (!childId) return;
    // events.photos is written by clients: only delete files of the event's
    // own child folder, never a path pointing at another child's photos.
    (Array.isArray(photos) ? photos : []).forEach((ref) => {
      const path = photoRefToPath(ref, childId);
      if (path) paths.add(path);
    });
  });
  const results = await Promise.allSettled([...paths].map((path) => deletePhotoEverywhere(path)));
  const failed = results.filter((r) => r.status === "rejected").length;
  // Throw rather than continue: the events are the only pointers to these
  // files, deleting them now would leave unreachable photos (audit A3).
  if (failed > 0) throw new Error(`${failed}/${paths.size} user photos could not be deleted`);
  return paths.size;
}

/** Deletes every file under children/{childId}/ in every photo bucket; returns the count. */
async function deleteChildPhotosEverywhere(childId) {
  let deleted = 0;
  let failed = 0;
  for (const name of PHOTO_BUCKETS) {
    // One bucket failing must not leave the other untouched.
    try {
      const [files] = await admin.storage().bucket(name).getFiles({ prefix: `children/${childId}/` });
      const results = await Promise.allSettled(files.map((file) => file.delete()));
      failed += results.filter((r) => r.status === "rejected").length;
      deleted += files.length;
    } catch (error) {
      failed += 1;
      console.error(`deleteChildPhotosEverywhere: listing ${name} failed for ${childId}`, error?.message ?? error);
    }
  }
  if (failed > 0) throw new Error(`${failed} photos of child ${childId} could not be deleted`);
  return deleted;
}

// ============================================
// SHARED HELPERS
// ============================================

/**
 * Rate limiting réutilisable — vérifie par bucket séparé.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @param {string} bucket - Nom du bucket (ex: "transcribe", "events", "delete")
 * @param {number} maxPerMinute
 */
async function checkRateLimit(db, uid, bucket, maxPerMinute) {
  const rateLimitRef = db.doc(`rate_limits/${uid}`);
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const bucketKey = `${bucket}_timestamps`;

  // Lecture + écriture dans une transaction : sans elle, N appels parallèles
  // lisaient tous le même compteur et passaient tous sous la limite.
  await db.runTransaction(async function rateLimitTxn(tx) {
    const rateLimitDoc = await tx.get(rateLimitRef);
    const data = rateLimitDoc.exists ? rateLimitDoc.data() : {};
    const recentRequests = (data[bucketKey] || []).filter((t) => t > oneMinuteAgo);

    if (recentRequests.length >= maxPerMinute) {
      throw new HttpsError(
        "resource-exhausted",
        "Trop de requêtes. Réessayez dans une minute."
      );
    }

    tx.set(rateLimitRef, { [bucketKey]: [...recentRequests, now] }, { merge: true });
  });
}

/**
 * App Check monitoring.
 *
 * L'enforcement est piloté par APPCHECK_ENFORCE=true au déploiement.
 * Le client prépare maintenant les tokens via Firebase JS SDK + CustomProvider,
 * alimenté par RNFirebase App Check en natif et reCAPTCHA sur le web.
 *
 * Tant que les fichiers natifs Firebase / clés App Check ne sont pas fournis
 * puis redéployés côté app, laisser APPCHECK_ENFORCE=false évite de bloquer
 * les appels légitimes.
 */
function monitorAppCheck(request, functionName) {
  if (request.app) {
    console.log(`[AppCheck] ${functionName}: VERIFIED (uid: ${request.auth?.uid})`);
  } else {
    // En mode non-enforce, logger en warn pour pouvoir tracker le ratio
    // avant d'activer l'enforcement. Vérifier dans Cloud Functions logs
    // que 100% des requêtes sont VERIFIED avant de passer APPCHECK_ENFORCE=true.
    console.warn(`[AppCheck] ${functionName}: UNVERIFIED (uid: ${request.auth?.uid}) — enforcement=${APP_CHECK_ENFORCED}`);
  }
}

function withAppCheck(options) {
  if (!APP_CHECK_ENFORCED) {
    return options;
  }

  return {
    ...options,
    enforceAppCheck: true,
  };
}

/**
 * Supprime des documents par champ en batches de BATCH_LIMIT.
 */
async function deleteDocsByFieldBatched(db, collectionName, field, value) {
  let totalDeleted = 0;
  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where(field, "==", value)
      .limit(BATCH_LIMIT)
      .get();

    if (snapshot.empty) return totalDeleted;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
    if (snapshot.size < BATCH_LIMIT) return totalDeleted;
  }
}

/**
 * Supprime toutes les données d'un enfant (événements, social, partage, legacy).
 */
async function deleteChildDataBatched(db, childId) {
  // Storage photos first: once the events are gone nothing references them.
  // A failure stops here (nothing else deleted yet); the caller's scheduled
  // job retries on its next run instead of leaving orphan photos (audit A3).
  await deleteChildPhotosEverywhere(childId);

  // Main + social
  await Promise.all([
    deleteDocsByFieldBatched(db, "events", "childId", childId),
    deleteDocsByFieldBatched(db, "eventLikes", "childId", childId),
    deleteDocsByFieldBatched(db, "eventComments", "childId", childId),
  ]);

  // Sharing + requests
  await Promise.all([
    deleteDocsByFieldBatched(db, "shareCodes", "childId", childId),
    deleteDocsByFieldBatched(db, "shareInvitations", "childId", childId),
    deleteDocsByFieldBatched(db, "babyAttachmentRequests", "childId", childId),
  ]);

  // Notification and weekly recap histories (contain health figures)
  await Promise.all([
    deleteDocsByFieldBatched(db, "notification_history", "childId", childId),
    deleteDocsByFieldBatched(db, "recap_history", "childId", childId),
  ]);

  // Legacy collections
  const legacyCollections = [
    "tetees", "pompages", "mictions", "selles", "vitamines", "vaccins", "croissances", "sommeils",
  ];
  await Promise.all(
    legacyCollections.map((coll) => deleteDocsByFieldBatched(db, coll, "childId", childId))
  );

  // B2.2 — content reports liés à l'enfant. Avant : restaient indéfiniment
  // après suppression de l'enfant, contenant raison/photoPath/reporterUid
  // (données sensibles potentiellement). Maintenant purgés en cascade.
  await deleteDocsByFieldBatched(db, "reports", "childId", childId);

  // Access subcollection
  const accessSnap = await db.collection("children").doc(childId).collection("access").get();
  if (!accessSnap.empty) {
    const batch = db.batch();
    accessSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // user_child_access index entries for this child
  await deleteDocsByFieldBatched(db, "user_child_access", "childId", childId);
}

// ============================================
// ACCOUNT PURGE (audit A3)
// ============================================

const { DELETED_USER_ID, USER_DATA_BY_FIELD, USER_DOCS_BY_ID } = require("./lib/userPurge");

/** Updates in batches every document of `collectionName` where field == value. */
async function updateDocsByFieldBatched(db, collectionName, field, value, patch) {
  let total = 0;
  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where(field, "==", value)
      .limit(BATCH_LIMIT)
      .get();
    if (snapshot.empty) return total;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.update(doc.ref, patch));
    await batch.commit();
    total += snapshot.size;
    if (snapshot.size < BATCH_LIMIT) return total;
  }
}

/** After this many failed revocations the purge goes on (STUCK_APPLE_REVOKE alert). */
const MAX_APPLE_REVOKE_FAILURES = 5;

/**
 * Revokes the user's Sign in with Apple refresh token (apple_tokens/{uid}).
 * No token: nothing to do. Success: returns, the caller deletes the doc with
 * the other by-id documents. Failure: the doc is kept with an incremented
 * `revokeFailures` and the function throws, so the cron retries the whole
 * purge. At MAX_APPLE_REVOKE_FAILURES it logs STUCK_APPLE_REVOKE and returns
 * (the purge goes on and the token doc is deleted).
 */
async function revokeAppleToken(db, uid) {
  const ref = db.doc(`apple_tokens/${uid}`);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  const refreshToken = data?.refreshToken;
  if (!refreshToken) return;

  let failure = null;
  try {
    const creds = getAppleCredentials();
    if (!creds) throw new Error("Apple secrets missing");
    await appleAuth.revokeRefreshToken(creds, refreshToken);
  } catch (e) {
    failure = e;
  }
  if (!failure) return;

  const failures = (Number(data.revokeFailures) || 0) + 1;
  const reason = String(failure?.message ?? failure).slice(0, 300);
  if (failures >= MAX_APPLE_REVOKE_FAILURES) {
    console.error(
      `purgeUserData: STUCK_APPLE_REVOKE uid=${uid} failures=${failures}, token NOT revoked at Apple, purge goes on`,
      reason
    );
    return;
  }
  await ref.update({
    revokeFailures: admin.firestore.FieldValue.increment(1),
    lastRevokeError: reason,
    lastRevokeAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  throw new Error(`Apple revocation failed (${failures}/${MAX_APPLE_REVOKE_FAILURES}): ${reason}`);
}

/**
 * Deletes everything about a user, in an order that can be retried:
 *   1. their event photos (a failure stops before anything is deleted);
 *   2. their children: deleted when they were the only member, otherwise
 *      ownership transferred or their access removed;
 *   3. events they wrote in children shared with others: kept for the other
 *      parent but anonymised (author removed, photos already deleted);
 *   4. Apple token revocation (a failure throws, retried by the cron, until
 *      MAX_APPLE_REVOKE_FAILURES), withdrawal record + consent proof kept 5
 *      years (expireAt), then every
 *      collection of USER_DATA_BY_FIELD / USER_DOCS_BY_ID, invitations;
 *   5. Firebase Auth (a failure other than "already gone" throws: the caller
 *      keeps users/{uid} so the next run retries);
 *   6. users/{uid} last.
 * Returns { email } for the confirmation e-mail, sent by the caller only after
 * this resolves.
 */
async function purgeUserData(db, uid) {
  let email = "";
  try {
    const userRecord = await admin.auth().getUser(uid);
    email = (userRecord.email || "").toLowerCase();
  } catch (e) {
    if (e?.code !== "auth/user-not-found") throw e;
  }

  // 0. Lock the account so nothing recreates data during the purge
  //    (app sessions, callables). A webhook arriving now is skipped later
  //    since Auth is checked before writing.
  try {
    await admin.auth().updateUser(uid, { disabled: true });
    await admin.auth().revokeRefreshTokens(uid);
  } catch (e) {
    if (e?.code !== "auth/user-not-found") throw e;
  }

  // 1. Photos while the events that reference them still exist.
  await deleteUserEventPhotos(db, uid);

  // 2. Children.
  const accessSnapshot = await db
    .collection("user_child_access")
    .where("userId", "==", uid)
    .get();
  for (const accessDoc of accessSnapshot.docs) {
    const { childId } = accessDoc.data();
    if (childId) {
      const childAccessSnap = await db
        .collection("children").doc(childId).collection("access")
        .get();
      const isMember = childAccessSnap.docs.some((d) => d.id === uid);
      // The role comes from the access document: the user_child_access index
      // written by the app carries no role.
      const role = childAccessSnap.docs.find((d) => d.id === uid)?.data()?.role;
      const isAlone = isMember && childAccessSnap.docs.every((d) => d.id === uid);
      if (isAlone) {
        // Child document first: if a later step fails, the retry still finds
        // the child through the index and the access entry.
        await db.doc(`children/${childId}`).delete();
        await deleteChildDataBatched(db, childId);
      } else if (isMember) {
        // Transfer only while the user is still the recorded owner: on a retry
        // after a transfer, promoting someone else would create two owners.
        const childSnap = await db.doc(`children/${childId}`).get();
        if (role === "owner" && childSnap.exists && !childSnap.data()?.deletedAt && childSnap.data()?.ownerId === uid) {
          await transferOwnership(db, childId, uid, childAccessSnap);
        }
        await db.doc(`children/${childId}/access/${uid}`).delete();
      }
      // Not a member any more (an earlier run removed the access): only the
      // index entry is left. Never delete a child other members still use.
    }
    await accessDoc.ref.delete();
  }

  // 3. Events left are in children shared with others.
  await updateDocsByFieldBatched(db, "events", "userId", uid, {
    userId: DELETED_USER_ID,
    photos: admin.firestore.FieldValue.delete(),
  });

  // 4. Everything else about the user.
  // Apple requires the Sign in with Apple token to be revoked at account
  // deletion: a failure throws (the cron retries) until the failure cap.
  await revokeAppleToken(db, uid);
  // Proof of consent is kept 5 years (GDPR art. 7.1): TTL on expireAt deletes it.
  const consentExpireAt = new Date();
  consentExpireAt.setFullYear(consentExpireAt.getFullYear() + CONSENT_RETENTION_YEARS);
  const consentExpireTs = admin.firestore.Timestamp.fromDate(consentExpireAt);
  // The patch keeps `uid`, so the query would match the same docs again:
  // read them once and update in chunks instead of updateDocsByFieldBatched.
  const consentSnap = await db.collection("consent_records").where("uid", "==", uid).get();
  // The account deletion withdraws the consent: record it once (a retry must
  // not append a second one), with the same expireAt as the others.
  if (!consentSnap.docs.some((d) => d.data()?.reason === "account_deleted")) {
    await db.collection("consent_records").add({
      uid,
      type: "health_data",
      granted: false,
      reason: "account_deleted",
      withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt: consentExpireTs,
    });
  }
  for (let i = 0; i < consentSnap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    consentSnap.docs.slice(i, i + BATCH_LIMIT).forEach((doc) =>
      batch.update(doc.ref, { expireAt: consentExpireTs })
    );
    await batch.commit();
  }
  // Child deletion requests the user made must outlive the account (the
  // scheduled purge of the soft-deleted child depends on them): anonymise
  // instead of deleting.
  await updateDocsByFieldBatched(db, "childDeletionRequests", "requestedBy", uid, {
    requestedBy: DELETED_USER_ID,
    requestedByEmail: "",
  });
  await Promise.all(
    USER_DATA_BY_FIELD.map(([collectionName, field]) =>
      deleteDocsByFieldBatched(db, collectionName, field, uid)
    )
  );
  if (email) {
    await Promise.all([
      deleteDocsByFieldBatched(db, "shareInvitations", "inviterEmail", email),
      deleteDocsByFieldBatched(db, "shareInvitations", "invitedEmail", email),
    ]);
  }
  await Promise.all([
    deleteDocsByFieldBatched(db, "shareInvitations", "inviterId", uid),
    deleteDocsByFieldBatched(db, "shareInvitations", "invitedUserId", uid),
  ]);
  const batch = db.batch();
  USER_DOCS_BY_ID.forEach((collectionName) => batch.delete(db.doc(`${collectionName}/${uid}`)));
  await batch.commit();
  // adminAuditLog is kept on purpose: investigation trail, see deleteUserAccount.

  // 5. Auth, then 6. the user document that carries pendingDeletion.
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    if (e?.code !== "auth/user-not-found") throw e;
  }
  await db.doc(`users/${uid}`).delete();

  return { email };
}

/** Resend reports refusals (unverified domain, quota…) in the result. */
async function sendEmailOrThrow(resend, payload) {
  const result = await resend.emails.send(payload);
  if (result?.error) {
    throw new Error(`Resend: ${result.error.name ?? "error"} ${result.error.message ?? ""}`.trim());
  }
  return result;
}

async function getSubscriptionState(db, uid) {
  return subscriptionStateFrom(await db.doc(`subscriptions/${uid}`).get());
}

function subscriptionStateFrom(snap) {
  const data = snap.exists ? snap.data() : {};

  return {
    tier: data.tier || "free",
    status: data.status || "active",
    grandfathered: data.grandfathered === true || data.status === "grandfathered",
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
  };
}

// Une annulation (ou un incident de paiement, pendant la période de grâce
// des stores) ne coupe pas l'accès : l'abonné garde Premium jusqu'à la fin
// de la période déjà payée (expiresAt). EXPIRATION repasse ensuite en free.
function isEntitledStatus(subscriptionState, nowMs = Date.now()) {
  const { status, expiresAt } = subscriptionState;
  if (status === "active" || status === "trial") return true;
  if (status === "cancelled" || status === "billing_issue") {
    const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
    return Number.isFinite(expiresMs) && expiresMs > nowMs;
  }
  return false;
}

function hasUnlimitedFeature(subscriptionState, feature) {
  if (!subscriptionState) return false;

  if (subscriptionState.grandfathered) {
    return true;
  }

  const isPaidTier =
    subscriptionState.tier === "premium" || subscriptionState.tier === "family";
  const isActiveStatus = isEntitledStatus(subscriptionState);

  if (!isPaidTier || !isActiveStatus) {
    return false;
  }

  if (feature === "sharing") {
    return subscriptionState.tier === "family" || subscriptionState.tier === "premium";
  }

  return true;
}

async function getVoiceQuotaStatus(db, uid) {
  const subscriptionState = await getSubscriptionState(db, uid);

  if (hasUnlimitedFeature(subscriptionState, "voice")) {
    return {
      feature: "voice",
      allowed: true,
      isUnlimited: true,
      used: 0,
      limit: null,
      remaining: null,
      resetDate: null,
    };
  }

  const usageRef = db.doc(`usage_limits/${uid}`);
  const usageDoc = await usageRef.get();
  const usageData = usageDoc.exists ? usageDoc.data() : {};
  const today = new Date().toISOString().split("T")[0];
  const used =
    usageData.voiceCommandDate === today ? usageData.voiceCommandCount || 0 : 0;

  return {
    feature: "voice",
    allowed: used < FREE_DAILY_VOICE_LIMIT,
    isUnlimited: false,
    used,
    limit: FREE_DAILY_VOICE_LIMIT,
    remaining: Math.max(0, FREE_DAILY_VOICE_LIMIT - used),
    resetDate: today,
  };
}

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

/**
 * Refund a previously-reserved voice quota slot. Called when the downstream
 * AssemblyAI pipeline fails after we have already incremented the counter.
 * Best-effort: a refund failure is logged but does not surface to the user —
 * the original error from AssemblyAI matters more than a lost quota slot.
 */
async function refundVoiceQuota(db, uid) {
  try {
    const usageRef = db.doc(`usage_limits/${uid}`);
    await db.runTransaction(async (tx) => {
      const usageDoc = await tx.get(usageRef);
      if (!usageDoc.exists) return;
      const usageData = usageDoc.data() ?? {};
      const today = new Date().toISOString().split("T")[0];
      // Only refund if the reservation is from today — older counters have
      // already been reset by the date check in reserveVoiceQuota.
      if (usageData.voiceCommandDate !== today) return;
      const current = usageData.voiceCommandCount || 0;
      if (current <= 0) return;
      tx.update(usageRef, {
        voiceCommandCount: current - 1,
        lastVoiceQuotaRefundAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    console.error(`refundVoiceQuota failed for uid=${uid}:`, err?.message ?? err);
  }
}

async function reserveVoiceQuota(db, uid) {
  const subscriptionState = await getSubscriptionState(db, uid);

  if (hasUnlimitedFeature(subscriptionState, "voice")) {
    return {
      feature: "voice",
      allowed: true,
      isUnlimited: true,
      used: 0,
      limit: null,
      remaining: null,
      resetDate: null,
    };
  }

  const usageRef = db.doc(`usage_limits/${uid}`);
  return await db.runTransaction(async (tx) => {
    const usageDoc = await tx.get(usageRef);
    const usageData = usageDoc.exists ? usageDoc.data() : {};
    const today = new Date().toISOString().split("T")[0];
    const used =
      usageData.voiceCommandDate === today ? usageData.voiceCommandCount || 0 : 0;

    if (used >= FREE_DAILY_VOICE_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        `Limite quotidienne atteinte (${FREE_DAILY_VOICE_LIMIT} commandes vocales/jour). Passez en Premium pour un usage illimité.`
      );
    }

    tx.set(
      usageRef,
      {
        voiceCommandDate: today,
        voiceCommandCount: used + 1,
        lastVoiceCommandAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      feature: "voice",
      allowed: true,
      isUnlimited: false,
      used: used + 1,
      limit: FREE_DAILY_VOICE_LIMIT,
      remaining: Math.max(0, FREE_DAILY_VOICE_LIMIT - (used + 1)),
      resetDate: today,
    };
  });
}

async function getExportQuotaStatus(db, uid) {
  const subscriptionState = await getSubscriptionState(db, uid);

  if (hasUnlimitedFeature(subscriptionState, "export")) {
    return {
      feature: "export",
      allowed: true,
      isUnlimited: true,
      used: 0,
      limit: null,
      remaining: null,
      resetDate: null,
    };
  }

  const usageRef = db.doc(`usage_limits/${uid}`);
  const usageDoc = await usageRef.get();
  const usageData = usageDoc.exists ? usageDoc.data() : {};
  const used = usageData.pdfExportCount || 0;

  return {
    feature: "export",
    allowed: used < FREE_TOTAL_PDF_EXPORTS,
    isUnlimited: false,
    used,
    limit: FREE_TOTAL_PDF_EXPORTS,
    remaining: Math.max(0, FREE_TOTAL_PDF_EXPORTS - used),
    resetDate: null,
  };
}

async function getSharingQuotaStatus(db, uid, childId) {
  const subscriptionState = await getSubscriptionState(db, uid);

  if (hasUnlimitedFeature(subscriptionState, "sharing")) {
    return {
      feature: "sharing",
      allowed: true,
      isUnlimited: true,
      used: 0,
      limit: null,
      remaining: null,
      resetDate: null,
    };
  }

  const [childAccessSnapshot, pendingInvitesSnapshot] = await Promise.all([
    db.collection(`children/${childId}/access`).get(),
    db
      .collection("shareInvitations")
      .where("childId", "==", childId)
      .where("status", "==", "pending")
      .get(),
  ]);

  const linkedCoparents = childAccessSnapshot.docs.filter((docSnap) => {
    const accessData = docSnap.data();
    return accessData.role !== "owner";
  }).length;
  const pendingInvites = pendingInvitesSnapshot.size;
  const used = linkedCoparents + pendingInvites;

  return {
    feature: "sharing",
    allowed: used < FREE_MAX_SHARED_USERS,
    isUnlimited: false,
    used,
    limit: FREE_MAX_SHARED_USERS,
    remaining: Math.max(0, FREE_MAX_SHARED_USERS - used),
    resetDate: null,
  };
}

/**
 * Transfère la propriété d'un enfant quand son owner quitte (purge du compte).
 * Seuls un autre owner (co-owner) puis, à défaut, un admin peuvent hériter :
 * jamais un contributor ni un viewer. Départage : grantedAt le plus ancien.
 * Sans candidat, personne n'est promu et l'enfant n'est jamais laissé sans
 * propriétaire : il est soft-deleted (délai de grâce standard, purgé ensuite
 * par purgeDeletedChildren), les membres perdent l'accès comme pour une
 * suppression normale.
 * L'appelant supprime ensuite l'accès de l'owner sortant.
 */
async function transferOwnership(db, childId, currentOwnerId, childAccessSnapshot) {
  const rolePriority = { owner: 0, admin: 1 };
  const candidates = childAccessSnapshot.docs
    .filter((d) => d.id !== currentOwnerId && d.data()?.role in rolePriority)
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const rA = rolePriority[a.role];
      const rB = rolePriority[b.role];
      if (rA !== rB) return rA - rB;
      const tA = a.grantedAt?.toMillis?.() ?? 0;
      const tB = b.grantedAt?.toMillis?.() ?? 0;
      return tA - tB;
    });

  if (candidates.length === 0) {
    // Reuse an approved request left by an interrupted run, else create one.
    const existing = await db
      .collection("childDeletionRequests")
      .where("childId", "==", childId)
      .where("status", "==", "approved")
      .limit(1)
      .get();
    let requestId;
    if (!existing.empty) {
      requestId = existing.docs[0].id;
    } else {
      const now = admin.firestore.Timestamp.now();
      const ref = await db.collection("childDeletionRequests").add({
        childId,
        childName: "",
        // Anonymous on purpose: the purge of the leaving user's data would
        // delete a request they "requested", and purgeDeletedChildren needs it.
        requestedBy: DELETED_USER_ID,
        requestedByEmail: "",
        requestedAt: now,
        status: "approved",
        approvedAt: now,
        reason: "last_owner_account_deleted",
        ownerVotes: {},
        ownerIds: [], // nobody left to be notified or to vote
        retentionDays: CHILD_DELETION_RETENTION_DAYS,
        seenByUserIds: [],
      });
      requestId = ref.id;
    }
    await softDeleteChild(db, childId, requestId, DELETED_USER_ID);
    console.error(
      `transferOwnership: child ${childId} has no eligible owner (no co-owner or admin) after uid=${currentOwnerId} left: soft-deleted, purged after the grace period`
    );
    return;
  }

  const newOwner = candidates[0];
  const batch = db.batch();

  batch.update(db.doc(`children/${childId}`), { ownerId: newOwner.id });
  if (newOwner.role !== "owner") {
    batch.update(db.doc(`children/${childId}/access/${newOwner.id}`), {
      role: "owner",
      canWriteEvents: true,
      canWriteLikes: true,
      canWriteComments: true,
      grantedBy: newOwner.id,
      grantedAt: admin.firestore.Timestamp.now(),
    });
  }

  await batch.commit();
}

exports.cleanupExpiredShareCodes = onSchedule("every 24 hours", async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  let deleted = 0;
  let lastDoc = null;

  while (true) {
    let query = db
      .collection("shareCodes")
      .where("expiresAt", "<=", now)
      .orderBy("expiresAt")
      .limit(BATCH_LIMIT);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deleted += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];

    if (snapshot.size < BATCH_LIMIT) break;
  }

  console.log(`cleanupExpiredShareCodes: deleted ${deleted} docs`);
});

/**
 * cleanupExpiredSubscriptions — B4.S5.
 *
 * Force EXPIRATION sur les subscriptions dont expiresAt est dépassé mais
 * dont le status est toujours "active" (ou "cancelled" sans "expired"
 * follow-up). Garde-fou si RevenueCat oublie d'envoyer l'EXPIRATION
 * webhook (réseau, bug RC, etc.).
 *
 * NB : subscriptions.expiresAt est stocké en ISO string par revenueCatWebhook.
 * Pas de query Firestore directe par expiresAt < now (string compare peu
 * fiable). On scan les subs candidates par status, puis on filtre côté
 * code via Date.parse(). Coût accepté : 1 scan/jour avec un volume
 * subscriptions limité (≤ active user count).
 */
exports.cleanupExpiredSubscriptions = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1" },
  async () => {
    const db = admin.firestore();
    const nowMs = Date.now();
    let lastDoc = null;
    let flipped = 0;
    let scanned = 0;

    // Scan tous les subs avec status susceptible d'être stale.
    // Lifetime n'a pas d'expiresAt → on skip.
    const stalableStatuses = ["active", "cancelled", "billing_issue"];

    for (const status of stalableStatuses) {
      lastDoc = null;
      while (true) {
        let query = db
          .collection("subscriptions")
          .where("status", "==", status)
          .limit(BATCH_LIMIT);
        if (lastDoc) query = query.startAfter(lastDoc);

        const snap = await query.get();
        if (snap.empty) break;
        scanned += snap.size;

        const batch = db.batch();
        let batchCount = 0;
        for (const doc of snap.docs) {
          const data = doc.data();
          // Skip subs sans expiresAt (lifetime ou data incomplete).
          if (!data.expiresAt || typeof data.expiresAt !== "string") continue;
          const parsedMs = Date.parse(data.expiresAt);
          if (!Number.isFinite(parsedMs) || parsedMs > nowMs) continue;

          // Expired : flip à status=expired tier=free.
          batch.set(
            doc.ref,
            {
              status: "expired",
              tier: "free",
              updatedAt: admin.firestore.Timestamp.now(),
              lastEvent: "cleanupExpiredSubscriptions",
            },
            { merge: true }
          );
          batchCount++;
          flipped++;
        }
        if (batchCount > 0) await batch.commit();

        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < BATCH_LIMIT) break;
      }
    }

    console.log(
      `cleanupExpiredSubscriptions: scanned=${scanned}, flipped=${flipped} to expired`
    );
  }
);

/**
 * Awaited best-effort DELETE on an AssemblyAI transcript.
 * Returns true on success, false on any failure (network, non-2xx, timeout).
 * Bounded by a 3s timeout so it can't keep the parent CF hanging.
 */
async function deleteAssemblyAITranscript(transcriptId, apiKey, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      {
        method: "DELETE",
        headers: { authorization: apiKey },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new Error(`AssemblyAI DELETE returned status ${response.status}`);
    }
    return true;
  } catch (err) {
    console.warn(
      `deleteAssemblyAITranscript: failed for ${transcriptId}:`,
      err?.message ?? err
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queue a failed AssemblyAI delete for the retry scheduler. The doc id mirrors
 * the transcriptId so a duplicate enqueue is a no-op (idempotent on retry).
 *
 * T0.5 — userId attaché pour permettre la purge RGPD au delete user. Avant,
 * un transcriptId orphelin restait indéfiniment sans moyen de tracer son
 * propriétaire. La back-fill des anciens docs sans userId reste à faire en
 * one-shot (laisser tels quels = orphelins, ou supprimer-tous au cleanup mensuel).
 */
async function enqueueAssemblyAIDelete(db, transcriptId, reason, userId) {
  try {
    await db.doc(`pending_assemblyai_deletes/${transcriptId}`).set(
      {
        transcriptId,
        userId: userId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: admin.firestore.FieldValue.increment(0), // create field
        lastError: String(reason || "delete failed"),
      },
      { merge: true }
    );
  } catch (err) {
    console.error(
      `enqueueAssemblyAIDelete: could not queue ${transcriptId}:`,
      err?.message ?? err
    );
  }
}

/**
 * transcribeAudio — Proxy sécurisé pour AssemblyAI
 * - Auth obligatoire
 * - Rate limiting : max 10 requêtes/min/user
 * - Quota voix consommé côté serveur avant l'appel fournisseur coûteux
 */
exports.transcribeAudio = onCall(
  withAppCheck({
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: ["ASSEMBLYAI_API_KEY"],
    // S4-T4: keep one instance warm + allow batching so voice commands
    // don't pay a 3-8s cold start on Node 22. ~5€/month at current volume.
    concurrency: 30,
    minInstances: 1,
  }),
  async (request) => {
    // 1. Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "transcribeAudio");

    const uid = request.auth.uid;
    const { audioBase64, idempotencyKey } = request.data;

    if (!audioBase64 || typeof audioBase64 !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "audioBase64 est requis (string base64)."
      );
    }

    // Limit audio size (10MB base64 ≈ 7.5MB raw)
    if (audioBase64.length > 10 * 1024 * 1024) {
      throw new HttpsError(
        "invalid-argument",
        "Fichier audio trop volumineux (max 10MB)."
      );
    }

    // T3.3 — bottom bound: ~5KB base64 ≈ 3.7KB raw ≈ < 0.5s of HIGH_QUALITY
    // audio. Anything smaller is either a silent tap or a corrupted record.
    // Bail before consuming quota / hitting AssemblyAI. The client mirrors
    // this check on the file size so most empties never reach here, but
    // the server is the source of truth (quota gate sits behind this).
    if (audioBase64.length < 6_667) {
      throw new HttpsError(
        "invalid-argument",
        "Enregistrement trop court ou silencieux. Parlez plus fort ou plus longtemps."
      );
    }

    // Optional idempotency key: max 100 chars, alphanum/dash/underscore only.
    // Lets the client safely retry a flaky upload without double-charging the
    // user's daily quota or re-running AssemblyAI on the same audio.
    let safeIdempotencyKey = null;
    if (idempotencyKey !== undefined && idempotencyKey !== null) {
      if (typeof idempotencyKey !== "string" || idempotencyKey.length > 100 ||
          !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)) {
        throw new HttpsError(
          "invalid-argument",
          "idempotencyKey doit être une chaîne alphanumérique (max 100 caractères, _ et - autorisés)."
        );
      }
      safeIdempotencyKey = idempotencyKey;
    }

    const db = admin.firestore();
    const apiKey = process.env.ASSEMBLYAI_API_KEY;

    if (!apiKey) {
      throw new HttpsError(
        "internal",
        "AssemblyAI API key non configurée sur le serveur."
      );
    }

    // 2. Rate limiting — max 10 requêtes/min/user
    await checkRateLimit(db, uid, "transcribe", 10);

    // 3. Idempotency cache lookup — short-circuit if the client retried with
    // the same key within the TTL window (5 min). Cached response is returned
    // without re-consuming quota or hitting AssemblyAI.
    const TRANSCRIBE_CACHE_TTL_MS = 5 * 60 * 1000;
    const cacheDocId = safeIdempotencyKey ? `${uid}_${safeIdempotencyKey}` : null;
    if (cacheDocId) {
      const cacheRef = db.doc(`voice_transcribe_cache/${cacheDocId}`);
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const cachedAt = cached.createdAt?.toMillis?.() ?? 0;
        if (Date.now() - cachedAt < TRANSCRIBE_CACHE_TTL_MS) {
          return { text: cached.text || "", cached: true };
        }
      }
    }

    // 4. Business quota — enforced server-side, client checks are UX only.
    await reserveVoiceQuota(db, uid);
    let quotaReserved = true;
    // Declared outside the try so the finally below always knows what to drop
    // at AssemblyAI (HC4), whatever path ends the call (success, error, timeout).
    let transcriptId = null;

    try {
      // 4. Upload audio to AssemblyAI
      const audioBuffer = Buffer.from(audioBase64, "base64");

      const uploadResponse = await fetch(
        "https://api.assemblyai.com/v2/upload",
        {
          method: "POST",
          headers: {
            authorization: apiKey,
            "Content-Type": "application/octet-stream",
          },
          body: audioBuffer,
        }
      );

      if (!uploadResponse.ok) {
        const err = await uploadResponse.text();
        throw new HttpsError("internal", `Upload AssemblyAI échoué: ${err}`);
      }

      const uploadData = await uploadResponse.json();
      const uploadUrl = uploadData.upload_url;

      // 5. Create transcription
      const transcriptResponse = await fetch(
        "https://api.assemblyai.com/v2/transcript",
        {
          method: "POST",
          headers: {
            authorization: apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audio_url: uploadUrl,
            language_code: "fr",
            speech_model: "best",
          }),
        }
      );

      if (!transcriptResponse.ok) {
        const err = await transcriptResponse.text();
        throw new HttpsError(
          "internal",
          `Transcription AssemblyAI échouée: ${err}`
        );
      }

      const transcript = await transcriptResponse.json();
      transcriptId = transcript.id || null;

      // 6. Poll for completion (max 60s)
      let result = transcript;
      const maxPolls = 60;
      let polls = 0;

      while (
        result.status !== "completed" &&
        result.status !== "error" &&
        polls < maxPolls
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        polls++;

        const pollingResponse = await fetch(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { authorization: apiKey } }
        );

        result = await pollingResponse.json();
      }

      if (result.status === "error") {
        throw new HttpsError(
          "internal",
          `Erreur transcription: ${result.error}`
        );
      }

      if (result.status !== "completed") {
        throw new HttpsError("deadline-exceeded", "Transcription timeout.");
      }

      const text = result.text || "";

      // 8. Cache result for the idempotency window so a client retry within
      //    TRANSCRIBE_CACHE_TTL_MS returns the same transcript without
      //    re-spending quota or hitting AssemblyAI again. Best-effort: a
      //    cache write failure is non-fatal.
      if (cacheDocId) {
        try {
          await db.doc(`voice_transcribe_cache/${cacheDocId}`).set({
            text,
            uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            // TTL field — configure a Firestore TTL policy on `expireAt` to
            // auto-purge cache entries server-side without extra cost.
            expireAt: admin.firestore.Timestamp.fromMillis(
              Date.now() + TRANSCRIBE_CACHE_TTL_MS
            ),
          });
        } catch (cacheErr) {
          console.warn(
            `transcribeAudio: cache write failed for ${cacheDocId}:`,
            cacheErr?.message ?? cacheErr
          );
        }
      }

      // Quota was rightfully spent — disarm the refund.
      quotaReserved = false;

      return { text };
    } catch (error) {
      // Refund the quota slot we reserved up front so a failed transcription
      // doesn't eat into the user's daily limit (T1.3).
      if (quotaReserved) {
        await refundVoiceQuota(db, uid);
        quotaReserved = false;
      }

      // Re-throw HttpsError as-is
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error("transcribeAudio error:", error);
      throw new HttpsError(
        "internal",
        "Erreur lors de la transcription audio."
      );
    } finally {
      // 7. Tell AssemblyAI to drop the transcript (and its audio) on EVERY
      //    path: success, provider error, timeout, polling failure (T2.1,
      //    GDPR Art. 17/33). Bounded by a 3s timeout; if the DELETE fails or
      //    throws, the transcriptId is queued for retryAssemblyAIDeletes.
      //    Limit: when the upload worked but the transcript could not be
      //    created there is no id and no documented DELETE endpoint for
      //    /v2/upload files: the provider's own expiry applies (see report).
      if (transcriptId) {
        let deleted = false;
        try {
          deleted = await deleteAssemblyAITranscript(transcriptId, apiKey);
        } catch (delErr) {
          console.warn("transcribeAudio: transcript delete threw:", delErr?.message ?? delErr);
        }
        if (!deleted) {
          await enqueueAssemblyAIDelete(db, transcriptId, "initial-delete-failed", uid);
        }
      }
    }
  }
);

/**
 * retryAssemblyAIDeletes — drain the pending_assemblyai_deletes queue.
 * Runs hourly. For each queued transcriptId:
 *   - retry DELETE on AssemblyAI
 *   - on success: remove the doc
 *   - on failure: bump attempts; after MAX_DELETE_ATTEMPTS, keep the doc for
 *     manual audit (and log loudly so it shows up in Sentry / Cloud Logs).
 * Bounded batch size to keep one execution under the 540s scheduler cap.
 */
exports.retryAssemblyAIDeletes = onSchedule(
  {
    schedule: "every 60 minutes",
    region: "europe-west1",
    timeoutSeconds: 540,
    secrets: ["ASSEMBLYAI_API_KEY"],
  },
  async () => {
    const db = admin.firestore();
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      console.error("retryAssemblyAIDeletes: ASSEMBLYAI_API_KEY missing");
      return;
    }

    const MAX_DELETE_ATTEMPTS = 5;
    const BATCH = 50;

    const snapshot = await db
      .collection("pending_assemblyai_deletes")
      .orderBy("lastAttemptAt")
      .limit(BATCH)
      .get();

    if (snapshot.empty) {
      console.log("retryAssemblyAIDeletes: queue empty");
      return;
    }

    let succeeded = 0;
    let stillFailing = 0;
    let abandoned = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() || {};
      const attempts = (data.attempts || 0) + 1;
      const transcriptId = data.transcriptId || docSnap.id;

      const ok = await deleteAssemblyAITranscript(transcriptId, apiKey);
      if (ok) {
        await docSnap.ref.delete();
        succeeded++;
        continue;
      }

      if (attempts >= MAX_DELETE_ATTEMPTS) {
        // Keep the doc for manual audit, mark it so it stops being retried.
        await docSnap.ref.update({
          attempts,
          lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
          abandonedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Kept for audit, then removed by the TTL policy on expireAt.
          expireAt: logExpireAt(),
          lastError: `Abandoned after ${attempts} attempts`,
        });
        console.error(
          `retryAssemblyAIDeletes: abandoning ${transcriptId} after ${attempts} attempts`
        );
        abandoned++;
      } else {
        await docSnap.ref.update({
          attempts,
          lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        stillFailing++;
      }
    }

    console.log(
      `retryAssemblyAIDeletes: succeeded=${succeeded} stillFailing=${stillFailing} abandoned=${abandoned}`
    );
  }
);

/**
 * Daily ceiling on LLM parses per user. Cost guard, not a product quota: the
 * product quota (FREE_DAILY_VOICE_LIMIT) is already charged by
 * transcribeAudio. This bounds what a scripted client could spend calling
 * parseVoiceCommand directly with typed text (~0.03 ¢ per call on Haiku 5.5).
 */
const VOICE_PARSE_DAILY_CAP = 200;

async function reserveVoiceParseSlot(db, uid) {
  const usageRef = db.doc(`usage_limits/${uid}`);
  const today = new Date().toISOString().split("T")[0];
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const data = snap.exists ? snap.data() : {};
    const used = data.voiceParseDate === today ? (data.voiceParseCount || 0) : 0;
    if (used >= VOICE_PARSE_DAILY_CAP) {
      throw new HttpsError("resource-exhausted", "Limite quotidienne d'analyse vocale atteinte.");
    }
    tx.set(usageRef, { voiceParseDate: today, voiceParseCount: used + 1 }, { merge: true });
  });
}

/**
 * Give back a slot when the model produced nothing usable, so an Anthropic
 * outage doesn't eat a heavy user's daily budget. Best-effort.
 */
async function refundVoiceParseSlot(db, uid) {
  const usageRef = db.doc(`usage_limits/${uid}`);
  const today = new Date().toISOString().split("T")[0];
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const data = snap.exists ? snap.data() : {};
      if (data.voiceParseDate === today && (data.voiceParseCount || 0) > 0) {
        tx.set(usageRef, { voiceParseCount: data.voiceParseCount - 1 }, { merge: true });
      }
    });
  } catch (err) {
    console.warn("refundVoiceParseSlot failed:", err?.message ?? err);
  }
}

/** Anthropic statuses that mean our setup is broken, not a transient blip. */
const VOICE_PARSE_CONFIG_ERRORS = new Set([400, 401, 403, 404]);

/**
 * parseVoiceCommand — interprets a voice transcript with Claude and returns
 * sanitized, structured events (see functions/lib/voiceParse.js).
 *
 * Writes nothing to events: the client shows the result for confirmation and
 * then goes through validateAndCreateEvent as before. Any failure surfaces
 * as `unavailable`, on which the client falls back to its rule-based parser.
 * The transcript is never logged (child health data).
 *
 * Kill switch: deploy with VOICE_LLM_PARSE_ENABLED=false.
 */
exports.parseVoiceCommand = onCall(
  withAppCheck({
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 15,
    concurrency: 40,
    secrets: ["ANTHROPIC_API_KEY"],
  }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "parseVoiceCommand");

    if (process.env.VOICE_LLM_PARSE_ENABLED === "false") {
      throw new HttpsError("unavailable", "Analyse vocale avancée désactivée.");
    }

    const { text, localTime } = request.data || {};
    if (typeof text !== "string" || !text.trim()) {
      throw new HttpsError("invalid-argument", "text est requis.");
    }
    if (text.length > voiceParse.MAX_INPUT_CHARS) {
      throw new HttpsError("invalid-argument", "Commande trop longue.");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("parseVoiceCommand: ANTHROPIC_API_KEY not configured");
      throw new HttpsError("unavailable", "Service IA non configuré.");
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "voice_parse", 20);
    await reserveVoiceParseSlot(db, uid);

    const model = process.env.VOICE_PARSE_MODEL || voiceParse.DEFAULT_MODEL;
    const startedAt = Date.now();
    try {
      const { result, usage } = await voiceParse.parseWithClaude({
        client: getAnthropicClient(apiKey),
        text: text.trim(),
        localTime,
        model,
      });
      console.log("parseVoiceCommand", JSON.stringify({
        model,
        ms: Date.now() - startedAt,
        action: result.action,
        events: result.events.length,
        truncated: result.truncated,
        inputTokens: usage.input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        outputTokens: usage.output_tokens,
      }));
      return result;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      await refundVoiceParseSlot(db, uid);
      // Anthropic errors (rate limit, overload, timeout, auth) and unusable
      // answers all degrade the same way for the parent: the client uses its
      // local parser. A broken setup (revoked key, retired model) would do so
      // silently for every user, so it is logged as an error to be alerted on.
      const details = JSON.stringify({
        model,
        ms: Date.now() - startedAt,
        reason: error.reason || error.name,
        status: error.status,
      });
      if (VOICE_PARSE_CONFIG_ERRORS.has(error.status)) {
        console.error("parseVoiceCommand: configuration error", details);
      } else {
        console.warn("parseVoiceCommand: unavailable", details);
      }
      throw new HttpsError("unavailable", "Analyse vocale indisponible.");
    }
  }
);

let anthropicClient = null;
let anthropicClientKey = null;
/** One client per instance (keeps the HTTP agent warm across invocations). */
function getAnthropicClient(apiKey) {
  if (!anthropicClient || anthropicClientKey !== apiKey) {
    anthropicClient = new Anthropic({ apiKey });
    anthropicClientKey = apiKey;
  }
  return anthropicClient;
}

exports.getUsageQuotaStatus = onCall(
  withAppCheck({ region: "europe-west1", concurrency: 50 }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "getUsageQuotaStatus");

    const uid = request.auth.uid;
    const { feature, childId } = request.data || {};
    const db = admin.firestore();

    if (!["voice", "export", "sharing"].includes(feature)) {
      throw new HttpsError("invalid-argument", "Feature invalide.");
    }

    if (feature === "voice") {
      return await getVoiceQuotaStatus(db, uid);
    }

    if (feature === "export") {
      return await getExportQuotaStatus(db, uid);
    }

    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId est requis.");
    }

    const accessDoc = await db.doc(`children/${childId}/access/${uid}`).get();
    if (!accessDoc.exists || !hasChildRole(accessDoc.data(), ["owner", "admin"])) {
      throw new HttpsError("permission-denied", "Accès insuffisant à cet enfant.");
    }

    return await getSharingQuotaStatus(db, uid, childId);
  }
);

exports.consumeUsageQuota = onCall(
  withAppCheck({ region: "europe-west1", concurrency: 50 }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "consumeUsageQuota");

    const uid = request.auth.uid;
    const { feature, childIds } = request.data || {};
    const db = admin.firestore();

    if (!["voice", "export"].includes(feature)) {
      throw new HttpsError("invalid-argument", "Feature invalide.");
    }

    // B5.S1 — pour les features scopées par enfant (export PDF), exiger
    // que l'appelant ait accès à TOUS les enfants exportés. Quota reste
    // GLOBAL (1 export free, peu importe le nombre d'enfants) mais on
    // bloque l'exploit "consommer le quota pour un childId random qu'on
    // ne possède pas". Voice = user-level, pas de scope childId.
    if (feature === "export") {
      if (!Array.isArray(childIds) || childIds.length === 0) {
        throw new HttpsError("invalid-argument", "childIds (array non vide) requis pour les exports.");
      }
      if (childIds.length > 20) {
        // Garde-fou : 20 enfants en un export, c'est déjà énorme. Au-delà,
        // soit c'est un bug client, soit une tentative d'abus.
        throw new HttpsError("invalid-argument", "Trop d'enfants dans un seul export (max 20).");
      }
      for (const id of childIds) {
        if (typeof id !== "string" || id.trim().length === 0) {
          throw new HttpsError("invalid-argument", "childId invalide dans childIds.");
        }
        await checkChildAccess(db, uid, id, ["owner", "admin", "contributor"]);
      }
    }

    if (feature === "voice") {
      return await reserveVoiceQuota(db, uid);
    }

    const subscriptionState = await getSubscriptionState(db, uid);
    if (hasUnlimitedFeature(subscriptionState, feature)) {
      return {
        feature,
        allowed: true,
        isUnlimited: true,
        used: 0,
        limit: null,
        remaining: null,
        resetDate: null,
      };
    }

    const usageRef = db.doc(`usage_limits/${uid}`);
    return await db.runTransaction(async (tx) => {
      const usageDoc = await tx.get(usageRef);
      const usageData = usageDoc.exists ? usageDoc.data() : {};

      const used = usageData.pdfExportCount || 0;
      if (used >= FREE_TOTAL_PDF_EXPORTS) {
        throw new HttpsError(
          "resource-exhausted",
          "Votre export gratuit a déjà été utilisé. Passez en Premium pour des exports illimités."
        );
      }

      tx.set(
        usageRef,
        {
          pdfExportCount: used + 1,
          lastPdfExportAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        feature: "export",
        allowed: true,
        isUnlimited: false,
        used: used + 1,
        limit: FREE_TOTAL_PDF_EXPORTS,
        remaining: Math.max(0, FREE_TOTAL_PDF_EXPORTS - (used + 1)),
        resetDate: null,
      };
    });
  }
);

exports.createShareInvitation = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "createShareInvitation");

    const uid = request.auth.uid;
    const inviterEmail = request.auth.token?.email;
    // childName du client est ignoré : le nom vient de children/{id}.
    const { childId, invitedEmail } = request.data || {};
    const db = admin.firestore();

    assertVerifiedEmail(request);
    await checkRateLimit(db, uid, "share_invite", 5);

    if (!childId || typeof childId !== "string" || !isValidDocId(childId)) {
      throw new HttpsError("invalid-argument", "childId est requis.");
    }
    if (!invitedEmail || typeof invitedEmail !== "string" || invitedEmail.length > 254) {
      throw new HttpsError("invalid-argument", "invitedEmail est requis.");
    }
    if (!inviterEmail) {
      throw new HttpsError("failed-precondition", "Email utilisateur introuvable.");
    }

    const invitedEmailLower = invitedEmail.trim().toLowerCase();
    if (invitedEmailLower === inviterEmail.toLowerCase()) {
      throw new HttpsError(
        "invalid-argument",
        "Vous ne pouvez pas vous inviter vous-même.",
        { reason: "self-invite" }
      );
    }

    const accessDoc = await db.doc(`children/${childId}/access/${uid}`).get();
    if (!accessDoc.exists || !hasChildRole(accessDoc.data(), ["owner", "admin"])) {
      throw new HttpsError(
        "permission-denied",
        "Accès insuffisant à cet enfant.",
        { reason: "insufficient-access" }
      );
    }

    const childDoc = await db.doc(`children/${childId}`).get();
    if (!childDoc.exists || childDoc.data()?.deletedAt) {
      throw new HttpsError("not-found", "Enfant introuvable.", { reason: "child-not-found" });
    }

    const sharingQuota = await getSharingQuotaStatus(db, uid, childId);
    if (!sharingQuota.isUnlimited && sharingQuota.remaining <= 0) {
      throw new HttpsError(
        "resource-exhausted",
        "Le plan gratuit permet 2 co-parents maximum. Passez en Famille pour inviter plus de personnes.",
        { reason: "sharing-limit" }
      );
    }

    // Résolution via Firebase Auth (source de vérité de l'e-mail du compte),
    // pas via users/{uid}.email que chaque utilisateur peut réécrire : sinon
    // un attaquant y mettait l'e-mail d'une victime pour recevoir ses invitations.
    let invitedUserId;
    try {
      invitedUserId = (await admin.auth().getUserByEmail(invitedEmailLower)).uid;
    } catch (err) {
      if (err?.code !== "auth/user-not-found") throw err;
      // Réponse neutre : même forme que le succès, rien n'est créé. Sinon la
      // fonction confirmait quelles adresses ont un compte SuiviBaby.
      return { id: randomNeutralId() };
    }
    const targetAccessDoc = await db.doc(`children/${childId}/access/${invitedUserId}`).get();
    if (targetAccessDoc.exists) {
      // Même réponse neutre qu'un compte inconnu : sinon l'erreur disait qui
      // a déjà accès à l'enfant (énumération).
      return { id: randomNeutralId() };
    }

    const existingInvites = await db
      .collection("shareInvitations")
      .where("childId", "==", childId)
      .where("invitedEmail", "==", invitedEmailLower)
      .where("inviterId", "==", uid)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingInvites.empty) {
      return { id: randomNeutralId() };
    }

    const invitationRef = await db.collection("shareInvitations").add({
      childId,
      childName: childDoc.data()?.name || "",
      inviterId: uid,
      inviterEmail,
      invitedEmail: invitedEmailLower,
      invitedUserId,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { id: invitationRef.id };
  }
);

/** 20 alphanumeric characters, the shape of a Firestore auto id (neutral invitation answer). */
function randomNeutralId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 20 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}

// ============================================
// CONTENT REPORT NOTIFICATION
// ============================================

/**
 * onReportCreated — Firestore trigger on reports/{reportId}
 * Sends an email notification to the SuiviBaby team when a user
 * submits a content report (e.g. sensitive child photo).
 */
async function handleReportCreated(snapshot, context) {
    const data = snapshot.data();
    const reportId = context.params.reportId;

    const reasonLabels = {
      intimate_child_nudity: "Nudité intime d'un enfant",
      sensitive_child_photo: "Photo sensible d'un enfant",
      privacy: "Problème de confidentialité",
      other: "Autre",
    };

    const reasonLabel = reasonLabels[data.reason] || data.reason;

    // Look up reporter email for context
    let reporterEmail = "inconnu";
    try {
      const userRecord = await admin.auth().getUser(data.reporterUserId);
      reporterEmail = userRecord.email || "inconnu";
    } catch {
      // User may have been deleted
    }

    const apiKey = process.env.RESEND_API_KEY;
    const db = admin.firestore();

    // 1. Send email to operator (best-effort — never blocks the
    // moderation effects below; if RESEND_API_KEY is missing we still
    // hide for the reporter and apply the auto-hide rules).
    if (apiKey) {
      const resend = new Resend(apiKey);
      // Every field below comes from a client or from Auth: escape it all.
      const safe = Object.fromEntries(
        Object.entries({
          reportId, reason: reasonLabel, reporterEmail, reporterUserId: data.reporterUserId,
          childId: data.childId, eventId: data.eventId, photoPath: data.photoPath, message: data.message,
        }).map(([key, value]) => [key, escapeHtml(value)]),
      );
      const html = `
      <h2>Nouveau signalement de contenu</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px;font-weight:bold;">Report ID</td><td style="padding:6px 12px;">${safe.reportId}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Motif</td><td style="padding:6px 12px;">${safe.reason}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Reporter</td><td style="padding:6px 12px;">${safe.reporterEmail} (${safe.reporterUserId})</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Enfant (childId)</td><td style="padding:6px 12px;">${safe.childId}</td></tr>
        ${data.eventId ? `<tr><td style="padding:6px 12px;font-weight:bold;">Event ID</td><td style="padding:6px 12px;">${safe.eventId}</td></tr>` : ""}
        ${data.photoPath ? `<tr><td style="padding:6px 12px;font-weight:bold;">Photo path</td><td style="padding:6px 12px;">${safe.photoPath}</td></tr>` : ""}
        ${data.message ? `<tr><td style="padding:6px 12px;font-weight:bold;">Message</td><td style="padding:6px 12px;">${safe.message}</td></tr>` : ""}
      </table>
      <p style="margin-top:16px;font-size:13px;color:#6b7280;">
        Consultez la collection <code>reports/${safe.reportId}</code> dans la console Firebase pour traiter ce signalement.
      </p>
      `;
      try {
        await resend.emails.send({
          from: "Suivi Baby <noreply@suivibaby.com>",
          to: "contact@suivibaby.com",
          subject: `[Signalement] ${String(reasonLabel).replace(/[\r\n<>]/g, " ")} — SuiviBaby`,
          html,
        });
        console.log(`onReportCreated: email sent for report ${reportId}`);
      } catch (error) {
        console.error("onReportCreated: failed to send email", error);
      }
    } else {
      console.warn(
        `onReportCreated: RESEND_API_KEY not configured — skipping ops email for report ${reportId} (moderation effects still applied)`
      );
    }

    // 2. Hide photo for reporter (add to user_hidden_photos)
    try {
      if (data.eventId) {
        await db.doc(`user_hidden_photos/${data.reporterUserId}`).set(
          { hiddenEventIds: admin.firestore.FieldValue.arrayUnion(data.eventId) },
          { merge: true },
        );
      }
    } catch (error) {
      console.error("onReportCreated: failed to hide for reporter", error);
    }

    // 3. Graduated global hide (T3):
    //    - immediate if reporter is an owner on the targeted child
    //    - otherwise wait for >= 2 distinct reporters on the same event,
    //      OR an explicit admin decision via resolveReport.
    //    Auto-hide on a single non-owner report was abusable (a coparent
    //    or viewer could mark a legitimate photo as nudity and have it
    //    hidden globally with no recourse).
    const isHidableReason =
      data.reason === "intimate_child_nudity" ||
      data.reason === "sensitive_child_photo";

    if (data.eventId && isHidableReason) {
      try {
        let shouldHide = false;
        let hideReason = "";

        if (data.childId) {
          const reporterAccessSnap = await db
            .doc(`children/${data.childId}/access/${data.reporterUserId}`)
            .get();
          const reporterRole = reporterAccessSnap.exists
            ? reporterAccessSnap.data()?.role
            : null;
          if (reporterRole === "owner") {
            shouldHide = true;
            hideReason = "owner-report";
          }
        }

        if (!shouldHide) {
          const peerReports = await db
            .collection("reports")
            .where("eventId", "==", data.eventId)
            .where("reason", "in", [
              "intimate_child_nudity",
              "sensitive_child_photo",
            ])
            .get();
          const distinctReporters = new Set(
            peerReports.docs
              .map((d) => d.data()?.reporterUserId)
              .filter(Boolean)
          );
          if (distinctReporters.size >= 2) {
            shouldHide = true;
            hideReason = "two-reporter-threshold";
          }
        }

        if (shouldHide) {
          await db.doc(`events/${data.eventId}`).update({ reported: true });
          console.log(
            `onReportCreated: event ${data.eventId} hidden globally (${hideReason})`
          );
        } else {
          console.log(
            `onReportCreated: event ${data.eventId} flagged but not hidden — awaiting moderation`
          );
        }
      } catch (error) {
        console.error("onReportCreated: failed to evaluate auto-hide", error);
      }
    }

    // 4. Notify photo author via push
    try {
      if (data.eventId) {
        const eventSnap = await db.doc(`events/${data.eventId}`).get();
        const eventData = eventSnap.exists ? eventSnap.data() : null;
        const authorId = eventData?.userId;

        if (authorId && authorId !== data.reporterUserId) {
          const tokenSnap = await db.collection("device_tokens")
            .where("userId", "==", authorId)
            .get();

          const tokens = tokenSnap.docs
            .map((d) => d.data().token)
            .filter(Boolean)
            .filter((t) => expo.isExpoPushToken(t));

          if (tokens.length > 0) {
            const messages = tokens.map((token) => ({
              to: token,
              sound: "default",
              title: "Photo signalée",
              body: "Une photo que vous avez ajoutée a été signalée et est en cours d'examen.",
              data: { type: "photo_reported", eventId: data.eventId },
            }));
            const chunks = expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
              await expo.sendPushNotificationsAsync(chunk).catch(() => {});
            }
            console.log(`onReportCreated: push sent to author ${authorId}`);
          }
        }
      }
    } catch (error) {
      console.error("onReportCreated: failed to notify author", error);
    }
  }

exports.handleReportCreated = handleReportCreated;
exports.photoRefToPath = photoRefToPath;
exports.onReportCreated = onDocumentCreated(
  {
    document: "reports/{reportId}",
    region: "europe-west1",
    secrets: ["RESEND_API_KEY"],
  },
  (event) => handleReportCreated(event.data, { params: event.params })
);

// ============================================
// REPORT SUBMISSION (B6.S1/S2/S3)
// ============================================

/**
 * submitContentReportCF — Crée un report avec validations serveur.
 *
 * Remplace l'ancienne création client directe (addDoc côté
 * services/contentReportService.ts). Apporte :
 *  - B6.S1 rate limit 5/min/uid (anti report flooding).
 *  - B6.S2 vérification existence childId + eventId (rejet si
 *    contenu reporté n'existe pas).
 *  - B6.S3 refus auto-report : un user ne peut pas signaler son
 *    propre event (évite le hack "hide my own photo from co-parents").
 *  - hasAccess(childId) vérifié (déjà fait par les rules avant,
 *    on garde la même contrainte).
 *
 * Le trigger onReportCreated reste en place et se déclenche aussi
 * pour les writes admin SDK (notifications, email opérateur, etc.).
 */
const REPORT_REASONS = new Set([
  "intimate_child_nudity",
  "sensitive_child_photo",
  "privacy",
  "other",
]);

exports.submitContentReportCF = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "submitContentReportCF");

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "report", 5);

    const { childId, eventId, photoPath, reason, message } = request.data || {};

    // Validation des champs.
    if (typeof childId !== "string" || childId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "childId requis.");
    }
    if (!isValidDocId(childId)) {
      throw new HttpsError("invalid-argument", "childId invalide.");
    }
    if (!REPORT_REASONS.has(reason)) {
      throw new HttpsError("invalid-argument", `reason invalide. Attendu : ${[...REPORT_REASONS].join(", ")}.`);
    }
    if (eventId !== undefined && eventId !== null && typeof eventId !== "string") {
      throw new HttpsError("invalid-argument", "eventId doit être string ou null.");
    }
    if (eventId && !isValidDocId(eventId)) {
      throw new HttpsError("invalid-argument", "eventId invalide.");
    }
    if (photoPath !== undefined && photoPath !== null && typeof photoPath !== "string") {
      throw new HttpsError("invalid-argument", "photoPath doit être string ou null.");
    }
    // Le chemin signalé est supprimé tel quel par resolveReport : il doit être
    // dans le dossier de l'enfant et vérifiable contre les photos de l'événement.
    const reportedPhotoPath = photoPath ? photoRefToPath(photoPath, childId) : null;
    if (photoPath && !reportedPhotoPath) {
      throw new HttpsError("invalid-argument", "photoPath invalide pour cet enfant.");
    }
    if (photoPath && !eventId) {
      throw new HttpsError("invalid-argument", "photoPath exige un eventId.");
    }
    if (message !== undefined && message !== null) {
      if (typeof message !== "string") {
        throw new HttpsError("invalid-argument", "message doit être string.");
      }
      if (message.length > 1000) {
        throw new HttpsError("invalid-argument", "message trop long (max 1000 chars).");
      }
    }

    // B6 hasAccess(childId) — l'ancien rules le checkait, on garde.
    await checkChildAccess(db, uid, childId, ["owner", "admin", "contributor"]);

    // B6.S2 — vérifier que l'event reporté existe (si eventId fourni).
    if (eventId) {
      const eventDoc = await db.doc(`events/${eventId}`).get();
      if (!eventDoc.exists) {
        throw new HttpsError("not-found", "Le contenu signalé n'existe pas ou a été supprimé.");
      }
      const eventData = eventDoc.data();
      if (eventData.childId !== childId) {
        throw new HttpsError("invalid-argument", "Le contenu signalé n'appartient pas à cet enfant.");
      }
      if (reportedPhotoPath) {
        const eventPhotos = Array.isArray(eventData.photos) ? eventData.photos : [];
        if (!eventPhotos.some((ref) => photoRefToPath(ref, childId) === reportedPhotoPath)) {
          throw new HttpsError("invalid-argument", "Cette photo ne fait pas partie de l'événement signalé.");
        }
      }

      // B6.S3 — refuser l'auto-report. Un user ne doit pas pouvoir
      // signaler son propre event pour le hide de tous les co-parents.
      if (eventData.userId === uid) {
        throw new HttpsError(
          "failed-precondition",
          "Vous ne pouvez pas signaler votre propre contenu. Utilisez plutôt l'option modifier/supprimer."
        );
      }
    }

    // Write admin SDK — bypass rules (nécessaire car rules `allow create: if false`).
    const trimmedMessage = message?.trim?.() || null;
    const docRef = await db.collection("reports").add({
      reporterUserId: uid,
      childId,
      eventId: eventId ?? null,
      photoPath: reportedPhotoPath,
      reason,
      message: trimmedMessage,
      status: "open",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { reportId: docRef.id };
  }
);

// ============================================
// REPORT RESOLUTION (admin-only)
// ============================================

exports.resolveReport = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["RESEND_API_KEY"] }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "resolveReport");

    const uid = request.auth.uid;
    const { reportId, action, adminNote } = request.data || {};
    const db = admin.firestore();

    // Verify admin custom claim
    const userRecord = await admin.auth().getUser(uid);
    if (!userRecord.customClaims?.admin) {
      throw new HttpsError("permission-denied", "Réservé aux administrateurs.");
    }

    if (!reportId || typeof reportId !== "string") {
      throw new HttpsError("invalid-argument", "reportId est requis.");
    }
    if (!["dismiss", "remove_photo", "remove_event"].includes(action)) {
      throw new HttpsError("invalid-argument", "Action invalide. Attendu: dismiss, remove_photo, remove_event.");
    }

    const reportRef = db.doc(`reports/${reportId}`);

    // B6.S7 — claim atomique : flip status open → resolving dans une
    // transaction. Si 2 admins lancent en parallèle, la 2e tx voit
    // status=resolving et throw already-exists. Évite la double-notif,
    // le double-audit, et la double-suppression de photo. La transition
    // finale resolving → resolved se fait à la fin (ligne ~1587).
    let reportData;
    try {
      reportData = await db.runTransaction(async (tx) => {
        const snap = await tx.get(reportRef);
        if (!snap.exists) {
          throw new HttpsError("not-found", "Signalement introuvable.");
        }
        const data = snap.data();
        if (data.status !== "open") {
          throw new HttpsError(
            "already-exists",
            data.status === "resolving"
              ? "Ce signalement est en cours de traitement par un autre admin."
              : "Ce signalement a déjà été traité."
          );
        }
        tx.update(reportRef, {
          status: "resolving",
          resolvingBy: uid,
          resolvingAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return data;
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("resolveReport: claim transaction error", err);
      throw new HttpsError("internal", "Erreur lors de la prise en charge du signalement.");
    }

    // T0.4 — l'admin doit avoir accès à l'enfant ciblé. Sans ce check, un
    // admin global pouvait supprimer des events de n'importe quel enfant
    // (escalation B6-S4). On garde l'admin claim comme pré-requis mais on
    // ajoute la portée childId pour limiter le rayon d'action.
    if (reportData.childId) {
      const accessSnap = await db
        .doc(`children/${reportData.childId}/access/${uid}`)
        .get();
      const role = accessSnap.exists ? accessSnap.data()?.role : null;
      if (role !== "owner" && role !== "admin") {
        // Audit log AVANT de refuser, pour tracer les tentatives.
        try {
          await writeAdminAudit(db,{
            type: "resolveReport_denied",
            adminUid: uid,
            reportId,
            childId: reportData.childId,
            reason: "no_child_access",
            at: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.error("resolveReport: failed to write denial audit", e.message);
        }
        throw new HttpsError(
          "permission-denied",
          "Vous devez être owner ou admin de cet enfant pour modérer ce signalement."
        );
      }
    }

    // Audit-log every admin action — the admin custom claim grants the
    // ability to act on any report, so the safeguard against rogue admins
    // is detection (this log) rather than prevention.
    try {
      await writeAdminAudit(db,{
        type: "resolveReport",
        adminUid: uid,
        reportId,
        childId: reportData.childId || null,
        eventId: reportData.eventId || null,
        action,
        adminNote: adminNote || null,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // Audit log failure must not block the moderation action itself.
      console.error("resolveReport: failed to write audit log", e.message);
    }

    // Execute action
    // Même avec un rapport déjà stocké (créé avant 4.4), on ne supprime qu'un
    // fichier du dossier de l'enfant du rapport.
    const photoToRemove = photoRefToPath(reportData.photoPath, reportData.childId);
    if (action === "remove_photo" && reportData.photoPath && !photoToRemove) {
      console.warn(`resolveReport: refusing to delete photoPath outside child folder (report ${reportId})`);
    }
    if (action === "remove_photo" && photoToRemove) {
      try {
        await deletePhotoEverywhere(photoToRemove);
        console.log(`resolveReport: deleted photo ${photoToRemove}`);
      } catch (error) {
        console.warn(`resolveReport: could not delete photo ${photoToRemove}`, error.message);
      }
      // Remove photo from event
      if (reportData.eventId) {
        try {
          const eventRef = db.doc(`events/${reportData.eventId}`);
          const eventSnap = await eventRef.get();
          if (eventSnap.exists) {
            const photos = (eventSnap.data().photos || []).filter(
              (p) => p !== reportData.photoPath && photoRefToPath(p, reportData.childId) !== photoToRemove,
            );
            await eventRef.update({ photos, reported: admin.firestore.FieldValue.delete() });
          }
        } catch (error) {
          console.warn(`resolveReport: could not update event`, error.message);
        }
      }
    }

    if (action === "remove_event" && reportData.eventId) {
      try {
        // Use deleteEventCascade logic inline (delete event + likes + comments)
        await deleteDocsByFieldBatched(db, "eventLikes", "eventId", reportData.eventId);
        await deleteDocsByFieldBatched(db, "eventComments", "eventId", reportData.eventId);
        await db.doc(`events/${reportData.eventId}`).delete();
        console.log(`resolveReport: deleted event ${reportData.eventId} + cascade`);
      } catch (error) {
        console.warn(`resolveReport: could not delete event cascade`, error.message);
      }
    }

    if (action === "dismiss" && reportData.eventId) {
      // Restore event if it was auto-hidden
      try {
        await db.doc(`events/${reportData.eventId}`).update({
          reported: admin.firestore.FieldValue.delete(),
        });
      } catch (error) {
        console.warn(`resolveReport: could not restore event`, error.message);
      }
    }

    // Mark report as resolved
    await reportRef.update({
      status: "resolved",
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: uid,
      action,
      adminNote: adminNote || null,
    });

    // Notify reporter
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        let reporterEmail = null;
        const reporterRecord = await admin.auth().getUser(reportData.reporterUserId);
        reporterEmail = reporterRecord.email;

        if (reporterEmail) {
          const resend = new Resend(apiKey);
          const isRemoved = action === "remove_photo" || action === "remove_event";
          await resend.emails.send({
            from: "Suivi Baby <noreply@suivibaby.com>",
            to: reporterEmail,
            subject: isRemoved
              ? "Contenu retiré suite à votre signalement — SuiviBaby"
              : "Résultat de votre signalement — SuiviBaby",
            html: isRemoved
              ? `<p>Bonjour,</p><p>Le contenu que vous avez signalé a été examiné et retiré. Merci de contribuer à la sécurité des enfants sur SuiviBaby.</p><p>L'équipe SuiviBaby</p>`
              : `<p>Bonjour,</p><p>Merci pour votre signalement. Après examen, le contenu ne contrevient pas à nos règles d'utilisation.</p><p>L'équipe SuiviBaby</p>`,
          });
        }
      } catch (error) {
        console.warn("resolveReport: could not notify reporter", error.message);
      }
    }

    console.log(`resolveReport: report ${reportId} resolved with action=${action} by ${uid}`);
    return { success: true, action };
  }
);

// ============================================
// VALIDATION HELPERS
// ============================================

const VALID_EVENT_TYPES = [
  "biberon", "tetee", "solide", "pompage",
  "couche", "miction", "selle", "sommeil",
  "bain", "temperature", "medicament", "symptome",
  "croissance", "vaccin", "vitamine", "activite", "jalon", "nettoyage_nez",
];

/**
 * Convertit un objet date sérialisé en Firestore Timestamp.
 * httpsCallable sérialise les Timestamps en {seconds, nanoseconds} (sans underscore)
 * mais l'admin SDK les sérialise en {_seconds, _nanoseconds} (avec underscore).
 */
function toFirestoreTimestamp(dateValue) {
  if (!dateValue || dateValue instanceof admin.firestore.Timestamp) {
    return dateValue;
  }
  if (dateValue instanceof Date) {
    return admin.firestore.Timestamp.fromDate(dateValue);
  }
  // Format httpsCallable client: {seconds, nanoseconds}
  if (typeof dateValue.seconds === "number") {
    return new admin.firestore.Timestamp(dateValue.seconds, dateValue.nanoseconds || 0);
  }
  // Format admin SDK: {_seconds, _nanoseconds}
  if (typeof dateValue._seconds === "number") {
    return new admin.firestore.Timestamp(dateValue._seconds, dateValue._nanoseconds || 0);
  }
  // ISO string ou autre
  if (typeof dateValue === "string" || typeof dateValue === "number") {
    return admin.firestore.Timestamp.fromDate(new Date(dateValue));
  }
  return dateValue;
}

const EVENT_DATE_FIELDS = new Set([
  "date",
  "heureDebut",
  "heureFin",
  "createdAt",
  "updatedAt",
  "migratedAt",
]);

function convertEventDateFields(data) {
  const converted = { ...data };

  for (const [key, value] of Object.entries(converted)) {
    if (!EVENT_DATE_FIELDS.has(key)) continue;
    converted[key] = toFirestoreTimestamp(value);
  }

  return converted;
}

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

/**
 * Throws an HttpsError if `value` is defined but not in `whitelist`.
 * Used to reject crafted enum values that bypass the client filter (T2.3).
 */
function assertEnum(value, whitelist, fieldName) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || !whitelist.includes(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} invalide: '${value}'. Valeurs autorisées: ${whitelist.join(", ")}.`
    );
  }
}

/**
 * Validation des domaines de valeurs par type d'événement
 */
function validateEventData(type, data) {
  const now = Date.now();

  // Date ne peut pas être dans le futur (tolérance 5 minutes) ni trop
  // ancienne. T3.5 — borne inférieure d'1 an : empêche un parsing vocal
  // foireux ou un import erroné de créer un événement bébé daté de 1970,
  // tout en gardant assez de marge pour les rétro-saisies réalistes (un
  // parent qui démarre l'app quelques mois après la naissance).
  if (data.date) {
    const eventDate = data.date._seconds
      ? data.date._seconds * 1000
      : data.date instanceof Date
        ? data.date.getTime()
        : typeof data.date === "number"
          ? data.date
          : now;
    if (eventDate > now + 5 * 60 * 1000) {
      throw new HttpsError(
        "invalid-argument",
        "La date ne peut pas être dans le futur."
      );
    }
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    if (eventDate < now - ONE_YEAR_MS) {
      throw new HttpsError(
        "invalid-argument",
        "La date est trop ancienne (max 1 an dans le passé)."
      );
    }
  }

  // Note: bornée pour éviter les blobs (transcription brute, contextNote)
  // qui gonflent les documents Firestore. Le client tronque déjà à ~500 chars
  // (firebaseFormatter.MAX_RAW_TEXT + MAX_CONTEXT_NOTE + preamble) — 1000 est
  // un plafond serveur défensif.
  if (data.note !== undefined && data.note !== null) {
    if (typeof data.note !== "string") {
      throw new HttpsError("invalid-argument", "Note doit être une chaîne.");
    }
    if (data.note.length > 1000) {
      throw new HttpsError(
        "invalid-argument",
        "Note trop longue (max 1000 caractères)."
      );
    }
  }

  switch (type) {
    case "biberon":
      if (data.quantite !== undefined) {
        if (typeof data.quantite !== "number" || data.quantite < 0 || data.quantite > 500) {
          throw new HttpsError(
            "invalid-argument",
            "Quantité biberon doit être entre 0 et 500 ml."
          );
        }
      }
      assertEnum(data.typeBiberon, VOICE_ENUMS.TYPES_BIBERON, "typeBiberon");
      break;

    case "selle":
      assertEnum(data.consistance, VOICE_ENUMS.CONSISTANCES_SELLE, "consistance");
      assertEnum(data.couleur, VOICE_ENUMS.COULEURS_SELLE, "couleur");
      break;

    case "activite":
      assertEnum(data.typeActivite, VOICE_ENUMS.TYPES_ACTIVITE, "typeActivite");
      if (data.duree !== undefined && data.duree !== null) {
        if (typeof data.duree !== "number" || data.duree < 0 || data.duree > 1440) {
          throw new HttpsError(
            "invalid-argument",
            "Durée activité doit être entre 0 et 1440 minutes."
          );
        }
      }
      break;

    case "jalon":
      assertEnum(data.typeJalon, VOICE_ENUMS.TYPES_JALON, "typeJalon");
      if (data.humeur !== undefined && data.humeur !== null) {
        if (typeof data.humeur !== "number" || data.humeur < 1 || data.humeur > 5) {
          throw new HttpsError("invalid-argument", "humeur doit être un entier entre 1 et 5.");
        }
      }
      break;

    case "solide":
      assertEnum(data.typeSolide, VOICE_ENUMS.TYPES_SOLIDE, "typeSolide");
      assertEnum(data.momentRepas, VOICE_ENUMS.MOMENTS_REPAS, "momentRepas");
      // `quantite` for solide is the enum (peu/moyen/beaucoup), not a number.
      assertEnum(data.quantite, VOICE_ENUMS.QUANTITES_SOLIDE, "quantite (solide)");
      break;

    case "temperature":
      if (data.valeur !== undefined) {
        if (typeof data.valeur !== "number" || !Number.isFinite(data.valeur) || data.valeur < 34 || data.valeur > 43) {
          throw new HttpsError(
            "invalid-argument",
            "Température doit être entre 34°C et 43°C."
          );
        }
      }
      break;

    case "sommeil":
      if (data.duree !== undefined && data.duree !== null) {
        if (typeof data.duree !== "number" || data.duree < 1 || data.duree > 1440) {
          throw new HttpsError(
            "invalid-argument",
            "Durée sommeil doit être entre 1 et 1440 minutes."
          );
        }
      }
      break;

    case "tetee":
      // duree (couple combiné) ou dureeGauche/dureeDroite individuels.
      // Bornes T2.4: 0-180 min (3h, au-delà c'est une coquille).
      for (const field of ["duree", "dureeGauche", "dureeDroite"]) {
        if (data[field] !== undefined && data[field] !== null) {
          if (typeof data[field] !== "number" || data[field] < 0 || data[field] > 180) {
            throw new HttpsError(
              "invalid-argument",
              `${field} (tetee) doit être entre 0 et 180 minutes.`
            );
          }
        }
      }
      break;

    case "pompage":
      if (data.quantiteGauche !== undefined) {
        if (typeof data.quantiteGauche !== "number" || data.quantiteGauche < 0 || data.quantiteGauche > 500) {
          throw new HttpsError("invalid-argument", "Quantité pompage gauche doit être entre 0 et 500 ml.");
        }
      }
      if (data.quantiteDroite !== undefined) {
        if (typeof data.quantiteDroite !== "number" || data.quantiteDroite < 0 || data.quantiteDroite > 500) {
          throw new HttpsError("invalid-argument", "Quantité pompage droite doit être entre 0 et 500 ml.");
        }
      }
      break;

    case "croissance":
      if (data.tailleCm !== undefined) {
        if (typeof data.tailleCm !== "number" || data.tailleCm < 20 || data.tailleCm > 200) {
          throw new HttpsError("invalid-argument", "Taille doit être entre 20 et 200 cm.");
        }
      }
      if (data.poidsKg !== undefined) {
        if (typeof data.poidsKg !== "number" || data.poidsKg < 0.3 || data.poidsKg > 50) {
          throw new HttpsError("invalid-argument", "Poids doit être entre 0.3 et 50 kg.");
        }
      }
      if (data.teteCm !== undefined) {
        if (typeof data.teteCm !== "number" || data.teteCm < 20 || data.teteCm > 60) {
          throw new HttpsError("invalid-argument", "Tour de tête doit être entre 20 et 60 cm.");
        }
      }
      break;

    case "bain":
      if (data.temperatureEau !== undefined) {
        if (typeof data.temperatureEau !== "number" || data.temperatureEau < 20 || data.temperatureEau > 45) {
          throw new HttpsError("invalid-argument", "Température eau doit être entre 20°C et 45°C.");
        }
      }
      break;

    case "medicament":
      if (!data.nomMedicament || typeof data.nomMedicament !== "string" || data.nomMedicament.trim().length === 0) {
        throw new HttpsError("invalid-argument", "Le nom du médicament est requis.");
      }
      if (data.nomMedicament.length > 100) {
        throw new HttpsError("invalid-argument", "Nom du médicament trop long (max 100 caractères).");
      }
      if (data.dosage !== undefined && data.dosage !== null) {
        if (typeof data.dosage !== "string" || data.dosage.length > 100) {
          throw new HttpsError("invalid-argument", "Dosage doit être une chaîne de max 100 caractères.");
        }
      }
      break;

    case "vaccin":
      if (!data.nomVaccin || typeof data.nomVaccin !== "string" || data.nomVaccin.trim().length === 0) {
        throw new HttpsError("invalid-argument", "Le nom du vaccin est requis.");
      }
      if (data.nomVaccin.length > 100) {
        throw new HttpsError("invalid-argument", "Nom du vaccin trop long (max 100 caractères).");
      }
      break;

    case "vitamine":
      if (!data.nomVitamine || typeof data.nomVitamine !== "string" || data.nomVitamine.trim().length === 0) {
        throw new HttpsError("invalid-argument", "Le nom de la vitamine est requis.");
      }
      if (data.nomVitamine.length > 100) {
        throw new HttpsError("invalid-argument", "Nom de la vitamine trop long (max 100 caractères).");
      }
      break;
  }
}

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

/**
 * validateAndCreateEvent — Création d'événement avec validation serveur
 */
exports.validateAndCreateEvent = onCall(
  withAppCheck({ region: "europe-west1", concurrency: 50 }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "validateAndCreateEvent");

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "events", 30);

    const { childId, ...eventData } = request.data;

    if (!childId || typeof childId !== "string" || !isValidDocId(childId)) {
      throw new HttpsError("invalid-argument", "childId est requis.");
    }

    if (!eventData.type || !VALID_EVENT_TYPES.includes(eventData.type)) {
      throw new HttpsError(
        "invalid-argument",
        `Type d'événement invalide: '${eventData.type}'. Types valides: ${VALID_EVENT_TYPES.join(", ")}`
      );
    }

    // Permission check
    await checkChildAccess(db, uid, childId, ["owner", "admin"]);

    // Validation des données
    validateEventData(eventData.type, eventData);

    // Idempotence : une écriture rejouée (réponse perdue, file hors ligne) ne
    // doit jamais créer un second événement.
    const { idempotencyKey, ...rawEventData } = eventData;
    const cleanEventData = convertEventDateFields(rawEventData);
    // Posés par le serveur ou la modération, jamais par le client.
    delete cleanEventData.reported;
    delete cleanEventData.id;

    const hasKey = idempotencyKey !== undefined && idempotencyKey !== null && idempotencyKey !== "";
    if (hasKey && !isValidIdempotencyKey(idempotencyKey)) {
      throw new HttpsError(
        "invalid-argument",
        "idempotencyKey doit être une chaîne alphanumérique (max 100 caractères, _ et - autorisés)."
      );
    }

    // Enrichissement serveur
    const serverData = {
      ...cleanEventData,
      childId,
      userId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // App 1.0.8 peut encore créer sans clé : création classique.
    if (!hasKey) {
      const ref = await db.collection("events").add(serverData);
      return { id: ref.id };
    }

    serverData.idempotencyKey = idempotencyKey;
    // Identifiant déterministe (uid + enfant + clé) : create() échoue si le
    // document existe déjà, donc deux envois simultanés ne peuvent pas passer
    // tous les deux. Le hachage évite qu'un utilisateur vise l'identifiant d'un autre.
    const eventId = idempotentEventId(uid, childId, idempotencyKey);
    const eventRef = db.collection("events").doc(eventId);
    const legacyQuery = db
      .collection("events")
      .where("childId", "==", childId)
      .where("userId", "==", uid)
      .where("idempotencyKey", "==", idempotencyKey)
      .limit(1);

    return await db.runTransaction(async (tx) => {
      const existing = await tx.get(eventRef);
      if (existing.exists) return { id: eventId };
      // Événement créé par une version précédente du serveur (identifiant
      // aléatoire) avec la même clé : on le reconnaît aussi.
      const legacy = await tx.get(legacyQuery);
      if (!legacy.empty) return { id: legacy.docs[0].id };
      tx.create(eventRef, serverData);
      return { id: eventId };
    });
  }
);

/** Event fields validateAndUpdateEvent never lets a client change. */
const IMMUTABLE_EVENT_FIELDS = ["id", "userId", "childId", "createdAt", "reported", "idempotencyKey"];

/**
 * validateAndUpdateEvent — Modification d'événement avec validation serveur
 */
exports.validateAndUpdateEvent = onCall(
  withAppCheck({ region: "europe-west1", concurrency: 50 }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "validateAndUpdateEvent");

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "events", 30);

    const { childId, eventId, expectedUpdatedAt, ...updateData } = request.data;

    if (!childId || !eventId) {
      throw new HttpsError("invalid-argument", "childId et eventId sont requis.");
    }
    if (!isValidDocId(childId) || !isValidDocId(eventId)) {
      throw new HttpsError("invalid-argument", "childId ou eventId invalide.");
    }

    // Optional optimistic lock (T2.2): if the client knows when it last read
    // the event, it can pass `expectedUpdatedAt` (millis since epoch) and we
    // refuse the write if the server-side value has moved on. This blocks
    // last-write-wins races on concurrent voice edits.
    let expectedMillis = null;
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
      if (typeof expectedUpdatedAt === "number") {
        expectedMillis = expectedUpdatedAt;
      } else if (expectedUpdatedAt && typeof expectedUpdatedAt.toMillis === "function") {
        expectedMillis = expectedUpdatedAt.toMillis();
      } else if (expectedUpdatedAt && typeof expectedUpdatedAt._seconds === "number") {
        expectedMillis =
          expectedUpdatedAt._seconds * 1000 +
          Math.floor((expectedUpdatedAt._nanoseconds || 0) / 1_000_000);
      } else {
        throw new HttpsError(
          "invalid-argument",
          "expectedUpdatedAt doit être un timestamp (millis ou Firestore Timestamp)."
        );
      }
    }

    // Permission check
    await checkChildAccess(db, uid, childId, ["owner", "admin"]);

    const eventRef = db.doc(`events/${eventId}`);

    // Transactional read+write so the lock check can't race with a concurrent
    // update arriving between our read and write.
    await db.runTransaction(async (tx) => {
      const eventDoc = await tx.get(eventRef);

      if (!eventDoc.exists) {
        throw new HttpsError("not-found", "Événement introuvable.");
      }

      const current = eventDoc.data();

      if (current.childId !== childId) {
        throw new HttpsError("permission-denied", "Cet événement n'appartient pas à cet enfant.");
      }

      if (expectedMillis !== null) {
        const currentMillis = current.updatedAt?.toMillis?.()
          ?? current.updatedAt?._seconds * 1000
          ?? null;
        // Tolerate a small drift (1s) so a client that just round-tripped
        // through Firestore's serverTimestamp doesn't trip its own write.
        const drift = currentMillis === null ? 0 : Math.abs(currentMillis - expectedMillis);
        if (currentMillis !== null && drift > 1000) {
          throw new HttpsError(
            "aborted",
            "L'événement a été modifié entre-temps. Veuillez réessayer."
          );
        }
      }

      // Validation des données si le type est présent
      const type = updateData.type || current.type;
      validateEventData(type, updateData);

      // Champs que le client ne modifie jamais : propriétaire, enfant,
      // date de création, drapeau de modération et clé d'idempotence.
      const sanitized = { ...updateData };
      for (const key of IMMUTABLE_EVENT_FIELDS) delete sanitized[key];

      // Gérer les champs null comme des suppressions de champ
      const cleanData = convertEventDateFields({
        ...sanitized,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      for (const [key, value] of Object.entries(cleanData)) {
        if (value === null) {
          cleanData[key] = admin.firestore.FieldValue.delete();
        }
      }

      tx.update(eventRef, cleanData);
    });

    return { success: true };
  }
);

/**
 * deleteEventCascade — Suppression atomique événement + likes + commentaires
 */
exports.deleteEventCascade = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "deleteEventCascade");

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "events", 30);

    const { childId, eventId } = request.data;

    if (!childId || !eventId) {
      throw new HttpsError("invalid-argument", "childId et eventId sont requis.");
    }
    if (!isValidDocId(childId) || !isValidDocId(eventId)) {
      throw new HttpsError("invalid-argument", "childId ou eventId invalide.");
    }

    // Permission check
    await checkChildAccess(db, uid, childId, ["owner", "admin"]);

    // Vérifier que l'événement existe
    const eventRef = db.doc(`events/${eventId}`);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError("not-found", "Événement introuvable.");
    }

    if (eventDoc.data().childId !== childId) {
      throw new HttpsError("permission-denied", "Cet événement n'appartient pas à cet enfant.");
    }

    // Supprimer likes et commentaires en sous-batches paginés (évite la limite de 500 ops/batch)
    const [deletedLikes, deletedComments] = await Promise.all([
      deleteDocsByFieldBatched(db, "eventLikes", "eventId", eventId),
      deleteDocsByFieldBatched(db, "eventComments", "eventId", eventId),
    ]);

    // Supprimer l'événement lui-même
    await eventRef.delete();

    return {
      success: true,
      deleted: {
        event: 1,
        likes: deletedLikes,
        comments: deletedComments,
      },
    };
  }
);

// ============================================
// HEALTH DATA CONSENT PROOF (RGPD art. 7.1)
// ============================================

/**
 * recordHealthConsent — Server-side proof of the explicit consent to health
 * data processing. Input: { version, platform? }. Output: { version }.
 * Appends to consent_records (server-only, kept 5 years after account
 * deletion) and sets user_preferences/{uid}.healthDataConsent, which the app
 * reads to gate access (clients cannot write that field, see firestore.rules).
 */
exports.recordHealthConsent = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "recordHealthConsent");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const data = request.data || {};

    if (data.version !== HEALTH_CONSENT_VERSION) {
      throw new HttpsError("invalid-argument", "Version de la politique de confidentialité invalide.");
    }
    const { platform } = data;
    if (platform !== undefined && platform !== null &&
      (typeof platform !== "string" || !/^[A-Za-z0-9._-]{1,20}$/.test(platform))) {
      throw new HttpsError("invalid-argument", "Plateforme invalide.");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "consent", 10);

    const record = {
      uid,
      type: "health_data",
      version: HEALTH_CONSENT_VERSION,
      granted: true,
      grantedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (typeof platform === "string") record.platform = platform;
    await db.collection("consent_records").add(record);

    // mergeFields replaces the whole healthDataConsent map (no deep merge):
    // a previous withdrawnAt or an older field must not survive a new grant.
    await db.doc(`user_preferences/${uid}`).set(
      {
        healthDataConsent: {
          granted: true,
          grantedAt: new Date().toISOString(),
          version: HEALTH_CONSENT_VERSION,
        },
      },
      { mergeFields: ["healthDataConsent"] }
    );

    return { version: HEALTH_CONSENT_VERSION };
  }
);

/**
 * withdrawHealthConsent — Withdraws the consent to health data processing
 * (GDPR art. 7.3). Input: {}. Output: { success: true }.
 * Appends the withdrawal to consent_records (proof, never edited) and replaces
 * user_preferences/{uid}.healthDataConsent with { granted: false, withdrawnAt,
 * version }. Scheduled jobs (reminders, recaps) stop processing the user.
 */
exports.withdrawHealthConsent = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "withdrawHealthConsent");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "consent", 10);

    await db.collection("consent_records").add({
      uid,
      type: "health_data",
      granted: false,
      withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
      version: HEALTH_CONSENT_VERSION,
    });
    await db.doc(`user_preferences/${uid}`).set(
      {
        healthDataConsent: {
          granted: false,
          withdrawnAt: new Date().toISOString(),
          version: HEALTH_CONSENT_VERSION,
        },
      },
      { mergeFields: ["healthDataConsent"] }
    );
    return { success: true };
  }
);

// ============================================
// SIGN IN WITH APPLE — token revocation on account deletion
// ============================================

/**
 * registerAppleRevocation — Exchanges the Sign in with Apple authorization
 * code for a refresh token and keeps it (server-only apple_tokens/{uid}) so
 * purgeUserData can revoke it at Apple. Input: { authorizationCode }.
 * Output: { stored: boolean }. Never blocks the user: missing secrets or an
 * Apple refusal give { stored: false } and are logged, not thrown.
 */
exports.registerAppleRevocation = onCall(
  withAppCheck({ region: "europe-west1", secrets: APPLE_SECRETS }),
  async (request) => {
    monitorAppCheck(request, "registerAppleRevocation");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const code = request.data?.authorizationCode;
    if (typeof code !== "string" || code.length === 0 || code.length > 1000) {
      throw new HttpsError("invalid-argument", "Code d'autorisation Apple invalide.");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "apple", 5);

    const userRecord = await admin.auth().getUser(uid);
    if (!userRecord.providerData?.some((p) => p.providerId === "apple.com")) {
      throw new HttpsError("failed-precondition", "Ce compte n'utilise pas Sign in with Apple.");
    }

    const creds = getAppleCredentials();
    if (!creds) {
      console.warn("registerAppleRevocation: Apple secrets not configured, token not stored");
      return { stored: false };
    }

    try {
      const refreshToken = await appleAuth.exchangeAuthorizationCode(creds, code);
      await db.doc(`apple_tokens/${uid}`).set({
        refreshToken,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { stored: true };
    } catch (e) {
      console.error(`registerAppleRevocation: failed for uid=${uid}`, e?.message ?? e);
      return { stored: false };
    }
  }
);

// ============================================
// ACCOUNT DELETION (RGPD)
// ============================================

/**
 * deleteUserAccount — Suppression complète du compte utilisateur et de toutes ses données.
 * Obligatoire pour conformité RGPD (Apple/Google Store requirement).
 */
exports.deleteUserAccount = onCall(
  withAppCheck({ region: "europe-west1", timeoutSeconds: 300, memory: "512MiB", secrets: APPLE_SECRETS }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "deleteUserAccount");

    const uid = request.auth.uid;
    const db = admin.firestore();

    // T4 — This entry point is reserved for platform admins. The user-facing
    // path is the soft-delete workflow (requestAccountDeletion + 30-day
    // pendingDeletion + processScheduledDeletions cron). A direct callable
    // bypassing the grace period was abusable: a malicious client could wipe
    // an account instantly with no recovery window. Enforce admin claim.
    let callerRecord;
    try {
      callerRecord = await admin.auth().getUser(uid);
    } catch {
      throw new HttpsError("internal", "Impossible de vérifier l'identité.");
    }
    if (!callerRecord.customClaims?.admin) {
      throw new HttpsError(
        "permission-denied",
        "Suppression immédiate réservée aux administrateurs. Utilisez la suppression programmée (30 jours) côté application."
      );
    }

    // Optional payload override: admin can target a specific uid.
    const targetUid = request.data?.uid ?? uid;
    if (typeof targetUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) {
      throw new HttpsError("invalid-argument", "uid invalide.");
    }
    const reason = typeof request.data?.reason === "string"
      ? request.data.reason.trim().slice(0, 500)
      : "";

    if (targetUid !== uid) {
      // T0.6 — quand un admin supprime un AUTRE compte, on exige une raison
      // documentée et on écrit dans adminAuditLog (pas juste un console.log).
      // C'est la voie d'évasion la plus sensible : un admin compromis peut
      // effacer N comptes, on veut une trace traçable a posteriori.
      if (reason.length < 5) {
        throw new HttpsError(
          "invalid-argument",
          "reason requis (5-500 chars) pour supprimer le compte d'un autre utilisateur."
        );
      }
      try {
        await writeAdminAudit(db,{
          type: "deleteUserAccount",
          adminUid: uid,
          adminEmail: callerRecord.email || null,
          targetUid,
          reason,
          at: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        // Audit log est la défense principale ici — refuser si on n'arrive
        // pas à le tracer.
        console.error("deleteUserAccount: failed to write audit log", e.message);
        throw new HttpsError(
          "internal",
          "Audit log indisponible — opération annulée pour traçabilité."
        );
      }
      console.log(
        `deleteUserAccount: admin ${uid} deleting account ${targetUid} (reason="${reason.slice(0, 80)}")`
      );
    }

    // Rate limit on the admin caller (not the target).
    await checkRateLimit(db, uid, "delete", 1);

    try {
      await purgeUserData(db, targetUid);
    } catch (e) {
      console.error(`deleteUserAccount: purge failed for uid=${targetUid}`, e?.message ?? e);
      throw new HttpsError("internal", "Suppression interrompue, relancez-la : rien n'a été confirmé.");
    }

    console.log(`deleteUserAccount: completed for uid=${targetUid} (admin=${uid})`);
    return { success: true };
  }
);

// ============================================
// REVENUECAT WEBHOOK
// ============================================

/** RevenueCat app_user_id that can be a Firestore doc id (uid): no anonymous ids, no path separators. */
function isRevenueCatUid(value) {
  return typeof value === "string" && !value.startsWith("$RCAnonymous") && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * RevenueCat TRANSFER: the purchases of one or more app_user_ids moved to
 * others (login on a device that had an anonymous or another id). The event
 * carries `transferred_from` / `transferred_to` and no `app_user_id`, so it
 * is handled before the per-user flow. The entitlement stored for the source
 * account(s) moves to the destination account(s) and the sources fall back to
 * free, in one transaction together with the dedup marker.
 *
 * With no stored entitlement on the sources (anonymous id), the event's own
 * entitlement_ids / expiration are used when present; otherwise there is
 * nothing to move and the next RENEWAL event re-establishes the state.
 */
async function handleRevenueCatTransfer(db, event, eventId, eventTs, res) {
  const fromIds = [...new Set((Array.isArray(event.transferred_from) ? event.transferred_from : []).filter(isRevenueCatUid))].slice(0, 20);
  const toIds = [...new Set((Array.isArray(event.transferred_to) ? event.transferred_to : []).filter(isRevenueCatUid))].slice(0, 20);
  if (toIds.length === 0) {
    res.status(200).send("OK - transfer without destination");
    return;
  }

  // Destination accounts that no longer exist must not get a ghost document.
  const targets = [];
  for (const uid of toIds) {
    try {
      await admin.auth().getUser(uid);
      targets.push(uid);
    } catch (err) {
      if (err?.code === "auth/user-not-found") continue;
      console.error("revenueCatWebhook: TRANSFER getUser check failed:", err?.message ?? err);
      res.status(500).send("Auth lookup failed");
      return;
    }
  }

  const dedupRef = eventId ? db.doc(`revenuecat_webhook_events/${eventId}`) : null;
  const now = Date.now();
  const stamp = {
    lastEvent: "TRANSFER",
    updatedAt: admin.firestore.Timestamp.now(),
    ...(eventTs !== null && { lastEventTimestampMs: eventTs }),
  };
  const isNewerThanEvent = (data) =>
    eventTs !== null && typeof data.lastEventTimestampMs === "number" && data.lastEventTimestampMs > eventTs;
  const expiryOf = (data) => (data.expiresAt ? Date.parse(data.expiresAt) : Infinity);

  let duplicate = false;
  try {
    await db.runTransaction(async (tx) => {
      const dedupSnap = dedupRef ? await tx.get(dedupRef) : null;
      if (dedupSnap?.exists) {
        duplicate = true;
        return;
      }
      const sources = [];
      for (const uid of fromIds) {
        const snap = await tx.get(db.doc(`subscriptions/${uid}`));
        if (snap.exists) sources.push({ uid, data: snap.data() });
      }
      const targetSnaps = [];
      for (const uid of targets) {
        const snap = await tx.get(db.doc(`subscriptions/${uid}`));
        targetSnaps.push({ uid, data: snap.exists ? snap.data() : {} });
      }

      if (dedupRef) {
        tx.create(dedupRef, {
          eventId,
          eventType: "TRANSFER",
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: admin.firestore.Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000),
        });
      }

      // Entitlement to move: the stored one that lasts longest, else the event's own.
      const entitled = sources
        .filter(({ data }) => !isNewerThanEvent(data))
        .filter(({ data }) => (data.tier || "free") !== "free" && isEntitledStatus(subscriptionStateFrom({ exists: true, data: () => data }), now))
        .sort((a, b) => expiryOf(b.data) - expiryOf(a.data));
      let moved = null;
      if (entitled.length > 0) {
        const { tier, status, billingPeriod, expiresAt, productId } = entitled[0].data;
        moved = { tier, status, billingPeriod: billingPeriod || "unknown", ...(expiresAt && { expiresAt }), ...(productId && { productId }) };
      } else if (Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0) {
        const ids = event.entitlement_ids;
        const tier = ids.includes("family") ? "family" : ids.includes("premium") ? "premium" : null;
        if (tier) {
          const productId = event.product_id || "";
          const expiryMs = event.expiration_at_ms;
          moved = {
            tier,
            status: "active",
            billingPeriod: productId.includes("lifetime") ? "lifetime" : productId.includes("annual") ? "annual" : productId.includes("monthly") ? "monthly" : "unknown",
            ...(Number.isFinite(expiryMs) && expiryMs > 0 && { expiresAt: new Date(expiryMs).toISOString() }),
            ...(productId && { productId }),
          };
        }
      }
      if (!moved) return;

      // Sources lose the entitlement (unless a later event already updated them).
      for (const { uid, data } of sources) {
        if ((data.tier || "free") === "free" || isNewerThanEvent(data)) continue;
        tx.set(db.doc(`subscriptions/${uid}`), { tier: "free", status: "expired", ...stamp }, { merge: true });
      }
      // Destinations receive it, except one that already holds a longer entitlement.
      for (const { uid, data } of targetSnaps) {
        if (isNewerThanEvent(data)) continue;
        const holdsLonger = (data.tier || "free") !== "free" &&
          isEntitledStatus(subscriptionStateFrom({ exists: true, data: () => data }), now) &&
          expiryOf(data) >= expiryOf(moved);
        if (holdsLonger) continue;
        tx.set(db.doc(`subscriptions/${uid}`), { ...moved, ...stamp, transferredFrom: fromIds }, { merge: true });
      }
    });
  } catch (err) {
    console.error(`revenueCatWebhook: TRANSFER failed for event ${eventId ?? "(no id)"}:`, err);
    res.status(500).send("Processing failed");
    return;
  }
  if (duplicate) {
    console.log(`revenueCatWebhook: duplicate TRANSFER ${eventId}, skipping`);
    res.status(200).send("OK - duplicate");
    return;
  }
  console.log(`revenueCatWebhook: TRANSFER from [${fromIds.length}] to [${targets.length}] ids processed`);
  res.status(200).send("OK");
}

/**
 * revenueCatWebhook — Reçoit les événements RevenuCat et met à jour Firestore.
 * URL à configurer dans RevenuCat Dashboard → Integrations → Webhooks.
 *
 * Hardening Lot 0 (T0.2) :
 *  - Comparaison constant-time du Bearer pour éviter timing attacks.
 *  - Idempotence par event.id : rejet duplicate si déjà traité (cache 30j
 *    via TTL Firestore sur revenuecat_webhook_events.expireAt).
 *  - Validation timestamp event : refus si > 5min futur ou > 7j passé
 *    (anti-replay grossier).
 *  - Skip si Firebase Auth user n'existe plus (évite user fantôme post-
 *    suppression de compte) — voir T0.5 RGPD orphelins.
 */
exports.revenueCatWebhook = onRequest(
  { region: "europe-west1", secrets: ["REVENUECAT_WEBHOOK_SECRET"] },
  async (req, res) => {
    // Vérifier la méthode
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Vérifier le secret — OBLIGATOIRE, rejeter si non configuré
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
      console.error("revenueCatWebhook: REVENUECAT_WEBHOOK_SECRET not configured");
      res.status(500).send("Webhook not configured");
      return;
    }
    const authHeader = req.headers.authorization || "";
    const expected = `Bearer ${secret}`;
    // Constant-time compare : évite que la durée de la comparaison string
    // révèle combien de caractères du secret sont corrects (timing attack).
    if (
      authHeader.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      console.warn("revenueCatWebhook: invalid auth header");
      res.status(401).send("Unauthorized");
      return;
    }

    const event = req.body?.event;
    if (!event) {
      res.status(400).send("Missing event");
      return;
    }

    // T0.2 — anti-replay grossier sur le timestamp. RC envoie event_timestamp_ms.
    // Si l'event est étiqueté très loin dans le futur ou le passé, suspect.
    const eventTs = typeof event.event_timestamp_ms === "number"
      ? event.event_timestamp_ms
      : null;
    if (eventTs !== null) {
      const now = Date.now();
      const FIVE_MIN = 5 * 60 * 1000;
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      if (eventTs > now + FIVE_MIN || eventTs < now - SEVEN_DAYS) {
        console.error(
          `revenueCatWebhook: timestamp out of bounds (${eventTs} vs now=${now}), event ignored`
        );
        // 200 OK pour éviter que RC retry — on accepte le rejet silencieux.
        res.status(200).send("OK - timestamp rejected");
        return;
      }
    }

    // T0.2 — idempotence par event.id (UUID unique par event RC). Le marqueur
    // est lu et créé DANS la transaction qui écrit l'abonnement (plus bas) :
    // si le traitement échoue, rien n'est marqué et le retry de RevenueCat
    // retraite l'événement au lieu de le prendre pour un doublon.
    const eventId = typeof event.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(event.id)
      ? event.id
      : null;
    if (event.id !== undefined && !eventId) {
      console.error("revenueCatWebhook: invalid event id, skipping");
      res.status(200).send("OK - invalid event id");
      return;
    }
    const db = admin.firestore();
    const dedupRef = eventId ? db.doc(`revenuecat_webhook_events/${eventId}`) : null;

    // TRANSFER n'a pas d'app_user_id : traité à part, avant le flux par utilisateur.
    if (event.type === "TRANSFER") {
      await handleRevenueCatTransfer(db, event, eventId, eventTs, res);
      return;
    }

    const appUserId = event.app_user_id;
    if (!appUserId || (typeof appUserId === "string" && appUserId.startsWith("$RCAnonymous"))) {
      // Ignorer les utilisateurs anonymes
      res.status(200).send("OK - skipped anonymous");
      return;
    }
    // app_user_id = uid Firebase : refuser tout ce qui pourrait former un
    // autre chemin Firestore (ex. "a/b") dans subscriptions/{appUserId}.
    if (typeof appUserId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(appUserId)) {
      console.warn("revenueCatWebhook: invalid app_user_id, skipping");
      res.status(200).send("OK - invalid user id");
      return;
    }

    // T0.2 + T0.5 — skip si le user Firebase Auth n'existe plus (compte
    // supprimé). Évite de recréer un user fantôme dans subscriptions/
    // via un webhook RC en retard. RC retry pendant ~3 jours → check
    // côté Auth tant qu'on est dans cette fenêtre.
    try {
      await admin.auth().getUser(appUserId);
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        console.log(
          `revenueCatWebhook: user ${appUserId} no longer exists in Auth, skipping`
        );
        res.status(200).send("OK - user deleted");
        return;
      }
      // Autre erreur (réseau Auth, etc.) : 500 pour que RevenueCat réessaie
      // (rien n'est encore marqué comme traité).
      console.error(`revenueCatWebhook: getUser check failed:`, err?.message ?? err);
      res.status(500).send("Auth lookup failed");
      return;
    }

    const eventType = event.type;
    const entitlements = event.entitlement_ids || [];

    // Déterminer le tier
    let tier = "free";
    if (entitlements.includes("family")) tier = "family";
    else if (entitlements.includes("premium")) tier = "premium";

    // Déterminer le status
    let status = "active";
    // BILLING_ISSUE : la période de grâce du store (si activée) est portée par
    // grace_period_expiration_at_ms ; l'accès reste ouvert jusque-là.
    const expiryMs =
      eventType === "BILLING_ISSUE" && typeof event.grace_period_expiration_at_ms === "number"
        ? event.grace_period_expiration_at_ms
        : event.expiration_at_ms;
    const expiresAt = Number.isFinite(expiryMs) && expiryMs > 0 ? new Date(expiryMs).toISOString() : null;

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
      case "UNCANCELLATION":
      case "NON_RENEWING_PURCHASE":
      case "SUBSCRIPTION_EXTENDED":
      case "TEMPORARY_ENTITLEMENT_GRANT":
        status = "active";
        break;
      case "CANCELLATION":
        // CUSTOMER_SUPPORT = remboursement : l'accès est retiré tout de suite.
        // Les autres raisons (désabonnement, erreur de paiement…) gardent
        // l'accès jusqu'à expiresAt.
        if (event.cancel_reason === "CUSTOMER_SUPPORT") {
          status = "expired";
          tier = "free";
        } else {
          status = "cancelled";
        }
        break;
      case "BILLING_ISSUE":
        status = "billing_issue";
        break;
      case "EXPIRATION":
        status = "expired";
        tier = "free";
        break;
      case "SUBSCRIBER_ALIAS":
        // Juste un alias, pas de changement de status
        res.status(200).send("OK - alias");
        return;
      default:
        // TEST, SUBSCRIPTION_PAUSED, INVOICE_ISSUANCE… : ne pas
        // écraser l'abonnement avec un status "active" et un tier déduit
        // d'entitlement_ids éventuellement vides.
        console.log(`revenueCatWebhook: unhandled event type ${eventType}, skipping`);
        res.status(200).send("OK - ignored");
        return;
    }

    // Mettre à jour Firestore
    // Déterminer le billing period depuis le product ID
    const productId = event.product_id || "";
    let billingPeriod = "unknown";
    if (productId.includes("lifetime")) billingPeriod = "lifetime";
    else if (productId.includes("annual")) billingPeriod = "annual";
    else if (productId.includes("monthly")) billingPeriod = "monthly";

    const subscriptionData = {
      tier,
      status,
      billingPeriod,
      ...(expiresAt && { expiresAt }),
      ...(productId && { productId }),
      ...(eventTs !== null && { lastEventTimestampMs: eventTs }),
      updatedAt: admin.firestore.Timestamp.now(),
      lastEvent: eventType,
    };

    // Transaction : marqueur anti-doublon + abonnement écrits ensemble (ou pas
    // du tout). Évite aussi les race conditions entre deux webhooks simultanés.
    let duplicate = false;
    try {
      await db.runTransaction(async (tx) => {
        const subRef = db.doc(`subscriptions/${appUserId}`);
        const dedupSnap = dedupRef ? await tx.get(dedupRef) : null;
        if (dedupSnap?.exists) {
          duplicate = true;
          return;
        }
        const existing = await tx.get(subRef);
        const existingData = existing.exists ? existing.data() : {};
        if (dedupRef) {
          tx.create(dedupRef, {
            eventId,
            eventType: eventType ?? "unknown",
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            // TTL field — Firestore TTL policy auto-purge après expireAt.
            // Provisionner avec functions/scripts/enable-rc-webhook-ttl.js.
            expireAt: admin.firestore.Timestamp.fromMillis(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ),
          });
        }

        // Ne pas écraser l'état avec un event plus ancien que le dernier traité
        // (RevenueCat ne garantit pas l'ordre de livraison ni des retries).
        // On compare les horodatages des events, pas l'heure de traitement.
        if (eventTs !== null &&
            typeof existingData.lastEventTimestampMs === "number" &&
            existingData.lastEventTimestampMs > eventTs) {
          console.log(`revenueCatWebhook: skipping out-of-order event for ${appUserId}`);
          return;
        }

        tx.set(subRef, subscriptionData, { merge: true });
      });
    } catch (err) {
      console.error(`revenueCatWebhook: processing failed for event ${eventId ?? "(no id)"}:`, err);
      res.status(500).send("Processing failed");
      return;
    }
    if (duplicate) {
      console.log(`revenueCatWebhook: duplicate event ${eventId}, skipping`);
      res.status(200).send("OK - duplicate");
      return;
    }

    // Log webhook pour debug et audit — non bloquant : l'abonnement est déjà
    // écrit et l'événement marqué ; un échec ici ne doit pas renvoyer 5xx.
    try {
      await db.collection("webhook_logs").add({
        source: "revenuecat",
        appUserId,
        eventType,
        tier,
        status,
        productId,
        processedAt: admin.firestore.Timestamp.now(),
        expireAt: logExpireAt(),
      });
    } catch (err) {
      console.error("revenueCatWebhook: webhook_logs write failed:", err?.message ?? err);
    }

    console.log(`revenueCatWebhook: uid=${appUserId}, type=${eventType}, tier=${tier}, status=${status}`);
    res.status(200).send("OK");
  }
);

// ============================================
// ADMIN CLAIM MANAGEMENT (T0.3)
// ============================================

/**
 * setAdminClaim — Promeut ou rétrograde un utilisateur en admin.
 *
 * Source unique pour gérer le custom claim `admin`. Avant cette CF, le claim
 * était settable uniquement via Firebase Console (zéro audit, zéro restriction).
 *
 * Sécurité :
 *  - Le caller doit déjà être admin (`request.auth.token.admin === true`).
 *  - Bootstrap : un seed email est défini via la secret env INITIAL_ADMIN_EMAIL ;
 *    si zéro admin existe encore et que le caller a cet email, on autorise.
 *  - Toute action est loggée dans adminAuditLog avec type="setAdminClaim".
 *  - Refus de se dépromouvoir soi-même (sinon œuf-et-poule pour les corrections).
 *
 * Limites :
 *  - Le claim ne prend effet que sur le PROCHAIN token (refresh).
 *    Le client doit appeler `getIdToken(true)` pour le force-refresh.
 */
/** True when at least one Firebase Auth user carries the admin custom claim. */
async function anyAdminExists() {
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    if (page.users.some((user) => user.customClaims?.admin === true)) return true;
    pageToken = page.pageToken;
  } while (pageToken);
  return false;
}

exports.setAdminClaim = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["INITIAL_ADMIN_EMAIL"] }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "setAdminClaim");

    // Un e-mail non vérifié ne prouve rien : ni l'adresse seed, ni un admin.
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError(
        "permission-denied",
        "Adresse e-mail non vérifiée.",
        { reason: "email-not-verified" },
      );
    }

    const callerUid = request.auth.uid;
    const callerEmail = request.auth.token.email || "";
    const callerIsAdmin = request.auth.token.admin === true;
    const seedEmail = process.env.INITIAL_ADMIN_EMAIL || "";

    const { targetUid, value, reason } = request.data || {};

    if (typeof targetUid !== "string" || !targetUid) {
      throw new HttpsError("invalid-argument", "targetUid requis (string).");
    }
    if (typeof value !== "boolean") {
      throw new HttpsError("invalid-argument", "value requis (boolean).");
    }
    if (typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500) {
      throw new HttpsError(
        "invalid-argument",
        "reason requis (string, 5-500 chars). Documente pourquoi tu promues/dépromues."
      );
    }
    if (callerUid === targetUid && value === false) {
      // Pas de self-demotion — évite de se retrouver sans aucun admin.
      throw new HttpsError(
        "failed-precondition",
        "Vous ne pouvez pas vous dépromouvoir vous-même. Demandez à un autre admin."
      );
    }

    // Bootstrap check : si le caller n'est pas admin, est-ce qu'on a une
    // raison d'accepter quand même ? Oui, seulement si :
    //   1. Le caller a l'email seed INITIAL_ADMIN_EMAIL
    //   2. AUCUN admin n'existe encore (sinon le seed est inutile/dangereux)
    if (!callerIsAdmin) {
      if (!seedEmail || callerEmail.toLowerCase() !== seedEmail.toLowerCase()) {
        throw new HttpsError(
          "permission-denied",
          "Seuls les admins existants peuvent gérer le claim admin."
        );
      }
      // Le bootstrap ne sert qu'une fois : il se ferme dès qu'un admin existe,
      // d'après Firebase Auth (source de vérité, même si le journal d'audit a
      // été purgé ou le claim posé à la main) ou d'après le journal d'audit.
      const db = admin.firestore();
      if (await anyAdminExists()) {
        throw new HttpsError(
          "permission-denied",
          "Le seed admin n'est utilisable qu'avant le premier admin promu."
        );
      }
      const adminCountSnap = await db
        .collection("adminAuditLog")
        .where("type", "==", "setAdminClaim")
        .where("value", "==", true)
        .limit(1)
        .get();
      if (!adminCountSnap.empty) {
        throw new HttpsError(
          "permission-denied",
          "Le seed admin n'est utilisable qu'avant le premier admin promu."
        );
      }
    }

    // Appliquer le claim. Lire les claims existants pour ne pas écraser
    // d'autres custom claims qu'on n'a pas en tête.
    let targetUser;
    try {
      targetUser = await admin.auth().getUser(targetUid);
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        throw new HttpsError("not-found", `Utilisateur ${targetUid} introuvable.`);
      }
      throw err;
    }
    const existingClaims = targetUser.customClaims || {};
    const newClaims = { ...existingClaims };
    if (value) {
      newClaims.admin = true;
    } else {
      delete newClaims.admin;
    }
    await admin.auth().setCustomUserClaims(targetUid, newClaims);

    // Audit log obligatoire, on ne fait pas best-effort ici : la trace est
    // la défense principale contre les abus admin.
    const db = admin.firestore();
    await writeAdminAudit(db,{
      type: "setAdminClaim",
      adminUid: callerUid,
      adminEmail: callerEmail,
      targetUid,
      targetEmail: targetUser.email || null,
      value,
      reason: reason.trim(),
      bootstrapMode: !callerIsAdmin,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `setAdminClaim: ${callerUid} → ${targetUid} admin=${value} (reason="${reason.slice(0, 50)}")`
    );
    return {
      success: true,
      // Le client doit appeler firebase.auth().currentUser.getIdToken(true)
      // pour que le claim soit appliqué côté client.
      requiresTokenRefresh: true,
    };
  }
);

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

/**
 * redeemShareCodeCF — Échange un code de partage contre un accès enfant.
 *
 * Avant cette CF, le redeem se faisait côté client en 3 calls Firestore
 * séparés (read shareCode, update used, setDoc access). Une race entre
 * deux calls concurrents pouvait créer deux accès avec un seul code,
 * et il n'y avait aucun rate limit (1B combos bruteforce-able).
 *
 * Garanties :
 *  - Transaction Firestore : read + update used + create access dans un
 *    seul commit atomique. Race conditions impossibles.
 *  - Rate limit 5/min/uid via checkRateLimit (anti brute-force codes).
 *  - Message d'erreur générique ("code invalide ou expiré") pour ne pas
 *    leak l'existence d'un childId (B1-S4).
 *  - Vérifications : auth, code uppercase, code existe, !used, !expired,
 *    user pas déjà accès, user a un email vérifié.
 *
 * Retourne le childId/childName pour navigation client immédiate.
 */
exports.redeemShareCodeCF = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "redeemShareCodeCF");

    const uid = request.auth.uid;
    const userEmail = request.auth.token.email;
    if (!userEmail) {
      throw new HttpsError(
        "failed-precondition",
        "Vous devez avoir un email associé à votre compte."
      );
    }
    assertVerifiedEmail(request);

    const rawCode = request.data?.code;
    if (typeof rawCode !== "string" || rawCode.trim().length === 0) {
      throw new HttpsError("invalid-argument", "code requis (string).");
    }
    const code = rawCode.trim().toUpperCase();
    // Garde fou cosmétique : codes attendus 6-12 chars alphanum. Permet de
    // rejeter immédiatement les inputs farfelus (1MB de string).
    if (!/^[A-Z0-9-]{4,16}$/.test(code)) {
      throw new HttpsError("invalid-argument", "Code invalide ou expiré.");
    }

    const db = admin.firestore();
    // T0 — rate limit anti brute-force. 5/min/uid laisse de la marge à un
    // utilisateur qui retape, mais bloque l'énumération automatisée.
    await checkRateLimit(db, uid, "redeem_share", 5);

    const codeRef = db.doc(`shareCodes/${code}`);

    let resultData;
    try {
      await db.runTransaction(async (tx) => {
        const codeDoc = await tx.get(codeRef);
        if (!codeDoc.exists) {
          throw new HttpsError("not-found", "Code invalide ou expiré.");
        }
        const shareCode = codeDoc.data();

        if (shareCode.used === true) {
          // Message générique : on ne distingue pas "déjà utilisé" de
          // "n'existe pas" pour ne pas confirmer à un attaquant qu'un code
          // a existé (info utilisable pour cartographier des childIds).
          throw new HttpsError("not-found", "Code invalide ou expiré.");
        }

        // expiresAt peut être un Timestamp Firestore. toMillis robuste.
        const expiresMs =
          shareCode.expiresAt?.toMillis?.() ??
          shareCode.expiresAt?._seconds * 1000 ??
          0;
        if (expiresMs && expiresMs < Date.now()) {
          throw new HttpsError("not-found", "Code invalide ou expiré.");
        }

        const childId = shareCode.childId;
        if (!childId) {
          throw new HttpsError("internal", "Code corrompu (childId absent).");
        }

        // Vérifier que l'utilisateur n'a pas déjà accès à cet enfant.
        const existingAccessRef = db.doc(`children/${childId}/access/${uid}`);
        const existingAccess = await tx.get(existingAccessRef);
        if (existingAccess.exists) {
          throw new HttpsError(
            "already-exists",
            "Vous avez déjà accès à cet enfant."
          );
        }

        await assertJoinStillValid(tx, db, childId, shareCode.createdBy, "Code invalide ou expiré.");

        // 1. Marquer le code comme utilisé (champs exigés par firestore.rules).
        tx.update(codeRef, {
          used: true,
          usedBy: uid,
          usedByEmail: userEmail,
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 2. Créer le doc d'accès. Rôle contributor : likes et commentaires
        //    uniquement, pas d'écriture d'événements (DEFAULT_ROLE_PERMISSIONS
        //    côté client, décision D11 du 2026-11-02).
        tx.set(existingAccessRef, {
          userId: uid,
          role: "contributor",
          ...CONTRIBUTOR_PERMISSIONS,
          grantedBy: shareCode.createdBy,
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
          invitationId: code,
        });

        // 3. Créer l'entrée d'index user_child_access pour le listing rapide
        //    côté client.
        const indexRef = db.doc(`user_child_access/${uid}_${childId}`);
        tx.set(indexRef, {
          userId: uid,
          childId,
          invitationId: code,
          grantedBy: shareCode.createdBy,
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        resultData = {
          childId,
          childName: shareCode.childName ?? "",
        };
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("redeemShareCodeCF transaction error:", err);
      throw new HttpsError("internal", "Erreur lors de l'utilisation du code.");
    }

    return resultData;
  }
);

/**
 * acceptInvitationCF — Accepte une invitation par email de manière transactional.
 *
 * Avant : 3 calls Firestore séparés côté client (read invitation, read access,
 * grantChildAccess + update status). Deux acceptations concurrentes pouvaient
 * créer deux docs access (status check pas atomique).
 *
 * Garanties :
 *  - Transaction : read invitation + check status + create access + mark
 *    accepted, atomique. Race acceptation concurrente impossible.
 *  - Rate limit 5/min/uid.
 *  - Vérification que l'utilisateur est bien destinataire (uid ou email).
 *  - Si l'access existe déjà, on marque juste l'invitation accepted (idempotent).
 */
exports.acceptInvitationCF = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "acceptInvitationCF");
    assertVerifiedEmail(request);

    const uid = request.auth.uid;
    const userEmail = (request.auth.token.email || "").toLowerCase();
    const invitationId = request.data?.invitationId;

    if (typeof invitationId !== "string" || invitationId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "invitationId requis (string).");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "accept_invite", 5);

    const invitationRef = db.doc(`shareInvitations/${invitationId}`);

    try {
      await db.runTransaction(async (tx) => {
        const inviteDoc = await tx.get(invitationRef);
        if (!inviteDoc.exists) {
          throw new HttpsError("not-found", "Invitation introuvable.");
        }
        const invitation = inviteDoc.data();

        // Destinataire : on accepte si invitedUserId === uid, OU si
        // invitedEmail correspond à l'email du user.
        const matchByUid = invitation.invitedUserId === uid;
        const matchByEmail = (invitation.invitedEmail || "").toLowerCase() === userEmail && userEmail.length > 0;
        if (!matchByUid && !matchByEmail) {
          throw new HttpsError("permission-denied", "Cette invitation ne vous est pas destinée.");
        }

        if (invitation.status !== "pending") {
          throw new HttpsError("failed-precondition", "Cette invitation a déjà été traitée.");
        }

        const childId = invitation.childId;
        if (!childId) {
          throw new HttpsError("internal", "Invitation corrompue (childId absent).");
        }

        const accessRef = db.doc(`children/${childId}/access/${uid}`);
        const existingAccess = await tx.get(accessRef);

        if (!existingAccess.exists) {
          await assertJoinStillValid(tx, db, childId, invitation.inviterId, "Invitation introuvable.");

          // Créer l'access (rôle contributor : likes et commentaires uniquement).
          tx.set(accessRef, {
            userId: uid,
            role: "contributor",
            ...CONTRIBUTOR_PERMISSIONS,
            grantedBy: invitation.inviterId,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
            invitationId,
          });

          // Index user_child_access.
          tx.set(db.doc(`user_child_access/${uid}_${childId}`), {
            userId: uid,
            childId,
            invitationId,
            grantedBy: invitation.inviterId,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        // Marquer l'invitation acceptée (idempotent : marche aussi si access
        // existait déjà → on signale juste qu'elle est traitée).
        tx.update(invitationRef, { status: "accepted" });
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("acceptInvitationCF transaction error:", err);
      throw new HttpsError("internal", "Erreur lors de l'acceptation de l'invitation.");
    }

    return { success: true };
  }
);

// ============================================
// REFERRAL SYSTEM
// ============================================

// Referral codes are created by the server only (audit A2): the client can no
// longer write referralCode / referredBy / referralCount (firestore.rules), and
// referral_codes/{code} maps a code to its owner without a forgeable query.
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Rewards granted to one referrer (the referred user is always rewarded once).
const REFERRAL_REWARD_CAP = 10;

function generateServerReferralCode() {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) code += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  return `SAM-${code.slice(0, 4)}-${code.slice(4)}`;
}

function normalizeReferralCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * ensureReferralCode — Renvoie le code parrainage de l'utilisateur, en le
 * créant côté serveur s'il n'existe pas. Un ancien code généré par l'app est
 * repris s'il n'appartient à personne d'autre.
 */
exports.ensureReferralCode = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "referralCode", 10);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = await db.runTransaction(async (tx) => {
        const promosRef = db.doc(`user_promos/${uid}`);
        const promosSnap = await tx.get(promosRef);
        const stored = normalizeReferralCode(promosSnap.exists ? promosSnap.data()?.referralCode : "");
        // An old app-written code becomes a document id: reject odd values.
        const current = /^[A-Z0-9-]{4,20}$/.test(stored) ? stored : "";
        if (current) {
          const mappingRef = db.doc(`referral_codes/${current}`);
          const mapping = await tx.get(mappingRef);
          if (mapping.exists && mapping.data()?.uid === uid) return current;
          if (!mapping.exists) {
            tx.create(mappingRef, { uid, createdAt: admin.firestore.Timestamp.now(), legacy: true });
            return current;
          }
        }
        const candidate = generateServerReferralCode();
        const candidateRef = db.doc(`referral_codes/${candidate}`);
        const taken = await tx.get(candidateRef);
        if (taken.exists) return null;
        tx.create(candidateRef, { uid, createdAt: admin.firestore.Timestamp.now() });
        tx.set(promosRef, { referralCode: candidate }, { merge: true });
        return candidate;
      });
      if (code) return { referralCode: code };
    }
    throw new HttpsError("resource-exhausted", "Impossible de créer un code, réessayez.");
  }
);

/**
 * validateReferralCode — Valide un code parrainage et attribue 1 mois Premium
 * au filleul, et au parrain dans la limite de REFERRAL_REWARD_CAP.
 * Un compte ne peut être parrainé qu'une fois : referrals/{filleulUid} est
 * créé dans la même transaction que les récompenses.
 */
exports.validateReferralCode = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    if (request.auth.token?.email_verified !== true) {
      throw new HttpsError("failed-precondition", "Vérifiez votre adresse e-mail avant d'utiliser un code.");
    }

    const filleulUid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, filleulUid, "referral", 5);

    const referralCode = normalizeReferralCode(request.data?.referralCode);
    if (!/^[A-Z0-9-]{4,20}$/.test(referralCode)) {
      throw new HttpsError("invalid-argument", "Code parrainage invalide.");
    }

    // Parrain : table referral_codes (codes serveur), sinon ancien code stocké
    // dans user_promos (créé par l'app avant le correctif).
    let parrainUid = null;
    const mapping = await db.doc(`referral_codes/${referralCode}`).get();
    if (mapping.exists) {
      parrainUid = mapping.data()?.uid ?? null;
    } else {
      const legacy = await db
        .collection("user_promos")
        .where("referralCode", "==", referralCode)
        .limit(2)
        .get();
      // Two accounts with the same old code: one of them copied it, refuse.
      if (legacy.size === 1) parrainUid = legacy.docs[0].id;
    }
    if (!parrainUid) {
      throw new HttpsError("not-found", "Code parrainage introuvable.");
    }
    if (parrainUid === filleulUid) {
      throw new HttpsError("failed-precondition", "Vous ne pouvez pas utiliser votre propre code.");
    }

    // Parrainages enregistrés avant le correctif (identifiant aléatoire).
    const legacyUse = await db
      .collection("referrals")
      .where("filleulUid", "==", filleulUid)
      .limit(1)
      .get();
    if (!legacyUse.empty) {
      throw new HttpsError("already-exists", "Vous avez deja utilise un code parrainage.");
    }

    const now = admin.firestore.Timestamp.now();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    const reward = {
      tier: "premium",
      status: "active",
      startDate: now.toDate().toISOString(),
      expiresAt: oneMonthLater.toISOString(),
      source: "referral_reward",
    };

    let parrainRewarded = false;
    await db.runTransaction(async (tx) => {
      const referralRef = db.doc(`referrals/${filleulUid}`);
      const filleulPromosRef = db.doc(`user_promos/${filleulUid}`);
      const parrainPromosRef = db.doc(`user_promos/${parrainUid}`);
      const filleulSubRef = db.doc(`subscriptions/${filleulUid}`);
      const parrainSubRef = db.doc(`subscriptions/${parrainUid}`);
      const [used, filleulPromos, parrainPromos, filleulSub, parrainSub] = [
        await tx.get(referralRef),
        await tx.get(filleulPromosRef),
        await tx.get(parrainPromosRef),
        await tx.get(filleulSubRef),
        await tx.get(parrainSubRef),
      ];
      // Paid subscriptions are never overwritten by the reward (read here so
      // a purchase landing meanwhile is seen).
      const filleulState = subscriptionStateFrom(filleulSub);
      const parrainState = subscriptionStateFrom(parrainSub);
      if (used.exists || filleulPromos.data()?.referredBy) {
        throw new HttpsError("already-exists", "Vous avez deja utilise un code parrainage.");
      }
      const referralCount = Number(parrainPromos.data()?.referralCount) || 0;

      tx.create(referralRef, { parrainUid, filleulUid, referralCode, createdAt: now });
      tx.set(parrainPromosRef, { referralCount: referralCount + 1 }, { merge: true });
      tx.set(filleulPromosRef, { referredBy: parrainUid, referredAt: now }, { merge: true });

      if (!hasUnlimitedFeature(filleulState, "voice")) {
        tx.set(filleulSubRef, reward, { merge: true });
      }
      if (referralCount < REFERRAL_REWARD_CAP && !hasUnlimitedFeature(parrainState, "voice")) {
        tx.set(parrainSubRef, reward, { merge: true });
        parrainRewarded = true;
      }
    });

    console.log(`validateReferralCode: parrain=${parrainUid}, filleul=${filleulUid}, parrainRewarded=${parrainRewarded}`);
    return { success: true, parrainUid, message: "1 mois Premium offert !" };
  }
);

// ============================================
// ACCOUNT DELETION REQUEST (server side)
// ============================================

const ACCOUNT_DELETION_GRACE_DAYS = 30;
/** A deletion request needs a login at most this old (seconds). */
const RECENT_LOGIN_MAX_AGE_S = 5 * 60;

/**
 * Sends the "deletion scheduled" e-mail to the Auth address of `uid` and keeps
 * that address with the request (the confirmation can still be sent after the
 * Auth account is gone). Throws HttpsError; shared by sendDeletionRequestEmail
 * (app 1.0.8) and requestAccountDeletion.
 */
async function deliverDeletionRequestEmail(db, uid, deletionDateIso) {
  let email = "";
  try {
    const userRecord = await admin.auth().getUser(uid);
    email = userRecord.email || "";
  } catch {
    throw new HttpsError("internal", "Impossible de recuperer l'email.");
  }

  if (!email) {
    throw new HttpsError("failed-precondition", "Aucun email associe au compte.");
  }

  const deletionDate = new Date(deletionDateIso).toLocaleDateString("fr-FR");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("deliverDeletionRequestEmail: RESEND_API_KEY not configured");
    throw new HttpsError("unavailable", "Envoi d'e-mail indisponible.");
  }

  await db.doc(`users/${uid}`).update({ "pendingDeletion.email": email }).catch((e) => {
    console.error(`deliverDeletionRequestEmail: could not store e-mail for uid=${uid}`, e);
  });

  const resend = new Resend(apiKey);
  await sendEmailOrThrow(resend, {
    from: "Suivi Baby <noreply@suivibaby.com>",
    to: email,
    subject: "Demande de suppression de votre compte Suivi Baby",
    html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Suppression programmee</h2>
          <p>Vous avez demande la suppression de votre compte Suivi Baby.</p>
          <p>Votre compte et toutes vos donnees seront definitivement supprimes le <strong>${deletionDate}</strong>.</p>
          <p>Si vous changez d'avis, vous pouvez annuler cette demande a tout moment depuis les <strong>Parametres</strong> de l'application.</p>
          <p>Si vous n'etes pas a l'origine de cette demande, connectez-vous immediatement a l'application et annulez la suppression, puis changez votre mot de passe.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">Cet email a ete envoye automatiquement par Suivi Baby. Conformite RGPD art. 17.</p>
        </div>
      `,
  });
  return email;
}

/**
 * requestAccountDeletion — Schedules the account deletion (30-day grace
 * period) on the server. Input: {}. Output: { deletionDate: ISO string, emailSent?: boolean }.
 * Needs a login at most 5 minutes old (token auth_time), otherwise
 * failed-precondition with details.reason "recent-login-required".
 * Writes users/{uid}.pendingDeletion = { scheduledAt, deletionDate, email }
 * (ISO strings, the shape app 1.0.8 writes and processScheduledDeletions
 * queries), deletes the device tokens and sends the confirmation e-mail
 * (a failed e-mail does not undo the request). Idempotent: an existing request
 * keeps its date.
 */
exports.requestAccountDeletion = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["RESEND_API_KEY"] }),
  async (request) => {
    monitorAppCheck(request, "requestAccountDeletion");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const authTime = Number(request.auth.token?.auth_time);
    if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > RECENT_LOGIN_MAX_AGE_S) {
      throw new HttpsError(
        "failed-precondition",
        "Reconnectez-vous pour confirmer la suppression du compte.",
        { reason: "recent-login-required" }
      );
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "account_deletion", 5);

    const userSnap = await db.doc(`users/${uid}`).get();
    const existing = userSnap.exists ? userSnap.data()?.pendingDeletion : null;
    if (existing?.deletionDate) {
      return { deletionDate: String(existing.deletionDate) };
    }

    const scheduledAt = new Date();
    const deletionDate = new Date(scheduledAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    let email = "";
    try {
      email = ((await admin.auth().getUser(uid)).email || "").toLowerCase();
    } catch (e) {
      console.warn(`requestAccountDeletion: no Auth e-mail for uid=${uid}`, e?.message ?? e);
    }
    const pendingDeletion = {
      scheduledAt: scheduledAt.toISOString(),
      deletionDate: deletionDate.toISOString(),
      email,
    };
    // mergeFields: replaces the whole map and works when users/{uid} is missing.
    await db.doc(`users/${uid}`).set({ pendingDeletion }, { mergeFields: ["pendingDeletion"] });

    // No push for an account that is leaving.
    await deleteDocsByFieldBatched(db, "device_tokens", "userId", uid);

    // Une erreur d'e-mail n'annule pas la demande, mais elle est signalée au
    // client (emailSent) pour qu'il ne promette pas un e-mail qui ne vient pas.
    let emailSent = true;
    try {
      await deliverDeletionRequestEmail(db, uid, pendingDeletion.deletionDate);
    } catch (e) {
      emailSent = false;
      console.error(`requestAccountDeletion: confirmation e-mail failed for uid=${uid}`, e?.message ?? e);
    }
    return { deletionDate: pendingDeletion.deletionDate, emailSent };
  }
);

/**
 * cancelAccountDeletion — Removes users/{uid}.pendingDeletion during the grace
 * period. Input: {}. Output: { success: true }.
 */
exports.cancelAccountDeletion = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "cancelAccountDeletion");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    await db.doc(`users/${uid}`).set(
      { pendingDeletion: admin.firestore.FieldValue.delete() },
      { merge: true }
    );
    return { success: true };
  }
);

// ============================================
// ACCOUNT DELETION REQUEST EMAIL
// ============================================

/**
 * sendDeletionRequestEmail — Envoie un email confirmant la demande de suppression.
 * Appelé côté client après que l'utilisateur a programmé la suppression.
 */
exports.sendDeletionRequestEmail = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["RESEND_API_KEY"] }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const uid = request.auth.uid;
    const db = admin.firestore();

    const userDoc = await db.doc(`users/${uid}`).get();
    const userData = userDoc.data();
    if (!userData?.pendingDeletion) {
      throw new HttpsError("failed-precondition", "Aucune suppression programmee.");
    }

    await deliverDeletionRequestEmail(db, uid, userData.pendingDeletion.deletionDate);

    return { success: true };
  }
);

// ============================================
// SCHEDULED ACCOUNT DELETION (Grace period 30 days)
// ============================================

const MIN_DELETION_WINDOW_MS = 29 * 24 * 60 * 60 * 1000;

/** Millis of an ISO string, Timestamp, Date or number; null when unusable. */
function pendingDateMillis(value) {
  if (value === null || value === undefined) return null;
  const ms = typeof value?.toMillis === "function" ? value.toMillis()
    : value instanceof Date ? value.getTime()
      : typeof value === "number" ? value
        : typeof value === "string" ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * processScheduledDeletions — Exécutée toutes les 24h.
 * Traite les comptes marqués `pendingDeletion` dont la date est dépassée.
 * Appelle la même logique que deleteUserAccount pour chaque compte expiré.
 */
exports.processScheduledDeletions = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1", timeoutSeconds: 540, memory: "512MiB", secrets: ["RESEND_API_KEY", ...APPLE_SECRETS] },
  async () => {
    const db = admin.firestore();
    const now = new Date().toISOString();

    const snapshot = await db
      .collection("users")
      .where("pendingDeletion.deletionDate", "<=", now)
      .limit(50)
      .get();

    if (snapshot.empty) {
      console.log("processScheduledDeletions: no accounts to delete");
      return;
    }

    console.log(`processScheduledDeletions: processing ${snapshot.size} accounts`);

    for (const userDoc of snapshot.docs) {
      const uid = userDoc.id;
      const pending = userDoc.data()?.pendingDeletion || {};
      // M1: a request must leave the 30-day grace period (29 days tolerated
      // for DST). A shorter or undated window is never executed.
      const scheduledMs = pendingDateMillis(pending.scheduledAt);
      const deletionMs = pendingDateMillis(pending.deletionDate);
      if (scheduledMs === null || deletionMs === null || deletionMs - scheduledMs < MIN_DELETION_WINDOW_MS) {
        console.error(
          `processScheduledDeletions: INVALID_PENDING_DELETION uid=${uid} ignored (deletion window shorter than 29 days or undated)`
        );
        continue;
      }
      try {
        const purged = await purgeUserData(db, uid);
        // Auth may already be gone on a retry: fall back to the address kept
        // with the request.
        const email = purged.email || pending.email || "";

        // E-mail only once everything is really gone (Auth included).
        const apiKey = process.env.RESEND_API_KEY;
        if (!email || !apiKey) {
          console.error(`processScheduledDeletions: no confirmation e-mail for uid=${uid} (${!email ? "no address" : "RESEND_API_KEY missing"})`);
        } else {
          try {
            await sendEmailOrThrow(new Resend(apiKey), {
              from: "Suivi Baby <noreply@suivibaby.com>",
              to: email,
              subject: "Votre compte Suivi Baby a ete supprime",
              html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #1a1a1a;">Suppression confirmee</h2>
                  <p>Votre compte Suivi Baby et toutes les donnees associees ont ete definitivement supprimes, conformement a votre demande.</p>
                  <p>Les saisies faites dans le carnet d'un enfant partage avec d'autres parents restent visibles pour eux, sans votre nom.</p>
                  <p>Si vous n'etes pas a l'origine de cette suppression, contactez-nous immediatement a <a href="mailto:privacy@suivibaby.com">privacy@suivibaby.com</a>.</p>
                  <p style="color: #666; font-size: 12px; margin-top: 30px;">Cet email a ete envoye automatiquement par Suivi Baby. Conformite RGPD art. 17.</p>
                </div>
              `,
            });
          } catch (emailErr) {
            console.error(`processScheduledDeletions: confirmation e-mail failed for uid=${uid}`, emailErr?.message ?? emailErr);
          }
        }

        console.log(`processScheduledDeletions: deleted uid=${uid}`);
      } catch (e) {
        // users/{uid} (and its pendingDeletion) still exists: the next run
        // retries. No confirmation e-mail has been sent.
        const failureCount = (Number(pending.failureCount) || 0) + 1;
        // Stable labels for the log-based alert (docs/FIREBASE_MONITORING.md §9).
        console.error(
          `processScheduledDeletions: error processing uid=${uid} failures=${failureCount}${failureCount >= 3 ? " STUCK" : ""}`,
          e?.stack ?? e?.message ?? e
        );
        await userDoc.ref
          .update({
            "pendingDeletion.lastFailureAt": now,
            "pendingDeletion.lastFailure": String(e?.message ?? e).slice(0, 300),
            "pendingDeletion.failureCount": failureCount,
          })
          .catch((writeErr) => {
            console.error(`processScheduledDeletions: could not record the failure for uid=${uid}`, writeErr);
          });
      }
    }
  }
);

// ============================================
// REMINDER PUSH NOTIFICATIONS (Scheduled)
// ============================================

/**
 * Health data consent gate for scheduled processing: any version counts as
 * long as `granted` is true (consents given by app 1.0.x stay valid).
 */
function hasValidHealthConsent(prefs) {
  return prefs?.healthDataConsent?.granted === true;
}

/** Uids (among `uids`) whose users/{uid} carries a pendingDeletion; batched reads. */
async function usersWithPendingDeletion(db, uids) {
  const pending = new Set();
  const CHUNK = 200;
  for (let i = 0; i < uids.length; i += CHUNK) {
    const refs = uids.slice(i, i + CHUNK).map((uid) => db.doc(`users/${uid}`));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, idx) => {
      if (snap.exists && snap.data()?.pendingDeletion) pending.add(uids[i + idx]);
    });
  }
  return pending;
}

/**
 * Mapping catégorie de rappel → types d'événements Firestore
 */
const REMINDER_CATEGORIES = {
  repas: ["biberon", "tetee", "solide"],
  pompages: ["pompage"],
  changes: ["miction", "selle", "couche"],
  vitamines: ["vitamine"],
};

const CATEGORY_LABELS = {
  repas: "repas",
  pompages: "pompage",
  changes: "change",
  vitamines: "vitamine",
};

/**
 * checkAndSendReminders — Vérification périodique (toutes les 30 min)
 * Pour chaque utilisateur ayant des rappels activés :
 *   - Vérifie le dernier événement par catégorie et par enfant
 *   - Si elapsed > threshold, envoie une notification push
 *   - Anti-spam : pas de re-notification si déjà envoyée il y a < 2h
 */
exports.checkAndSendReminders = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();

    // 1. Récupérer tous les utilisateurs avec rappels activés
    const prefsSnapshot = await db
      .collection("user_preferences")
      .where("notifications.reminders.enabled", "==", true)
      .get();

    if (prefsSnapshot.empty) {
      console.log("checkAndSendReminders: no users with reminders enabled");
      return;
    }

    let totalSent = 0;
    let totalSkipped = 0;

    // No consent, no processing; accounts being deleted get nothing either.
    const consented = prefsSnapshot.docs.filter((d) => hasValidHealthConsent(d.data()));
    const leaving = await usersWithPendingDeletion(db, consented.map((d) => d.id));

    for (const prefDoc of consented) {
      const userId = prefDoc.id;
      if (leaving.has(userId)) continue;
      const prefs = prefDoc.data();
      const thresholds = prefs.notifications?.reminders?.thresholds || {};

      // Skip si les notifications push sont désactivées par l'utilisateur
      if (prefs.notifications?.push === false) continue;

      // 2. Récupérer les device_tokens actifs de cet utilisateur
      const tokensSnap = await db
        .collection("device_tokens")
        .where("userId", "==", userId)
        .where("enabled", "==", true)
        .get();

      if (tokensSnap.empty) continue;

      const pushTokens = tokensSnap.docs
        .map((d) => d.data().token)
        .filter((t) => Expo.isExpoPushToken(t));

      if (pushTokens.length === 0) continue;

      // 3. Récupérer les enfants auxquels l'utilisateur a accès
      const accessSnap = await db
        .collection("user_child_access")
        .where("userId", "==", userId)
        .get();

      for (const accessDoc of accessSnap.docs) {
        const { childId } = accessDoc.data();
        if (!childId) continue;

        // Récupérer le nom de l'enfant
        const childDoc = await db.doc(`children/${childId}`).get();
        if (!childDoc.exists) continue;
        const childName = childDoc.data().name || "Bébé";

        // 4. Pour chaque catégorie avec threshold > 0
        for (const [category, eventTypes] of Object.entries(REMINDER_CATEGORIES)) {
          const thresholdHours = thresholds[category] || 0;
          if (thresholdHours <= 0) continue;

          const thresholdMs = thresholdHours * 3600 * 1000;

          // Dernier événement de cette catégorie pour cet enfant
          const lastEventSnap = await db
            .collection("events")
            .where("childId", "==", childId)
            .where("type", "in", eventTypes)
            .orderBy("date", "desc")
            .limit(1)
            .get();

          if (lastEventSnap.empty) continue;

          const lastEvent = lastEventSnap.docs[0].data();
          const lastEventDate = lastEvent.date?.toMillis?.() ?? 0;
          const elapsedMs = nowMs - lastEventDate;

          if (elapsedMs <= thresholdMs) continue;

          // Anti-spam : vérifier si déjà notifié il y a < 2h
          const twoHoursAgo = admin.firestore.Timestamp.fromMillis(nowMs - 2 * 3600 * 1000);
          const recentNotifSnap = await db
            .collection("notification_history")
            .where("userId", "==", userId)
            .where("childId", "==", childId)
            .where("category", "==", category)
            .where("sentAt", ">", twoHoursAgo)
            .limit(1)
            .get();

          if (!recentNotifSnap.empty) {
            totalSkipped++;
            continue;
          }

          // 5. Envoyer la notification push
          const elapsedHours = Math.round(elapsedMs / 3600000);
          const label = CATEGORY_LABELS[category];
          const messages = pushTokens.map((token) => ({
            to: token,
            sound: "default",
            title: `Rappel ${label} — ${childName}`,
            body: `Plus de ${elapsedHours}h depuis le dernier ${label}`,
            data: {
              type: "reminder",
              category,
              childId,
              route: "/baby/home",
            },
          }));

          try {
            const chunks = expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
              await expo.sendPushNotificationsAsync(chunk);
            }

            // Enregistrer dans l'historique
            await db.collection("notification_history").add({
              userId,
              childId,
              category,
              sentAt: now,
              thresholdHours,
              elapsedHours,
              expireAt: logExpireAt(),
            });

            totalSent++;
          } catch (error) {
            console.error(
              `checkAndSendReminders: error sending to ${userId}/${childId}/${category}:`,
              error.message
            );
          }
        }
      }
    }

    console.log(
      `checkAndSendReminders: sent=${totalSent}, skipped=${totalSkipped}, users=${prefsSnapshot.size}`
    );
  }
);

// ============================================
// WEEKLY RECAP EMAIL (Scheduled)
// ============================================

/** Deep link opened by the recap e-mail button. */
const RECAP_OPEN_APP_URL = "suivibaby://baby/home";

/** HMAC-SHA256(uid) hex: proves an unsubscribe link was issued by the server. */
function recapUnsubscribeToken(uid, secret) {
  return crypto.createHmac("sha256", secret).update(uid).digest("hex");
}

function recapUnsubscribeUrl(uid, secret) {
  return `${FUNCTIONS_BASE_URL}/unsubscribeRecap?uid=${encodeURIComponent(uid)}&token=${recapUnsubscribeToken(uid, secret)}`;
}

/** Constant-time check of an unsubscribe token (length checked first: timingSafeEqual throws otherwise). */
function isValidRecapToken(uid, token, secret) {
  if (typeof uid !== "string" || typeof token !== "string" || !secret) return false;
  const expected = Buffer.from(recapUnsubscribeToken(uid, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** True when the child has at least one event in the week (no figure is read). */
async function hadActivityInWeek(db, childId, weekStart, weekEnd) {
  const snap = await db
    .collection("events")
    .where("childId", "==", childId)
    .where("date", ">=", weekStart)
    .where("date", "<=", weekEnd)
    .orderBy("date", "desc")
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * Formate une date en "9 mars 2026"
 */
function formatDateFr(date) {
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * sendWeeklyRecap — Envoi du récap hebdomadaire chaque lundi à 8h.
 * L'e-mail ne contient AUCUNE donnée de santé : il dit seulement que le récap
 * est prêt dans l'app. Destinataires : utilisateurs ayant activé l'e-mail,
 * adresse issue de Firebase Auth (vérifiée, compte actif), hors suppression
 * programmée, et seulement pour les enfants dont ils sont owner ou admin.
 * Chaque e-mail porte un lien de désinscription en un clic (unsubscribeRecap).
 */
exports.sendWeeklyRecap = onSchedule(
  {
    schedule: "every monday 08:00",
    timeZone: "Europe/Paris",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 300,
    secrets: ["RESEND_API_KEY", RECAP_UNSUBSCRIBE_SECRET],
  },
  async () => {
    console.log("sendWeeklyRecap: START");
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("sendWeeklyRecap: RESEND_API_KEY not configured");
      return;
    }
    const unsubscribeSecret = secretValue(RECAP_UNSUBSCRIBE_SECRET);
    if (!unsubscribeSecret) {
      console.error("sendWeeklyRecap: RECAP_UNSUBSCRIBE_SECRET not configured, no e-mail sent");
      return;
    }

    const resend = new Resend(apiKey);
    const db = admin.firestore();

    // Calculer les bornes de la semaine à récapituler
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=dim, 1=lun
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Lundi de cette semaine
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);

    // Si on est lundi (exécution normale), récapituler la semaine précédente
    // Sinon (exécution forcée), récapituler la semaine courante jusqu'à maintenant
    const isMonday = dayOfWeek === 1;

    const lastMonday = new Date(thisMonday);
    if (isMonday) {
      lastMonday.setDate(thisMonday.getDate() - 7);
    }
    // sinon lastMonday = thisMonday (semaine courante)

    const lastSunday = new Date(isMonday ? thisMonday : now);
    if (isMonday) {
      lastSunday.setDate(thisMonday.getDate() - 1);
    }
    lastSunday.setHours(23, 59, 59, 999);

    console.log(`sendWeeklyRecap: date calc — now=${now.toISOString()}, dayOfWeek=${dayOfWeek}, isMonday=${isMonday}, lastMonday=${lastMonday.toISOString()}, lastSunday=${lastSunday.toISOString()}`);

    const weekStart = admin.firestore.Timestamp.fromDate(lastMonday);
    const weekEnd = admin.firestore.Timestamp.fromDate(lastSunday);

    const weekLabel = `${formatDateFr(lastMonday)} au ${formatDateFr(lastSunday)}`;

    // Récupérer tous les utilisateurs avec email activé
    const prefsSnap = await db
      .collection("user_preferences")
      .where("notifications.email", "==", true)
      .get();

    console.log(`sendWeeklyRecap: found ${prefsSnap.size} users with email enabled, weekLabel=${weekLabel}`);

    if (prefsSnap.empty) {
      console.log("sendWeeklyRecap: no users with email recap enabled");
      return;
    }

    let totalSent = 0;
    let totalSkipped = 0;

    // Sans consentement valide : aucun traitement. Compte en cours de
    // suppression : plus aucun e-mail. Lectures groupées (pas de N+1).
    const consented = prefsSnap.docs.filter((d) => hasValidHealthConsent(d.data()));
    totalSkipped += prefsSnap.size - consented.length;
    const leaving = await usersWithPendingDeletion(db, consented.map((d) => d.id));

    for (const prefDoc of consented) {
      const userId = prefDoc.id;
      if (leaving.has(userId)) {
        totalSkipped++;
        continue;
      }

      // L'adresse vient de Firebase Auth uniquement : vérifiée, compte actif.
      let userEmail;
      try {
        const authUser = await admin.auth().getUser(userId);
        if (!authUser.emailVerified || authUser.disabled || !authUser.email) {
          totalSkipped++;
          continue;
        }
        userEmail = authUser.email;
      } catch (error) {
        console.warn(`sendWeeklyRecap: no usable Auth user for ${userId}`, error.message);
        totalSkipped++;
        continue;
      }

      // Récupérer les enfants de l'utilisateur
      const accessSnap = await db
        .collection("user_child_access")
        .where("userId", "==", userId)
        .get();

      for (const accessDoc of accessSnap.docs) {
        const { childId } = accessDoc.data();
        if (!childId) continue;

        // Seuls les owners et admins reçoivent le récap d'un enfant.
        const roleSnap = await db.doc(`children/${childId}/access/${userId}`).get();
        const role = roleSnap.exists ? roleSnap.data()?.role : null;
        if (role !== "owner" && role !== "admin") {
          totalSkipped++;
          continue;
        }

        // Anti-doublon : vérifier si déjà envoyé pour cette semaine
        const existingSnap = await db
          .collection("recap_history")
          .where("userId", "==", userId)
          .where("childId", "==", childId)
          .where("weekStart", "==", weekStart)
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          console.log(`sendWeeklyRecap: SKIP ${childId} for user ${userId} - already sent this week (docId=${existingSnap.docs[0].id})`);
          totalSkipped++;
          continue;
        }

        // Prénom de l'enfant (seule donnée personnelle du corps du message)
        const childDoc = await db.doc(`children/${childId}`).get();
        if (!childDoc.exists || childDoc.data()?.deletedAt) continue;
        const childName = String(childDoc.data().name || "Bébé").trim().split(/\s+/)[0] || "Bébé";

        if (!(await hadActivityInWeek(db, childId, weekStart, weekEnd))) {
          console.log(`sendWeeklyRecap: SKIP child=${childId} - no activity this week`);
          totalSkipped++;
          continue;
        }

        const unsubscribeUrl = recapUnsubscribeUrl(userId, unsubscribeSecret);
        const html = buildRecapHTML({ childName, openAppUrl: RECAP_OPEN_APP_URL, unsubscribeUrl });

        // Envoyer via Resend
        console.log(`sendWeeklyRecap: sending uid=${userId} child=${childId}`);
        try {
          const sendResult = await resend.emails.send({
            from: "Suivi Baby <noreply@suivibaby.com>",
            to: userEmail,
            subject: "Le récap de la semaine est prêt",
            html,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
          // Resend reports failures in the result instead of throwing.
          if (sendResult?.error) {
            throw new Error(`Resend: ${sendResult.error.name ?? "error"} ${sendResult.error.message ?? ""}`.trim());
          }
          console.log(`sendWeeklyRecap: sent id=${sendResult?.data?.id ?? sendResult?.id ?? "?"}`);

          // Historique : métadonnées seulement (anti-doublon), aucune stat.
          await db.collection("recap_history").add({
            userId,
            childId,
            weekStart,
            weekEnd,
            sentAt: admin.firestore.Timestamp.now(),
            expireAt: logExpireAt(),
          });

          totalSent++;
        } catch (error) {
          console.error(
            `sendWeeklyRecap: error sending uid=${userId} child=${childId}:`,
            error.message
          );
        }
      }
    }

    console.log(
      `sendWeeklyRecap: sent=${totalSent}, skipped=${totalSkipped}, users=${prefsSnap.size}`
    );
  }
);

const escapeHtmlText = (str) =>
  String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function unsubscribePage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6f8;margin:0;padding:48px 16px;color:#1e2a36}main{max-width:440px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;text-align:center}button{background:#0891b2;color:#fff;border:0;border-radius:12px;padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer}</style></head>
<body><main><h1 style="font-size:20px">${title}</h1>${bodyHtml}</main></body></html>`;
}

/**
 * unsubscribeRecap — HTTPS, public. GET ?uid=…&token=… shows a confirmation
 * page; POST (button, or one-click unsubscribe from the mail client, RFC 8058)
 * sets user_preferences/{uid}.notifications.email = false.
 * token = hex HMAC-SHA256(uid) with RECAP_UNSUBSCRIBE_SECRET.
 * URL: https://europe-west1-samaye-53723.cloudfunctions.net/unsubscribeRecap
 */
exports.unsubscribeRecap = onRequest(
  { region: "europe-west1", secrets: [RECAP_UNSUBSCRIBE_SECRET] },
  async (req, res) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    // The page must never be framed (clickjacking of the unsubscribe button).
    res.set("X-Frame-Options", "DENY");
    res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
    if (req.method !== "GET" && req.method !== "POST") {
      res.set("Allow", "GET, POST");
      res.status(405).send(unsubscribePage("Méthode non autorisée", ""));
      return;
    }

    const secret = secretValue(RECAP_UNSUBSCRIBE_SECRET);
    if (!secret) {
      console.error("unsubscribeRecap: RECAP_UNSUBSCRIBE_SECRET not configured");
      res.status(500).send(unsubscribePage("Service indisponible", "<p>Réessayez plus tard.</p>"));
      return;
    }

    const uid = req.query?.uid;
    const token = req.query?.token;
    if (typeof uid !== "string" || uid.length === 0 || uid.length > 128) {
      res.status(400).send(unsubscribePage("Lien invalide", "<p>Ce lien de désinscription est incomplet.</p>"));
      return;
    }
    if (!isValidRecapToken(uid, token, secret)) {
      res.status(403).send(unsubscribePage("Lien invalide", "<p>Ce lien de désinscription n'est pas valide. Vous pouvez aussi désactiver les récaps dans l'application, rubrique Notifications.</p>"));
      return;
    }

    if (req.method === "GET") {
      const action = `${FUNCTIONS_BASE_URL}/unsubscribeRecap?uid=${encodeURIComponent(uid)}&token=${token}`;
      res.status(200).send(unsubscribePage(
        "Se désabonner des récaps",
        `<p>Vous ne recevrez plus le récap hebdomadaire par e-mail.</p>
<form method="POST" action="${escapeHtmlText(action)}"><button type="submit">Me désabonner</button></form>`
      ));
      return;
    }

    try {
      // update(): never creates a preferences document for an arbitrary uid.
      // A missing document means there is nothing to unsubscribe from: success.
      await admin.firestore().doc(`user_preferences/${uid}`).update({ "notifications.email": false });
    } catch (e) {
      if (e?.code !== 5 && e?.code !== "not-found") {
        console.error(`unsubscribeRecap: write failed for uid=${uid}`, e?.message ?? e);
        res.status(500).send(unsubscribePage("Une erreur est survenue", "<p>Réessayez plus tard.</p>"));
        return;
      }
    }
    res.status(200).send(unsubscribePage("Vous êtes désabonné", "<p>Vous ne recevrez plus le récap hebdomadaire par e-mail. Vous pouvez le réactiver à tout moment dans l'application.</p>"));
  }
);

// ============================================
// CHILD DELETION — Soft-delete with multi-owner approval
// ============================================

/**
 * Soft-delete interne : coupe l'accès, marque deletedAt, conserve les données pour rétention RGPD.
 * Appelée par createDeletionRequest (owner unique) ou voteDeletionRequest (tous approuvés).
 */
async function softDeleteChild(db, childId, requestId, requestedBy) {
  const now = admin.firestore.Timestamp.now();
  const purgeAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + CHILD_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  );

  // 1. Collect all access docs before deletion (snapshot for restore on cancel)
  const accessSnap = await db.collection("children").doc(childId).collection("access").get();
  const userIds = new Set();
  const accessSnapshot = {};
  accessSnap.docs.forEach((accessDoc) => {
    userIds.add(accessDoc.id);
    accessSnapshot[accessDoc.id] = accessDoc.data();
  });

  const userChildAccessSnap = await db
    .collection("user_child_access")
    .where("childId", "==", childId)
    .limit(500)
    .get();
  userChildAccessSnap.docs.forEach((accessDoc) => {
    const data = accessDoc.data();
    if (data.userId) userIds.add(data.userId);
  });

  // 2. B2.3 — écrire le snapshot AVANT de marquer deletedAt. Avant, l'ordre
  // était inverse, ce qui ouvrait une race : si cancelChildDeletion arrivait
  // entre le mark deletedAt et l'update du snapshot, il restaurait avec un
  // snapshot vide (fallback à "uid → owner") → perte des autres co-parents.
  // Maintenant, si cancel arrive avant le mark, il échoue proprement
  // (deletedAt absent). Si après, le snapshot est garanti dispo.
  await db.doc(`childDeletionRequests/${requestId}`).update({
    deletedAt: now,
    purgeAt,
    accessSnapshot, // { userId: { role, canWriteEvents, ... } } — used by cancelChildDeletion
  });

  // 3. Mark child as soft-deleted (point de bascule visible côté UI).
  await db.doc(`children/${childId}`).update({
    deletedAt: now,
    deletedBy: requestedBy,
    deletionRequestId: requestId,
  });

  // 4. Delete all access subcollection docs
  if (!accessSnap.empty) {
    const batch = db.batch();
    accessSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 5. Delete user_child_access index entries
  await deleteDocsByFieldBatched(db, "user_child_access", "childId", childId);

  // 6. Clean user_preferences for all affected users
  const userCleanups = Array.from(userIds).map((userId) =>
    db.doc(`user_preferences/${userId}`).set(
      {
        hiddenChildrenIds: admin.firestore.FieldValue.arrayRemove(childId),
      },
      { merge: true }
    ).catch(() => {}) // Ignore if prefs doc doesn't exist
  );
  await Promise.all(userCleanups);

  // 7. Delete sharing-related data
  await Promise.all([
    deleteDocsByFieldBatched(db, "shareCodes", "childId", childId),
    deleteDocsByFieldBatched(db, "shareInvitations", "childId", childId),
    deleteDocsByFieldBatched(db, "babyAttachmentRequests", "childId", childId),
  ]);

  // 8. B2.1 — wipe Storage IMMÉDIATEMENT au soft-delete (RGPD S9).
  // Avant : les photos restaient accessibles via URLs Storage signées
  // pendant 30j (durée de la grace period). storage.rules ne checke pas
  // le `deletedAt` côté Firestore, donc l'auth seul ne bloquait pas.
  // Maintenant : on supprime les fichiers tout de suite, la restoration
  // (cancelChildDeletion) ne peut plus restaurer les photos — mais
  // c'est cohérent avec la politique "soft-delete = données illisibles".
  try {
    const wiped = await deleteChildPhotosEverywhere(childId);
    if (wiped > 0) {
      console.log(`softDeleteChild: wiped ${wiped} storage files for ${childId}`);
    }
  } catch (storageErr) {
    // Best-effort. Si échec, la purge planifiée à 30j rattrapera. On
    // log mais on bloque pas le soft-delete pour autant.
    console.error(`softDeleteChild: storage wipe failed for ${childId}, retried by the purge:`, storageErr?.message ?? storageErr);
  }

  console.log(`softDeleteChild: childId=${childId}, requestId=${requestId}, usersCleared=${userIds.size}`);
}

/**
 * createDeletionRequest — Owner demande la suppression d'un enfant.
 * - Owner unique : approved immédiatement + soft-delete
 * - Multi-owners : pending, vote de l'initiateur = approved
 */
exports.createDeletionRequest = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "createDeletionRequest");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const uid = request.auth.uid;
    const { childId } = request.data;

    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId requis.");
    }

    const db = admin.firestore();

    // Rate limit: 5 deletion requests per minute
    await checkRateLimit(db, uid, "deletion", 5);

    // Verify caller is owner
    const callerAccess = await db.doc(`children/${childId}/access/${uid}`).get();
    if (!callerAccess.exists || callerAccess.data().role !== "owner") {
      throw new HttpsError("permission-denied", "Seul un propriétaire peut demander la suppression.");
    }

    // Check child exists and is not already soft-deleted
    const childDoc = await db.doc(`children/${childId}`).get();
    if (!childDoc.exists) {
      throw new HttpsError("not-found", "Enfant introuvable.");
    }
    if (childDoc.data().deletedAt) {
      throw new HttpsError("failed-precondition", "Cet enfant est déjà en cours de suppression.");
    }

    // Check no pending request exists for this child
    const existingRequests = await db
      .collection("childDeletionRequests")
      .where("childId", "==", childId)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    if (!existingRequests.empty) {
      throw new HttpsError("already-exists", "Une demande de suppression est déjà en cours pour cet enfant.");
    }

    // Get all owners
    const accessSnap = await db.collection("children").doc(childId).collection("access").get();
    const owners = accessSnap.docs
      .filter((doc) => doc.data().role === "owner")
      .map((doc) => doc.id);

    if (owners.length === 0) {
      throw new HttpsError("failed-precondition", "Aucun propriétaire trouvé.");
    }

    const now = admin.firestore.Timestamp.now();
    const childData = childDoc.data();

    // Build ownerVotes: initiator = approved, others = pending
    const ownerVotes = {};
    for (const ownerId of owners) {
      ownerVotes[ownerId] = {
        vote: ownerId === uid ? "approved" : "pending",
        ...(ownerId === uid ? { votedAt: now } : {}),
      };
    }

    const requestDoc = {
      childId,
      childName: childData.name || "",
      requestedBy: uid,
      requestedByEmail: request.auth.token.email || "",
      requestedAt: now,
      status: owners.length === 1 ? "approved" : "pending",
      ownerVotes,
      ownerIds: owners, // Denormalized array for Firestore list queries (array-contains)
      retentionDays: CHILD_DELETION_RETENTION_DAYS,
      seenByUserIds: [],
      // Expiration: pending requests auto-expire after DELETION_REQUEST_EXPIRY_DAYS
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + DELETION_REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
      ),
      ...(owners.length === 1 ? { approvedAt: now } : {}),
    };

    const requestRef = await db.collection("childDeletionRequests").add(requestDoc);

    // If sole owner, execute soft-delete immediately
    if (owners.length === 1) {
      await softDeleteChild(db, childId, requestRef.id, uid);
      return { status: "approved", requestId: requestRef.id };
    }

    return { status: "pending", requestId: requestRef.id, ownerCount: owners.length };
  }
);

/**
 * voteDeletionRequest — Un owner vote sur une demande de suppression.
 * - refused : la demande passe en refused, plus de vote possible
 * - approved : si tous ont approuvé, soft-delete
 */
exports.voteDeletionRequest = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "voteDeletionRequest");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "deletion", 10);

    const { requestId, vote } = request.data;

    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId requis.");
    }
    if (!["approved", "refused"].includes(vote)) {
      throw new HttpsError("invalid-argument", "Vote doit être 'approved' ou 'refused'.");
    }

    const requestRef = db.doc(`childDeletionRequests/${requestId}`);

    // Read and record the vote in one transaction: two owners voting at the
    // same time can no longer both miss (or both trigger) the final approval.
    const outcome = await db.runTransaction(async (tx) => {
      const requestDoc = await tx.get(requestRef);
      if (!requestDoc.exists) {
        throw new HttpsError("not-found", "Demande introuvable.");
      }
      const data = requestDoc.data();
      if (data.status !== "pending") {
        throw new HttpsError("failed-precondition", "Cette demande n'est plus en attente.");
      }
      // Verify caller is an owner in the votes
      if (!data.ownerVotes || !data.ownerVotes[uid]) {
        throw new HttpsError("permission-denied", "Vous n'êtes pas propriétaire de cet enfant.");
      }
      if (data.ownerVotes[uid].vote !== "pending") {
        throw new HttpsError("failed-precondition", "Vous avez déjà voté.");
      }

      const now = admin.firestore.Timestamp.now();
      if (vote === "refused") {
        // One refusal stops everything
        tx.update(requestRef, {
          status: "refused",
          refusedBy: uid,
          refusedByEmail: request.auth.token.email || "",
          refusedAt: now,
          [`ownerVotes.${uid}.vote`]: "refused",
          [`ownerVotes.${uid}.votedAt`]: now,
        });
        return { status: "refused" };
      }

      const updatedVotes = { ...data.ownerVotes, [uid]: { vote: "approved", votedAt: now } };
      const allApproved = Object.values(updatedVotes).every((v) => v.vote === "approved");
      tx.update(requestRef, {
        [`ownerVotes.${uid}.vote`]: "approved",
        [`ownerVotes.${uid}.votedAt`]: now,
        ...(allApproved ? { status: "approved", approvedAt: now } : {}),
      });
      return allApproved
        ? { status: "approved", childId: data.childId, requestedBy: data.requestedBy }
        : { status: "pending" };
    });

    if (outcome.status === "approved") {
      await softDeleteChild(db, outcome.childId, requestId, outcome.requestedBy);
    }
    return { status: outcome.status };
  }
);

/**
 * transferAndLeave — Owner transfère la propriété et quitte l'enfant.
 */
exports.transferAndLeave = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "transferAndLeave");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const uid = request.auth.uid;
    const { childId, newOwnerId } = request.data;

    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId requis.");
    }
    if (!newOwnerId || typeof newOwnerId !== "string") {
      throw new HttpsError("invalid-argument", "newOwnerId requis.");
    }
    if (newOwnerId === uid) {
      throw new HttpsError("invalid-argument", "Vous ne pouvez pas vous transférer la propriété à vous-même.");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "deletion", 10);

    // Everything that decides who owns the child is re-read inside the
    // transaction: a co-owner (role owner but not children.ownerId) must never
    // be able to overwrite ownerId, and the new owner's access must still exist.
    const childRef = db.doc(`children/${childId}`);
    const callerRef = db.doc(`children/${childId}/access/${uid}`);
    const newOwnerRef = db.doc(`children/${childId}/access/${newOwnerId}`);
    const transferred = await db.runTransaction(async (tx) => {
      const [childSnap, callerAccess, newOwnerAccess] = await Promise.all([
        tx.get(childRef),
        tx.get(callerRef),
        tx.get(newOwnerRef),
      ]);
      if (!callerAccess.exists || callerAccess.data()?.role !== "owner") {
        throw new HttpsError("permission-denied", "Seul un propriétaire peut transférer.");
      }
      // Pas de transfert d'un enfant en cours de suppression
      if (!childSnap.exists || childSnap.data()?.deletedAt) {
        throw new HttpsError("failed-precondition", "Cet enfant est en cours de suppression.");
      }
      if (childSnap.data()?.ownerId !== uid) {
        // Co-owner: leaves without touching the primary owner.
        tx.delete(callerRef);
        return false;
      }
      if (!newOwnerAccess.exists) {
        throw new HttpsError("not-found", "Le nouveau propriétaire n'a pas accès à cet enfant.");
      }
      // 1. Promote new owner
      tx.update(newOwnerRef, {
        role: "owner",
        canWriteEvents: true,
        canWriteLikes: true,
        canWriteComments: true,
        grantedBy: uid,
        grantedAt: admin.firestore.Timestamp.now(),
      });
      // 2. Update ownerId on child document
      tx.update(childRef, { ownerId: newOwnerId });
      // 3. Delete former owner's access
      tx.delete(callerRef);
      return true;
    });

    // 4. Delete former owner's user_child_access entry
    const userAccessSnap = await db
      .collection("user_child_access")
      .where("userId", "==", uid)
      .where("childId", "==", childId)
      .limit(1)
      .get();
    if (!userAccessSnap.empty) {
      await userAccessSnap.docs[0].ref.delete();
    }

    // 5. Clean former owner's user_preferences
    await db.doc(`user_preferences/${uid}`).set(
      {
        hiddenChildrenIds: admin.firestore.FieldValue.arrayRemove(childId),
      },
      { merge: true }
    ).catch(() => {});

    console.log(`transferAndLeave: childId=${childId}, from=${uid}, to=${newOwnerId}, transferred=${transferred}`);
    return { success: true, transferred };
  }
);

/**
 * getOwnershipBlockers — Read-only. Children for which the caller is the only
 * owner/admin-level member while other members exist: the app asks the user to
 * pick a new owner for each (then transferAndLeave) before scheduling the
 * account deletion. Input: none. Output:
 * { children: [{ childId, childName, members: [{ uid, role, displayName? }] }] }
 */
exports.getOwnershipBlockers = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "getOwnershipBlockers");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "ownership", 20);

    const indexSnap = await db.collection("user_child_access").where("userId", "==", uid).get();
    const children = [];
    for (const entry of indexSnap.docs) {
      const childId = entry.data()?.childId;
      if (!childId) continue;

      const [childSnap, accessSnap] = await Promise.all([
        db.doc(`children/${childId}`).get(),
        db.collection("children").doc(childId).collection("access").get(),
      ]);
      if (!childSnap.exists || childSnap.data()?.deletedAt) continue;

      const members = accessSnap.docs.map((d) => ({ uid: d.id, role: d.data()?.role }));
      const self = members.find((m) => m.uid === uid);
      if (self?.role !== "owner") continue;
      const others = members.filter((m) => m.uid !== uid);
      if (others.length === 0) continue; // alone: the child goes with the account
      if (others.some((m) => m.role === "owner" || m.role === "admin")) continue;

      const named = await Promise.all(others.map(async (m) => {
        const publicSnap = await db.doc(`users_public/${m.uid}`).get();
        const displayName = publicSnap.exists ? publicSnap.data()?.userName : undefined;
        return displayName ? { ...m, displayName } : m;
      }));
      children.push({ childId, childName: childSnap.data()?.name || "", members: named });
    }
    return { children };
  }
);

/**
 * cancelChildDeletion — Annule une suppression soft-delete pendant la période de rétention.
 * Restaure l'accès pour le demandeur (les autres owners doivent être ré-invités).
 */
exports.cancelChildDeletion = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "cancelChildDeletion");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const uid = request.auth.uid;
    const { requestId } = request.data;

    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId requis.");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "deletion", 10);

    const requestRef = db.doc(`childDeletionRequests/${requestId}`);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      throw new HttpsError("not-found", "Demande introuvable.");
    }

    const data = requestDoc.data();

    if (data.status !== "approved") {
      throw new HttpsError("failed-precondition", "Seule une suppression approuvee peut etre annulee.");
    }

    // Only the requester (or any original owner) can cancel
    if (!data.ownerIds.includes(uid)) {
      throw new HttpsError("permission-denied", "Seul un proprietaire peut annuler la suppression.");
    }

    const childId = data.childId;
    const childRef = db.doc(`children/${childId}`);
    const childDoc = await childRef.get();

    if (!childDoc.exists) {
      throw new HttpsError("not-found", "Enfant deja supprime definitivement.");
    }

    const childData = childDoc.data();
    if (!childData.deletedAt) {
      throw new HttpsError("failed-precondition", "Cet enfant n'est pas en cours de suppression.");
    }

    const now = admin.firestore.Timestamp.now();

    // Check retention period hasn't expired
    if (data.purgeAt && data.purgeAt.toMillis() <= Date.now()) {
      throw new HttpsError("failed-precondition", "La periode de retention a expire, la suppression ne peut plus etre annulee.");
    }

    // Claim the cancellation atomically: a purge that reserved the request
    // ("purging") wins, and two cancellations cannot both restore.
    await db.runTransaction(async (tx) => {
      const current = await tx.get(requestRef);
      if (current.data()?.status !== "approved") {
        throw new HttpsError("failed-precondition", "Cette suppression ne peut plus etre annulee.");
      }
      tx.update(requestRef, { status: "cancelled", cancelledBy: uid, cancelledAt: now });
    });

    const batch = db.batch();
    const snapshot = data.accessSnapshot || {};
    const allUserIds = Object.keys(snapshot);

    // Fallback: if no snapshot, restore at least the owners
    if (allUserIds.length === 0) {
      (data.ownerIds || [uid]).forEach((id) => {
        snapshot[id] = { role: "owner", canWriteEvents: true, canWriteLikes: true, canWriteComments: true };
      });
    }

    // Determine ownerId for child doc (first owner found in snapshot)
    const primaryOwner = Object.entries(snapshot).find(([, v]) => v.role === "owner");
    const ownerId = primaryOwner ? primaryOwner[0] : uid;

    // 1. Remove soft-delete markers from child document
    batch.update(childRef, {
      deletedAt: admin.firestore.FieldValue.delete(),
      deletedBy: admin.firestore.FieldValue.delete(),
      deletionRequestId: admin.firestore.FieldValue.delete(),
      ownerId,
    });

    // 2. Restore access for ALL parents (owners, admins, contributors, viewers)
    for (const [userId, accessData] of Object.entries(snapshot)) {
      batch.set(db.doc(`children/${childId}/access/${userId}`), {
        ...accessData,
        userId,
        grantedBy: uid,
        grantedAt: now,
      });

      // 3. Restore user_child_access index
      batch.set(db.doc(`user_child_access/${userId}_${childId}`), {
        userId,
        childId,
      });
    }

    await batch.commit();

    console.log(`cancelChildDeletion: childId=${childId}, cancelledBy=${uid}`);
    return { success: true };
  }
);

/**
 * purgeDeletedChildren — Scheduled:
 * 1. Expire pending deletion requests after DELETION_REQUEST_EXPIRY_DAYS
 * 2. Hard-delete soft-deleted children after RGPD retention period
 */
exports.purgeDeletedChildren = onSchedule("every 24 hours", async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  // --- Step 1: Expire pending requests ---
  const expiredSnap = await db
    .collection("childDeletionRequests")
    .where("status", "==", "pending")
    .where("expiresAt", "<=", now)
    .limit(100)
    .get();

  let expired = 0;
  for (const expiredDoc of expiredSnap.docs) {
    try {
      await expiredDoc.ref.update({
        status: "expired",
        expiredAt: now,
      });
      expired++;
    } catch (err) {
      console.error(`purgeDeletedChildren: error expiring requestId=${expiredDoc.id}:`, err.message);
    }
  }
  if (expired > 0) {
    console.log(`purgeDeletedChildren: expired=${expired} pending requests`);
  }

  // --- Step 1b: finish approvals whose soft-delete was interrupted ---
  // (vote or request approved, then softDeleteChild failed: no purgeAt, the
  // child is still active and nobody can vote again).
  const approvedSnap = await db
    .collection("childDeletionRequests")
    .where("status", "==", "approved")
    .limit(100)
    .get();
  for (const approvedDoc of approvedSnap.docs) {
    const data = approvedDoc.data();
    if (data.purgeAt || !data.childId) continue;
    try {
      await softDeleteChild(db, data.childId, approvedDoc.id, data.requestedBy);
      console.log(`purgeDeletedChildren: resumed soft-delete of childId=${data.childId}`);
    } catch (err) {
      console.error(`purgeDeletedChildren: could not resume soft-delete of childId=${data.childId}`, err?.stack ?? err);
    }
  }

  // --- Step 2: Purge soft-deleted children past retention ---
  const requestsSnap = await db
    .collection("childDeletionRequests")
    .where("status", "in", ["approved", "purging"])
    .where("purgeAt", "<=", now)
    .limit(50)
    .get();

  if (requestsSnap.empty) {
    console.log("purgeDeletedChildren: nothing to purge");
    return;
  }

  let purged = 0;

  for (const requestDoc of requestsSnap.docs) {
    const data = requestDoc.data();
    const childId = data.childId;

    try {
      // Re-check just before deleting: a cancellation between the query and
      // now must not purge a child that was just restored.
      // Reserve it atomically: once "purging", cancelChildDeletion refuses.
      const reserved = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(requestDoc.ref);
        const childSnap = await tx.get(db.doc(`children/${childId}`));
        const stillApproved = ["approved", "purging"].includes(fresh.data()?.status);
        if (!stillApproved || (childSnap.exists && !childSnap.data()?.deletedAt)) return false;
        tx.update(requestDoc.ref, { status: "purging" });
        return true;
      });
      if (!reserved) {
        console.log(`purgeDeletedChildren: skipping childId=${childId} (cancelled or restored)`);
        continue;
      }

      // Hard-delete all child data (reuse existing helper)
      await deleteChildDataBatched(db, childId);

      // Storage files are wiped by deleteChildDataBatched above.

      // Delete the child document itself
      await db.doc(`children/${childId}`).delete();

      // Delete the deletion request
      await requestDoc.ref.delete();

      purged++;
    } catch (err) {
      console.error(`purgeDeletedChildren: error purging childId=${childId}:`, err?.stack ?? err?.message ?? err);
    }
  }

  if (purged < requestsSnap.size) {
    console.error(`purgeDeletedChildren: error purged=${purged}/${requestsSnap.size}, failures will be retried`);
  } else {
    console.log(`purgeDeletedChildren: purged=${purged}/${requestsSnap.size}`);
  }

  // --- Step 3: Cleanup stale requests (refused/expired/cancelled older than 30 days) ---
  const staleThreshold = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - CHILD_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  );
  let cleaned = 0;
  for (const status of ["refused", "expired", "cancelled"]) {
    const staleSnap = await db
      .collection("childDeletionRequests")
      .where("status", "==", status)
      .where("requestedAt", "<=", staleThreshold)
      .limit(100)
      .get();
    for (const staleDoc of staleSnap.docs) {
      try {
        await staleDoc.ref.delete();
        cleaned++;
      } catch (err) {
        console.error(`purgeDeletedChildren: error cleaning requestId=${staleDoc.id}:`, err.message);
      }
    }
  }
  if (cleaned > 0) {
    console.log(`purgeDeletedChildren: cleaned=${cleaned} stale requests`);
  }
});

// ============================================================================
// PHOTO BUCKET MIGRATION — mirror the legacy US bucket into the EU bucket
// ============================================================================
// Older app versions still read/write the legacy bucket. Until they are gone
// (docs/MIGRATION_PHOTOS_EU.md), every upload there is copied to the EU bucket
// and every deletion there is applied to the EU copy. Storage triggers must run
// in the bucket's region (us-central1); they only move bytes into the EU.

function isChildPhotoObject(name) {
  return typeof name === "string" && name.startsWith("children/");
}

exports.mirrorLegacyPhotoUpload = onObjectFinalized(
  { bucket: LEGACY_PHOTOS_BUCKET, region: "us-central1" },
  async (event) => {
    const name = event.data.name;
    if (!isChildPhotoObject(name)) return;
    await admin
      .storage()
      .bucket(LEGACY_PHOTOS_BUCKET)
      .file(name)
      .copy(admin.storage().bucket(PHOTOS_BUCKET).file(name));
    console.log(`mirrorLegacyPhotoUpload: copied ${name} to ${PHOTOS_BUCKET}`);
  },
);

exports.mirrorLegacyPhotoDelete = onObjectDeleted(
  { bucket: LEGACY_PHOTOS_BUCKET, region: "us-central1" },
  async (event) => {
    const name = event.data.name;
    if (!isChildPhotoObject(name)) return;
    await admin.storage().bucket(PHOTOS_BUCKET).file(name).delete({ ignoreNotFound: true });
    console.log(`mirrorLegacyPhotoDelete: removed ${name} from ${PHOTOS_BUCKET}`);
  },
);
