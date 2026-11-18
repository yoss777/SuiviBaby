/**
 * Remettre en cours une balade (modification) : refusé seulement si UNE AUTRE
 * balade tourne déjà (comme le formulaire Sommeil). Sans balade en cours, ou
 * en modifiant celle qui tourne, c'est permis.
 */
export function otherWalkBlocksResume(a: {
  isChronoMode: boolean;
  isOngoing: boolean;
  isEditing: boolean;
  editId?: string;
  runningId?: string;
}): boolean {
  return a.isChronoMode && a.isOngoing && a.isEditing && !!a.runningId && a.editId !== a.runningId;
}
