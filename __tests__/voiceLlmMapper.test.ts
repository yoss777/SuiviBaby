import { mapLlmParseResult, resolveTimeRef } from "@/services/voice/llmMapper";

// Wednesday 2026-10-28 14:30 local time.
const NOW = new Date(2026, 9, 28, 14, 30, 0, 0);
const hhmm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("resolveTimeRef", () => {
  it("resolves now, ago and same-day clock times", () => {
    expect(resolveTimeRef({ kind: "now" }, NOW).getTime()).toBe(NOW.getTime());
    expect(hhmm(resolveTimeRef({ kind: "ago", minutesAgo: 20 }, NOW))).toBe("14:10");
    const at = resolveTimeRef({ kind: "at", clock: "13:00" }, NOW);
    expect(at.getDate()).toBe(28);
    expect(hhmm(at)).toBe("13:00");
  });

  it("moves a clock time that would be in the future to the previous day", () => {
    const at = resolveTimeRef({ kind: "at", clock: "22:00" }, NOW);
    expect(at.getDate()).toBe(27);
    expect(hhmm(at)).toBe("22:00");
  });

  it("tolerates a clock time a few minutes ahead (clock skew)", () => {
    expect(resolveTimeRef({ kind: "at", clock: "14:33" }, NOW).getDate()).toBe(28);
  });

  it("honours an explicit 'hier'", () => {
    expect(resolveTimeRef({ kind: "at", clock: "09:00", dayOffset: -1 }, NOW).getDate()).toBe(27);
  });
});

describe("mapLlmParseResult", () => {
  it("returns no command for 'none'", () => {
    expect(mapLlmParseResult({ action: "none", events: [], truncated: false }, "Bonjour", NOW))
      .toEqual({ commands: [], truncated: false });
  });

  it("maps every add event with its own timestamp", () => {
    const { commands } = mapLlmParseResult({
      action: "add",
      truncated: false,
      events: [
        { type: "biberon", time: { kind: "at", clock: "08:00" }, quantiteMl: 210, typeBiberon: "lait_infantile" },
        { type: "sommeil", time: { kind: "at", clock: "10:00" }, dureeMin: 45 },
      ],
    }, "À 8h biberon de 210, et vers 10h une sieste de 45 minutes", NOW);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(expect.objectContaining({
      type: "biberon", action: "add", quantite: 210, typeBiberon: "lait_infantile",
      rawText: "À 8h biberon de 210, et vers 10h une sieste de 45 minutes",
    }));
    expect(hhmm(commands[0].timestamp)).toBe("8:00");
    expect(commands[1]).toEqual(expect.objectContaining({ type: "sommeil", duree: 45 }));
    expect(hhmm(commands[1].timestamp)).toBe("10:00");
  });

  it("uses the legacy field names the rest of the pipeline expects", () => {
    const { commands } = mapLlmParseResult({
      action: "add",
      truncated: false,
      events: [
        { type: "tetee", time: { kind: "now" }, coteDroit: true, dureeMin: 12 },
        { type: "pompage", time: { kind: "now" }, quantiteGaucheMl: 80, quantiteDroiteMl: 60 },
        { type: "croissance", time: { kind: "now" }, poidsKg: 6.4, tailleCm: 64, perimetreCranienCm: 41 },
        { type: "temperature", time: { kind: "now" }, temperatureC: 38.5 },
        { type: "symptome", time: { kind: "now" }, description: "Toux grasse", note: "la nuit" },
      ],
    }, "…", NOW);

    expect(commands[0]).toEqual(expect.objectContaining({ coteDroit: true, coteGauche: false, quantite: 12 }));
    expect(commands[1]).toEqual(expect.objectContaining({ quantiteGauche: 80, quantiteDroite: 60 }));
    expect(commands[2]).toEqual(expect.objectContaining({ poids: 6.4, taille: 64, perimetreCranien: 41 }));
    expect(commands[3]).toEqual(expect.objectContaining({ valeurTemperature: 38.5 }));
    expect(commands[4]).toEqual(expect.objectContaining({ descriptionSymptome: "Toux grasse", contextNote: "la nuit" }));
  });

  it("defaults a tetee with no side to the left breast, like the rule parser", () => {
    const { commands } = mapLlmParseResult({
      action: "add", truncated: false, events: [{ type: "tetee", time: { kind: "now" } }],
    }, "tétée", NOW);
    expect(commands[0]).toEqual(expect.objectContaining({ coteGauche: true, coteDroit: false }));
  });

  it("sets pipi / popo flags for diaper-related types", () => {
    const { commands } = mapLlmParseResult({
      action: "add",
      truncated: false,
      events: [
        { type: "miction", time: { kind: "now" } },
        { type: "selle", time: { kind: "now" }, consistance: "liquide" },
        { type: "couche", time: { kind: "now" }, pipi: true, popo: true },
      ],
    }, "…", NOW);
    expect(commands[0]).toEqual(expect.objectContaining({ pipi: true, popo: false }));
    expect(commands[1]).toEqual(expect.objectContaining({ pipi: false, popo: true, consistance: "liquide" }));
    expect(commands[2]).toEqual(expect.objectContaining({ pipi: true, popo: true }));
  });

  it("builds an identifier and modifications for modify", () => {
    const { commands } = mapLlmParseResult({
      action: "modify",
      truncated: false,
      events: [{ type: "selle", target: { kind: "at", clock: "11:20" }, consistance: "liquide" }],
    }, "Corrige la selle de 11h20, elle était liquide", NOW);

    const cmd = commands[0];
    expect(cmd.action).toBe("modify");
    expect(cmd.eventIdentifier?.type).toBe("selle");
    expect(hhmm(cmd.eventIdentifier!.targetTime!)).toBe("11:20");
    expect(cmd.modifications).toEqual({ consistance: "liquide" });
  });

  it("maps 'last' and 'ago' targets for delete", () => {
    const last = mapLlmParseResult({
      action: "delete", truncated: false, events: [{ type: "miction", target: { kind: "last" } }],
    }, "Supprime le dernier pipi", NOW).commands[0];
    expect(last.eventIdentifier).toEqual({ type: "miction", isLast: true });

    const ago = mapLlmParseResult({
      action: "delete", truncated: false, events: [{ type: "biberon", target: { kind: "ago", minutesAgo: 30 } }],
    }, "…", NOW).commands[0];
    expect(ago.eventIdentifier).toEqual({ type: "biberon", relativeTime: 30 });
  });

  it("propagates truncation", () => {
    expect(mapLlmParseResult({
      action: "add", truncated: true, events: [{ type: "miction", time: { kind: "now" } }],
    }, "…", NOW).truncated).toBe(true);
  });
});

