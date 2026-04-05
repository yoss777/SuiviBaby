const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");

const { Expo } = require("expo-server-sdk");
const { Resend } = require("resend");
const { buildRecapHTML } = require("./emailTemplates");
const { hasRequiredChildAccess } = require("./accessControl");

admin.initializeApp();

const BATCH_LIMIT = 450;
const CHILD_DELETION_RETENTION_DAYS = 30;
const DELETION_REQUEST_EXPIRY_DAYS = 7;
const APP_CHECK_ENFORCED = process.env.APPCHECK_ENFORCE === "true";
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
    console.warn(`[AppCheck] ${functionName}: UNVERIFIED (uid: ${request.auth?.uid})`);
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
  withAppCheck({
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: ["ASSEMBLYAI_API_KEY"],
  }),
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

// ============================================
// CLOUD FUNCTIONS
// ============================================

/**
 * findUserByEmail — Recherche un utilisateur par email (côté serveur uniquement)
 * Évite d'exposer les emails dans users_public via des queries client.
 */
exports.findUserByEmail = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "findUserByEmail");

    const db = admin.firestore();
    await checkRateLimit(db, request.auth.uid, "findUser", 10);

    const { email } = request.data;
    if (!email || typeof email !== "string") {
      throw new HttpsError("invalid-argument", "Email requis.");
    }

    // Chercher dans 'users' (collection privée) via admin SDK — pas dans users_public
    // pour ne pas dépendre d'emails potentiellement non nettoyés dans users_public
    const snapshot = await db
      .collection("users")
      .where("email", "==", email.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { found: false, user: null };
    }

    const userDoc = snapshot.docs[0];
    return {
      found: true,
      user: {
        id: userDoc.id,
        userName: userDoc.data().userName || "Utilisateur",
      },
    };
  }
);

/**
 * migrateUsersPublicRemoveEmail — One-shot migration: retire le champ email de users_public.
 * À appeler une fois via Firebase Console ou CLI, puis supprimer.
 */
exports.migrateUsersPublicRemoveEmail = onCall(
  { region: "europe-west1", timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const db = admin.firestore();
    let totalUpdated = 0;

    while (true) {
      const snapshot = await db
        .collection("users_public")
        .where("email", "!=", null)
        .limit(BATCH_LIMIT)
        .get();

      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          email: admin.firestore.FieldValue.delete(),
        });
      });
      await batch.commit();

      totalUpdated += snapshot.size;
      if (snapshot.size < BATCH_LIMIT) break;
    }

    console.log(`[Migration] Removed email from ${totalUpdated} users_public docs`);
    return { success: true, totalUpdated };
  }
);

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
  if (!hasRequiredChildAccess(accessData, requiredRoles)) {
    throw new HttpsError(
      "permission-denied",
      `Rôle '${role}' insuffisant. Requis: ${requiredRoles.join("/")}.`
    );
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
  withAppCheck({ region: "europe-west1" }),
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

    // Idempotency: if the client sends an idempotencyKey, check whether an
    // event with that key already exists to prevent duplicates on retry.
    const { idempotencyKey, ...cleanEventData } = eventData;
    if (idempotencyKey && typeof idempotencyKey === "string") {
      const existing = await db
        .collection("events")
        .where("childId", "==", childId)
        .where("idempotencyKey", "==", idempotencyKey)
        .limit(1)
        .get();
      if (!existing.empty) {
        return { id: existing.docs[0].id };
      }
    }

    // Enrichissement serveur
    const serverData = {
      ...cleanEventData,
      childId,
      userId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Persist the idempotency key so future retries can detect the duplicate.
    if (idempotencyKey) {
      serverData.idempotencyKey = idempotencyKey;
    }

    // Convertir date en Firestore Timestamp
    if (cleanEventData.date) {
      serverData.date = toFirestoreTimestamp(cleanEventData.date);
    }

    const ref = await db.collection("events").add(serverData);
    return { id: ref.id };
  }
);

/**
 * validateAndUpdateEvent — Modification d'événement avec validation serveur
 */
