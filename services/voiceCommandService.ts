// services/voiceCommandService.ts
// Thin facade — delegates to services/voice/* modules.
// Preserves the class-based API for backward compatibility with useVoiceCommand.ts

import {
  requestPermissions,
  startRecording,
  stopRecording,
  transcribeAudio,
  hasApiKey,
} from "./voice/recorder";
import { parseCommand, parseMultipleCommands } from "./voice/commandParser";
import { formatDataForFirebase, commandTypeToEventType } from "./voice/firebaseFormatter";

// Re-export types so existing imports keep working
export type {
  CommandType,
  CommandAction,
  EventIdentifier,
  ParsedCommand,
  ParsedCommandResult,
} from "./voice/types";

export { commandTypeToEventType } from "./voice/firebaseFormatter";

/**
 * Facade class wrapping the decomposed voice modules.
 * Keeps the same public API that useVoiceCommand.ts depends on.
 */
class VoiceCommandService {
  requestPermissions = requestPermissions;
  startRecording = startRecording;
  stopRecording = stopRecording;
  transcribeAudio = transcribeAudio;
  hasApiKey = hasApiKey;
  parseCommand = parseCommand;
  parseMultipleCommands = parseMultipleCommands;
  formatDataForFirebase = formatDataForFirebase;
}

export default new VoiceCommandService();