describe("contract with the server schema (functions/lib/voiceParse.js)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OUTPUT_SCHEMA, sanitizeParseResult } = require("../functions/lib/voiceParse");
  const props = OUTPUT_SCHEMA.properties.events.items.properties as Record<string, any>;

  const sampleFor = (name: string, spec: any): unknown => {
    if (spec.enum) return spec.enum[0];
    if (spec.type === "boolean") return true;
    if (spec.type === "string") return `val-${name}`;
    return { humeur: 3, temperatureC: 38, poidsKg: 6, tailleCm: 60, perimetreCranienCm: 40 }[name] ?? 30;
  };

  it("maps every value field the schema can produce", () => {
    const valueKeys = Object.keys(props).filter((k) => !["type", "time", "target"].includes(k));
    // One event per type that accepts a duration, so dureeMin survives sanitizing.
    for (const type of ["biberon", "tetee", "sommeil"]) {
      const raw: Record<string, unknown> = { type, time: { kind: "now" } };
      for (const k of valueKeys) raw[k] = sampleFor(k, props[k]);
      const clean = sanitizeParseResult({ action: "add", events: [raw] });
      const [cmd] = mapLlmParseResult(clean, "x", NOW).commands;
      const outValues = Object.values(cmd as Record<string, unknown>);
      for (const k of Object.keys(clean.events[0])) {
        if (["type", "time", "pipi", "popo", "coteGauche", "coteDroit"].includes(k)) continue;
        expect({ field: k, mapped: outValues.includes(clean.events[0][k]) }).toEqual({ field: k, mapped: true });
      }
    }
  });
});
