import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { onHiddenPhotosChange } from "@/services/hiddenPhotosService";

/**
 * Real-time listener for the current user's hidden photo event IDs.
 * Returns a Set for O(1) lookup in photo lists.
 */
export function useHiddenPhotos(): Set<string> {
  const { user } = useAuth();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.uid) {
      setHiddenIds(new Set());
      return;
    }

    const unsubscribe = onHiddenPhotosChange((ids) => {
      setHiddenIds(new Set(ids));
    });

    return unsubscribe;
  }, [user?.uid]);

  return hiddenIds;
}
