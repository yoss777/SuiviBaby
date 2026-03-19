// types/promo.ts
// Types for the promotional & referral system

import type { Timestamp } from "firebase/firestore";
import type { TipCategory } from "./content";

// ============================================
// PROMOTIONS
// ============================================

export type PromoType = "partner" | "premium" | "referral" | "seasonal";

export const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  partner: "Partenaire",
  premium: "Premium",
  referral: "Parrainage",
  seasonal: "Offre saisonnière",
};

export const PROMO_TYPE_ICONS: Record<PromoType, string> = {
  partner: "handshake",
  premium: "crown",
  referral: "user-plus",
  seasonal: "gift",
};

export interface Promotion {
  id: string;
  title: string;
  description: string;
  shortDescription?: string; // For banner display
  imageUrl?: string;
  promoCode?: string;
  deepLink: string; // URL to open
  type: PromoType;
  category?: TipCategory; // Link to baby category
  ageMinMonths?: number;
  ageMaxMonths?: number;
  priority: number; // 1=highest
  startDate: Timestamp | Date;
  endDate: Timestamp | Date;
  active: boolean;
  maxImpressions?: number;
  conditions?: string; // Legal conditions text
}

// ============================================
// USER PROMO STATE
// ============================================

export interface UserPromos {
  seenPromos: string[];
  dismissedPromos: string[];
  clickedPromos: string[];
  lastPromoShownAt?: Timestamp | Date;
  referralCode?: string;
  referralCount: number;
  referralRewards: string[]; // List of rewards claimed
}

export const DEFAULT_USER_PROMOS: UserPromos = {
  seenPromos: [],
  dismissedPromos: [],
  clickedPromos: [],
  referralCount: 0,
  referralRewards: [],
};

// ============================================
// REFERRAL
// ============================================

export type ReferralTier = "starter" | "ambassador" | "super_parent";

export const REFERRAL_TIERS: {
  tier: ReferralTier;
  label: string;
  icon: string;
  minReferrals: number;
  reward: string;
}[] = [
  {
    tier: "starter",
    label: "Parrain",
    icon: "user-plus",
    minReferrals: 1,
    reward: "1 mois Premium offert",
  },
  {
    tier: "ambassador",
    label: "Ambassadeur",
    icon: "medal",
    minReferrals: 3,
    reward: "Badge Ambassadeur + 3 mois Premium",
  },
  {
    tier: "super_parent",
    label: "Super Parent",
    icon: "trophy",
    minReferrals: 10,
    reward: "Badge Super Parent + 1 an Premium",
  },
];

export function getReferralTier(count: number): ReferralTier | null {
  if (count >= 10) return "super_parent";
  if (count >= 3) return "ambassador";
  if (count >= 1) return "starter";
  return null;
}
