// Temporary files holding health data (exports, PDF) live in a dedicated
// `exports/` subfolder of the cache directory. They are NOT deleted right after
// Sharing.shareAsync resolves: on Android the receiving app (Gmail, Drive) may
// read the content URI later and would get an empty attachment. Instead,
// leftovers older than ~1 hour are purged at the next export and at app start.
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

type ShareOptions = Parameters<typeof Sharing.shareAsync>[1];

export const EXPORT_DIR_NAME = "exports/";
export const EXPORT_MAX_AGE_MS = 60 * 60 * 1000;

function getExportDir(): string {
  const base = FileSystem.cacheDirectory;
  if (!base) throw new Error("Répertoire de stockage indisponible");
  return `${base}${EXPORT_DIR_NAME}`;
}

/** Absolute path of a file in the exports folder of the cache (never documentDirectory). */
export function getCacheFileUri(fileName: string): string {
  return `${getExportDir()}${fileName}`;
}

async function ensureExportDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(getExportDir(), { intermediates: true });
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
 * Delete export files older than maxAgeMs. Best effort: never throws.
 * Returns the number of files removed.
 */
export async function cleanupStaleExports(
  maxAgeMs: number = EXPORT_MAX_AGE_MS,
  now: number = Date.now(),
): Promise<number> {
  let removed = 0;
  try {
    const dir = getExportDir();
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) return 0;
    const names = await FileSystem.readDirectoryAsync(dir);
    for (const name of names) {
      try {
        const uri = `${dir}${name}`;
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) continue;
        // modificationTime is in seconds; unknown age -> treat as stale.
        const modifiedMs = (info as { modificationTime?: number }).modificationTime;
        const age = typeof modifiedMs === "number" ? now - modifiedMs * 1000 : Infinity;
        if (age >= maxAgeMs) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
          removed++;
        }
      } catch (error) {
        console.warn("Nettoyage d'un export impossible:", error);
      }
    }
  } catch (error) {
    console.warn("Nettoyage des exports impossible:", error);
  }
  return removed;
}

/**
 * Call before writing an export: purges stale leftovers, makes sure the folder
 * exists and returns the destination uri.
 */
export async function prepareExportFile(fileName: string): Promise<string> {
  const uri = getCacheFileUri(fileName);
  await cleanupStaleExports();
  await ensureExportDir();
  return uri;
}

/**
 * Move a file produced elsewhere (expo-print writes its PDF in the cache root)
 * into the exports folder so it follows the same cleanup. Falls back to the
 * original uri if the move fails.
 */
export async function adoptTempFile(uri: string, fileName: string): Promise<string> {
  try {
    const destination = await prepareExportFile(fileName);
    await FileSystem.moveAsync({ from: uri, to: destination });
    return destination;
  } catch (error) {
    console.warn("Déplacement du fichier temporaire impossible:", error);
    return uri;
  }
}

/**
 * Share a temporary file WITHOUT deleting it afterwards (see header). Returns
 * false when sharing is not available on the device.
 */
export async function shareTempFile(uri: string, options?: ShareOptions): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, options);
  return true;
}
