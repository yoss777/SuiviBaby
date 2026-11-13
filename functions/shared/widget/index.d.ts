// Types du module partagé du widget (functions/shared/widget/index.js).

export type WidgetLiveKind = "nursing" | "sleep" | "walk";

export interface WidgetLive {
  kind: WidgetLiveKind;
  /** Début du chrono affiché (ms) : le système le fait défiler seul. */
  timerStartMs: number;
  /** En pause (tétée) : chrono figé à cette date (ms). */
  pausedAtMs: number | null;
  /** Côté actif ou dernier côté (tétée). */
  side: "G" | "D" | null;
  /** Temps de l'autre côté, figé : « D 4:10 » (tétée). */
  otherSideLabel: string | null;
  /** Début de la session (ms), à mettre en forme sur l'appareil. */
  sinceMs: number;
  /** « depuis 14:32 » (compatibilité ; préférer sinceMs). */
  sinceLabel: string;
  /** Une 2e session tourne en même temps (ex. promenade pendant une sieste). */
  alsoKind: WidgetLiveKind | null;
  /** Sommeil : sieste (true) ou nuit (false) ; sinon null. */
  nap: boolean | null;
}

export interface WidgetDay {
  mealsCount: number;
  bottleMl: number;
  lastMealMs: number | null;
  diapersCount: number;
  lastDiaperMs: number | null;
  sleepMinutes: number;
}

/** Un événement du jour, pour la liste qui défile (« 🍼 11:57 Biberon 100 ml »). */
export interface WidgetEvent {
  ms: number;
  /** meal / diaper : comptés dans la journée ; other : soins, santé, activités, sommeils finis. */
  kind: "meal" | "diaper" | "other";
  /** Emoji du type d'événement, toujours accompagné du libellé. */
  icon?: string;
  label: string;
}

/** Événement du jour hors repas et changes, tel que l'app le stocke. */
export type OtherDayEvent = { type: string; [field: string]: unknown };

export interface WidgetAlerts {
  /** Heure (ms) à laquelle la valeur passe en rouge, si le rappel est réglé. */
  mealAtMs: number | null;
  diaperAtMs: number | null;
}

export type MealKind = "tetee" | "biberon" | "solide" | "autre";

export interface NowWidgetProps {
  v: 1;
  /** Enfant affiché : distingue deux bébés de même prénom dans l'anti-doublon. */
  childId?: string;
  childName: string;
  /** Session principale (tétée > sommeil > promenade). */
  live: WidgetLive | null;
  /** Toutes les sessions en cours, dans cet ordre, chacune avec son chrono. */
  lives: WidgetLive[];
  lastMealMs: number | null;
  lastMealLabel: string | null;
  lastMealKind: MealKind | null;
  nextSide: "G" | "D" | null;
  isPremium: boolean;
  /** État de la journée : affiché pour tous. */
  day: WidgetDay | null;
  /** Événements du jour, du plus récent au plus ancien. */
  recent: WidgetEvent[];
  alerts: WidgetAlerts;
  /** Minuit local (ms) du jour des compteurs : le widget les masque le lendemain. */
  dayStartMs: number;
  generatedAtMs: number;
}

/** Tétée en cours (forme de NursingTimerState, sans dépendance à l'app). */
export interface WidgetNursingState {
  leftSeconds: number;
  rightSeconds: number;
  runningSide: "left" | "right" | null;
  runningSince: number | null;
  startedAt: number | null;
  /** Dernière modification (ms) : heure de la pause, ancre stable du chrono figé. */
  updatedAt?: number;
}

export interface NowWidgetInput {
  childName: string;
  nursing: WidgetNursingState | null;
  sleepStartMs: number | null;
  sleepIsNap?: boolean | null;
  walkStartMs: number | null;
  lastMeal: { ms: number; kind: MealKind } | null;
  /** Dernière tétée : durées par sein (min) pour le prochain sein. */
  lastNursing: { leftMinutes: number; rightMinutes: number } | null;
  day: WidgetDay;
  /** Événements du jour (ordre quelconque) : triés et limités ici. */
  recent?: WidgetEvent[];
  isPremium: boolean;
  /** Seuils de rappel du parent, en heures (0 = désactivé). */
  reminders: { enabled: boolean; repasHours: number; changesHours: number };
  now: number;
}

/** Temps local : jour [début, fin[ et heure « 14:32 ». */
export interface WidgetEnv {
  dayBounds(now: number): [number, number];
  clock(ms: number): string;
}

type Timed = { ms: number };

/** Événements bruts d'un bébé, chacun avec son heure en ms. */
export interface WidgetSource {
  childName: string;
  nursing: WidgetNursingState | null;
  tetees: (Timed & { dureeGauche?: number; dureeDroite?: number })[];
  biberons: (Timed & { typeBiberon?: string; quantite?: number })[];
  solides: Timed[];
  mictions: Timed[];
  selles: Timed[];
  others?: (Timed & OtherDayEvent)[];
  sleepStartMs?: number | null;
  sleepIsNap?: boolean | null;
  walkStartMs?: number | null;
  sleepTotalMinutes: number;
  lastAbsoluteMealMs?: number | null;
  isPremium: boolean;
  reminders: { enabled: boolean; repasHours: number; changesHours: number };
  now: number;
}

export const WIDGET_RECENT_MAX: number;
export const MEAL_GROUP_MS: number;
export const CHANGE_GROUP_MS: number;
export const EVENT_ICON: Record<string, string>;
export const EMPTY_NOW_WIDGET: NowWidgetProps;
export const EMPTY_NOW_WIDGET_NATIVE: NowWidgetProps;
export const localEnv: WidgetEnv;
export function zonedEnv(timeZone: string): WidgetEnv;
export function otherEventLabel(e: OtherDayEvent): string | null;
export function otherEventIcon(e: OtherDayEvent): string | undefined;
export function toNativeWidgetProps(props: NowWidgetProps): NowWidgetProps;
export function formatDuration(totalSeconds: number): string;
export function nextSideFrom(lastNursing: { leftMinutes: number; rightMinutes: number } | null): "G" | "D" | null;
export function buildNowWidgetProps(input: NowWidgetInput, env?: WidgetEnv): NowWidgetProps;
export function countGroups(timestamps: number[], gapMs: number): number;
export function assembleNowWidgetInput(src: WidgetSource, env?: WidgetEnv): NowWidgetInput;

export const NURSING_PAUSED_TTL_MS: number;
export const NURSING_RUNNING_TTL_MS: number;
/** Tétée partagée encore valable (temps compté ou côté en cours, non expirée), sinon null. */
export function usableNursing(state: unknown, now: number): WidgetNursingState | null;
export function sleepMinutesInDay(
  sleeps: { ms: number; startMs?: number; endMs?: number }[],
  dayStart: number,
  dayEnd: number,
  now: number,
): number;
