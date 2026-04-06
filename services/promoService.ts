// services/promoService.ts
// Fetches promotions and manages user promo state from Firestore

import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { captureServiceError } from "@/utils/errorReporting";
import type { Promotion, UserPromos } from "@/types/promo";
import { DEFAULT_USER_PROMOS } from "@/types/promo";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

// ============================================
// PROMOTIONS
// ============================================

/**
 * Fetch active promotions for a given baby age.
 * Filters by date validity and age range client-side.
 */
export async function fetchActivePromos(
  ageMonths: number,
): Promise<Promotion[]> {
  try {
    const ref = collection(db, "promotions");
    const q = query(ref, where("active", "==", true), limit(20));
    const snapshot = await getDocs(q);
    const now = new Date();

    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Promotion)
      .filter((p) => {
        // Check date validity
        const start = p.startDate instanceof Timestamp
          ? p.startDate.toDate()
          : new Date(p.startDate as unknown as string);
        const end = p.endDate instanceof Timestamp
          ? p.endDate.toDate()
          : new Date(p.endDate as unknown as string);
        if (now < start || now > end) return false;

        // Check age range (if specified)
        if (p.ageMinMonths != null && ageMonths < p.ageMinMonths) return false;
        if (p.ageMaxMonths != null && ageMonths > p.ageMaxMonths) return false;

        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  } catch (e) {
    console.error("[promoService] fetchActivePromos error:", e);
    captureServiceError(e, { service: "promo", operation: "fetchActivePromos" });
    return [];
  }
}

/**
 * Fetch a single promotion by ID
 */
export async function fetchPromoById(
  promoId: string,
): Promise<Promotion | null> {
  try {
    const docRef = doc(db, "promotions", promoId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as Promotion;
  } catch (e) {
    console.error("[promoService] fetchPromoById error:", e);
    captureServiceError(e, { service: "promo", operation: "fetchPromoById" });
    return null;
  }
}

// ============================================
// USER PROMO STATE
// ============================================

/**
 * Get the user's promo state
 */
export async function getUserPromoState(): Promise<UserPromos> {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_promos", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { ...DEFAULT_USER_PROMOS, ...docSnap.data() } as UserPromos;
    }

    // Generate referral code and create default state
    const referralCode = generateReferralCode(userId);
    const defaultState = { ...DEFAULT_USER_PROMOS, referralCode };
    await setDoc(docRef, defaultState);
    return defaultState;
  } catch (e) {
    console.error("[promoService] getUserPromoState error:", e);
    captureServiceError(e, { service: "promo", operation: "getUserPromoState" });
    return DEFAULT_USER_PROMOS;
  }
}

/**
 * Track that a promo was shown (impression)
 */
export async function trackImpression(promoId: string): Promise<void> {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_promos", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        seenPromos: arrayUnion(promoId),
        lastPromoShownAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      await setDoc(docRef, {
        ...DEFAULT_USER_PROMOS,
        seenPromos: [promoId],
        lastPromoShownAt: new Date(),
        referralCode: generateReferralCode(userId),
      });
    }
  } catch (e) {
    console.error("[promoService] trackImpression error:", e);
    captureServiceError(e, { service: "promo", operation: "trackImpression" });
  }
}

/**
 * Track that a promo was clicked
 */
export async function trackClick(promoId: string): Promise<void> {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_promos", userId);
    await updateDoc(docRef, {
      clickedPromos: arrayUnion(promoId),
      updatedAt: new Date(),
    });
  } catch (e) {
    console.error("[promoService] trackClick error:", e);
    captureServiceError(e, { service: "promo", operation: "trackClick" });
  }
}

/**
 * Dismiss a promo (won't show again)
 */
export async function dismissPromo(promoId: string): Promise<void> {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_promos", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        dismissedPromos: arrayUnion(promoId),
        updatedAt: new Date(),
      });
    } else {
      await setDoc(docRef, {
        ...DEFAULT_USER_PROMOS,
        dismissedPromos: [promoId],
        referralCode: generateReferralCode(userId),
      });
    }
  } catch (e) {
    console.error("[promoService] dismissPromo error:", e);
    captureServiceError(e, { service: "promo", operation: "dismissPromo" });
  }
}

// ============================================
// REFERRAL
// ============================================

/**
 * Generate a unique referral code from userId
 */
function generateReferralCode(userId: string): string {
  // Take first 4 chars of userId + random 4 chars
  const prefix = userId.slice(0, 4).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SAM-${prefix}-${suffix}`;
}

/**
 * Get the user's referral code (creates one if missing)
 */
export async function getReferralCode(): Promise<string> {
  const state = await getUserPromoState();
  return state.referralCode ?? generateReferralCode(getUserId());
}
