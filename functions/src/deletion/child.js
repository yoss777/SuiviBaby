const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { CHILD_DELETION_RETENTION_DAYS, deleteChildDataBatched, softDeleteChild } = require("./childData");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");

const DELETION_REQUEST_EXPIRY_DAYS = 7;

/**
 * createDeletionRequest — Owner demande la suppression d'un enfant.
 * - Owner unique : approved immédiatement + soft-delete
 * - Multi-owners : pending, vote de l'initiateur = approved
 */
const createDeletionRequest = onCall(
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
const voteDeletionRequest = onCall(
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
const transferAndLeave = onCall(
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
const getOwnershipBlockers = onCall(
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
const cancelChildDeletion = onCall(
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
const purgeDeletedChildren = onSchedule("every 24 hours", async () => {
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

module.exports = {
  cancelChildDeletion,
  createDeletionRequest,
  getOwnershipBlockers,
  purgeDeletedChildren,
  transferAndLeave,
  voteDeletionRequest,
};
