import { db } from '@/config/firebase';
import { obtenirPreferences, type ReminderPreferences } from '@/services/userPreferencesService';
import { collection, doc, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { obtenirEvenementsDuJour } from '@/services/eventsService';
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
  thresholds: { repas: 0, pompages: 0, changes: 0, vitamines: 0 },
};

interface BabyContextType {
  children: Child[];
  activeChild: Child | null;
  loading: boolean;
  status: 'loading' | 'ready' | 'degraded';
  childrenLoaded: boolean;
  hiddenChildrenIds: string[];
  reminderPreferences: ReminderPreferences;
  setActiveChild: (child: Child) => void;
  addChild: (child: Child) => void;
  updateChild: (id: string, child: Partial<Child>) => void;
  deleteChild: (id: string) => void;
}

const BabyContext = createContext<BabyContextType | undefined>(undefined);
const BABY_BOOT_CACHE_PREFIX = '@suivibaby_boot_children:';
const BABY_BOOT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INITIAL_CHILDREN_TIMEOUT_MS = 8000;

function logBaby(...args: unknown[]) {
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    console.log('[BabyContext]', ...args);
  }
}

interface CachedBabyState {
  children: Child[];
  activeChildId: string | null;
  cachedAt: number;
}

function getBabyCacheKey(uid: string) {
  return `${BABY_BOOT_CACHE_PREFIX}${uid}`;
}

