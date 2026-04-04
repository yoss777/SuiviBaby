// services/onboardingAnalytics.ts
// Tracking local des événements onboarding.
// Stocke dans AsyncStorage — peut être flush vers Firebase Analytics quand installé.
// Permet de mesurer le funnel d'activation J0-J7 sans dépendance native.

import AsyncStorage from "@react-native-async-storage/async-storage";

const ANALYTICS_KEY = "@suivibaby_onboarding_analytics";

export type OnboardingEvent =
  | "onboarding_slide_viewed"
  | "onboarding_completed"
  | "onboarding_skipped"
  | "signup_completed"
  | "health_consent_granted"
  | "first_baby_added"
  | "first_track_guide_shown"
  | "first_track_completed"
  | "first_track_skipped"
  | "co_parent_invited";

interface AnalyticsEntry {
  event: OnboardingEvent;
  timestamp: string;
  metadata?: Record<string, string | number>;
}

/**
 * Enregistre un événement onboarding.
 */
export async function trackOnboardingEvent(
  event: OnboardingEvent,
  metadata?: Record<string, string | number>
) {
  try {
    const entry: AnalyticsEntry = {
      event,
      timestamp: new Date().toISOString(),
      metadata,
    };

    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    const entries: AnalyticsEntry[] = raw ? JSON.parse(raw) : [];
    entries.push(entry);

    // Garder max 200 entrées (un onboarding complet en fait ~10)
    const trimmed = entries.slice(-200);
    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(trimmed));
  } catch {
    // Analytics must never crash the app
  }
}

/**
 * Récupère toutes les entrées onboarding (pour debug ou flush vers Analytics).
 */
export async function getOnboardingAnalytics(): Promise<AnalyticsEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Calcule les métriques de funnel onboarding.
 */
export async function getOnboardingFunnel(): Promise<Record<string, number>> {
  const entries = await getOnboardingAnalytics();
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.event] = (counts[entry.event] || 0) + 1;
  }
  return counts;
}
