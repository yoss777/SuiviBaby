import * as FileSystem from "expo-file-system/legacy";
import { deleteTempFile, prepareExportFile, shareTempFile } from "@/services/tempShareService";
import {
  collectChildExportData,
  EXPORT_OFFLINE_MESSAGE,
  ExportOfflineError,
} from "./exportCollector";
import { getPendingChildIds, isOnline } from "./offlineQueueService";
import { getHiddenEventIds } from "./hiddenPhotosService";
import { getExportEventTypes } from "./eventTypeSupport";
import { toDate } from "@/utils/date";

function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeCsv(value: any): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildDetails(type: string, event: any): string {
  switch (type) {
    case "tetee":
      return (
        [
          event.coteGauche && `G: ${event.dureeGauche || 0}min`,
          event.coteDroit && `D: ${event.dureeDroite || 0}min`,
        ]
          .filter(Boolean)
          .join(", ") || "Tetee"
      );
    case "biberon":
      return `${event.quantite || 0}ml${event.typeBiberon ? ` (${event.typeBiberon})` : ""}`;
    case "solide":
      return (
        [event.typeSolide, event.momentRepas, event.ingredients]
          .filter(Boolean)
          .join(", ") || "Solide"
      );
    case "pompage":
      return `G: ${event.quantiteGauche || 0}ml, D: ${event.quantiteDroite || 0}ml`;
    case "couche":
      // Export remains backend-compatible and may include legacy raw events.
      return "Change";
    case "miction":
      return (
        [event.couleur, event.volume && `${event.volume}ml`]
          .filter(Boolean)
          .join(", ") || "Miction"
      );
    case "selle":
      return (
        [event.consistance, event.couleur, event.quantite]
          .filter(Boolean)
          .join(", ") || "Selle"
      );
    case "sommeil":
      return `${event.duree || 0}min${event.isNap ? " (sieste)" : " (nuit)"}`;
    case "bain":
      return `${event.duree || 0}min${event.temperatureEau ? ` ${event.temperatureEau}\u00B0C` : ""}`;
    case "temperature":
      return `${event.valeur || 0}\u00B0C${event.modePrise ? ` (${event.modePrise})` : ""}`;
    case "medicament":
      return [event.nomMedicament, event.dosage].filter(Boolean).join(", ");
    case "symptome": {
      const symptomes = Array.isArray(event.symptomes)
        ? event.symptomes.join("; ")
        : event.symptomes;
      return [symptomes, event.intensite].filter(Boolean).join(", ");
    }
    case "vaccin":
      return [event.nomVaccin, event.dosage].filter(Boolean).join(", ");
    case "vitamine":
      return [event.nomVitamine, event.dosage].filter(Boolean).join(", ");
    case "croissance":
      return (
        [
          event.poidsKg && `${event.poidsKg}kg`,
          event.tailleCm && `${event.tailleCm}cm`,
          event.teteCm && `PC ${event.teteCm}cm`,
        ]
          .filter(Boolean)
          .join(", ") || "Croissance"
      );
    case "activite":
      return [event.typeActivite, event.description].filter(Boolean).join(", ");
    case "jalon":
      return [event.typeJalon, event.titre, event.description]
        .filter(Boolean)
        .join(", ");
    default:
      return "";
  }
}

export interface CsvExportResult {
  /** Vrai si l'utilisateur a annulé après l'avertissement (aucun fichier produit). */
  cancelled: boolean;
}

/**
 * Export CSV de tous les événements d'un enfant. Mêmes règles que l'export
 * JSON : lectures serveur uniquement (rôle relu sur le serveur : Parent = tout,
 * Proche = ses propres saisies), échec complet hors ligne ou à la moindre
 * erreur de lecture (jamais de fichier partiel).
 * `confirmPending` est appelé si des saisies hors ligne de l'enfant attendent
 * d'être envoyées ; retourner false annule l'export.
 */
export async function exportAllEventsCSV(
  childId: string,
  childName: string,
  uid: string,
  options: { confirmPending?: () => Promise<boolean> } = {},
): Promise<CsvExportResult> {
  const eventTypes = getExportEventTypes();

  // Connexion vérifiée avant tout (et avant l'avertissement).
  let online = false;
  try {
    online = await isOnline();
  } catch {
    online = false;
  }
  if (!online) throw new ExportOfflineError();

  if (options.confirmPending) {
    const pending = await getPendingChildIds().catch(() => new Set<string>());
    if (pending.has(childId) && !(await options.confirmPending())) {
      return { cancelled: true };
    }
  }

  let collected;
  try {
    collected = await collectChildExportData(childId, uid, {
      eventTypes,
      includeLikes: false,
      includeComments: false,
    });
  } catch (error) {
    // Toute erreur de lecture : l'export échoue entièrement.
    if (error instanceof ExportOfflineError) throw error;
    throw new Error(EXPORT_OFFLINE_MESSAGE);
  }

  const rows: string[][] = [];
  rows.push(["Date", "Heure", "Type", "Details", "Note"]);

  // B5.S3 — exclure les events que l'utilisateur a explicitement masqués
  // côté UI via hidePhoto(). NB : la liste hiddenEventIds est globale au user
  // (pas par enfant), c'est OK car les IDs d'events sont uniques.
  let hiddenIds: Set<string>;
  try {
    hiddenIds = new Set(await getHiddenEventIds());
  } catch {
    hiddenIds = new Set();
  }

  const supported = new Set<string>(eventTypes);
  for (const event of collected.events as any[]) {
    const type = String(event.type ?? "");
    if (!supported.has(type)) continue;
    if (event.id && hiddenIds.has(event.id)) continue; // B5.S3 skip
    const date = toDate(event.date);
    rows.push([
      formatDate(date),
      formatTime(date),
      type,
      buildDetails(type, event),
      event.note || "",
    ]);
  }

  // Sort by date descending
  const header = rows.shift()!;
  rows.sort((a, b) => {
    const dateA = new Date(
      a[0].split("/").reverse().join("-") + "T" + a[1],
    );
    const dateB = new Date(
      b[0].split("/").reverse().join("-") + "T" + b[1],
    );
    return dateB.getTime() - dateA.getTime();
  });
  rows.unshift(header);

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const fileName = `${childName.replace(/\s+/g, "_")}_export_${new Date().toISOString().slice(0, 10)}.csv`;
  const filePath = await prepareExportFile(fileName);

  try {
    await FileSystem.writeAsStringAsync(filePath, "\uFEFF" + csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    await shareTempFile(filePath, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
    });
    return { cancelled: false };
  } catch (error) {
    await deleteTempFile(filePath);
    throw error;
  }
}