async function loadCachedBabyState(uid: string): Promise<CachedBabyState | null> {
  try {
    const raw = await AsyncStorage.getItem(getBabyCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBabyState;
    if (!Array.isArray(parsed.children)) return null;
    if (
      typeof parsed.cachedAt !== 'number' ||
      Date.now() - parsed.cachedAt > BABY_BOOT_CACHE_TTL_MS
    ) {
      return null;
    }
    return {
      children: parsed.children,
      activeChildId: parsed.activeChildId ?? null,
      cachedAt: parsed.cachedAt,
    };
  } catch (error) {
    console.warn('[BabyContext] Impossible de lire le cache enfants:', error);
    return null;
  }
}

async function saveCachedBabyState(
  uid: string,
  payload: Omit<CachedBabyState, 'cachedAt'>,
) {
  try {
    await AsyncStorage.setItem(
      getBabyCacheKey(uid),
      JSON.stringify({
        ...payload,
        cachedAt: Date.now(),
      }),
    );
  } catch (error) {
    console.warn('[BabyContext] Impossible d’écrire le cache enfants:', error);
  }
}

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'degraded'>('loading');
  const [childrenLoaded, setChildrenLoaded] = useState(false);
  const [hiddenChildrenIds, setHiddenChildrenIds] = useState<string[]>([]);
  const [reminderPreferences, setReminderPreferences] = useState<ReminderPreferences>(DEFAULT_REMINDERS);
  const lastActiveChildIdRef = useRef<string | null>(null);
  const lastActiveOverrideRef = useRef<string | null>(null);
  const preloadInFlight = useRef<Set<string>>(new Set());
  const childListenersRef = useRef<Map<string, () => void>>(new Map());
  const childDataRef = useRef<Map<string, Child>>(new Map());
  const currentChildIdsRef = useRef<Set<string>>(new Set());
  const hasCachedBootstrapRef = useRef(false);
  const hasResolvedInitialLiveDataRef = useRef(false);
  // Ref mirrors for hiddenChildrenIds — avoids putting state in listener useEffect deps
  const hiddenChildrenIdsRef = useRef<string[]>([]);

  // Keep the ref in sync with state
  useEffect(() => {
    hiddenChildrenIdsRef.current = hiddenChildrenIds;
  }, [hiddenChildrenIds]);

  useEffect(() => {
    let cancelled = false;

    if (!user?.uid) {
      hasCachedBootstrapRef.current = false;
      hasResolvedInitialLiveDataRef.current = false;
      setStatus(authLoading ? 'loading' : 'ready');
      return;
    }

    loadCachedBabyState(user.uid).then((cached) => {
      if (cancelled || !cached) return;
      if (hasResolvedInitialLiveDataRef.current) return;

      hasCachedBootstrapRef.current = true;
      childDataRef.current = new Map(cached.children.map((child) => [child.id, child]));
      currentChildIdsRef.current = new Set(cached.children.map((child) => child.id));

      if (cached.activeChildId) {
        lastActiveOverrideRef.current = cached.activeChildId;
      }

      const hydratedChildren = computeVisibleChildren(
        childDataRef.current,
        hiddenChildrenIdsRef.current,
      );
      const hydratedActiveChild = pickActiveChild(
        hydratedChildren,
        null,
        cached.activeChildId,
        lastActiveChildIdRef.current,
        hiddenChildrenIdsRef.current,
      );

      setChildren(hydratedChildren);
      setActiveChildState(hydratedActiveChild);
      setLoading(false);
      setChildrenLoaded(true);
      setStatus('degraded');
    });

    return () => {
      cancelled = true;
    };
  }, [user?.uid, authLoading]);

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
    // Filter hiddenChildrenIds to only keep IDs that exist in loaded children
    // This removes orphaned IDs (deleted children or revoked access)
    const validHiddenIds = hiddenChildrenIdsRef.current.filter(
      (id) => childDataRef.current.has(id),
    );
    if (validHiddenIds.length !== hiddenChildrenIdsRef.current.length) {
      hiddenChildrenIdsRef.current = validHiddenIds;
      setHiddenChildrenIds(validHiddenIds);
    }
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
      return;
    }

    const userPrefsRef = doc(db, 'user_preferences', user.uid);

    const unsubscribe = onSnapshot(userPrefsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        logBaby('Préférences chargées', data.lastActiveChildId);
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
      }).catch(err => {
        console.error('Erreur lors du chargement des préférences:', err);
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
      setStatus('loading');
      return;
    }

    if (!user?.uid) {
      setChildren([]);
      setActiveChildState(null);
      setLoading(false);
      setChildrenLoaded(false);
      setStatus('ready');
      hasCachedBootstrapRef.current = false;
      hasResolvedInitialLiveDataRef.current = false;
      childDataRef.current.clear();
      currentChildIdsRef.current.clear();
      return;
    }

    logBaby('Chargement des enfants (access)', user.uid);
    if (!hasCachedBootstrapRef.current) {
      setLoading(true);
      setChildrenLoaded(false);
      setStatus('loading');
    }

    const childListeners = childListenersRef.current;

    const initialLoadTimeout = setTimeout(() => {
      if (hasCachedBootstrapRef.current) {
        setLoading(false);
        setChildrenLoaded(true);
      }
      setStatus('degraded');
    }, INITIAL_CHILDREN_TIMEOUT_MS);

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

      childDataRef.current.forEach((_, childId) => {
        if (!currentChildIds.has(childId)) {
          childDataRef.current.delete(childId);
        }
      });

      // Add listeners for new children
      currentChildIds.forEach((childId) => {
        if (childListeners.has(childId)) return;

        const unsub = onSnapshot(
          doc(db, 'children', childId),
          (childSnap) => {
            if (!childSnap.exists()) {
              childDataRef.current.delete(childId);
            } else {
              const data = childSnap.data() as Omit<Child, 'id'> & { deletedAt?: unknown };
              // Skip soft-deleted children
              if (data.deletedAt) {
                childDataRef.current.delete(childId);
              } else {
                childDataRef.current.set(childId, { id: childId, ...data });
              }
            }

            // Single call to recompute state
            syncState();

            if (childDataRef.current.size >= currentChildIdsRef.current.size) {
              hasResolvedInitialLiveDataRef.current = true;
              clearTimeout(initialLoadTimeout);
              setLoading(false);
              setChildrenLoaded(true);
              setStatus('ready');
            }
          },
          (error) => {
            console.warn('[BabyContext] Erreur listener child (permission denied, orphan access?):', childId, error.message);
            // Remove this child from tracked data — the access doc is likely orphaned
            unsub();
            childListeners.delete(childId);
            childDataRef.current.delete(childId);
            currentChildIdsRef.current.delete(childId);
            syncState();
            // Ensure loading resolves even if all children fail
            if (childDataRef.current.size >= currentChildIdsRef.current.size) {
              hasResolvedInitialLiveDataRef.current = true;
              clearTimeout(initialLoadTimeout);
              setLoading(false);
              setChildrenLoaded(true);
              setStatus(
                currentChildIdsRef.current.size === 0 || hasCachedBootstrapRef.current
                  ? 'ready'
                  : 'degraded',
              );
            }
          }
        );

        childListeners.set(childId, unsub);
      });

      // Remove listeners for deleted children
      childListeners.forEach((unsub, childId) => {
        if (!currentChildIds.has(childId)) {
          unsub();
          childListeners.delete(childId);
          childDataRef.current.delete(childId);
        }
      });

      // Sync after access changes (handles child removal)
      syncState();

      if (currentChildIds.size === 0) {
        hasResolvedInitialLiveDataRef.current = true;
        clearTimeout(initialLoadTimeout);
        setLoading(false);
        setChildrenLoaded(true);
        setStatus('ready');
      } else {
        if (hasCachedBootstrapRef.current) {
          setLoading(false);
          setChildrenLoaded(true);
          setStatus('degraded');
        } else {
          setLoading(true);
          setChildrenLoaded(false);
          setStatus('loading');
        }
      }
    }, (error) => {
      console.error('[BabyContext] Erreur lors de l\'écoute des accès:', error);
      clearTimeout(initialLoadTimeout);
      if (hasCachedBootstrapRef.current) {
        setLoading(false);
        setChildrenLoaded(true);
      }
      setStatus('degraded');
    });

    return () => {
      clearTimeout(initialLoadTimeout);
      unsubscribeAccess();
      childListeners.forEach((unsub) => unsub());
      childListeners.clear();
      childDataRef.current.clear();
      currentChildIdsRef.current.clear();
    };
  }, [user, authLoading, syncState]);

  useEffect(() => {
    if (!user?.uid || status === 'loading') return;

    saveCachedBabyState(user.uid, {
      children,
      activeChildId: activeChild?.id ?? null,
    });
  }, [user?.uid, children, activeChild?.id, status]);

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
        const events = await obtenirEvenementsDuJour(childId);
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
    status,
    childrenLoaded,
    hiddenChildrenIds,
    reminderPreferences,
    setActiveChild,
    addChild,
    updateChild,
    deleteChild,
  }), [children, activeChild, loading, status, childrenLoaded, hiddenChildrenIds, reminderPreferences, setActiveChild, addChild, updateChild, deleteChild]);

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
