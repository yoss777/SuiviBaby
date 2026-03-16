const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

const { Expo } = require("expo-server-sdk");
const { Resend } = require("resend");
const { buildRecapHTML } = require("./emailTemplates");

admin.initializeApp();

const BATCH_LIMIT = 450;
const expo = new Expo();

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

  const rateLimitDoc = await rateLimitRef.get();
  const data = rateLimitDoc.exists ? rateLimitDoc.data() : {};
  const recentRequests = (data[bucketKey] || []).filter((t) => t > oneMinuteAgo);

  if (recentRequests.length >= maxPerMinute) {
    throw new HttpsError(
      "resource-exhausted",
      "Trop de requêtes. Réessayez dans une minute."
    );
  }

  await rateLimitRef.set(
    { [bucketKey]: [...recentRequests, now] },
    { merge: true }
  );
}

/**
 * App Check monitoring — log sans bloquer.
 * Quand prêt pour l'enforcement, ajouter enforceAppCheck: true dans les options onCall.
 */
function monitorAppCheck(request, functionName) {
  if (request.app) {
    console.log(`[AppCheck] ${functionName}: VERIFIED (uid: ${request.auth?.uid})`);
  } else {
    console.warn(`[AppCheck] ${functionName}: UNVERIFIED (uid: ${request.auth?.uid})`);
  }
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

  // Legacy collections
  const legacyCollections = ["tetees", "pompages", "mictions", "selles", "vitamines", "vaccins"];
  await Promise.all(
    legacyCollections.map((coll) => deleteDocsByFieldBatched(db, coll, "childId", childId))
  );

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

/**
 * Transfère la propriété d'un enfant au meilleur candidat.
 */
async function transferOwnership(db, childId, currentOwnerId, childAccessSnapshot) {
  const rolePriority = { admin: 0, contributor: 1, viewer: 2 };
  const candidates = childAccessSnapshot.docs
    .filter((d) => d.id !== currentOwnerId)
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const rA = rolePriority[a.role] ?? 3;
      const rB = rolePriority[b.role] ?? 3;
      if (rA !== rB) return rA - rB;
      const tA = a.grantedAt?.toMillis?.() ?? 0;
      const tB = b.grantedAt?.toMillis?.() ?? 0;
      return tA - tB;
    });

  if (candidates.length === 0) return;

  const newOwner = candidates[0];
  const batch = db.batch();

  batch.update(db.doc(`children/${childId}`), { ownerId: newOwner.id });
  batch.update(db.doc(`children/${childId}/access/${newOwner.id}`), {
    role: "owner",
    canWriteEvents: true,
    canWriteLikes: true,
    canWriteComments: true,
    grantedBy: newOwner.id,
    grantedAt: admin.firestore.Timestamp.now(),
  });

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
 * transcribeAudio — Proxy sécurisé pour AssemblyAI
 * - Auth obligatoire
 * - Rate limiting : max 10 requêtes/min/user
 * - Quota par tier : FREE = 5/jour, PREMIUM = illimité
 */
