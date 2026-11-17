// services/healthConsentService.ts
// Health data consent (GDPR art. 9). The proof is written server-side by the
// `recordHealthConsent` callable; the client only reads the result.
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import { db, functions } from "@/config/firebase";

/**
 * Bump whenever the consent text / privacy policy changes materially.
 * 2.3 : widget d'écran d'accueil (résumé envoyé via Expo, FCM et APNs).
 */
export const HEALTH_CONSENT_VERSION = "2.3";

/** « 2.10 » ≥ « 2.3 » : comparaison numérique, partie par partie. */
export function consentVersionAtLeast(version: unknown, min: string): boolean {
  if (typeof version !== "string" || !/^\d{1,3}(\.\d{1,3}){0,2}$/.test(version)) return false;
  const a = version.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export interface HealthDataConsent {
  granted: boolean;
  grantedAt: string | { toDate?: () => Date } | null; // ISO string or Timestamp
  version: string;
}


// uid for which a valid consent was verified during this session. Avoids
// re-reading Firestore (boot -> consent screen -> boot) without any listener.
let verifiedUid: string | null = null;

export function resetHealthConsentCache(): void {
  verifiedUid = null;
}

export function hasValidHealthConsent(
  consent: Partial<HealthDataConsent> | null | undefined,
): boolean {
  return (
    !!consent &&
    typeof consent === "object" &&
    consent.granted === true &&
    // Version actuelle ou plus récente (donnée par une app plus récente sur un
    // autre appareil) : jamais redemandé pour une version plus ancienne.
    consentVersionAtLeast(consent.version, HEALTH_CONSENT_VERSION)
  );
}

/**
 * One-shot read of `user_preferences/{uid}.healthDataConsent`.
 * Resolves true only when consent is granted for the current version.
 * Throws on read errors so callers can distinguish "missing" from "unknown".
 */
export async function fetchHealthConsentStatus(uid: string): Promise<boolean> {
  if (verifiedUid === uid) return true;
  const snap = await getDoc(doc(db, "user_preferences", uid));
  const consent = snap.exists() ? snap.data()?.healthDataConsent : undefined;
  const valid = hasValidHealthConsent(consent);
  if (valid) verifiedUid = uid;
  return valid;
}

/** Records the consent server-side (timestamped proof + preference flag). */
export async function recordHealthConsent(uid: string): Promise<void> {
  const callable = httpsCallable<
    { version: string; platform?: string },
    { version: string }
  >(functions, "recordHealthConsent");
  await callable({
    version: HEALTH_CONSENT_VERSION,
    platform: Platform.OS,
  });
  verifiedUid = uid;
  // Consentement redonné : le widget peut de nouveau être écrit (suspendu au
  // retrait du consentement).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@/services/widgetSync") as typeof import("@/services/widgetSync")).resumeWidgetWrites();
}

/**
 * Withdraws the health data consent server-side (records the withdrawal and
 * sets `healthDataConsent.granted = false`), then resets the local cache so the
 * boot flow shows the consent screen again.
 */
export async function withdrawHealthConsent(): Promise<void> {
  const callable = httpsCallable<Record<string, never>, { success: boolean }>(
    functions,
    "withdrawHealthConsent",
  );
  await callable({});
  resetHealthConsentCache();
}
