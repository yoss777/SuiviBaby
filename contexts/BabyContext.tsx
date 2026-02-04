import { db } from '@/config/firebase';
import { obtenirPreferences } from '@/services/userPreferencesService';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
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

interface BabyContextType {
  children: Child[];
  activeChild: Child | null;
  loading: boolean;
  childrenLoaded: boolean;
  hiddenChildrenIds: string[];
  setActiveChild: (child: Child) => void;
  addChild: (child: Child) => void;
  updateChild: (id: string, child: Partial<Child>) => void;
  deleteChild: (id: string) => void;
}

const BabyContext = createContext<BabyContextType | undefined>(undefined);

export function BabyProvider({ children: childrenProp }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [activeChild, setActiveChildState] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);
  const [childrenLoaded, setChildrenLoaded] = useState(false);
  const [hiddenChildrenIds, setHiddenChildrenIds] = useState<string[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const preloadInFlight = useRef<Set<string>>(new Set());
  const childListenersRef = useRef<Map<string, () => void>>(new Map());
  const childDataRef = useRef<Map<string, Child>>(new Map());
  const currentChildIdsRef = useRef<Set<string>>(new Set());

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
        setHiddenChildrenIds(data.hiddenChildrenIds || []);
      } else {
        setHiddenChildrenIds([]);
      }
      setPreferencesLoaded(true);
    }, (error) => {
      console.error('Erreur lors de l\'écoute des préférences:', error);
      // En cas d'erreur (document n'existe pas encore), charger de manière asynchrone
      obtenirPreferences().then(prefs => {
        setHiddenChildrenIds(prefs.hiddenChildrenIds || []);
        setPreferencesLoaded(true);
      }).catch(err => {
        console.error('Erreur lors du chargement des préférences:', err);
        setPreferencesLoaded(true);
      });
    });

    return () => unsubscribe();
  }, [user]);

  // Charger les enfants depuis Firestore
  useEffect(() => {
    // Si l'auth est encore en cours de chargement, rester en loading
    if (authLoading) {
      console.log('[BabyContext] Auth en cours de chargement...');
      setLoading(true);
      setChildrenLoaded(false);
      return;
    }

    if (!user?.uid) {
      console.log('[BabyContext] Pas de user.uid, arrêt du chargement');
      setChildren([]);
      setActiveChildState(null);
      setLoading(false);
      setChildrenLoaded(false);
      return;
    }

    // Attendre que les préférences soient chargées
    if (!preferencesLoaded) {
      console.log('[BabyContext] En attente du chargement des préférences...');
      setLoading(true); // IMPORTANT : rester en loading tant que les préférences ne sont pas chargées
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
    console.log('[BabyContext] Query user_child_access where userId ==', user.uid);

    const unsubscribeAccess = onSnapshot(accessQuery, (snapshot) => {
      const currentChildIds = new Set<string>();
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as { childId?: string; userId?: string };
        if (data.userId !== user.uid) return;
        if (data.childId) currentChildIds.add(data.childId);
      });
      currentChildIdsRef.current = currentChildIds;

      // Ajouter listeners pour les nouveaux enfants
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

            const allChildren = Array.from(childDataRef.current.values());
            const visibleChildren = allChildren.filter(
              (child) => !hiddenChildrenIds.includes(child.id)
            );
            visibleChildren.sort((a, b) => a.name.localeCompare(b.name));
            setChildren(visibleChildren);

            setActiveChildState((prev) => {
              if (!prev && visibleChildren.length > 0) {
                return visibleChildren[0];
              }
              if (prev && hiddenChildrenIds.includes(prev.id)) {
                return visibleChildren[0] || null;
              }
              return prev;
            });

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

      // Retirer listeners pour les enfants supprimés
      childListenersRef.current.forEach((unsub, childId) => {
        if (!currentChildIds.has(childId)) {
          unsub();
          childListenersRef.current.delete(childId);
          childDataRef.current.delete(childId);
        }
      });

      const allChildren = Array.from(childDataRef.current.values());
      const visibleChildren = allChildren.filter(
        (child) => !hiddenChildrenIds.includes(child.id)
      );
      visibleChildren.sort((a, b) => a.name.localeCompare(b.name));
      setChildren(visibleChildren);

      setActiveChildState((prev) => {
        if (!prev && visibleChildren.length > 0) {
          return visibleChildren[0];
        }
        if (prev && hiddenChildrenIds.includes(prev.id)) {
          return visibleChildren[0] || null;
        }
        return prev;
      });

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
  }, [user, hiddenChildrenIds, preferencesLoaded, authLoading]);

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

  const setActiveChild = (child: Child) => {
    setActiveChildState(child);
  };

  const addChild = (child: Child) => {
    setChildren((prev) => [...prev, child]);
  };

  const updateChild = (id: string, updatedChild: Partial<Child>) => {
    setChildren((prev) =>
      prev.map((child) => (child.id === id ? { ...child, ...updatedChild } : child))
    );
    if (activeChild?.id === id) {
      setActiveChildState((prev) => (prev ? { ...prev, ...updatedChild } : null));
    }
  };

  const deleteChild = (id: string) => {
    setChildren((prev) => prev.filter((child) => child.id !== id));
    if (activeChild?.id === id) {
      const remainingChildren = children.filter((child) => child.id !== id);
      setActiveChildState(remainingChildren[0] || null);
    }
  };

  return (
    <BabyContext.Provider
      value={{
        children,
        activeChild,
        loading,
        childrenLoaded,
        hiddenChildrenIds,
        setActiveChild,
        addChild,
        updateChild,
        deleteChild,
      }}
    >
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
