// utils/photoResize.ts
//
// S7.3 : redimensionnement d'une photo avant envoi. Un cliché d'appareil
// (12 Mpx, 3 à 5 Mo) est ramené à 1600 px sur le grand côté, en JPEG : l'envoi
// est ~10x plus léger et la limite de 5 Mo des règles Storage n'est plus un
// risque. En cas d'échec, la photo d'origine est envoyée telle quelle.
import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

/** Grand côté maximal d'une photo envoyée. */
export const UPLOAD_MAX_SIDE = 1600;
/** Qualité JPEG de la photo envoyée. */
export const UPLOAD_JPEG_QUALITY = 0.8;

/** Dimensions de l'image, ou null si elles sont illisibles. */
function getImageSize(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}

/**
 * Action de redimensionnement à appliquer, ou null si l'image tient déjà dans
 * `maxSide`. On ne fixe que le grand côté : le ratio est conservé.
 */
export function computeResizeAction(
  width: number,
  height: number,
  maxSide: number = UPLOAD_MAX_SIDE,
): { resize: { width: number } | { height: number } } | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.max(width, height) <= maxSide) return null;
  return { resize: width >= height ? { width: maxSide } : { height: maxSide } };
}

/**
 * Prépare une photo locale pour l'envoi : grand côté <= 1600 px, JPEG.
 * Retourne l'URI du fichier à envoyer (`temporary` = fichier créé ici, à
 * supprimer après l'envoi). Ne lève jamais : repli sur l'original.
 */
export async function resizePhotoForUpload(
  uri: string,
  maxSide: number = UPLOAD_MAX_SIDE,
): Promise<{ uri: string; temporary: boolean }> {
  try {
    const size = await getImageSize(uri);
    const action = size ? computeResizeAction(size.width, size.height, maxSide) : null;
    const result = await ImageManipulator.manipulateAsync(uri, action ? [action] : [], {
      compress: UPLOAD_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: result.uri, temporary: result.uri !== uri };
  } catch (error) {
    console.warn("[PHOTO_RESIZE] Redimensionnement impossible, envoi de l'original:", error);
    return { uri, temporary: false };
  }
}
