import { gradeCase, type EvalCase } from "@/evals/voice/grader";
import type { ParsedCommandResult } from "@/services/voice/types";

const NOW = new Date(2026, 9, 28, 14, 30);

const cmd = (over: Partial<ParsedCommandResult>): ParsedCommandResult => ({
  type: "biberon",
  rawText: "",
  timestamp: NOW,
  childId: "",
  action: "add",
  ...over,
});

const base = (expect: EvalCase["expect"]): EvalCase => ({
  id: "t", split: "dev", cat: "x", text: "", expect,
});

describe("voice eval grader", () => {
  it("passes an exact match at 'now'", () => {
    const c = base({ action: "add", events: [{ type: "biberon", fields: { quantite: 150 } }] });
    expect(gradeCase(c, "add", [cmd({ quantite: 150 })], NOW).pass).toBe(true);
  });

  it("fails on a wrong quantity and on an extra event", () => {
    const c = base({ action: "add", events: [{ type: "biberon", fields: { quantite: 150 } }] });
    expect(gradeCase(c, "add", [cmd({ quantite: 120 })], NOW).pass).toBe(false);
    expect(gradeCase(c, "add", [cmd({ quantite: 150 }), cmd({ type: "miction" })], NOW).pass).toBe(false);
  });

  it("checks clock times, including the day before", () => {
    const c = base({ action: "add", events: [{ type: "biberon", time: { at: "23:00", dayOffset: -1 } }] });
    const yesterday23 = new Date(2026, 9, 27, 23, 0);
    expect(gradeCase(c, "add", [cmd({ timestamp: yesterday23 })], NOW).pass).toBe(true);
    expect(gradeCase(c, "add", [cmd({ timestamp: new Date(2026, 9, 28, 23, 0) })], NOW).pass).toBe(false);
  });

  it("expects no event for a non-command", () => {
    const c = base({ action: "add", events: [] });
    expect(gradeCase(c, "add", [], NOW).pass).toBe(true);
    expect(gradeCase(c, "add", [cmd({})], NOW).pass).toBe(false);
  });

  it("reads modify values from `modifications` and checks the target", () => {
    const c = base({ action: "modify", events: [{ type: "biberon", target: { isLast: true }, fields: { quantite: 180 } }] });
    const ok = cmd({ action: "modify", eventIdentifier: { type: "biberon", isLast: true }, modifications: { quantite: 180 } });
    expect(gradeCase(c, "modify", [ok], NOW).pass).toBe(true);
    expect(gradeCase(c, "add", [ok], NOW).pass).toBe(false);
  });

  it("supports $contains, $in and $lteOrAbsent matchers (accent-insensitive)", () => {
    const c = base({ action: "add", events: [
      { type: "symptome", fields: { descriptionSymptome: { $contains: "eczema" } } },
      { type: "activite", fields: { typeActivite: { $in: ["eveil", "jeux"] } } },
      { type: "biberon", fields: { quantite: { $lteOrAbsent: 500 } } },
    ] });
    const actual = [
      cmd({ type: "symptome", descriptionSymptome: "Eczéma" }),
      cmd({ type: "activite", typeActivite: "jeux" }),
      cmd({ type: "biberon" }),
    ];
    expect(gradeCase(c, "add", actual, NOW).pass).toBe(true);
  });
});
