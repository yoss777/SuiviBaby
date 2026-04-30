import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useBaby } from '@/contexts/BabyContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, Timestamp, where } from 'firebase/firestore';
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

const MomentsNotificationContext = createContext<MomentsNotificationContextType | undefined>(undefined);

const LAST_SEEN_KEY_PREFIX = 'moments_last_seen_';
const SEEN_IDS_KEY_PREFIX = 'moments_seen_ids_';

// Helper pour extraire le timestamp
const getTimestamp = (createdAt: any): number => {
  if (createdAt instanceof Timestamp) {
    return createdAt.toMillis();
  } else if (createdAt?.seconds) {
    return createdAt.seconds * 1000;
  } else if (createdAt instanceof Date) {
    return createdAt.getTime();
  }
  return 0;
};

export function MomentsNotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeChild } = useBaby();
  const [hasNewMoments, setHasNewMoments] = useState(false);
  const [newMomentsCount, setNewMomentsCount] = useState(0);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const [newEventTypes, setNewEventTypes] = useState<Map<string, NotificationType>>(new Map());
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
    setNewMomentsCount(total);
    setHasNewMoments(total > 0);

    // Combiner tous les IDs d'événements avec nouvelles interactions
    const allIds = new Set<string>([
      ...eventIdsRef.current.jalons,
      ...eventIdsRef.current.likesEvents,
      ...eventIdsRef.current.commentsEvents,
    ]);
    setNewEventIds(allIds);

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
    setNewEventTypes(typesMap);
  }, []);

  // Charger le dernier timestamp vu depuis AsyncStorage
  useEffect(() => {
    if (!activeChild?.id || !user?.uid) {
      setHasNewMoments(false);
      setNewMomentsCount(0);
      setNewEventIds(new Set());
      setNewEventTypes(new Map());
      setIsInitialized(false);
      countsRef.current = { jalons: 0, likes: 0, comments: 0 };
      eventIdsRef.current = { jalons: new Set(), likesEvents: new Set(), commentsEvents: new Set() };
      return;
    }

    const loadLastSeen = async () => {
      try {
        const localKey = `${LAST_SEEN_KEY_PREFIX}${user.uid}_${activeChild.id}`;
        const localSeenKey = `${SEEN_IDS_KEY_PREFIX}${user.uid}_${activeChild.id}`;

        // 1. Load local cache (fast)
        const [localStored, localSeenIds] = await Promise.all([
          AsyncStorage.getItem(localKey),
          AsyncStorage.getItem(localSeenKey),
        ]);

        if (localStored) {
          lastSeenTimestampRef.current = parseInt(localStored, 10);
        }
        if (localSeenIds) {
          seenEventIdsRef.current = new Set(JSON.parse(localSeenIds));
        }

        // 2. Load from Firestore (source of truth, may override local)
        const firestoreDoc = await getDoc(
          doc(db, 'user_preferences', user.uid)
        );
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
        console.error('[MomentsNotification] Erreur chargement lastSeen:', error);
        lastSeenTimestampRef.current = Date.now();
        setIsInitialized(true);
      }
    };

    loadLastSeen();
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
      console.log(`[MomentsNotification] Démarrage des listeners, lastSeen=${lastSeenTimestampRef.current}, userId=${userId}, user.uid=${user?.uid}`);

      // Écouter les jalons
      const jalonsQuery = query(
        collection(db, 'events'),
        where('childId', '==', childId),
        where('type', '==', 'jalon'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      unsubscribes.push(onSnapshot(jalonsQuery, (snapshot) => {
        let count = 0;
        const newJalonIds = new Set<string>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const timestamp = getTimestamp(data.createdAt);
          const hasPhotos = Array.isArray(data.photos) && data.photos.length > 0;
          if (hasPhotos && data.userId !== userId && timestamp > lastSeenTimestampRef.current && !seenEventIdsRef.current.has(d.id)) {
            count++;
            newJalonIds.add(d.id);
            console.log(`[MomentsNotification] NEW jalon with photo: ${d.id}, createdAt=${timestamp}, lastSeen=${lastSeenTimestampRef.current}, by=${data.userId}`);
          }
        });

        console.log(`[MomentsNotification] jalons: ${count} new out of ${snapshot.size} total`);
        countsRef.current.jalons = count;
        eventIdsRef.current.jalons = newJalonIds;
        updateTotalCount();
      }, (error) => {
        console.error('[MomentsNotification] Erreur listener jalons:', error);
      }));

      // Écouter les likes
      const likesQuery = query(
        collection(db, 'eventLikes'),
        where('childId', '==', childId),
        orderBy('createdAt', 'desc'),
        limit(500)
      );

      unsubscribes.push(onSnapshot(likesQuery, (snapshot) => {
        let count = 0;
        const newLikeEventIds = new Set<string>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const timestamp = getTimestamp(data.createdAt);
          if (data.userId !== userId && timestamp > lastSeenTimestampRef.current && !seenEventIdsRef.current.has(data.eventId)) {
            count++;
            if (data.eventId) {
              newLikeEventIds.add(data.eventId);
            }
          }
        });

        console.log(`[MomentsNotification] likes: ${count} new out of ${snapshot.size} total`);
        countsRef.current.likes = count;
        eventIdsRef.current.likesEvents = newLikeEventIds;
        updateTotalCount();
      }, (error) => {
        console.error('[MomentsNotification] Erreur listener likes:', error);
      }));

      // Écouter les commentaires
      const commentsQuery = query(
        collection(db, 'eventComments'),
        where('childId', '==', childId),
        orderBy('createdAt', 'desc'),
        limit(500)
      );

      unsubscribes.push(onSnapshot(commentsQuery, (snapshot) => {
        let count = 0;
        const newCommentEventIds = new Set<string>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const timestamp = getTimestamp(data.createdAt);
          if (data.userId !== userId && timestamp > lastSeenTimestampRef.current && !seenEventIdsRef.current.has(data.eventId)) {
            count++;
            if (data.eventId) {
              newCommentEventIds.add(data.eventId);
            }
          }
        });

        console.log(`[MomentsNotification] comments: ${count} new out of ${snapshot.size} total`);
        countsRef.current.comments = count;
        eventIdsRef.current.commentsEvents = newCommentEventIds;
        updateTotalCount();
      }, (error) => {
        console.error('[MomentsNotification] Erreur listener comments:', error);
      }));
    }, 1500);

    return () => {
      clearTimeout(timer);
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [activeChild?.id, user?.uid, isInitialized, updateTotalCount]);

  const markMomentsAsSeen = useCallback(async () => {
    if (!activeChild?.id || !user?.uid) return;

    const now = Date.now();
    lastSeenTimestampRef.current = now;
    seenEventIdsRef.current = new Set();
    countsRef.current = { jalons: 0, likes: 0, comments: 0 };
    eventIdsRef.current = { jalons: new Set(), likesEvents: new Set(), commentsEvents: new Set() };
    setHasNewMoments(false);
    setNewMomentsCount(0);
    setNewEventIds(new Set());
    setNewEventTypes(new Map());

    try {
      const key = `${LAST_SEEN_KEY_PREFIX}${user.uid}_${activeChild.id}`;
      const seenKey = `${SEEN_IDS_KEY_PREFIX}${user.uid}_${activeChild.id}`;
      await Promise.all([
        AsyncStorage.setItem(key, now.toString()),
        AsyncStorage.removeItem(seenKey),
        setDoc(doc(db, 'user_preferences', user.uid), { momentsLastSeen: now, momentsSeenIds: [] }, { merge: true }),
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
      setDoc(doc(db, 'user_preferences', user.uid), { momentsSeenIds: ids }, { merge: true }).catch(() => {});
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
