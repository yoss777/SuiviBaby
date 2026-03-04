import type { CommandAction, CommandType, EventIdentifier, ParsedSegment } from "./types";
import { normalizePhonetics } from "./phoneticNormalizer";
import { extractTime, extractTimestampFromSegment } from "./timestampParser";

/**
 * Détecte l'action (ajout, modification, suppression)
 */
export function detectAction(text: string): { action: CommandAction; cleanedText: string } {
  const lowerText = text.toLowerCase();

  // Patterns de suppression
  const deletePatterns = [
    /\b(supprime|supprimer|efface|effacer|enlève|enlever|retire|retirer|annule|annuler|delete)\b/i,
  ];

  // Patterns de modification
  const modifyPatterns = [
    /\b(modifie|modifier|change|changer|corrige|corriger|met|mettre|update|édite|edite|éditer|editer)\b/i,
    /\bc'était\b/i, // "c'était 180ml" implique une modification
    /\bce n'était pas\b/i,
    /\ben fait\b/i,
  ];

  for (const pattern of deletePatterns) {
    if (pattern.test(lowerText)) {
      return { action: "delete", cleanedText: text.replace(pattern, "").trim() };
    }
  }

  for (const pattern of modifyPatterns) {
    if (pattern.test(lowerText)) {
      return { action: "modify", cleanedText: text.replace(pattern, "").trim() };
    }
  }

  return { action: "add", cleanedText: text };
}

/**
 * Détecte l'identifiant d'un événement existant
 */
