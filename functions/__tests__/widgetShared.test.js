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
    [{ type: "vitamine" }, "Vitamines", "💊"],
    [{ type: "vitamine", nomVitamine: "Vitamine K" }, "Vitamine K", "💊"],
    [{ type: "medicament", nomMedicament: "Doliprane" }, "Doliprane", "💊"],
    [{ type: "medicament" }, "Médicament", "💊"],
    [{ type: "temperature", valeur: 37.84 }, "Temp. 37,8 °C", "🌡️"],
    [{ type: "temperature" }, "Température", "🌡️"],
    [{ type: "symptome" }, "Symptôme", "🤒"],
    [{ type: "vaccin", nomVaccin: "ROR" }, "Vaccin ROR", "💉"],
    [{ type: "vaccin" }, "Vaccin", "💉"],
    [{ type: "bain" }, "Bain", "🛁"],
    [{ type: "nettoyage_nez" }, "Soin du nez", "👃"],
    [{ type: "pompage" }, "Tire-lait", "🥛"],
    [{ type: "croissance" }, "Mesures", "📏"],
    [{ type: "activite", typeActivite: "lecture", duree: 15 }, "Lecture 15 min", "📖"],
    [{ type: "activite", typeActivite: "inconnue" }, "Activité", "🧸"],
    [{ type: "sommeil", isNap: false, heureFin: 1, duree: 485 }, "Nuit 8h05", "🌙"],
    [{ type: "sommeil", isNap: true, heureFin: 1 }, "Sieste", "😴"],
  ])("%j", (e, label, icon) => {
    expect(w.otherEventLabel(e)).toBe(label);
    expect(w.otherEventIcon(e)).toBe(icon);
  });

  test("sessions en cours et jalons : absents du fil", () => {
    expect(w.otherEventLabel({ type: "sommeil" })).toBeNull();
    expect(w.otherEventLabel({ type: "activite", heureDebut: 1 })).toBeNull();
    expect(w.otherEventLabel({ type: "jalon" })).toBeNull();
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
    });
    expect(input.lastNursing).toEqual({ leftMinutes: 12, rightMinutes: 0 });

    const props = w.buildNowWidgetProps(input, paris);
    expect(props.lastMealKind).toBe("solide");
    expect(props.lastMealLabel).toBe("Repas à 12:00");
    expect(props.nextSide).toBe("D");
    expect(props.dayStartMs).toBe(Date.UTC(2026, 10, 12, 23, 0));
    expect(props.alerts).toEqual({ mealAtMs: at(15), diaperAtMs: at(19) });
    expect(props.live).toMatchObject({ kind: "sleep", nap: true, sinceMs: at(16), sinceLabel: "depuis 16:00" });
    expect(props.recent[0]).toEqual({ ms: at(15), kind: "diaper", icon: "💩", label: "Change · selle" });
    expect(props.recent.map((e) => e.label)).not.toContain(undefined);
    expect(props.recent).toHaveLength(8);
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
