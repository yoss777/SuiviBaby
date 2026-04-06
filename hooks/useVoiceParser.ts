// hooks/useVoiceParser.ts
// Transcription (via Cloud Function) + text parsing via voice/ services.
// Also contains confirmation/event detail formatting helpers.

import VoiceCommandService from "@/services/voiceCommandService";
import type {
  CommandType,
  ParsedCommandResult,
} from "@/services/voiceCommandService";
import type { Event } from "@/services/eventsService";

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export interface TranscribeResult {
  text: string | null;
  error: "no-api-key" | "empty" | "transcription-error" | null;
}

/**
 * Transcribe an audio file via AssemblyAI Cloud Function.
 * Pure function — no state, no side-effects beyond the network call.
 */
export async function transcribeAudio(audioUri: string): Promise<TranscribeResult> {
  try {
    if (!VoiceCommandService.hasApiKey()) {
      return { text: null, error: "no-api-key" };
    }

    const transcribedText = await VoiceCommandService.transcribeAudio(audioUri);
    console.log("📝 Transcription:", transcribedText);

    if (transcribedText && transcribedText.trim()) {
      return { text: transcribedText.trim(), error: null };
    }
    return { text: null, error: "empty" };
  } catch (error) {
    console.error("Erreur transcription:", error);
    return { text: null, error: "transcription-error" };
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a text string into one or more voice commands.
 */
export function parseCommands(text: string): ParsedCommandResult[] {
  return VoiceCommandService.parseMultipleCommands(text);
}

// ---------------------------------------------------------------------------
// Formatting helpers (pure functions, no React state)
// ---------------------------------------------------------------------------

/**
 * Formate le message de confirmation pour une commande parsée.
 */
export function formatConfirmationMessage(command: ParsedCommandResult): string {
  const emojis: Record<CommandType, string> = {
    biberon: "🍼",
    tetee: "🤱",
    couche: "🚼",
    miction: "💧",
    selle: "💩",
    vitamine: "💊",
    sommeil: "😴",
    pompage: "🤱‍🍼",
    activite: "🎯",
    jalon: "⭐",
    croissance: "📏",
    solide: "🥣",
    bain: "🛁",
    temperature: "🌡️",
    medicament: "💊",
    symptome: "🤒",
    vaccin: "💉",
    nettoyage_nez: "👃",
    autre: "📝",
  };

  const emoji = emojis[command.type as CommandType] || "📝";
  const typeDisplay =
    command.type === "couche"
      ? "Change de couche"
      : command.type.charAt(0).toUpperCase() + command.type.slice(1);

  // Préfixe selon l'action
  const action = command.action || "add";
  let actionPrefix = "";
  if (action === "modify") {
    actionPrefix = "✏️ Modifier ";
  } else if (action === "delete") {
    actionPrefix = "🗑️ Supprimer ";
  }

  let message = `${actionPrefix}${emoji} ${typeDisplay}\n\n`;

  // Pour modification/suppression, indiquer l'événement cible
  if (action !== "add" && command.eventIdentifier) {
    if (command.eventIdentifier.isLast) {
      message += `🎯 Le dernier enregistré\n`;
    } else if (command.eventIdentifier.targetTime) {
      const time = command.eventIdentifier.targetTime;
      message += `🎯 Celui de ${time.getHours()}h${time.getMinutes().toString().padStart(2, "0")}\n`;
    } else if (command.eventIdentifier.relativeTime) {
      message += `🎯 Celui d'il y a ${command.eventIdentifier.relativeTime} min\n`;
    }
  }

  // Heure
  if (command.timeOffset && command.timeOffset > 0) {
    if (command.isFuture) {
      message += `⏰ Dans ${command.timeOffset} minute${
        command.timeOffset > 1 ? "s" : ""
      }\n`;
    } else {
      message += `⏰ Il y a ${command.timeOffset} minute${
        command.timeOffset > 1 ? "s" : ""
      }\n`;
    }
  } else {
    message += `⏰ Maintenant\n`;
  }

  // Détails selon le type
  switch (command.type) {
    case "biberon":
      message += `📊 Quantité: ${command.quantite || 0} ml`;
      break;

    case "tetee":
      const cotes = [];
      if (command.coteGauche) cotes.push("Gauche");
      if (command.coteDroit) cotes.push("Droit");
      message += `📍 Côté: ${cotes.join(" + ")}\n`;
      if (command.quantite) {
        message += `⏱️ Durée: ${command.quantite} minute${
          command.quantite > 1 ? "s" : ""
        }`;
      }
      break;

    case "pompage":
      const volumes = [];
      if (command.quantiteGauche && command.quantiteGauche > 0) {
        volumes.push(`Gauche: ${command.quantiteGauche} ml`);
      }
      if (command.quantiteDroite && command.quantiteDroite > 0) {
        volumes.push(`Droit: ${command.quantiteDroite} ml`);
      }

      if (volumes.length > 0) {
        message += `🍼 Pompage: ${volumes.join(" + ")}\n`;

        const total =
          (command.quantiteGauche || 0) + (command.quantiteDroite || 0);
        message += `📊 Total: ${total} ml\n`;
      } else {
        message += `🍼 Pompage enregistré (sans quantité spécifiée)\n`;
      }
      break;

    case "couche":
      const types = [];
      if (command.pipi) types.push("Pipi");
      if (command.popo) types.push("Popo");
      message += `💧 Type: ${
        types.length > 0 ? types.join(" + ") : "Pipi/Popo (à sélectionner)"
      }`;
      break;

    case "miction":
      message += `💧 Type: Pipi`;
      break;

    case "selle":
      message += `💧 Type: Popo`;
      break;

    case "vitamine":
      message += `💊 ${command.nomVitamine || "Vitamine D"}`;
      break;

    case "sommeil":
      if (command.quantite) {
        message += `⏱️ Durée: ${command.quantite} minute${
          command.quantite > 1 ? "s" : ""
        }`;
      } else {
        message += `⏱️ Début du sommeil`;
      }
      break;

    case "activite":
      const activiteLabels: Record<string, string> = {
        tummyTime: "Tummy Time",
        jeux: "Jeux",
        lecture: "Lecture",
        promenade: "Promenade",
        massage: "Massage",
        musique: "Musique",
        eveil: "Éveil sensoriel",
        sortie: "Sortie",
        autre: "Autre",
      };
      message += `🎯 Type: ${activiteLabels[command.typeActivite || "autre"] || "Autre"}`;
      if (command.duree) {
        message += `\n⏱️ Durée: ${command.duree} min`;
      }
      break;

    case "jalon":
      const jalonLabels: Record<string, string> = {
        dent: "Nouvelle dent",
        pas: "Nouveau pas",
        sourire: "Nouveau sourire",
        mot: "Nouveau mot",
        humeur: "Humeur du jour",
        autre: "Autre moment",
      };
      message += `⭐ ${jalonLabels[command.typeJalon || "autre"] || "Moment spécial"}`;
      if (command.humeur) {
        const humeurEmojis = ["", "😢", "😐", "🙂", "😄", "🥰"];
        message += `\n${humeurEmojis[command.humeur]} Humeur: ${command.humeur}/5`;
      }
      break;

    case "croissance":
      if (command.poids) {
        message += `⚖️ Poids: ${command.poids} kg\n`;
      }
      if (command.taille) {
        message += `📏 Taille: ${command.taille} cm\n`;
      }
      if (command.perimetreCranien) {
        message += `🧠 Périmètre crânien: ${command.perimetreCranien} cm`;
      }
      if (!command.poids && !command.taille && !command.perimetreCranien) {
        message += `📏 Mesures à compléter`;
      }
      break;

    case "solide":
      const solideLabels: Record<string, string> = {
        puree: "Purée",
        compote: "Compote",
        cereales: "Céréales",
        yaourt: "Yaourt",
        morceaux: "Morceaux / DME",
        autre: "Autre",
      };
      const momentLabels: Record<string, string> = {
        petit_dejeuner: "Petit-déjeuner",
        dejeuner: "Déjeuner",
        gouter: "Goûter",
        diner: "Dîner",
        collation: "Collation",
      };
      message += `🥣 Type: ${solideLabels[command.typeSolide || "autre"] || "Autre"}`;
      if (command.momentRepas) {
        message += `\n🕐 ${momentLabels[command.momentRepas]}`;
      }
      if (command.quantiteSolide) {
        message += `\n📊 Quantité: ${command.quantiteSolide}`;
      }
      break;

    case "bain":
      message += `🛁 Bain`;
      if (command.duree) {
        message += `\n⏱️ Durée: ${command.duree} min`;
      }
      break;

    case "temperature":
      if (command.valeurTemperature) {
        message += `🌡️ Température: ${command.valeurTemperature}°C`;
      } else {
        message += `🌡️ Température à compléter`;
      }
      break;

    case "medicament":
      message += `💊 ${command.nomMedicament || "Médicament"}`;
      if (command.dosage) {
        message += `\n📊 Dosage: ${command.dosage}`;
      }
      break;

    case "symptome":
      message += `🤒 ${command.descriptionSymptome || "Symptôme"}`;
      break;

    case "vaccin":
      message += `💉 ${command.nomVaccin || "Vaccin"}`;
      break;
  }

  return message;
}

/**
 * Formate les détails d'un événement existant pour l'affichage.
 */
export function formatEventDetails(event: Event): string {
  const lines: string[] = [];

  // Date/heure de l'événement
  const eventDate = event.date instanceof Date
    ? event.date
    : (event.date as any).toDate?.() || new Date((event.date as any).seconds * 1000);
  const timeStr = `${eventDate.getHours()}h${eventDate.getMinutes().toString().padStart(2, "0")}`;
  lines.push(`⏰ ${timeStr}`);

  // Détails selon le type
  switch (event.type) {
    case "biberon":
      const biberonEvent = event as any;
      if (biberonEvent.quantite) {
        lines.push(`📊 Quantité: ${biberonEvent.quantite} ml`);
      }
      if (biberonEvent.typeBiberon) {
        lines.push(`🍼 Type: ${biberonEvent.typeBiberon}`);
      }
      break;

    case "tetee":
      const teteeEvent = event as any;
      const tetCotes = [];
      if (teteeEvent.coteGauche || teteeEvent.dureeGauche) tetCotes.push("Gauche");
      if (teteeEvent.coteDroit || teteeEvent.dureeDroite) tetCotes.push("Droit");
      if (tetCotes.length > 0) {
        lines.push(`📍 Côté: ${tetCotes.join(" + ")}`);
      }
      if (teteeEvent.dureeGauche || teteeEvent.dureeDroite) {
        const dureeTotal = (teteeEvent.dureeGauche || 0) + (teteeEvent.dureeDroite || 0);
        lines.push(`⏱️ Durée: ${dureeTotal} min`);
      }
      break;

    case "pompage":
      const pompageEvent = event as any;
      if (pompageEvent.quantiteGauche) {
        lines.push(`⬅️ Gauche: ${pompageEvent.quantiteGauche} ml`);
      }
      if (pompageEvent.quantiteDroite) {
        lines.push(`➡️ Droite: ${pompageEvent.quantiteDroite} ml`);
      }
      break;

    case "selle":
      const selleEvent = event as any;
      if (selleEvent.consistance) {
        lines.push(`📊 Consistance: ${selleEvent.consistance}`);
      }
      if (selleEvent.couleur) {
        lines.push(`🎨 Couleur: ${selleEvent.couleur}`);
      }
      if (selleEvent.quantite) {
        lines.push(`📏 Quantité: ${selleEvent.quantite}`);
      }
      break;

    case "sommeil":
      const sommeilEvent = event as any;
      if (sommeilEvent.duree) {
        const heures = Math.floor(sommeilEvent.duree / 60);
        const minutes = sommeilEvent.duree % 60;
        lines.push(`⏱️ Durée: ${heures > 0 ? heures + "h" : ""}${minutes > 0 ? minutes + "min" : ""}`);
      }
      if (sommeilEvent.isNap !== undefined) {
        lines.push(`💤 Type: ${sommeilEvent.isNap ? "Sieste" : "Nuit"}`);
      }
      break;

    case "temperature":
      const tempEvent = event as any;
      if (tempEvent.valeur) {
        lines.push(`🌡️ ${tempEvent.valeur}°C`);
      }
      break;

    case "medicament":
      const medEvent = event as any;
      if (medEvent.nomMedicament) {
        lines.push(`💊 ${medEvent.nomMedicament}`);
      }
      if (medEvent.dosage) {
        lines.push(`📊 Dosage: ${medEvent.dosage}`);
      }
      break;

    case "croissance":
      const croissanceEvent = event as any;
      if (croissanceEvent.poids) {
        lines.push(`⚖️ Poids: ${croissanceEvent.poids} kg`);
      }
      if (croissanceEvent.taille) {
        lines.push(`📏 Taille: ${croissanceEvent.taille} cm`);
      }
      if (croissanceEvent.perimetreCranien) {
        lines.push(`🧠 PC: ${croissanceEvent.perimetreCranien} cm`);
      }
      break;

    case "solide":
      const solideEvent = event as any;
      if (solideEvent.typeSolide) {
        lines.push(`🥣 Type: ${solideEvent.typeSolide}`);
      }
      if (solideEvent.momentRepas) {
        lines.push(`🕐 Repas: ${solideEvent.momentRepas}`);
      }
      if (solideEvent.quantite) {
        lines.push(`📊 Quantité: ${solideEvent.quantite}`);
      }
      break;

    case "activite":
      const activiteEvent = event as any;
      if (activiteEvent.typeActivite) {
        lines.push(`🎯 Type: ${activiteEvent.typeActivite}`);
      }
      if (activiteEvent.duree) {
        lines.push(`⏱️ Durée: ${activiteEvent.duree} min`);
      }
      break;

    case "symptome":
      const symptomeEvent = event as any;
      if (symptomeEvent.description) {
        lines.push(`🤒 ${symptomeEvent.description}`);
      }
      break;

    case "jalon":
      const jalonEvent = event as any;
      if (jalonEvent.typeJalon) {
        lines.push(`⭐ Type: ${jalonEvent.typeJalon}`);
      }
      if (jalonEvent.titre) {
        lines.push(`📝 ${jalonEvent.titre}`);
      }
      break;
  }

  // Note si présente
  if ((event as any).note && !(event as any).note.includes("commande vocale")) {
    const note = (event as any).note;
    if (note.length > 50) {
      lines.push(`📝 ${note.substring(0, 47)}...`);
    } else {
      lines.push(`📝 ${note}`);
    }
  }

  return lines.join("\n");
}
