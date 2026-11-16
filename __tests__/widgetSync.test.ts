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
  looksUnloaded,
  widgetTimelineDates,
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

  it("une entrée par minute pendant 1 h, puis toutes les 5 min jusqu'à 4 h, alignées sur le début de la session", () => {
    const now = 1_000_000_000_000;
    const start = now - 20_000; // sieste lancée il y a 20 s
    const dates = widgetTimelineDates(
      props({ lives: [{ kind: "sleep", timerStartMs: start, sinceMs: start, sinceLabel: "depuis 10:00" } as any] }),
      now,
    );
    expect(dates[0]).toBe(now);
    expect(dates).toContain(now + 60 * 60_000);
    expect(dates).toContain(now + 65 * 60_000);
    expect(dates).toContain(now + 4 * 3600_000);
    // Puis la seule entrée d'expiration (24 h après la génération des données).
    expect(dates.filter((d) => d > now + 4 * 3600_000)).toHaveLength(1);
    expect(dates).toContain(start + 60_000);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toContain(start + 2 * 60_000);
    expect(dates.length).toBeLessThan(170);
  });
});