exports.validateAndUpdateEvent = onCall(
  withAppCheck({ region: "europe-west1" }),
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
// ACCOUNT DELETION (RGPD)
// ============================================

/**
 * deleteUserAccount — Suppression complète du compte utilisateur et de toutes ses données.
 * Obligatoire pour conformité RGPD (Apple/Google Store requirement).
 */
exports.deleteUserAccount = onCall(
  withAppCheck({ region: "europe-west1", timeoutSeconds: 300, memory: "512MiB" }),
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
// REVENUECAT WEBHOOK
// ============================================

/**
 * revenueCatWebhook — Reçoit les événements RevenuCat et met à jour Firestore.
 * URL à configurer dans RevenuCat Dashboard → Integrations → Webhooks.
 * Authentifié par header Authorization Bearer.
 */
exports.revenueCatWebhook = onRequest(
  { region: "europe-west1", secrets: ["REVENUECAT_WEBHOOK_SECRET"] },
  async (req, res) => {
    // Vérifier la méthode
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Vérifier le secret
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    const authHeader = req.headers.authorization || "";
    if (secret && authHeader !== `Bearer ${secret}`) {
      console.warn("revenueCatWebhook: invalid auth header");
      res.status(401).send("Unauthorized");
      return;
    }

    const event = req.body?.event;
    if (!event) {
      res.status(400).send("Missing event");
      return;
    }

    const appUserId = event.app_user_id;
    if (!appUserId || appUserId.startsWith("$RCAnonymous")) {
      // Ignorer les utilisateurs anonymes
      res.status(200).send("OK - skipped anonymous");
      return;
    }

    const db = admin.firestore();
    const eventType = event.type;
    const entitlements = event.entitlement_ids || [];

    // Déterminer le tier
    let tier = "free";
    if (entitlements.includes("family")) tier = "family";
    else if (entitlements.includes("premium")) tier = "premium";

    // Déterminer le status
    let status = "active";
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
        status = "active";
        break;
      case "CANCELLATION":
        status = "cancelled";
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
        console.log(`revenueCatWebhook: unhandled event type ${eventType}`);
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
      updatedAt: admin.firestore.Timestamp.now(),
      lastEvent: eventType,
    };

    await db.doc(`subscriptions/${appUserId}`).set(subscriptionData, { merge: true });

    console.log(`revenueCatWebhook: uid=${appUserId}, type=${eventType}, tier=${tier}, status=${status}`);
    res.status(200).send("OK");
  }
);

// ============================================
// GRANDFATHER PLAN
// ============================================

/**
 * grandfatherExistingUsers — Script one-shot pour marquer les utilisateurs existants.
 * À appeler manuellement via la console Firebase ou un script admin.
 * Marque tous les comptes créés avant une date donnée comme "grandfathered".
 */
exports.grandfatherExistingUsers = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    // Vérifier que l'appelant est admin (à remplacer par un vrai check admin)
    const db = admin.firestore();
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists()) {
      throw new HttpsError("permission-denied", "Utilisateur introuvable.");
    }

    const { cutoffDate } = request.data;
    if (!cutoffDate) {
      throw new HttpsError("invalid-argument", "cutoffDate requis (ISO 8601).");
    }

    const cutoff = new Date(cutoffDate);
    const usersSnap = await db
      .collection("users")
      .where("createdAt", "<=", cutoff)
      .get();

    let count = 0;
    const batchSize = 450;
    let batch = db.batch();

    for (const userDoc of usersSnap.docs) {
      batch.set(
        db.doc(`subscriptions/${userDoc.id}`),
        { grandfathered: true, tier: "free", status: "grandfathered" },
        { merge: true }
      );
      count++;

      if (count % batchSize === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    if (count % batchSize !== 0) {
      await batch.commit();
    }

    console.log(`grandfatherExistingUsers: marked ${count} users as grandfathered (before ${cutoffDate})`);
    return { success: true, count };
  }
);

// ============================================
// REFERRAL SYSTEM
// ============================================

/**
 * validateReferralCode — Valide un code parrainage et attribue 1 mois Premium
 * au parrain ET au filleul.
 */
