// Données du widget « Bébé maintenant » (utils/widgetSnapshot.ts).
import { EMPTY_NURSING_TIMER, toggleSide } from "@/components/forms/nursingTimer";
import {
  buildNowWidgetProps,
  countGroups,
  EMPTY_NOW_WIDGET_NATIVE,
  formatDuration,
  nextSideFrom,
  type NowWidgetInput,
  toNativeWidgetProps,
} from "@/utils/widgetSnapshot";

const T0 = new Date(2026, 10, 13, 14, 0, 0).getTime();
const min = (n: number) => n * 60 * 1000;

const base = (over: Partial<NowWidgetInput> = {}): NowWidgetInput => ({
  childName: "Lina",
  nursing: null,
  sleepStartMs: null,
  walkStartMs: null,
  lastMeal: { ms: T0 - min(130), kind: "tetee" },
  lastNursing: { leftMinutes: 12, rightMinutes: 0 },
  day: { mealsCount: 6, bottleMl: 420, lastMealMs: T0 - min(130), diapersCount: 5, lastDiaperMs: T0 - min(55), sleepMinutes: 310 },
  isPremium: true,
  reminders: { enabled: true, repasHours: 3, changesHours: 2 },
  now: T0,
  ...over,
});

describe("buildNowWidgetProps", () => {
  it("au repos : dernier repas, libellé et prochain sein certain", () => {
    const p = buildNowWidgetProps(base());
    expect(p.live).toBeNull();
    expect(p.lastMealLabel).toBe("Tétée à 11:50");
    expect(p.nextSide).toBe("D");
  });

  it("tétée en cours : chrono du côté actif, autre côté figé, sans auteur", () => {
    let st = toggleSide(EMPTY_NURSING_TIMER, "right", T0 - min(10));
    st = toggleSide(st, "left", T0 - min(6)); // D 4:00 puis G depuis 6 min
    const p = buildNowWidgetProps(base({ nursing: st }));
    expect(p.live?.kind).toBe("nursing");
    expect(p.live?.side).toBe("G");
    expect(p.live?.timerStartMs).toBe(T0 - min(6));
    expect(p.live?.otherSideLabel).toBe("D 4:00");
    expect(p.live?.pausedAtMs).toBeNull();
    expect(JSON.stringify(p)).not.toMatch(/par |startedBy|updatedBy/);
  });

  it("tétée en pause : chrono figé", () => {
    let st = toggleSide(EMPTY_NURSING_TIMER, "left", T0 - min(8));
    st = toggleSide(st, "left", T0 - min(2)); // pause après 6 min
    const p = buildNowWidgetProps(base({ nursing: st }));
    expect(p.live?.pausedAtMs).toBe(T0);
    expect(p.live?.timerStartMs).toBe(T0 - min(6));
  });

  it("priorité tétée > sommeil > promenade, la 2e session est signalée", () => {
    const p = buildNowWidgetProps(base({ sleepStartMs: T0 - min(40), walkStartMs: T0 - min(20) }));
    expect(p.live?.kind).toBe("sleep");
    expect(p.live?.alsoKind).toBe("walk");
    expect(p.live?.sinceLabel).toBe("depuis 13:20");
  });

  it("toutes les sessions en cours sont listées, chacune avec son début", () => {
    const st = toggleSide(EMPTY_NURSING_TIMER, "left", T0 - min(4));
    const p = buildNowWidgetProps(base({ nursing: st, sleepStartMs: T0 - min(40), walkStartMs: T0 - min(20) }));
    expect(p.lives.map((l) => l.kind)).toEqual(["nursing", "sleep", "walk"]);
    expect(p.lives[1].timerStartMs).toBe(T0 - min(40));
    expect(p.lives[2].timerStartMs).toBe(T0 - min(20));
    expect(buildNowWidgetProps(base()).lives).toEqual([]);
  });

  it("chrono et état de la journée visibles des comptes gratuits ; rappel des couches Premium seulement", () => {
    const p = buildNowWidgetProps(base({ isPremium: false, walkStartMs: T0 - min(5) }));
    expect(p.live?.kind).toBe("walk");
    expect(p.day?.diapersCount).toBe(5);
    expect(p.alerts.diaperAtMs).toBeNull();
    // L'alerte du repas reste disponible en gratuit.
    expect(p.alerts.mealAtMs).toBe(T0 - min(130) + 3 * 3600 * 1000);
  });

  it("rappels désactivés ou seuil à 0 : aucune alerte", () => {
    expect(buildNowWidgetProps(base({ reminders: { enabled: false, repasHours: 3, changesHours: 2 } })).alerts).toEqual({ mealAtMs: null, diaperAtMs: null });
    expect(buildNowWidgetProps(base({ reminders: { enabled: true, repasHours: 0, changesHours: 0 } })).alerts).toEqual({ mealAtMs: null, diaperAtMs: null });
  });
});

describe("aides", () => {
  it("prochain sein seulement quand il est certain", () => {
    expect(nextSideFrom({ leftMinutes: 10, rightMinutes: 0 })).toBe("D");
    expect(nextSideFrom({ leftMinutes: 0, rightMinutes: 8 })).toBe("G");
    expect(nextSideFrom({ leftMinutes: 10, rightMinutes: 8 })).toBeNull();
    expect(nextSideFrom(null)).toBeNull();
  });

  it("formatDuration et countGroups", () => {
    expect(formatDuration(250)).toBe("4:10");
    expect(formatDuration(3850)).toBe("1:04:10");
    expect(countGroups([0, min(10), min(50), min(51)], min(30))).toBe(2);
  });
});

describe("format natif (pont Android)", () => {
  const hasNull = (v: unknown): boolean =>
    v === null || v === undefined || (typeof v === "object" && Object.values(v as object).some(hasNull));

  it("aucune valeur nulle, à aucun niveau, y compris au repos et dans l'état initial", () => {
    const st = toggleSide(EMPTY_NURSING_TIMER, "left", T0 - min(3));
    for (const p of [
      buildNowWidgetProps(base()),
      buildNowWidgetProps(base({ nursing: st, isPremium: false, lastMeal: null, lastNursing: null })),
    ]) {
      expect(hasNull(p)).toBe(true); // le format interne en contient bien
      expect(hasNull(toNativeWidgetProps(p))).toBe(false);
    }
    expect(hasNull(EMPTY_NOW_WIDGET_NATIVE)).toBe(false);
  });

  it("conserve les valeurs présentes", () => {
    const p = buildNowWidgetProps(base());
    const n = toNativeWidgetProps(p);
    expect(n.lastMealMs).toBe(p.lastMealMs);
    expect(n.alerts.mealAtMs).toBe(p.alerts.mealAtMs);
    expect(n.day?.sleepMinutes).toBe(310);
  });
});
