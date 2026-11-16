// Envoi au widget : anti-rebond, contenu inchangé, ordre des écritures avec le
// récepteur natif, effacement à la déconnexion, remontée des erreurs.
const mockCalls: string[] = [];
jest.mock("@/modules/widget-push", () => ({
  noteAppSnapshot: (childId: string) => mockCalls.push(`note:${childId}`),
  clearWidgetPush: () => mockCalls.push("clearNative"),
}));

import {
  __resetWidgetSyncForTests,
  cancelPendingWidgetPush,
  clearNowWidget,
  flushPendingWidgetPush,
  invalidateWidgetKey,
  pushNowWidget,
  pushNowWidgetLoading,
  WIDGET_CHILD_SWITCH_WINDOW_MS,
  WIDGET_SYNC_DEBOUNCE_MS,
  WIDGET_UNLOADED_GRACE_MS,
  WIDGET_IOS_FULL_TIMELINE_DELAY_MS,
  widgetQuickTimelinePlan,
  writeServerWidgetProps,
  looksUnloaded,
  widgetTimelineDates,
  widgetTimelinePlan,
  resumeWidgetWrites,
} from "@/services/widgetSync";
import { captureServiceError } from "@/utils/errorReporting";
import { AppState } from "react-native";
import { EMPTY_NOW_WIDGET, EMPTY_NOW_WIDGET_NATIVE, type NowWidgetProps } from "@/utils/widgetSnapshot";

const props = (over: Partial<NowWidgetProps> = {}): NowWidgetProps => ({
  ...EMPTY_NOW_WIDGET,
  childId: "c1",
  childName: "Léa",
  generatedAtMs: Date.now(),
  ...over,
});

let widget: { updateSnapshot: jest.Mock };

const setAppState = (state: string) =>
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });

beforeEach(() => {
  setAppState("active");
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCalls.length = 0;
  widget = { updateSnapshot: jest.fn((p: NowWidgetProps) => mockCalls.push(`write:${p.childName}`)) };
  __resetWidgetSyncForTests(widget);
});
afterEach(() => jest.useRealTimers());

/** Premier envoi pour c1 (immédiat), fenêtre du changement d'enfant écoulée, journal remis à zéro. */
function primed(): void {
  pushNowWidget(props({ childName: "init" }));
  jest.advanceTimersByTime(WIDGET_CHILD_SWITCH_WINDOW_MS);
  widget.updateSnapshot.mockClear();
  mockCalls.length = 0;
}

it("anti-rebond : un seul envoi, le dernier ; noté avant l'écriture", () => {
  primed();
  pushNowWidget(props({ childName: "A" }));
  pushNowWidget(props({ childName: "B" }));
  jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS - 1);
  expect(widget.updateSnapshot).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(mockCalls).toEqual(["note:c1", "write:B"]);
});

it("session démarrée, mise en pause ou arrêtée : écrite tout de suite (appui sur le widget visible aussitôt)", () => {
  primed();
  const sleep = { kind: "sleep", timerStartMs: 1000, sinceMs: 1000, sinceLabel: "depuis 10:00" } as any;
  pushNowWidget(props({ lives: [sleep] }));
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  // Autre changement, sessions identiques : anti-rebond habituel.
  pushNowWidget(props({ lives: [sleep], childName: "Léa B" }));
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS);
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(2);
  // Pause d'une tétée, puis arrêt : immédiats.
  const nursing = { kind: "nursing", timerStartMs: 1000, sinceMs: 1000, sinceLabel: "" } as any;
  pushNowWidget(props({ lives: [sleep, nursing], childName: "Léa B" }));
  pushNowWidget(props({ lives: [sleep, { ...nursing, pausedAtMs: 5000 }], childName: "Léa B" }));
  pushNowWidget(props({ lives: [], childName: "Léa B" }));
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(5);
});

it("après invalidation (retour au premier plan) : un démarrage reste écrit tout de suite", () => {
  primed();
  invalidateWidgetKey();
  pushNowWidget(props({ lives: [{ kind: "walk", timerStartMs: 1000, sinceMs: 1000, sinceLabel: "" } as any] }));
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
});

