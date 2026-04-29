// services/dataAnonymizationService.ts
// Anonymise les données utilisateur avant envoi à un LLM/API externe (RGPD art. 9)
// Principe : ne jamais envoyer de données identifiantes (noms, dates de naissance exactes, emails, UIDs)

import type { Baby } from "@/types/baby";
import { toDate as toJsDate } from "@/utils/date";

/**
 * Event timestamps reach this service in several wire shapes (Firestore
 * Timestamp, httpsCallable {seconds, nanoseconds}, Date, ISO string,
 * millis number). Treat them as `unknown` and let `toJsDate` from
 * `utils/date.ts` normalise — it accepts every observed shape.
 */
type EventTimestamp = unknown;

interface AnonymizedChildData {
  ageInMonths: number;
  gender?: string;
  weight?: number;
  height?: number;
  allergies?: string[];
}

interface AnonymizedEventData {
  type: string;
  timestamp: string; // heure relative ("il y a 2h") ou heure seule ("14:30")
  details: Record<string, unknown>;
}

/**
 * Anonymise les données d'un enfant pour envoi IA.
 * Remplace : nom → omis, date de naissance → age en mois, UIDs → omis
 */
export function anonymizeChildData(child: Baby): AnonymizedChildData {
  const now = new Date();
  const birthDate = toJsDate(child.birthDate);
  const ageInMonths = Math.floor(
    (now.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );

  return {
    ageInMonths,
    gender: child.gender,
    weight: child.weight,
    height: child.height,
    allergies: child.allergies,
  };
}

/**
 * Anonymise un evenement pour envoi IA.
 * Supprime : childId, userId, notes contenant potentiellement des noms
 */
export function anonymizeEvent(event: {
  type: string;
  timestamp: EventTimestamp;
  details?: Record<string, unknown>;
  childId?: string;
  userId?: string;
  note?: string;
}): AnonymizedEventData {
  const { childId, userId, note, ...rest } = event;
  const ts = toJsDate(event.timestamp);

  return {
    type: rest.type,
    timestamp: ts.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    details: rest.details ?? {},
  };
}

/**
 * Nettoie une chaine de texte libre de toute donnee identifiante connue.
 * Utilise pour les notes avant envoi IA.
 */
export function stripPII(
  text: string,
  knownNames: string[] = []
): string {
  let cleaned = text;

  // Supprimer les noms connus (prenoms des enfants, parents)
  for (const name of knownNames) {
    if (name.length >= 2) {
      cleaned = cleaned.replace(new RegExp(`\\b${escapeRegex(name)}\\b`, "gi"), "[enfant]");
    }
  }

  // Supprimer les emails
  cleaned = cleaned.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");

  // Supprimer les numeros de telephone (formats FR)
  cleaned = cleaned.replace(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g, "[tel]");

  return cleaned;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
