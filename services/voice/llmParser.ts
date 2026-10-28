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

// Must outlast the server path (6 s model call + Firestore), and stays short
// enough that a slow model falls back to the rules without a long wait.
export const LLM_PARSE_TIMEOUT_MS = 8_000;
const NETINFO_TIMEOUT_MS = 1_000;
/** Mirrors MAX_INPUT_CHARS in functions/lib/voiceParse.js. */
export const MAX_LLM_INPUT_CHARS = 500;

export type ParseSource = "llm" | "rules";

export interface VoiceParseResult extends ParseCommandsResult {
  source: ParseSource;
  /** Why the rule parser was used: offline, too-long, malformed, or a functions/* code. */
  fallbackReason?: string;
}

/**
 * Degradations we expect in normal operation: fall back without alerting.
 * `not-found` is deliberately absent: once the function is deployed, a
 * missing function means a broken release and must surface in Sentry.
 * Server-side configuration errors are alerted on by the CF's own logs.
 */
const EXPECTED_FALLBACK_CODES = new Set([
  "functions/unavailable",
  "functions/resource-exhausted",
  "functions/deadline-exceeded",
]);

const ACTIONS = new Set(["add", "modify", "delete", "none"]);
const EVENT_TYPES = new Set<string>([
  "biberon", "tetee", "pompage", "miction", "selle", "couche", "sommeil",
  "vitamine", "activite", "jalon", "croissance", "solide", "bain",
  "temperature", "medicament", "symptome", "vaccin", "nettoyage_nez",
]);
const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The server sanitizes; this is a cheap second check before trusting the payload. */
function isLlmParseResult(data: unknown): data is LlmParseResult {
  const d = data as LlmParseResult | null;
  if (!d || typeof d !== "object" || !ACTIONS.has(d.action) ||
      !Array.isArray(d.events) || typeof d.truncated !== "boolean") {
    return false;
  }
  return d.events.every((e) => {
    if (!e || typeof e !== "object" || !EVENT_TYPES.has(e.type)) return false;
    const ref = (e.time ?? e.target) as { kind?: string; clock?: unknown } | undefined;
    return !ref || ref.kind !== "at" || (typeof ref.clock === "string" && CLOCK_RE.test(ref.clock));
  });
}

const formatClock = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

async function isOffline(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const state = await Promise.race([
      NetInfo.fetch(),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), NETINFO_TIMEOUT_MS); }),
    ]);
    return state?.isConnected === false;
  } catch {
    return false; // can't tell — let the call decide
  } finally {
    clearTimeout(timer);
  }
}

export async function parseVoiceText(text: string, now: Date = new Date()): Promise<VoiceParseResult> {
  const startedAt = Date.now();
  const fallback = (reason: string): VoiceParseResult => {
    addBreadcrumb("voice", "parse fell back to rules", { reason, ms: Date.now() - startedAt }, "warning");
    return { ...parseMultipleCommandsWithMeta(text), source: "rules", fallbackReason: reason };
  };

  if (text.length > MAX_LLM_INPUT_CHARS) return fallback("too-long");
  if (await isOffline()) return fallback("offline");

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
