// Sprint 12.6 — roles and share codes, written by the server only.
//
// Two roles are offered in the app: « Parent » (admin) and « Proche »
// (contributor). A share code or an invitation always gives « Proche »; only
// the owner switches a member between the two, through setMemberRole. Share
// codes are created here (random, single use, 7 days) instead of by the
// client.
const crypto = require("crypto");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0, O, I, 1
const CODE_LENGTH = 6;
const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

// Flags written with each assignable role (mirror of DEFAULT_ROLE_PERMISSIONS).
const ROLE_FLAGS = Object.freeze({
  admin: Object.freeze({ canWriteEvents: true, canWriteLikes: true, canWriteComments: true }),
  contributor: Object.freeze({ canWriteEvents: false, canWriteLikes: true, canWriteComments: true }),
});

/** Random share code, uniform over the alphabet (crypto.randomInt has no modulo bias). */
function generateShareCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET.charAt(crypto.randomInt(CODE_ALPHABET.length));
  }
  return code;
}

/**
 * @param {object} deps admin, HttpsError, checkRateLimit, monitorAppCheck,
 *   assertVerifiedEmail, isValidDocId, hasChildRole
 */
function createRoleHandlers(deps) {
  const { admin, HttpsError, checkRateLimit, monitorAppCheck, assertVerifiedEmail, isValidDocId, hasChildRole } = deps;

  async function setMemberRole(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentification requise.");
    monitorAppCheck(request, "setMemberRole");
    const uid = request.auth.uid;
    const { childId, memberId, role } = request.data || {};
    if (!isValidDocId(childId) || !isValidDocId(memberId)) {
      throw new HttpsError("invalid-argument", "childId et memberId requis.");
    }
    if (role !== "admin" && role !== "contributor") {
      throw new HttpsError("invalid-argument", "Rôle invalide (admin ou contributor).");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "set_member_role", 20);

    // Le rôle de l'appelant vient des documents Firestore, jamais d'un claim, et
    // il est relu DANS la transaction : un propriétaire rétrogradé entre-temps
    // ne peut plus changer de rôle.
    const callerRef = db.doc(`children/${childId}/access/${uid}`);
    const childRef = db.doc(`children/${childId}`);
    const memberRef = db.doc(`children/${childId}/access/${memberId}`);
    const indexRef = db.doc(`user_child_access/${memberId}_${childId}`);
    let fromRole;
    await db.runTransaction(async (tx) => {
      const [callerSnap, childSnap, memberSnap, indexSnap] = await Promise.all([
        tx.get(callerRef), tx.get(childRef), tx.get(memberRef), tx.get(indexRef),
      ]);
      if (!childSnap.exists || childSnap.data()?.deletedAt) {
        throw new HttpsError("not-found", "Enfant introuvable.");
      }
      const primaryOwnerId = childSnap.data()?.ownerId;
      // Propriétaire = rôle owner, ou propriétaire principal (repli comme createShareCode).
      const isOwner = (callerSnap.exists && hasChildRole(callerSnap.data(), ["owner"])) ||
        primaryOwnerId === uid;
      if (!isOwner) {
        throw new HttpsError("permission-denied", "Seul le propriétaire peut changer un rôle.");
      }
      if (!memberSnap.exists) throw new HttpsError("not-found", "Membre introuvable.");
      fromRole = memberSnap.data().role;
      // Le propriétaire principal n'est jamais rétrogradé, même si son accès dit « admin ».
      if (fromRole === "owner" || memberId === uid || memberId === primaryOwnerId) {
        throw new HttpsError("failed-precondition", "Le rôle d'un propriétaire ne peut pas être modifié.");
      }
      tx.update(memberRef, {
        role,
        ...ROLE_FLAGS[role],
        roleChangedBy: uid,
        roleChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // The index mirrors the role only if it carries one.
      if (indexSnap.exists && indexSnap.data()?.role !== undefined) {
        tx.update(indexRef, { role });
      }
    });

    try {
      await db.collection("access_audit").add({
        childId,
        actorId: uid,
        memberId,
        fromRole,
        toRole: role,
        at: admin.firestore.FieldValue.serverTimestamp(),
        // Operational log: 90 days (TTL on expireAt).
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
    } catch (e) {
      console.error("setMemberRole: failed to write audit entry", e.message);
    }
    return { success: true, role };
  }

  async function createShareCode(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentification requise.");
    monitorAppCheck(request, "createShareCode");
    assertVerifiedEmail(request);
    const uid = request.auth.uid;
    const childId = request.data?.childId;
    if (!isValidDocId(childId)) throw new HttpsError("invalid-argument", "childId requis.");

    const db = admin.firestore();
    await checkRateLimit(db, uid, "create_share_code", 10);

    const [childSnap, accessSnap] = await Promise.all([
      db.doc(`children/${childId}`).get(),
      db.doc(`children/${childId}/access/${uid}`).get(),
    ]);
    if (!childSnap.exists || childSnap.data()?.deletedAt) {
      throw new HttpsError("not-found", "Enfant introuvable.");
    }
    // Same people as before: owners and admins (ownerId as fallback).
    const allowed = (accessSnap.exists && hasChildRole(accessSnap.data(), ["owner", "admin"])) ||
      childSnap.data()?.ownerId === uid;
    if (!allowed) throw new HttpsError("permission-denied", "Vous ne pouvez pas partager cet enfant.");

    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + CODE_TTL_MS);
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateShareCode();
      const ref = db.doc(`shareCodes/${code}`);
      try {
        await db.runTransaction(async (tx) => {
          tx.create(ref, {
            code,
            childId,
            childName: childSnap.data()?.name ?? "",
            createdBy: uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt,
            used: false,
          });
        });
        return { code, expiresAt: expiresAt.toMillis() };
      } catch (err) {
        // 6 = ALREADY_EXISTS: a live or used code has this value, draw another.
        if (err?.code === 6 || err?.code === "already-exists") continue;
        console.error("createShareCode error:", err);
        throw new HttpsError("internal", "Impossible de créer le code.");
      }
    }
    throw new HttpsError("internal", "Impossible de générer un code unique.");
  }

  return { setMemberRole, createShareCode };
}

module.exports = { createRoleHandlers, generateShareCode, ROLE_FLAGS };
