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
import { captureServiceError } from "@/utils/errorReporting";
import type {
  MilestoneRef,
  MilestoneStatus,
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
  try {
    const tipsRef = collection(db, "tips");
    const q = query(
      tipsRef,
      where("active", "==", true),
      orderBy("priority"),
      limit(50),
    );

    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Tip)
      .filter((tip) => ageMonths >= tip.ageMinMonths && ageMonths <= tip.ageMaxMonths)
      .slice(0, maxResults);
  } catch (e) {
    console.error("[smartContentService] fetchTipsForAge error:", e);
    captureServiceError(e, { service: "smartContent", operation: "fetchTipsForAge" });
    return [];
  }
}

/**
 * Fetch tips by category for a given age
 */
export async function fetchTipsByCategory(
  category: TipCategory,
  ageMonths: number,
  maxResults = 10,
): Promise<Tip[]> {
  try {
    const tipsRef = collection(db, "tips");
    const q = query(
      tipsRef,
      where("active", "==", true),
      where("category", "==", category),
      limit(50),
    );

    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Tip)
      .filter((tip) => ageMonths >= tip.ageMinMonths && ageMonths <= tip.ageMaxMonths)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, maxResults);
  } catch (e) {
    console.error("[smartContentService] fetchTipsByCategory error:", e);
    captureServiceError(e, { service: "smartContent", operation: "fetchTipsByCategory" });
    return [];
  }
}

/**
 * Fetch a single tip by ID
 */
export async function fetchTipById(tipId: string): Promise<Tip | null> {
  try {
    const docRef = doc(db, "tips", tipId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as Tip;
  } catch (e) {
    console.error("[smartContentService] fetchTipById error:", e);
    captureServiceError(e, { service: "smartContent", operation: "fetchTipById" });
    return null;
  }
}

// ============================================
// MILESTONES
// ============================================

/**
 * Fetch milestones relevant for a given age (in weeks)
 */
/**
 * Fetch ALL milestones from birth up to current age + window.
 * Used by the full MilestoneTimeline modal.
 */
export async function fetchAllMilestones(): Promise<MilestoneRef[]> {
  try {
    const ref = collection(db, "milestones_ref");
    const q = query(ref, limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as MilestoneRef)
      .sort((a, b) => a.order - b.order);
  } catch (e) {
    console.error("[smartContentService] fetchAllMilestones error:", e);
    captureServiceError(e, { service: "smartContent", operation: "fetchAllMilestones" });
    return [];
  }
}

/**
 * Fetch milestones relevant for a given age (nearby window only).
 * Used by the dashboard card preview.
 */
export async function fetchMilestonesForAge(
  ageWeeks: number,
  windowWeeks = 8,
): Promise<MilestoneRef[]> {
  const all = await fetchAllMilestones();
  return all.filter(
    (m) =>
      ageWeeks + windowWeeks >= m.ageMinWeeks &&
      ageWeeks <= m.ageMaxWeeks + windowWeeks,
  );
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
 * Merges per-user state with shared child milestone statuses.
 */
export async function getUserContentState(childId?: string): Promise<UserContent> {
  const userId = getUserId();
  const docRef = doc(db, "user_content", userId);
  const docSnap = await getDoc(docRef);

  let userContent: UserContent;
  if (docSnap.exists()) {
    const data = docSnap.data();
    userContent = {
      ...DEFAULT_USER_CONTENT,
      ...data,
    } as UserContent;
  } else {
    await setDoc(docRef, DEFAULT_USER_CONTENT);
    userContent = DEFAULT_USER_CONTENT;
  }

  // Override milestoneStatuses from shared child document
  if (childId) {
    try {
      const childDoc = await getDoc(doc(db, "children", childId));
      if (childDoc.exists()) {
        const childData = childDoc.data();
        if (childData.milestoneStatuses) {
          userContent = {
            ...userContent,
            milestoneStatuses: childData.milestoneStatuses,
          };
        }
      }
    } catch {
      // Fallback to user-level statuses
    }
  }

  return userContent;
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

/**
 * Update a milestone's status (not_started, in_progress, done)
 * Stored on the child document so all users sharing the child see the same state.
 */
export async function updateMilestoneStatus(
  milestoneId: string,
  status: MilestoneStatus,
  childId?: string,
): Promise<void> {
  if (childId) {
    // Shared: store on child document
    const childRef = doc(db, "children", childId);
    await updateDoc(childRef, {
      [`milestoneStatuses.${milestoneId}`]: status,
    });
  } else {
    // Fallback: per-user (legacy)
    const userId = getUserId();
    const docRef = doc(db, "user_content", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        [`milestoneStatuses.${milestoneId}`]: status,
        updatedAt: new Date(),
      });
    } else {
      await setDoc(docRef, {
        ...DEFAULT_USER_CONTENT,
        milestoneStatuses: { [milestoneId]: status },
        updatedAt: new Date(),
      });
    }
  }
}
