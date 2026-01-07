// hooks/useVoiceCommand.ts
import { ajouterMiction } from "@/services/mictionsService";
import { ajouterPompage } from "@/services/pompagesService";
import { ajouterSelle } from "@/services/sellesService";
import { ajouterTetee } from "@/services/teteesService";
import VoiceCommandService, {
  CommandType,
  ParsedCommand,
} from "@/services/voiceCommandService";
import { useState } from "react";
import { Alert, Platform } from "react-native";
// Décommentez quand vous aurez créé ces services :
// import { ajouterBiberon } from '@/services/biberonsService';
// import { ajouterCouche } from '@/services/couchesService';
// import { ajouterSommeil } from '@/services/sommeilsService';

export function useVoiceCommand(childId: string, useTestMode: boolean = true) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [testMode, setTestMode] = useState(useTestMode);

  /**
   * Démarre l'enregistrement vocal
   */
  const startVoiceCommand = async () => {
    try {
      if (!childId) {
        Alert.alert("Erreur", "Aucun enfant sélectionné");
        return;
      }

      // Vérifier les permissions
      const hasPermission = await VoiceCommandService.requestPermissions();
      if (!hasPermission) {
        Alert.alert(
          "Permission requise",
          "L'accès au microphone est nécessaire pour utiliser les commandes vocales.",
          [
            { text: "Annuler", style: "cancel" },
            {
              text: "Paramètres",
              onPress: () => {
                // Ouvrir les paramètres de l'application
                if (Platform.OS === "ios") {
                  // Linking.openURL('app-settings:');
                }
              },
            },
          ]
        );
        return;
      }

      setIsRecording(true);
      await VoiceCommandService.startRecording();

      // Feedback visuel/audio optionnel
      console.log("🎤 Enregistrement démarré - Parlez maintenant");
    } catch (error) {
      console.error("Erreur démarrage commande vocale:", error);
      Alert.alert("Erreur", "Impossible de démarrer l'enregistrement");
      setIsRecording(false);
    }
  };

  /**
   * Arrête l'enregistrement et traite la commande
   */
  const stopVoiceCommand = async () => {
    try {
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
        Alert.prompt(
          "Commande vocale (MODE TEST)",
          "Entrez votre commande pour tester:\n\nExemples:\n• Ajoute un biberon de 150ml\n• Ajoute une tétée gauche il y a 10min\n• Ajoute un pipi popo",
          async (text) => {
            if (text && text.trim()) {
              await processVoiceCommand(text.trim());
            } else {
              setIsProcessing(false);
            }
          },
          "plain-text",
          "",
          "default"
        );
        return;
      }

      // ===================================
      // MODE PRODUCTION: AssemblyAI
      // ===================================
      try {
        // Vérifier si l'API key est configurée
        if (!VoiceCommandService.hasApiKey()) {
          Alert.alert(
            "Configuration requise",
            "L'API AssemblyAI n'est pas configurée.\n\nPassez en mode test ou configurez votre clé API.",
            [
              { text: "Mode Test", onPress: () => setTestMode(true) },
              { text: "Annuler", style: "cancel" },
            ]
          );
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
          Alert.alert("Erreur", "Aucun texte détecté dans l'audio");
          setIsProcessing(false);
        }
      } catch (error) {
        console.error("Erreur transcription:", error);
        Alert.alert(
          "Erreur de transcription",
          "Impossible de transcrire l'audio. Voulez-vous réessayer en mode test ?",
          [
            {
              text: "Mode Test",
              onPress: () => {
                setTestMode(true);
                stopVoiceCommand(); // Réessayer
              },
            },
            {
              text: "Annuler",
              style: "cancel",
              onPress: () => setIsProcessing(false),
            },
          ]
        );
      }
    } catch (error) {
      console.error("Erreur traitement commande vocale:", error);
      Alert.alert("Erreur", "Impossible de traiter la commande vocale");
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
        Alert.alert(
          "Commande non reconnue",
          `Je n'ai pas compris: "${text}"\n\n` +
            `Exemples de commandes:\n\n` +
            `🍼 "Ajoute un biberon de 150ml"\n` +
            `🤱 "Ajoute une tétée gauche"\n` +
            `🤱‍🍼 "Ajoute un pompage de 100ml droit et 120ml gauche"\n` +
            `🚼 "Ajoute un pipi popo"\n` +
            `😴 "Ajoute un sommeil"\n` +
            `⏰ "...il y a 15 minutes" (optionnel)`,
          [{ text: "OK" }]
        );
        setIsProcessing(false);
        return;
      }

      console.log("✅ Commande analysée:", command);

      // Confirmation avant ajout
      const confirmMessage = formatConfirmationMessage(command);

      Alert.alert("Confirmer l'ajout", confirmMessage, [
        {
          text: "Annuler",
          style: "cancel",
          onPress: () => setIsProcessing(false),
        },
        {
          text: "Confirmer",
          style: "default",
          onPress: async () => {
            await executeCommand(command, childId);
            setIsProcessing(false);
          },
        },
      ]);
    } catch (error) {
      console.error("Erreur processing:", error);
      Alert.alert("Erreur", "Impossible de traiter la commande");
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
      sommeil: "😴",
      pompage: "🤱‍🍼",
      autre: "📝",
    };

    const emoji = emojis[command.type] || "📝";
    const typeDisplay =
      command.type.charAt(0).toUpperCase() + command.type.slice(1);

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
        message += `💧 Type: ${types.join(" + ")}`;
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
  const executeCommand = async (command: ParsedCommand, childId: string) => {
    try {
      const data = VoiceCommandService.formatDataForFirebase(command);

      console.log("💾 Ajout dans Firebase:", { type: command.type, data });

      switch (command.type) {
        case "tetee":
          const dataTetee = {
            ...data, // quantité, durée, sein, notes, etc.
            type: "seins" as const,
          };
          await ajouterTetee(childId, dataTetee);
          Alert.alert("✅ Succès", "Tétée ajoutée avec succès", [
            { text: "OK" },
          ]);
          break;

        case "biberon":
          const dataBiberon = {
            ...data,
            type: "biberons" as const,
          };
          await ajouterTetee(childId, dataBiberon);
          Alert.alert("✅ Succès", "Biberon ajouté avec succès", [
            { text: "OK" },
          ]);
          break;

        case "pompage":
          const dataPompage = {
            ...data, // quantité, durée, sein, notes, etc.
            type: "pompage" as const,
          };
          await ajouterPompage(childId, dataPompage);
          Alert.alert("✅ Succès", "Pompage ajouté avec succès", [
            { text: "OK" },
          ]);
          break;

        case "couche":
          const dataCouche = {
            ...data,
            type: "excretion" as const,
          };

          const promesses = [];

          // Si pipi → on ajoute une miction
          if (command.pipi) {
            promesses.push(ajouterMiction(childId, dataCouche));
          }

          // Si popo → on ajoute une selle
          if (command.popo) {
            promesses.push(ajouterSelle(childId, dataCouche));
          }

          // On attend que toutes les opérations soient terminées (il peut y en avoir 1 ou 2)
          if (promesses.length > 0) {
            await Promise.all(promesses);

            // Un seul alert, peu importe si c'était pipi, popo ou les deux
            Alert.alert(
              "✅ Succès",
              "Excrétion ajoutée avec succès", // ou "Couche ajoutée avec succès" si tu préfères
              [{ text: "OK" }]
            );
          } else {
            // Optionnel : cas improbable où ni pipi ni popo (peut arriver si commande mal formée)
            Alert.alert("ℹ️ Info", "Aucune excrétion à ajouter.", [
              { text: "OK" },
            ]);
          }
          break;

        case "sommeil":
          // await ajouterSommeil(childId, data);
          Alert.alert(
            "⚠️ En développement",
            "Le service sommeil n'est pas encore activé.\nDécommentez l'import dans useVoiceCommand.ts",
            [{ text: "OK" }]
          );
          break;

        default:
          Alert.alert(
            "⚠️ Info",
            `Le type "${command.type}" n'est pas encore implémenté`
          );
      }
    } catch (error) {
      console.error("❌ Erreur exécution commande:", error);
      Alert.alert(
        "Erreur",
        `Impossible d'ajouter l'élément:\n${
          error instanceof Error ? error.message : "Erreur inconnue"
        }`,
        [{ text: "OK" }]
      );
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

  return {
    isRecording,
    isProcessing,
    transcription,
    testMode,
    startVoiceCommand,
    stopVoiceCommand,
    cancelRecording,
    toggleTestMode,
    processVoiceCommand, // Pour tester manuellement
  };
}
