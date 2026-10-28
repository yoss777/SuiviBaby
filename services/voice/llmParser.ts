// Voice text → commands, LLM first with the rule-based parser as fallback.
//
// The parseVoiceCommand Cloud Function interprets the transcript; when it is
// unreachable, disabled, over budget or answers something unusable, we fall
// back to the local rule parser on the same text, so a voice command never
// fails because of the LLM. A missing function (old backend) degrades the
// same way, which makes client and server deployable in any order.

import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/config/firebase";
import { addBreadcrumb, captureServiceError } from "@/utils/errorReporting";
import { parseMultipleCommandsWithMeta, type ParseCommandsResult } from "./commandParser";
import { mapLlmParseResult, type LlmParseResult } from "./llmMapper";

export const LLM_PARSE_TIMEOUT_MS = 10_000;
/** Mirrors MAX_INPUT_CHARS in functions/lib/voiceParse.js. */
export const MAX_LLM_INPUT_CHARS = 500;

export type ParseSource = "llm" | "rules";

export interface VoiceParseResult extends ParseCommandsResult {
  source: ParseSource;
  /** Why the rule parser was used: offline, too-long, malformed, or a functions/* code. */
  fallbackReason?: string;
}

/** Degradations we expect in normal operation: fall back without alerting. */
const EXPECTED_FALLBACK_CODES = new Set([
  "functions/unavailable",
  "functions/resource-exhausted",
  "functions/deadline-exceeded",
  "functions/not-found",
]);

const ACTIONS = new Set(["add", "modify", "delete", "none"]);

function isLlmParseResult(data: unknown): data is LlmParseResult {
  const d = data as LlmParseResult | null;
  return !!d && typeof d === "object" && ACTIONS.has(d.action) &&
    Array.isArray(d.events) && typeof d.truncated === "boolean";
}

const formatClock = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

async function isOffline(): Promise<boolean> {
  try {
    return (await NetInfo.fetch()).isConnected === false;
  } catch {
    return false; // can't tell — let the call decide
  }
}

export async function parseVoiceText(text: string, now: Date = new Date()): Promise<VoiceParseResult> {
  const fallback = (reason: string): VoiceParseResult => {
    addBreadcrumb("voice", "parse fell back to rules", { reason }, "warning");
    return { ...parseMultipleCommandsWithMeta(text), source: "rules", fallbackReason: reason };
  };

  if (text.length > MAX_LLM_INPUT_CHARS) return fallback("too-long");
  if (await isOffline()) return fallback("offline");

  const startedAt = Date.now();
  try {
    const parse = httpsCallable<{ text: string; localTime: string }, unknown>(
      functions,
      "parseVoiceCommand",
      { timeout: LLM_PARSE_TIMEOUT_MS },
    );
    const { data } = await parse({ text, localTime: formatClock(now) });
    if (!isLlmParseResult(data)) return fallback("malformed");

    const mapped = mapLlmParseResult(data, text, now);
    addBreadcrumb("voice", "parsed by llm", {
      action: data.action,
      events: mapped.commands.length,
      truncated: mapped.truncated,
      ms: Date.now() - startedAt,
    });
    return { ...mapped, source: "llm" };
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "unknown";
    if (!EXPECTED_FALLBACK_CODES.has(code)) {
      captureServiceError(error, { service: "voiceParser", operation: "parseVoiceCommand", extra: { code } });
    }
    return fallback(code);
  }
}
