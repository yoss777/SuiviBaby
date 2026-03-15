import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useBaby } from '@/contexts/BabyContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

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
        const key = `${LAST_SEEN_KEY_PREFIX}${user.uid}_${activeChild.id}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          lastSeenTimestampRef.current = parseInt(stored, 10);
        } else {
          // Première utilisation: marquer comme "maintenant" pour ne pas afficher de badge
          lastSeenTimestampRef.current = Date.now();
          await AsyncStorage.setItem(key, lastSeenTimestampRef.current.toString());
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
      console.log('[MomentsNotification] Démarrage des listeners, lastSeen:', lastSeenTimestampRef.current);

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
          if (data.userId !== userId && timestamp > lastSeenTimestampRef.current) {
            count++;
            newJalonIds.add(d.id);
          }
        });

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
          if (data.userId !== userId && timestamp > lastSeenTimestampRef.current) {
            count++;
            if (data.eventId) {
              newLikeEventIds.add(data.eventId);
            }
          }
        });

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
          if (data.userId !== userId && timestamp > lastSeenTimestampRef.current) {
            count++;
            if (data.eventId) {
              newCommentEventIds.add(data.eventId);
            }
          }
        });

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
    countsRef.current = { jalons: 0, likes: 0, comments: 0 };
    eventIdsRef.current = { jalons: new Set(), likesEvents: new Set(), commentsEvents: new Set() };
    setHasNewMoments(false);
    setNewMomentsCount(0);
    setNewEventIds(new Set());
    setNewEventTypes(new Map());

    try {
      const key = `${LAST_SEEN_KEY_PREFIX}${user.uid}_${activeChild.id}`;
      await AsyncStorage.setItem(key, now.toString());
    } catch (error) {
      console.error('[MomentsNotification] Erreur sauvegarde lastSeen:', error);
    }
  }, [activeChild?.id, user?.uid]);

  const markEventAsSeen = useCallback((eventId: string) => {
    // Remove from each category ref
    eventIdsRef.current.jalons.delete(eventId);
    eventIdsRef.current.likesEvents.delete(eventId);
    eventIdsRef.current.commentsEvents.delete(eventId);

    // Recount
    countsRef.current.jalons = eventIdsRef.current.jalons.size;
    countsRef.current.likes = eventIdsRef.current.likesEvents.size;
    countsRef.current.comments = eventIdsRef.current.commentsEvents.size;

    updateTotalCount();
  }, [updateTotalCount]);

  return (
    <MomentsNotificationContext.Provider
      value={{
        hasNewMoments,
        newMomentsCount,
        newEventIds,
        newEventTypes,
        markMomentsAsSeen,
        markEventAsSeen,
      }}
    >
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