exports.transcribeAudio = onCall(
  {
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: ["ASSEMBLYAI_API_KEY"],
  },
  async (request) => {
    // 1. Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "transcribeAudio");

    const uid = request.auth.uid;
    const { audioBase64 } = request.data;

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

    // 3. Quota check — FREE = 5 transcriptions/jour
    const usageRef = db.doc(`usage_limits/${uid}`);
    const usageDoc = await usageRef.get();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    let tier = "free";
    let dailyCount = 0;

    if (usageDoc.exists) {
      const usageData = usageDoc.data();
      tier = usageData.tier || "free";
      if (usageData.lastDate === today) {
        dailyCount = usageData.dailyTranscriptions || 0;
      }
    }

    const FREE_DAILY_LIMIT = 5;
    if (tier === "free" && dailyCount >= FREE_DAILY_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        `Limite quotidienne atteinte (${FREE_DAILY_LIMIT} transcriptions/jour). Passez en Premium pour un usage illimité.`
      );
    }

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
      const transcriptId = transcript.id;

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

      // 7. Update usage counter
      await usageRef.set(
        {
          tier,
          dailyTranscriptions: dailyCount + 1,
          lastDate: today,
          lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { text: result.text || "" };
    } catch (error) {
      // Re-throw HttpsError as-is
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error("transcribeAudio error:", error);
      throw new HttpsError(
        "internal",
        "Erreur lors de la transcription audio."
      );
    }
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

  const role = accessDoc.data().role;
  if (requiredRoles && !requiredRoles.includes(role)) {
    const canWrite = accessDoc.data().canWriteEvents === true;
    if (!canWrite) {
      throw new HttpsError(
        "permission-denied",
        `Rôle '${role}' insuffisant. Requis: ${requiredRoles.join("/")}.`
      );
    }
  }

  return role;
}

/**
 * Validation des domaines de valeurs par type d'événement
 */
function validateEventData(type, data) {
  const now = Date.now();

  // Date ne peut pas être dans le futur (tolérance 5 minutes)
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
      break;

    case "temperature":
      if (data.valeur !== undefined) {
        if (typeof data.valeur !== "number" || data.valeur < 34 || data.valeur > 43) {
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
      break;

    case "vaccin":
      if (!data.nomVaccin || typeof data.nomVaccin !== "string" || data.nomVaccin.trim().length === 0) {
        throw new HttpsError("invalid-argument", "Le nom du vaccin est requis.");
      }
      break;

    case "vitamine":
      if (!data.nomVitamine || typeof data.nomVitamine !== "string" || data.nomVitamine.trim().length === 0) {
        throw new HttpsError("invalid-argument", "Le nom de la vitamine est requis.");
      }
      break;
  }
}

// ============================================
// EVENT CRUD CLOUD FUNCTIONS
// ============================================

/**
 * validateAndCreateEvent — Création d'événement avec validation serveur
 */
exports.validateAndCreateEvent = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "validateAndCreateEvent");

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "events", 30);

    const { childId, ...eventData } = request.data;

    if (!childId || typeof childId !== "string") {
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

    // Enrichissement serveur
    const serverData = {
      ...eventData,
      childId,
      userId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Convertir date en Firestore Timestamp
    if (eventData.date) {
      serverData.date = toFirestoreTimestamp(eventData.date);
    }

    const ref = await db.collection("events").add(serverData);
    return { id: ref.id };
  }
);

/**
 * validateAndUpdateEvent — Modification d'événement avec validation serveur
 */
exports.validateAndUpdateEvent = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "validateAndUpdateEvent");

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "events", 30);

    const { childId, eventId, ...updateData } = request.data;

    if (!childId || !eventId) {
      throw new HttpsError("invalid-argument", "childId et eventId sont requis.");
    }

    // Permission check
    await checkChildAccess(db, uid, childId, ["owner", "admin"]);

    // Vérifier que l'événement existe et appartient à cet enfant
    const eventRef = db.doc(`events/${eventId}`);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError("not-found", "Événement introuvable.");
    }

    if (eventDoc.data().childId !== childId) {
      throw new HttpsError("permission-denied", "Cet événement n'appartient pas à cet enfant.");
    }

    // Validation des données si le type est présent
    const type = updateData.type || eventDoc.data().type;
    validateEventData(type, updateData);

    // Empêcher la modification de userId et childId
    delete updateData.userId;
    delete updateData.childId;

    // Gérer les champs null comme des suppressions de champ
    const cleanData = { ...updateData, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    for (const [key, value] of Object.entries(cleanData)) {
      if (value === null) {
        cleanData[key] = admin.firestore.FieldValue.delete();
      }
    }

    // Convertir date en Firestore Timestamp
    if (cleanData.date) {
      cleanData.date = toFirestoreTimestamp(cleanData.date);
    }

    await eventRef.update(cleanData);
    return { success: true };
  }
);

/**
 * deleteEventCascade — Suppression atomique événement + likes + commentaires
 */
