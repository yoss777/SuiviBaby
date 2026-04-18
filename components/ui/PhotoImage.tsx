import { getAuthenticatedPhotoSource, isStoragePathPhotoRef } from "@/utils/photoStorage";
import React, { useEffect, useMemo, useState } from "react";
import { Image, ImageProps, ImageSourcePropType, View } from "react-native";

type PhotoImageProps = Omit<ImageProps, "source"> & {
  photoRef?: string | null;
};

export function PhotoImage({
  photoRef,
  style,
  onError,
  ...props
}: PhotoImageProps) {
  const immediateSource = useMemo<ImageSourcePropType | null>(() => {
    if (!photoRef || isStoragePathPhotoRef(photoRef)) return null;
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
          setSource(resolvedSource);
        }
      })
      .catch((error) => {
        console.warn("[PHOTO_IMAGE] Résolution image impossible:", error);
        if (!cancelled) {
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
