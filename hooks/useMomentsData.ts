import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ecouterJalonsHybrid } from "@/migration/eventsHybridService";
import {
  ecouterInteractionsSociales,
  getUserNames,
} from "@/services/socialService";
import { JalonEvent } from "@/services/eventsService";
import { LikeInfo } from "@/types/social";

// ============================================
// TYPES
// ============================================

type MilestoneEventWithId = JalonEvent & { id: string };

export type MoodEntry = {
  id: string;
  date: Date;
  humeur: 1 | 2 | 3 | 4 | 5;
};

export type PhotoMilestone = {
  id: string;
  date: Date;
  photo: string;
  titre?: string;
  description?: string;
  typeJalon: string;
  userId?: string;
};

// ============================================
// HELPERS
// ============================================

export const toDate = (value: any): Date => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

export const formatTime = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

// ============================================
// HOOK
// ============================================

export function useMomentsData(
  childId: string | undefined,
  firebaseUid: string | undefined,
) {
  const [events, setEvents] = useState<MilestoneEventWithId[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Social interactions state
  const [likesInfo, setLikesInfo] = useState<Record<string, LikeInfo>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    {},
  );
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});

  // Track whether data has arrived after a refresh
  const refreshResolveRef = useRef<(() => void) | null>(null);

  const refreshToday = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTick((prev) => prev + 1);

    // Minimum visible duration so the user sees the spinner,
    // then resolve as soon as data arrives (or timeout as safety net)
    const startTime = Date.now();
    const MIN_VISIBLE_MS = 600;

    const endRefresh = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      setTimeout(() => setIsRefreshing(false), remaining);
    };

    refreshResolveRef.current = endRefresh;

    // Safety net: if data callback never fires (e.g. offline), stop after 3s
    setTimeout(() => {
      if (refreshResolveRef.current) {
        refreshResolveRef.current();
        refreshResolveRef.current = null;
      }
    }, 3000);
  }, []);

  // Data loading
  useEffect(() => {
    if (!childId) return;

    setLoadError(false);

    const unsubscribe = ecouterJalonsHybrid(
      childId,
      (data) => {
        setEvents(data as MilestoneEventWithId[]);
        setLoaded(true);
        // End pull-to-refresh when data actually arrives
        if (refreshResolveRef.current) {
          refreshResolveRef.current();
          refreshResolveRef.current = null;
        }
      },
      { waitForServer: true, limite: 100 },
      () => {
        setLoaded(true);
        setLoadError(true);
        if (refreshResolveRef.current) {
          refreshResolveRef.current();
          refreshResolveRef.current = null;
        }
      },
    );

    return () => unsubscribe();
  }, [childId, refreshTick]);

  // Mood data processing
  const { moods, currentMood } = useMemo((): {
    moods: MoodEntry[];
    currentMood: MoodEntry | null;
  } => {
    const moodEntries: MoodEntry[] = [];
    let latestMood: MoodEntry | null = null;

    events.forEach((event) => {
      if (event.typeJalon === "humeur" && event.humeur) {
        const entry: MoodEntry = {
          id: event.id,
          date: toDate(event.date),
          humeur: event.humeur as 1 | 2 | 3 | 4 | 5,
        };
        moodEntries.push(entry);
        if (!latestMood || entry.date > latestMood.date) {
          latestMood = entry;
        }
      }
    });

    return { moods: moodEntries, currentMood: latestMood };
  }, [events]);

  // Photo data processing
  const { allPhotoMilestones, displayedPhotoMilestones } = useMemo(() => {
    const photos: PhotoMilestone[] = [];

    events.forEach((event) => {
      if (event.photos && event.photos.length > 0) {
        const photoTitre =
          event.typeJalon === "photo" && event.description
            ? event.description
            : event.titre;

        photos.push({
          id: event.id,
          date: toDate(event.date),
          photo: event.photos[0],
          titre: photoTitre,
          description: event.description,
          typeJalon: event.typeJalon,
          userId: event.userId,
        });
      }
    });

    const sortedPhotos = photos.sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );

    return {
      allPhotoMilestones: sortedPhotos,
      displayedPhotoMilestones: sortedPhotos.slice(0, 3),
    };
  }, [events]);

  // Today's mood for hero card
  const todayMood = useMemo(() => {
    if (!currentMood) return null;
    return isToday(currentMood.date) ? currentMood : null;
  }, [currentMood]);

  // Stable key of other user IDs
  const otherUserIdsKey = useMemo(() => {
    if (!firebaseUid || allPhotoMilestones.length === 0) return "";
    const ids = [
      ...new Set(
        allPhotoMilestones
          .filter((p) => p.userId && p.userId !== firebaseUid)
          .map((p) => p.userId!),
      ),
    ];
    return ids.sort().join(",");
  }, [firebaseUid, allPhotoMilestones]);

  // Resolve author names
  useEffect(() => {
    if (!otherUserIdsKey) return;
    const otherUserIds = otherUserIdsKey.split(",");
    getUserNames(otherUserIds).then((namesMap) => {
      const names: Record<string, string> = {};
      namesMap.forEach((name, uid) => {
        names[uid] = name;
      });
      setAuthorNames(names);
    });
  }, [otherUserIdsKey]);

  // Stable key of photo IDs for social listener
  const photoIdsKey = useMemo(() => {
    return allPhotoMilestones.map((p) => p.id).join(",");
  }, [allPhotoMilestones]);

  // Social interactions listener
  useEffect(() => {
    if (!childId || !photoIdsKey) return;

    const eventIds = photoIdsKey.split(",");

    const unsubscribe = ecouterInteractionsSociales(
      childId,
      eventIds,
      (newLikesInfo) => setLikesInfo(newLikesInfo),
      (newCommentCounts) => setCommentCounts(newCommentCounts),
    );

    return () => unsubscribe();
  }, [childId, photoIdsKey]);

  return {
    events,
    loaded,
    loadError,
    isRefreshing,
    moods,
    todayMood,
    allPhotoMilestones,
    displayedPhotoMilestones,
    likesInfo,
    commentCounts,
    authorNames,
    refreshToday,
    handleRefresh,
  };
}
