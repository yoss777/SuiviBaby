import {
  WARNING_SIGNS,
  addMonths,
  getAgeTierAt,
  getTemperatureAlert,
} from "@/utils/temperatureAlert";

// Naissance le 1er janvier 2026 à minuit (heure locale).
const birth = new Date(2026, 0, 1);
const daysAfter = (n: number) => new Date(2026, 0, 1 + n, 14, 30);

const alertFor = (valeur: number, ageDays: number | null) =>
  getTemperatureAlert({
    valeur,
    birthDate: ageDays === null ? null : birth,
    measuredAt: ageDays === null ? new Date(2026, 5, 1) : daysAfter(ageDays),
  });

describe("addMonths (mois calendaires, fin de mois)", () => {
  it("garde le même quantième quand il existe", () => {
    expect(addMonths(new Date(2026, 0, 15), 3)).toEqual(new Date(2026, 3, 15));
  });
  it("31 janvier + 3 mois = 30 avril ; + 1 mois = 28 février (2026)", () => {
    expect(addMonths(new Date(2026, 0, 31), 3)).toEqual(new Date(2026, 3, 30));
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
  });
  it("29 février 2024 + 12 mois = 28 février 2025", () => {
    expect(addMonths(new Date(2024, 1, 29), 12)).toEqual(new Date(2025, 1, 28));
  });
  it("traverse le changement d'année", () => {
    expect(addMonths(new Date(2025, 10, 30), 3)).toEqual(new Date(2026, 1, 28));
  });
});

describe("getAgeTierAt - bornes calendaires", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 23, 59);

  it("naissance le 15 janvier : veille / jour du 3e mois", () => {
    const b = new Date(2026, 0, 15);
    expect(getAgeTierAt(b, at(2026, 3, 14))).toBe("under3m");
    expect(getAgeTierAt(b, at(2026, 3, 15))).toBe("from3to6m");
  });
  it("naissance le 15 janvier : veille / jour du 6e mois", () => {
    const b = new Date(2026, 0, 15);
    expect(getAgeTierAt(b, at(2026, 6, 14))).toBe("from3to6m");
    expect(getAgeTierAt(b, at(2026, 6, 15))).toBe("from6m");
  });
  it("naissance le 31 janvier : 3e mois le 30 avril, 6e mois le 31 juillet", () => {
    const b = new Date(2026, 0, 31);
    expect(getAgeTierAt(b, at(2026, 3, 29))).toBe("under3m");
    expect(getAgeTierAt(b, at(2026, 3, 30))).toBe("from3to6m");
    expect(getAgeTierAt(b, at(2026, 6, 30))).toBe("from3to6m");
    expect(getAgeTierAt(b, at(2026, 6, 31))).toBe("from6m");
  });
  it("naissance le 30 novembre : 3e mois le 28 février", () => {
    const b = new Date(2025, 10, 30);
    expect(getAgeTierAt(b, at(2026, 1, 27))).toBe("under3m");
    expect(getAgeTierAt(b, at(2026, 1, 28))).toBe("from3to6m");
  });
  it("jour de naissance : moins de 3 mois", () => {
    expect(getAgeTierAt(new Date(2026, 0, 15), at(2026, 0, 15))).toBe("under3m");
  });
  it("l'urgence ne se termine jamais avant 3 mois pleins (92 jours possible)", () => {
    // 1er novembre -> 1er février = 92 jours : encore < 3 mois la veille (91 jours).
    const b = new Date(2025, 10, 1);
    expect(getAgeTierAt(b, at(2026, 0, 31))).toBe("under3m");
  });
  it("format historique JJ/MM/AAAA accepté", () => {
    expect(getAgeTierAt("15/01/2026", at(2026, 3, 14))).toBe("under3m");
  });
  it("null si naissance absente, invalide ou postérieure à la mesure", () => {
    expect(getAgeTierAt(null, at(2026, 3, 14))).toBeNull();
    expect(getAgeTierAt(undefined, at(2026, 3, 14))).toBeNull();
    expect(getAgeTierAt("pas une date", at(2026, 3, 14))).toBeNull();
    expect(getAgeTierAt(new Date(2026, 0, 15), at(2026, 0, 14))).toBeNull();
  });
});

describe("getTemperatureAlert - moins de 3 mois", () => {
  it("veille du 3e mois (31 mars) et 38,0 : urgence, modale non masquable, appel du 15", () => {
    const a = alertFor(38.0, 89)!;
    expect(a.level).toBe("urgent");
    expect(a.dismissible).toBe(false);
    expect(a.callEmergency).toBe(true);
    expect(a.message).toContain("Consultez en urgence un médecin ou appelez le 15");
  });

  it("jour du 3e mois (1er avril) et 38,0 : n'est plus l'urgence moins de 3 mois", () => {
    expect(alertFor(38.0, 90)!.level).toBe("rapide");
  });

  it("37,9 ne déclenche aucune alerte de fièvre", () => {
    expect(alertFor(37.9, 10)).toBeNull();
  });

  it("38,0 déclenche, 40 aussi", () => {
    expect(alertFor(38.0, 10)!.level).toBe("urgent");
    expect(alertFor(40, 10)!.level).toBe("urgent");
  });
});

