import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { EventType, obtenirEvenements } from "./eventsService";

function toDate(value: any): Date {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

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

export async function exportAllEventsCSV(
  childId: string,
  childName: string,
): Promise<void> {
  const eventTypes: EventType[] = [
    "tetee",
    "biberon",
    "solide",
    "pompage",
    "couche",
    "miction",
    "selle",
    "sommeil",
    "bain",
    "temperature",
    "medicament",
    "symptome",
    "vaccin",
    "vitamine",
    "croissance",
    "activite",
    "jalon",
  ];

  const rows: string[][] = [];
  rows.push(["Date", "Heure", "Type", "Details", "Note"]);

  for (const type of eventTypes) {
    try {
      const events = await obtenirEvenements(childId, { type });
      for (const event of events) {
        const date = toDate(event.date);
        const details = buildDetails(type, event);
        rows.push([
          formatDate(date),
          formatTime(date),
          type,
          details,
          event.note || "",
        ]);
      }
    } catch {
      // Skip types that fail
    }
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
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(filePath, "\uFEFF" + csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(filePath, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
  });
}
