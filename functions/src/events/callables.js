const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const reminderLib = require("../../lib/reminders");
const { IDEM_TOMBSTONE_RETENTION_MS, IMMUTABLE_EVENT_FIELDS, idempotentEventId, isValidIdempotencyKey } = require("./idempotency");
const { VALID_EVENT_TYPES, convertEventDateFields, validateEventData } = require("./validation");
const { checkChildAccess } = require("../shared/access");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { deleteDocsByFieldBatched } = require("../shared/batch");
const { checkRateLimit } = require("../shared/rateLimit");
const { isValidDocId } = require("../shared/validation");

/**
 * validateAndCreateEvent — Création d'événement avec validation serveur
 */
const validateAndCreateEvent = onCall(
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
      await reminderLib.safeRefreshLastEventAt(db, childId, [eventData.type]);
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

    const tombstoneRef = db.doc(`deleted_idem/${eventId}`);

    let created = false;
    const result = await db.runTransaction(async (tx) => {
      created = false; // the transaction may be retried
      const existing = await tx.get(eventRef);
      if (existing.exists) return { id: eventId };
      // Supprimé depuis (deleteEventCascade) : un rejeu tardif de la création
      // (file hors ligne, réponse perdue) ne doit pas ressusciter l'événement.
      const tombstone = await tx.get(tombstoneRef);
      if (tombstone.exists) return { id: eventId };
      // Événement créé par une version précédente du serveur (identifiant
      // aléatoire) avec la même clé : on le reconnaît aussi.
      const legacy = await tx.get(legacyQuery);
      if (!legacy.empty) return { id: legacy.docs[0].id };
      tx.create(eventRef, serverData);
      created = true;
      return { id: eventId };
    });
    if (created) await reminderLib.safeRefreshLastEventAt(db, childId, [eventData.type]);
    return result;
  }
);

/**
 * validateAndUpdateEvent — Modification d'événement avec validation serveur
 */
const validateAndUpdateEvent = onCall(
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

    // Types touched by the update (old and new): their lastEventAt is recomputed.
    const touchedTypes = new Set();

    // Transactional read+write so the lock check can't race with a concurrent
    // update arriving between our read and write.
    await db.runTransaction(async (tx) => {
      touchedTypes.clear(); // the transaction may be retried
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
      touchedTypes.add(current.type);
      touchedTypes.add(type);
    });

    await reminderLib.safeRefreshLastEventAt(db, childId, [...touchedTypes]);
    return { success: true };
  }
);

/**
 * deleteEventCascade — Suppression atomique événement + likes + commentaires
 */
const deleteEventCascade = onCall(
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
    const deletedType = eventDoc.data().type;

    // Supprimer likes et commentaires en sous-batches paginés (évite la limite de 500 ops/batch)
    const [deletedLikes, deletedComments] = await Promise.all([
      deleteDocsByFieldBatched(db, "eventLikes", "eventId", eventId),
      deleteDocsByFieldBatched(db, "eventComments", "eventId", eventId),
    ]);

    // Identifiant déterministe (création idempotente) : on laisse une pierre
    // tombale AVANT de supprimer, pour qu'un rejeu de la création ne recrée pas
    // l'événement. Ordre voulu : si la suppression échoue ensuite, l'événement
    // existe toujours et la suppression peut être rejouée. Aucune donnée dedans
    // (l'identifiant est un hachage), seulement la date.
    if (eventId.startsWith("idem_")) {
      await db.doc(`deleted_idem/${eventId}`).set({
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        // TTL (fieldOverride deleted_idem.expireAt): plus aucun rejeu de file
        // hors ligne n'est attendu après 30 jours.
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + IDEM_TOMBSTONE_RETENTION_MS),
      });
    }

    // Supprimer l'événement lui-même
    await eventRef.delete();
    await reminderLib.safeRefreshLastEventAt(db, childId, [deletedType]);

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

module.exports = {
  deleteEventCascade,
  validateAndCreateEvent,
  validateAndUpdateEvent,
};
