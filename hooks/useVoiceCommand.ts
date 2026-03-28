// hooks/useVoiceCommand.ts
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  supprimerBiberon,
  supprimerTetee,
  supprimerPompage,
  supprimerMiction,
  supprimerSelle,
  supprimerVitamine,
  supprimerSommeil,
  supprimerActivite,
  supprimerJalon,
  supprimerCroissance,
  supprimerSolide,
  supprimerBain,
  supprimerNettoyageNez,
  supprimerTemperature,
  supprimerMedicament,
  supprimerSymptome,
  supprimerVaccin,
} from "@/migration/eventsDoubleWriteService";
import { obtenirEvenements, Event, EventType } from "@/services/eventsService";
import VoiceCommandService, {
  CommandAction,
  CommandType,
  ParsedCommandResult,
  EventIdentifier,
  commandTypeToEventType,
} from "@/services/voiceCommandService";
import { useRef, useState } from "react";
// Décommentez quand vous aurez créé ces services :
// import { ajouterBiberon } from '@/services/biberonsService';
// import { ajouterCouche } from '@/services/couchesService';
// import { ajouterSommeil } from '@/services/sommeilsService';

export function useVoiceCommand(childId: string, useTestMode: boolean = false) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [testMode, setTestMode] = useState(useTestMode);
  const [testPromptVisible, setTestPromptVisible] = useState(false);
  const [testPromptText, setTestPromptText] = useState("");
  const [pendingCommand, setPendingCommand] = useState<ParsedCommandResult | null>(null);
  const [diaperChoice, setDiaperChoiceState] = useState(true);
  const diaperChoiceRef = useRef(true);
  const [excretionSelection, setExcretionSelectionState] = useState({
    pipi: false,
    popo: false,
  });
  const excretionSelectionRef = useRef({ pipi: false, popo: false });
  const [infoModal, setInfoModal] = useState({
    visible: false,
    title: "",
    message: "",
  });
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: "",
    message: "",
    onConfirm: null as null | (() => void),
  });
  const [permissionModal, setPermissionModal] = useState(false);
  const [transcriptionErrorModal, setTranscriptionErrorModal] = useState(false);
  const [foundEvent, setFoundEvent] = useState<Event | null>(null);

  /**
   * Recherche un événement existant basé sur l'identifiant
   */
  const findEventByIdentifier = async (
    identifier: EventIdentifier,
    childIdToSearch: string
  ): Promise<Event | null> => {
    try {
      const eventType = commandTypeToEventType(identifier.type) as EventType;

      // Si "le dernier", on récupère le plus récent
      if (identifier.isLast) {
        const events = await obtenirEvenements(childIdToSearch, {
          type: eventType,
          limite: 1,
        });
        return events.length > 0 ? events[0] : null;
      }

      // Si une heure cible est spécifiée (ex: "de 15h20")
      if (identifier.targetTime) {
        const targetDate = identifier.targetTime;
        // Rechercher les événements de la journée
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const events = await obtenirEvenements(childIdToSearch, {
          type: eventType,
          depuis: startOfDay,
          jusqu: endOfDay,
        });

        // Trouver l'événement le plus proche de l'heure cible (tolérance de 30 min)
        const targetMinutes = targetDate.getHours() * 60 + targetDate.getMinutes();
        let closestEvent: Event | null = null;
        let minDiff = Infinity;

        for (const event of events) {
          const eventDate = event.date instanceof Date
            ? event.date
            : (event.date as any).toDate?.() || new Date((event.date as any).seconds * 1000);
          const eventMinutes = eventDate.getHours() * 60 + eventDate.getMinutes();
          const diff = Math.abs(eventMinutes - targetMinutes);

          if (diff < minDiff && diff <= 30) { // Tolérance de 30 minutes
            minDiff = diff;
            closestEvent = event;
          }
        }
        return closestEvent;
      }

      // Si un temps relatif est spécifié (ex: "il y a 30 min")
      if (identifier.relativeTime) {
        const now = new Date();
        const targetTime = new Date(now.getTime() - identifier.relativeTime * 60 * 1000);

        // Fenêtre de recherche : target ± 15 min
        const depuis = new Date(targetTime.getTime() - 15 * 60 * 1000);
        const jusqu = new Date(targetTime.getTime() + 15 * 60 * 1000);

        const events = await obtenirEvenements(childIdToSearch, {
          type: eventType,
          depuis,
          jusqu,
        });

        // Retourner le plus proche
        if (events.length > 0) {
          return events[0]; // Déjà trié par date desc
        }
        return null;
      }

      return null;
    } catch (error) {
      console.error("Erreur recherche événement:", error);
      return null;
    }
  };

  /**
   * Démarre l'enregistrement vocal
   */
  const startVoiceCommand = async () => {
    try {
      if (isRecording || isProcessing) return;
      if (!childId) {
        setInfoModal({
          visible: true,
          title: "Erreur",
          message: "Aucun enfant sélectionné",
        });
        return;
      }

      if (testMode) {
        setIsProcessing(true);
        setTestPromptText("");
        setTestPromptVisible(true);
        return;
      }

      // Vérifier les permissions
      const hasPermission = await VoiceCommandService.requestPermissions();
      if (!hasPermission) {
        setPermissionModal(true);
        return;
      }

      setIsRecording(true);
      await VoiceCommandService.startRecording();

      // Feedback visuel/audio optionnel
      console.log("🎤 Enregistrement démarré - Parlez maintenant");
    } catch (error) {
      console.error("Erreur démarrage commande vocale:", error);
      setInfoModal({
        visible: true,
        title: "Erreur",
        message: "Impossible de démarrer l'enregistrement",
      });
      setIsRecording(false);
    }
  };

  /**
   * Arrête l'enregistrement et traite la commande
   */
  const stopVoiceCommand = async () => {
    try {
      if (!isRecording) {
        setIsProcessing(false);
        return;
      }
      if (testMode) {
        setTestPromptText("");
        setTestPromptVisible(true);
        return;
      }

      setIsRecording(false);
      setIsProcessing(true);

      // Arrêter l'enregistrement
      const audioUri = await VoiceCommandService.stopRecording();
      if (!audioUri) {
        throw new Error("Pas d'enregistrement disponible");
      }

      console.log("🎤 Enregistrement arrêté, traitement en cours...");

      // ===================================
      // MODE TEST: Simulation pour développement
      // ===================================
      if (testMode) {
        setTestPromptText("");
        setTestPromptVisible(true);
        return;
      }

      // ===================================
      // MODE PRODUCTION: AssemblyAI
      // ===================================
      try {
        // Vérifier si l'API key est configurée
        if (!VoiceCommandService.hasApiKey()) {
          setConfirmModal({
            visible: true,
            title: "Configuration requise",
            message:
              "L'API AssemblyAI n'est pas configurée.\n\nLe mode test va être activé.",
            onConfirm: () => {
              setTestMode(true);
              startVoiceCommand();
            },
          });
          setIsProcessing(false);
          return;
        }

        // Transcrire l'audio
        const transcribedText = await VoiceCommandService.transcribeAudio(
          audioUri
        );
        console.log("📝 Transcription:", transcribedText);

        if (transcribedText && transcribedText.trim()) {
          await processVoiceCommand(transcribedText.trim());
        } else {
          setInfoModal({
            visible: true,
            title: "Erreur",
            message: "Aucun texte détecté dans l'audio",
          });
          setIsProcessing(false);
        }
      } catch (error) {
        console.error("Erreur transcription:", error);
        setTranscriptionErrorModal(true);
      }
    } catch (error) {
      console.error("Erreur traitement commande vocale:", error);
      setInfoModal({
        visible: true,
        title: "Erreur",
        message: "Impossible de traiter la commande vocale",
      });
      setIsProcessing(false);
    }
  };

  /**
   * Traite plusieurs événements détectés dans une seule phrase
   * Ex: "Il a bu 150ml, fait un pipi et on est allés au parc"
   */
  const processMultipleCommands = async (commands: ParsedCommandResult[]) => {
    // Générer le message de confirmation listant tous les événements
    const eventDescriptions = commands.map((cmd, index) => {
      const desc = formatConfirmationMessage(cmd);
      return `${index + 1}. ${desc}`;
    }).join("\n");

    const confirmMessage = `${commands.length} événements détectés:\n\n${eventDescriptions}`;

    setConfirmModal({
      visible: true,
      title: "Confirmer les ajouts",
      message: confirmMessage,
      onConfirm: async () => {
        // Exécuter toutes les commandes en séquence
        let successCount = 0;
        const errors: string[] = [];

        for (const cmd of commands) {
          try {
            await executeCommand(cmd, childId, true, { pipi: cmd.pipi || false, popo: cmd.popo || false });
            successCount++;
          } catch (error) {
            console.error(`Erreur ajout ${cmd.type}:`, error);
            errors.push(cmd.type);
          }
        }

        // Afficher le résultat
        if (errors.length === 0) {
          setInfoModal({
            visible: true,
            title: "Succès",
            message: `${successCount} événement(s) ajouté(s) avec succès`,
          });
        } else {
          setInfoModal({
            visible: true,
            title: "Résultat partiel",
            message: `${successCount} événement(s) ajouté(s)\n${errors.length} erreur(s): ${errors.join(", ")}`,
          });
        }

        setIsProcessing(false);
      },
    });
  };

  /**
   * Traite la commande vocale transcrite
   * Supporte maintenant les phrases composées avec plusieurs événements
   */
  const processVoiceCommand = async (text: string) => {
    try {
      setTranscription(text);
      console.log("🔍 Analyse de la commande:", text);

      // Parser TOUTES les commandes détectées dans le texte
      const commands = VoiceCommandService.parseMultipleCommands(text);

      if (commands.length === 0) {
        setInfoModal({
          visible: true,
          title: "Commande non reconnue",
          message:
            `Je n'ai pas compris: "${text}"\n\n` +
            `Exemples de commandes:\n\n` +
            `➕ AJOUTER:\n` +
            `🍼 "Biberon de 150ml"\n` +
            `🤱 "Tétée gauche 15 min"\n` +
            `🥣 "Purée au déjeuner"\n` +
            `🚼 "Pipi popo" ou "Selle liquide"\n` +
            `😴 "Dodo" ou "Sieste"\n` +
            `📏 "Poids 5.2kg taille 62cm"\n\n` +
            `✏️ MODIFIER:\n` +
            `"Modifie le dernier biberon pour 180ml"\n` +
            `"Corrige la selle de 15h20, c'était liquide"\n\n` +
            `🗑️ SUPPRIMER:\n` +
            `"Supprime le dernier pipi"\n` +
            `"Efface le biberon de 14h"\n\n` +
            `⏰ TEMPS:\n` +
            `"...il y a 15 min" ou "dans 30 min"\n\n` +
            `📝 PHRASES COMPOSÉES:\n` +
            `"Il a bu 150ml et fait un pipi"`,
        });
        setIsProcessing(false);
        return;
      }

      // Ajouter childId à toutes les commandes
      const commandsWithChildId = commands.map(cmd => ({ ...cmd, childId }));
      console.log(`✅ ${commandsWithChildId.length} événement(s) détecté(s):`, commandsWithChildId.map(c => c.type));

      // Si plusieurs événements, utiliser le flow multi-événements
      if (commandsWithChildId.length > 1) {
        await processMultipleCommands(commandsWithChildId);
        return;
      }

      // Sinon, continuer avec le flow single-event existant
      const commandWithChildId = commandsWithChildId[0];
      console.log("✅ Commande analysée:", commandWithChildId);

      // Déterminer le titre et l'action selon le type de commande
      const action = commandWithChildId.action || "add";
      let confirmTitle = "Confirmer l'ajout";

      if (action === "modify") {
        confirmTitle = "Confirmer la modification";
      } else if (action === "delete") {
        confirmTitle = "Confirmer la suppression";
      }

      // Pour modification/suppression, rechercher l'événement cible
      let targetEvent: Event | null = null;
      if ((action === "modify" || action === "delete") && commandWithChildId.eventIdentifier) {
        console.log("🔍 Recherche de l'événement cible...");
        targetEvent = await findEventByIdentifier(commandWithChildId.eventIdentifier, childId);

        if (!targetEvent) {
          setInfoModal({
            visible: true,
            title: "Événement non trouvé",
            message: `Impossible de trouver ${commandWithChildId.eventIdentifier.isLast
              ? "le dernier " + commandWithChildId.type
              : commandWithChildId.eventIdentifier.targetTime
                ? `le ${commandWithChildId.type} de ${commandWithChildId.eventIdentifier.targetTime.getHours()}h${commandWithChildId.eventIdentifier.targetTime.getMinutes().toString().padStart(2, "0")}`
                : `le ${commandWithChildId.type}`
            }.\n\nVérifiez que l'événement existe.`,
          });
          setIsProcessing(false);
          return;
        }

        console.log("✅ Événement trouvé:", targetEvent.id);
        setFoundEvent(targetEvent);
      }

      // Confirmation avant action - inclure les détails de l'événement existant pour modify/delete
      let confirmMessage = formatConfirmationMessage(commandWithChildId);

      // Pour modify/delete, ajouter les détails de l'événement trouvé
      if (targetEvent && (action === "modify" || action === "delete")) {
        const eventDetails = formatEventDetails(targetEvent);
        if (action === "delete") {
          confirmMessage = `${confirmMessage}\n\n📋 Détails de l'événement à supprimer:\n${eventDetails}`;
        } else {
          confirmMessage = `${confirmMessage}\n\n📋 Valeurs actuelles:\n${eventDetails}`;
        }
      }

      setPendingCommand(commandWithChildId);
      if (
        commandWithChildId.type === "couche" ||
        commandWithChildId.type === "miction" ||
        commandWithChildId.type === "selle"
      ) {
        setDiaperChoiceState(true);
        diaperChoiceRef.current = true;
      }
      if (commandWithChildId.type === "couche") {
        const hasPipi = !!("pipi" in commandWithChildId && commandWithChildId.pipi);
        const hasPopo = !!("popo" in commandWithChildId && commandWithChildId.popo);
        const nextSelection = {
          pipi: hasPipi || (!hasPipi && !hasPopo),
          popo: hasPopo,
        };
        setExcretionSelectionState(nextSelection);
        excretionSelectionRef.current = nextSelection;
      }

      // Capturer targetEvent pour la closure
      const eventToTarget = targetEvent;

      setConfirmModal({
        visible: true,
        title: confirmTitle,
        message: confirmMessage,
        onConfirm: async () => {
          await executeCommand(
            commandWithChildId,
            childId,
            diaperChoiceRef.current,
            excretionSelectionRef.current,
            eventToTarget
          );
          setIsProcessing(false);
          setFoundEvent(null);
        },
      });
    } catch (error) {
      console.error("Erreur processing:", error);
      setInfoModal({
        visible: true,
        title: "Erreur",
        message: "Impossible de traiter la commande",
      });
      setIsProcessing(false);
    }
  };

  /**
   * Formate le message de confirmation
   */
  const formatConfirmationMessage = (command: ParsedCommandResult): string => {
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
  };

  /**
   * Formate les détails d'un événement existant pour l'affichage
   */
  const formatEventDetails = (event: Event): string => {
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
        const cotes = [];
        if (teteeEvent.coteGauche || teteeEvent.dureeGauche) cotes.push("Gauche");
        if (teteeEvent.coteDroit || teteeEvent.dureeDroite) cotes.push("Droit");
        if (cotes.length > 0) {
          lines.push(`📍 Côté: ${cotes.join(" + ")}`);
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
  };

  /**
   * Exécute une suppression d'événement
   */
  const executeDelete = async (type: string, childId: string, eventId: string) => {
    try {
      const deleteMap: Record<string, (childId: string, id: string) => Promise<void>> = {
        biberon: supprimerBiberon,
        tetee: supprimerTetee,
        pompage: supprimerPompage,
        miction: supprimerMiction,
        selle: supprimerSelle,
        vitamine: supprimerVitamine,
        sommeil: supprimerSommeil,
        activite: supprimerActivite,
        jalon: supprimerJalon,
        croissance: supprimerCroissance,
        solide: supprimerSolide,
        bain: supprimerBain,
        temperature: supprimerTemperature,
        medicament: supprimerMedicament,
        symptome: supprimerSymptome,
        vaccin: supprimerVaccin,
        nettoyage_nez: supprimerNettoyageNez,
      };

      const deleteFn = deleteMap[type];
      if (deleteFn) {
        await deleteFn(childId, eventId);
        setInfoModal({
          visible: true,
          title: "Succès",
          message: `${type.charAt(0).toUpperCase() + type.slice(1)} supprimé avec succès`,
        });
      } else {
        setInfoModal({
          visible: true,
          title: "Erreur",
          message: `La suppression du type "${type}" n'est pas encore implémentée`,
        });
      }
    } catch (error) {
      console.error("❌ Erreur suppression:", error);
      setInfoModal({
        visible: true,
        title: "Erreur",
        message: `Impossible de supprimer:\n${error instanceof Error ? error.message : "Erreur inconnue"}`,
      });
    }
  };

  /**
   * Exécute une modification d'événement
   */
  const executeModify = async (
    type: string,
    childId: string,
    eventId: string,
    modifications: Partial<ParsedCommandResult>,
    previousEvent: Event | null,
  ) => {
    try {
      if (!previousEvent) {
        setInfoModal({
          visible: true,
          title: "Erreur",
          message: "Impossible de modifier sans l'événement courant",
        });
        return;
      }

      // Convertir les modifications au format Firebase
      const dataToUpdate: Record<string, any> = {};

      if (modifications.quantite !== undefined) {
        dataToUpdate.quantite = modifications.quantite;
      }
      if (modifications.quantiteGauche !== undefined) {
        dataToUpdate.quantiteGauche = modifications.quantiteGauche;
      }
      if (modifications.quantiteDroite !== undefined) {
        dataToUpdate.quantiteDroite = modifications.quantiteDroite;
      }
      if (modifications.consistance !== undefined) {
        dataToUpdate.consistance = modifications.consistance;
      }
      if (modifications.couleur !== undefined) {
        dataToUpdate.couleur = modifications.couleur;
      }
      if (modifications.typeBiberon !== undefined) {
        dataToUpdate.typeBiberon = modifications.typeBiberon;
      }
      if (modifications.duree !== undefined) {
        dataToUpdate.duree = modifications.duree;
      }
      if (modifications.valeurTemperature !== undefined) {
        dataToUpdate.valeur = modifications.valeurTemperature;
      }
      if (modifications.dosage !== undefined) {
        dataToUpdate.dosage = modifications.dosage;
      }

      dataToUpdate.updatedAt = new Date();
      dataToUpdate.note = `Modifié par commande vocale`;

      if (previousEvent.type === type) {
        modifierEvenementOptimistic(
          childId,
          eventId,
          dataToUpdate,
          previousEvent,
        );
        setInfoModal({
          visible: true,
          title: "Succès",
          message: `${type.charAt(0).toUpperCase() + type.slice(1)} modifié avec succès`,
        });
      } else {
        setInfoModal({
          visible: true,
          title: "Erreur",
          message: `La modification du type "${type}" n'est pas encore implémentée`,
        });
      }
    } catch (error) {
      console.error("❌ Erreur modification:", error);
      setInfoModal({
        visible: true,
        title: "Erreur",
        message: `Impossible de modifier:\n${error instanceof Error ? error.message : "Erreur inconnue"}`,
      });
    }
  };

  /**
   * Execute la commande dans Firebase
   */
  const executeCommand = async (
    command: ParsedCommandResult,
    childId: string,
    avecCouche?: boolean,
    excretionSelection?: { pipi: boolean; popo: boolean },
    targetEvent?: Event | null
  ) => {
    try {
      const action = command.action || "add";

      // ==== SUPPRESSION ====
      if (action === "delete") {
        if (!targetEvent?.id) {
          setInfoModal({
            visible: true,
            title: "Erreur",
            message: "Aucun événement trouvé à supprimer",
          });
          return;
        }

        await executeDelete(command.type, childId, targetEvent.id);
        return;
      }

      // ==== MODIFICATION ====
      if (action === "modify") {
        if (!targetEvent?.id) {
          setInfoModal({
            visible: true,
            title: "Erreur",
            message: "Aucun événement trouvé à modifier",
          });
          return;
        }

        const modifications = command.modifications || {};
        await executeModify(
          command.type,
          childId,
          targetEvent.id,
          modifications,
          targetEvent,
        );
        return;
      }

      // ==== AJOUT (action === "add") ====
      const data = VoiceCommandService.formatDataForFirebase(command);
      console.log("💾 Ajout dans Firebase:", { type: command.type, data });

      switch (command.type) {
        case "tetee":
          const splitDuration =
            command.coteGauche && command.coteDroit
              ? command.quantite
                ? command.quantite / 2
                : undefined
              : command.quantite;
          const dataTetee = {
            ...data, // quantité, durée, sein, notes, etc.
            type: "tetee" as const,
            dureeGauche: command.coteGauche ? splitDuration : undefined,
            dureeDroite: command.coteDroit ? splitDuration : undefined,
          };
          ajouterEvenementOptimistic(childId, dataTetee);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Tétée ajoutée avec succès",
          });
          break;

        case "biberon":
          const dataBiberon = {
            ...data,
            type: "biberon" as const,
          };
          ajouterEvenementOptimistic(childId, dataBiberon);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Biberon ajouté avec succès",
          });
          break;

        case "pompage":
          const dataPompage = {
            ...data, // quantité, durée, sein, notes, etc.
            type: "pompage" as const,
          };
          ajouterEvenementOptimistic(childId, dataPompage);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Pompage ajouté avec succès",
          });
          break;

        case "couche":
          const { type: _unusedType, ...dataCoucheBase } = data as {
            type?: string;
          };
          // `couche` remains a backend/legacy command type; in the modern UI we
          // materialize diaper tracking through `miction` / `selle`.
          const dataCouche = {
            ...dataCoucheBase,
            avecCouche: true,
          };

          const promesses = [];
          const shouldAddPipi = excretionSelection?.pipi ?? false;
          const shouldAddPopo = excretionSelection?.popo ?? false;

          // Si pipi → on ajoute une miction
          if (shouldAddPipi) {
            ajouterEvenementOptimistic(childId, {
              ...dataCouche,
              type: "miction" as const,
            });
            promesses.push(Promise.resolve());
          }

          // Si popo → on ajoute une selle
          if (shouldAddPopo) {
            ajouterEvenementOptimistic(childId, {
              ...dataCouche,
              type: "selle" as const,
            });
            promesses.push(Promise.resolve());
          }

          // On attend que toutes les opérations soient terminées (il peut y en avoir 1 ou 2)
          if (promesses.length > 0) {
            await Promise.all(promesses);

            // Un seul alert, peu importe si c'était pipi, popo ou les deux
            setInfoModal({
              visible: true,
              title: "Succès",
              message: "Excrétion ajoutée avec succès",
            });
          } else {
            // Optionnel : cas improbable où ni pipi ni popo (peut arriver si commande mal formée)
            setInfoModal({
              visible: true,
              title: "Info",
              message: "Aucune excrétion à ajouter.",
            });
          }
          break;

        case "miction":
          const { type: _unusedMictionType, ...dataMictionBase } = data as {
            type?: string;
          };
          const dataMiction = {
            ...dataMictionBase,
            type: "miction" as const,
            avecCouche: !!avecCouche,
          };
          ajouterEvenementOptimistic(childId, dataMiction);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Miction ajoutée avec succès",
          });
          break;

        case "selle":
          const { type: _unusedSelleType, ...dataSelleBase } = data as {
            type?: string;
          };
          const dataSelle = {
            ...dataSelleBase,
            type: "selle" as const,
            avecCouche: !!avecCouche,
          };
          ajouterEvenementOptimistic(childId, dataSelle);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Selle ajoutée avec succès",
          });
          break;

        case "vitamine":
          const dataVitamine = {
            ...data,
            type: "vitamine" as const,
            nomVitamine: command.nomVitamine || "Vitamine D",
          };
          ajouterEvenementOptimistic(childId, dataVitamine);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Vitamine ajoutée avec succès",
          });
          break;

        case "sommeil":
          // Si pas de durée → sommeil "en cours" : vérifier qu'il n'y en a pas déjà un
          if (!(data as any).duree) {
            const recentSleeps = await obtenirEvenements(childId, {
              type: "sommeil" as EventType,
              limite: 5,
            });
            const hasOngoing = recentSleeps.some(
              (e: any) => e.heureDebut && !e.heureFin,
            );
            if (hasOngoing) {
              setInfoModal({
                visible: true,
                title: "Sommeil déjà en cours",
                message: "Un sommeil est déjà en cours. Terminez-le avant d'en commencer un nouveau.",
              });
              break;
            }
          }
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "sommeil" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Sommeil ajouté avec succès",
          });
          break;

        case "activite":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "activite" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Activité ajoutée avec succès",
          });
          break;

        case "jalon":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "jalon" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Jalon ajouté avec succès",
          });
          break;

        case "croissance":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "croissance" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Croissance ajoutée avec succès",
          });
          break;

        case "solide":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "solide" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Repas solide ajouté avec succès",
          });
          break;

        case "bain":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "bain" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Bain ajouté avec succès",
          });
          break;

        case "temperature":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "temperature" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Température ajoutée avec succès",
          });
          break;

        case "medicament":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "medicament" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Médicament ajouté avec succès",
          });
          break;

        case "symptome":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "symptome" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Symptôme ajouté avec succès",
          });
          break;

        case "vaccin":
          ajouterEvenementOptimistic(childId, {
            ...data,
            type: "vaccin" as const,
          });
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Vaccin ajouté avec succès",
          });
          break;

        default:
          setInfoModal({
            visible: true,
            title: "Info",
            message: `Le type "${command.type}" n'est pas encore implémenté`,
          });
      }
    } catch (error) {
      console.error("❌ Erreur exécution commande:", error);
      setInfoModal({
        visible: true,
        title: "Erreur",
        message: `Impossible d'ajouter l'élément:\n${
          error instanceof Error ? error.message : "Erreur inconnue"
        }`,
      });
    }
  };

  /**
   * Annule l'enregistrement en cours
   */
  const cancelRecording = async () => {
    try {
      if (isRecording) {
        await VoiceCommandService.stopRecording();
        setIsRecording(false);
        console.log("🚫 Enregistrement annulé");
      }
    } catch (error) {
      console.error("Erreur annulation:", error);
    }
  };

  /**
   * Bascule entre mode test et mode production
   */
  const toggleTestMode = () => {
    setTestMode(!testMode);
  };

  const setDiaperChoice = (value: boolean) => {
    setDiaperChoiceState(value);
    diaperChoiceRef.current = value;
  };

  const setExcretionSelection = (next: {
    pipi: boolean;
    popo: boolean;
  }) => {
    setExcretionSelectionState(next);
    excretionSelectionRef.current = next;
  };

  const clearPendingCommand = () => {
    setPendingCommand(null);
    setFoundEvent(null);
    setDiaperChoiceState(true);
    diaperChoiceRef.current = true;
    setExcretionSelectionState({ pipi: false, popo: false });
    excretionSelectionRef.current = { pipi: false, popo: false };
    setIsProcessing(false);
  };

  const cancelTestPrompt = () => {
    setTestPromptVisible(false);
    setTestPromptText("");
    setIsProcessing(false);
  };

  const submitTestPrompt = async () => {
    const text = testPromptText.trim();
    if (!text) {
      cancelTestPrompt();
      return;
    }

    try {
      setTestPromptVisible(false);
      await processVoiceCommand(text);
    } catch {
      setIsProcessing(false);
    }
  };

  return {
    isRecording,
    isProcessing,
    transcription,
    testMode,
    testPromptVisible,
    testPromptText,
    pendingCommand,
    diaperChoice,
    excretionSelection,
    infoModal,
    confirmModal,
    permissionModal,
    transcriptionErrorModal,
    startVoiceCommand,
    stopVoiceCommand,
    cancelRecording,
    toggleTestMode,
    setTestPromptText,
    cancelTestPrompt,
    submitTestPrompt,
    setDiaperChoice,
    setExcretionSelection,
    clearPendingCommand,
    setInfoModal,
    setConfirmModal,
    setPermissionModal,
    setTranscriptionErrorModal,
    processVoiceCommand, // Pour tester manuellement
  };
}