it("contenu inchangé (hors heure de calcul) : pas de réécriture, sauf après invalidation", () => {
  primed();
  pushNowWidget(props({ generatedAtMs: 1 }));
  jest.runOnlyPendingTimers();
  pushNowWidget(props({ generatedAtMs: 2 }));
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  invalidateWidgetKey();
  pushNowWidget(props({ generatedAtMs: 3 }));
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(2);
});

it("annulation : l'envoi en attente ne part pas", () => {
  primed();
  pushNowWidget(props());
  cancelPendingWidgetPush();
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).not.toHaveBeenCalled();
});

it("déconnexion : widget vidé tout de suite, récepteur réinitialisé, envoi en attente annulé", () => {
  primed();
  pushNowWidget(props({ childName: "Léa" }));
  clearNowWidget();
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  expect(widget.updateSnapshot).toHaveBeenCalledWith(EMPTY_NOW_WIDGET_NATIVE);
  expect(mockCalls).toContain("clearNative");
});

it("échec d'écriture : remonté une seule fois par session", () => {
  widget.updateSnapshot.mockImplementation(() => {
    throw new Error("native down");
  });
  pushNowWidget(props({ childName: "A" }));
  jest.runOnlyPendingTimers();
  pushNowWidget(props({ childName: "B" }));
  jest.runOnlyPendingTimers();
  expect(captureServiceError).toHaveBeenCalledTimes(1);
  expect(captureServiceError).toHaveBeenCalledWith(expect.any(Error), { service: "widgetSync", operation: "updateSnapshot" });
});

it("changement d'enfant : le widget suit tout de suite, sans anti-rebond", () => {
  primed();
  pushNowWidget(props({ childId: "c2", childName: "Sam" }));
  expect(mockCalls).toEqual(["note:c2", "write:Sam"]);
});

it("enfant changé, données en chargement : « Mise à jour… » au nouveau prénom, puis les données tout de suite", () => {
  primed();
  pushNowWidgetLoading("c2", "Sam");
  expect(widget.updateSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ childId: "c2", childName: "Sam", loading: true }));
  pushNowWidgetLoading("c2", "Sam"); // déjà affiché
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  pushNowWidget(props({ childId: "c2", childName: "Sam", lastMealMs: 5 }));
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(2);
  expect(widget.updateSnapshot.mock.calls[1][0]).not.toHaveProperty("loading");
});

it("mise en arrière-plan : l'envoi en attente part aussitôt", () => {
  primed();
  pushNowWidget(props({ childName: "B" }));
  expect(widget.updateSnapshot).not.toHaveBeenCalled();
  flushPendingWidgetPush();
  expect(mockCalls).toEqual(["note:c1", "write:B"]);
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
});

it("données qui arrivent juste après un changement d'enfant : immédiates, puis anti-rebond", () => {
  primed();
  pushNowWidget(props({ childId: "c2", childName: "Sam" }));
  pushNowWidget(props({ childId: "c2", childName: "Sam", lastMealMs: 5 }));
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(WIDGET_CHILD_SWITCH_WINDOW_MS);
  pushNowWidget(props({ childId: "c2", childName: "Sam", lastMealMs: 6 }));
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS);
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(3);
});

it("app hors premier plan : envoi immédiat (minuteries suspendues par Android)", () => {
  primed();
  setAppState("background");
  pushNowWidget(props({ childName: "B" }));
  expect(mockCalls).toEqual(["note:c1", "write:B"]);
});


