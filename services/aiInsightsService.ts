// services/aiInsightsService.ts
// Service d'insights IA Premium — prédictions, résumé quotidien, analyse avancée.
// Utilise une Cloud Function comme proxy vers Claude Haiku (clé API côté serveur).
// Les données sont anonymisées avant envoi via dataAnonymizationService.

import { functions } from "@/config/firebase";
import { httpsCallable } from "firebase/functions";
import { captureServiceError } from "@/utils/errorReporting";
import { anonymizeChildData, anonymizeEvent, stripPII } from "@/services/dataAnonymizationService";
import type { Baby } from "@/types/baby";
import type { Insight, TipCategory } from "@/types/content";
import { TIP_CATEGORY_COLORS } from "@/types/content";

// ============================================
// TYPES
// ============================================

export interface PredictionResult {
  type: "feeding" | "sleep" | "diaper";
  estimatedTime: string; // "dans ~45min" ou "vers 14h30"
  confidence: "low" | "medium" | "high";
  basedOn: string; // "Basé sur les 7 derniers jours"
}

export interface DailySummary {
  title: string;
  highlights: string[];
  concerns: string[];
  suggestion: string;
}

interface AiInsightRequest {
  child: ReturnType<typeof anonymizeChildData>;
  events: ReturnType<typeof anonymizeEvent>[];
  requestType: "predictions" | "daily_summary" | "advanced_insight";
  context?: string;
}

interface AiInsightResponse {
  predictions?: PredictionResult[];
  summary?: DailySummary;
  insight?: { title: string; message: string; category: TipCategory };
}

// ============================================
// CLOUD FUNCTION CALL
// ============================================

const generateAiInsight = httpsCallable<AiInsightRequest, AiInsightResponse>(
  functions,
  "generateAiInsight"
);

// ============================================
// PREDICTIONS
// ============================================

/**
 * Prédit la prochaine tétée/biberon basée sur les patterns récents.
 * Calcul local (pas d'appel LLM) — rapide et gratuit en compute.
 */
