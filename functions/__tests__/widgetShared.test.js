/* global describe, test, expect */
// Module partagé du widget, côté Functions (Node 22) : même code que l'app.
// Les jeux de l'app sont dans __tests__/widgetSnapshot.test.ts (racine).
const w = require("../shared/widget");

const paris = w.zonedEnv("Europe/Paris");
const reunion = w.zonedEnv("Indian/Reunion");
const at = (h, m = 0) => Date.UTC(2026, 10, 13, h - 1, m); // heure de Paris le 13/11 (UTC+1)

describe("zonedEnv", () => {
  test("jour et heure dans un autre fuseau que celui du serveur", () => {
    const now = Date.UTC(2026, 10, 13, 21, 30); // 22:30 Paris, 01:30 le 14 à La Réunion
    expect(paris.clock(now)).toBe("22:30");
    expect(reunion.clock(now)).toBe("01:30");
    expect(reunion.dayBounds(now)).toEqual([Date.UTC(2026, 10, 13, 20, 0), Date.UTC(2026, 10, 14, 20, 0)]);
  });

  test("jour de passage à l'heure d'hiver (25 h)", () => {
    const [start, end] = paris.dayBounds(Date.UTC(2026, 9, 25, 12, 0));
    expect(end - start).toBe(25 * 3600 * 1000);
  });

  test("localEnv : bornes cohérentes avec l'heure locale du processus", () => {
    const [start, end] = w.localEnv.dayBounds(at(12));
    expect(start).toBeLessThanOrEqual(at(12));
    expect(end).toBeGreaterThan(at(12));
    expect(w.localEnv.clock(at(9, 5))).toMatch(/^\d\d:\d\d$/);
  });
});

describe("otherEventLabel / otherEventIcon", () => {
  test.each([
    [{ type: "vitamine" }, "Vitamines", "medicament"],
    [{ type: "vitamine", nomVitamine: "Vitamine K" }, "Vitamine K", "medicament"],
    [{ type: "medicament", nomMedicament: "Doliprane" }, "Doliprane", "medicament"],
    [{ type: "medicament" }, "Médicament", "medicament"],
    [{ type: "temperature", valeur: 37.84 }, "Temp. 37,8 °C", "temperature"],
    [{ type: "temperature" }, "Température", "temperature"],
    [{ type: "symptome" }, "Symptôme", "symptome"],
    [{ type: "vaccin", nomVaccin: "ROR" }, "Vaccin ROR", "vaccin"],
    [{ type: "vaccin" }, "Vaccin", "vaccin"],
    [{ type: "bain" }, "Bain", "bain"],
    [{ type: "nettoyage_nez" }, "Soin du nez", "nez"],
    [{ type: "pompage" }, "Tire-lait", "pompage"],
    [{ type: "croissance" }, "Mesures", "croissance"],
    [{ type: "activite", typeActivite: "lecture", duree: 15 }, "Lecture 15 min", "activite"],
    [{ type: "activite", typeActivite: "inconnue" }, "Activité", "activite"],
    [{ type: "sommeil", isNap: false, heureFin: 1, duree: 485 }, "Nuit 8h05", "nuit"],
    [{ type: "sommeil", isNap: true, heureFin: 1 }, "Sieste", "sieste"],
    [{ type: "sommeil", isNap: false }, "Nuit · en cours", "nuit"],
    [{ type: "activite", typeActivite: "promenade", heureDebut: 1 }, "Promenade · en cours", "activite"],
    [{ type: "jalon", typeJalon: "humeur", humeur: 4 }, "😄", "jalon"],
    [{ type: "jalon", typeJalon: "humeur" }, "Humeur du jour", "jalon"],
    [{ type: "jalon", typeJalon: "dent" }, "Nouvelle dent", "jalon"],
    [{ type: "jalon", typeJalon: "autre", titre: "Premier bain chez mamie" }, "Autre moment", "jalon"],
  ])("%j", (e, label, icon) => {
    expect(w.otherEventLabel(e)).toBe(label);
    expect(w.otherEventIcon(e)).toBe(icon);
  });

  test("type inconnu : absent du fil", () => {
    expect(w.otherEventLabel({ type: "inconnu" })).toBeNull();
  });
});

