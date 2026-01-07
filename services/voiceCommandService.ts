// services/VoiceCommandService.ts
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

// Types pour les commandes vocales
export type CommandType =
  | "biberon"
  | "tetee"
  | "couche"
  | "sommeil"
  | "pompage"
  | "autre";

interface BaseCommand {
  type: string;
  rawText: string;
  timeOffset?: number; // Temps en minutes dans le passé
  timestamp: Date;
  childId: string;
  // champs communs si besoin
}

interface BiberonCommand extends BaseCommand {
  type: "biberon";
  quantite: number; // ml
}

interface TeteeCommand extends BaseCommand {
  type: "tetee";
  coteGauche: boolean;
  coteDroit: boolean;
  quantite?: number; // durée en minutes, optionnelle
}

interface PompageCommand extends BaseCommand {
  type: "pompage";
  quantiteGauche?: number; // ml, peut être 0 ou undefined
  quantiteDroite?: number; // ml
  dureePompage?: number; // optionnel
}

interface CoucheCommand extends BaseCommand {
  type: "couche";
  pipi: boolean;
  popo: boolean;
}

export type ParsedCommand =
  | BiberonCommand
  | TeteeCommand
  | PompageCommand
  | CoucheCommand
  | BaseCommand; // pour sommeil et autre

class VoiceCommandService {
  private recording: Audio.Recording | null = null;
  private apiKey: string = ""; // À configurer

  constructor(apiKey?: string) {
    if (apiKey) {
      this.apiKey = apiKey;
    }
  }