describe("getTemperatureAlert - 3 à 6 mois", () => {
  it("conseille de consulter rapidement, masquable, sans modale bloquante", () => {
    const a = alertFor(38.0, 120)!;
    expect(a.level).toBe("rapide");
    expect(a.dismissible).toBe(true);
    expect(a.message).toContain("consultez rapidement un médecin");
  });

  it("veille du 6e mois (30 juin) : 3 à 6 mois ; jour du 6e mois (1er juillet) : plus ancien", () => {
    expect(alertFor(38.5, 180)!.level).toBe("rapide");
    expect(alertFor(38.5, 181)!.level).toBe("fievre");
  });
});

describe("getTemperatureAlert - plus de 6 mois", () => {
  it("message de fièvre générique, jamais rassurant", () => {
    const a = alertFor(39, 400)!;
    expect(a.level).toBe("fievre");
    expect(a.dismissible).toBe(true);
    expect(a.callEmergency).toBe(false);
  });
});

describe("getTemperatureAlert - hypothermie", () => {
  it("35,9 déclenche l'alerte hypothermie à tout âge", () => {
    for (const age of [5, 120, 400]) {
      const a = alertFor(35.9, age)!;
      expect(a.level).toBe("hypothermie");
      expect(a.message).toMatch(/médecin ou le 15|appelez le 15/i);
    }
  });

  it("36,0 ne déclenche rien", () => {
    expect(alertFor(36.0, 5)).toBeNull();
    expect(alertFor(36.0, 400)).toBeNull();
  });

  it("M7 : moins de 3 mois, < 36 °C : urgent, non masquable, appel du 15", () => {
    const a = alertFor(35.9, 5)!;
    expect(a.level).toBe("hypothermie");
    expect(a.dismissible).toBe(false);
    expect(a.callEmergency).toBe(true);
    expect(a.message).toContain("moins de 3 mois");
    expect(a.message).toContain("appelez le 15");
  });

  it("3 mois et plus : l'hypothermie reste masquable", () => {
    expect(alertFor(35.9, 120)!.dismissible).toBe(true);
    expect(alertFor(35.9, 400)!.dismissible).toBe(true);
  });
});

describe("getTemperatureAlert - date de naissance absente", () => {
  it("retombe sur le message générique, qui couvre le cas moins de 3 mois", () => {
    const a = alertFor(38.2, null)!;
    expect(a.level).toBe("fievre");
    expect(a.message).toContain("moins de 3 mois");
    expect(a.message).toContain("appelez le 15");
  });

  it("M8 : tranche d'âge inconnue : alerte non masquable (fièvre et hypothermie)", () => {
    expect(alertFor(38.2, null)!.dismissible).toBe(false);
    expect(alertFor(35.5, null)!.dismissible).toBe(false);
    expect(alertFor(38.2, null)!.callEmergency).toBe(true);
  });

  it("l'hypothermie ne dépend pas de l'âge pour le niveau", () => {
    expect(alertFor(35.5, null)!.level).toBe("hypothermie");
  });
});

describe("getTemperatureAlert - entrées invalides", () => {
  it("renvoie null pour NaN, Infinity, null et undefined", () => {
    for (const v of [NaN, Infinity, -Infinity, null, undefined]) {
      expect(
        getTemperatureAlert({
          valeur: v as unknown as number,
          birthDate: birth,
          measuredAt: daysAfter(10),
        }),
      ).toBeNull();
    }
  });
});

describe("contenu des alertes", () => {
  it("liste les signes de gravité dans toute alerte", () => {
    expect(WARNING_SIGNS.length).toBeGreaterThanOrEqual(7);
    for (const a of [alertFor(38, 10), alertFor(38, 120), alertFor(38, 400), alertFor(35, 10), alertFor(38, null)]) {
      expect(a!.signs).toEqual(WARNING_SIGNS);
    }
  });

  it("n'emploie jamais de formule rassurante ni de diagnostic", () => {
    const all = [alertFor(38, 10), alertFor(38, 120), alertFor(38, 400), alertFor(35, 10), alertFor(38, null)];
    for (const a of all) {
      const text = `${a!.title} ${a!.message} ${a!.signs.join(" ")}`.toLowerCase();
      expect(text).not.toMatch(/normal|rassur|pas grave|aucun risque|bénin|sans danger/);
    }
  });
});
