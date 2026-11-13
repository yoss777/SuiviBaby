// utils/widgetSnapshot.ts
// Construit les données du widget « Bébé maintenant » à partir de ce que
// l'Accueil connaît déjà. Fonction pure, testée : le widget n'a aucune logique
// métier, il affiche ces valeurs (il ne peut ni lire Firestore ni calculer).
//
// Règles (docs/strategie/widget/WIDGET_SPEC.md) :
// - toutes les sessions en cours sont listées (tétée, sommeil, promenade), chacune
//   avec son chrono, visible de tous, gratuitement ; `live` garde la principale ;
// - au repos : temps depuis le dernier repas, et le prochain sein quand il est
//   certain (dernière tétée sur un seul sein) ;
// - la journée (repas, couches, sommeil) est affichée pour tous, comme chez
//   les concurrents ; Premium ajoute les rappels discrets (sauf celui du repas,
//   gratuit) ;
// - aucune incitation à payer dans le widget ;
// - jamais d'auteur pour une tétée (seule la mère allaite).
import type { NursingTimerState } from "@/components/forms/nursingTimer";

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
  /** « depuis 14:32 » : lisible sans chrono (Android, écran verrouillé). */
  sinceLabel: string;
  /** Une 2e session tourne en même temps (ex. promenade pendant une sieste). */
  alsoKind: WidgetLiveKind | null;
}

export interface WidgetDay {
  mealsCount: number;
  bottleMl: number;
  lastMealMs: number | null;
  diapersCount: number;
  lastDiaperMs: number | null;
  sleepMinutes: number;
}

export interface WidgetAlerts {
  /** Heure (ms) à laquelle la valeur passe en rouge, si le rappel est réglé. */
  mealAtMs: number | null;
  diaperAtMs: number | null;
}

export interface NowWidgetProps {
  v: 1;
  childName: string;
  /** Session principale (tétée > sommeil > promenade) : widget iOS, écran verrouillé. */
  live: WidgetLive | null;
  /** Toutes les sessions en cours, dans cet ordre, chacune avec son chrono. */
  lives: WidgetLive[];
  lastMealMs: number | null;
  lastMealLabel: string | null;
  nextSide: "G" | "D" | null;
  isPremium: boolean;
  /** État de la journée : affiché pour tous. */
  day: WidgetDay | null;
  alerts: WidgetAlerts;
  generatedAtMs: number;
}

export const EMPTY_NOW_WIDGET: NowWidgetProps = {
  v: 1,
  childName: "",
  live: null,
  lives: [],
  lastMealMs: null,
  lastMealLabel: null,
  nextSide: null,
  isPremium: false,
  day: null,
  alerts: { mealAtMs: null, diaperAtMs: null },
  generatedAtMs: 0,
};

/**
 * Version envoyée au natif : sans aucun `null` ni `undefined`, à aucun niveau.
 * Le pont Android d'expo-widgets (Map<String, Any?>) refuse une valeur nulle
 * dans un sous-objet (« Cannot convert … to a Kotlin type »). Le widget lit
 * donc une clé absente comme « pas de valeur » (tests `!= null` / truthy).
 */
export function toNativeWidgetProps(props: NowWidgetProps): NowWidgetProps {
  return JSON.parse(JSON.stringify(props, (_key, value) => (value === null ? undefined : value)));
}

/** Données initiales du widget, déjà au format natif. */
export const EMPTY_NOW_WIDGET_NATIVE: NowWidgetProps = toNativeWidgetProps(EMPTY_NOW_WIDGET);

export interface NowWidgetInput {
  childName: string;
  nursing: NursingTimerState | null;
  sleepStartMs: number | null;
  walkStartMs: number | null;
  lastMeal: { ms: number; kind: "tetee" | "biberon" | "solide" | "autre" } | null;
  /** Dernière tétée terminée : durées par sein (min) pour le prochain sein. */
  lastNursing: { leftMinutes: number; rightMinutes: number } | null;
  day: WidgetDay;
  isPremium: boolean;
  /** Seuils de rappel du parent, en heures (0 = désactivé). */
  reminders: { enabled: boolean; repasHours: number; changesHours: number };
  now: number;
}

/** « 14:32 » (heure locale, format français). */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** « 4:10 » ou « 1:04:10 » (secondes). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const base = `${mm}:${String(sec).padStart(2, "0")}`;
  return h > 0 ? `${h}:${base}` : base;
}

