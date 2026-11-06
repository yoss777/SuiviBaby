import {
  WARNING_SIGNS,
  WARNING_SIGNS_HEADING,
  formatWarningSigns,
  getMissingTemperatureMessage,
  getTemperatureAlert,
  getTemperatureEditAlert,
  pickMostSevereAlert,
} from "@/utils/temperatureAlert";
import { showTemperatureAlertDialog } from "@/utils/temperatureAlertDialog";

const birth = new Date(2026, 0, 1);
const at = (n: number) => new Date(2026, 0, 1 + n, 10);
const alertFor = (valeur: number, ageDays: number | null) =>
  getTemperatureAlert({
    valeur,
    birthDate: ageDays === null ? null : birth,
    measuredAt: ageDays === null ? new Date(2026, 5, 1) : at(ageDays),
  })!;

describe("H2 signes d'alerte", () => {
  it("titre « Appelez le 15 sans attendre si : »", () => {
    expect(WARNING_SIGNS_HEADING).toBe("Appelez le 15 sans attendre si :");
    expect(formatWarningSigns().startsWith("Appelez le 15 sans attendre si : ")).toBe(true);
  });

  it("contient les signes ameli ajoutés (peau, réveil, fontanelle/nuque, déshydratation)", () => {
    const all = WARNING_SIGNS.join(" | ");
    expect(all).toContain("peau pâle, grise ou marbrée");
    expect(all).toMatch(/difficile à réveiller ou qui gémit/);
    expect(all).toContain("fontanelle bombée ou nuque raide");
    expect(all).toMatch(/déshydratation \(moins de couches mouillées, refus de boire\)/);
  });

  it("reste courte", () => {
    expect(WARNING_SIGNS.length).toBeLessThanOrEqual(9);
  });

  it("chaque palier dit d'appeler le 15 si un des signes apparaît", () => {
    const all = [alertFor(38, 10), alertFor(38, 120), alertFor(38, 400), alertFor(38, null), alertFor(35, 10), alertFor(35, 120), alertFor(35, null)];
    for (const a of all) {
      expect(a.message).toMatch(/signes ci-dessous apparaît[^.]*appelez le 15/);
      const shown = jest.fn();
      showTemperatureAlertDialog(shown, a);
      expect(shown.mock.calls[0][1]).toContain(WARNING_SIGNS_HEADING);
      for (const sign of WARNING_SIGNS) expect(shown.mock.calls[0][1]).toContain(sign);
    }
  });
});

describe("pickMostSevereAlert", () => {
  it("garde l'alerte la plus grave, null si vide", () => {
    expect(pickMostSevereAlert([])).toBeNull();
    const list = [alertFor(38, 400), alertFor(38, 120), alertFor(38, 10)];
    expect(pickMostSevereAlert(list)!.level).toBe("urgent");
  });
});

describe("L2 modification d'une température existante", () => {
  it("valeur inchangée, date inchangée : pas d'alerte", () => {
    expect(
      getTemperatureEditAlert({ previousValeur: 38.5, previousDate: at(120), nextValeur: 38.5, nextDate: at(120), birthDate: birth }),
    ).toBeNull();
  });

  it("valeur modifiée : alerte", () => {
    expect(
      getTemperatureEditAlert({ previousValeur: 37, previousDate: at(10), nextValeur: 38.5, nextDate: at(10), birthDate: birth })!.level,
    ).toBe("urgent");
  });

  it("seule la date change et le palier change (3-6 mois -> moins de 3 mois) : alerte", () => {
    const a = getTemperatureEditAlert({ previousValeur: 38.5, previousDate: at(120), nextValeur: 38.5, nextDate: at(20), birthDate: birth });
    expect(a!.level).toBe("urgent");
  });

  it("seule la date change mais le palier reste le même : pas d'alerte", () => {
    expect(
      getTemperatureEditAlert({ previousValeur: 38.5, previousDate: at(10), nextValeur: 38.5, nextDate: at(20), birthDate: birth }),
    ).toBeNull();
  });

  it("la nouvelle date sort de la zone de fièvre palier (jamais d'alerte si < 38)", () => {
    expect(
      getTemperatureEditAlert({ previousValeur: 37, previousDate: at(120), nextValeur: 37, nextDate: at(20), birthDate: birth }),
    ).toBeNull();
  });
});

describe("M4 température vocale sans valeur", () => {
  it("moins de 3 mois : orientation urgente, demande la valeur", () => {
    const m = getMissingTemperatureMessage({ birthDate: birth, measuredAt: at(20) });
    expect(m).toContain("n'a pas été enregistrée");
    expect(m).toContain("moins de 3 mois");
    expect(m).toContain("appelez le 15");
  });
  it("3 à 6 mois : consultation rapide", () => {
    expect(getMissingTemperatureMessage({ birthDate: birth, measuredAt: at(120) })).toContain("consultez rapidement un médecin");
  });
  it("6 mois et plus", () => {
    expect(getMissingTemperatureMessage({ birthDate: birth, measuredAt: at(400) })).toMatch(/consultez un médecin/);
  });
  it("âge inconnu : message qui couvre moins de 3 mois", () => {
    const m = getMissingTemperatureMessage({ birthDate: null, measuredAt: at(20) });
    expect(m).toContain("moins de 3 mois");
    expect(m).toContain("appelez le 15");
  });
  it("jamais rassurant", () => {
    for (const b of [birth, null]) {
      for (const d of [20, 120, 400]) {
        expect(getMissingTemperatureMessage({ birthDate: b, measuredAt: at(d) }).toLowerCase()).not.toMatch(/normal|rassur|pas grave/);
      }
    }
  });
});
