import type { TimestampInfo } from "./types";

/**
 * Extrait l'heure d'un texte (format "15h20", "15 heures 20", etc.)
 */
export function extractTime(text: string): Date | null {
  const timePatterns = [
    /(\d{1,2})\s*h\s*(\d{2})?/i, // "15h20" ou "15h"
    /(\d{1,2})\s*heures?\s*(\d{2})?/i, // "15 heures 20"
    /(\d{1,2}):(\d{2})/i, // "15:20"
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
      }
    }
  }
  return null;
}

/**
 * Extrait le timestamp depuis le texte (passé ou futur)
 */
export function extractTimestamp(lowerText: string): TimestampInfo {
  let timeOffset = 0;
  let isFuture = false;

  // Patterns pour le passé
  const pastPatterns = [
    /il y a (\d+)\s*(min|minute|h|heure)/i,
    /(\d+)\s*(min|minute|h|heure)\s*(avant|plus tôt|plus tot)/i,
    /y'?\s*a\s+(\d+)\s*(min|minute)/i,
  ];

  // Patterns pour le futur
  const futurePatterns = [
    /dans (\d+)\s*(min|minute|h|heure)/i,
    /(\d+)\s*(min|minute|h|heure)\s*(après|plus tard)/i,
  ];

  // Vérifier le futur
  for (const pattern of futurePatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      timeOffset = parseInt(match[1]);
      if (match[2] && (match[2].startsWith("h") || match[2] === "heure")) {
        timeOffset *= 60;
      }
      isFuture = true;
      break;
    }
  }

  // Si pas de futur, vérifier le passé
  if (!isFuture) {
    for (const pattern of pastPatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        timeOffset = parseInt(match[1]);
        if (match[2] && (match[2].startsWith("h") || match[2] === "heure")) {
          timeOffset *= 60;
        }
        break;
      }
    }
  }

  const timestamp = new Date();
  if (timeOffset > 0) {
    if (isFuture) {
      timestamp.setMinutes(timestamp.getMinutes() + timeOffset);
    } else {
      timestamp.setMinutes(timestamp.getMinutes() - timeOffset);
    }
  }

  return { timestamp, timeOffset, isFuture };
}

/**
 * Extrait le timestamp depuis un segment de texte
 * (identique à extractTimestamp mais garde le nom pour clarté sémantique)
 */
export function extractTimestampFromSegment(lowerText: string): TimestampInfo {
  return extractTimestamp(lowerText);
}
