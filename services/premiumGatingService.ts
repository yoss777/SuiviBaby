// services/premiumGatingService.ts
// Source de vérité UI pour les limites gratuites statiques et les messages de paywall.
// Les compteurs/quota runtime voice/export/sharing sont désormais gérés côté serveur
// via premiumUsageService + Cloud Functions.

// ============================================
// TIER LIMITS
// ============================================

export const FREE_LIMITS = {
  /** Nombre max de commandes vocales par jour */
  voiceCommandsPerDay: 3,
  /** Nombre total d'exports PDF (pas par mois — 1 seul gratuit) */
  totalPdfExports: 1,
  /** Nombre de jours d'historique accessible */
  historyDays: 90,
  /** Nombre max de co-parents invités */
  maxSharedUsers: 2,
} as const;

// ============================================
// HISTORY FILTER
// ============================================

/**
 * Retourne la date la plus ancienne autorisée pour les requêtes.
 * Free = 90 jours, Premium = pas de limite (retourne null).
 */
export function getHistoryCutoffDate(isPremium: boolean): Date | null {
  if (isPremium) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FREE_LIMITS.historyDays);
  return cutoff;
}

// ============================================
// PAYWALL MESSAGES
// ============================================

export type PaywallTrigger =
  | "voice_limit"
  | "export_limit"
  | "history_limit"
  | "sharing_limit"
  | "advanced_stats"
  | "ai_insights";

interface PaywallMessage {
  title: string;
  description: string;
  ctaText: string;
}

export const PAYWALL_MESSAGES: Record<PaywallTrigger, PaywallMessage> = {
  voice_limit: {
    title: "Commandes vocales épuisées",
    description: "Vous avez utilisé vos 3 commandes vocales du jour. Passez à Premium pour des commandes illimitées.",
    ctaText: "Débloquer la voix illimitée",
  },
  export_limit: {
    title: "Export PDF utilisé",
    description: "Votre export gratuit a été utilisé. Passez à Premium pour des exports illimités.",
    ctaText: "Exporter sans limites",
  },
  history_limit: {
    title: "Historique limité à 90 jours",
    description: "Accédez à tout l'historique de votre bébé avec Premium. Retrouvez les données depuis la naissance.",
    ctaText: "Voir tout l'historique",
  },
  sharing_limit: {
    title: "Limite de partage atteinte",
    description: "Le plan gratuit permet 2 co-parents. Passez à Famille pour inviter jusqu'à 5 personnes.",
    ctaText: "Inviter toute la famille",
  },
  advanced_stats: {
    title: "Statistiques avancées",
    description: "Découvrez les corrélations, tendances et courbes OMS avec Premium.",
    ctaText: "Voir les stats avancées",
  },
  ai_insights: {
    title: "Insights IA",
    description: "Recevez des analyses personnalisées : \"Bébé dort mieux quand couché avant 19h30\".",
    ctaText: "Activer les insights IA",
  },
};