exports.deleteEventCascade = onCall(
  { region: "europe-west1" },
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

    // Collecter les likes et commentaires à supprimer
    const [likesSnap, commentsSnap] = await Promise.all([
      db.collection("eventLikes").where("eventId", "==", eventId).limit(500).get(),
      db.collection("eventComments").where("eventId", "==", eventId).limit(500).get(),
    ]);

    // Suppression atomique via batch write (max 500 opérations par batch)
    const batch = db.batch();
    batch.delete(eventRef);
    likesSnap.docs.forEach((doc) => batch.delete(doc.ref));
    commentsSnap.docs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();

    return {
      success: true,
      deleted: {
        event: 1,
        likes: likesSnap.size,
        comments: commentsSnap.size,
      },
    };
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
  { region: "europe-west1", timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "deleteUserAccount");

    const uid = request.auth.uid;
    const db = admin.firestore();

    // Rate limit: 1 suppression/min max
    await checkRateLimit(db, uid, "delete", 1);

    // Récupérer l'email pour cleanup des invitations
    let email = "";
    try {
      const userRecord = await admin.auth().getUser(uid);
      email = (userRecord.email || "").toLowerCase();
    } catch (e) {
      // User may already be partially deleted, continue
      console.warn(`deleteUserAccount: could not fetch user record for ${uid}`, e.message);
    }

    // 1. Récupérer tous les enfants auxquels l'utilisateur a accès
    const accessSnapshot = await db
      .collection("user_child_access")
      .where("userId", "==", uid)
      .get();

    // 2. Traiter chaque enfant
    for (const accessDoc of accessSnapshot.docs) {
      const { childId, role } = accessDoc.data();
      if (!childId) continue;

      const childAccessSnap = await db
        .collection("children").doc(childId).collection("access")
        .get();

      if (childAccessSnap.size <= 1) {
        // Seul utilisateur → supprimer l'enfant et toutes ses données
        await deleteChildDataBatched(db, childId);
        await db.doc(`children/${childId}`).delete();
      } else if (role === "owner") {
        // Owner avec co-parents → transférer la propriété
        await transferOwnership(db, childId, uid, childAccessSnap);
        await db.doc(`children/${childId}/access/${uid}`).delete();
      } else {
        // Non-owner → supprimer l'accès uniquement
        await db.doc(`children/${childId}/access/${uid}`).delete();
      }

      // Supprimer l'entrée d'index
      await accessDoc.ref.delete();
    }

    // 3. Supprimer les données créées par l'utilisateur (par userId)
    await Promise.all([
      deleteDocsByFieldBatched(db, "events", "userId", uid),
      deleteDocsByFieldBatched(db, "eventLikes", "userId", uid),
      deleteDocsByFieldBatched(db, "eventComments", "userId", uid),
      deleteDocsByFieldBatched(db, "babyAttachmentRequests", "userId", uid),
      deleteDocsByFieldBatched(db, "shareCodes", "createdBy", uid),
      deleteDocsByFieldBatched(db, "device_tokens", "userId", uid),
      deleteDocsByFieldBatched(db, "notification_history", "userId", uid),
      deleteDocsByFieldBatched(db, "recap_history", "userId", uid),
    ]);

    // 4. Supprimer les invitations par email
    if (email) {
      await Promise.all([
        deleteDocsByFieldBatched(db, "shareInvitations", "inviterEmail", email),
        deleteDocsByFieldBatched(db, "shareInvitations", "invitedEmail", email),
      ]);
    }

    // 5. Supprimer les documents uniques de l'utilisateur
    const singleDocPaths = [
      `users/${uid}`,
      `users_public/${uid}`,
      `user_preferences/${uid}`,
      `rate_limits/${uid}`,
      `usage_limits/${uid}`,
    ];
    const batch = db.batch();
    singleDocPaths.forEach((path) => batch.delete(db.doc(path)));
    await batch.commit();

    // 6. Supprimer l'utilisateur Firebase Auth (DERNIER — irréversible)
    try {
      await admin.auth().deleteUser(uid);
    } catch (e) {
      console.error(`deleteUserAccount: failed to delete auth user ${uid}`, e.message);
      // Data is already cleaned up, auth deletion failure is non-critical
    }

    console.log(`deleteUserAccount: completed for uid=${uid}`);
    return { success: true };
  }
);