exports.validateReferralCode = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const filleulUid = request.auth.uid;
    const { referralCode } = request.data;
    const db = admin.firestore();

    if (!referralCode || typeof referralCode !== "string") {
      throw new HttpsError("invalid-argument", "Code parrainage invalide.");
    }

    // Chercher le parrain par son code (stocké dans user_promos)
    const promosSnap = await db
      .collection("user_promos")
      .where("referralCode", "==", referralCode.toUpperCase())
      .limit(1)
      .get();

    if (promosSnap.empty) {
      throw new HttpsError("not-found", "Code parrainage introuvable.");
    }

    const parrainDoc = promosSnap.docs[0];
    const parrainUid = parrainDoc.id;

    // Empêcher l'auto-parrainage
    if (parrainUid === filleulUid) {
      throw new HttpsError("failed-precondition", "Vous ne pouvez pas utiliser votre propre code.");
    }

    // Vérifier que le filleul n'a pas déjà utilisé un code
    const filleulDoc = await db.doc(`user_promos/${filleulUid}`).get();
    if (filleulDoc.exists() && filleulDoc.data()?.referredBy) {
      throw new HttpsError("already-exists", "Vous avez deja utilise un code parrainage.");
    }

    const now = admin.firestore.Timestamp.now();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    const batch = db.batch();

    // 1. Enregistrer le parrainage
    batch.set(db.collection("referrals").doc(), {
      parrainUid,
      filleulUid,
      referralCode,
      createdAt: now,
    });

    // 2. Incrémenter le compteur du parrain
    const parrainData = parrainDoc.data() || {};
    batch.update(parrainDoc.ref, {
      referralCount: (parrainData.referralCount || 0) + 1,
    });

    // 3. Marquer le filleul comme parrainé
    batch.set(db.doc(`user_promos/${filleulUid}`), {
      referredBy: parrainUid,
      referredAt: now,
    }, { merge: true });

    // 4. Attribuer 1 mois Premium au parrain
    batch.set(db.doc(`subscriptions/${parrainUid}`), {
      tier: "premium",
      status: "active",
      startDate: now.toDate().toISOString(),
      expiresAt: oneMonthLater.toISOString(),
      source: "referral_reward",
    }, { merge: true });

    // 5. Attribuer 1 mois Premium au filleul
    batch.set(db.doc(`subscriptions/${filleulUid}`), {
      tier: "premium",
      status: "active",
      startDate: now.toDate().toISOString(),
      expiresAt: oneMonthLater.toISOString(),
      source: "referral_reward",
    }, { merge: true });

    await batch.commit();

    console.log(`validateReferralCode: parrain=${parrainUid}, filleul=${filleulUid}`);
    return { success: true, parrainUid, message: "1 mois Premium offert !" };
  }
);

// ============================================
// AI INSIGHTS (Claude Haiku proxy)
// ============================================

/**
 * generateAiInsight — Proxy vers Claude Haiku pour insights IA Premium.
 * Reçoit des données anonymisées, retourne un insight enrichi.
 * Rate limited: 10 requêtes/heure/utilisateur.
 */
exports.generateAiInsight = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 30 }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const uid = request.auth.uid;
    const db = admin.firestore();

    // Rate limit: 10 requêtes/heure
    await checkRateLimit(db, uid, "ai_insight", 10);

    const { child, events, requestType } = request.data;

    if (!child || !events || !requestType) {
      throw new HttpsError("invalid-argument", "Données manquantes.");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("generateAiInsight: ANTHROPIC_API_KEY not configured");
      throw new HttpsError("internal", "Service IA non configuré.");
    }

    // Construire le prompt selon le type de requête
    let systemPrompt = "Tu es un assistant pour une app de suivi bébé. Tu donnes des conseils bienveillants basés sur les données. Réponds en français, 2-3 phrases max. Ne donne JAMAIS de diagnostic médical. Si quelque chose semble anormal, recommande de consulter un pédiatre.";

    let userPrompt = "";

    if (requestType === "advanced_insight") {
      userPrompt = `Bébé de ${child.ageInMonths} mois (${child.gender || "genre non précisé"}).
Voici les ${events.length} derniers événements (type + heure) :
${events.slice(0, 30).map((e) => `- ${e.type} à ${e.timestamp}`).join("\n")}

Donne un insight utile pour le parent. Réponds en JSON : {"title": "...", "message": "...", "category": "alimentation|sommeil|sante|developpement"}`;
    } else if (requestType === "daily_summary") {
      userPrompt = `Bébé de ${child.ageInMonths} mois. Résume cette journée :
${events.map((e) => `- ${e.type} à ${e.timestamp}`).join("\n")}

Réponds en JSON : {"title": "...", "highlights": ["..."], "concerns": ["..."], "suggestion": "..."}`;
    } else if (requestType === "predictions") {
      userPrompt = `Bébé de ${child.ageInMonths} mois. Basé sur ces événements récents, prédit le prochain événement probable :
${events.slice(0, 20).map((e) => `- ${e.type} à ${e.timestamp}`).join("\n")}

Réponds en JSON : {"predictions": [{"type": "feeding|sleep|diaper", "estimatedTime": "...", "confidence": "low|medium|high", "basedOn": "..."}]}`;
    }

    try {
      // Appel Claude Haiku via API REST
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!response.ok) {
        console.error("generateAiInsight: Claude API error", response.status);
        throw new HttpsError("internal", "Erreur du service IA.");
      }

      const result = await response.json();
      const text = result.content?.[0]?.text || "";

      // Parser le JSON de la réponse
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new HttpsError("internal", "Réponse IA invalide.");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (requestType === "advanced_insight") {
        return { insight: parsed };
      } else if (requestType === "daily_summary") {
        return { summary: parsed };
      } else if (requestType === "predictions") {
        return { predictions: parsed.predictions };
      }

      return parsed;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("generateAiInsight: error", error.message);
      throw new HttpsError("internal", "Erreur lors de la génération de l'insight.");
    }
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

    const deletionDate = new Date(userData.pendingDeletion.deletionDate).toLocaleDateString("fr-FR");

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("sendDeletionRequestEmail: RESEND_API_KEY not configured");
      return { success: false };
    }

    const resend = new Resend(apiKey);
    await resend.emails.send({
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

    return { success: true };
  }
);

