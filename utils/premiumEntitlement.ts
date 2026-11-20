// utils/premiumEntitlement.ts
// Droit à Premium, même règle que le serveur (functions/src/billing/
// subscription.js, isEntitledStatus) : sans elle, l'app montrait Premium à un
// abonné expiré tant que le document Firestore ou la copie locale (7 jours)
// gardaient tier « premium » (SUIVI_ACTIONS R2).

import type { PremiumTier, SubscriptionStatus } from "@/contexts/PremiumContext";

export interface SubscriptionSnapshot {
  tier: PremiumTier;
  status: SubscriptionStatus;
  /** Fin de la période payée (ISO). Absente pour l'achat à vie. */
  expiresAt?: string | null;
}

/**
 * Actif ou essai : Premium (le renouvellement est automatique ; le serveur
 * fait de même). Annulé ou incident de paiement : Premium jusqu'à la fin de
 * la période déjà payée. Expiré, ou date illisible : pas Premium.
 */
export function isEntitledSubscription(sub: SubscriptionSnapshot, nowMs: number = Date.now()): boolean {
  if (sub.tier !== "premium" && sub.tier !== "family") return false;
  if (sub.status === "active" || sub.status === "trial") return true;
  if (sub.status === "cancelled" || sub.status === "billing_issue") {
    const expiresMs = sub.expiresAt ? Date.parse(sub.expiresAt) : NaN;
    return Number.isFinite(expiresMs) && expiresMs > nowMs;
  }
  return false;
}

/** Niveau réellement accordé : « free » quand le droit est échu. */
export function entitledTier(sub: SubscriptionSnapshot, nowMs: number = Date.now()): PremiumTier {
  return isEntitledSubscription(sub, nowMs) ? sub.tier : "free";
}

/**
 * Délai avant que le droit tombe (annulé ou incident de paiement avec une
 * date future), pour réévaluer l'écran à ce moment-là. null sinon.
 */
export function msUntilEntitlementEnds(sub: SubscriptionSnapshot, nowMs: number = Date.now()): number | null {
  if (!isEntitledSubscription(sub, nowMs)) return null;
  if (sub.status !== "cancelled" && sub.status !== "billing_issue") return null;
  const expiresMs = Date.parse(sub.expiresAt as string);
  return Math.max(0, expiresMs - nowMs);
}
