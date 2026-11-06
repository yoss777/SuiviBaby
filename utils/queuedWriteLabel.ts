// utils/queuedWriteLabel.ts
// Libellé lisible d'une écriture de la file hors ligne, pour l'écran de
// synchronisation. N'affiche jamais les valeurs saisies ni le message d'erreur
// technique : seulement l'action, le type d'événement et l'heure.

import { getEventTypeLabel } from "@/utils/eventTypeLabels";

const ACTION_LABELS: Record<string, string> = {
  create: "Ajout",
  update: "Modification",
  delete: "Suppression",
};

export function describeQueuedWrite(row: {
  action: string;
  payload: string;
  createdAt: number;
}): string {
  let type: string | null = null;
  try {
    type = getEventTypeLabel(JSON.parse(row.payload)?.type);
  } catch {
    // charge utile illisible : libellé générique
  }
  const action = ACTION_LABELS[row.action] ?? "Écriture";
  const when = new Date(row.createdAt);
  const hh = String(when.getHours()).padStart(2, "0");
  const mm = String(when.getMinutes()).padStart(2, "0");
  return `${action}${type ? ` : ${type}` : ""} (${hh}h${mm})`;
}
