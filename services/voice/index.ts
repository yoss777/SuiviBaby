// Barrel export for voice module
export type {
  CommandType,
  CommandAction,
  EventIdentifier,
  ParsedCommand,
  ParsedCommandResult,
  ParsedSegment,
  TimestampInfo,
} from "./types";

export { normalizePhonetics } from "./phoneticNormalizer";
export { extractTime, extractTimestamp, extractTimestampFromSegment } from "./timestampParser";
export { detectAction, detectEventIdentifier, extractContextNote, splitIntoSegments } from "./textParser";
export {
  detectBiberon, detectTetee, detectPompage, detectCouche,
  detectVitamine, detectSommeil, detectActivite, detectJalon,
  detectCroissance, detectSolide, detectBain, detectTemperature,
  detectMedicament, detectSymptome, detectVaccin, ALL_DETECTORS,
} from "./detectors";
export { parseCommand, parseMultipleCommands, parseSegmentForAllEvents, parseSingleCommand } from "./commandParser";
export { formatDataForFirebase, commandTypeToEventType } from "./firebaseFormatter";
export { requestPermissions, startRecording, stopRecording, transcribeAudio, hasApiKey } from "./recorder";