export function detectEventIdentifier(text: string, type: CommandType): EventIdentifier | null {
  const lowerText = text.toLowerCase();

  // "le dernier biberon", "la dernière tétée"
  if (/\b(dernier|dernière|derniere|last)\b/i.test(lowerText)) {
    return { type, isLast: true };
  }

  // "le biberon de 15h20"
  const targetTime = extractTime(text);
  if (targetTime && /\bde\s+\d{1,2}\s*h/i.test(lowerText)) {
    return { type, targetTime };
  }

  // "le pipi d'il y a 30 minutes"
  const relativeMatch = lowerText.match(/d'?il y a (\d+)\s*(min|minute|h|heure)/i);
  if (relativeMatch) {
    let minutes = parseInt(relativeMatch[1]);
    if (relativeMatch[2].startsWith("h")) {
      minutes *= 60;
    }
    return { type, relativeTime: minutes };
  }

  return null;
}

/**
 * Extrait le contexte secondaire d'un segment pour enrichir la note
 * Ex: "lire une histoire dans le parc" → typeActivite="lecture", contextNote="dans le parc"
 */
export function extractContextNote(text: string, detectedType: CommandType): string | null {
  const contextParts: string[] = [];

  // Patterns de contexte de lieu
  const lieuPatterns = [
    { pattern: /\b(dans|au|à)\s+(le\s+)?(parc|jardin|square)/i, label: "au parc" },
    { pattern: /\b(dehors|extérieur|à l'extérieur)/i, label: "dehors" },
    { pattern: /\b(dans|à)\s+(la\s+)?(chambre)/i, label: "dans la chambre" },
    { pattern: /\b(dans|au|à)\s+(le\s+)?(salon)/i, label: "au salon" },
    { pattern: /\b(dans|à)\s+(la\s+)?(cuisine)/i, label: "dans la cuisine" },
    { pattern: /\b(dans|à)\s+(la\s+)?(salle de bain|sdb)/i, label: "dans la salle de bain" },
    { pattern: /\b(chez)\s+(la\s+)?(nounou|mamie|papi|grand-mère|grand-père|grands-parents)/i, label: (m: RegExpMatchArray) => `chez ${m[3] || "la nounou"}` },
    { pattern: /\b(à|en)\s+(la\s+)?(crèche|creche)/i, label: "à la crèche" },
    { pattern: /\b(en\s+)?(poussette)/i, label: "en poussette" },
    { pattern: /\b(dans|sur)\s+(le\s+)?(lit|berceau|couffin)/i, label: "dans le lit" },
    { pattern: /\b(sur|dans)\s+(le\s+)?(tapis d'éveil|tapis)/i, label: "sur le tapis d'éveil" },
    { pattern: /\b(dans|sur)\s+(le\s+)?(transat|balancelle)/i, label: "dans le transat" },
  ];

  // Patterns de contexte d'accompagnement
  const accompagnementPatterns = [
    { pattern: /\bavec\s+(maman|papa|mamie|papi|nounou|grand-mère|grand-père)/i, label: (m: RegExpMatchArray) => `avec ${m[1]}` },
  ];

  // Patterns d'activités secondaires (pour enrichir les activités principales)
  const activiteSecondairePatterns: { pattern: RegExp; label: string; excludeFor: CommandType[] }[] = [
    { pattern: /\b(parc|jardin|square|promenade|balade)\b/i, label: "promenade", excludeFor: ["activite"] },
    { pattern: /\b(histoire|livre|conte)\b/i, label: "lecture", excludeFor: ["activite"] },
    { pattern: /\b(musique|chanson|berceuse)\b/i, label: "musique", excludeFor: ["activite"] },
    { pattern: /\b(jeux?|jouet|jouer)\b/i, label: "jeux", excludeFor: ["activite"] },
  ];

  // Extraire les contextes de lieu
  for (const { pattern, label } of lieuPatterns) {
    const match = text.match(pattern);
    if (match) {
      const contextLabel = typeof label === "function" ? label(match) : label;
      if (!contextParts.includes(contextLabel)) {
        contextParts.push(contextLabel);
      }
    }
  }

  // Extraire les contextes d'accompagnement
  for (const { pattern, label } of accompagnementPatterns) {
    const match = text.match(pattern);
    if (match) {
      const contextLabel = typeof label === "function" ? label(match) : label;
      if (!contextParts.includes(contextLabel)) {
        contextParts.push(contextLabel);
      }
    }
  }

  // Extraire les activités secondaires (sauf si c'est le type détecté)
  for (const { pattern, label, excludeFor } of activiteSecondairePatterns) {
    if (excludeFor.includes(detectedType)) continue;

    const match = text.match(pattern);
    if (match && !contextParts.includes(label)) {
      contextParts.push(label);
    }
  }

  return contextParts.length > 0 ? contextParts.join(", ") : null;
}

/**
 * Découpe une phrase en segments séparés par virgules, "et", "puis", et autres adverbes de temps.
 * Gère les timestamps relatifs ("20min après" = relatif au segment précédent)
 */
export function splitIntoSegments(text: string): ParsedSegment[] {
  const normalizedText = normalizePhonetics(text);

  // Séparateurs de segments
  const segmentPattern = new RegExp(
    [
      /[,;]/.source,
      /\s+(?:et|puis|ensuite|après|avant|or)\s+/.source,
      /\s+(?:après\s+(?:ça|cela|quoi)|avant\s+(?:ça|cela))\s*/.source,
      /\s+(?:d'abord|pour\s+commencer|premièrement|deuxièmement|troisièmement)\s+/.source,
      /\s+(?:finalement|pour\s+finir|au\s+final|pour\s+terminer|en\s+dernier)\s+/.source,
      /\s+(?:entre-temps|entre\s+temps|pendant\s+ce\s+temps)\s+/.source,
      /\s+(?:plus\s+tard|peu\s+après|juste\s+avant|juste\s+après|un\s+peu\s+plus\s+tard)\s+/.source,
      /\s+là\s+(?=il|elle|on|le\s+bébé|bébé)/.source,
    ].join("|"),
    "gi"
  );

  const rawSegments = normalizedText.split(segmentPattern).map(s => s.trim()).filter(s => s.length > 0);

  if (rawSegments.length === 0) {
    return [];
  }

  const segments: ParsedSegment[] = [];
  let previousTimestamp = new Date();

  for (let i = 0; i < rawSegments.length; i++) {
    const segmentText = rawSegments[i];
    const lowerSegment = segmentText.toLowerCase();

    // Vérifier si c'est un temps relatif au segment précédent
    const relativeAfterMatch = lowerSegment.match(
      /^(?:(\d+)\s*(min|minute|h|heure)s?|(?:une?\s+)?demi[e]?[-\s]?(heure))\s*(après|plus tard|ensuite|apr[eè]s)?/i
    );

    const relativeInMiddleMatch = !relativeAfterMatch
      ? lowerSegment.match(/(\d+)\s*(min|minute|h|heure)s?\s*(après|plus tard)/i)
      : null;

    const isPresentTime = /\b(là|maintenant|en ce moment|actuellement|à l'instant)\b/i.test(lowerSegment);

    let timestamp: Date;
    let timeOffset: number;
    let isFuture = false;
    let isRelativeToPrevious = false;
    let relativeOffset = 0;

    const effectiveRelativeMatch = relativeAfterMatch || relativeInMiddleMatch;

    if (effectiveRelativeMatch && i > 0) {
      if (effectiveRelativeMatch[1]) {
        relativeOffset = parseInt(effectiveRelativeMatch[1]);
        if (effectiveRelativeMatch[2] && effectiveRelativeMatch[2].startsWith("h")) {
          relativeOffset *= 60;
        }
      } else if (effectiveRelativeMatch[3] === "heure") {
        relativeOffset = 30;
      }
      isRelativeToPrevious = true;

      timestamp = new Date(previousTimestamp.getTime() + relativeOffset * 60 * 1000);
      timeOffset = Math.round((new Date().getTime() - timestamp.getTime()) / 60000);
      if (timeOffset < 0) {
        isFuture = true;
        timeOffset = Math.abs(timeOffset);
      }
    } else if (isPresentTime) {
      timestamp = new Date();
      timeOffset = 0;
      isFuture = false;
    } else {
      const tsInfo = extractTimestampFromSegment(lowerSegment);
      timestamp = tsInfo.timestamp;
      timeOffset = tsInfo.timeOffset;
      isFuture = tsInfo.isFuture;
    }

    segments.push({
      text: lowerSegment,
      rawText: segmentText,
      timestamp,
      timeOffset,
      isFuture,
      isRelativeToPrevious,
      relativeOffset: isRelativeToPrevious ? relativeOffset : undefined,
    });

    previousTimestamp = timestamp;
  }

  return segments;
}
