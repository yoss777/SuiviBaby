// services/premiumGatingService.ts
// Gère les limites du tier gratuit : compteurs quotidiens/mensuels,
// vérification d'accès, et messages de paywall contextuels.

import AsyncStorage from "@react-native-async-storage/async-storage";

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
// COUNTER KEYS
// ============================================

const VOICE_COUNTER_KEY = "@suivibaby_voice_count";
const VOICE_DATE_KEY = "@suivibaby_voice_date";
const EXPORT_COUNTER_KEY = "@suivibaby_export_count";

// ============================================
// VOICE COMMANDS (daily counter, reset at midnight)
// ============================================

/**
 * Récupère le compteur de commandes vocales du jour.
 */
export async function getVoiceCommandCount(): Promise<number> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const storedDate = await AsyncStorage.getItem(VOICE_DATE_KEY);

    if (storedDate !== today) {
      // Nouveau jour — reset
      await AsyncStorage.setItem(VOICE_DATE_KEY, today);
      await AsyncStorage.setItem(VOICE_COUNTER_KEY, "0");
      return 0;
    }

    const raw = await AsyncStorage.getItem(VOICE_COUNTER_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Incrémente le compteur de commandes vocales.
 * Retourne true si la commande est autorisée, false si la limite est atteinte.
 */
export async function incrementVoiceCommand(): Promise<boolean> {
  const count = await getVoiceCommandCount();
  if (count >= FREE_LIMITS.voiceCommandsPerDay) {
    return false;
  }

  try {
    await AsyncStorage.setItem(VOICE_COUNTER_KEY, String(count + 1));
    return true;
  } catch {
    return true; // En cas d'erreur, on laisse passer
  }
}

/**
 * Retourne le nombre de commandes vocales restantes aujourd'hui.
 */
export async function getRemainingVoiceCommands(): Promise<number> {
  const count = await getVoiceCommandCount();
  return Math.max(0, FREE_LIMITS.voiceCommandsPerDay - count);
}

// ============================================
// PDF EXPORTS (lifetime counter)
// ============================================

/**
 * Récupère le compteur total d'exports PDF.
 */
export async function getPdfExportCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(EXPORT_COUNTER_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Incrémente le compteur d'exports PDF.
 * Retourne true si l'export est autorisé, false si la limite est atteinte.
 */
export async function incrementPdfExport(): Promise<boolean> {
  const count = await getPdfExportCount();
  if (count >= FREE_LIMITS.totalPdfExports) {
    return false;
  }

  try {
    await AsyncStorage.setItem(EXPORT_COUNTER_KEY, String(count + 1));
    return true;
  } catch {
    return true;
  }
}

/**
 * Retourne le nombre d'exports PDF restants.
 */
export async function getRemainingPdfExports(): Promise<number> {
  const count = await getPdfExportCount();
  return Math.max(0, FREE_LIMITS.totalPdfExports - count);
}

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
    title: "Commandes vocales epuisees",
    description: "Vous avez utilise vos 3 commandes vocales du jour. Passez a Premium pour des commandes illimitees.",
    ctaText: "Debloquer la voix illimitee",
  },
  export_limit: {
    title: "Export PDF utilise",
    description: "Votre export gratuit a ete utilise. Passez a Premium pour des exports illimites et des rapports pediatre.",
    ctaText: "Exporter sans limites",
  },
  history_limit: {
    title: "Historique limite a 90 jours",
    description: "Accedez a tout l'historique de votre bebe avec Premium. Retrouvez les donnees depuis la naissance.",
    ctaText: "Voir tout l'historique",
  },
  sharing_limit: {
    title: "Limite de partage atteinte",
    description: "Le plan gratuit permet 2 co-parents. Passez a Famille pour inviter jusqu'a 5 personnes.",
    ctaText: "Inviter toute la famille",
  },
  advanced_stats: {
    title: "Statistiques avancees",
    description: "Decouvrez les correlations, tendances et courbes OMS avec Premium.",
    ctaText: "Voir les stats avancees",
  },
  ai_insights: {
    title: "Insights IA",
    description: "Recevez des analyses personnalisees : \"Bebe dort mieux quand couche avant 19h30\".",
    ctaText: "Activer les insights IA",
  },
};
