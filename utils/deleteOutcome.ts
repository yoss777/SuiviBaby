// utils/deleteOutcome.ts
// Texte à montrer après une suppression. Hors ligne, supprimerEvenement ne fait
// que mettre la suppression en file (« queued ») : dire « supprimé » serait faux.

import type { DeleteOutcome } from "@/services/eventsService";

export const DELETE_QUEUED_MESSAGE = "Suppression enregistrée : synchronisation en attente";

/**
 * @param outcome résultat de supprimerEvenement / supprimerJalon
 * @param deletedMessage texte habituel (« Activité supprimée »), utilisé quand
 *   le serveur a réellement supprimé
 */
export function deleteToastMessage(
  outcome: DeleteOutcome | void,
  deletedMessage: string,
): string {
  return outcome === "queued" ? DELETE_QUEUED_MESSAGE : deletedMessage;
}
