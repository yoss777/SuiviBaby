// services/milestoneCelebrationService.ts
// Détecte et génère des célébrations automatiques (jalons) basées sur les données.
// Gratuit : durée de suivi, nombre d'événements/repas, première nuit de 6 h+
// Premium : séries de jours consécutifs (gamification)
//
// Règles d'affichage (accueil) : au plus UNE célébration par jour et par enfant,
// jamais rejouée (marquée célébrée à l'affichage), une seule passe de détection
// par enfant et par jour (donc au plus 3 lectures légères par jour).
//
// Jalons actifs : tracking_* (durée depuis le premier événement), events_*
// (comptage serveur), feedings_100 (comptage serveur tétées + biberons),
// first_sleep_6h (nuit de la semaine), streak_7d (Premium, série sur 8 jours).
// Inactifs, faute de donnée peu coûteuse : streak_30d (la fenêtre locale ne
// couvre que 8 jours), types "growth" et "first" (aucune détection).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { countChildEvents, getFirstEventDate } from "@/services/eventsRepository";

// ============================================
// TYPES
// ============================================

export interface MilestoneCelebration {
  id: string;
  type: MilestoneType;
  title: string;
  message: string;
  emoji: string;
  /** Fin de phrase pour le partage, après le prénom : « a 1 mois de suivi ». Aucune donnée de santé. */
  sharePhrase: string;
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
const LAST_SHOWN_KEY = "@suivibaby_milestone_last_shown";
const LAST_CHECKED_KEY = "@suivibaby_milestone_last_checked";

/** Séparateur enfant/jalon dans les ids stockés (jamais présent dans un id Firestore). */
const SCOPE_SEP = ":";

// ============================================
// MILESTONE DETECTION
// ============================================

export interface DetectionParams {
  /** Enfant concerné : les jalons célébrés sont propres à chaque enfant. */
  childId: string;
  /** Accès Premium (checkFeatureAccess) : sans lui, les jalons Premium sont filtrés. */
  premium: boolean;
  /** Date du premier événement de l'enfant (début du suivi). Inconnue : pas de jalon de durée. */
  trackingStart?: Date;
  /** Nombre total d'événements */
  totalEventCount: number;
  /** Nombre de tétées/biberons */
  feedingCount: number;
  /** Plus longue nuit de sommeil en minutes */
  longestNightSleepMin: number;
  /** Nombre de jours consécutifs avec au moins 1 événement */
  currentStreak: number;
  /** Réservé : aucune détection "premier" pour l'instant. */
  firsts?: Array<{ type: string; title: string; date: Date }>;
  /** Horloge injectable (tests). */
  now?: Date;
}

/**
 * Détecte les milestones atteints mais pas encore célébrés pour cet enfant.
 */
export async function detectNewMilestones(
  params: DetectionParams
): Promise<MilestoneCelebration[]> {
  const celebrated = await getCelebratedIds(params.childId);
  const now = params.now ?? new Date();
  const candidates: MilestoneCelebration[] = [];

  // Durée de suivi
  const daysSinceFirst = params.trackingStart
    ? Math.floor((now.getTime() - params.trackingStart.getTime()) / (1000 * 60 * 60 * 24))
    : -1;

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
        message: `Vous suivez votre bébé depuis ${m.label}. Bravo pour votre régularité !`,
        emoji: m.emoji,
        sharePhrase: `a ${m.label} de suivi`,
        isPremium: false,
        achievedAt: now.toISOString(),
      });
    }
  }

  // Nombre d'événements
  const countMilestones = [
    { count: 100, label: "100 événements" },
    { count: 500, label: "500 événements" },
    { count: 1000, label: "1000 événements" },
  ];

  for (const m of countMilestones) {
    const id = `events_${m.count}`;
    if (params.totalEventCount >= m.count && !celebrated.has(id)) {
      candidates.push({
        id,
        type: "event_count",
        title: `${m.label} enregistrés !`,
        message: `Vous avez enregistré plus de ${m.count} événements. Un suivi exemplaire !`,
        emoji: "📊",
        sharePhrase: `a ${m.count} événements enregistrés`,
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
      title: "100e repas enregistré !",
      message: "Un cap symbolique — chaque repas compte pour le suivi de votre bébé.",
      emoji: "🍼",
      sharePhrase: "a 100 repas enregistrés",
      isPremium: false,
      achievedAt: now.toISOString(),
    });
  }

  // Nuit de 6h+ (célébrée une fois). La détection ne voit que ~8 jours
  // d'historique : le texte ne dit pas « première » pour rester toujours vrai.
  const idSleep6h = "first_sleep_6h";
  if (params.longestNightSleepMin >= 360 && !celebrated.has(idSleep6h)) {
    candidates.push({
      id: idSleep6h,
      type: "sleep_record",
      title: "Une nuit de 6 h ou plus !",
      message: "Votre bébé a dormi plus de 6 heures d'affilée. Une étape importante !",
      emoji: "🌙",
      sharePhrase: "a fait une belle et longue nuit",
      isPremium: false,
      achievedAt: now.toISOString(),
    });
  }

  // Série de suivi
  const streakMilestones = [
    { days: 7, label: "7 jours" },
    // 30 jours : inactif (la fenêtre locale ne couvre que 8 jours).
    { days: 30, label: "30 jours" },
  ];

  for (const m of streakMilestones) {
    if (!params.premium) break;
    const id = `streak_${m.days}d`;
    if (params.currentStreak >= m.days && !celebrated.has(id)) {
      candidates.push({
        id,
        type: "streak",
        title: `${m.label} consécutifs !`,
        message: `Vous enregistrez des événements depuis ${m.label} sans interruption. Impressionnant !`,
        emoji: "🔥",
        sharePhrase: `a ${m.label} de suivi consécutifs`,
        isPremium: true, // Premium — gamification
        achievedAt: now.toISOString(),
      });
    }
  }

  return candidates;
}