describe("données pas encore chargées au lancement", () => {
  const day = { mealsCount: 0, bottleMl: 0, lastMealMs: null, diapersCount: 0, lastDiaperMs: null, sleepMinutes: 0 };
  const unloaded = () => props({ childName: "vide", lastMealMs: Date.now() - 20 * 60_000, day: { ...day } as any, recent: [] });

  it("repère un repas récent avec un fil vide et des compteurs à 0", () => {
    expect(looksUnloaded(unloaded())).toBe(true);
    expect(looksUnloaded(props({ day: { ...day } as any, recent: [] }))).toBe(false);
    expect(looksUnloaded(props({ lastMealMs: Date.now() - 20 * 60_000, day: { ...day, mealsCount: 1 } as any }))).toBe(false);
  });

  it("lancement à froid : pas de « 0 repas », les vraies données arrivées remplacent", () => {
    pushNowWidget(unloaded());
    expect(widget.updateSnapshot).not.toHaveBeenCalled();
    pushNowWidget(props({ childName: "chargé", day: { ...day, mealsCount: 1 } as any }));
    jest.advanceTimersByTime(WIDGET_UNLOADED_GRACE_MS);
    expect(mockCalls.filter((c) => c.startsWith("write:"))).toEqual(["write:chargé"]);
  });

  it("hors premier plan : jamais écrit (le serveur ne répondra plus), le widget garde ses données", () => {
    setAppState("background");
    pushNowWidget(unloaded());
    jest.advanceTimersByTime(WIDGET_UNLOADED_GRACE_MS * 2);
    expect(widget.updateSnapshot).not.toHaveBeenCalled();
  });

  it("hors premier plan, minuit passé : le nouveau jour est écrit (pas les compteurs d'hier)", () => {
    jest.setSystemTime(new Date(2026, 10, 15, 23, 50));
    pushNowWidget(props({ childName: "hier", day: { ...day, mealsCount: 3 } as any }));
    expect(mockCalls).toContain("write:hier");
    jest.setSystemTime(new Date(2026, 10, 16, 0, 5));
    setAppState("background");
    pushNowWidget(unloaded());
    expect(mockCalls).toContain("write:vide");
  });

  it("vraie journée vide : écrite après le délai ; jamais forcée au passage en arrière-plan", () => {
    pushNowWidget(unloaded());
    flushPendingWidgetPush();
    expect(widget.updateSnapshot).not.toHaveBeenCalled();
    jest.advanceTimersByTime(WIDGET_UNLOADED_GRACE_MS);
    expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  });
});


describe("timeline iPhone (durées à la minute)", () => {
  it("une entrée juste après 24 h : le widget se masque de lui-même (données expirées)", () => {
    const now = 1_000_000_000_000;
    const dates = widgetTimelineDates(props({ generatedAtMs: now }), now);
    expect(dates).toContain(now + 24 * 3600_000 + 60_000);
  });

  it("une entrée par minute de la pendule pendant 1 h, puis toutes les 5 min jusqu'à 4 h", () => {
    const now = 1_000_000_000_000; // 46:40 passées de 40 s
    const start = now - 20_000; // sieste lancée il y a 20 s
    const { dates, countingEndMs } = widgetTimelinePlan(
      props({ generatedAtMs: now, lives: [{ kind: "sleep", timerStartMs: start, sinceMs: start, sinceLabel: "depuis 10:00" } as any] }),
      now,
    );
    const nextMinute = Math.floor(now / 60_000) * 60_000 + 60_000;
    expect(dates[0]).toBe(now);
    // « 0 min » → « 1 min » à hh:mm:00, comme Android et l'Accueil (secondes ignorées).
    expect(dates).toContain(nextMinute);
    expect(dates).toContain(nextMinute + 59 * 60_000);
    expect(dates).not.toContain(start + 60_000);
    expect(dates).toContain(now + 65 * 60_000);
    expect(dates).toContain(now + 4 * 3600_000);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.length).toBeLessThan(130); // ~60 + 36 + ~20 horaires + exactes
    // Fin du comptage : 4 h, jamais l'entrée d'expiration (sinon chrono figé).
    expect(countingEndMs).toBe(now + 4 * 3600_000);
  });

  it("une seule grille, même avec deux sessions en cours", () => {
    const now = 1_000_000_000_000;
    const lives = [
      { kind: "sleep", timerStartMs: now - 20_000, sinceMs: now - 20_000, sinceLabel: "" },
      { kind: "walk", timerStartMs: now - 50_000, sinceMs: now - 50_000, sinceLabel: "" },
    ] as any;
    const one = widgetTimelineDates(props({ generatedAtMs: now, lives: [lives[0]] }), now);
    const two = widgetTimelineDates(props({ generatedAtMs: now, lives }), now);
    expect(two).toEqual(one);
  });

  it("au-delà de 4 h : une entrée par heure jusqu'à 24 h (« il y a » jamais figé longtemps)", () => {
    const now = 1_000_000_000_000;
    const { dates, countingEndMs } = widgetTimelinePlan(props({ generatedAtMs: now }), now);
    const after = dates.filter((d) => d > countingEndMs);
    const gaps = after.map((d, i) => d - (i ? after[i - 1] : countingEndMs));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(3600_000);
    expect(dates.length).toBeLessThan(140);
  });

  it("entrées exactes : rappel qui passe au rouge, minuit, bascule Sieste/Nuit", () => {
    const now = new Date(2026, 10, 16, 15, 0).getTime();
    const mealAt = now + 6 * 3600_000 + 7 * 60_000; // après la fenêtre de 4 h
    const { dates } = widgetTimelinePlan(props({ generatedAtMs: now, alerts: { mealAtMs: mealAt } as any }), now);
    expect(dates).toContain(mealAt);
    expect(dates).toContain(new Date(2026, 10, 17, 0, 0).getTime());
    expect(dates).toContain(new Date(2026, 10, 16, 19, 0).getTime());
    expect(dates).toContain(new Date(2026, 10, 17, 8, 0).getTime());
  });

  it("écriture iPhone : fin de comptage à 4 h 05 dans les données, même avec l'entrée d'expiration", () => {
    const entries: { date: Date; props: NowWidgetProps }[] = [];
    __resetWidgetSyncForTests({ updateSnapshot: jest.fn(), updateTimeline: (e: typeof entries) => entries.push(...e) } as any);
    const now = Date.now();
    pushNowWidget(props({ generatedAtMs: now }));
    expect(entries.length).toBeGreaterThan(50);
    const end = entries[0].props.timelineEndMs as number;
    expect(end).toBeLessThanOrEqual(now + 4 * 3600_000 + 5 * 60_000 + 1000);
    expect(entries[entries.length - 1].date.getTime()).toBeGreaterThan(end);
  });
});