export function predictNextFeeding(events: Array<{
  type: string;
  timestamp: any;
}>): PredictionResult | null {
  const feedings = events
    .filter((e) => e.type === "tetee" || e.type === "biberon")
    .map((e) => {
      const ts = e.timestamp?.toDate?.() ?? new Date(e.timestamp);
      return ts.getTime();
    })
    .sort((a, b) => b - a) // Plus récent d'abord
    .slice(0, 14); // 14 dernières tétées

  if (feedings.length < 3) return null;

  // Calculer l'intervalle moyen entre les tétées
  const intervals: number[] = [];
  for (let i = 0; i < feedings.length - 1; i++) {
    intervals.push(feedings[i] - feedings[i + 1]);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const stdDev = Math.sqrt(
    intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
  );

  // Confiance basée sur la variance
  const cv = stdDev / avgInterval; // coefficient de variation
  const confidence: PredictionResult["confidence"] =
    cv < 0.2 ? "high" : cv < 0.4 ? "medium" : "low";

  const lastFeeding = feedings[0];
  const nextEstimated = new Date(lastFeeding + avgInterval);
  const now = new Date();

  if (nextEstimated.getTime() < now.getTime()) {
    // Déjà en retard
    return {
      type: "feeding",
      estimatedTime: "bientot (en retard sur le rythme habituel)",
      confidence,
      basedOn: `Base sur les ${feedings.length} derniers repas`,
    };
  }

  const diffMin = Math.round((nextEstimated.getTime() - now.getTime()) / 60000);

  let estimatedTime: string;
  if (diffMin < 60) {
    estimatedTime = `dans ~${diffMin}min`;
  } else {
    estimatedTime = `vers ${nextEstimated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  return {
    type: "feeding",
    estimatedTime,
    confidence,
    basedOn: `Base sur les ${feedings.length} derniers repas`,
  };
}

/**
 * Prédit la prochaine sieste basée sur les patterns de sommeil.
 */
export function predictNextSleep(events: Array<{
  type: string;
  timestamp: any;
  isNap?: boolean;
}>): PredictionResult | null {
  const naps = events
    .filter((e) => (e.type === "sommeil" || e.type === "sieste") && e.isNap !== false)
    .map((e) => {
      const ts = e.timestamp?.toDate?.() ?? new Date(e.timestamp);
      return ts.getTime();
    })
    .sort((a, b) => b - a)
    .slice(0, 10);

  if (naps.length < 3) return null;

  const intervals: number[] = [];
  for (let i = 0; i < naps.length - 1; i++) {
    intervals.push(naps[i] - naps[i + 1]);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const stdDev = Math.sqrt(
    intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
  );

  const cv = stdDev / avgInterval;
  const confidence: PredictionResult["confidence"] =
    cv < 0.25 ? "high" : cv < 0.45 ? "medium" : "low";

  const lastNap = naps[0];
  const nextEstimated = new Date(lastNap + avgInterval);
  const now = new Date();

  if (nextEstimated.getTime() < now.getTime()) {
    return {
      type: "sleep",
      estimatedTime: "bientot",
      confidence,
      basedOn: `Base sur les ${naps.length} dernieres siestes`,
    };
  }

  const diffMin = Math.round((nextEstimated.getTime() - now.getTime()) / 60000);
  const estimatedTime = diffMin < 60
    ? `dans ~${diffMin}min`
    : `vers ${nextEstimated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

  return {
    type: "sleep",
    estimatedTime,
    confidence,
    basedOn: `Base sur les ${naps.length} dernieres siestes`,
  };
}

// ============================================
// DAILY SUMMARY (local, no LLM)
// ============================================

/**
 * Génère un résumé de la journée à partir des événements.
 * Calcul local — pas besoin de LLM pour les stats de base.
 */
export function generateDailySummary(
  events: Array<{ type: string; timestamp: any; note?: string }>,
  babyName: string
): DailySummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayEvents = events.filter((e) => {
    const ts = e.timestamp?.toDate?.() ?? new Date(e.timestamp);
    return ts >= today;
  });

  const counts: Record<string, number> = {};
  for (const e of todayEvents) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }

  const highlights: string[] = [];
  const concerns: string[] = [];

  // Alimentation
  const totalRepas = (counts["tetee"] || 0) + (counts["biberon"] || 0) + (counts["solide"] || 0);
  if (totalRepas > 0) highlights.push(`${totalRepas} repas enregistre(s)`);
  if (totalRepas === 0 && today.getHours() > 12) concerns.push("Aucun repas enregistre aujourd'hui");

  // Sommeil
  const totalSommeil = (counts["sommeil"] || 0);
  if (totalSommeil > 0) highlights.push(`${totalSommeil} sieste(s)`);

  // Couches
  const totalCouches = (counts["miction"] || 0) + (counts["selle"] || 0);
  if (totalCouches > 0) highlights.push(`${totalCouches} change(s)`);
  if (totalCouches === 0 && today.getHours() > 14) concerns.push("Peu de changes aujourd'hui — verifier l'hydratation");

  // Température
  if (counts["temperature"]) concerns.push("Temperature enregistree — surveiller l'evolution");

  const title = concerns.length > 0
    ? `Journee de ${babyName} — point d'attention`
    : `Belle journee pour ${babyName} !`;

  const suggestion = concerns.length > 0
    ? "Consultez les details pour plus d'informations."
    : totalRepas > 4
      ? `${babyName} mange bien aujourd'hui !`
      : "Continuez a enregistrer les evenements pour un suivi complet.";

  return { title, highlights, concerns, suggestion };
}

// ============================================
// AI-ENHANCED INSIGHTS (via Cloud Function)
// ============================================

/**
 * Génère un insight enrichi par IA (Claude Haiku via CF).
 * Données anonymisées avant envoi.
 * Premium only.
 */
export async function generateAiEnhancedInsight(
  child: Baby,
  events: Array<{ type: string; timestamp: any; details?: Record<string, unknown>; childId?: string; userId?: string; note?: string }>,
  knownNames: string[] = []
): Promise<Insight | null> {
  try {
    const anonymizedChild = anonymizeChildData(child);
    const anonymizedEvents = events.slice(0, 50).map((e) => anonymizeEvent(e));

    const response = await generateAiInsight({
      child: anonymizedChild,
      events: anonymizedEvents,
      requestType: "advanced_insight",
    });

    const data = response.data;
    if (!data.insight) return null;

    return {
      id: `ai_${Date.now()}`,
      type: "info",
      icon: "wand-magic-sparkles",
      title: data.insight.title,
      message: stripPII(data.insight.message, knownNames),
      accentColor: TIP_CATEGORY_COLORS[data.insight.category] || "#8b5cf6",
      priority: 1,
      category: data.insight.category,
    };
  } catch (error) {
    console.warn("[AI Insights] Failed to generate AI insight:", error);
    captureServiceError(error, { service: "aiInsights", operation: "generateAiEnhancedInsight" });
    return null;
  }
}

// ============================================
// PREDICTION → INSIGHT CONVERTER
// ============================================

/**
 * Convertit une prédiction en Insight affichable dans le dashboard.
 */
export function predictionToInsight(prediction: PredictionResult): Insight {
  const typeLabels = {
    feeding: { title: "Prochain repas", icon: "utensils", category: "alimentation" as TipCategory },
    sleep: { title: "Prochaine sieste", icon: "bed", category: "sommeil" as TipCategory },
    diaper: { title: "Prochain change", icon: "baby", category: "sante" as TipCategory },
  };

  const config = typeLabels[prediction.type];
  const confidenceEmoji = prediction.confidence === "high" ? "" : prediction.confidence === "medium" ? " (estimation)" : " (approximatif)";

  return {
    id: `pred_${prediction.type}_${Date.now()}`,
    type: "info",
    icon: config.icon,
    title: `${config.title} ${prediction.estimatedTime}`,
    message: `${prediction.basedOn}${confidenceEmoji}`,
    accentColor: TIP_CATEGORY_COLORS[config.category],
    priority: 2,
    category: config.category,
  };
}
