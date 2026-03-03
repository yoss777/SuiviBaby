const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();

const BATCH_LIMIT = 450;

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
    const rateLimitRef = db.doc(`rate_limits/${uid}`);
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const rateLimitDoc = await rateLimitRef.get();
    if (rateLimitDoc.exists) {
      const data = rateLimitDoc.data();
      const recentRequests = (data.timestamps || []).filter(
        (t) => t > oneMinuteAgo
      );
      if (recentRequests.length >= 10) {
        throw new HttpsError(
          "resource-exhausted",
          "Trop de requêtes. Réessayez dans une minute."
        );
      }
      await rateLimitRef.update({
        timestamps: [...recentRequests, now],
      });
    } else {
      await rateLimitRef.set({ timestamps: [now] });
    }

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
  "croissance", "vaccin", "vitamine", "activite", "jalon",
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
      if (data.duree !== undefined) {
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

    const uid = request.auth.uid;
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

    const db = admin.firestore();

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

    const uid = request.auth.uid;
    const { childId, eventId, ...updateData } = request.data;

    if (!childId || !eventId) {
      throw new HttpsError("invalid-argument", "childId et eventId sont requis.");
    }

    const db = admin.firestore();

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

    const uid = request.auth.uid;
    const { childId, eventId } = request.data;

    if (!childId || !eventId) {
      throw new HttpsError("invalid-argument", "childId et eventId sont requis.");
    }

    const db = admin.firestore();

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
