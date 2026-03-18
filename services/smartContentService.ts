// services/smartContentService.ts
// Fetches tips, milestones, and manages user content state from Firestore

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import type {
  MilestoneRef,
  Tip,
  TipCategory,
  UserContent,
} from "@/types/content";
import { DEFAULT_USER_CONTENT } from "@/types/content";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

// ============================================
// TIPS
// ============================================

/**
 * Fetch active tips suitable for a given age
 */
export async function fetchTipsForAge(
  ageMonths: number,
  maxResults = 10,
): Promise<Tip[]> {
  const tipsRef = collection(db, "tips");
  const q = query(
    tipsRef,
    where("active", "==", true),
    where("ageMinMonths", "<=", ageMonths),
    orderBy("ageMinMonths"),
    orderBy("priority"),
    limit(maxResults * 2), // Fetch extra to filter client-side
  );

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Tip)
    .filter((tip) => ageMonths <= tip.ageMaxMonths)
    .slice(0, maxResults);
}

/**
 * Fetch tips by category for a given age
 */
export async function fetchTipsByCategory(
  category: TipCategory,
  ageMonths: number,
  maxResults = 10,
): Promise<Tip[]> {
  const tipsRef = collection(db, "tips");
  const q = query(
    tipsRef,
    where("active", "==", true),
    where("category", "==", category),
    where("ageMinMonths", "<=", ageMonths),
    orderBy("ageMinMonths"),
    orderBy("priority"),
    limit(maxResults * 2),
  );

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Tip)
    .filter((tip) => ageMonths <= tip.ageMaxMonths)
    .slice(0, maxResults);
}

/**
 * Fetch a single tip by ID
 */
export async function fetchTipById(tipId: string): Promise<Tip | null> {
  const docRef = doc(db, "tips", tipId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Tip;
}

// ============================================
// MILESTONES
// ============================================

/**
 * Fetch milestones relevant for a given age (in weeks)
 */
export async function fetchMilestonesForAge(
  ageWeeks: number,
  windowWeeks = 8,
): Promise<MilestoneRef[]> {
  const ref = collection(db, "milestones_ref");
  // Fetch milestones where the baby's age is within the expected range
  // or approaching (within windowWeeks)
  const q = query(
    ref,
    where("ageMinWeeks", "<=", ageWeeks + windowWeeks),
    orderBy("ageMinWeeks"),
    orderBy("order"),
  );

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }) as MilestoneRef)
    .filter((m) => ageWeeks <= m.ageMaxWeeks + windowWeeks);
}

/**
 * Get upcoming milestones (not yet past the typical age)
 */
export async function getUpcomingMilestones(
  ageWeeks: number,
  maxResults = 5,
): Promise<MilestoneRef[]> {
  const milestones = await fetchMilestonesForAge(ageWeeks);
  return milestones
    .filter((m) => ageWeeks <= m.ageMaxWeeks)
    .sort((a, b) => a.ageTypicalWeeks - b.ageTypicalWeeks)
    .slice(0, maxResults);
}

// ============================================
// USER CONTENT STATE
// ============================================

/**
 * Get the user's content state (dismissed tips, bookmarks, etc.)
 */
export async function getUserContentState(): Promise<UserContent> {
  const userId = getUserId();
  const docRef = doc(db, "user_content", userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      ...DEFAULT_USER_CONTENT,
      ...data,
    } as UserContent;
  }

  // Create default state
  await setDoc(docRef, DEFAULT_USER_CONTENT);
  return DEFAULT_USER_CONTENT;
}

/**
 * Dismiss a tip (won't show again)
 */
export async function dismissTip(tipId: string): Promise<void> {
  const userId = getUserId();
  const docRef = doc(db, "user_content", userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await updateDoc(docRef, {
      dismissedTips: arrayUnion(tipId),
      updatedAt: new Date(),
    });
  } else {
    await setDoc(docRef, {
      ...DEFAULT_USER_CONTENT,
      dismissedTips: [tipId],
      updatedAt: new Date(),
    });
  }
}

/**
 * Bookmark a tip
 */
export async function bookmarkTip(tipId: string): Promise<void> {
  const userId = getUserId();
  const docRef = doc(db, "user_content", userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await updateDoc(docRef, {
      bookmarks: arrayUnion(tipId),
      updatedAt: new Date(),
    });
  } else {
    await setDoc(docRef, {
      ...DEFAULT_USER_CONTENT,
      bookmarks: [tipId],
      updatedAt: new Date(),
    });
  }
}

/**
 * Remove a bookmark
 */
export async function removeBookmark(tipId: string): Promise<void> {
  const userId = getUserId();
  const docRef = doc(db, "user_content", userId);
  await updateDoc(docRef, {
    bookmarks: arrayRemove(tipId),
    updatedAt: new Date(),
  });
}

/**
 * Submit feedback on a tip (thumbs up/down)
 */
export async function submitTipFeedback(
  tipId: string,
  feedback: "up" | "down",
): Promise<void> {
  const userId = getUserId();
  const docRef = doc(db, "user_content", userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await updateDoc(docRef, {
      [`tipFeedback.${tipId}`]: feedback,
      updatedAt: new Date(),
    });
  } else {
    await setDoc(docRef, {
      ...DEFAULT_USER_CONTENT,
      tipFeedback: { [tipId]: feedback },
      updatedAt: new Date(),
    });
  }
}

/**
 * Mark a changelog version as seen
 */
export async function markChangelogSeen(version: string): Promise<void> {
  const userId = getUserId();
  const docRef = doc(db, "user_content", userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await updateDoc(docRef, {
      seenChangelog: arrayUnion(version),
      updatedAt: new Date(),
    });
  } else {
    await setDoc(docRef, {
      ...DEFAULT_USER_CONTENT,
      seenChangelog: [version],
      updatedAt: new Date(),
    });
  }
}

/**
 * Update tip frequency preference
 */
export async function updateTipFrequency(
  frequency: UserContent["tipFrequency"],
): Promise<void> {
  const userId = getUserId();
  const docRef = doc(db, "user_content", userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await updateDoc(docRef, {
      tipFrequency: frequency,
      updatedAt: new Date(),
    });
  } else {
    await setDoc(docRef, {
      ...DEFAULT_USER_CONTENT,
      tipFrequency: frequency,
      updatedAt: new Date(),
    });
  }
}
