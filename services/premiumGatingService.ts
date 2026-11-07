// services/premiumGatingService.ts
// Source de vérité UI pour les limites gratuites statiques et les messages de paywall.
// Les compteurs/quota runtime voice/export PDF/sharing sont désormais gérés côté serveur
// via premiumUsageService + Cloud Functions.

// ============================================
// TIER LIMITS
// ============================================

export const FREE_LIMITS = {
  /** Nombre max de commandes vocales par jour */
  voiceCommandsPerDay: 3,
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
  | "pdf_export_limit"
  | "history_limit"
  | "sharing_limit"
  | "ai_insights";
// Pas de déclencheur « statistiques avancées » : statistiques et courbes OMS
// sont gratuites (décision Q7, 2026-11-07).

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
  pdf_export_limit: {
    title: "Export PDF utilisé",
    description: "Votre export PDF gratuit a été utilisé. Le rapport PDF est réservé à Premium. L'export JSON de vos données reste gratuit.",
    ctaText: "Passer à Premium",
  },
  history_limit: {
    title: "Historique limité à 90 jours",
    description: "Accédez à tout l'historique de votre bébé avec Premium. Retrouvez les données depuis la naissance.",
    ctaText: "Voir tout l'historique",
  },
  sharing_limit: {
    title: "Limite de partage atteinte",
    description: "Le plan gratuit permet d'inviter 2 personnes. Passez à Premium pour un partage illimité.",
    ctaText: "Passer à Premium",
  },
  ai_insights: {
    title: "Insights IA",
    description: "Recevez des analyses personnalisées : \"Bébé dort mieux quand couché avant 19h30\".",
    ctaText: "Activer les insights IA",
  },
};

// ============================================
// Décision d'accès à l'export PDF
// ============================================

export type PdfExportDecision =
  | "allow" // accès Premium (ou Famille, ancien produit)/grandfathered : export illimité
  | "allow_trial" // export d'essai gratuit : quota à consommer après succès
  | "paywall" // essai épuisé
  | "error"; // quota illisible : ne rien générer

/**
 * Décide si le rapport PDF peut être généré.
 * `quota` vaut null quand le statut serveur n'a pas pu être lu.
 */
export function decidePdfExportAccess(
  hasAccess: boolean,
  quota: { allowed?: boolean; remaining?: number | null } | null | undefined,
): PdfExportDecision {
  if (hasAccess) return "allow";
  if (!quota || typeof quota !== "object") return "error";
  if (quota.allowed === true && (quota.remaining ?? 0) > 0) return "allow_trial";
  return "paywall";
}
