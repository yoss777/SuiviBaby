/**
 * Red-team tests for voice pipeline hardening (Lot 1).
 *
 * Covers:
 *   T1.1 — note bornée dans firebaseFormatter
 *   T1.4 — plafond segments/events + clamp input text
 */

jest.mock("@/config/firebase", () => ({
  functions: {},
  auth: { currentUser: { uid: "test-uid" } },
}));

jest.mock("@/utils/errorReporting", () => ({
  captureServiceError: jest.fn(),
}));

jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn()),
}));

jest.mock("expo-av", () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(),
    setAudioModeAsync: jest.fn(),
    Recording: { createAsync: jest.fn() },
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
  },
}));

jest.mock("expo-file-system", () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

import { formatDataForFirebase } from "@/services/voice/firebaseFormatter";
import {
  splitIntoSegments,
  splitIntoSegmentsWithMeta,
  MAX_SEGMENTS_PER_COMMAND,
  MAX_INPUT_TEXT_LENGTH,
} from "@/services/voice/textParser";
import {
  parseMultipleCommands,
  parseMultipleCommandsWithMeta,
  MAX_EVENTS_PER_COMMAND,
} from "@/services/voice/commandParser";
import {
  detectBiberon,
  detectTetee,
  detectSommeil,
  detectActivite,
  detectBain,
  detectCroissance,
  detectTemperature,
  parseQuantity,
} from "@/services/voice/detectors";
import {
  filterEnum,
  TYPES_BIBERON,
  TYPES_ACTIVITE,
} from "@/services/voice/enums";
import type { ParsedCommandResult, TimestampInfo } from "@/services/voice/types";

function ts(): TimestampInfo {
  return { timestamp: new Date(), timeOffset: 0, isFuture: false };
}

// =========================================================================
// T1.1 — note bornée
// =========================================================================
describe("redteam: firebaseFormatter.note bornée", () => {
  const baseCmd: ParsedCommandResult = {
    type: "biberon",
    rawText: "biberon 150ml",
    timestamp: new Date("2026-04-05T10:00:00"),
    timeOffset: 0,
    isFuture: false,
    childId: "child-123",
    quantite: 150,
  };

  it("clamps a 10000-char rawText so the resulting note stays small", () => {
    const huge = "x".repeat(10000);
    const cmd: ParsedCommandResult = { ...baseCmd, rawText: huge };
    const data = formatDataForFirebase(cmd);
    // Preamble + 300 raw chars + quotes = well under 500. The 1000-char
    // server cap should be comfortably respected.
    expect((data as any).note.length).toBeLessThan(500);
    expect((data as any).note).toContain('"' + "x".repeat(300) + '"');
  });

  it("clamps a 5000-char contextNote independently", () => {
    const hugeCtx = "y".repeat(5000);
    const cmd: ParsedCommandResult = { ...baseCmd, contextNote: hugeCtx };
    const data = formatDataForFirebase(cmd);
    expect((data as any).note.length).toBeLessThan(700);
    expect((data as any).note).toContain("y".repeat(200));
    expect((data as any).note).not.toContain("y".repeat(201));
  });

  it("handles undefined rawText without crashing", () => {
    const cmd = { ...baseCmd, rawText: undefined as any };
    expect(() => formatDataForFirebase(cmd)).not.toThrow();
  });
});

// =========================================================================
// T1.4 — caps segments/events
// =========================================================================
describe("redteam: splitIntoSegments caps", () => {
  it("clamps an oversized input to MAX_INPUT_TEXT_LENGTH before splitting", () => {
    const long = "biberon 150ml, ".repeat(500); // ~7.5k chars
    const meta = splitIntoSegmentsWithMeta(long);
    expect(meta.inputClamped).toBe(true);
    expect(long.length).toBeGreaterThan(MAX_INPUT_TEXT_LENGTH);
  });

  it("does not flag inputClamped for normal-sized text", () => {
    const meta = splitIntoSegmentsWithMeta("biberon 150ml et pipi");
    expect(meta.inputClamped).toBe(false);
  });

  it("returns at most MAX_SEGMENTS_PER_COMMAND segments", () => {
    const phrase = Array.from({ length: 12 }, (_, i) => `biberon ${100 + i}ml`).join(", ");
    const segments = splitIntoSegments(phrase);
    expect(segments.length).toBeLessThanOrEqual(MAX_SEGMENTS_PER_COMMAND);
  });

  it("flags truncation when more than MAX_SEGMENTS_PER_COMMAND segments are present", () => {
    const phrase = Array.from({ length: 10 }, () => "biberon 100ml").join(", ");
    const meta = splitIntoSegmentsWithMeta(phrase);
    expect(meta.truncated).toBe(true);
    expect(meta.segments.length).toBe(MAX_SEGMENTS_PER_COMMAND);
  });

  it("does not flag truncation for a few segments", () => {
    const meta = splitIntoSegmentsWithMeta("biberon 150ml, pipi, dodo");
    expect(meta.truncated).toBe(false);
  });
});

describe("redteam: parseMultipleCommands caps", () => {
  it("returns at most MAX_EVENTS_PER_COMMAND commands", () => {
    const phrase = Array.from({ length: 10 }, (_, i) => `biberon ${100 + i}ml`).join(", ");
    const commands = parseMultipleCommands(phrase);
    expect(commands.length).toBeLessThanOrEqual(MAX_EVENTS_PER_COMMAND);
  });

  it("exposes truncated=true when the cap is hit", () => {
    const phrase = Array.from({ length: 10 }, () => "biberon 150ml").join(", ");
    const { commands, truncated } = parseMultipleCommandsWithMeta(phrase);
    expect(commands.length).toBe(MAX_EVENTS_PER_COMMAND);
    expect(truncated).toBe(true);
  });

  it("does not flag truncated for a normal phrase", () => {
    const { truncated } = parseMultipleCommandsWithMeta("biberon 150ml et pipi");
    expect(truncated).toBe(false);
  });

  it("flags truncated when input was clamped even if few events resulted", () => {
    // 1 detected event ("biberon 150ml" at the start) + clamped input → flag.
    const long = "biberon 150ml " + "x".repeat(MAX_INPUT_TEXT_LENGTH + 100);
    const { truncated } = parseMultipleCommandsWithMeta(long);
    expect(truncated).toBe(true);
  });

  it("handles adversarial 'et et et...' input without hanging", () => {
    const adversarial = "et ".repeat(500);
    const start = Date.now();
    const { commands } = parseMultipleCommandsWithMeta(adversarial);
    const elapsed = Date.now() - start;
    // Should be near-instant; allow generous CI headroom.
    expect(elapsed).toBeLessThan(500);
    expect(commands.length).toBeLessThanOrEqual(MAX_EVENTS_PER_COMMAND);
  });
});

// =========================================================================
// T2.3 — enum whitelist
// =========================================================================
describe("redteam: filterEnum", () => {
  it("returns the value when in the whitelist", () => {
    expect(filterEnum("lait_maternel", TYPES_BIBERON)).toBe("lait_maternel");
  });

  it("returns undefined for an invented value", () => {
    expect(filterEnum("lait_de_chevre", TYPES_BIBERON)).toBeUndefined();
  });

  it("returns undefined for non-string input (object injection)", () => {
    expect(filterEnum({ evil: true }, TYPES_BIBERON)).toBeUndefined();
    expect(filterEnum(null, TYPES_BIBERON)).toBeUndefined();
    expect(filterEnum(undefined, TYPES_ACTIVITE)).toBeUndefined();
  });

  it("strips a crafted typeBiberon from the formatted payload", () => {
    const cmd: ParsedCommandResult = {
      type: "biberon",
      rawText: "biberon",
      timestamp: new Date(),
      timeOffset: 0,
      isFuture: false,
      childId: "c1",
      quantite: 150,
      typeBiberon: "<script>",
    };
    const data = formatDataForFirebase(cmd) as any;
    expect(data.typeBiberon).toBeUndefined();
  });

  it("falls back to 'autre' for crafted typeActivite", () => {
    const cmd: ParsedCommandResult = {
      type: "activite",
      rawText: "activite",
      timestamp: new Date(),
      timeOffset: 0,
      isFuture: false,
      childId: "c1",
      typeActivite: "javascript:alert(1)",
    };
    const data = formatDataForFirebase(cmd) as any;
    expect(data.typeActivite).toBe("autre");
  });

  it("drops out-of-range humeur on jalon", () => {
    const cmd: ParsedCommandResult = {
      type: "jalon",
      rawText: "humeur",
      timestamp: new Date(),
      timeOffset: 0,
      isFuture: false,
      childId: "c1",
      typeJalon: "humeur",
      humeur: 99,
    };
    const data = formatDataForFirebase(cmd) as any;
    expect(data.humeur).toBeUndefined();
  });
});

// =========================================================================
// T2.4 — parseQuantity + bornes détecteurs
// =========================================================================
describe("redteam: parseQuantity bornes", () => {
  it("rejects negative biberon quantity", () => {
    expect(parseQuantity("-50", { min: 0, max: 500 })).toBeUndefined();
  });

  it("rejects biberon quantity above 500ml", () => {
    expect(parseQuantity("9999", { min: 0, max: 500 })).toBeUndefined();
  });

  it("accepts a valid quantity at the upper bound", () => {
    expect(parseQuantity("500", { min: 0, max: 500 })).toBe(500);
  });

  it("returns undefined for non-numeric input", () => {
    expect(parseQuantity("abc", { min: 0, max: 500 })).toBeUndefined();
    expect(parseQuantity("", { min: 0, max: 500 })).toBeUndefined();
    expect(parseQuantity(undefined, { min: 0, max: 500 })).toBeUndefined();
  });

  it("detectBiberon drops an absurd 9999ml quantity", () => {
    // parseInt would have captured "999" from "9999ml"; the cap rejects it.
    const cmd = detectBiberon("biberon 9999 ml", "biberon 9999 ml", ts());
    expect(cmd).not.toBeNull();
    expect(cmd!.quantite).toBeUndefined();
  });

  it("detectTetee drops a 500-min duration (over 180-min cap)", () => {
    const cmd = detectTetee("tétée 500 min", "tétée 500 min", ts());
    expect(cmd).not.toBeNull();
    expect(cmd!.quantite).toBeUndefined();
  });

  it("detectSommeil drops a 100-hour duration", () => {
    const cmd = detectSommeil("dormi 100 heures", "dormi 100 heures", ts());
    expect(cmd).not.toBeNull();
    expect(cmd!.duree).toBeUndefined();
  });

  it("detectActivite drops a 5000-min duration", () => {
    const cmd = detectActivite("promenade 5000 minutes", "promenade 5000 minutes", ts());
    expect(cmd).not.toBeNull();
    expect(cmd!.duree).toBeUndefined();
  });

  it("detectBain drops a 200-min duration", () => {
    const cmd = detectBain("bain 200 minutes", "bain 200 minutes", ts());
    expect(cmd).not.toBeNull();
    expect(cmd!.duree).toBeUndefined();
  });

  it("detectCroissance drops out-of-range weight", () => {
    const cmd = detectCroissance("poids 999 kg", "poids 999 kg", ts());
    expect(cmd).not.toBeNull();
    expect(cmd!.poids).toBeUndefined();
  });

  it("detectTemperature drops 60°C (out of human range)", () => {
    const cmd = detectTemperature("température 60°", "température 60°", ts());
    expect(cmd).not.toBeNull();
    expect(cmd!.valeurTemperature).toBeUndefined();
  });
});
