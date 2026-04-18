import { getAuthenticatedPhotoSource, isStoragePathPhotoRef } from "@/utils/photoStorage";
import React, { useEffect, useMemo, useState } from "react";
import { Image, ImageProps, ImageSourcePropType, View } from "react-native";

type PhotoImageProps = Omit<ImageProps, "source"> & {
  photoRef?: string | null;
};

const RESOLVED_SOURCE_CACHE_TTL_MS = 50 * 60 * 1000;

const resolvedSourceCache = new Map<
  string,
  { source: ImageSourcePropType; cachedAt: number }
>();

function getCachedSource(photoRef: string): ImageSourcePropType | null {
  const cached = resolvedSourceCache.get(photoRef);
  if (!cached) return null;

  if (Date.now() - cached.cachedAt > RESOLVED_SOURCE_CACHE_TTL_MS) {
    resolvedSourceCache.delete(photoRef);
    return null;
  }

  return cached.source;
}

export function PhotoImage({
  photoRef,
  style,
  onError,
  ...props
}: PhotoImageProps) {
  const immediateSource = useMemo<ImageSourcePropType | null>(() => {
    if (!photoRef) return null;
    if (isStoragePathPhotoRef(photoRef)) {
      return getCachedSource(photoRef);
    }
    return { uri: photoRef };
  }, [photoRef]);

  const [source, setSource] = useState<ImageSourcePropType | null>(
    immediateSource,
  );

  useEffect(() => {
    let cancelled = false;

    setSource(immediateSource);

    if (!photoRef || !isStoragePathPhotoRef(photoRef)) {
      return () => {
        cancelled = true;
      };
    }

    getAuthenticatedPhotoSource(photoRef)
      .then((resolvedSource) => {
        if (!cancelled) {
          if (resolvedSource) {
            resolvedSourceCache.set(photoRef, {
              source: resolvedSource,
              cachedAt: Date.now(),
            });
          }
          setSource(resolvedSource);
        }
      })
      .catch((error) => {
        console.warn("[PHOTO_IMAGE] Résolution image impossible:", error);
        if (!cancelled) {
          resolvedSourceCache.delete(photoRef);
          setSource(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [photoRef, immediateSource]);

  if (!photoRef) return null;

  if (!source) {
    return <View style={style} />;
  }

  return (
    <Image
      {...props}
      source={source}
      style={style}
      onError={onError}
    />
  );
}
