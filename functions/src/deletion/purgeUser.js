const admin = require("firebase-admin");
const { DELETED_USER_ID, USER_DATA_BY_FIELD, USER_DOCS_BY_ID } = require("../../lib/userPurge");
const { revokeAppleToken } = require("./apple");
const { deleteChildDataBatched, transferOwnership } = require("./childData");
const { CONSENT_RETENTION_YEARS } = require("./consent");
const { BATCH_LIMIT, deleteDocsByFieldBatched, updateDocsByFieldBatched } = require("../shared/batch");
const { deleteUserEventPhotos } = require("../shared/photos");

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

module.exports = {
  purgeUserData,
};
