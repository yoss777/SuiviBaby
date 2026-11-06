// services/healthConsentService.ts
// Health data consent (GDPR art. 9). The proof is written server-side by the
// `recordHealthConsent` callable; the client only reads the result.
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import { db, functions } from "@/config/firebase";

/** Bump whenever the consent text / privacy policy changes materially. */
export const HEALTH_CONSENT_VERSION = "2.1";

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
    consent.version === HEALTH_CONSENT_VERSION
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
}
