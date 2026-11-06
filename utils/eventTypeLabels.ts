// utils/eventTypeLabels.ts
// Noms français des types d'événement pour les messages d'erreur (sans article,
// donc sans accord de genre).

const LABELS: Record<string, string> = {
  biberon: "biberon",
  tetee: "tétée",
  solide: "repas solide",
  pompage: "pompage",
  couche: "couche",
  miction: "miction",
  selle: "selle",
  sommeil: "sommeil",
  bain: "bain",
  temperature: "température",
  medicament: "médicament",
  symptome: "symptôme",
  croissance: "croissance",
  vaccin: "vaccin",
  vitamine: "vitamine",
  activite: "activité",
  jalon: "jalon",
  nettoyage_nez: "nettoyage du nez",
};

export function getEventTypeLabel(type: unknown): string | null {
  return typeof type === "string" ? (LABELS[type] ?? null) : null;
}
