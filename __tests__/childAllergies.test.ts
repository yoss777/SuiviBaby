import { buildChildExportProfile } from "@/services/exportDataHelpers";
import {
  MAX_ALLERGIES,
  MAX_ALLERGY_LENGTH,
  addAllergy,
  buildAllergiesReportLine,
  removeAllergy,
  sanitizeAllergies,
} from "@/utils/childAllergies";

describe("childAllergies", () => {
  it("ajoute une entrée rognée et tronquée à 40 caractères", () => {
    const r = addAllergy([], "  " + "a".repeat(60) + "  ");
    expect(r.ok && r.list[0]).toHaveLength(MAX_ALLERGY_LENGTH);
    expect(addAllergy([], "  kiwi ")).toEqual({ ok: true, list: ["kiwi"] });
  });
  it("refuse vide, doublon (casse) et au-delà de 15", () => {
    expect(addAllergy([], "   ")).toMatchObject({ ok: false, reason: "empty" });
    expect(addAllergy(["Kiwi"], "kIWI")).toMatchObject({ ok: false, reason: "duplicate" });
    const full = Array.from({ length: MAX_ALLERGIES }, (_, i) => `a${i}`);
    expect(addAllergy(full, "plus")).toMatchObject({ ok: false, reason: "limit" });
  });
  it("retire sans tenir compte de la casse", () => {
    expect(removeAllergy(["Kiwi", "Lait"], "kiwi")).toEqual(["Lait"]);
  });
  it("sanitize ignore types invalides, vides et doublons", () => {
    expect(sanitizeAllergies(null)).toEqual([]);
    expect(sanitizeAllergies(["Lait", 3, "", "lait", "Œuf"])).toEqual(["Lait", "Œuf"]);
  });
  it("ligne PDF : vide sans allergie, échappée sinon", () => {
    expect(buildAllergiesReportLine(undefined)).toBe("");
    expect(buildAllergiesReportLine([])).toBe("");
    const line = buildAllergiesReportLine(["Lait", "<b>x</b>"]);
    expect(line).toContain("Allergies : Lait, &lt;b&gt;x&lt;/b&gt;");
    expect(line).not.toContain("<b>");
  });
  it("l'export JSON contient les allergies de l'enfant", () => {
    const out = buildChildExportProfile({ name: "Léa", allergies: ["Lait", "Kiwi"] });
    expect(out.allergies).toEqual(["Lait", "Kiwi"]);
  });
});
