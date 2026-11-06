import { validateSoinsSubmission } from "@/utils/soinsSubmit";

const base = {
  includeTemperature: true,
  includeSymptome: true,
  temperatureValue: 38.5,
  temperatureMode: "rectale" as const,
  symptomes: ["toux"],
  symptomeAutre: "",
};

describe("H1 validateSoinsSubmission : tout valider avant la première écriture", () => {
  it("température valide + symptôme valide : ok, deux parties", () => {
    const r = validateSoinsSubmission(base);
    expect(r).toEqual({
      ok: true,
      temperature: { valeur: 38.5, modePrise: "rectale" },
      symptomes: ["toux"],
    });
  });

  it("température valide mais aucun symptôme : erreur, rien à écrire", () => {
    const r = validateSoinsSubmission({ ...base, symptomes: [] });
    expect(r).toEqual({ ok: false, message: "Sélectionnez au moins un symptôme." });
  });

  it("symptôme « autre » compte comme un symptôme", () => {
    const r = validateSoinsSubmission({ ...base, symptomes: [], symptomeAutre: "  hoquet " });
    expect(r.ok && r.symptomes).toEqual(["hoquet"]);
  });

  it("température hors bornes : erreur même si le symptôme est valide", () => {
    expect(validateSoinsSubmission({ ...base, temperatureValue: 44 })).toEqual({
      ok: false,
      message: "Indiquez une température valide.",
    });
    expect(validateSoinsSubmission({ ...base, temperatureValue: 33.9 }).ok).toBe(false);
    expect(validateSoinsSubmission({ ...base, temperatureValue: NaN }).ok).toBe(false);
  });

  it("bornes incluses 34 et 43", () => {
    expect(validateSoinsSubmission({ ...base, temperatureValue: 34 }).ok).toBe(true);
    expect(validateSoinsSubmission({ ...base, temperatureValue: 43 }).ok).toBe(true);
  });

  it("mode de prise manquant : erreur", () => {
    expect(validateSoinsSubmission({ ...base, temperatureMode: undefined as never })).toEqual({
      ok: false,
      message: "Sélectionnez un mode de prise.",
    });
  });

  it("ni température ni symptôme cochés : erreur", () => {
    expect(validateSoinsSubmission({ ...base, includeTemperature: false, includeSymptome: false })).toEqual({
      ok: false,
      message: "Sélectionnez au moins Température ou Symptôme.",
    });
  });

  it("température seule ou symptôme seul", () => {
    const t = validateSoinsSubmission({ ...base, includeSymptome: false, symptomes: [] });
    expect(t.ok && t.temperature && !t.symptomes).toBe(true);
    const s = validateSoinsSubmission({ ...base, includeTemperature: false });
    expect(s.ok && s.symptomes && !s.temperature).toBeTruthy();
  });
});
