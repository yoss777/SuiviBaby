// services/insightEngine.ts
// Data-driven insight generation from baby events

import type { Insight, TipCategory } from "@/types/content";
import {
  TIP_CATEGORY_COLORS,
} from "@/types/content";
import type { EventType } from "@/services/eventsService";
import type { BirthDateInput } from "@/utils/ageUtils";
import {
  formatWarningSigns,
  getTemperatureAlert,
  type TemperatureAlert,
  type TemperatureAlertLevel,
} from "@/utils/temperatureAlert";

// ============================================
// TYPES
// ============================================

interface EventData {
  id: string;
  type: EventType;
  date: Date;
  // Sommeil-specific
  quality?: "paisible" | "agite" | "mauvais";
  location?: string;
  isNap?: boolean;
  duree?: number; // minutes
  heureDebut?: Date;
  heureFin?: Date;
  // Alimentation-specific
  typeSolide?: string;
  nouveauAliment?: boolean;
  nomNouvelAliment?: string;
  reaction?: string;
  quantiteMl?: number;
  // Temperature
  valeur?: number;
  // Jalon
  jalonType?: string;
  titre?: string;
  // Generic
  note?: string;
}

interface InsightParams {
  events: EventData[];
  babyName: string;
  ageMonths: number;
  /** Date de naissance : permet d'adapter les alertes de température à l'âge. */
  birthDate?: BirthDateInput;
  now?: Date;
}

// ============================================
// QUALITY SCORE HELPERS
// ============================================

function qualityScore(q?: string): number {
  if (q === "paisible") return 3;
  if (q === "agite") return 2;
  if (q === "mauvais") return 1;
  return 2; // default
}

