import type { CommandType, ParsedCommandResult } from "./types";

/**
 * Formate les données pour Firebase selon le type
 */
export function formatDataForFirebase(command: ParsedCommandResult) {
  // Construire la note avec le contexte enrichi si disponible
  let note = `Ajouté par commande vocale: "${command.rawText}"`;
  if (command.contextNote) {
    note = `${command.contextNote} - ${note}`;
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
        typeBiberon: command.typeBiberon,
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
        consistance: command.consistance,
        couleur: command.couleur,
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
        typeActivite: command.typeActivite || "autre",
        duree: command.duree,
      };

    case "jalon":
      return {
        ...baseData,
        type: "jalon",
        typeJalon: command.typeJalon || "autre",
        humeur: command.humeur,
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
        typeSolide: command.typeSolide || "autre",
        momentRepas: command.momentRepas,
        quantite: command.quantiteSolide || "moyen",
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