  /**
   * Demande les permissions audio
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      return status === "granted";
    } catch (error) {
      console.error("Erreur permissions audio:", error);
      return false;
    }
  }

  /**
   * Démarre l'enregistrement audio
   */
  async startRecording(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      console.log("Enregistrement démarré");
    } catch (error) {
      console.error("Erreur démarrage enregistrement:", error);
      throw error;
    }
  }

  /**
   * Arrête l'enregistrement et retourne l'URI du fichier
   */
  async stopRecording(): Promise<string | null> {
    try {
      if (!this.recording) {
        throw new Error("Aucun enregistrement en cours");
      }

      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      console.log("Enregistrement arrêté:", uri);
      return uri;
    } catch (error) {
      console.error("Erreur arrêt enregistrement:", error);
      return null;
    }
  }

  /**
   * Upload le fichier audio vers AssemblyAI et récupère l'URL
   */
  async uploadAudioToAssemblyAI(audioUri: string): Promise<string> {
    try {
      // Lire le fichier audio
      const audioData = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convertir en buffer pour l'upload
      const buffer = Uint8Array.from(atob(audioData), (c) => c.charCodeAt(0));

      const response = await fetch("https://api.assemblyai.com/v2/upload", {
        method: "POST",
        headers: {
          authorization: this.apiKey,
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Upload failed: ${data.error || response.statusText}`);
      }

      return data.upload_url;
    } catch (error) {
      console.error("Erreur upload AssemblyAI:", error);
      throw error;
    }
  }

  /**
   * Transcrit l'audio en texte via AssemblyAI
   */
  async transcribeAudio(audioUri: string): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error("API Key AssemblyAI non configurée");
      }

      // 1. Upload le fichier audio
      console.log("📤 Upload audio vers AssemblyAI...");
      const uploadUrl = await this.uploadAudioToAssemblyAI(audioUri);

      // 2. Créer la transcription
      console.log("🎯 Demande de transcription...");
      const transcriptResponse = await fetch(
        "https://api.assemblyai.com/v2/transcript",
        {
          method: "POST",
          headers: {
            authorization: this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audio_url: uploadUrl,
            language_code: "fr", // Français
            speech_model: "best", // Meilleur modèle disponible
          }),
        }
      );

      const transcript = await transcriptResponse.json();

      if (!transcriptResponse.ok) {
        throw new Error(
          `Transcription failed: ${
            transcript.error || transcriptResponse.statusText
          }`
        );
      }

      const transcriptId = transcript.id;

      // 3. Attendre la fin de la transcription (polling)
      console.log("⏳ Transcription en cours...");
      let result = transcript;

      while (result.status !== "completed" && result.status !== "error") {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Attendre 1 seconde

        const pollingResponse = await fetch(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: {
              authorization: this.apiKey,
            },
          }
        );

        result = await pollingResponse.json();
      }

      if (result.status === "error") {
        throw new Error(`Transcription error: ${result.error}`);
      }

      console.log("✅ Transcription terminée");
      return result.text || "";
    } catch (error) {
      console.error("Erreur transcription AssemblyAI:", error);
      throw error;
    }
  }

  /**
   * Configure l'API key AssemblyAI
   */
  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Vérifie si l'API key est configurée
   */
  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Parse le texte transcrit pour extraire la commande
   */
  parseCommand(text: string): ParsedCommand | null {
    const lowerText = text.toLowerCase().trim();

    // Détection du type de commande
    let type: CommandType | null = null;
    let quantite: number | undefined;
    let quantiteGauche: number | undefined;
    let quantiteDroite: number | undefined;
    let coteGauche = false;
    let coteDroit = false;
    let pipi = false;
    let popo = false;
    let timeOffset = 0;

    // Fonction helper pour normaliser les mots "gauche/droit"
    const estGauche = (mot: string) => /gauche|gauche|left|sein\s*g/i.test(mot);
    const estDroit = (mot: string) => /droit|droite|right|sein\s*d/i.test(mot);

    // Détection biberon
    if (lowerText.includes("biberon") || lowerText.includes("bib")) {
      type = "biberon";

      // Extraction quantité (ml)
      const mlMatch = lowerText.match(/(\d+)\s*(ml|millilitre)/i);
      if (mlMatch) {
        quantite = parseInt(mlMatch[1]);
      }
    }

    // Détection tétée
    else if (
      lowerText.includes("tétée") ||
      lowerText.includes("tetee") ||
      lowerText.includes("allaitement")
    ) {
      type = "tetee";

      // Détection côté
      if (lowerText.includes("gauche")) coteGauche = true;
      if (lowerText.includes("droit")) coteDroit = true;

      // Si aucun côté spécifié, par défaut gauche
      if (!coteGauche && !coteDroit) coteGauche = true;

      // Extraction durée
      const minMatch = lowerText.match(/(\d+)\s*(min|minute)/i);
      if (minMatch) {
        quantite = parseInt(minMatch[1]);
      }
    }

    // Détection pompage
    else if (
      lowerText.includes("pompage") ||
      lowerText.includes("tire-lait") ||
      lowerText.includes("pomper") ||
      lowerText.includes("tiré") || // ← important pour "j'ai tiré"
      lowerText.includes("tire")
    ) {
      type = "pompage";

      // On cherche les nombres associés à "gauche" ou "droit", avec ou sans "ml"
      const mots = lowerText.split(/\s+/);

      let dernierNombre: number | null = null;
      let dernierCote: "gauche" | "droit" | null = null;

      for (let i = 0; i < mots.length; i++) {
        const mot = mots[i];

        // Détecte un nombre (avec ou sans "ml" après)
        const matchNombre = mot.match(/^(\d+)(ml)?$/i);
        if (matchNombre) {
          dernierNombre = parseInt(matchNombre[1]);
          continue; // on attend le côté suivant
        }

        // Détecte un côté
        if (estGauche(mot)) {
          if (dernierNombre !== null) {
            quantiteGauche = dernierNombre;
          }
          dernierCote = "gauche";
          dernierNombre = null; // reset pour le prochain
        } else if (estDroit(mot)) {
          if (dernierNombre !== null) {
            quantiteDroite = dernierNombre;
          }
          dernierCote = "droit";
          dernierNombre = null;
        }
      }

      // Cas spécial : "150 gauche et 300 droite" ou "gauche 150 droite 300"
      // On essaie une regex plus large si rien n'a été trouvé
      if (!quantiteGauche && !quantiteDroite) {
        // Format : "X gauche et Y droite"
        const matchEt = lowerText.match(
          /(\d+)\s*(ml)?\s*gauche.*?(\d+)\s*(ml)?\s*droite/i
        );
        if (matchEt) {
          quantiteGauche = parseInt(matchEt[1]);
          quantiteDroite = parseInt(matchEt[3]);
        } else {
          // Format inverse : "gauche X droite Y"
          const matchInverse = lowerText.match(
            /gauche.*?(\d+)\s*(ml)?.*?droite.*?(\d+)\s*(ml)?/i
          );
          if (matchInverse) {
            quantiteGauche = parseInt(matchInverse[1]);
            quantiteDroite = parseInt(matchInverse[2]);
          }
        }
      }

      // Dernier fallback : si un seul nombre + un seul côté mentionné
      if (!quantiteGauche && !quantiteDroite && dernierNombre !== null) {
        if (lowerText.includes("gauche")) {
          quantiteGauche = dernierNombre;
        } else if (lowerText.includes("droit")) {
          quantiteDroite = dernierNombre;
        }
      }
    }

    // Détection couche
    else if (
      lowerText.includes("couche") ||
      lowerText.includes("pipi") ||
      lowerText.includes("miction") ||
      lowerText.includes("selles") ||
      lowerText.includes("popo") ||
      lowerText.includes("caca")
    ) {
      type = "couche";

      if (lowerText.includes("pipi") || lowerText.includes("miction"))
        pipi = true;
      if (
        lowerText.includes("popo") ||
        lowerText.includes("caca") ||
        lowerText.includes("selles")
      )
        popo = true;

      // Si rien de spécifié, considérer pipi par défaut
      if (!pipi && !popo) pipi = true;
    }

    // Détection sommeil
    else if (
      lowerText.includes("sommeil") ||
      lowerText.includes("dodo") ||
      lowerText.includes("sieste")
    ) {
      type = "sommeil";
    }

    if (!type) {
      return null;
    }

    // Détection du décalage temporel
    const timeMatches = [
      lowerText.match(/il y a (\d+)\s*(min|minute)/i),
      lowerText.match(/(\d+)\s*(min|minute) (avant|plus tôt)/i),
    ];

    for (const match of timeMatches) {
      if (match) {
        timeOffset = parseInt(match[1]);
        break;
      }
    }

    // Calcul du timestamp
    const timestamp = new Date();
    if (timeOffset > 0) {
      timestamp.setMinutes(timestamp.getMinutes() - timeOffset);
    }

    return {
      type,
      quantite,
      quantiteGauche,
      quantiteDroite,
      coteGauche,
      coteDroit,
      pipi,
      popo,
      timeOffset,
      timestamp,
      rawText: text,
      childId: "", // À remplir par l'appelant
    };
  }

  /**
   * Formate les données pour Firebase selon le type
   */
  formatDataForFirebase(command: ParsedCommand) {
    const baseData = {
      // timestamp: command.timestamp,
      date: command.timestamp,
      createdAt: new Date(),
      note: `Ajouté par commande vocale: "${command.rawText}"`,
      childId: command.childId,
    };

    switch (command.type) {
      case "biberon":
        return {
          ...baseData,
          type: "biberons",
          quantite: command.quantite || 0,
          unit: "ml",
        };

      case "tetee":
        return {
          ...baseData,
          type: "seins", // ou "tetee"
          coteGauche: command.coteGauche || false,
          coteDroit: command.coteDroit || false,
          duree: command.quantite || 0, // en minutes
        };

      case "pompage":
        return {
          ...baseData,
          type: "pompage",
          quantiteGauche: command.quantiteGauche || 0, // en ml
          quantiteDroite: command.quantiteDroite || 0, // en ml
          quantiteTotale: (command.quantiteGauche ?? 0) + (command.quantiteDroite ?? 0),
        };

      case "couche":
        return {
          ...baseData,
          type: "couche",
          pipi: command.pipi || false,
          popo: command.popo || false,
        };

      case "sommeil":
        return {
          ...baseData,
          type: "sommeil",
          duree: command.quantite,
        };

    case "autre":
      return {
        ...baseData,
        type: command.type,
        // Ajouter des champs communs ici si besoin
      };

      default:
        return baseData;
    }
  }
}

export default new VoiceCommandService();
