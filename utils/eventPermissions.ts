// Single source of truth for what a role may do on a child's events (owner
// decision Q6). Pure, no Firebase import, so it is cheap to test and to use
// from any screen or hook. Firestore rules and Cloud Functions stay the
// authority; this only decides what the app shows.
//
//   owner / admin : create, edit, delete events; like and comment
//   contributor   : read every event; like and comment on photo events only (the
//                   like/comment UI only exists on photos)
//   viewer        : read only
import type { ChildRole } from "@/types/permissions";

type MaybeRole = ChildRole | string | null | undefined;

/** Create, edit or delete events (add buttons, voice command, edit sheets, swipe-to-delete). */
export function canManageEvents(role: MaybeRole): boolean {
  return role === "owner" || role === "admin";
}

/** Like and comment on photos. Viewers keep read-only access. */
export function canInteractWithPhotos(role: MaybeRole): boolean {
  return role === "owner" || role === "admin" || role === "contributor";
}
