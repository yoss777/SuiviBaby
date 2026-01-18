// hooks/useVoiceCommand.ts
import {
  ajouterBiberon,
  ajouterMiction,
  ajouterPompage,
  ajouterSelle,
  ajouterTetee,
  ajouterVitamine,
} from "@/migration/eventsDoubleWriteService";
import VoiceCommandService, {
  CommandType,
  ParsedCommand,
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
  const [pendingCommand, setPendingCommand] = useState<ParsedCommand | null>(null);
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
   * Traite la commande vocale transcrite
   */
  const processVoiceCommand = async (text: string) => {
    try {
      setTranscription(text);
      console.log("🔍 Analyse de la commande:", text);

      // Parser la commande
      const command = VoiceCommandService.parseCommand(text);

      if (!command) {
        setInfoModal({
          visible: true,
          title: "Commande non reconnue",
          message:
            `Je n'ai pas compris: "${text}"\n\n` +
            `Exemples de commandes:\n\n` +
            `🍼 "Ajoute un biberon de 150ml"\n` +
            `🤱 "Ajoute une tétée gauche"\n` +
            `🤱‍🍼 "Ajoute un pompage de 100ml droit et 120ml gauche"\n` +
            `🚼 "Ajoute un pipi popo"\n` +
            `😴 "Ajoute un sommeil"\n` +
            `⏰ "...il y a 15 minutes" (optionnel)`,
        });
        setIsProcessing(false);
        return;
      }

      const commandWithChildId = { ...command, childId };
      console.log("✅ Commande analysée:", commandWithChildId);

      // Confirmation avant ajout
      const confirmMessage = formatConfirmationMessage(commandWithChildId);

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

      setConfirmModal({
        visible: true,
        title: "Confirmer l'ajout",
        message: confirmMessage,
        onConfirm: async () => {
          await executeCommand(
            commandWithChildId,
            childId,
            diaperChoiceRef.current,
            excretionSelectionRef.current
          );
          setIsProcessing(false);
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
  const formatConfirmationMessage = (command: ParsedCommand): string => {
    const emojis: Record<CommandType, string> = {
      biberon: "🍼",
      tetee: "🤱",
      couche: "🚼",
      miction: "💧",
      selle: "💩",
      vitamine: "💊",
      sommeil: "😴",
      pompage: "🤱‍🍼",
      autre: "📝",
    };

    const emoji = emojis[command.type] || "📝";
    const typeDisplay =
      command.type === "couche"
        ? "Change de couche"
        : command.type.charAt(0).toUpperCase() + command.type.slice(1);

    let message = `${emoji} ${typeDisplay}\n\n`;

    // Heure
    if (command.timeOffset && command.timeOffset > 0) {
      message += `⏰ Il y a ${command.timeOffset} minute${
        command.timeOffset > 1 ? "s" : ""
      }\n`;
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
    }

    return message;
  };

  /**
   * Execute la commande dans Firebase
   */
  const executeCommand = async (
    command: ParsedCommand,
    childId: string,
    avecCouche?: boolean,
    excretionSelection?: { pipi: boolean; popo: boolean }
  ) => {
    try {
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
            type: "seins" as const,
            dureeGauche: command.coteGauche ? splitDuration : undefined,
            dureeDroite: command.coteDroit ? splitDuration : undefined,
          };
          await ajouterTetee(childId, dataTetee);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Tétée ajoutée avec succès",
          });
          break;

        case "biberon":
          const dataBiberon = {
            ...data,
            type: "biberons" as const,
          };
          await ajouterBiberon(childId, dataBiberon);
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
          await ajouterPompage(childId, dataPompage);
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
          const dataCouche = {
            ...dataCoucheBase,
            avecCouche: true,
          };

          const promesses = [];
          const shouldAddPipi = excretionSelection?.pipi ?? false;
          const shouldAddPopo = excretionSelection?.popo ?? false;

          // Si pipi → on ajoute une miction
          if (shouldAddPipi) {
            promesses.push(ajouterMiction(childId, dataCouche));
          }

          // Si popo → on ajoute une selle
          if (shouldAddPopo) {
            promesses.push(ajouterSelle(childId, dataCouche));
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
            avecCouche: !!avecCouche,
          };
          await ajouterMiction(childId, dataMiction);
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
            avecCouche: !!avecCouche,
          };
          await ajouterSelle(childId, dataSelle);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Selle ajoutée avec succès",
          });
          break;

        case "vitamine":
          const dataVitamine = {
            ...data,
            nomVitamine: command.nomVitamine || "Vitamine D",
          };
          await ajouterVitamine(childId, dataVitamine);
          setInfoModal({
            visible: true,
            title: "Succès",
            message: "Vitamine ajoutée avec succès",
          });
          break;

        case "sommeil":
          // await ajouterSommeil(childId, data);
          setInfoModal({
            visible: true,
            title: "En développement",
            message:
              "Le service sommeil n'est pas encore activé.\nDécommentez l'import dans useVoiceCommand.ts",
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