// ============================================
// SCHEDULED ACCOUNT DELETION (Grace period 30 days)
// ============================================

/**
 * processScheduledDeletions — Exécutée toutes les 24h.
 * Traite les comptes marqués `pendingDeletion` dont la date est dépassée.
 * Appelle la même logique que deleteUserAccount pour chaque compte expiré.
 */
exports.processScheduledDeletions = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1", timeoutSeconds: 540, memory: "512MiB", secrets: ["RESEND_API_KEY"] },
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
      try {
        // Récupérer email pour cleanup invitations
        let email = "";
        try {
          const userRecord = await admin.auth().getUser(uid);
          email = (userRecord.email || "").toLowerCase();
        } catch (e) {
          console.warn(`processScheduledDeletions: could not fetch user record for ${uid}`, e.message);
        }

        // 1. Traiter les enfants
        const accessSnapshot = await db
          .collection("user_child_access")
          .where("userId", "==", uid)
          .get();

        for (const accessDoc of accessSnapshot.docs) {
          const { childId, role } = accessDoc.data();
          if (!childId) continue;

          const childAccessSnap = await db
            .collection("children").doc(childId).collection("access")
            .get();

          if (childAccessSnap.size <= 1) {
            await deleteChildDataBatched(db, childId);
            await db.doc(`children/${childId}`).delete();
          } else if (role === "owner") {
            await transferOwnership(db, childId, uid, childAccessSnap);
            await db.doc(`children/${childId}/access/${uid}`).delete();
          } else {
            await db.doc(`children/${childId}/access/${uid}`).delete();
          }
          await accessDoc.ref.delete();
        }

        // 2. Supprimer les données utilisateur
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

        // 3. Invitations par email
        if (email) {
          await Promise.all([
            deleteDocsByFieldBatched(db, "shareInvitations", "inviterEmail", email),
            deleteDocsByFieldBatched(db, "shareInvitations", "invitedEmail", email),
          ]);
        }

        // 4. Documents uniques
        const singleDocPaths = [
          `users/${uid}`, `users_public/${uid}`, `user_preferences/${uid}`,
          `rate_limits/${uid}`, `usage_limits/${uid}`,
        ];
        const batch = db.batch();
        singleDocPaths.forEach((path) => batch.delete(db.doc(path)));
        await batch.commit();

        // 5. Supprimer Firebase Auth
        try {
          await admin.auth().deleteUser(uid);
        } catch (e) {
          console.error(`processScheduledDeletions: failed to delete auth user ${uid}`, e.message);
        }

        // 6. Envoyer email de confirmation de suppression
        if (email) {
          try {
            const apiKey = process.env.RESEND_API_KEY;
            if (apiKey) {
              const resend = new Resend(apiKey);
              await resend.emails.send({
                from: "Suivi Baby <noreply@suivibaby.com>",
                to: email,
                subject: "Votre compte Suivi Baby a ete supprime",
                html: `
                  <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #1a1a1a;">Suppression confirmee</h2>
                    <p>Votre compte Suivi Baby et toutes les donnees associees ont ete definitivement supprimes, conformement a votre demande.</p>
                    <p>Si vous n'etes pas a l'origine de cette suppression, contactez-nous immediatement a <a href="mailto:privacy@suivibaby.com">privacy@suivibaby.com</a>.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">Cet email a ete envoye automatiquement par Suivi Baby. Conformite RGPD art. 17.</p>
                  </div>
                `,
              });
            }
          } catch (emailErr) {
            console.warn(`processScheduledDeletions: failed to send deletion email to ${email}`, emailErr.message);
          }
        }

        console.log(`processScheduledDeletions: deleted uid=${uid}`);
      } catch (e) {
        console.error(`processScheduledDeletions: error processing uid=${uid}`, e.message);
      }
    }
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

  // 2. Mark child as soft-deleted
  await db.doc(`children/${childId}`).update({
    deletedAt: now,
    deletedBy: requestedBy,
    deletionRequestId: requestId,
  });

  // 3. Update the deletion request — store access snapshot for potential restore
  await db.doc(`childDeletionRequests/${requestId}`).update({
    deletedAt: now,
    purgeAt,
    accessSnapshot, // { userId: { role, canWriteEvents, ... } } — used by cancelChildDeletion
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
    const { requestId, vote } = request.data;

    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId requis.");
    }
    if (!["approved", "refused"].includes(vote)) {
      throw new HttpsError("invalid-argument", "Vote doit être 'approved' ou 'refused'.");
    }

    const db = admin.firestore();
    const requestRef = db.doc(`childDeletionRequests/${requestId}`);
    const requestDoc = await requestRef.get();

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
      await requestRef.update({
        status: "refused",
        refusedBy: uid,
        refusedByEmail: request.auth.token.email || "",
        refusedAt: now,
        [`ownerVotes.${uid}.vote`]: "refused",
        [`ownerVotes.${uid}.votedAt`]: now,
      });
      return { status: "refused" };
    }

    // Vote approved
    const updatedVotes = { ...data.ownerVotes };
    updatedVotes[uid] = { vote: "approved", votedAt: now };

    // Check if all owners have now approved
    const allApproved = Object.values(updatedVotes).every((v) => v.vote === "approved");

    if (allApproved) {
      await requestRef.update({
        status: "approved",
        approvedAt: now,
        [`ownerVotes.${uid}.vote`]: "approved",
        [`ownerVotes.${uid}.votedAt`]: now,
      });
      await softDeleteChild(db, data.childId, requestId, data.requestedBy);
      return { status: "approved" };
    }

    // Not all approved yet — just record this vote
    await requestRef.update({
      [`ownerVotes.${uid}.vote`]: "approved",
      [`ownerVotes.${uid}.votedAt`]: now,
    });

    return { status: "pending" };
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

    // Verify caller is owner
    const callerAccess = await db.doc(`children/${childId}/access/${uid}`).get();
    if (!callerAccess.exists || callerAccess.data().role !== "owner") {
      throw new HttpsError("permission-denied", "Seul un propriétaire peut transférer.");
    }

    // Verify new owner has existing access
    const newOwnerAccess = await db.doc(`children/${childId}/access/${newOwnerId}`).get();
    if (!newOwnerAccess.exists) {
      throw new HttpsError("not-found", "Le nouveau propriétaire n'a pas accès à cet enfant.");
    }

    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();

    // 1. Promote new owner
    batch.update(db.doc(`children/${childId}/access/${newOwnerId}`), {
      role: "owner",
      canWriteEvents: true,
      canWriteLikes: true,
      canWriteComments: true,
      grantedBy: uid,
      grantedAt: now,
    });

    // 2. Update ownerId on child document
    batch.update(db.doc(`children/${childId}`), {
      ownerId: newOwnerId,
    });

    // 3. Delete former owner's access
    batch.delete(db.doc(`children/${childId}/access/${uid}`));

    await batch.commit();

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

    console.log(`transferAndLeave: childId=${childId}, from=${uid}, to=${newOwnerId}`);
    return { success: true };
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

    // 5. Mark deletion request as cancelled
    await requestRef.update({
      status: "cancelled",
      cancelledBy: uid,
      cancelledAt: now,
    });

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

  // --- Step 2: Purge soft-deleted children past retention ---
  const requestsSnap = await db
    .collection("childDeletionRequests")
    .where("status", "==", "approved")
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
      // Hard-delete all child data (reuse existing helper)
      await deleteChildDataBatched(db, childId);

      // Delete legacy collections not covered by deleteChildDataBatched
      const legacyExtras = ["croissances", "sommeils"];
      await Promise.all(
        legacyExtras.map((coll) => deleteDocsByFieldBatched(db, coll, "childId", childId))
      );

      // Delete storage files
      try {
        const bucket = admin.storage().bucket();
        const [files] = await bucket.getFiles({ prefix: `children/${childId}/` });
        if (files.length > 0) {
          await Promise.all(files.map((file) => file.delete().catch(() => null)));
        }
      } catch (storageErr) {
        console.warn(`purgeDeletedChildren: storage cleanup failed for ${childId}:`, storageErr.message);
      }

      // Delete the child document itself
      await db.doc(`children/${childId}`).delete();

      // Delete the deletion request
      await requestDoc.ref.delete();

      purged++;
    } catch (err) {
      console.error(`purgeDeletedChildren: error purging childId=${childId}:`, err.message);
    }
  }

  console.log(`purgeDeletedChildren: purged=${purged}/${requestsSnap.size}`);

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
