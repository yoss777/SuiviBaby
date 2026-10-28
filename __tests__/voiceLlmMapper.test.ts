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

  it("reads a bare 'couche' (no flag) as a wet diaper", () => {
    const { commands } = mapLlmParseResult({
      action: "add", truncated: false, events: [{ type: "couche", time: { kind: "now" }, pipi: false, popo: false }],
    }, "couche", NOW);
    expect(commands[0]).toEqual(expect.objectContaining({ pipi: true, popo: false }));
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

  it("maps 'ago 0' (« celui que je viens de donner ») to the latest event", () => {
    const cmd = mapLlmParseResult({
      action: "delete", truncated: false, events: [{ type: "biberon", target: { kind: "ago", minutesAgo: 0 } }],
    }, "…", NOW).commands[0];
    expect(cmd.eventIdentifier).toEqual({ type: "biberon", isLast: true });
  });

  it("resolves a dated target (« celui d'hier à 21h »)", () => {
    const cmd = mapLlmParseResult({
      action: "delete", truncated: false, events: [{ type: "biberon", target: { kind: "at", clock: "21:00", dayOffset: -1 } }],
    }, "…", NOW).commands[0];
    expect(cmd.eventIdentifier!.targetTime!.getDate()).toBe(27);
  });

  it("puts a corrected tetee duration in `duree`, the stored field", () => {
    const cmd = mapLlmParseResult({
      action: "modify", truncated: false, events: [{ type: "tetee", target: { kind: "last" }, dureeMin: 15 }],
    }, "Corrige la tétée à 15 minutes", NOW).commands[0];
    expect(cmd.modifications).toEqual({ duree: 15 });
  });

  it("carries the fields the server dropped as out of bounds", () => {
    const cmd = mapLlmParseResult({
      action: "add", truncated: false, events: [{ type: "biberon", time: { kind: "now" }, ignored: ["quantiteMl"] }],
    }, "Biberon de 900 ml", NOW).commands[0];
    expect(cmd.ignoredFields).toEqual(["quantiteMl"]);
    expect(cmd.quantite).toBeUndefined();
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

  /** Schema field → where it must land in ParsedCommandResult. Every value field is listed. */
  const DESTINATION: Record<string, string> = {
    quantiteMl: "quantite", typeBiberon: "typeBiberon", dureeMin: "duree",
    quantiteGaucheMl: "quantiteGauche", quantiteDroiteMl: "quantiteDroite",
    consistance: "consistance", couleur: "couleur", nomVitamine: "nomVitamine",
    typeActivite: "typeActivite", typeJalon: "typeJalon", humeur: "humeur",
    poidsKg: "poids", tailleCm: "taille", perimetreCranienCm: "perimetreCranien",
    typeSolide: "typeSolide", momentRepas: "momentRepas", quantiteSolide: "quantiteSolide",
    temperatureC: "valeurTemperature", nomMedicament: "nomMedicament", dosage: "dosage",
    description: "descriptionSymptome", nomVaccin: "nomVaccin", methode: "methode",
    note: "contextNote",
    // Flags are derived per type (sideFlags / diaperFlags), checked by dedicated tests.
    coteGauche: "coteGauche", coteDroit: "coteDroit", pipi: "pipi", popo: "popo",
  };
  // Distinct in-bounds numbers, so a value landing in the wrong field is caught.
  const NUMBERS: Record<string, number> = {
    quantiteMl: 101, dureeMin: 22, quantiteGaucheMl: 103, quantiteDroiteMl: 104,
    humeur: 3, poidsKg: 6.4, tailleCm: 61, perimetreCranienCm: 41, temperatureC: 38.2,
  };

  it("lists a destination for every schema field", () => {
    const valueKeys = Object.keys(props).filter((k) => !["type", "time", "target"].includes(k));
    expect(valueKeys.filter((k) => !(k in DESTINATION))).toEqual([]);
  });

  it("maps every value field to its exact destination", () => {
    const raw: Record<string, unknown> = { type: "sommeil", time: { kind: "now" } };
    for (const [k, spec] of Object.entries(props)) {
      if (["type", "time", "target", "coteGauche", "coteDroit", "pipi", "popo"].includes(k)) continue;
      raw[k] = spec.enum ? spec.enum[spec.enum.length - 1] : spec.type === "string" ? `val-${k}` : NUMBERS[k];
    }
    const clean = sanitizeParseResult({ action: "add", events: [raw] });
    const cmd = mapLlmParseResult(clean, "x", NOW).commands[0] as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(clean.events[0])) {
      if (["type", "time"].includes(k)) continue;
      // quantiteMl only lands in `quantite` for a biberon; checked below.
      if (k === "quantiteMl") continue;
      expect({ field: k, value: cmd[DESTINATION[k]] }).toEqual({ field: k, value: v });
    }

    const bib = mapLlmParseResult(
      sanitizeParseResult({ action: "add", events: [{ type: "biberon", time: { kind: "now" }, quantiteMl: 101 }] }),
      "x", NOW,
    ).commands[0];
    expect(bib.quantite).toBe(101);
  });
});

describe("formatEventClock (confirmation message)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { formatEventClock } = require("@/utils/date");
  it("labels today, yesterday and older dates", () => {
    expect(formatEventClock(new Date(2026, 9, 28, 13, 5), NOW)).toBe("À 13h05");
    expect(formatEventClock(new Date(2026, 9, 27, 23, 0), NOW)).toBe("Hier à 23h00");
    expect(formatEventClock(new Date(2026, 9, 26, 8, 0), NOW)).toBe("Le 26/10 à 8h00");
  });
});