/** Texte de partage (français) : « Léa a 1 mois de suivi sur SuiviBaby 🎉 ». */
export function buildShareMessage(milestone: MilestoneCelebration, childName?: string): string {
  const who = childName?.trim() || "Mon bébé";
  return `${who} ${milestone.sharePhrase} sur SuiviBaby ${milestone.emoji}`;
}

// ============================================
// SÉLECTION : UNE SEULE CÉLÉBRATION
// ============================================

export interface MilestoneSelection {
  milestone: MilestoneCelebration;
  /** Seuils inférieurs de la même famille : marqués célébrés sans être affichés. */
  supersededIds: string[];
}

// Ordre de priorité des familles (la durée de suivi d'abord).
const FAMILY_ORDER = ["tracking", "events", "feedings", "first_sleep_6h", "streak"];

function familyOf(id: string): string {
  const prefix = id.split("_")[0];
  return FAMILY_ORDER.includes(prefix) ? prefix : id;
}

/**
 * Choisit UN jalon parmi les candidats. Au sein d'une famille, le plus haut
 * seuil gagne (les candidats sortent par seuil croissant) et les plus bas sont
 * considérés comme dépassés : un parent à 400 jours de suivi n'a pas à revoir
 * « 1 mois » puis « 3 mois » les jours suivants.
 */
export function selectMilestoneToShow(
  candidates: MilestoneCelebration[]
): MilestoneSelection | null {
  if (candidates.length === 0) return null;
  const best = new Map<string, MilestoneCelebration>();
  const all = new Map<string, MilestoneCelebration[]>();
  for (const c of candidates) {
    const fam = familyOf(c.id);
    best.set(fam, c);
    all.set(fam, [...(all.get(fam) ?? []), c]);
  }
  const rank = (fam: string) => {
    const i = FAMILY_ORDER.indexOf(fam);
    return i === -1 ? FAMILY_ORDER.length : i;
  };
  const families = [...best.keys()].sort((a, b) => rank(a) - rank(b));
  const fam = families[0];
  const milestone = best.get(fam)!;
  const supersededIds = (all.get(fam) ?? []).filter((c) => c.id !== milestone.id).map((c) => c.id);
  return { milestone, supersededIds };
}

// ============================================
// DONNÉES LOCALES (aucune lecture)
// ============================================

interface LocalEvent {
  type?: string;
  date?: unknown;
  isNap?: boolean;
  duree?: number;
  heureDebut?: unknown;
  heureFin?: unknown;
}

const toTime = (v: unknown): number => {
  if (v instanceof Date) return v.getTime();
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof v === "string" || typeof v === "number") return new Date(v).getTime();
  return NaN;
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Jours consécutifs avec au moins un événement, en finissant aujourd'hui, ou
 * hier si la journée en cours est encore vide.
 */