// ============================================
// REMINDER PUSH NOTIFICATIONS (Scheduled)
// ============================================

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

    for (const prefDoc of prefsSnapshot.docs) {
      const userId = prefDoc.id;
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

/**
 * Calcule les stats d'une semaine pour un enfant.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} childId
 * @param {admin.firestore.Timestamp} weekStart
 * @param {admin.firestore.Timestamp} weekEnd
 */
async function computeWeeklyStats(db, childId, weekStart, weekEnd) {
  const eventsSnap = await db
    .collection("events")
    .where("childId", "==", childId)
    .where("date", ">=", weekStart)
    .where("date", "<=", weekEnd)
    .orderBy("date", "desc")
    .get();

  const stats = {
    meals: { count: 0, biberonsCount: 0, biberonsMl: 0, teteesCount: 0, teteesMinutes: 0, solidesCount: 0 },
    sleep: { totalMinutes: 0, nightCount: 0, napCount: 0 },
    changes: { total: 0, mictions: 0, selles: 0 },
    pompages: { count: 0, totalMl: 0 },
    growth: { hasData: false, weight: null, height: null, head: null },
    health: { vitamines: 0, medicaments: 0, vaccins: 0, symptomes: 0 },
    activities: 0,
  };

  for (const doc of eventsSnap.docs) {
    const e = doc.data();
    switch (e.type) {
      case "biberon":
        stats.meals.count++;
        stats.meals.biberonsCount++;
        stats.meals.biberonsMl += e.quantite || 0;
        break;
      case "tetee":
        stats.meals.count++;
        stats.meals.teteesCount++;
        stats.meals.teteesMinutes += (e.dureeGauche || 0) + (e.dureeDroite || 0);
        break;
      case "solide":
        stats.meals.count++;
        stats.meals.solidesCount++;
        break;
      case "pompage":
        stats.pompages.count++;
        stats.pompages.totalMl += (e.quantiteGauche || 0) + (e.quantiteDroite || 0);
        break;
      case "miction":
        stats.changes.total++;
        stats.changes.mictions++;
        break;
      case "selle":
        stats.changes.total++;
        stats.changes.selles++;
        break;
      case "couche":
        stats.changes.total++;
        break;
      case "sommeil":
        if (e.isNap) {
          stats.sleep.napCount++;
        } else {
          stats.sleep.nightCount++;
        }
        stats.sleep.totalMinutes += e.duree || 0;
        break;
      case "croissance":
        stats.growth.hasData = true;
        if (e.poidsKg) stats.growth.weight = e.poidsKg;
        if (e.tailleCm) stats.growth.height = e.tailleCm;
        if (e.teteCm) stats.growth.head = e.teteCm;
        break;
      case "vitamine":
        stats.health.vitamines++;
        break;
      case "medicament":
        stats.health.medicaments++;
        break;
      case "vaccin":
        stats.health.vaccins++;
        break;
      case "symptome":
        stats.health.symptomes++;
        break;
      case "activite":
        stats.activities++;
        break;
    }
  }

  return stats;
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
 * Pour chaque utilisateur ayant activé l'email :
 *   - Calcule les stats de la semaine écoulée (lundi-dimanche)
 *   - Compare avec la semaine précédente
 *   - Envoie un email HTML via Resend
 */
exports.sendWeeklyRecap = onSchedule(
  {
    schedule: "every monday 08:00",
    timeZone: "Europe/Paris",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 300,
    secrets: ["RESEND_API_KEY"],
  },
  async () => {
    console.log("sendWeeklyRecap: START");
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("sendWeeklyRecap: RESEND_API_KEY not configured");
      return;
    }
    console.log("sendWeeklyRecap: API key OK");

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

    // Semaine d'avant (pour les tendances)
    const prevMonday = new Date(lastMonday);
    prevMonday.setDate(lastMonday.getDate() - 7);

    const prevSunday = new Date(lastMonday);
    prevSunday.setDate(lastMonday.getDate() - 1);
    prevSunday.setHours(23, 59, 59, 999);

    console.log(`sendWeeklyRecap: date calc — now=${now.toISOString()}, dayOfWeek=${dayOfWeek}, isMonday=${isMonday}, lastMonday=${lastMonday.toISOString()}, lastSunday=${lastSunday.toISOString()}`);

    const weekStart = admin.firestore.Timestamp.fromDate(lastMonday);
    const weekEnd = admin.firestore.Timestamp.fromDate(lastSunday);
    const prevWeekStart = admin.firestore.Timestamp.fromDate(prevMonday);
    const prevWeekEnd = admin.firestore.Timestamp.fromDate(prevSunday);

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

    for (const prefDoc of prefsSnap.docs) {
      const userId = prefDoc.id;

      console.log(`sendWeeklyRecap: processing user ${userId}`);
      // Récupérer l'email depuis le document utilisateur Firestore (pas Firebase Auth)
      let userEmail;
      try {
        const userDoc = await db.doc(`users/${userId}`).get();
        if (userDoc.exists) {
          userEmail = userDoc.data().email;
        }
        // Fallback sur users_public si pas trouvé
        if (!userEmail) {
          const publicDoc = await db.doc(`users_public/${userId}`).get();
          if (publicDoc.exists) {
            userEmail = publicDoc.data().email;
          }
        }
        if (!userEmail) {
          console.warn(`sendWeeklyRecap: no email found for user ${userId}`);
          totalSkipped++;
          continue;
        }
      } catch (error) {
        console.warn(`sendWeeklyRecap: error fetching email for ${userId}`, error.message);
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

        // Anti-doublon : vérifier si déjà envoyé pour cette semaine
        const existingSnap = await db
          .collection("recap_history")
          .where("userId", "==", userId)
          .where("childId", "==", childId)
          .where("weekStart", "==", weekStart)
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          const existingDoc = existingSnap.docs[0].data();
          console.log(`sendWeeklyRecap: SKIP ${childId} for user ${userId} - already sent this week (docId=${existingSnap.docs[0].id}, sentAt=${existingDoc.sentAt?.toDate?.()?.toISOString()})`);
          totalSkipped++;
          continue;
        }

        // Récupérer le nom de l'enfant
        const childDoc = await db.doc(`children/${childId}`).get();
        if (!childDoc.exists) continue;
        const childName = childDoc.data().name || "Bébé";

        // Calculer les stats des deux semaines
        const [stats, previousStats] = await Promise.all([
          computeWeeklyStats(db, childId, weekStart, weekEnd),
          computeWeeklyStats(db, childId, prevWeekStart, prevWeekEnd),
        ]);

        // Vérifier qu'il y a eu de l'activité cette semaine
        const hasActivity =
          stats.meals.count > 0 ||
          stats.sleep.totalMinutes > 0 ||
          stats.changes.total > 0 ||
          stats.pompages.count > 0;

        if (!hasActivity) {
          console.log(`sendWeeklyRecap: SKIP ${childName} (${childId}) - no activity this week (meals=${stats.meals.count}, sleep=${stats.sleep.totalMinutes}, changes=${stats.changes.total})`);
          totalSkipped++;
          continue;
        }

        // Générer le HTML
        const html = buildRecapHTML({
          childName,
          weekLabel,
          stats,
          previousStats,
          unsubscribeUrl: "samaye://settings/notifications",
        });

        // Envoyer via Resend
        console.log(`sendWeeklyRecap: sending to ${userEmail} for ${childName} (hasActivity=${hasActivity})`);
        try {
          const sendResult = await resend.emails.send({
            from: "Samaye <onboarding@resend.dev>",
            to: userEmail,
            subject: `Récap semaine — ${childName}`,
            html,
          });
          console.log(`sendWeeklyRecap: Resend response`, JSON.stringify(sendResult));

          // Enregistrer dans l'historique
          await db.collection("recap_history").add({
            userId,
            childId,
            weekStart,
            weekEnd,
            sentAt: admin.firestore.Timestamp.now(),
            stats,
          });

          totalSent++;
        } catch (error) {
          console.error(
            `sendWeeklyRecap: error sending to ${userEmail} for ${childName}:`,
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