describe("iPhone : timeline courte au démarrage / à l'arrêt, complète ensuite", () => {
  const sleep = { kind: "sleep", timerStartMs: 1000, sinceMs: 1000, sinceLabel: "" } as any;
  let calls: number[];
  let tl: jest.Mock;
  const setup = () => {
    calls = [];
    tl = jest.fn((e: unknown[]) => calls.push(e.length));
    __resetWidgetSyncForTests({ updateSnapshot: jest.fn(), updateTimeline: tl } as any);
    pushNowWidget(props({ childName: "init" }));
    jest.advanceTimersByTime(WIDGET_CHILD_SWITCH_WINDOW_MS);
    calls.length = 0;
  };
  const lastEntries = () => tl.mock.calls[tl.mock.calls.length - 1][0] as { date: Date; props: NowWidgetProps }[];

  it("démarrage : timeline courte tout de suite (~15 entrées), la complète 4 s après", () => {
    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeLessThanOrEqual(16);
    jest.advanceTimersByTime(WIDGET_IOS_FULL_TIMELINE_DELAY_MS);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeGreaterThan(80);
  });

  it("deux appuis rapprochés : une seule complète, celle du dernier contenu", () => {
    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    pushNowWidget(props({ childName: "init", lives: [] }));
    jest.advanceTimersByTime(WIDGET_IOS_FULL_TIMELINE_DELAY_MS * 2);
    // Courte, courte, puis une seule complète.
    expect(calls).toHaveLength(3);
    expect(lastEntries()[0].props.lives ?? []).toHaveLength(0);
  });

  it("app quittée avant 4 s, retour : une seule complète, celle de l'envoi qui suit", () => {
    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    // Minuteries suspendues : le délai ne s'écoule pas. Retour dans l'app :
    invalidateWidgetKey();
    expect(calls).toHaveLength(1);
    pushNowWidget(props({ childName: "frais", lives: [sleep] }));
    jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS * 3);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeGreaterThan(80);
    expect(lastEntries()[0].props.childName).toBe("frais");
  });

  it("app quittée avant 4 s, retour sans envoi (écran pas prêt) : la complète due part quand même", () => {
    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    invalidateWidgetKey();
    jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS + 1000);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeGreaterThan(80);
  });

  it("envoi en attente abandonné sans écrire : la complète repasse ensuite", () => {
    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    jest.advanceTimersByTime(WIDGET_IOS_FULL_TIMELINE_DELAY_MS - 1000);
    pushNowWidget(props({ childName: "autre", lives: [sleep] }));
    jest.advanceTimersByTime(1000);
    cancelPendingWidgetPush();
    jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS + 500);
    expect(calls).toHaveLength(2);
    expect(lastEntries()[0].props.childName).toBe("init");
  });

  it("déconnexion (écritures suspendues) : la complète en attente ne part jamais", () => {
    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    clearNowWidget({ suspend: true });
    jest.advanceTimersByTime(WIDGET_IOS_FULL_TIMELINE_DELAY_MS * 3);
    expect(calls).toHaveLength(1);
  });

  it("contenu remplacé, widget vidé ou données serveur entre-temps : la complète en attente ne part pas", () => {
    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    clearNowWidget();
    jest.advanceTimersByTime(WIDGET_IOS_FULL_TIMELINE_DELAY_MS);
    expect(calls).toHaveLength(1);

    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    writeServerWidgetProps(props({ childName: "serveur", lives: [sleep] }));
    jest.advanceTimersByTime(WIDGET_IOS_FULL_TIMELINE_DELAY_MS);
    expect(calls).toHaveLength(2); // courte + serveur, pas de complète périmée
  });

  it("envoi en attente (anti-rebond) au moment de la complète : seul l'envoi en attente écrit", () => {
    setup();
    pushNowWidget(props({ childName: "init", lives: [sleep] }));
    jest.advanceTimersByTime(WIDGET_IOS_FULL_TIMELINE_DELAY_MS - 1000);
    pushNowWidget(props({ childName: "autre", lives: [sleep] }));
    jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeGreaterThan(80);
    expect(lastEntries()[0].props.childName).toBe("autre");
  });

  it("autres changements, ou app hors premier plan : timeline complète directement", () => {
    setup();
    pushNowWidget(props({ childName: "autre" }));
    jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS);
    expect(calls).toEqual([expect.any(Number)]);
    expect(calls[0]).toBeGreaterThan(80);
    setAppState("background");
    pushNowWidget(props({ childName: "autre", lives: [sleep] }));
    expect(calls[1]).toBeGreaterThan(80);
  });

  it("timeline courte : 8 minutes de la pendule, puis rappel au rouge, minuit et expiration à 24 h", () => {
    const now = new Date(2026, 10, 16, 15, 0, 30).getTime();
    const mealAt = now + 2 * 3600_000 + 7 * 60_000;
    const { dates, countingEndMs } = widgetQuickTimelinePlan(props({ generatedAtMs: now, alerts: { mealAtMs: mealAt } as any }), now);
    expect(dates[0]).toBe(now);
    expect(dates[1]).toBe(new Date(2026, 10, 16, 15, 1).getTime());
    expect(countingEndMs).toBe(new Date(2026, 10, 16, 15, 8).getTime());
    expect(dates).toContain(mealAt);
    expect(dates).toContain(new Date(2026, 10, 17, 0, 0).getTime());
    expect(dates).toContain(now + 24 * 3600_000 + 60_000);
    // « màj HH:MM » (données de plus de 2 h) à l'heure.
    expect(dates).toContain(now + 2 * 3600_000 + 1000);
    expect(dates.length).toBeLessThanOrEqual(16);
    // Sans heure de génération : ni « màj » ni expiration (le widget n'expire pas non plus).
    const bare = widgetQuickTimelinePlan(props({ generatedAtMs: undefined as any }), now).dates;
    expect(bare).not.toContain(now + 2 * 3600_000 + 1000);
  });
});

describe("déconnexion", () => {
  it("widget vidé puis écritures suspendues : un rendu tardif de l'Accueil ne réaffiche rien", () => {
    pushNowWidget(props({ childName: "avant" }));
    clearNowWidget({ suspend: true });
    widget.updateSnapshot.mockClear();
    mockCalls.length = 0;
    setAppState("background");
    pushNowWidget(props({ childName: "Léa après déconnexion" }));
    jest.advanceTimersByTime(10_000);
    expect(mockCalls.filter((c) => c.startsWith("write:"))).toEqual([]);
    resumeWidgetWrites();
    pushNowWidget(props({ childName: "nouveau compte" }));
    expect(mockCalls).toContain("write:nouveau compte");
  });
});

it("A écrit, B en attente, retour à A : B n'est jamais écrit (pas d'état périmé)", () => {
  primed();
  pushNowWidget(props({ childName: "A" }));
  widget.updateSnapshot.mockClear();
  mockCalls.length = 0;
  jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS);
  mockCalls.length = 0;
  pushNowWidget(props({ childName: "B" }));
  pushNowWidget(props({ childName: "A" }));
  jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS * 2);
  expect(mockCalls.filter((c) => c.startsWith("write:"))).toEqual([]);
});