export function computeStreak(events: readonly LocalEvent[], now: Date = new Date()): number {
  const days = new Set<string>();
  for (const e of events) {
    const t = toTime(e.date);
    if (!Number.isNaN(t)) days.add(dayKey(new Date(t)));
  }
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Plus longue nuit (hors sieste, hors sommeil en cours) en minutes, 0 sans donnée. */
export function computeLongestNightSleepMin(events: readonly LocalEvent[]): number {
  let longest = 0;
  for (const e of events) {
    if (e.type !== "sommeil" || e.isNap) continue;
    const start = toTime(e.heureDebut);
    const end = toTime(e.heureFin);
    let minutes = 0;
    if (!Number.isNaN(start) && !Number.isNaN(end)) minutes = Math.round((end - start) / 60000);
    else if (!e.heureDebut && typeof e.duree === "number") minutes = e.duree;
    if (Number.isFinite(minutes) && minutes > longest) longest = minutes;
  }
  return longest;
}

// ============================================
// LECTURES LÉGÈRES (une passe par enfant et par jour)
// ============================================

/** Début du suivi + comptages serveur : 1 lecture + 2 agrégations au plus. */
async function loadServerStats(childId: string) {
  const trackingStart = await getFirstEventDate(childId);
  if (!trackingStart) return null;
  const [totalEventCount, feedingCount] = await Promise.all([
    countChildEvents(childId),
    countChildEvents(childId, ["tetee", "biberon"]),
  ]);
  return { trackingStart, totalEventCount, feedingCount };
}

// ============================================
// ORCHESTRATION QUOTIDIENNE
// ============================================

async function readDayMap(key: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeDayStamp(key: string, childId: string, now: Date): Promise<void> {
  const map = await readDayMap(key);
  map[childId] = dayKey(now);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Mémorisation impossible : au pire une relecture au prochain passage.
  }
}

export interface FindMilestoneParams {
  childId: string;
  premium: boolean;
  /** Valeurs calculées depuis les événements déjà chargés sur l'accueil. */
  local: { currentStreak: number; longestNightSleepMin: number };
  now?: Date;
}

/**
 * Une passe par enfant et par jour. Renvoie le jalon à fêter, ou null :
 * déjà fêté aujourd'hui, déjà vérifié aujourd'hui, rien à fêter, ou lecture
 * impossible (hors ligne : rien n'est mémorisé, nouvel essai à la prochaine
 * ouverture). Ne marque rien comme célébré : voir `commitMilestoneShown`.
 */
export async function findMilestoneForToday(
  params: FindMilestoneParams
): Promise<MilestoneSelection | null> {
  const now = params.now ?? new Date();
  const today = dayKey(now);
  const [shown, checked] = await Promise.all([
    readDayMap(LAST_SHOWN_KEY),
    readDayMap(LAST_CHECKED_KEY),
  ]);
  if (shown[params.childId] === today || checked[params.childId] === today) return null;

  let stats: Awaited<ReturnType<typeof loadServerStats>>;
  try {
    stats = await loadServerStats(params.childId);
  } catch {
    return null;
  }

  const candidates = await detectNewMilestones({
    childId: params.childId,
    premium: params.premium,
    trackingStart: stats?.trackingStart,
    totalEventCount: stats?.totalEventCount ?? 0,
    feedingCount: stats?.feedingCount ?? 0,
    longestNightSleepMin: params.local.longestNightSleepMin,
    currentStreak: params.local.currentStreak,
    now,
  });
  const selection = selectMilestoneToShow(candidates);
  if (!selection) await writeDayStamp(LAST_CHECKED_KEY, params.childId, now);
  return selection;
}

/**
 * À appeler au moment d'afficher : marque le jalon (et ses seuils dépassés)
 * comme célébré, même si la modale est fermée sans partager, et enregistre la
 * date du jour pour cet enfant.
 */
export async function commitMilestoneShown(
  childId: string,
  selection: MilestoneSelection,
  now: Date = new Date()
): Promise<void> {
  await markMilestonesCelebrated(childId, [selection.milestone.id, ...selection.supersededIds]);
  await writeDayStamp(LAST_SHOWN_KEY, childId, now);
}

// ============================================
// CELEBRATED IDS PERSISTENCE
// ============================================

// Les ids sont stockés `${childId}:${id}` dans une seule liste. Anciens ids
// sans préfixe (jamais affichés jusqu'ici) : rattachés au premier enfant
// évalué, puis réécrits au nouveau format.
async function readStoredIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(CELEBRATED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function getCelebratedIds(childId: string): Promise<Set<string>> {
  let stored = await readStoredIds();
  const legacy = stored.filter((x) => !x.includes(SCOPE_SEP));
  if (legacy.length > 0) {
    stored = [
      ...stored.filter((x) => x.includes(SCOPE_SEP)),
      ...legacy.map((id) => `${childId}${SCOPE_SEP}${id}`),
    ];
    try {
      await AsyncStorage.setItem(CELEBRATED_KEY, JSON.stringify(stored));
    } catch {
      // Migration relancée au prochain appel.
    }
  }
  const prefix = `${childId}${SCOPE_SEP}`;
  return new Set(stored.filter((x) => x.startsWith(prefix)).map((x) => x.slice(prefix.length)));
}

/**
 * Marque un milestone comme célébré pour cet enfant (ne sera plus proposé).
 */
export async function markMilestoneCelebrated(childId: string, id: string): Promise<void> {
  await markMilestonesCelebrated(childId, [id]);
}

/**
 * Marque plusieurs milestones comme célébrés pour cet enfant.
 */
export async function markMilestonesCelebrated(childId: string, ids: string[]): Promise<void> {
  // Passe par getCelebratedIds pour migrer d'abord les anciens ids.
  await getCelebratedIds(childId);
  const stored = new Set(await readStoredIds());
  for (const id of ids) stored.add(`${childId}${SCOPE_SEP}${id}`);
  await AsyncStorage.setItem(CELEBRATED_KEY, JSON.stringify([...stored]));
}
