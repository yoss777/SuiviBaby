import { db } from '@/config/firebase';
import { obtenirPreferences, type ReminderPreferences } from '@/services/userPreferencesService';
import { collection, doc, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { obtenirEvenementsDuJourHybrid } from '@/migration/eventsHybridService';
import { buildTodayEventsData, getTodayEventsCache, setTodayEventsCache } from '@/services/todayEventsCache';

export interface Child {
  id: string;
  name: string;
  birthDate: string; // Format DD/MM/YYYY
  gender?: 'male' | 'female';
  photoUri?: string;
}

const DEFAULT_REMINDERS: ReminderPreferences = {
  enabled: false,
  thresholds: { repas: 0, pompages: 0, mictions: 0, selles: 0, vitamines: 0 },
};

interface BabyContextType {
  children: Child[];
  activeChild: Child | null;
  loading: boolean;
  childrenLoaded: boolean;
  hiddenChildrenIds: string[];
  reminderPreferences: ReminderPreferences;
  setActiveChild: (child: Child) => void;
  addChild: (child: Child) => void;
  updateChild: (id: string, child: Partial<Child>) => void;
  deleteChild: (id: string) => void;
}

const BabyContext = createContext<BabyContextType | undefined>(undefined);

/**
 * Compute visible & sorted children from raw data + hidden list.
 * Pure function — no side effects.
 */
function computeVisibleChildren(
  allData: Map<string, Child>,
  hiddenIds: string[],
): Child[] {
  const visible = Array.from(allData.values()).filter(
    (child) => !hiddenIds.includes(child.id),
  );
  visible.sort((a, b) => a.name.localeCompare(b.name));
  return visible;
}

/**
 * Pick the best active child from the visible list.
 * Priority: override ref > lastActive ref > previous > first visible.
 */
function pickActiveChild(
  visibleChildren: Child[],
  prev: Child | null,
  overrideId: string | null,
  lastActiveId: string | null,
  hiddenIds: string[],
): Child | null {
  if (visibleChildren.length === 0) return null;
  if (overrideId) {
    const match = visibleChildren.find((c) => c.id === overrideId);
    if (match) return match;
  }
  if (lastActiveId) {
    const match = visibleChildren.find((c) => c.id === lastActiveId);
    if (match) return match;
  }
  if (prev && !hiddenIds.includes(prev.id)) {
    return prev;
  }
  return visibleChildren[0];
}

export function BabyProvider({ children: childrenProp }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [activeChild, setActiveChildState] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);
  const [childrenLoaded, setChildrenLoaded] = useState(false);
  const [hiddenChildrenIds, setHiddenChildrenIds] = useState<string[]>([]);
  const [reminderPreferences, setReminderPreferences] = useState<ReminderPreferences>(DEFAULT_REMINDERS);
  const lastActiveChildIdRef = useRef<string | null>(null);
  const lastActiveOverrideRef = useRef<string | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const preloadInFlight = useRef<Set<string>>(new Set());
  const childListenersRef = useRef<Map<string, () => void>>(new Map());
  const childDataRef = useRef<Map<string, Child>>(new Map());
  const currentChildIdsRef = useRef<Set<string>>(new Set());
  // Ref mirrors for hiddenChildrenIds — avoids putting state in listener useEffect deps
  const hiddenChildrenIdsRef = useRef<string[]>([]);

  // Keep the ref in sync with state
  useEffect(() => {
    hiddenChildrenIdsRef.current = hiddenChildrenIds;
  }, [hiddenChildrenIds]);

  /**
   * Recompute visible children + active child from refs, then setState.
   * Called from any listener callback — single source of truth.
   */
  const syncState = useCallback(() => {
    const visible = computeVisibleChildren(
      childDataRef.current,
      hiddenChildrenIdsRef.current,
    );
    setChildren(visible);
    setActiveChildState((prev) =>
      pickActiveChild(
        visible,
        prev,
        lastActiveOverrideRef.current,
        lastActiveChildIdRef.current,
        hiddenChildrenIdsRef.current,
      ),
    );
  }, []);

  // Re-derive visible children when hiddenChildrenIds changes
  // (without tearing down Firestore listeners)
  useEffect(() => {
    if (childDataRef.current.size > 0) {
      syncState();
    }
  }, [hiddenChildrenIds, syncState]);

  // Écouter les changements des préférences utilisateur en temps réel
  useEffect(() => {
    if (!user?.uid) {
      setHiddenChildrenIds([]);
      setPreferencesLoaded(true);
      return;
    }

    setPreferencesLoaded(false);
    const userPrefsRef = doc(db, 'user_preferences', user.uid);

    const unsubscribe = onSnapshot(userPrefsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        console.log('[BabyContext] Préférences chargées:', data.lastActiveChildId);
        const newHiddenIds = data.hiddenChildrenIds || [];
        setHiddenChildrenIds((prev) => {
          if (prev.length === newHiddenIds.length && prev.every((id: string, i: number) => id === newHiddenIds[i])) {
            return prev;
          }
          return newHiddenIds;
        });
        // R7: Extract reminder preferences from the same snapshot
        const reminders = data.notifications?.reminders;
        if (reminders) {
          setReminderPreferences({
            enabled: reminders.enabled ?? DEFAULT_REMINDERS.enabled,
            thresholds: { ...DEFAULT_REMINDERS.thresholds, ...(reminders.thresholds || {}) },
          });
        } else {
          setReminderPreferences(DEFAULT_REMINDERS);
        }
        const prefsLastActive = data.lastActiveChildId || null;
        lastActiveChildIdRef.current = prefsLastActive;
        if (lastActiveOverrideRef.current && prefsLastActive === lastActiveOverrideRef.current) {
          lastActiveOverrideRef.current = null;
        }
      } else {
        setHiddenChildrenIds((prev) => prev.length === 0 ? prev : []);
        setReminderPreferences(DEFAULT_REMINDERS);
        if (!lastActiveOverrideRef.current) {
          lastActiveChildIdRef.current = null;
        }
      }
      setPreferencesLoaded(true);
    }, (error) => {
      console.error('Erreur lors de l\'écoute des préférences:', error);
      obtenirPreferences().then(prefs => {
        const newHiddenIds = prefs.hiddenChildrenIds || [];
        setHiddenChildrenIds((prev) => {
          if (prev.length === newHiddenIds.length && prev.every((id: string, i: number) => id === newHiddenIds[i])) {
            return prev;
          }
          return newHiddenIds;
        });
        lastActiveChildIdRef.current = prefs.lastActiveChildId || null;
        setPreferencesLoaded(true);
      }).catch(err => {
        console.error('Erreur lors du chargement des préférences:', err);
        setPreferencesLoaded(true);
      });
    });

    return () => unsubscribe();
  }, [user]);

  // Charger les enfants depuis Firestore
  // R5: No longer waits for preferencesLoaded — children and prefs load in parallel.
  // syncState() reads hiddenChildrenIdsRef which updates when prefs arrive.
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      setChildrenLoaded(false);
      return;
    }

    if (!user?.uid) {
      setChildren([]);
      setActiveChildState(null);
      setLoading(false);
      setChildrenLoaded(false);
      return;
    }

    console.log('[BabyContext] Chargement des enfants (access) pour user.uid:', user.uid);
    setLoading(true);
    setChildrenLoaded(false);

    const accessQuery = query(
      collection(db, 'user_child_access'),
      where('userId', '==', user.uid),
      limit(200)
    );

    const unsubscribeAccess = onSnapshot(accessQuery, (snapshot) => {
      const currentChildIds = new Set<string>();
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as { childId?: string; userId?: string };
        if (data.userId !== user.uid) return;
        if (data.childId) currentChildIds.add(data.childId);
      });
      currentChildIdsRef.current = currentChildIds;

      // Add listeners for new children
      currentChildIds.forEach((childId) => {
        if (childListenersRef.current.has(childId)) return;

        const unsub = onSnapshot(
          doc(db, 'children', childId),
          (childSnap) => {
            if (!childSnap.exists()) {
              childDataRef.current.delete(childId);
            } else {
              const data = childSnap.data() as Omit<Child, 'id'>;
              childDataRef.current.set(childId, { id: childId, ...data });
            }

            // Single call to recompute state
            syncState();

            if (childDataRef.current.size >= currentChildIdsRef.current.size) {
              setLoading(false);
              setChildrenLoaded(true);
            }
          },
          (error) => {
            console.error('[BabyContext] Erreur listener child:', error);
          }
        );

        childListenersRef.current.set(childId, unsub);
      });

      // Remove listeners for deleted children
      childListenersRef.current.forEach((unsub, childId) => {
        if (!currentChildIds.has(childId)) {
          unsub();
          childListenersRef.current.delete(childId);
          childDataRef.current.delete(childId);
        }
      });

      // Sync after access changes (handles child removal)
      syncState();

      if (currentChildIds.size === 0) {
        setLoading(false);
        setChildrenLoaded(true);
      } else {
        setLoading(true);
        setChildrenLoaded(false);
      }
    }, (error) => {
      console.error('[BabyContext] Erreur lors de l\'écoute des accès:', error);
      setLoading(false);
      setChildrenLoaded(false);
    });

    return () => {
      unsubscribeAccess();
      childListenersRef.current.forEach((unsub) => unsub());
      childListenersRef.current.clear();
      childDataRef.current.clear();
    };
  }, [user, authLoading, syncState]);

  // Preload today's events for all children
  useEffect(() => {
    if (loading || !user?.uid) return;
    if (children.length === 0) return;

    let cancelled = false;
    const todayKey = new Date().toDateString();

    const preloadChild = async (childId: string) => {
      const inFlightKey = `${childId}-${todayKey}`;
      if (preloadInFlight.current.has(inFlightKey)) return;
      if (getTodayEventsCache(childId)) return;

      preloadInFlight.current.add(inFlightKey);
      try {
        const events = await obtenirEvenementsDuJourHybrid(childId);
        if (cancelled) return;
        setTodayEventsCache(childId, buildTodayEventsData(events));
      } catch (error) {
        console.warn('[BabyContext] Préchargement today échoué:', error);
      } finally {
        preloadInFlight.current.delete(inFlightKey);
      }
    };

    const queue = children.map((child) => child.id);
    const maxConcurrent = 2;

    const runQueue = async () => {
      const workers = Array.from(
        { length: Math.min(maxConcurrent, queue.length) },
        async () => {
          while (queue.length > 0 && !cancelled) {
            const childId = queue.shift();
            if (!childId) return;
            await preloadChild(childId);
          }
        }
      );

      await Promise.all(workers);
    };

    runQueue();

    return () => {
      cancelled = true;
    };
  }, [children, loading, user]);

  const setActiveChild = useCallback((child: Child) => {
    setActiveChildState(child);
    lastActiveChildIdRef.current = child.id;
    lastActiveOverrideRef.current = child.id;
    if (user?.uid) {
      setDoc(
        doc(db, 'user_preferences', user.uid),
        { lastActiveChildId: child.id },
        { merge: true }
      ).catch((error) => {
        console.error('Erreur sauvegarde dernier enfant actif:', error);
      });
    }
  }, [user]);

  const addChild = useCallback((child: Child) => {
    setChildren((prev) => [...prev, child]);
  }, []);

  const updateChild = useCallback((id: string, updatedChild: Partial<Child>) => {
    setChildren((prev) =>
      prev.map((child) => (child.id === id ? { ...child, ...updatedChild } : child))
    );
    setActiveChildState((prev) =>
      prev?.id === id ? { ...prev, ...updatedChild } : prev
    );
  }, []);

  const deleteChild = useCallback((id: string) => {
    setChildren((prev) => {
      const remaining = prev.filter((child) => child.id !== id);
      setActiveChildState((prevActive) =>
        prevActive?.id === id ? remaining[0] || null : prevActive
      );
      return remaining;
    });
  }, []);

  const value = useMemo<BabyContextType>(() => ({
    children,
    activeChild,
    loading,
    childrenLoaded,
    hiddenChildrenIds,
    reminderPreferences,
    setActiveChild,
    addChild,
    updateChild,
    deleteChild,
  }), [children, activeChild, loading, childrenLoaded, hiddenChildrenIds, reminderPreferences, setActiveChild, addChild, updateChild, deleteChild]);

  return (
    <BabyContext.Provider value={value}>
      {childrenProp}
    </BabyContext.Provider>
  );
}

export function useBaby() {
  const context = useContext(BabyContext);
  if (context === undefined) {
    throw new Error('useBaby must be used within a BabyProvider');
  }
  return context;
}
