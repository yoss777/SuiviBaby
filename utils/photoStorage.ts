import { auth } from "@/config/firebase";

export const FIREBASE_STORAGE_BUCKET = "samaye-53723.firebasestorage.app";

const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000;

let cachedToken: string | null = null;
let cachedAt = 0;
let inflightTokenPromise: Promise<string | null> | null = null;

export function isRemoteHttpUri(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isLocalPhotoUri(value: string): boolean {
  return /^(file|content|ph|assets-library|blob|data):/i.test(value);
}

export function isFirebaseStorageDownloadUrl(value: string): boolean {
  return value.startsWith("https://firebasestorage.googleapis.com/");
}

export function isStoragePathPhotoRef(value: string): boolean {
  return Boolean(value) &&
    !isRemoteHttpUri(value) &&
    !isLocalPhotoUri(value) &&
    !value.startsWith("gs://");
}

export function extractStoragePath(photoRef: string): string | null {
  if (!photoRef) return null;

  if (isFirebaseStorageDownloadUrl(photoRef)) {
    const match = photoRef.match(/\/o\/([^?]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  if (isStoragePathPhotoRef(photoRef)) {
    return photoRef;
  }

  return null;
}

export function buildStorageMediaUrl(filePath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(filePath)}?alt=media`;
}

async function getCurrentUserIdToken(): Promise<string | null> {
  const now = Date.now();

  if (cachedToken && now - cachedAt < TOKEN_CACHE_TTL_MS) {
    return cachedToken;
  }

  if (inflightTokenPromise) {
    return inflightTokenPromise;
  }

  inflightTokenPromise = auth.currentUser
    ?.getIdToken()
    .then((token) => {
      cachedToken = token;
      cachedAt = Date.now();
      return token;
    })
    .catch((error) => {
      console.warn("[PHOTO_STORAGE] Impossible de récupérer le token:", error);
      cachedToken = null;
      cachedAt = 0;
      return null;
    })
    .finally(() => {
      inflightTokenPromise = null;
    }) ?? Promise.resolve(null);

  return inflightTokenPromise;
}

export async function getAuthenticatedPhotoSource(
  photoRef: string,
): Promise<{
  uri: string;
  headers?: Record<string, string>;
  cacheKey?: string;
} | null> {
  if (!photoRef) return null;

  if (!isStoragePathPhotoRef(photoRef)) {
    return { uri: photoRef, cacheKey: photoRef };
  }

  const token = await getCurrentUserIdToken();
  if (!token) return null;

  return {
    uri: buildStorageMediaUrl(photoRef),
    cacheKey: photoRef,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}
