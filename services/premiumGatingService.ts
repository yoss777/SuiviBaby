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
} as const;

/**
 * Premium n'est pas « illimité » : la voix a un coût par commande, et un
 * plafond affiché honnêtement vaut mieux qu'un plafond caché (décision
 * 2026-11-11). Doit rester égal à PREMIUM_DAILY_VOICE_LIMIT côté serveur
 * (functions/src/billing/quotas.js). Le partage est illimité pour tous.
 */
export const PREMIUM_LIMITS = {
  voiceCommandsPerDay: 50,
} as const;

// ============================================
// PAYWALL MESSAGES
// ============================================

// Seuls les déclencheurs adossés à une limite réellement appliquée existent :
// pas d'historique limité (rien ne l'applique), pas de partage limité (gratuit
// pour tous depuis le 2026-11-11), pas d'« insights IA » (non livré).
export type PaywallTrigger = "voice_limit" | "pdf_export_limit";

interface PaywallMessage {
  title: string;
  description: string;
  ctaText: string;
}

export const PAYWALL_MESSAGES: Record<PaywallTrigger, PaywallMessage> = {
  voice_limit: {
    title: "Commandes vocales épuisées",
    description: `Vous avez utilisé vos ${FREE_LIMITS.voiceCommandsPerDay} commandes vocales du jour. Avec Premium, vous pouvez aller jusqu'à ${PREMIUM_LIMITS.voiceCommandsPerDay} commandes par jour. La saisie manuelle reste disponible.`,
    ctaText: "Passer à Premium",
  },
  pdf_export_limit: {
    title: "Export PDF utilisé",
    description: "Votre export PDF gratuit a été utilisé. Le rapport PDF est réservé à Premium. L'export JSON de vos données reste gratuit.",
    ctaText: "Passer à Premium",
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
