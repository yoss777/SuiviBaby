import { getThumbnailPath } from "@/utils/photoThumbnails";
import {
  getAuthenticatedPhotoSource,
  isLocalPhotoUri,
  isStoragePathPhotoRef,
  normalizePhotoRef,
} from "@/utils/photoStorage";
import { Image as ExpoImage, ImageProps as ExpoImageProps, ImageSource } from "expo-image";
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

type PhotoImageProps = Omit<ExpoImageProps, "source"> & {
  photoRef?: string | null;
  resizeMode?: ExpoImageProps["contentFit"];
  fadeDuration?: number;
  /**
   * Grilles : charge la miniature 400 px (générée par le serveur) au lieu de
   * l'original. Repli automatique sur l'original tant que la miniature
   * n'existe pas (photo récente ou ancienne).
   */
  thumbnail?: boolean;
};

const RESOLVED_SOURCE_CACHE_TTL_MS = 50 * 60 * 1000;

const resolvedSourceCache = new Map<
  string,
  { source: ImageSource; cachedAt: number }
>();

/**
 * Miniatures introuvables (photos antérieures à la génération, ou pas encore
 * prête) : on ne réessaie pas à chaque rendu pendant la session.
 */
const missingThumbnails = new Map<string, number>();
const MISSING_THUMBNAIL_TTL_MS = 2 * 60 * 1000;

function isThumbnailMissing(thumbPath: string): boolean {
  const at = missingThumbnails.get(thumbPath);
  if (at === undefined) return false;
  if (Date.now() - at > MISSING_THUMBNAIL_TTL_MS) {
    missingThumbnails.delete(thumbPath);
    return false;
  }
  return true;
}

function getCachedSource(photoRef: string): ImageSource | null {
  const cached = resolvedSourceCache.get(photoRef);
  if (!cached) return null;

  if (Date.now() - cached.cachedAt > RESOLVED_SOURCE_CACHE_TTL_MS) {
    resolvedSourceCache.delete(photoRef);
    return null;
  }

  return cached.source;
}

export function PhotoImage({
  photoRef: rawPhotoRef,
  style,
  onError,
  resizeMode,
  fadeDuration,
  thumbnail,
  ...props
}: PhotoImageProps) {
  // Legacy full URLs point at the US bucket: resolve them as storage paths.
  const originalRef = rawPhotoRef ? normalizePhotoRef(rawPhotoRef) : rawPhotoRef;
  const thumbPath = thumbnail ? getThumbnailPath(originalRef) : null;
  const [thumbFailed, setThumbFailed] = useState(() =>
    thumbPath ? isThumbnailMissing(thumbPath) : false,
  );
  // La cellule recyclée change de photo : on réévalue la miniature.
  useEffect(() => {
    setThumbFailed(thumbPath ? isThumbnailMissing(thumbPath) : false);
  }, [thumbPath]);
  const usingThumbnail = Boolean(thumbPath) && !thumbFailed;
  const photoRef = usingThumbnail ? (thumbPath as string) : originalRef;
  const immediateSource = useMemo<ImageSource | null>(() => {
    if (!photoRef) return null;
    if (isStoragePathPhotoRef(photoRef)) {
      return getCachedSource(photoRef);
    }
    if (isLocalPhotoUri(photoRef)) {
      return { uri: photoRef };
    }
    return { uri: photoRef, cacheKey: photoRef };
  }, [photoRef]);

  const [source, setSource] = useState<ImageSource | null>(
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

    if (immediateSource) {
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
    <ExpoImage
      {...props}
      source={source}
      cachePolicy={isLocalPhotoUri(photoRef) ? "none" : "memory-disk"}
      priority={props.priority ?? "normal"}
      recyclingKey={props.recyclingKey ?? originalRef ?? undefined}
      contentFit={props.contentFit ?? resizeMode}
      transition={props.transition ?? fadeDuration}
      style={style}
      onError={(event) => {
        if (usingThumbnail && thumbPath) {
          // Miniature absente : on bascule sur l'original, sans erreur visible.
          missingThumbnails.set(thumbPath, Date.now());
          setThumbFailed(true);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
