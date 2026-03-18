// services/correlationService.ts
// Cross-data correlation analysis between event types

import type { Insight } from "@/types/content";
import { TIP_CATEGORY_COLORS } from "@/types/content";

// ============================================
// TYPES
// ============================================

interface CorrelationEvent {
  type: string;
  date: Date;
  // Sommeil
  quality?: "paisible" | "agite" | "mauvais";
  duree?: number;
  isNap?: boolean;
  heureDebut?: Date;
  heureFin?: Date;
  // Alimentation
  quantiteMl?: number;
  // Bain
  // Temperature
  valeur?: number;
}

interface CorrelationParams {
  events: CorrelationEvent[];
  babyName: string;
  now?: Date;
}

// ============================================
// HELPERS
// ============================================

function qualityScore(q?: string): number {
  if (q === "paisible") return 3;
  if (q === "agite") return 2;
  if (q === "mauvais") return 1;
  return 2;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getHour(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

let corrCounter = 0;
function nextId(): string {
  return `corr_${++corrCounter}_${Date.now()}`;
}

// ============================================
// CORRELATION: LAST MEAL BEFORE NIGHT SLEEP
// ============================================

function mealBeforeSleepCorrelation(
  events: CorrelationEvent[],
  name: string,
  now: Date,
): Insight | null {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentEvents = events.filter((e) => e.date >= cutoff);

  const nights = recentEvents.filter(
    (e) => e.type === "sommeil" && !e.isNap && e.heureDebut,
  );

  if (nights.length < 5) return null;

  const meals = recentEvents.filter(
    (e) =>
      e.type === "tetee" || e.type === "biberon" || e.type === "solide",
  );

  // For each night, find the last meal before bedtime
  const dataPoints: { gapMinutes: number; quality: number }[] = [];

  for (const night of nights) {
    const bedtime = night.heureDebut!;
    const bedDay = new Date(
      bedtime.getFullYear(),
      bedtime.getMonth(),
      bedtime.getDate(),
    );

    // Meals on the same day, before bedtime
    const dayMeals = meals.filter(
      (m) => isSameDay(m.date, bedDay) && m.date < bedtime,
    );

    if (dayMeals.length === 0) continue;

    // Last meal
    const lastMeal = dayMeals.sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    )[0];
    const gapMs = bedtime.getTime() - lastMeal.date.getTime();
    const gapMinutes = gapMs / (1000 * 60);

    dataPoints.push({
      gapMinutes,
      quality: qualityScore(night.quality),
    });
  }

  if (dataPoints.length < 5) return null;

  // Split into "late meal" (< 60min before bed) vs "early meal" (> 90min)
  const lateMeals = dataPoints.filter((d) => d.gapMinutes < 60);
  const earlyMeals = dataPoints.filter((d) => d.gapMinutes > 90);

  if (lateMeals.length < 3 || earlyMeals.length < 3) return null;

  const lateAvgQuality =
    lateMeals.reduce((s, d) => s + d.quality, 0) / lateMeals.length;
  const earlyAvgQuality =
    earlyMeals.reduce((s, d) => s + d.quality, 0) / earlyMeals.length;

  const diff = earlyAvgQuality - lateAvgQuality;

  // Only report if significant difference
  if (Math.abs(diff) < 0.3) return null;

  if (diff > 0) {
    return {
      id: nextId(),
      type: "info",
      icon: "utensils",
      title: "Repas et sommeil",
      message: `Quand ${name} mange plus de 90 min avant le coucher, la qualité de sommeil est meilleure. Essayez d'anticiper le dernier repas.`,
      accentColor: TIP_CATEGORY_COLORS.sommeil,
      priority: 2,
      category: "sommeil",
    };
  } else {
    return {
      id: nextId(),
      type: "info",
      icon: "utensils",
      title: "Repas et sommeil",
      message: `${name} semble mieux dormir quand le dernier repas est proche du coucher. Chaque bébé est différent !`,
      accentColor: TIP_CATEGORY_COLORS.sommeil,
      priority: 3,
      category: "sommeil",
    };
  }
}

// ============================================
// CORRELATION: BATH BEFORE SLEEP
// ============================================

function bathBeforeSleepCorrelation(
  events: CorrelationEvent[],
  name: string,
  now: Date,
): Insight | null {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentEvents = events.filter((e) => e.date >= cutoff);

  const nights = recentEvents.filter(
    (e) => e.type === "sommeil" && !e.isNap && e.quality,
  );
  const baths = recentEvents.filter((e) => e.type === "bain");

  if (nights.length < 7 || baths.length < 3) return null;

  // Nights with a bath the same day
  const nightsWithBath: number[] = [];
  const nightsWithoutBath: number[] = [];

  for (const night of nights) {
    const nightDay = new Date(
      night.date.getFullYear(),
      night.date.getMonth(),
      night.date.getDate(),
    );
    const hadBath = baths.some((b) => isSameDay(b.date, nightDay));
    const q = qualityScore(night.quality);

    if (hadBath) {
      nightsWithBath.push(q);
    } else {
      nightsWithoutBath.push(q);
    }
  }

  if (nightsWithBath.length < 3 || nightsWithoutBath.length < 3) return null;

  const avgWithBath =
    nightsWithBath.reduce((s, q) => s + q, 0) / nightsWithBath.length;
  const avgWithout =
    nightsWithoutBath.reduce((s, q) => s + q, 0) / nightsWithoutBath.length;

  const diff = avgWithBath - avgWithout;

  if (Math.abs(diff) < 0.3) return null;

  if (diff > 0) {
    const pct = Math.round((diff / avgWithout) * 100);
    return {
      id: nextId(),
      type: "info",
      icon: "bath",
      title: "Bain et sommeil",
      message: `Les jours où ${name} prend un bain, la qualité de sommeil est ${pct}% meilleure. Le bain semble aider à la détente.`,
      accentColor: TIP_CATEGORY_COLORS.sommeil,
      priority: 3,
      category: "sommeil",
    };
  }

  return null;
}

// ============================================
// CORRELATION: ACTIVITY AND SLEEP
// ============================================

function activitySleepCorrelation(
  events: CorrelationEvent[],
  name: string,
  now: Date,
): Insight | null {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentEvents = events.filter((e) => e.date >= cutoff);

  const nights = recentEvents.filter(
    (e) => e.type === "sommeil" && !e.isNap && e.quality,
  );
  const activities = recentEvents.filter((e) => e.type === "activite");

  if (nights.length < 7 || activities.length < 5) return null;

  const nightsWithActivity: number[] = [];
  const nightsWithoutActivity: number[] = [];

  for (const night of nights) {
    const nightDay = new Date(
      night.date.getFullYear(),
      night.date.getMonth(),
      night.date.getDate(),
    );
    const hadActivity = activities.some((a) => isSameDay(a.date, nightDay));
    const q = qualityScore(night.quality);

    if (hadActivity) {
      nightsWithActivity.push(q);
    } else {
      nightsWithoutActivity.push(q);
    }
  }

  if (nightsWithActivity.length < 3 || nightsWithoutActivity.length < 3)
    return null;

  const avgWith =
    nightsWithActivity.reduce((s, q) => s + q, 0) /
    nightsWithActivity.length;
  const avgWithout =
    nightsWithoutActivity.reduce((s, q) => s + q, 0) /
    nightsWithoutActivity.length;

  const diff = avgWith - avgWithout;

  if (diff > 0.3) {
    return {
      id: nextId(),
      type: "info",
      icon: "puzzle-piece",
      title: "Activité et sommeil",
      message: `Les jours avec activité d'éveil, ${name} dort mieux la nuit. La stimulation en journée favorise un sommeil de qualité.`,
      accentColor: TIP_CATEGORY_COLORS.developpement,
      priority: 3,
      category: "sommeil",
    };
  }

  return null;
}

// ============================================
// CORRELATION: FEVER AND APPETITE
// ============================================

function feverAppetiteCorrelation(
  events: CorrelationEvent[],
  name: string,
  now: Date,
): Insight | null {
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const recentEvents = events.filter((e) => e.date >= cutoff);

  const feverDays = new Set<string>();
  for (const e of recentEvents) {
    if (e.type === "temperature" && e.valeur && e.valeur >= 38) {
      const dayKey = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      feverDays.add(dayKey);
    }
  }

  if (feverDays.size === 0) return null;

  const repasTypes = ["tetee", "biberon", "solide"];
  const mealsByDay = new Map<string, number>();

  for (const e of recentEvents) {
    if (repasTypes.includes(e.type)) {
      const dayKey = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      mealsByDay.set(dayKey, (mealsByDay.get(dayKey) ?? 0) + 1);
    }
  }

  let feverMeals = 0;
  let feverDayCount = 0;
  let normalMeals = 0;
  let normalDayCount = 0;

  for (const [day, count] of mealsByDay) {
    if (feverDays.has(day)) {
      feverMeals += count;
      feverDayCount++;
    } else {
      normalMeals += count;
      normalDayCount++;
    }
  }

  if (feverDayCount === 0 || normalDayCount < 3) return null;

  const avgFever = feverMeals / feverDayCount;
  const avgNormal = normalMeals / normalDayCount;

  if (avgNormal > 0 && avgFever / avgNormal < 0.7) {
    return {
      id: nextId(),
      type: "info",
      icon: "temperature-half",
      title: "Fièvre et appétit",
      message: `Quand ${name} a de la fièvre, son appétit diminue naturellement. C'est normal — privilégiez l'hydratation.`,
      accentColor: TIP_CATEGORY_COLORS.sante,
      priority: 2,
      category: "sante",
    };
  }

  return null;
}

// ============================================
// MAIN GENERATOR
// ============================================

/**
 * Generate cross-data correlation insights.
 * Requires at least 30 days of data for meaningful analysis.
 */
export function generateCorrelations(params: CorrelationParams): Insight[] {
  const { events, babyName, now = new Date() } = params;

  corrCounter = 0;

  // Normalize dates
  const normalized = events.map((e) => ({
    ...e,
    date: e.date instanceof Date ? e.date : new Date(e.date),
    heureDebut:
      e.heureDebut instanceof Date ? e.heureDebut : e.heureDebut ? new Date(e.heureDebut) : undefined,
    heureFin:
      e.heureFin instanceof Date ? e.heureFin : e.heureFin ? new Date(e.heureFin) : undefined,
  }));

  const insights: Insight[] = [];

  const mealSleep = mealBeforeSleepCorrelation(normalized, babyName, now);
  if (mealSleep) insights.push(mealSleep);

  const bathSleep = bathBeforeSleepCorrelation(normalized, babyName, now);
  if (bathSleep) insights.push(bathSleep);

  const actSleep = activitySleepCorrelation(normalized, babyName, now);
  if (actSleep) insights.push(actSleep);

  const feverApp = feverAppetiteCorrelation(normalized, babyName, now);
  if (feverApp) insights.push(feverApp);

  return insights;
}
