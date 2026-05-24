import type { CommandAction, CommandType, EventIdentifier, ParsedSegment } from "./types";
import { normalizePhonetics } from "./phoneticNormalizer";
import { extractTime, extractTimestampFromSegment, MAX_RELATIVE_OFFSET_MIN } from "./timestampParser";

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
 * Cap on raw text length fed to the segment splitter. Beyond this, a long
 * transcription (or an adversarial input) would force the regex engine to chew
 * through alternations needlessly — and produce events we'd cap anyway.
 */
export const MAX_INPUT_TEXT_LENGTH = 2000;

/**
 * Maximum number of segments a single voice command can produce. Prevents
 * a free-tier user from chaining many events into one quota'd command and
 * bounds downstream Firestore writes per call.
 */
export const MAX_SEGMENTS_PER_COMMAND = 5;

export interface SplitSegmentsMeta {
  segments: ParsedSegment[];
  /** True when the splitter discarded segments past MAX_SEGMENTS_PER_COMMAND. */
  truncated: boolean;
  /** True when the raw input was clamped to MAX_INPUT_TEXT_LENGTH chars. */
  inputClamped: boolean;
}

/**
 * Découpe une phrase en segments séparés par virgules, "et", "puis", et autres adverbes de temps.
 * Gère les timestamps relatifs ("20min après" = relatif au segment précédent)
 */
export function splitIntoSegments(text: string): ParsedSegment[] {
  return splitIntoSegmentsWithMeta(text).segments;
}

/**
 * Variante de splitIntoSegments qui expose les flags de troncature.
 * Utilisée par le parser pour prévenir l'UI en cas d'input dépassant les caps.
 *
 * T3.1 — ReDoS posture:
 *  - All `segmentPattern` alternatives are linear (no nested quantifiers
 *    like `(a+)+` or `(.*?)*`). Worst-case is O(n) over the input.
 *  - MAX_INPUT_TEXT_LENGTH caps n at 2000 chars before we touch regex.
 *  - In __DEV__ we measure end-to-end and warn if it ever exceeds 100ms,
 *    so a future pattern change that accidentally introduces a slow case
 *    is caught locally before shipping.
 */
export function splitIntoSegmentsWithMeta(text: string): SplitSegmentsMeta {
  const startedAt = typeof __DEV__ !== "undefined" && __DEV__ ? Date.now() : 0;
  const inputClamped = text.length > MAX_INPUT_TEXT_LENGTH;
  const safeText = inputClamped ? text.slice(0, MAX_INPUT_TEXT_LENGTH) : text;
  const normalizedText = normalizePhonetics(safeText);

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
    return { segments: [], truncated: false, inputClamped };
  }

  // Hard cap: discard segments beyond MAX_SEGMENTS_PER_COMMAND. The UI surfaces
  // the truncation via parseMultipleCommands so the user knows what was kept.
  const wasTruncated = rawSegments.length > MAX_SEGMENTS_PER_COMMAND;
  const cappedRawSegments = wasTruncated
    ? rawSegments.slice(0, MAX_SEGMENTS_PER_COMMAND)
    : rawSegments;

  const segments: ParsedSegment[] = [];
  let previousTimestamp = new Date();

  for (let i = 0; i < cappedRawSegments.length; i++) {
    const segmentText = cappedRawSegments[i];
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
        const raw = parseInt(effectiveRelativeMatch[1]);
        relativeOffset = Number.isFinite(raw) ? raw : 0;
        if (effectiveRelativeMatch[2] && effectiveRelativeMatch[2].startsWith("h")) {
          relativeOffset *= 60;
        }
      } else if (effectiveRelativeMatch[3] === "heure") {
        relativeOffset = 30;
      }
      // T3.5 — clamp relative offset across consecutive segments. Beyond
      // 7 days (10080 min) the parsed value is almost certainly garbage
      // ("20 min après" qui se mis-transcrit "20000 min après"). Reset
      // to 0 so the segment uses its own absolute timestamp instead.
      if (relativeOffset > MAX_RELATIVE_OFFSET_MIN || relativeOffset < 0) {
        relativeOffset = 0;
      }
      isRelativeToPrevious = relativeOffset > 0;

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

  // T3.1 — dev-only timing guard. If you ever see this warning, audit the
  // regex change that introduced it BEFORE shipping (likely candidates:
  // nested quantifiers in segmentPattern, or a new normalizePhonetics rule).
  if (startedAt > 0) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > 100) {
      console.warn(
        `[voice/textParser] splitIntoSegmentsWithMeta took ${elapsed}ms for ` +
        `input length ${text.length} (cap ${MAX_INPUT_TEXT_LENGTH}). ` +
        `Possible ReDoS regression — audit recently changed patterns.`
      );
    }
  }

  return { segments, truncated: wasTruncated, inputClamped };
}
