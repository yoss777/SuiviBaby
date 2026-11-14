// Données du widget « Bébé maintenant » (utils/widgetSnapshot.ts).
import { EMPTY_NURSING_TIMER, toggleSide } from "@/components/forms/nursingTimer";
import {
  buildNowWidgetProps,
  countGroups,
  EMPTY_NOW_WIDGET_NATIVE,
  formatDuration,
  nextSideFrom,
  type NowWidgetInput,
  otherEventLabel,
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
    // Ancré sur l'heure de la pause : 6 min affichées, quel que soit l'instant du calcul.
    expect(p.live?.pausedAtMs).toBe(T0 - min(2));
    expect(p.live?.timerStartMs).toBe(T0 - min(8));
    const later = buildNowWidgetProps(base({ nursing: st, now: T0 + min(5) }));
    expect(later.live?.pausedAtMs).toBe(p.live?.pausedAtMs);
    expect(later.live?.timerStartMs).toBe(p.live?.timerStartMs);
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

  it("fil : comme le home, du plus récent au plus ancien, 7 au plus", () => {
    const recent = Array.from({ length: 20 }, (_, i) => ({ ms: T0 - min(i * 10), kind: "meal" as const, label: `e${i}` }));
    const p = buildNowWidgetProps(base({ recent: [...recent].reverse() }));
    expect(p.recent).toHaveLength(7);
    expect(p.recent[0].label).toBe("e0");
    expect(p.recent[6].label).toBe("e6");
    expect(buildNowWidgetProps(base()).recent).toEqual([]);
  });

  it("sommeil : sieste ou nuit, comme sur l'Accueil", () => {
    expect(buildNowWidgetProps(base({ sleepStartMs: T0 - min(5), sleepIsNap: true })).live?.nap).toBe(true);
    expect(buildNowWidgetProps(base({ sleepStartMs: T0 - min(5), sleepIsNap: false })).live?.nap).toBe(false);
    expect(buildNowWidgetProps(base({ walkStartMs: T0 - min(5) })).live?.nap).toBeNull();
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
    // Tétée très courte : côté noté, durée arrondie à 0 min.
    expect(nextSideFrom({ leftMinutes: 0, rightMinutes: 0, left: true, right: false })).toBe("D");
    expect(nextSideFrom({ leftMinutes: 0, rightMinutes: 0, left: true, right: true })).toBeNull();
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

describe("otherEventLabel (fil du jour)", () => {
  it("nomme vitamines, médicaments, température et soins", () => {
    expect(otherEventLabel({ type: "vitamine", nomVitamine: "D" })).toBe("Vitamine D");
    expect(otherEventLabel({ type: "vitamine", nomVitamine: "Vitamine K" })).toBe("Vitamine K");
    expect(otherEventLabel({ type: "vitamine" })).toBe("Vitamines");
    expect(otherEventLabel({ type: "medicament", nomMedicament: "Doliprane" })).toBe("Doliprane");
    expect(otherEventLabel({ type: "temperature", valeur: 37.8 })).toBe("Temp. 37,8 °C");
    expect(otherEventLabel({ type: "bain" })).toBe("Bain");
    expect(otherEventLabel({ type: "nettoyage_nez" })).toBe("Soin du nez");
  });

  it("sommeils et activités : finis avec leur durée, en cours marqués (comme le home)", () => {
    expect(otherEventLabel({ type: "sommeil", isNap: true, heureFin: 1, duree: 80 })).toBe("Sieste 1h20");
    expect(otherEventLabel({ type: "sommeil", isNap: false, heureFin: 1, duree: 45 })).toBe("Nuit 45 min");
    expect(otherEventLabel({ type: "sommeil", isNap: true })).toBe("Sieste · en cours");
    expect(otherEventLabel({ type: "activite", typeActivite: "promenade", heureDebut: 1 })).toBe("Promenade · en cours");
    expect(otherEventLabel({ type: "activite", typeActivite: "lecture", duree: 10 })).toBe("Lecture 10 min");
  });

  it("jalons comme le home (humeur en mots, jamais le titre libre) ; types inconnus ignorés", () => {
    expect(otherEventLabel({ type: "jalon", typeJalon: "humeur", humeur: 2 })).toBe("😐");
    expect(otherEventLabel({ type: "jalon", typeJalon: "autre", titre: "Chez mamie" })).toBe("Autre moment");
    expect(otherEventLabel({ type: "inconnu" })).toBeNull();
  });
});

describe("module partagé app / serveur", () => {
  const { assembleNowWidgetInput, zonedEnv } = require("../functions/shared/widget");

  it("zonedEnv : minuit et heure locale de Paris, heure d'été comprise", () => {
    const paris = zonedEnv("Europe/Paris");
    const summer = Date.UTC(2026, 6, 14, 22, 30); // 00:30 le 15 juillet à Paris
    expect(paris.clock(summer)).toBe("00:30");
    expect(paris.dayBounds(summer)).toEqual([Date.UTC(2026, 6, 14, 22, 0), Date.UTC(2026, 6, 15, 22, 0)]);
    const winter = Date.UTC(2026, 10, 13, 12, 0);
    expect(paris.dayBounds(winter)[0]).toBe(Date.UTC(2026, 10, 12, 23, 0));
  });

  it("assemble les compteurs et le fil avec un pictogramme par événement (24 h glissantes)", () => {
    const env = zonedEnv("Europe/Paris");
    const now = Date.UTC(2026, 10, 13, 17, 0);
    const at = (h: number, m = 0) => Date.UTC(2026, 10, 13, h - 1, m);
    const input = assembleNowWidgetInput(
      {
        childName: "Léa",
        nursing: null,
        tetees: [{ ms: at(8), dureeGauche: 10 }],
        biberons: [{ ms: at(11), typeBiberon: "lait_infantile", quantite: 120 }, { ms: at(12), typeBiberon: "eau", quantite: 30 }],
        solides: [],
        mictions: [{ ms: at(9) }, { ms: at(9, 1) }],
        // Veille : 22:00 dans les 24 h (compté au fil, pas à la journée) ; 11:00, plus de 24 h.
        selles: [{ ms: Date.UTC(2026, 10, 12, 10) }, { ms: Date.UTC(2026, 10, 12, 21) }],
        others: [
          { ms: at(10), type: "vitamine", nomVitamine: "D" },
          { ms: at(13), type: "jalon", typeJalon: "humeur", humeur: 5 },
        ],
        sleepTotalMinutes: 90,
        isPremium: false,
        reminders: { enabled: false, repasHours: 0, changesHours: 0 },
        now,
      },
      env,
    );
    expect(input.day.mealsCount).toBe(2);
    expect(input.day.bottleMl).toBe(120);
    expect(input.day.diapersCount).toBe(1);
    expect(input.lastMeal).toEqual({ ms: at(11), kind: "biberon" });
    expect(input.recent.map((e: { icon: string; label: string }) => `${e.icon} ${e.label}`).sort()).toEqual(
      [
        "biberon Biberon 120 ml",
        "biberon Biberon 30 ml",
        "tetee Tétée 10 min",
        "miction Change · pipi",
        "miction Change · pipi",
        "medicament Vitamine D",
        "jalon 🥰",
        "selle Change · selle",
      ].sort(),
    );
  });
});
