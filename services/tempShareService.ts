// Temporary files holding health data (exports, PDF) must not outlive the
// share action. Always written to the cache directory, and deleted once
// Sharing.shareAsync has resolved or failed.
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

type ShareOptions = Parameters<typeof Sharing.shareAsync>[1];

/** Absolute path of a temporary file in the cache directory (never documentDirectory). */
export function getCacheFileUri(fileName: string): string {
  const base = FileSystem.cacheDirectory;
  if (!base) throw new Error("Répertoire de stockage indisponible");
  return `${base}${fileName}`;
}

/** Best-effort, idempotent delete: never masks the caller's own result or error. */
export async function deleteTempFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.warn("Suppression du fichier temporaire impossible:", error);
  }
}

/**
 * Share a temporary file, then delete it (success, failure or share sheet
 * unavailable). Returns false when sharing is not available on the device.
 */
export async function shareAndDelete(uri: string, options?: ShareOptions): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, options);
    return true;
  } finally {
    await deleteTempFile(uri);
  }
}