const MEAL_LABEL: Record<string, string> = {
  tetee: "Tétée",
  biberon: "Biberon",
  solide: "Repas",
  autre: "Repas",
};

/** Prochain sein, seulement quand il est certain : dernière tétée sur un seul sein. */
export function nextSideFrom(
  lastNursing: { leftMinutes: number; rightMinutes: number } | null,
): "G" | "D" | null {
  if (!lastNursing) return null;
  const left = lastNursing.leftMinutes > 0;
  const right = lastNursing.rightMinutes > 0;
  if (left && !right) return "D";
  if (right && !left) return "G";
  return null;
}

function nursingLive(state: NursingTimerState, now: number): WidgetLive {
  const side = state.runningSide;
  const left = state.leftSeconds + (side === "left" && state.runningSince ? (now - state.runningSince) / 1000 : 0);
  const right = state.rightSeconds + (side === "right" && state.runningSince ? (now - state.runningSince) / 1000 : 0);
  // Côté affiché : le côté actif ; en pause, celui qui a le plus de temps.
  const shown: "left" | "right" = side ?? (state.rightSeconds > state.leftSeconds ? "right" : "left");
  const shownBase = shown === "left" ? state.leftSeconds : state.rightSeconds;
  const otherSeconds = shown === "left" ? right : left;
  const timerStartMs = side && state.runningSince ? state.runningSince - shownBase * 1000 : now - shownBase * 1000;
  const startedAt = state.startedAt ?? timerStartMs;
  return {
    kind: "nursing",
    timerStartMs,
    pausedAtMs: side ? null : now,
    side: shown === "left" ? "G" : "D",
    otherSideLabel: otherSeconds >= 1 ? `${shown === "left" ? "D" : "G"} ${formatDuration(otherSeconds)}` : null,
    sinceLabel: `depuis ${formatClock(startedAt)}`,
    alsoKind: null,
  };
}

function simpleLive(kind: WidgetLiveKind, startMs: number): WidgetLive {
  return {
    kind,
    timerStartMs: startMs,
    pausedAtMs: null,
    side: null,
    otherSideLabel: null,
    sinceLabel: `depuis ${formatClock(startMs)}`,
    alsoKind: null,
  };
}

export function buildNowWidgetProps(input: NowWidgetInput): NowWidgetProps {
  const sessions: WidgetLive[] = [];
  if (input.nursing) sessions.push(nursingLive(input.nursing, input.now));
  if (input.sleepStartMs != null) sessions.push(simpleLive("sleep", input.sleepStartMs));
  if (input.walkStartMs != null) sessions.push(simpleLive("walk", input.walkStartMs));
  const live = sessions[0] ? { ...sessions[0], alsoKind: sessions[1]?.kind ?? null } : null;
  const lives = sessions.map((session, index) => (index === 0 && live ? live : session));

  const hours = (h: number) => h * 3600 * 1000;
  const { reminders } = input;
  const mealAtMs =
    reminders.enabled && reminders.repasHours > 0 && input.lastMeal
      ? input.lastMeal.ms + hours(reminders.repasHours)
      : null;
  const diaperAtMs =
    input.isPremium && reminders.enabled && reminders.changesHours > 0 && input.day.lastDiaperMs != null
      ? input.day.lastDiaperMs + hours(reminders.changesHours)
      : null;

  return {
    v: 1,
    childName: input.childName,
    live,
    lives,
    lastMealMs: input.lastMeal?.ms ?? null,
    lastMealLabel: input.lastMeal
      ? `${MEAL_LABEL[input.lastMeal.kind] ?? "Repas"} à ${formatClock(input.lastMeal.ms)}`
      : null,
    nextSide: nextSideFrom(input.lastNursing),
    isPremium: input.isPremium,
    day: input.day,
    alerts: { mealAtMs, diaperAtMs },
    generatedAtMs: input.now,
  };
}

/** Nombre d'épisodes : des horodatages à moins de `gapMs` comptent pour un (repas 30 min, change 2 min). */
export function countGroups(timestamps: number[], gapMs: number): number {
  const sorted = [...timestamps].sort((a, b) => a - b);
  let count = 0;
  let last = -Infinity;
  for (const ts of sorted) {
    if (ts - last > gapMs) {
      count++;
      last = ts;
    }
  }
  return count;
}
