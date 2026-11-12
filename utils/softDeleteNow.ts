// utils/softDeleteNow.ts
// Suppression unitaire immédiate et annulable, partagée par les écrans de
// liste : l'élément disparaît tout de suite (ids masqués), le toast « Annuler »
// (8 s) le fait revenir, la suppression serveur part à l'expiration du toast
// (cf. useDeleteWithUndo). Aucune modale « irréversible » : rien n'est perdu
// tant que le toast est affiché.
import type { Dispatch, SetStateAction } from "react";

import type { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import type { RunDeleteOptions } from "@/utils/deleteWithRetry";

type ScheduleDelete = ReturnType<typeof useDeleteWithUndo>;

export function withId(prev: Set<string>, id: string, hidden: boolean): Set<string> {
  if (prev.has(id) === hidden) return prev;
  const next = new Set(prev);
  if (hidden) next.add(id);
  else next.delete(id);
  return next;
}

export function softDeleteNow({
  id,
  message,
  run,
  setHiddenIds,
  scheduleDelete,
}: {
  id: string;
  message: string;
  run: RunDeleteOptions["run"];
  setHiddenIds: Dispatch<SetStateAction<Set<string>>>;
  scheduleDelete: ScheduleDelete;
}): void {
  const hide = () => setHiddenIds((prev) => withId(prev, id, true));
  const show = () => setHiddenIds((prev) => withId(prev, id, false));
  hide();
  scheduleDelete({ message, onUndo: show, run, onRestore: show, onHide: hide });
}
