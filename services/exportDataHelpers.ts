// Pure helpers for the JSON export (kept out of the screen so they are testable).
import { extractStoragePath } from "@/utils/photoStorage";

/** Internal soft-delete bookkeeping: clearly technical, not user data. */
const TECHNICAL_CHILD_FIELDS = new Set([
  "deletedAt",
  "deletedBy",
  "deletionRequestId",
]);

/** Full child document (allergies, notes, ...) minus technical fields. */
export function buildChildExportProfile(
  childData: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!childData) return {};
  return Object.fromEntries(
    Object.entries(childData).filter(([key]) => !TECHNICAL_CHILD_FIELDS.has(key)),
  );
}

/** Storage paths of an event's photos (legacy download URLs are normalised to paths). */
export function collectEventPhotoPaths(event: {
  photos?: unknown;
  photoPath?: unknown;
}): string[] {
  const refs: unknown[] = [
    ...(Array.isArray(event.photos) ? event.photos : []),
    event.photoPath,
  ];
  const paths = refs
    .filter((ref): ref is string => typeof ref === "string" && ref.length > 0)
    .map((ref) => extractStoragePath(ref) ?? ref);
  return Array.from(new Set(paths));
}

export const EXPORT_PHOTO_NOTE =
  "Les photos ne sont pas incluses dans ce fichier : seuls leurs chemins de stockage sont indiqués. Elles restent consultables dans l'application.";