function daysAgo(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function filterByDays(events: EventData[], days: number, now: Date): EventData[] {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return events.filter((e) => e.date >= cutoff);
}

function filterByType(events: EventData[], type: EventType): EventData[] {
  return events.filter((e) => e.type === type);
}

// ============================================
// INSIGHT GENERATORS
// ============================================

let insightCounter = 0;
function nextId(): string {
  return `insight_${++insightCounter}_${Date.now()}`;
}

// --- ALIMENTATION ---

function alimentationInsights(
  events: EventData[],
  name: string,
  ageMonths: number,
  now: Date,
): Insight[] {
  const insights: Insight[] = [];
  const color = TIP_CATEGORY_COLORS.alimentation;

  // Events this week vs last week
  const thisWeek = filterByDays(events, 7, now);
  const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const lastWeekEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastWeek = events.filter(
    (e) => e.date >= lastWeekStart && e.date < lastWeekEnd,
  );

  const repasTypes: EventType[] = ["tetee", "biberon", "solide"];
  const thisWeekRepas = thisWeek.filter((e) => repasTypes.includes(e.type));
  const lastWeekRepas = lastWeek.filter((e) => repasTypes.includes(e.type));

  // Frequency drop
  if (lastWeekRepas.length > 5 && thisWeekRepas.length > 0) {
    const ratio = thisWeekRepas.length / lastWeekRepas.length;
    if (ratio < 0.7) {
      const pct = Math.round((1 - ratio) * 100);
      insights.push({
        id: nextId(),
        type: "warning",
        icon: "chart-line-down",
        title: "Baisse d'appétit",
        message: `Les repas de ${name} ont diminué de ${pct}% cette semaine par rapport à la semaine dernière.`,
        accentColor: color,
        priority: 2,
        category: "alimentation",
      });
    } else if (ratio > 1.2) {
      insights.push({
        id: nextId(),
        type: "positive",
        icon: "chart-line",
        title: "Bon appétit !",
        message: `${name} mange plus que la semaine dernière. Bonne dynamique !`,
        accentColor: color,
        priority: 4,
        category: "alimentation",
      });
    }
  }

  // New food introduction
  const recentSolides = filterByType(thisWeek, "solide");
  const newFoods = recentSolides.filter((e) => e.nouveauAliment);
  if (newFoods.length > 0) {
    const names = newFoods
      .map((e) => e.nomNouvelAliment)
      .filter(Boolean)
      .join(", ");
    insights.push({
      id: nextId(),
      type: "info",
      icon: "seedling",
      title: "Nouvelles découvertes",
      message: `${name} a découvert ${newFoods.length} nouvel${newFoods.length > 1 ? "les" : ""} aliment${newFoods.length > 1 ? "s" : ""} cette semaine${names ? ` : ${names}` : ""}. Continuez la diversification !`,
      accentColor: color,
      priority: 3,
      category: "alimentation",
    });
  }

  // Reaction alert
  const reactions = recentSolides.filter(
    (e) => e.reaction && e.reaction !== "aucune",
  );
  if (reactions.length > 0) {
    const foods = reactions
      .map((e) => e.nomNouvelAliment)
      .filter(Boolean)
      .join(", ");
    insights.push({
      id: nextId(),
      type: "warning",
      icon: "triangle-exclamation",
      title: "Réaction alimentaire",
      message: `${name} a eu ${reactions.length} réaction${reactions.length > 1 ? "s" : ""} cette semaine${foods ? ` (${foods})` : ""}. Surveillez et consultez si nécessaire.`,
      accentColor: TIP_CATEGORY_COLORS.sante,
      priority: 1,
      category: "alimentation",
    });
  }

  // Diversification age tip
  if (ageMonths >= 4 && ageMonths <= 6) {
    const hasSolides = events.some((e) => e.type === "solide");
    if (!hasSolides) {
      insights.push({
        id: nextId(),
        type: "info",
        icon: "bowl-food",
        title: "Diversification alimentaire",
        message: `À ${ageMonths} mois, ${name} peut commencer la diversification alimentaire. Parlez-en avec votre pédiatre.`,
        accentColor: color,
        priority: 2,
        category: "alimentation",
      });
    }
  }

  return insights;
}

// --- SOMMEIL ---

function sommeilInsights(
  events: EventData[],
  name: string,
  ageMonths: number,
  now: Date,
): Insight[] {
  const insights: Insight[] = [];
  const color = TIP_CATEGORY_COLORS.sommeil;

  const sommeils = filterByType(events, "sommeil");
  const recent3d = filterByDays(sommeils, 3, now);
  const recent7d = filterByDays(sommeils, 7, now);
  const prev7d = sommeils.filter((e) => {
    const d = daysAgo(e.date, now);
    return d >= 7 && d < 14;
  });

  // 3-day quality trend (refactored from SommeilChart)
  if (recent3d.length >= 3) {
    const avgQuality =
      recent3d.reduce((sum, s) => sum + qualityScore(s.quality), 0) /
      recent3d.length;

    if (avgQuality <= 1.5) {
      insights.push({
        id: nextId(),
        type: "warning",
        icon: "moon",
        title: "Sommeil agité",
        message: `Le sommeil de ${name} semble agité depuis quelques jours. Vérifiez la température de la chambre (18-20°C) et le bruit ambiant.`,
        accentColor: color,
        priority: 1,
        category: "sommeil",
      });
    } else if (avgQuality >= 2.7) {
      insights.push({
        id: nextId(),
        type: "positive",
        icon: "moon",
        title: "Bien dormi !",
        message: `${name} dort bien ces derniers jours. Continuez sur ce bon rythme !`,
        accentColor: color,
        priority: 4,
        category: "sommeil",
      });
    }
  }

  // Sleep duration trend (week vs previous week)
  if (recent7d.length >= 3 && prev7d.length >= 3) {
    const avgThis =
      recent7d.reduce((sum, s) => sum + (s.duree ?? 0), 0) / recent7d.length;
    const avgPrev =
      prev7d.reduce((sum, s) => sum + (s.duree ?? 0), 0) / prev7d.length;

    if (avgPrev > 0) {
      const ratio = avgThis / avgPrev;
      if (ratio < 0.8) {
        const pct = Math.round((1 - ratio) * 100);
        insights.push({
          id: nextId(),
          type: "warning",
          icon: "clock",
          title: "Sommeil en baisse",
          message: `${name} dort ${pct}% de moins que la semaine dernière. Une régression de sommeil est possible à cet âge.`,
          accentColor: color,
          priority: 2,
          category: "sommeil",
        });
      } else if (ratio > 1.15) {
        const pct = Math.round((ratio - 1) * 100);
        insights.push({
          id: nextId(),
          type: "positive",
          icon: "clock",
          title: "Plus de sommeil",
          message: `${name} dort ${pct}% de plus que la semaine dernière. Excellent !`,
          accentColor: color,
          priority: 4,
          category: "sommeil",
        });
      }
    }
  }

  // Nap transition hints by age
  if (ageMonths >= 6 && ageMonths <= 9) {
    const recentNaps = recent7d.filter((e) => e.isNap);
    const napsPerDay = recentNaps.length / 7;
    if (napsPerDay > 2.5) {
      insights.push({
        id: nextId(),
        type: "info",
        icon: "sun",
        title: "Transition siestes",
        message: `Autour de ${ageMonths} mois, beaucoup de bébés passent de 3 à 2 siestes par jour. ${name} fait encore ~${Math.round(napsPerDay)} siestes/jour.`,
        accentColor: color,
        priority: 3,
        category: "sommeil",
      });
    }
  }

  // Best sleep location insight
  if (recent7d.length >= 5) {
    const byLocation = new Map<string, { total: number; quality: number; count: number }>();
    for (const s of recent7d) {
      const loc = s.location ?? "autre";
      const entry = byLocation.get(loc) ?? { total: 0, quality: 0, count: 0 };
      entry.total += s.duree ?? 0;
      entry.quality += qualityScore(s.quality);
      entry.count += 1;
      byLocation.set(loc, entry);
    }

    let bestLoc = "";
    let bestScore = 0;
    for (const [loc, data] of byLocation) {
      if (data.count >= 2) {
        const score = data.quality / data.count;
        if (score > bestScore) {
          bestScore = score;
          bestLoc = loc;
        }
      }
    }

    // Santé : on ne met en avant que le lit de bébé. Aucun autre lieu
    // (cododo, poussette, voiture...) n'est jamais présenté comme « le
    // meilleur endroit ». Recommandations : lit à barreaux ou berceau, sur le
    // dos, espace de couchage vide (HAS, Santé publique France : prévention de
    // la mort inattendue du nourrisson).
    if (bestLoc === "lit" && bestScore >= 2.5) {
      insights.push({
        id: nextId(),
        type: "info",
        icon: "location-dot",
        title: "Meilleur endroit",
        message: `${name} dort le mieux dans son lit. Couchez toujours bébé sur le dos, dans son propre lit à barreaux ou berceau, avec un espace de couchage vide (ni oreiller, ni tour de lit, ni peluche).`,
        accentColor: color,
        priority: 3,
        category: "sommeil",
      });
    }

    // Siestes fréquentes hors lit (voiture, poussette, écharpe) : rappel de
    // couchage sûr. Seuil produit : au moins 3 siestes sur 7 jours.
    const offBedNaps = recent7d.filter(
      (s) => s.location === "voiture" || s.location === "poussette",
    ).length;
    if (offBedNaps >= OFF_BED_NAP_REMINDER_COUNT) {
      insights.push({
        id: nextId(),
        type: "warning",
        icon: "bed",
        title: "Couchage sûr",
        message: `${name} a fait ${offBedNaps} siestes en voiture ou en poussette cette semaine. Un siège auto, une poussette ou une écharpe ne remplacent pas le lit : dès que possible, recouchez bébé sur le dos dans son lit à barreaux ou berceau, espace de couchage vide. Ne le laissez pas dormir sans surveillance dans un siège auto à l'arrêt.`,
        accentColor: color,
        priority: 2,
        category: "sommeil",
      });
    }
  }

  return insights;
}

// --- SANTE ---

const OFF_BED_NAP_REMINDER_COUNT = 3;

const ALERT_SEVERITY: Record<TemperatureAlertLevel, number> = {
  fievre: 1,
  rapide: 2,
  hypothermie: 3,
  urgent: 4,
};

function santeInsights(
  events: EventData[],
  name: string,
  _ageMonths: number,
  now: Date,
  birthDate?: BirthDateInput,
): Insight[] {
  const insights: Insight[] = [];
  const color = TIP_CATEGORY_COLORS.sante;

  const recent7d = filterByDays(events, 7, now);

  // Température des 7 derniers jours : l'alerte dépend de l'âge de l'enfant
  // AU MOMENT de la mesure (utils/temperatureAlert.ts). On garde la plus grave.
  let worst: { alert: TemperatureAlert; valeur: number } | null = null;
  for (const e of filterByType(recent7d, "temperature")) {
    if (typeof e.valeur !== "number") continue;
    const alert = getTemperatureAlert({
      valeur: e.valeur,
      birthDate,
      measuredAt: e.date,
    });
    if (!alert) continue;
    const better =
      !worst ||
      ALERT_SEVERITY[alert.level] > ALERT_SEVERITY[worst.alert.level] ||
      (ALERT_SEVERITY[alert.level] === ALERT_SEVERITY[worst.alert.level] &&
        Math.abs(e.valeur - 37) > Math.abs(worst.valeur - 37));
    if (better) worst = { alert, valeur: e.valeur };
  }
  if (worst) {
    const { alert } = worst;
    insights.push({
      id: nextId(),
      type: "warning",
      icon: alert.level === "hypothermie" ? "temperature-low" : "temperature-high",
      title:
        alert.level === "hypothermie" ? "Température basse détectée" : "Fièvre détectée",
      message: `${name} : ${alert.message} ${formatWarningSigns(alert.signs)}`,
      accentColor: color,
      priority: alert.dismissible ? 1 : 0,
      category: "sante",
      ...(alert.dismissible ? {} : { dismissible: false }),
    });
  }

  // Recent vaccination
  const vaccins = filterByType(recent7d, "vaccin");
  if (vaccins.length > 0) {
    const daysSince = daysAgo(vaccins[vaccins.length - 1].date, now);
    if (daysSince <= 3) {
      insights.push({
        id: nextId(),
        type: "info",
        icon: "syringe",
        title: "Post-vaccination",
        message: `${name} a été vacciné(e) il y a ${daysSince} jour${daysSince > 1 ? "s" : ""}. Si de la fièvre ou des signes inhabituels apparaissent, consultez un médecin ou appelez le 15 en cas de doute.`,
        accentColor: color,
        priority: 2,
        category: "sante",
      });
    }
  }

  // Vitamin check (no vitamin in 3+ days)
  const vitamines = filterByType(events, "vitamine");
  const recentVitamines = filterByDays(vitamines, 3, now);
  if (vitamines.length > 0 && recentVitamines.length === 0) {
    const lastVit = vitamines.sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    )[0];
    const daysSinceLast = daysAgo(lastVit.date, now);
    if (daysSinceLast >= 3 && daysSinceLast <= 7) {
      insights.push({
        id: nextId(),
        type: "info",
        icon: "pills",
        title: "Vitamines",
        message: `La dernière vitamine de ${name} date de ${daysSinceLast} jours. Pensez à la vitamine D quotidienne.`,
        accentColor: color,
        priority: 3,
        category: "sante",
      });
    }
  }

  // Recurring symptoms
  const symptomes = filterByType(recent7d, "symptome");
  if (symptomes.length >= 3) {
    insights.push({
      id: nextId(),
      type: "warning",
      icon: "virus",
      title: "Symptômes récurrents",
      message: `${name} a eu ${symptomes.length} symptômes enregistrés cette semaine. Si les symptômes persistent, consultez votre pédiatre.`,
      accentColor: color,
      priority: 1,
      category: "sante",
    });
  }

  return insights;
}

