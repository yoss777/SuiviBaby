// Données de widget pour les tests de rendu (même forme que NowWidgetProps).
export const KEY = "0123456789abcdef0123456789abcdef";
/** Lundi 16/11/2026 15:00, heure locale (TZ des tests : Europe/Paris). */
export const NOW = new Date(2026, 10, 16, 15, 0).getTime();
export const H = 3600_000;
export const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 10, 16 + dayOffset, h, m).getTime();

export function widgetProps(over: Record<string, unknown> = {}) {
  return {
    v: 1,
    childId: "c1",
    childName: "Léa Martin",
    lives: [],
    recent: [],
    alerts: {},
    generatedAtMs: NOW - 5 * 60_000,
    canWrite: true,
    isPremium: true,
    dayStartMs: at(0, 0),
    lastMealMs: NOW - 2 * H,
    day: { mealsCount: 3, bottleMl: 0, lastMealMs: NOW - 2 * H, diapersCount: 2, lastDiaperMs: NOW - 3 * H, sleepMinutes: 95 },
    linkKey: KEY,
    ...over,
  };
}

export const napLive = (startMs: number) => ({
  kind: "sleep",
  timerStartMs: startMs,
  sinceMs: startMs,
  sinceLabel: "depuis 14:00",
  pausedAtMs: null,
  side: null,
  otherSideLabel: null,
  alsoKind: null,
  nap: true,
});
