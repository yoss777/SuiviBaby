import { OMS_MAX_DAY, OMS_PERCENTILES } from "@/constants/omsPercentiles";
import { OMS_RANGE_NOTE, getOmsSeries, hasMeasurementsBeyondOms } from "@/utils/omsCurve";

describe("données OMS embarquées", () => {
  it("couvrent 0 à 731 jours (24 mois) pour chaque sexe, mesure et percentile", () => {
    for (const sex of ["male", "female"] as const) {
      for (const metric of ["poids", "taille", "tete"] as const) {
        for (const p of ["p3", "p15", "p50", "p85", "p97"] as const) {
          const arr = OMS_PERCENTILES[sex][metric][p];
          expect(arr).toHaveLength(OMS_MAX_DAY + 1);
          expect(arr.every((v) => Number.isFinite(v))).toBe(true);
        }
      }
    }
  });
});

describe("getOmsSeries", () => {
  it("renvoie les valeurs du jour exact", () => {
    const s = getOmsSeries("male", "poids", [0, 100, 731])!;
    expect(s.indices).toEqual([0, 1, 2]);
    expect(s.values.p50).toEqual([
      OMS_PERCENTILES.male.poids.p50[0],
      OMS_PERCENTILES.male.poids.p50[100],
      OMS_PERCENTILES.male.poids.p50[731],
    ]);
  });

  it("garde les mesures dans la plage même si une autre la dépasse (730/731 ok, 732 hors plage)", () => {
    const s = getOmsSeries("female", "taille", [30, 731, 732, 1000])!;
    expect(s.indices).toEqual([0, 1]);
    expect(s.values.p3).toHaveLength(2);
  });

  it("renvoie null si aucune mesure n'est dans la plage", () => {
    expect(getOmsSeries("male", "poids", [900, 1200])).toBeNull();
    expect(getOmsSeries("male", "poids", [])).toBeNull();
  });

  it("ignore les âges négatifs ou non finis (mesure avant la naissance, date invalide)", () => {
    const s = getOmsSeries("male", "tete", [-1, NaN, 10])!;
    expect(s.indices).toEqual([2]);
  });

  it("arrondit les âges fractionnaires au jour le plus proche", () => {
    const s = getOmsSeries("male", "poids", [10.4])!;
    expect(s.values.p50[0]).toBe(OMS_PERCENTILES.male.poids.p50[10]);
  });

  it("renvoie null sans sexe connu", () => {
    expect(getOmsSeries(null, "poids", [10])).toBeNull();
  });
});

describe("note de plage OMS", () => {
  it("texte exact", () => {
    expect(OMS_RANGE_NOTE).toBe("Courbes OMS disponibles jusqu'à 24 mois");
  });
  it("détecte une mesure au-delà de 731 jours seulement", () => {
    expect(hasMeasurementsBeyondOms([10, 731])).toBe(false);
    expect(hasMeasurementsBeyondOms([10, 732])).toBe(true);
    expect(hasMeasurementsBeyondOms([])).toBe(false);
    expect(hasMeasurementsBeyondOms([NaN])).toBe(false);
  });
});