// --- DEVELOPPEMENT ---

function developpementInsights(
  events: EventData[],
  name: string,
  ageMonths: number,
  now: Date,
): Insight[] {
  const insights: Insight[] = [];
  const color = TIP_CATEGORY_COLORS.developpement;

  const recent7d = filterByDays(events, 7, now);

  // Recent milestone (exclude daily mood entries)
  const MILESTONE_JALON_TYPES = new Set(["dent", "pas", "sourire", "mot", "photo", "autre"]);
  const jalons = filterByType(recent7d, "jalon").filter(
    (e) => e.jalonType && MILESTONE_JALON_TYPES.has(e.jalonType),
  );
  if (jalons.length > 0) {
    const lastJalon = jalons[jalons.length - 1];
    const label = lastJalon.titre || lastJalon.jalonType || "nouveau jalon";
    insights.push({
      id: nextId(),
      type: "positive",
      icon: "star",
      title: "Bravo !",
      message: `${name} a franchi une étape : ${label}. Chaque progrès compte !`,
      accentColor: color,
      priority: 3,
      category: "developpement",
    });
  }

  // Activity diversity
  const activites = filterByType(recent7d, "activite");
  if (activites.length >= 5) {
    insights.push({
      id: nextId(),
      type: "positive",
      icon: "puzzle-piece",
      title: "Semaine active",
      message: `${name} a eu ${activites.length} activités d'éveil cette semaine. La stimulation est essentielle à cet âge !`,
      accentColor: color,
      priority: 4,
      category: "developpement",
    });
  } else if (activites.length === 0 && ageMonths >= 2) {
    insights.push({
      id: nextId(),
      type: "info",
      icon: "puzzle-piece",
      title: "Activités d'éveil",
      message: `Pas d'activités enregistrées cette semaine. À ${ageMonths} mois, ${name} bénéficierait de moments d'éveil variés.`,
      accentColor: color,
      priority: 3,
      category: "developpement",
    });
  }

  return insights;
}

// ============================================
// MAIN GENERATOR
// ============================================

/**
 * Generate all insights from baby events.
 * Returns sorted by priority (1=highest).
 */
export function generateInsights(params: InsightParams): Insight[] {
  const { events, babyName, ageMonths, birthDate, now = new Date() } = params;

  // Reset counter for consistent IDs
  insightCounter = 0;

  // Convert all dates to Date objects
  const normalizedEvents: EventData[] = events.map((e) => ({
    ...e,
    date: e.date instanceof Date ? e.date : new Date(e.date),
  }));

  const allInsights: Insight[] = [
    ...alimentationInsights(normalizedEvents, babyName, ageMonths, now),
    ...sommeilInsights(normalizedEvents, babyName, ageMonths, now),
    ...santeInsights(normalizedEvents, babyName, ageMonths, now, birthDate),
    ...developpementInsights(normalizedEvents, babyName, ageMonths, now),
  ];

  // Sort by priority (1 = highest priority)
  return allInsights.sort((a, b) => a.priority - b.priority);
}

/**
 * Get the top N most relevant insights
 */
export function getTopInsights(
  params: InsightParams,
  maxInsights = 3,
): Insight[] {
  return generateInsights(params).slice(0, maxInsights);
}
