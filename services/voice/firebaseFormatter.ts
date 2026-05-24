import type { CommandType, ParsedCommandResult } from "./types";
import {
  filterEnum,
  TYPES_BIBERON,
  TYPES_ACTIVITE,
  TYPES_JALON,
  CONSISTANCES_SELLE,
  COULEURS_SELLE,
  TYPES_SOLIDE,
  MOMENTS_REPAS,
  QUANTITES_SOLIDE,
  METHODES_NETTOYAGE_NEZ,
} from "./enums";

// Hard caps: AssemblyAI transcripts and contextNote are user-influenced strings.
// Truncate before Firestore write to keep documents bounded and the UI safe.
const MAX_RAW_TEXT = 300;
const MAX_CONTEXT_NOTE = 200;

function clampString(value: string | undefined, max: number): string {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Formate les données pour Firebase selon le type
 */
export function formatDataForFirebase(command: ParsedCommandResult) {
  // Construire la note avec le contexte enrichi si disponible
  const safeRaw = clampString(command.rawText, MAX_RAW_TEXT);
  const safeContext = clampString(command.contextNote, MAX_CONTEXT_NOTE);
  let note = `Ajouté par commande vocale: "${safeRaw}"`;
  if (safeContext) {
    note = `${safeContext} - ${note}`;
  }

  const baseData = {
    date: command.timestamp,
    createdAt: new Date(),
    note,
    childId: command.childId,
  };

  switch (command.type) {
    case "biberon":
      return {
        ...baseData,
        type: "biberon",
        quantite: command.quantite || 0,
        typeBiberon: filterEnum(command.typeBiberon, TYPES_BIBERON),
        unit: "ml",
      };

    case "tetee":
      return {
        ...baseData,
        type: "seins",
        coteGauche: command.coteGauche || false,
        coteDroit: command.coteDroit || false,
        duree: command.quantite || 0,
      };

    case "pompage":
      return {
        ...baseData,
        type: "pompage",
        quantiteGauche: command.quantiteGauche || 0,
        quantiteDroite: command.quantiteDroite || 0,
        quantiteTotale: (command.quantiteGauche ?? 0) + (command.quantiteDroite ?? 0),
      };

    case "couche":
      // Kept for voice parsing/confirmation, then normalized in UI flows to
      // `miction` / `selle` for the modern product contract.
      return {
        ...baseData,
        type: "couche",
        pipi: command.pipi || false,
        popo: command.popo || false,
      };

    case "miction":
      return {
        ...baseData,
        type: "miction",
      };

    case "selle":
      return {
        ...baseData,
        type: "selle",
        consistance: filterEnum(command.consistance, CONSISTANCES_SELLE),
        couleur: filterEnum(command.couleur, COULEURS_SELLE),
      };

    case "vitamine":
      return {
        ...baseData,
        type: "vitamine",
        nomVitamine: command.nomVitamine || "Vitamine D",
      };

    case "sommeil":
      return {
        ...baseData,
        type: "sommeil",
        duree: command.duree || command.quantite,
        heureDebut: command.timestamp,
      };

    case "activite":
      return {
        ...baseData,
        type: "activite",
        typeActivite: filterEnum(command.typeActivite, TYPES_ACTIVITE) ?? "autre",
        duree: command.duree,
      };

    case "jalon":
      return {
        ...baseData,
        type: "jalon",
        typeJalon: filterEnum(command.typeJalon, TYPES_JALON) ?? "autre",
        humeur: typeof command.humeur === "number" && command.humeur >= 1 && command.humeur <= 5
          ? command.humeur
          : undefined,
      };

    case "croissance":
      return {
        ...baseData,
        type: "croissance",
        poids: command.poids,
        taille: command.taille,
        perimetreCranien: command.perimetreCranien,
      };

    case "solide":
      return {
        ...baseData,
        type: "solide",
        typeSolide: filterEnum(command.typeSolide, TYPES_SOLIDE) ?? "autre",
        momentRepas: filterEnum(command.momentRepas, MOMENTS_REPAS),
        quantite: filterEnum(command.quantiteSolide, QUANTITES_SOLIDE) ?? "moyen",
      };

    case "bain":
      return {
        ...baseData,
        type: "bain",
        duree: command.duree,
      };

    case "temperature":
      return {
        ...baseData,
        type: "temperature",
        valeur: command.valeurTemperature,
      };

    case "medicament":
      return {
        ...baseData,
        type: "medicament",
        nomMedicament: command.nomMedicament,
        dosage: command.dosage,
      };

    case "symptome":
      return {
        ...baseData,
        type: "symptome",
        description: command.descriptionSymptome,
      };

    case "vaccin":
      return {
        ...baseData,
        type: "vaccin",
        nomVaccin: command.nomVaccin,
      };

    case "autre":
      return {
        ...baseData,
        type: command.type,
      };

    default:
      return baseData;
  }
}

/**
 * Convertit le CommandType en EventType pour la recherche
 */
export function commandTypeToEventType(type: CommandType): string {
  const mapping: Record<CommandType, string> = {
    biberon: "biberon",
    tetee: "tetee",
    couche: "couche",
    miction: "miction",
    selle: "selle",
    vitamine: "vitamine",
    sommeil: "sommeil",
    pompage: "pompage",
    activite: "activite",
    jalon: "jalon",
    croissance: "croissance",
    solide: "solide",
    bain: "bain",
    temperature: "temperature",
    medicament: "medicament",
    symptome: "symptome",
    vaccin: "vaccin",
    nettoyage_nez: "nettoyage_nez",
    autre: "autre",
  };
  return mapping[type] || type;
}