describe("assemble + build (fuseau du serveur)", () => {
  const base = {
    childName: "Léa",
    nursing: null,
    tetees: [],
    biberons: [],
    solides: [],
    mictions: [],
    selles: [],
    sleepTotalMinutes: 0,
    isPremium: true,
    reminders: { enabled: true, repasHours: 3, changesHours: 4 },
    now: at(17),
  };

  test("journée complète, rappels et données envoyées", () => {
    const input = w.assembleNowWidgetInput(
      {
        ...base,
        tetees: [{ ms: at(8), dureeGauche: 12 }],
        biberons: [{ ms: at(11), quantite: 120 }, { ms: at(11, 10), typeBiberon: "jus", quantite: 50 }],
        solides: [{ ms: at(12) }],
        mictions: [{ ms: at(9) }],
        selles: [{ ms: at(9, 1) }, { ms: at(15) }],
        others: [{ ms: at(10), type: "bain" }, { ms: at(10, 30), type: "jalon" }],
        sleepStartMs: at(16),
        sleepIsNap: true,
        sleepTotalMinutes: 75,
      },
      paris,
    );
    expect(input.day).toEqual({
      mealsCount: 3,
      bottleMl: 120,
      lastMealMs: at(12),
      diapersCount: 2,
      lastDiaperMs: at(15),
      sleepMinutes: 75,
      noMealEver: false,
      noDiaperEver: false,
    });
    expect(input.lastNursing).toEqual({ leftMinutes: 12, rightMinutes: 0, left: false, right: false });

    const props = w.buildNowWidgetProps(input, paris);
    expect(props.lastMealKind).toBe("solide");
    expect(props.lastMealLabel).toBe("Repas à 12:00");
    expect(props.nextSide).toBe("D");
    expect(props.dayStartMs).toBe(Date.UTC(2026, 10, 12, 23, 0));
    expect(props.alerts).toEqual({ mealAtMs: at(15), diaperAtMs: at(19) });
    expect(props.live).toMatchObject({ kind: "sleep", nap: true, sinceMs: at(16), sinceLabel: "depuis 16:00" });
    expect(props.recent[0]).toEqual({ ms: at(15), kind: "diaper", icon: "selle", label: "Change · selle" });
    expect(props.recent.map((e) => e.label)).not.toContain(undefined);
    // 10 événements dans les 24 h (jalon compris, comme le home) : les 7 plus récents.
    expect(props.recent).toHaveLength(7);
    expect(props.recent.map((e) => e.label)).toContain("Moment");
  });

  test("tétée en cours et promenade : deux sessions, la tétée d'abord", () => {
    const nursing = { leftSeconds: 120, rightSeconds: 0, runningSide: "right", runningSince: at(16, 50), startedAt: at(16, 45) };
    const props = w.buildNowWidgetProps(
      w.assembleNowWidgetInput({ ...base, nursing, walkStartMs: at(16, 30) }, paris),
      paris,
    );
    expect(props.lives.map((l) => l.kind)).toEqual(["nursing", "walk"]);
    expect(props.live).toMatchObject({ side: "D", otherSideLabel: "G 2:00", sinceLabel: "depuis 16:45", alsoKind: "walk" });
  });

  test("sans Premium : pas de rappel de change ; dernier repas absolu hors du jour", () => {
    const input = w.assembleNowWidgetInput(
      { ...base, isPremium: false, lastAbsoluteMealMs: at(7) - 24 * 3600 * 1000, mictions: [{ ms: at(9) }] },
      paris,
    );
    const props = w.buildNowWidgetProps(input, paris);
    expect(props.lastMealKind).toBe("autre");
    expect(props.alerts.diaperAtMs).toBeNull();
    expect(props.day.mealsCount).toBe(0);
  });

  test("format natif : aucun null, à aucun niveau", () => {
    const native = w.toNativeWidgetProps(w.buildNowWidgetProps(w.assembleNowWidgetInput(base, paris), paris));
    expect(JSON.stringify(native)).not.toContain("null");
    expect(JSON.stringify(w.EMPTY_NOW_WIDGET_NATIVE)).not.toContain("null");
    expect(w.formatDuration(3725)).toBe("1:02:05");
    expect(w.nextSideFrom({ leftMinutes: 0, rightMinutes: 5 })).toBe("G");
    expect(w.nextSideFrom({ leftMinutes: 5, rightMinutes: 5 })).toBeNull();
  });
});

describe("dernier repas / change sur tout l'historique (lastEventAt)", () => {
  const paris = w.zonedEnv("Europe/Paris");
  const now = Date.UTC(2026, 10, 14, 2, 0);
  const base = {
    childName: "Léa",
    nursing: null,
    tetees: [],
    biberons: [],
    solides: [],
    mictions: [],
    selles: [],
    sleepTotalMinutes: 0,
    isPremium: false,
    reminders: { enabled: false, repasHours: 0, changesHours: 0 },
    now,
  };
  const threeDaysAgo = now - 3 * 24 * 3600 * 1000;

  test("hors fenêtre chargée : le dernier connu est repris, pas « aucun »", () => {
    const input = w.assembleNowWidgetInput({ ...base, lastEventAt: { repas: threeDaysAgo, changes: threeDaysAgo } }, paris);
    expect(input.lastMeal).toEqual({ ms: threeDaysAgo, kind: "autre" });
    expect(input.day.lastDiaperMs).toBe(threeDaysAgo);
    expect(input.day.noMealEver).toBe(false);
    expect(input.day.noDiaperEver).toBe(false);
  });

  test("aucun jamais (null prouvé) : noMealEver / noDiaperEver", () => {
    const input = w.assembleNowWidgetInput({ ...base, lastEventAt: { repas: null, changes: null } }, paris);
    expect(input.day.noMealEver).toBe(true);
    expect(input.day.noDiaperEver).toBe(true);
  });

  test("inconnu (fiche absente) : jamais « aucun »", () => {
    const input = w.assembleNowWidgetInput(base, paris);
    expect(input.day.noMealEver).toBe(false);
    expect(input.day.noDiaperEver).toBe(false);
  });

  test("un évènement chargé plus récent que la fiche l'emporte", () => {
    const recent = now - 3600 * 1000;
    const input = w.assembleNowWidgetInput({ ...base, mictions: [{ ms: recent }], lastEventAt: { repas: null, changes: threeDaysAgo } }, paris);
    expect(input.day.lastDiaperMs).toBe(recent);
  });
});
