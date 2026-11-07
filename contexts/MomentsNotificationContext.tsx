import { useAuth } from '@/contexts/AuthContext';
import { useBaby } from '@/contexts/BabyContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SocialInteractionsProvider, useSocialInteractions } from '@/contexts/SocialInteractionsContext';
import { listenToRecentJalons } from '@/services/eventsRepository';
import { isFirestoreTimestamp } from '@/services/firestoreTimestamps';
import { getUserPreferencesDoc, mergeUserPreferences } from '@/services/userPreferencesService';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type NotificationType = 'photo' | 'like' | 'comment';

interface MomentsNotificationContextType {
  hasNewMoments: boolean;
  newMomentsCount: number;
  newEventIds: Set<string>;
  /** Type de notification dominant par eventId (photo > comment > like) */
  newEventTypes: Map<string, NotificationType>;
  markMomentsAsSeen: () => void;
  markEventAsSeen: (eventId: string) => void;
}

type BadgeState = {
  childId: string | undefined;
  count: number;
  ids: Set<string>;
  types: Map<string, NotificationType>;
};
const EMPTY_IDS: Set<string> = new Set();
const EMPTY_TYPES: Map<string, NotificationType> = new Map();
const EMPTY_BADGE: BadgeState = { childId: undefined, count: 0, ids: EMPTY_IDS, types: EMPTY_TYPES };

const MomentsNotificationContext = createContext<MomentsNotificationContextType | undefined>(undefined);

const LAST_SEEN_KEY_PREFIX = 'moments_last_seen_';
const SEEN_IDS_KEY_PREFIX = 'moments_seen_ids_';

// Helper pour extraire le timestamp
const getTimestamp = (createdAt: any): number => {
  if (isFirestoreTimestamp(createdAt)) {
    return createdAt.toMillis();
  } else if (createdAt?.seconds) {
    return createdAt.seconds * 1000;
  } else if (createdAt instanceof Date) {
    return createdAt.getTime();
  }
  return 0;
};

/**
 * Événements ayant de nouveaux likes/commentaires d'un AUTRE utilisateur depuis
 * le dernier passage. Les documents arrivent triés du plus récent au plus
 * ancien : on s'arrête au premier plus ancien que `lastSeen`, le badge est donc
 * borné par date et ne parcourt jamais tout l'historique.
 */
export function collectNewInteractionEventIds(
  docs: readonly { userId?: string; eventId?: string; createdAt?: any }[],
  userId: string,
  lastSeen: number,
  seenEventIds: ReadonlySet<string>,
): { count: number; eventIds: Set<string> } {
  let count = 0;
  const eventIds = new Set<string>();
  for (const data of docs) {
    const timestamp = getTimestamp(data.createdAt);
    // Triés par date décroissante : tout ce qui suit est déjà vu.
    if (timestamp > 0 && timestamp <= lastSeen) break;
    if (data.userId !== userId && timestamp > lastSeen && !seenEventIds.has(data.eventId as string)) {
      count++;
      if (data.eventId) eventIds.add(data.eventId);
    }
  }
  return { count, eventIds };
}

/**
 * Le provider enveloppe le provider social partagé : les likes et commentaires
 * sont lus une seule fois pour tout le monde (badge, Moments, Galerie).
 */
export function MomentsNotificationProvider({ children }: { children: ReactNode }) {
  return (
    <SocialInteractionsProvider>
      <MomentsNotificationInner>{children}</MomentsNotificationInner>
    </SocialInteractionsProvider>
  );
}

function MomentsNotificationInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeChild } = useBaby();
  const { likes: sharedLikes, comments: sharedComments } = useSocialInteractions();
  const activeChildId = activeChild?.id;
  const activeChildIdRef = useRef(activeChildId);
  activeChildIdRef.current = activeChildId;
  // Badge rattaché à l'enfant qui l'a produit : après un changement d'enfant,
  // celui du précédent n'est jamais exposé (même une frame).
  const [badge, setBadge] = useState<BadgeState>(EMPTY_BADGE);
  const lastSeenTimestampRef = useRef<number>(0);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  // Compteurs par type pour éviter les problèmes de synchronisation
  const countsRef = useRef({ jalons: 0, likes: 0, comments: 0 });
  // IDs des événements avec nouvelles interactions
  const eventIdsRef = useRef<{ jalons: Set<string>; likesEvents: Set<string>; commentsEvents: Set<string> }>({
    jalons: new Set(),
    likesEvents: new Set(),
    commentsEvents: new Set(),
  });

  const updateTotalCount = useCallback(() => {
    const total = countsRef.current.jalons + countsRef.current.likes + countsRef.current.comments;

    // Combiner tous les IDs d'événements avec nouvelles interactions
    const allIds = new Set<string>([
      ...eventIdsRef.current.jalons,
      ...eventIdsRef.current.likesEvents,
      ...eventIdsRef.current.commentsEvents,
    ]);

    // Build type map with priority: photo > comment > like
    const typesMap = new Map<string, NotificationType>();
    for (const id of eventIdsRef.current.likesEvents) {
      typesMap.set(id, 'like');
    }
    for (const id of eventIdsRef.current.commentsEvents) {
      typesMap.set(id, 'comment');
    }
    for (const id of eventIdsRef.current.jalons) {
      typesMap.set(id, 'photo');
    }
    setBadge({ childId: activeChildIdRef.current, count: total, ids: allIds, types: typesMap });
  }, []);

  // Charger le dernier timestamp vu depuis AsyncStorage
  useEffect(() => {
    // Remise à zéro à chaque changement d'enfant / d'utilisateur : ni badge,
    // ni lastSeen, ni IDs vus de l'enfant précédent ne doivent survivre.
    setBadge({ childId: activeChildIdRef.current, count: 0, ids: EMPTY_IDS, types: EMPTY_TYPES });
    setIsInitialized(false);
    countsRef.current = { jalons: 0, likes: 0, comments: 0 };
    eventIdsRef.current = { jalons: new Set(), likesEvents: new Set(), commentsEvents: new Set() };
    lastSeenTimestampRef.current = 0;
    seenEventIdsRef.current = new Set();
    if (!activeChild?.id || !user?.uid) return;
    let cancelled = false;

    const loadLastSeen = async () => {
      try {
        const localKey = `${LAST_SEEN_KEY_PREFIX}${user.uid}_${activeChild.id}`;
        const localSeenKey = `${SEEN_IDS_KEY_PREFIX}${user.uid}_${activeChild.id}`;

        // 1. Load local cache (fast)
        const [localStored, localSeenIds] = await Promise.all([
          AsyncStorage.getItem(localKey),
          AsyncStorage.getItem(localSeenKey),
        ]);

        if (cancelled) return;
        if (localStored) {
          lastSeenTimestampRef.current = parseInt(localStored, 10);
        }
        if (localSeenIds) {
          seenEventIdsRef.current = new Set(JSON.parse(localSeenIds));
        }

        // 2. Load from Firestore (source of truth, may override local)
        const firestoreDoc = await getUserPreferencesDoc(user.uid);
        if (cancelled) return;
        const firestoreData = firestoreDoc.data();
        const fsLastSeen = firestoreData?.momentsLastSeen as number | undefined;
        const fsSeenIds = firestoreData?.momentsSeenIds as string[] | undefined;

        if (fsLastSeen && fsLastSeen > lastSeenTimestampRef.current) {
          lastSeenTimestampRef.current = fsLastSeen;
          AsyncStorage.setItem(localKey, fsLastSeen.toString()).catch(() => {});
        }
        if (fsSeenIds) {
          // Merge Firestore + local seen IDs
          for (const id of fsSeenIds) seenEventIdsRef.current.add(id);
          AsyncStorage.setItem(localSeenKey, JSON.stringify([...seenEventIdsRef.current].slice(-500))).catch(() => {});
        }

        // 3. If nothing found anywhere, set to now (first use)
        if (!localStored && !fsLastSeen) {
          lastSeenTimestampRef.current = Date.now();
          AsyncStorage.setItem(localKey, lastSeenTimestampRef.current.toString()).catch(() => {});
        }

        setIsInitialized(true);
      } catch (error) {
        if (cancelled) return;
        console.error('[MomentsNotification] Erreur chargement lastSeen:', error);
        lastSeenTimestampRef.current = Date.now();
        setIsInitialized(true);
      }
    };

    loadLastSeen();
    return () => {
      cancelled = true;
    };
  }, [activeChild?.id, user?.uid]);

  // R6: Defer listeners — start after a short delay so Home renders first
  useEffect(() => {
    if (!activeChild?.id || !user?.uid || !isInitialized) {
      return;
    }

    const childId = activeChild.id;
    const userId = user.uid;
    let unsubscribes: (() => void)[] = [];

    const timer = setTimeout(() => {
      if (__DEV__) console.log(`[MomentsNotification] Démarrage des listeners, lastSeen=${lastSeenTimestampRef.current}, userId=${userId}, user.uid=${user?.uid}`);

      // Écouter les jalons
      unsubscribes.push(listenToRecentJalons(childId, (snapshot) => {
        let count = 0;
        const newJalonIds = new Set<string>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const timestamp = getTimestamp(data.createdAt);
          const hasPhotos = Array.isArray(data.photos) && data.photos.length > 0;
          if (hasPhotos && data.userId !== userId && timestamp > lastSeenTimestampRef.current && !seenEventIdsRef.current.has(d.id)) {
            count++;
            newJalonIds.add(d.id);
            if (__DEV__) console.log(`[MomentsNotification] NEW jalon with photo: ${d.id}, createdAt=${timestamp}, lastSeen=${lastSeenTimestampRef.current}, by=${data.userId}`);
          }
        });

        if (__DEV__) console.log(`[MomentsNotification] jalons: ${count} new out of ${snapshot.size} total`);
        countsRef.current.jalons = count;
        eventIdsRef.current.jalons = newJalonIds;
        updateTotalCount();
      }, (error) => {
        console.error('[MomentsNotification] Erreur listener jalons:', error);
      }));
    }, 1500);

    return () => {
      clearTimeout(timer);
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [activeChild?.id, user?.uid, isInitialized, updateTotalCount]);

  // Likes et commentaires : lus par le provider partagé (un écouteur chacun),
  // ici on ne fait que calculer le badge. Recalcul à chaque changement des
  // documents partagés, une fois lastSeen / seenIds chargés.
  useEffect(() => {
    if (!user?.uid || !isInitialized) return;
    const likesResult = collectNewInteractionEventIds(
      sharedLikes, user.uid, lastSeenTimestampRef.current, seenEventIdsRef.current,
    );
    const commentsResult = collectNewInteractionEventIds(
      sharedComments, user.uid, lastSeenTimestampRef.current, seenEventIdsRef.current,
    );
    countsRef.current.likes = likesResult.count;
    eventIdsRef.current.likesEvents = likesResult.eventIds;
    countsRef.current.comments = commentsResult.count;
    eventIdsRef.current.commentsEvents = commentsResult.eventIds;
    updateTotalCount();
  }, [sharedLikes, sharedComments, user?.uid, isInitialized, updateTotalCount]);

  const markMomentsAsSeen = useCallback(async () => {
    if (!activeChild?.id || !user?.uid) return;

    const now = Date.now();
    lastSeenTimestampRef.current = now;
    seenEventIdsRef.current = new Set();
    countsRef.current = { jalons: 0, likes: 0, comments: 0 };
    eventIdsRef.current = { jalons: new Set(), likesEvents: new Set(), commentsEvents: new Set() };
    setBadge({ childId: activeChildIdRef.current, count: 0, ids: EMPTY_IDS, types: EMPTY_TYPES });

    try {
      const key = `${LAST_SEEN_KEY_PREFIX}${user.uid}_${activeChild.id}`;
      const seenKey = `${SEEN_IDS_KEY_PREFIX}${user.uid}_${activeChild.id}`;
      await Promise.all([
        AsyncStorage.setItem(key, now.toString()),
        AsyncStorage.removeItem(seenKey),
        mergeUserPreferences(user.uid, { momentsLastSeen: now, momentsSeenIds: [] }),
      ]);
    } catch (error) {
      console.error('[MomentsNotification] Erreur sauvegarde lastSeen:', error);
    }
  }, [activeChild?.id, user?.uid]);

  const markEventAsSeen = useCallback((eventId: string) => {
    // Remove from each category ref
    eventIdsRef.current.jalons.delete(eventId);
    eventIdsRef.current.likesEvents.delete(eventId);
    eventIdsRef.current.commentsEvents.delete(eventId);

    // Persist seen ID locally + Firestore
    seenEventIdsRef.current.add(eventId);
    if (activeChild?.id && user?.uid) {
      const ids = [...seenEventIdsRef.current].slice(-500);
      const seenKey = `${SEEN_IDS_KEY_PREFIX}${user.uid}_${activeChild.id}`;
      AsyncStorage.setItem(seenKey, JSON.stringify(ids)).catch(() => {});
      mergeUserPreferences(user.uid, { momentsSeenIds: ids }).catch(() => {});
    }

    // Recount
    countsRef.current.jalons = eventIdsRef.current.jalons.size;
    countsRef.current.likes = eventIdsRef.current.likesEvents.size;
    countsRef.current.comments = eventIdsRef.current.commentsEvents.size;

    updateTotalCount();
  }, [updateTotalCount, activeChild?.id, user?.uid]);

  // Memoise the provider value so consumers only re-render when one of the
  // observed pieces actually changes — without this, every render of the
  // parent (BabyProvider, AuthProvider, etc.) created a fresh value object
  // and forced every useMomentsNotification() consumer to re-render.
  const current = badge.childId === activeChildId ? badge : EMPTY_BADGE;
  const hasNewMoments = current.count > 0;
  const newMomentsCount = current.count;
  const newEventIds = current.ids;
  const newEventTypes = current.types;
  const value = useMemo<MomentsNotificationContextType>(
    () => ({
      hasNewMoments,
      newMomentsCount,
      newEventIds,
      newEventTypes,
      markMomentsAsSeen,
      markEventAsSeen,
    }),
    [
      hasNewMoments,
      newMomentsCount,
      newEventIds,
      newEventTypes,
      markMomentsAsSeen,
      markEventAsSeen,
    ],
  );

  return (
    <MomentsNotificationContext.Provider value={value}>
      {children}
    </MomentsNotificationContext.Provider>
  );
}

export function useMomentsNotification() {
  const context = useContext(MomentsNotificationContext);
  if (context === undefined) {
    throw new Error('useMomentsNotification must be used within a MomentsNotificationProvider');
  }
  return context;
}
