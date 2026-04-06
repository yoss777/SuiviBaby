// hooks/useVoiceCommand.ts
// Thin facade composing useAudioRecorder, useVoiceParser, and useVoiceEventCreator.
// Preserves the exact same public API so consumers need zero changes.

import { useRef, useState } from "react";
import type { Event } from "@/services/eventsService";
import type { ParsedCommandResult } from "@/services/voiceCommandService";
import { useAudioRecorder } from "./useAudioRecorder";
import {
  transcribeAudio,
  parseCommands,
  formatConfirmationMessage,
  formatEventDetails,
} from "./useVoiceParser";
import {
  findEventByIdentifier,
  executeCommand,
  type ModalFeedback,
} from "./useVoiceEventCreator";

export function useVoiceCommand(childId: string, useTestMode: boolean = false) {
  // --- Audio recorder ---
  const recorder = useAudioRecorder();

  // --- Processing / transcription state ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string>("");

  // --- Test mode ---
  const [testMode, setTestMode] = useState(useTestMode);
  const [testPromptVisible, setTestPromptVisible] = useState(false);
  const [testPromptText, setTestPromptText] = useState("");

  // --- Pending command / diaper state ---
  const [pendingCommand, setPendingCommand] = useState<ParsedCommandResult | null>(null);
  const [diaperChoice, setDiaperChoiceState] = useState(true);
  const diaperChoiceRef = useRef(true);
  const [excretionSelection, setExcretionSelectionState] = useState({
    pipi: false,
    popo: false,
  });
  const excretionSelectionRef = useRef({ pipi: false, popo: false });

  // --- Modal state ---
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

  // --- Feedback helper passed to event creator ---
  const feedback: ModalFeedback = {
    showInfo: (title: string, message: string) => {
      setInfoModal({ visible: true, title, message });
    },
  };

  // =========================================================================
  // Traite plusieurs événements détectés dans une seule phrase
  // =========================================================================
  const processMultipleCommands = async (commands: ParsedCommandResult[]) => {
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
        let successCount = 0;
        const errors: string[] = [];

        for (const cmd of commands) {
          try {
            await executeCommand(
              cmd,
              childId,
              feedback,
              true,
              { pipi: cmd.pipi || false, popo: cmd.popo || false },
            );
            successCount++;
          } catch (error) {
            console.error(`Erreur ajout ${cmd.type}:`, error);
            errors.push(cmd.type);
          }
        }

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

  // =========================================================================
  // Traite la commande vocale transcrite
  // =========================================================================
  const processVoiceCommand = async (text: string) => {
    try {
      setTranscription(text);
      console.log("🔍 Analyse de la commande:", text);

      const commands = parseCommands(text);

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

      const commandsWithChildId = commands.map(cmd => ({ ...cmd, childId }));
      console.log(`✅ ${commandsWithChildId.length} événement(s) détecté(s):`, commandsWithChildId.map(c => c.type));

      // Si plusieurs événements, utiliser le flow multi-événements
      if (commandsWithChildId.length > 1) {
        await processMultipleCommands(commandsWithChildId);
        return;
      }

      // Flow single-event
      const commandWithChildId = commandsWithChildId[0];
      console.log("✅ Commande analysée:", commandWithChildId);

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

      // Confirmation avant action
      let confirmMessage = formatConfirmationMessage(commandWithChildId);

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
            feedback,
            diaperChoiceRef.current,
            excretionSelectionRef.current,
            eventToTarget,
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

  // =========================================================================
  // Start / Stop / Cancel voice command
  // =========================================================================

  const startVoiceCommand = async () => {
    try {
      if (recorder.isRecording || isProcessing) return;
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

      const result = await recorder.startRecording();
      if (result === "no-permission") {
        setPermissionModal(true);
      } else if (result === "error") {
        setInfoModal({
          visible: true,
          title: "Erreur",
          message: "Impossible de démarrer l'enregistrement",
        });
      }
    } catch (error) {
      console.error("Erreur démarrage commande vocale:", error);
      setInfoModal({
        visible: true,
        title: "Erreur",
        message: "Impossible de démarrer l'enregistrement",
      });
    }
  };

  const stopVoiceCommand = async () => {
    try {
      if (!recorder.isRecording) {
        setIsProcessing(false);
        return;
      }
      if (testMode) {
        setTestPromptText("");
        setTestPromptVisible(true);
        return;
      }

      setIsProcessing(true);

      const audioUri = await recorder.stopRecording();
      if (!audioUri) {
        throw new Error("Pas d'enregistrement disponible");
      }

      // MODE TEST (after recording — legacy path, kept for safety)
      if (testMode) {
        setTestPromptText("");
        setTestPromptVisible(true);
        return;
      }

      // MODE PRODUCTION: AssemblyAI
      const result = await transcribeAudio(audioUri);

      if (result.error === "no-api-key") {
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

      if (result.error === "transcription-error") {
        setTranscriptionErrorModal(true);
        return;
      }

      if (result.error === "empty" || !result.text) {
        setInfoModal({
          visible: true,
          title: "Erreur",
          message: "Aucun texte détecté dans l'audio",
        });
        setIsProcessing(false);
        return;
      }

      await processVoiceCommand(result.text);
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

  const cancelRecording = async () => {
    await recorder.cancelRecording();
  };

  // =========================================================================
  // Test mode helpers
  // =========================================================================

  const toggleTestMode = () => {
    setTestMode(!testMode);
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

  // =========================================================================
  // Diaper / excretion helpers
  // =========================================================================

  const setDiaperChoice = (value: boolean) => {
    setDiaperChoiceState(value);
    diaperChoiceRef.current = value;
  };

  const setExcretionSelection = (next: { pipi: boolean; popo: boolean }) => {
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

  // =========================================================================
  // Public API — identical to the original
  // =========================================================================

  return {
    isRecording: recorder.isRecording,
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
