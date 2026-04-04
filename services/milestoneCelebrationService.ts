// services/milestoneCelebrationService.ts
// Détecte et génère des célébrations automatiques (jalons) basées sur les données.
// Gratuit : milestones basiques (1 mois, 3 mois, 6 mois de suivi)
// Premium : capsule mensuelle, célébrations détaillées, partage

import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================
// TYPES
// ============================================

export interface MilestoneCelebration {
  id: string;
  type: MilestoneType;
  title: string;
  message: string;
  emoji: string;
  isPremium: boolean;
  /** Date à laquelle le milestone a été atteint */
  achievedAt: string;
}

export type MilestoneType =
  | "tracking_duration" // Durée de suivi (1 mois, 3 mois, 6 mois, 1 an)
  | "event_count" // Nombre d'événements (100e tétée, 500e événement)
  | "sleep_record" // Record de sommeil (première nuit de 6h+)
  | "growth" // Croissance (prise de poids OMS atteinte)
  | "first" // Premier (premier solide, premier mot, premier pas)
  | "streak"; // Série (7 jours consécutifs de suivi)

const CELEBRATED_KEY = "@suivibaby_celebrated_milestones";

// ============================================
// MILESTONE DETECTION
// ============================================

interface DetectionParams {
  /** Date de création du premier enfant */
  firstChildCreatedAt: Date;
  /** Nombre total d'événements */
  totalEventCount: number;
  /** Nombre de tétées/biberons */
  feedingCount: number;
  /** Plus longue nuit de sommeil en minutes */
  longestNightSleepMin: number;
  /** Nombre de jours consécutifs avec au moins 1 événement */
  currentStreak: number;
  /** Événements avec flag "premier" */
  firsts: Array<{ type: string; title: string; date: Date }>;
}

/**
 * Détecte les milestones atteints mais pas encore célébrés.
 */
export async function detectNewMilestones(
  params: DetectionParams
): Promise<MilestoneCelebration[]> {
  const celebrated = await getCelebratedIds();
  const now = new Date();
  const candidates: MilestoneCelebration[] = [];

  // Durée de suivi
  const daysSinceFirst = Math.floor(
    (now.getTime() - params.firstChildCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const durationMilestones = [
    { days: 30, label: "1 mois", emoji: "🎉" },
    { days: 90, label: "3 mois", emoji: "🌟" },
    { days: 180, label: "6 mois", emoji: "🏆" },
    { days: 365, label: "1 an", emoji: "🎂" },
  ];

  for (const m of durationMilestones) {
    const id = `tracking_${m.days}d`;
    if (daysSinceFirst >= m.days && !celebrated.has(id)) {
      candidates.push({
        id,
        type: "tracking_duration",
        title: `${m.label} de suivi !`,
        message: `Vous suivez votre bebe depuis ${m.label}. Bravo pour votre regularite !`,
        emoji: m.emoji,
        isPremium: false,
        achievedAt: now.toISOString(),
      });
    }
  }

  // Nombre d'événements
  const countMilestones = [
    { count: 100, label: "100 evenements" },
    { count: 500, label: "500 evenements" },
    { count: 1000, label: "1000 evenements" },
  ];

  for (const m of countMilestones) {
    const id = `events_${m.count}`;
    if (params.totalEventCount >= m.count && !celebrated.has(id)) {
      candidates.push({
        id,
        type: "event_count",
        title: `${m.label} enregistres !`,
        message: `Vous avez enregistre plus de ${m.count} evenements. Un suivi exemplaire !`,
        emoji: "📊",
        isPremium: false,
        achievedAt: now.toISOString(),
      });
    }
  }

  // 100e tétée/biberon
  const id100feed = "feedings_100";
  if (params.feedingCount >= 100 && !celebrated.has(id100feed)) {
    candidates.push({
      id: id100feed,
      type: "event_count",
      title: "100e repas enregistre !",
      message: "Un cap symbolique — chaque repas compte pour le suivi de votre bebe.",
      emoji: "🍼",
      isPremium: false,
      achievedAt: now.toISOString(),
    });
  }

  // Première nuit de 6h+
  const idSleep6h = "first_sleep_6h";
  if (params.longestNightSleepMin >= 360 && !celebrated.has(idSleep6h)) {
    candidates.push({
      id: idSleep6h,
      type: "sleep_record",
      title: "Premiere nuit de 6h+ !",
      message: "Votre bebe a dormi plus de 6 heures d'affilee. Une etape importante !",
      emoji: "🌙",
      isPremium: false,
      achievedAt: now.toISOString(),
    });
  }

  // Série de suivi
  const streakMilestones = [
    { days: 7, label: "7 jours" },
    { days: 30, label: "30 jours" },
  ];

  for (const m of streakMilestones) {
    const id = `streak_${m.days}d`;
    if (params.currentStreak >= m.days && !celebrated.has(id)) {
      candidates.push({
        id,
        type: "streak",
        title: `${m.label} consecutifs !`,
        message: `Vous enregistrez des evenements depuis ${m.label} sans interruption. Impressionnant !`,
        emoji: "🔥",
        isPremium: true, // Premium — gamification
        achievedAt: now.toISOString(),
      });
    }
  }

  return candidates;
}

// ============================================
// CELEBRATED IDS PERSISTENCE
// ============================================

async function getCelebratedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(CELEBRATED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Marque un milestone comme célébré (ne sera plus proposé).
 */
export async function markMilestoneCelebrated(id: string): Promise<void> {
  const celebrated = await getCelebratedIds();
  celebrated.add(id);
  await AsyncStorage.setItem(CELEBRATED_KEY, JSON.stringify([...celebrated]));
}

/**
 * Marque plusieurs milestones comme célébrés.
 */
export async function markMilestonesCelebrated(ids: string[]): Promise<void> {
  const celebrated = await getCelebratedIds();
  for (const id of ids) celebrated.add(id);
  await AsyncStorage.setItem(CELEBRATED_KEY, JSON.stringify([...celebrated]));
}
