const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const VOICE_ENUMS = require("../../lib/enums");

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

module.exports = {
  VALID_EVENT_TYPES,
  convertEventDateFields,
  validateEventData,
};
