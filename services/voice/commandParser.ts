import type { CommandAction, CommandType, ParsedCommandResult } from "./types";
import { normalizePhonetics } from "./phoneticNormalizer";
import { extractTimestamp } from "./timestampParser";
import { detectAction, detectEventIdentifier, extractContextNote, splitIntoSegments } from "./textParser";
import { ALL_DETECTORS } from "./detectors";

/**
 * Parse un segment pour tous les types d'événements possibles
 */
export function parseSegmentForAllEvents(
  lowerText: string,
  rawText: string,
  timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }
): ParsedCommandResult[] {
  const commands: ParsedCommandResult[] = [];

  for (const detect of ALL_DETECTORS) {
    const cmd = detect(lowerText, rawText, timestampInfo);
    if (cmd) commands.push(cmd);
  }

  return commands;
}

/**
 * Parse une seule commande (pour modification/suppression)
 * Utilise la logique else-if pour ne retourner qu'un seul événement
 */
export function parseSingleCommand(text: string, action: CommandAction): ParsedCommandResult | null {
  const normalizedText = normalizePhonetics(text);
  const lowerText = normalizedText.toLowerCase().trim();
  const timestampInfo = extractTimestamp(lowerText);

  let cmd: ParsedCommandResult | null = null;

  for (const detect of ALL_DETECTORS) {
    cmd = detect(lowerText, normalizedText, timestampInfo);
    if (cmd) break;
  }

  if (!cmd) {
    return null;
  }

  // Ajouter l'action et l'identifiant d'événement
  cmd.action = action;
  cmd.eventIdentifier = detectEventIdentifier(normalizedText, cmd.type as CommandType) || undefined;

  // Pour les modifications, préparer les modifications
  if (action === "modify") {
    cmd.modifications = {};
    if (cmd.quantite !== undefined) cmd.modifications.quantite = cmd.quantite;
    if (cmd.quantiteGauche !== undefined) cmd.modifications.quantiteGauche = cmd.quantiteGauche;
    if (cmd.quantiteDroite !== undefined) cmd.modifications.quantiteDroite = cmd.quantiteDroite;
    if (cmd.consistance !== undefined) cmd.modifications.consistance = cmd.consistance;
    if (cmd.couleur !== undefined) cmd.modifications.couleur = cmd.couleur;
    if (cmd.typeBiberon !== undefined) cmd.modifications.typeBiberon = cmd.typeBiberon;
    if (cmd.duree !== undefined) cmd.modifications.duree = cmd.duree;
    if (cmd.valeurTemperature !== undefined) cmd.modifications.valeurTemperature = cmd.valeurTemperature;
    if (cmd.dosage !== undefined) cmd.modifications.dosage = cmd.dosage;
  }

  return cmd;
}

/**
 * Parse le texte transcrit pour extraire la commande (legacy - retourne le premier événement)
 */
export function parseCommand(text: string): ParsedCommandResult | null {
  const commands = parseMultipleCommands(text);
  return commands.length > 0 ? commands[0] : null;
}

/**
 * Parse le texte transcrit pour extraire TOUS les événements détectés
 * Permet des phrases comme "il a bu 150ml, fait un pipi et on est allés au parc"
 * Gère les timestamps par segment et enrichit les notes avec le contexte
 */
export function parseMultipleCommands(text: string): ParsedCommandResult[] {
  const normalizedText = normalizePhonetics(text);
  const lowerText = normalizedText.toLowerCase().trim();

  // Détecter l'action (ajout/modification/suppression)
  const { action } = detectAction(normalizedText);

  // Pour modification/suppression, on ne supporte qu'un seul événement
  if (action !== "add") {
    const singleCommand = parseSingleCommand(text, action);
    return singleCommand ? [singleCommand] : [];
  }

  // Découper en segments pour gérer les timestamps individuels
  const segments = splitIntoSegments(text);

  // Si pas de segments (phrase courte), utiliser l'ancien comportement
  if (segments.length <= 1) {
    return parseSegmentForAllEvents(lowerText, normalizedText, extractTimestamp(lowerText));
  }

  // Pour chaque segment, détecter les événements avec leur timestamp propre
  const commands: ParsedCommandResult[] = [];

  for (const segment of segments) {
    const timestampInfo = {
      timestamp: segment.timestamp,
      timeOffset: segment.timeOffset,
      isFuture: segment.isFuture,
    };

    const segmentCommands = parseSegmentForAllEvents(segment.text, segment.rawText, timestampInfo);

    for (const cmd of segmentCommands) {
      const contextNote = extractContextNote(segment.text, cmd.type as CommandType);
      if (contextNote) {
        cmd.contextNote = contextNote;
      }
      commands.push(cmd);
    }
  }

  return commands;
}
