const admin = require("firebase-admin");
const { DELETED_USER_ID } = require("../../lib/userPurge");
const { deleteDocsByFieldBatched } = require("../shared/batch");
const { deleteChildPhotosEverywhere } = require("../shared/photos");

const CHILD_DELETION_RETENTION_DAYS = 30;

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
    deleteDocsByFieldBatched(db, "access_audit", "childId", childId),
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

  // Subcollections: Firestore keeps them when the child document is deleted.
  // access: members ; live: session in progress shared by the household
  // (tétée en cours, carries the uid of whoever wrote it last).
  for (const sub of ["access", "live"]) {
    const snap = await db.collection("children").doc(childId).collection(sub).get();
    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  // user_child_access index entries for this child
  await deleteDocsByFieldBatched(db, "user_child_access", "childId", childId);
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
    deleteDocsByFieldBatched(db, "access_audit", "childId", childId),
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

module.exports = {
  CHILD_DELETION_RETENTION_DAYS,
  deleteChildDataBatched,
  softDeleteChild,
  transferOwnership,
};
