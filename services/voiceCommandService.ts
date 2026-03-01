// services/VoiceCommandService.ts
import { functions } from "@/config/firebase";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { httpsCallable } from "firebase/functions";

// Types pour les commandes vocales
export type CommandType =
  | "biberon"
  | "tetee"
  | "couche"
  | "miction"
  | "selle"
  | "vitamine"
  | "sommeil"
  | "pompage"
  | "activite"
  | "jalon"
  | "croissance"
  | "solide"
  | "bain"
  | "temperature"
  | "medicament"
  | "symptome"
  | "vaccin"
  | "autre";

// Types pour les actions (ajout, modification, suppression)
export type CommandAction = "add" | "modify" | "delete";

// Interface pour identifier un événement existant
export interface EventIdentifier {
  type: CommandType;
  targetTime?: Date; // Heure cible (ex: "15h20")
  isLast?: boolean; // "le dernier biberon"
  relativeTime?: number; // "il y a 30 minutes"
}

interface BaseCommand {
  type: string;
  rawText: string;
  timeOffset?: number; // Temps en minutes (passé ou futur)
  isFuture?: boolean; // true si l'événement est planifié dans le futur
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

interface MictionCommand extends BaseCommand {
  type: "miction";
}

interface SelleCommand extends BaseCommand {
  type: "selle";
}

interface VitamineCommand extends BaseCommand {
  type: "vitamine";
  nomVitamine: string;
}

interface ActiviteCommand extends BaseCommand {
  type: "activite";
  typeActivite: string; // tummyTime, jeux, lecture, promenade, massage, musique, eveil, sortie, autre
  duree?: number; // durée en minutes
}

interface JalonCommand extends BaseCommand {
  type: "jalon";
  typeJalon: string; // dent, pas, sourire, mot, humeur, photo, autre
  humeur?: number; // 1-5 si type humeur
}

interface CroissanceCommand extends BaseCommand {
  type: "croissance";
  poids?: number; // en kg
  taille?: number; // en cm
  perimetreCranien?: number; // en cm
}

interface SolideCommand extends BaseCommand {
  type: "solide";
  typeSolide: string; // puree, compote, cereales, yaourt, morceaux, autre
  momentRepas?: string; // petit_dejeuner, dejeuner, gouter, diner, collation
  quantite?: string; // peu, moyen, beaucoup
}

interface BainCommand extends BaseCommand {
  type: "bain";
  duree?: number; // en minutes
}

interface TemperatureCommand extends BaseCommand {
  type: "temperature";
  valeur: number; // en °C
}

interface MedicamentCommand extends BaseCommand {
  type: "medicament";
  nomMedicament: string;
  dosage?: string;
}

interface SymptomeCommand extends BaseCommand {
  type: "symptome";
  description: string;
}

interface VaccinCommand extends BaseCommand {
  type: "vaccin";
  nomVaccin: string;
}

export type ParsedCommand =
  | BiberonCommand
  | TeteeCommand
  | PompageCommand
  | CoucheCommand
  | MictionCommand
  | SelleCommand
  | VitamineCommand
  | ActiviteCommand
  | JalonCommand
  | CroissanceCommand
  | SolideCommand
  | BainCommand
  | TemperatureCommand
  | MedicamentCommand
  | SymptomeCommand
  | VaccinCommand
  | BaseCommand; // pour sommeil et autre

// Type générique pour le parsing (toutes les propriétés optionnelles)
export interface ParsedCommandResult extends BaseCommand {
  // Action (ajout par défaut, ou modification/suppression)
  action?: CommandAction;
  eventIdentifier?: EventIdentifier;
  // Modifications à appliquer (pour action=modify)
  modifications?: Partial<ParsedCommandResult>;

  // Propriétés pour les événements
  quantite?: number;
  quantiteGauche?: number;
  quantiteDroite?: number;
  coteGauche?: boolean;
  coteDroit?: boolean;
  pipi?: boolean;
  popo?: boolean;
  nomVitamine?: string;
  typeActivite?: string;
  duree?: number;
  typeJalon?: string;
  humeur?: number;
  poids?: number;
  taille?: number;
  perimetreCranien?: number;
  typeSolide?: string;
  momentRepas?: string;
  quantiteSolide?: string;
  valeurTemperature?: number;
  nomMedicament?: string;
  dosage?: string;
  descriptionSymptome?: string;
  nomVaccin?: string;
  consistance?: string; // Pour selles
  couleur?: string; // Pour selles/mictions
  typeBiberon?: string; // Pour biberons
  isFuture?: boolean;
  contextNote?: string; // Contexte enrichi (ex: "dans le parc")
}

// Interface pour un segment de phrase parsé
interface ParsedSegment {
  text: string;
  rawText: string;
  timestamp: Date;
  timeOffset: number;
  isFuture: boolean;
  isRelativeToPrevious: boolean; // "20min après" = relatif au segment précédent
  relativeOffset?: number; // offset en minutes par rapport au segment précédent
}

class VoiceCommandService {
  private recording: Audio.Recording | null = null;

  constructor() {}

  private isAudioAvailable(): boolean {
    return !!Audio?.requestPermissionsAsync && !!Audio?.Recording?.createAsync;
  }

  /**
   * Demande les permissions audio
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (!this.isAudioAvailable()) {
        console.error("Module audio indisponible. Vérifiez expo-av.");
        return false;
      }
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
      if (this.recording) {
        console.warn("Enregistrement déjà en cours, démarrage ignoré.");
        return;
      }
      if (!this.isAudioAvailable()) {
        throw new Error("Module audio indisponible. Vérifiez expo-av.");
      }
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
        console.warn("Aucun enregistrement en cours, arrêt ignoré.");
        return null;
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
   * Transcrit l'audio en texte via Cloud Function proxy (AssemblyAI)
   * L'API key reste côté serveur — jamais exposée dans le bundle client.
   */
  async transcribeAudio(audioUri: string): Promise<string> {
    try {
      // Lire le fichier audio en base64
      const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Appeler la Cloud Function
      const transcribe = httpsCallable<
        { audioBase64: string },
        { text: string }
      >(functions, "transcribeAudio");

      const result = await transcribe({ audioBase64 });
      return result.data.text || "";
    } catch (error: any) {
      // Remonter un message lisible pour les erreurs CF
      if (error?.code === "functions/resource-exhausted") {
        throw new Error(error.message || "Limite de transcriptions atteinte.");
      }
      if (error?.code === "functions/unauthenticated") {
        throw new Error("Vous devez être connecté pour utiliser la voix.");
      }
      throw error;
    }
  }

  /**
   * La transcription passe désormais par Cloud Function.
   * Toujours disponible si l'utilisateur est authentifié.
   */
  hasApiKey(): boolean {
    return true;
  }

  /**
   * Normalise le texte pour gérer les prononciations phonétiques
   * Ex: "èmèl" → "ml", "céèm" → "cm", "kagé" → "kg"
   */
  private normalizePhonetics(text: string): string {
    let normalized = text.toLowerCase();

    // Unités de volume - ml (millilitres)
    normalized = normalized.replace(/\bèmèl\b/gi, "ml");
    normalized = normalized.replace(/\bémelle?\b/gi, "ml");
    normalized = normalized.replace(/\baime\s*l\b/gi, "ml");
    normalized = normalized.replace(/\bm\s*l\b/gi, "ml");
    normalized = normalized.replace(/\bmillilitre?s?\b/gi, "ml");

    // Unités de longueur - cm (centimètres)
    normalized = normalized.replace(/\bcéèm\b/gi, "cm");
    normalized = normalized.replace(/\bcé\s*aime\b/gi, "cm");
    normalized = normalized.replace(/\bc\s*m\b/gi, "cm");
    normalized = normalized.replace(/\bcentimètre?s?\b/gi, "cm");
    normalized = normalized.replace(/\bcentimetre?s?\b/gi, "cm");

    // Unités de poids - kg (kilogrammes)
    normalized = normalized.replace(/\bkagé\b/gi, "kg");
    normalized = normalized.replace(/\bka\s*gé\b/gi, "kg");
    normalized = normalized.replace(/\bk\s*g\b/gi, "kg");
    normalized = normalized.replace(/\bkilogramme?s?\b/gi, "kg");
    normalized = normalized.replace(/\bkilo?s?\b/gi, "kg");

    // Unités de poids - grammes
    normalized = normalized.replace(/\bgramme?s?\b/gi, "g");

    // Unités de dosage - mg (milligrammes)
    normalized = normalized.replace(/\bmilligramme?s?\b/gi, "mg");

    // Degrés pour température
    normalized = normalized.replace(/\bdegré?s?\b/gi, "°");
    normalized = normalized.replace(/\bdegres?\b/gi, "°");

    return normalized;
  }

  /**
   * Extrait l'heure d'un texte (format "15h20", "15 heures 20", etc.)
   */
  private extractTime(text: string): Date | null {
    const timePatterns = [
      /(\d{1,2})\s*h\s*(\d{2})?/i, // "15h20" ou "15h"
      /(\d{1,2})\s*heures?\s*(\d{2})?/i, // "15 heures 20"
      /(\d{1,2}):(\d{2})/i, // "15:20"
    ];

    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = match[2] ? parseInt(match[2]) : 0;
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
          const date = new Date();
          date.setHours(hours, minutes, 0, 0);
          return date;
        }
      }
    }
    return null;
  }

  /**
   * Détecte l'action (ajout, modification, suppression)
   */
  private detectAction(text: string): { action: CommandAction; cleanedText: string } {
    const lowerText = text.toLowerCase();

    // Patterns de suppression
    const deletePatterns = [
      /\b(supprime|supprimer|efface|effacer|enlève|enlever|retire|retirer|annule|annuler|delete)\b/i,
    ];

    // Patterns de modification
    const modifyPatterns = [
      /\b(modifie|modifier|change|changer|corrige|corriger|met|mettre|update|édite|edite|éditer|editer)\b/i,
      /\bc'était\b/i, // "c'était 180ml" implique une modification
      /\bce n'était pas\b/i,
      /\ben fait\b/i,
    ];

    for (const pattern of deletePatterns) {
      if (pattern.test(lowerText)) {
        return { action: "delete", cleanedText: text.replace(pattern, "").trim() };
      }
    }

    for (const pattern of modifyPatterns) {
      if (pattern.test(lowerText)) {
        return { action: "modify", cleanedText: text.replace(pattern, "").trim() };
      }
    }

    return { action: "add", cleanedText: text };
  }

  /**
   * Détecte l'identifiant d'un événement existant
   */
  private detectEventIdentifier(text: string, type: CommandType): EventIdentifier | null {
    const lowerText = text.toLowerCase();

    // "le dernier biberon", "la dernière tétée"
    if (/\b(dernier|dernière|derniere|last)\b/i.test(lowerText)) {
      return { type, isLast: true };
    }

    // "le biberon de 15h20"
    const targetTime = this.extractTime(text);
    if (targetTime && /\bde\s+\d{1,2}\s*h/i.test(lowerText)) {
      return { type, targetTime };
    }

    // "le pipi d'il y a 30 minutes"
    const relativeMatch = lowerText.match(/d'?il y a (\d+)\s*(min|minute|h|heure)/i);
    if (relativeMatch) {
      let minutes = parseInt(relativeMatch[1]);
      if (relativeMatch[2].startsWith("h")) {
        minutes *= 60;
      }
      return { type, relativeTime: minutes };
    }

    return null;
  }

  /**
   * Parse le texte transcrit pour extraire la commande (legacy - retourne le premier événement)
   */
  parseCommand(text: string): ParsedCommandResult | null {
    const commands = this.parseMultipleCommands(text);
    return commands.length > 0 ? commands[0] : null;
  }

  /**
   * Parse le texte transcrit pour extraire TOUS les événements détectés
   * Permet des phrases comme "il a bu 150ml, fait un pipi et on est allés au parc"
   * Gère les timestamps par segment et enrichit les notes avec le contexte
   */
  parseMultipleCommands(text: string): ParsedCommandResult[] {
    // Normaliser les prononciations phonétiques
    const normalizedText = this.normalizePhonetics(text);
    const lowerText = normalizedText.toLowerCase().trim();

    // Détecter l'action (ajout/modification/suppression)
    const { action } = this.detectAction(normalizedText);

    // Pour modification/suppression, on ne supporte qu'un seul événement
    if (action !== "add") {
      const singleCommand = this.parseSingleCommand(text, action);
      return singleCommand ? [singleCommand] : [];
    }

    // Découper en segments pour gérer les timestamps individuels
    const segments = this.splitIntoSegments(text);

    // Si pas de segments (phrase courte), utiliser l'ancien comportement
    if (segments.length <= 1) {
      return this.parseSegmentForAllEvents(lowerText, normalizedText, this.extractTimestamp(lowerText));
    }

    // Pour chaque segment, détecter les événements avec leur timestamp propre
    const commands: ParsedCommandResult[] = [];

    for (const segment of segments) {
      const timestampInfo = {
        timestamp: segment.timestamp,
        timeOffset: segment.timeOffset,
        isFuture: segment.isFuture,
      };

      // Détecter les événements dans ce segment
      const segmentCommands = this.parseSegmentForAllEvents(segment.text, segment.rawText, timestampInfo);

      // Enrichir avec le contexte si nécessaire
      for (const cmd of segmentCommands) {
        // Extraire le contexte secondaire du segment (ex: "dans le parc")
        const contextNote = this.extractContextNote(segment.text, cmd.type as CommandType);
        if (contextNote) {
          cmd.contextNote = contextNote;
        }
        commands.push(cmd);
      }
    }

    return commands;
  }

  /**
   * Parse un segment pour tous les types d'événements possibles
   */
  private parseSegmentForAllEvents(
    lowerText: string,
    rawText: string,
    timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }
  ): ParsedCommandResult[] {
    const commands: ParsedCommandResult[] = [];

    // Détecter chaque type d'événement indépendamment
    const biberonCmd = this.detectBiberon(lowerText, rawText, timestampInfo);
    if (biberonCmd) commands.push(biberonCmd);

    const teteeCmd = this.detectTetee(lowerText, rawText, timestampInfo);
    if (teteeCmd) commands.push(teteeCmd);

    const pompageCmd = this.detectPompage(lowerText, rawText, timestampInfo);
    if (pompageCmd) commands.push(pompageCmd);

    const coucheCmd = this.detectCouche(lowerText, rawText, timestampInfo);
    if (coucheCmd) commands.push(coucheCmd);

    const vitamineCmd = this.detectVitamine(lowerText, rawText, timestampInfo);
    if (vitamineCmd) commands.push(vitamineCmd);

    const sommeilCmd = this.detectSommeil(lowerText, rawText, timestampInfo);
    if (sommeilCmd) commands.push(sommeilCmd);

    const activiteCmd = this.detectActivite(lowerText, rawText, timestampInfo);
    if (activiteCmd) commands.push(activiteCmd);

    const jalonCmd = this.detectJalon(lowerText, rawText, timestampInfo);
    if (jalonCmd) commands.push(jalonCmd);

    const croissanceCmd = this.detectCroissance(lowerText, rawText, timestampInfo);
    if (croissanceCmd) commands.push(croissanceCmd);

    const solideCmd = this.detectSolide(lowerText, rawText, timestampInfo);
    if (solideCmd) commands.push(solideCmd);

    const bainCmd = this.detectBain(lowerText, rawText, timestampInfo);
    if (bainCmd) commands.push(bainCmd);

    const temperatureCmd = this.detectTemperature(lowerText, rawText, timestampInfo);
    if (temperatureCmd) commands.push(temperatureCmd);

    const medicamentCmd = this.detectMedicament(lowerText, rawText, timestampInfo);
    if (medicamentCmd) commands.push(medicamentCmd);

    const symptomeCmd = this.detectSymptome(lowerText, rawText, timestampInfo);
    if (symptomeCmd) commands.push(symptomeCmd);

    const vaccinCmd = this.detectVaccin(lowerText, rawText, timestampInfo);
    if (vaccinCmd) commands.push(vaccinCmd);

    return commands;
  }

  /**
   * Extrait le contexte secondaire d'un segment pour enrichir la note
   * Ex: "lire une histoire dans le parc" → typeActivite="lecture", contextNote="dans le parc"
   */
  private extractContextNote(text: string, detectedType: CommandType): string | null {
    const contextParts: string[] = [];

    // Patterns de contexte de lieu
    const lieuPatterns = [
      { pattern: /\b(dans|au|à)\s+(le\s+)?(parc|jardin|square)/i, label: "au parc" },
      { pattern: /\b(dehors|extérieur|à l'extérieur)/i, label: "dehors" },
      { pattern: /\b(dans|à)\s+(la\s+)?(chambre)/i, label: "dans la chambre" },
      { pattern: /\b(dans|au|à)\s+(le\s+)?(salon)/i, label: "au salon" },
      { pattern: /\b(dans|à)\s+(la\s+)?(cuisine)/i, label: "dans la cuisine" },
      { pattern: /\b(dans|à)\s+(la\s+)?(salle de bain|sdb)/i, label: "dans la salle de bain" },
      { pattern: /\b(chez)\s+(la\s+)?(nounou|mamie|papi|grand-mère|grand-père|grands-parents)/i, label: (m: RegExpMatchArray) => `chez ${m[3] || "la nounou"}` },
      { pattern: /\b(à|en)\s+(la\s+)?(crèche|creche)/i, label: "à la crèche" },
      { pattern: /\b(en\s+)?(poussette)/i, label: "en poussette" },
      { pattern: /\b(dans|sur)\s+(le\s+)?(lit|berceau|couffin)/i, label: "dans le lit" },
      { pattern: /\b(sur|dans)\s+(le\s+)?(tapis d'éveil|tapis)/i, label: "sur le tapis d'éveil" },
      { pattern: /\b(dans|sur)\s+(le\s+)?(transat|balancelle)/i, label: "dans le transat" },
    ];

    // Patterns de contexte d'accompagnement
    const accompagnementPatterns = [
      { pattern: /\bavec\s+(maman|papa|mamie|papi|nounou|grand-mère|grand-père)/i, label: (m: RegExpMatchArray) => `avec ${m[1]}` },
    ];

    // Patterns d'activités secondaires (pour enrichir les activités principales)
    const activiteSecondairePatterns: { pattern: RegExp; label: string; excludeFor: CommandType[] }[] = [
      { pattern: /\b(parc|jardin|square|promenade|balade)\b/i, label: "promenade", excludeFor: ["activite"] },
      { pattern: /\b(histoire|livre|conte)\b/i, label: "lecture", excludeFor: ["activite"] },
      { pattern: /\b(musique|chanson|berceuse)\b/i, label: "musique", excludeFor: ["activite"] },
      { pattern: /\b(jeux?|jouet|jouer)\b/i, label: "jeux", excludeFor: ["activite"] },
    ];

    // Extraire les contextes de lieu
    for (const { pattern, label } of lieuPatterns) {
      const match = text.match(pattern);
      if (match) {
        const contextLabel = typeof label === "function" ? label(match) : label;
        if (!contextParts.includes(contextLabel)) {
          contextParts.push(contextLabel);
        }
      }
    }

    // Extraire les contextes d'accompagnement
    for (const { pattern, label } of accompagnementPatterns) {
      const match = text.match(pattern);
      if (match) {
        const contextLabel = typeof label === "function" ? label(match) : label;
        if (!contextParts.includes(contextLabel)) {
          contextParts.push(contextLabel);
        }
      }
    }

    // Extraire les activités secondaires (sauf si c'est le type détecté)
    for (const { pattern, label, excludeFor } of activiteSecondairePatterns) {
      if (excludeFor.includes(detectedType)) continue;

      const match = text.match(pattern);
      if (match && !contextParts.includes(label)) {
        contextParts.push(label);
      }
    }

    return contextParts.length > 0 ? contextParts.join(", ") : null;
  }

  /**
   * Découpe une phrase en segments séparés par virgules, "et", "puis", et autres adverbes de temps.
   * Gère les timestamps relatifs ("20min après" = relatif au segment précédent)
   */
  private splitIntoSegments(text: string): ParsedSegment[] {
    const normalizedText = this.normalizePhonetics(text);

    // Séparateurs de segments avec support étendu des adverbes de temps :
    // - Ponctuation : virgule, point-virgule
    // - Connecteurs : "et", "puis", "ensuite", "après", "avant"
    // - Adverbes temporels : "finalement", "pour finir", "au final", "entre-temps", "pendant ce temps"
    // - Séquences : "d'abord", "premièrement", "deuxièmement", "pour commencer", "pour terminer"
    // - Transitions : "plus tard", "juste avant", "juste après", "un peu plus tard", "peu après"
    const segmentPattern = new RegExp(
      [
        // Ponctuation
        /[,;]/.source,
        // Connecteurs simples (avec espaces obligatoires autour)
        /\s+(?:et|puis|ensuite|après|avant|or)\s+/.source,
        // Adverbes de temps composés
        /\s+(?:après\s+(?:ça|cela|quoi)|avant\s+(?:ça|cela))\s*/.source,
        // Séquences temporelles
        /\s+(?:d'abord|pour\s+commencer|premièrement|deuxièmement|troisièmement)\s+/.source,
        /\s+(?:finalement|pour\s+finir|au\s+final|pour\s+terminer|en\s+dernier)\s+/.source,
        // Transitions temporelles
        /\s+(?:entre-temps|entre\s+temps|pendant\s+ce\s+temps)\s+/.source,
        /\s+(?:plus\s+tard|peu\s+après|juste\s+avant|juste\s+après|un\s+peu\s+plus\s+tard)\s+/.source,
        // "là" comme séparateur quand suivi d'un sujet ("là il", "là elle", "là on")
        /\s+là\s+(?=il|elle|on|le\s+bébé|bébé)/.source,
      ].join("|"),
      "gi"
    );

    // Découper en segments
    const rawSegments = normalizedText.split(segmentPattern).map(s => s.trim()).filter(s => s.length > 0);

    if (rawSegments.length === 0) {
      return [];
    }

    const segments: ParsedSegment[] = [];
    let previousTimestamp = new Date();
    let previousOffset = 0;

    for (let i = 0; i < rawSegments.length; i++) {
      const segmentText = rawSegments[i];
      const lowerSegment = segmentText.toLowerCase();

      // Vérifier si c'est un temps relatif au segment précédent
      // Patterns supportés : "20min après", "10 minutes plus tard", "une demi-heure après", "1h plus tard"
      const relativeAfterMatch = lowerSegment.match(
        /^(?:(\d+)\s*(min|minute|h|heure)s?|(?:une?\s+)?demi[e]?[-\s]?(heure))\s*(après|plus tard|ensuite|apr[eè]s)?/i
      );

      // Pattern alternatif pour "X minutes/heures après" au milieu du segment
      const relativeInMiddleMatch = !relativeAfterMatch
        ? lowerSegment.match(/(\d+)\s*(min|minute|h|heure)s?\s*(après|plus tard)/i)
        : null;

      // Vérifier si le segment contient un indicateur de temps présent
      const isPresentTime = /\b(là|maintenant|en ce moment|actuellement|à l'instant)\b/i.test(lowerSegment);

      let timestamp: Date;
      let timeOffset: number;
      let isFuture = false;
      let isRelativeToPrevious = false;
      let relativeOffset = 0;

      // Utiliser le match relatif trouvé (en début ou au milieu du segment)
      const effectiveRelativeMatch = relativeAfterMatch || relativeInMiddleMatch;

      if (effectiveRelativeMatch && i > 0) {
        // Temps relatif au segment précédent : "20min après" signifie 20min APRÈS le temps du segment précédent
        // Si le segment précédent était "il y a 30min", alors "20min après" = il y a 10min (30-20=10)
        if (effectiveRelativeMatch[1]) {
          relativeOffset = parseInt(effectiveRelativeMatch[1]);
          if (effectiveRelativeMatch[2] && effectiveRelativeMatch[2].startsWith("h")) {
            relativeOffset *= 60;
          }
        } else if (effectiveRelativeMatch[3] === "heure") {
          // "une demi-heure après"
          relativeOffset = 30;
        }
        isRelativeToPrevious = true;

        // Le temps absolu = temps précédent + offset relatif
        timestamp = new Date(previousTimestamp.getTime() + relativeOffset * 60 * 1000);
        timeOffset = Math.round((new Date().getTime() - timestamp.getTime()) / 60000);
        if (timeOffset < 0) {
          isFuture = true;
          timeOffset = Math.abs(timeOffset);
        }
      } else if (isPresentTime) {
        // "là il fait une sieste" = maintenant
        timestamp = new Date();
        timeOffset = 0;
        isFuture = false;
      } else {
        // Extraire le timestamp normalement pour ce segment
        const tsInfo = this.extractTimestampFromSegment(lowerSegment);
        timestamp = tsInfo.timestamp;
        timeOffset = tsInfo.timeOffset;
        isFuture = tsInfo.isFuture;
      }

      segments.push({
        text: lowerSegment,
        rawText: segmentText,
        timestamp,
        timeOffset,
        isFuture,
        isRelativeToPrevious,
        relativeOffset: isRelativeToPrevious ? relativeOffset : undefined,
      });

      // Mémoriser pour le segment suivant
      previousTimestamp = timestamp;
      previousOffset = timeOffset;
    }

    return segments;
  }

  /**
   * Extrait le timestamp depuis un segment de texte
   */
  private extractTimestampFromSegment(lowerText: string): { timestamp: Date; timeOffset: number; isFuture: boolean } {
    let timeOffset = 0;
    let isFuture = false;

    // Patterns pour le passé
    const pastPatterns = [
      /il y a (\d+)\s*(min|minute|h|heure)/i,
      /(\d+)\s*(min|minute|h|heure)\s*(avant|plus tôt|plus tot)/i,
      /y'?\s*a\s+(\d+)\s*(min|minute)/i,
    ];

    // Patterns pour le futur
    const futurePatterns = [
      /dans (\d+)\s*(min|minute|h|heure)/i,
      /(\d+)\s*(min|minute|h|heure)\s*(après|plus tard)/i,
    ];

    // Vérifier le futur
    for (const pattern of futurePatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        timeOffset = parseInt(match[1]);
        if (match[2] && (match[2].startsWith("h") || match[2] === "heure")) {
          timeOffset *= 60;
        }
        isFuture = true;
        break;
      }
    }

    // Si pas de futur, vérifier le passé
    if (!isFuture) {
      for (const pattern of pastPatterns) {
        const match = lowerText.match(pattern);
        if (match) {
          timeOffset = parseInt(match[1]);
          if (match[2] && (match[2].startsWith("h") || match[2] === "heure")) {
            timeOffset *= 60;
          }
          break;
        }
      }
    }

    const timestamp = new Date();
    if (timeOffset > 0) {
      if (isFuture) {
        timestamp.setMinutes(timestamp.getMinutes() + timeOffset);
      } else {
        timestamp.setMinutes(timestamp.getMinutes() - timeOffset);
      }
    }

    return { timestamp, timeOffset, isFuture };
  }

  /**
   * Extrait le timestamp depuis le texte (passé ou futur)
   */
  private extractTimestamp(lowerText: string): { timestamp: Date; timeOffset: number; isFuture: boolean } {
    let timeOffset = 0;
    let isFuture = false;

    // Patterns pour le passé
    const pastPatterns = [
      /il y a (\d+)\s*(min|minute|h|heure)/i,
      /(\d+)\s*(min|minute|h|heure)\s*(avant|plus tôt|plus tot)/i,
      /y'?\s*a\s+(\d+)\s*(min|minute)/i,
    ];

    // Patterns pour le futur
    const futurePatterns = [
      /dans (\d+)\s*(min|minute|h|heure)/i,
      /(\d+)\s*(min|minute|h|heure)\s*(après|plus tard)/i,
    ];

    // Vérifier le futur
    for (const pattern of futurePatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        timeOffset = parseInt(match[1]);
        if (match[2] && (match[2].startsWith("h") || match[2] === "heure")) {
          timeOffset *= 60;
        }
        isFuture = true;
        break;
      }
    }

    // Si pas de futur, vérifier le passé
    if (!isFuture) {
      for (const pattern of pastPatterns) {
        const match = lowerText.match(pattern);
        if (match) {
          timeOffset = parseInt(match[1]);
          if (match[2] && (match[2].startsWith("h") || match[2] === "heure")) {
            timeOffset *= 60;
          }
          break;
        }
      }
    }

    const timestamp = new Date();
    if (timeOffset > 0) {
      if (isFuture) {
        timestamp.setMinutes(timestamp.getMinutes() + timeOffset);
      } else {
        timestamp.setMinutes(timestamp.getMinutes() - timeOffset);
      }
    }

    return { timestamp, timeOffset, isFuture };
  }

  /**
   * Crée un objet de base pour une commande
   */
  private createBaseCommand(
    type: CommandType,
    rawText: string,
    timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }
  ): ParsedCommandResult {
    return {
      type,
      action: "add",
      timestamp: timestampInfo.timestamp,
      timeOffset: timestampInfo.timeOffset,
      isFuture: timestampInfo.isFuture,
      rawText,
      childId: "",
    };
  }

  /**
   * Détecte un biberon dans le texte
   */
  private detectBiberon(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (
      !lowerText.includes("biberon") &&
      !lowerText.includes("bib ") &&
      !/\bbib\b/.test(lowerText) &&
      !lowerText.includes("bouteille") &&
      !/\bbu\s+\d+/.test(lowerText)
    ) {
      return null;
    }

    const cmd = this.createBaseCommand("biberon", rawText, timestampInfo);

    // Extraction quantité
    const mlPatterns = [
      /(\d+)\s*(ml)/i,
      /(\d+)\s*millilitre/i,
      /bu\s+(\d+)/i,
      /boire\s+(\d+)/i,
      /donné\s+(\d+)/i,
    ];

    for (const pattern of mlPatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        cmd.quantite = parseInt(match[1]);
        break;
      }
    }

    // Type de biberon
    if (lowerText.includes("maternel") || lowerText.includes("lait maternel")) {
      cmd.typeBiberon = "lait_maternel";
    } else if (lowerText.includes("infantile") || lowerText.includes("lait infantile") || lowerText.includes("formula")) {
      cmd.typeBiberon = "lait_infantile";
    } else if (lowerText.includes("eau")) {
      cmd.typeBiberon = "eau";
    } else if (lowerText.includes("jus")) {
      cmd.typeBiberon = "jus";
    }

    return cmd;
  }

  /**
   * Détecte une tétée dans le texte
   */
  private detectTetee(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (
      !lowerText.includes("tétée") &&
      !lowerText.includes("tetee") &&
      !lowerText.includes("têtée") &&
      !lowerText.includes("allaitement") &&
      !lowerText.includes("allaité") &&
      !lowerText.includes("nourri au sein") &&
      !lowerText.includes("mis au sein") &&
      !lowerText.includes("donné le sein") &&
      !/\bsein\b/.test(lowerText)
    ) {
      return null;
    }

    const cmd = this.createBaseCommand("tetee", rawText, timestampInfo);

    // Détection côté
    if (lowerText.includes("gauche") || lowerText.includes("sein gauche")) {
      cmd.coteGauche = true;
    }
    if (lowerText.includes("droit") || lowerText.includes("sein droit")) {
      cmd.coteDroit = true;
    }
    if (lowerText.includes("deux") || lowerText.includes("les 2") || lowerText.includes("both")) {
      cmd.coteGauche = true;
      cmd.coteDroit = true;
    }
    if (!cmd.coteGauche && !cmd.coteDroit) {
      cmd.coteGauche = true;
    }

    // Durée
    const minPatterns = [/(\d+)\s*(min|minute)/i, /pendant\s+(\d+)/i, /duré\s+(\d+)/i];
    for (const pattern of minPatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        cmd.quantite = parseInt(match[1]);
        break;
      }
    }

    return cmd;
  }

  /**
   * Détecte un pompage dans le texte
   */
  private detectPompage(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (
      !lowerText.includes("pompage") &&
      !lowerText.includes("tire-lait") &&
      !lowerText.includes("pomper") &&
      !lowerText.includes("tiré") &&
      !lowerText.includes("tire")
    ) {
      return null;
    }

    // Éviter conflit avec tétée (sein)
    if (lowerText.includes("tétée") || lowerText.includes("allaité")) {
      return null;
    }

    const cmd = this.createBaseCommand("pompage", rawText, timestampInfo);

    // Parse quantités gauche/droite
    const matchEt = lowerText.match(/(\d+)\s*(ml)?\s*gauche.*?(\d+)\s*(ml)?\s*droite/i);
    if (matchEt) {
      cmd.quantiteGauche = parseInt(matchEt[1]);
      cmd.quantiteDroite = parseInt(matchEt[3]);
    } else {
      // Un seul côté
      const matchGauche = lowerText.match(/(\d+)\s*(ml)?\s*gauche/i);
      const matchDroite = lowerText.match(/(\d+)\s*(ml)?\s*droite/i);
      if (matchGauche) cmd.quantiteGauche = parseInt(matchGauche[1]);
      if (matchDroite) cmd.quantiteDroite = parseInt(matchDroite[1]);
    }

    return cmd;
  }

  /**
   * Détecte une couche/miction/selle dans le texte
   */
  private detectCouche(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    const hasPipi = lowerText.includes("pipi") || lowerText.includes("miction") || lowerText.includes("urine") || lowerText.includes("mouillé");
    const hasPopo = lowerText.includes("popo") || lowerText.includes("caca") || lowerText.includes("selle") || lowerText.includes("crotte");
    const hasCouche = lowerText.includes("couche") || lowerText.includes("changé") || lowerText.includes("change de");

    if (!hasPipi && !hasPopo && !hasCouche) {
      return null;
    }

    let type: CommandType;
    if (hasCouche || (hasPipi && hasPopo)) {
      type = "couche";
    } else if (hasPipi) {
      type = "miction";
    } else {
      type = "selle";
    }

    const cmd = this.createBaseCommand(type, rawText, timestampInfo);
    cmd.pipi = hasPipi || hasCouche;
    cmd.popo = hasPopo;

    // Consistance/couleur pour selles
    if (hasPopo || type === "selle") {
      if (lowerText.includes("liquide") || lowerText.includes("diarrhée")) cmd.consistance = "liquide";
      else if (lowerText.includes("molle") || lowerText.includes("mou")) cmd.consistance = "molle";
      else if (lowerText.includes("normal")) cmd.consistance = "normale";
      else if (lowerText.includes("dur")) cmd.consistance = "dure";

      if (lowerText.includes("jaune")) cmd.couleur = "jaune";
      else if (lowerText.includes("vert")) cmd.couleur = "vert";
      else if (lowerText.includes("marron") || lowerText.includes("brun")) cmd.couleur = "marron";
    }

    return cmd;
  }

  /**
   * Détecte une vitamine dans le texte
   */
  private detectVitamine(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (!lowerText.includes("vitamine") && !/\bvit\b/i.test(lowerText) && !/\bvite\b/i.test(lowerText)) {
      return null;
    }

    const cmd = this.createBaseCommand("vitamine", rawText, timestampInfo);

    if (/vitamine\s*k/i.test(lowerText) || /vit\s*k/i.test(lowerText)) {
      cmd.nomVitamine = "Vitamine K";
    } else {
      cmd.nomVitamine = "Vitamine D";
    }

    return cmd;
  }

  /**
   * Détecte un sommeil dans le texte
   */
  private detectSommeil(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (
      !lowerText.includes("sommeil") &&
      !lowerText.includes("dodo") &&
      !lowerText.includes("sieste") &&
      !lowerText.includes("dort") &&
      !lowerText.includes("dormi") &&
      !lowerText.includes("endormi") &&
      !lowerText.includes("réveillé") &&
      !lowerText.includes("nuit") &&
      !lowerText.includes("couché")
    ) {
      return null;
    }

    const cmd = this.createBaseCommand("sommeil", rawText, timestampInfo);

    // Durée
    const dureePatterns = [/(\d+)\s*(h|heure)/i, /(\d+)\s*(min|minute)/i, /dormi\s+(\d+)/i];
    for (const pattern of dureePatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        let minutes = parseInt(match[1]);
        if (match[2] && (match[2].startsWith("h") || match[2] === "heure")) {
          minutes *= 60;
        }
        cmd.duree = minutes;
        break;
      }
    }

    return cmd;
  }

  /**
   * Détecte une activité dans le texte
   */
  private detectActivite(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    // Liste des triggers pour activité
    const activityTriggers = [
      "activité", "activite", "tummy time", "tummytime", "sur le ventre",
      "motricité", "gym bébé", "jeux", "jouer", "jouet", "hochet", "puzzle",
      "lecture", "lire", "livre", "histoire", "conte", "comptine",
      "promenade", "balade", "sortie", "parc", "jardin", "dehors", "poussette",
      "massage", "câlin", "calin", "peau à peau",
      "musique", "chanson", "chanter", "berceuse",
      "éveil", "eveil", "sensoriel", "mobile", "tapis d'éveil",
      "crèche", "creche", "nounou"
    ];

    const hasActivity = activityTriggers.some(trigger => lowerText.includes(trigger));
    if (!hasActivity) {
      return null;
    }

    const cmd = this.createBaseCommand("activite", rawText, timestampInfo);

    // Détection du type d'activité
    if (lowerText.includes("tummy") || lowerText.includes("sur le ventre")) {
      cmd.typeActivite = "tummyTime";
    } else if (lowerText.includes("motricité") || lowerText.includes("gym")) {
      cmd.typeActivite = "motricite";
    } else if (lowerText.includes("jeux") || lowerText.includes("jouer") || lowerText.includes("jouet") || lowerText.includes("puzzle")) {
      cmd.typeActivite = "jeux";
    } else if (lowerText.includes("lecture") || lowerText.includes("lire") || lowerText.includes("livre") || lowerText.includes("histoire")) {
      cmd.typeActivite = "lecture";
    } else if (lowerText.includes("promenade") || lowerText.includes("balade") || lowerText.includes("parc") || lowerText.includes("jardin") || lowerText.includes("poussette")) {
      cmd.typeActivite = "promenade";
    } else if (lowerText.includes("sortie") || lowerText.includes("dehors")) {
      cmd.typeActivite = "sortie";
    } else if (lowerText.includes("massage")) {
      cmd.typeActivite = "massage";
    } else if (lowerText.includes("câlin") || lowerText.includes("calin") || lowerText.includes("peau à peau")) {
      cmd.typeActivite = "calin";
    } else if (lowerText.includes("musique") || lowerText.includes("chanson") || lowerText.includes("berceuse")) {
      cmd.typeActivite = "musique";
    } else if (lowerText.includes("éveil") || lowerText.includes("eveil") || lowerText.includes("sensoriel")) {
      cmd.typeActivite = "eveil";
    } else if (lowerText.includes("crèche") || lowerText.includes("nounou")) {
      cmd.typeActivite = "garde";
    } else {
      cmd.typeActivite = "autre";
    }

    // Durée
    const minMatch = lowerText.match(/(\d+)\s*(min|minute|h|heure)/i);
    if (minMatch) {
      let minutes = parseInt(minMatch[1]);
      if (minMatch[2].startsWith("h")) minutes *= 60;
      cmd.duree = minutes;
    }

    return cmd;
  }

  /**
   * Détecte un jalon dans le texte
   */
  private detectJalon(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    const jalonTriggers = [
      "jalon", "milestone", "première dent", "premiere dent", "premiers pas",
      "premier sourire", "premiers mots", "premier mot", "se retourne",
      "tient assis", "assis seul", "rampe", "4 pattes", "se lève", "debout",
      "gazouille", "babille", "dit maman", "dit papa", "premier rire",
      "fait coucou", "attrape", "applaudit"
    ];

    // Humeur est un jalon spécial
    const hasHumeur = lowerText.includes("humeur");
    const hasJalon = jalonTriggers.some(trigger => lowerText.includes(trigger));

    if (!hasJalon && !hasHumeur) {
      return null;
    }

    const cmd = this.createBaseCommand("jalon", rawText, timestampInfo);

    // Détection du type
    if (lowerText.includes("dent")) cmd.typeJalon = "dent";
    else if (lowerText.includes("pas") || lowerText.includes("marche")) cmd.typeJalon = "pas";
    else if (lowerText.includes("se retourne")) cmd.typeJalon = "retournement";
    else if (lowerText.includes("assis")) cmd.typeJalon = "assis";
    else if (lowerText.includes("rampe") || lowerText.includes("4 pattes")) cmd.typeJalon = "rampe";
    else if (lowerText.includes("debout") || lowerText.includes("se lève")) cmd.typeJalon = "debout";
    else if (lowerText.includes("sourire")) cmd.typeJalon = "sourire";
    else if (lowerText.includes("rire") || lowerText.includes("rit")) cmd.typeJalon = "rire";
    else if (lowerText.includes("mot") || lowerText.includes("maman") || lowerText.includes("papa")) cmd.typeJalon = "mot";
    else if (lowerText.includes("gazouille") || lowerText.includes("babille")) cmd.typeJalon = "gazouillis";
    else if (lowerText.includes("coucou") || lowerText.includes("applaudit")) cmd.typeJalon = "geste_social";
    else if (lowerText.includes("attrape")) cmd.typeJalon = "coordination";
    else if (hasHumeur) {
      cmd.typeJalon = "humeur";
      // Extraire niveau d'humeur
      if (lowerText.includes("super") || lowerText.includes("excellent") || lowerText.includes("génial")) cmd.humeur = 5;
      else if (lowerText.includes("bien") || lowerText.includes("content") || lowerText.includes("joyeux")) cmd.humeur = 4;
      else if (lowerText.includes("normal") || lowerText.includes("ok") || lowerText.includes("bof")) cmd.humeur = 3;
      else if (lowerText.includes("pas bien") || lowerText.includes("fatigué") || lowerText.includes("grognon")) cmd.humeur = 2;
      else if (lowerText.includes("mal") || lowerText.includes("triste") || lowerText.includes("pleure")) cmd.humeur = 1;
    } else {
      cmd.typeJalon = "autre";
    }

    return cmd;
  }

  /**
   * Détecte une croissance dans le texte
   */
  private detectCroissance(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (
      !lowerText.includes("croissance") &&
      !lowerText.includes("poids") &&
      !lowerText.includes("taille") &&
      !lowerText.includes("périmètre") &&
      !lowerText.includes("mesure")
    ) {
      return null;
    }

    const cmd = this.createBaseCommand("croissance", rawText, timestampInfo);

    // Poids
    const poidsMatchKg = lowerText.match(/(\d+[.,]?\d*)\s*(kg|kilo)/i);
    const poidsMatchG = lowerText.match(/(\d+)\s*(g|gramme)/i);
    if (poidsMatchKg) {
      cmd.poids = parseFloat(poidsMatchKg[1].replace(",", "."));
    } else if (poidsMatchG) {
      cmd.poids = parseInt(poidsMatchG[1]) / 1000;
    }

    // Taille
    const tailleMatch = lowerText.match(/(\d+[.,]?\d*)\s*(cm|centimètre)/i);
    if (tailleMatch) {
      cmd.taille = parseFloat(tailleMatch[1].replace(",", "."));
    }

    // Périmètre crânien
    if (lowerText.includes("périmètre") || lowerText.includes("crâne")) {
      const pcMatch = lowerText.match(/(\d+[.,]?\d*)\s*(cm)?/i);
      if (pcMatch) {
        cmd.perimetreCranien = parseFloat(pcMatch[1].replace(",", "."));
      }
    }

    return cmd;
  }

  /**
   * Détecte un repas solide dans le texte
   */
  private detectSolide(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (
      !lowerText.includes("repas") &&
      !lowerText.includes("solide") &&
      !lowerText.includes("purée") &&
      !lowerText.includes("compote") &&
      !lowerText.includes("céréales") &&
      !lowerText.includes("yaourt") &&
      !lowerText.includes("morceaux") &&
      !lowerText.includes("dme") &&
      !lowerText.includes("diversification")
    ) {
      return null;
    }

    const cmd = this.createBaseCommand("solide", rawText, timestampInfo);

    // Type
    if (lowerText.includes("purée")) cmd.typeSolide = "puree";
    else if (lowerText.includes("compote")) cmd.typeSolide = "compote";
    else if (lowerText.includes("céréales")) cmd.typeSolide = "cereales";
    else if (lowerText.includes("yaourt")) cmd.typeSolide = "yaourt";
    else if (lowerText.includes("morceaux") || lowerText.includes("dme")) cmd.typeSolide = "morceaux";
    else cmd.typeSolide = "autre";

    // Moment
    if (lowerText.includes("petit") && lowerText.includes("déjeuner")) cmd.momentRepas = "petit_dejeuner";
    else if (lowerText.includes("déjeuner") || lowerText.includes("midi")) cmd.momentRepas = "dejeuner";
    else if (lowerText.includes("goûter")) cmd.momentRepas = "gouter";
    else if (lowerText.includes("dîner") || lowerText.includes("soir")) cmd.momentRepas = "diner";

    // Quantité
    if (lowerText.includes("peu")) cmd.quantiteSolide = "peu";
    else if (lowerText.includes("beaucoup") || lowerText.includes("bien mangé")) cmd.quantiteSolide = "beaucoup";
    else cmd.quantiteSolide = "moyen";

    return cmd;
  }

  /**
   * Détecte un bain dans le texte
   */
  private detectBain(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (!lowerText.includes("bain") && !lowerText.includes("douche") && !lowerText.includes("lavé")) {
      return null;
    }

    const cmd = this.createBaseCommand("bain", rawText, timestampInfo);

    const minMatch = lowerText.match(/(\d+)\s*(min|minute)/i);
    if (minMatch) {
      cmd.duree = parseInt(minMatch[1]);
    }

    return cmd;
  }

  /**
   * Détecte une température dans le texte
   */
  private detectTemperature(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (
      !lowerText.includes("température") &&
      !lowerText.includes("fièvre") &&
      !lowerText.includes("degré")
    ) {
      return null;
    }

    const cmd = this.createBaseCommand("temperature", rawText, timestampInfo);

    const tempMatch = lowerText.match(/(\d+[.,]?\d*)\s*(°|degré)?/i);
    if (tempMatch) {
      cmd.valeurTemperature = parseFloat(tempMatch[1].replace(",", "."));
    }

    return cmd;
  }

  /**
   * Détecte un médicament dans le texte
   */
  private detectMedicament(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    const medTriggers = [
      "médicament", "medicament", "médoc", "sirop", "gouttes", "suppositoire",
      "doliprane", "dafalgan", "efferalgan", "paracétamol", "advil", "nurofen",
      "amoxicilline", "augmentin", "smecta", "biogaia", "gaviscon",
      "calmosine", "dexeryl", "bepanthen", "mitosyl", "ventoline"
    ];

    const hasMed = medTriggers.some(trigger => lowerText.includes(trigger));
    if (!hasMed) {
      return null;
    }

    // Éviter conflit avec vitamine
    if (lowerText.includes("vitamine") && !lowerText.includes("médicament")) {
      return null;
    }

    const cmd = this.createBaseCommand("medicament", rawText, timestampInfo);

    // Nom du médicament
    if (lowerText.includes("doliprane")) cmd.nomMedicament = "Doliprane";
    else if (lowerText.includes("dafalgan")) cmd.nomMedicament = "Dafalgan";
    else if (lowerText.includes("efferalgan")) cmd.nomMedicament = "Efferalgan";
    else if (lowerText.includes("paracétamol")) cmd.nomMedicament = "Paracétamol";
    else if (lowerText.includes("advil")) cmd.nomMedicament = "Advil";
    else if (lowerText.includes("nurofen")) cmd.nomMedicament = "Nurofen";
    else if (lowerText.includes("amoxicilline")) cmd.nomMedicament = "Amoxicilline";
    else if (lowerText.includes("augmentin")) cmd.nomMedicament = "Augmentin";
    else if (lowerText.includes("smecta")) cmd.nomMedicament = "Smecta";
    else if (lowerText.includes("biogaia")) cmd.nomMedicament = "BioGaia";
    else if (lowerText.includes("gaviscon")) cmd.nomMedicament = "Gaviscon";
    else if (lowerText.includes("calmosine")) cmd.nomMedicament = "Calmosine";
    else if (lowerText.includes("ventoline")) cmd.nomMedicament = "Ventoline";
    else if (lowerText.includes("dexeryl")) cmd.nomMedicament = "Dexeryl";
    else if (lowerText.includes("bepanthen")) cmd.nomMedicament = "Bepanthen";
    else if (lowerText.includes("mitosyl")) cmd.nomMedicament = "Mitosyl";

    // Dosage
    const dosageMatch = lowerText.match(/(\d+[.,]?\d*)\s*(ml|mg|gouttes?)/i);
    if (dosageMatch) {
      cmd.dosage = `${dosageMatch[1]} ${dosageMatch[2]}`;
    }

    return cmd;
  }

  /**
   * Détecte un symptôme dans le texte
   */
  private detectSymptome(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    const symptomeTriggers = [
      "symptôme", "symptome", "malade", "toux", "tousse", "rhume",
      "nez qui coule", "nez bouché", "vomissement", "vomi", "régurgit",
      "diarrhée", "constipé", "colique", "éruption", "bouton", "rougeur",
      "eczéma", "fièvre", "conjonctivite", "otite"
    ];

    const hasSymptome = symptomeTriggers.some(trigger => lowerText.includes(trigger));
    if (!hasSymptome) {
      return null;
    }

    // Éviter conflit avec température (fièvre avec valeur = température)
    if (lowerText.includes("fièvre") && /\d+[.,]?\d*\s*(°|degré)/i.test(lowerText)) {
      return null;
    }

    const cmd = this.createBaseCommand("symptome", rawText, timestampInfo);

    // Description
    if (lowerText.includes("toux") || lowerText.includes("tousse")) {
      cmd.descriptionSymptome = lowerText.includes("grasse") ? "Toux grasse" : lowerText.includes("sèche") ? "Toux sèche" : "Toux";
    } else if (lowerText.includes("rhume") || lowerText.includes("nez")) {
      cmd.descriptionSymptome = "Rhume";
    } else if (lowerText.includes("vomissement") || lowerText.includes("vomi")) {
      cmd.descriptionSymptome = "Vomissement";
    } else if (lowerText.includes("régurgit")) {
      cmd.descriptionSymptome = "Régurgitation";
    } else if (lowerText.includes("diarrhée")) {
      cmd.descriptionSymptome = "Diarrhée";
    } else if (lowerText.includes("constipé")) {
      cmd.descriptionSymptome = "Constipation";
    } else if (lowerText.includes("colique")) {
      cmd.descriptionSymptome = "Coliques";
    } else if (lowerText.includes("éruption") || lowerText.includes("bouton")) {
      cmd.descriptionSymptome = "Éruption cutanée";
    } else if (lowerText.includes("rougeur")) {
      cmd.descriptionSymptome = "Rougeurs";
    } else if (lowerText.includes("eczéma")) {
      cmd.descriptionSymptome = "Eczéma";
    } else if (lowerText.includes("conjonctivite")) {
      cmd.descriptionSymptome = "Conjonctivite";
    } else if (lowerText.includes("otite")) {
      cmd.descriptionSymptome = "Otite";
    } else if (lowerText.includes("malade")) {
      cmd.descriptionSymptome = "Malade";
    }

    return cmd;
  }

  /**
   * Détecte un vaccin dans le texte
   */
  private detectVaccin(lowerText: string, rawText: string, timestampInfo: { timestamp: Date; timeOffset: number; isFuture: boolean }): ParsedCommandResult | null {
    if (!lowerText.includes("vaccin") && !lowerText.includes("vaccination") && !lowerText.includes("piqûre")) {
      return null;
    }

    const cmd = this.createBaseCommand("vaccin", rawText, timestampInfo);

    if (lowerText.includes("dtpolio")) cmd.nomVaccin = "DTPolio";
    else if (lowerText.includes("hexavalent") || lowerText.includes("infanrix")) cmd.nomVaccin = "Hexavalent";
    else if (lowerText.includes("pneumocoque") || lowerText.includes("prevenar")) cmd.nomVaccin = "Pneumocoque";
    else if (lowerText.includes("ror") || lowerText.includes("rougeole")) cmd.nomVaccin = "ROR";
    else if (lowerText.includes("méningocoque")) cmd.nomVaccin = "Méningocoque";
    else if (lowerText.includes("bcg")) cmd.nomVaccin = "BCG";
    else if (lowerText.includes("hépatite")) cmd.nomVaccin = "Hépatite B";
    else if (lowerText.includes("rappel")) cmd.nomVaccin = "Rappel";

    return cmd;
  }

  /**
   * Parse une seule commande (pour modification/suppression)
   * Utilise la logique else-if pour ne retourner qu'un seul événement
   */
  private parseSingleCommand(text: string, action: CommandAction): ParsedCommandResult | null {
    const normalizedText = this.normalizePhonetics(text);
    const lowerText = normalizedText.toLowerCase().trim();
    const timestampInfo = this.extractTimestamp(lowerText);

    // Détection du type de commande (un seul à la fois avec else-if)
    let cmd: ParsedCommandResult | null = null;

    // Ordre de priorité pour modification/suppression
    cmd = this.detectBiberon(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectTetee(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectPompage(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectCouche(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectVitamine(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectSommeil(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectActivite(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectJalon(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectCroissance(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectSolide(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectBain(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectTemperature(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectMedicament(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectSymptome(lowerText, normalizedText, timestampInfo);
    if (!cmd) cmd = this.detectVaccin(lowerText, normalizedText, timestampInfo);

    if (!cmd) {
      return null;
    }

    // Ajouter l'action et l'identifiant d'événement
    cmd.action = action;
    cmd.eventIdentifier = this.detectEventIdentifier(normalizedText, cmd.type as CommandType) || undefined;

    // Pour les modifications, préparer les modifications
    if (action === "modify") {
      cmd.modifications = {};
      if (cmd.quantite !== undefined) cmd.modifications.quantite = cmd.quantite;
      if (cmd.quantiteGauche !== undefined) cmd.modifications.quantiteGauche = cmd.quantiteGauche;
      if (cmd.quantiteDroite !== undefined) cmd.modifications.quantiteDroite = cmd.quantiteDroite;
      if (cmd.consistance !== undefined) cmd.modifications.consistance = cmd.consistance;
      if (cmd.couleur !== undefined) cmd.modifications.couleur = cmd.couleur;
      if (cmd.typeBiberon !== undefined) cmd.modifications.typeBiberon = cmd.typeBiberon;
      if (cmd.duree !== undefined) cmd.modifications.duree = cmd.duree;
      if (cmd.valeurTemperature !== undefined) cmd.modifications.valeurTemperature = cmd.valeurTemperature;
      if (cmd.dosage !== undefined) cmd.modifications.dosage = cmd.dosage;
    }

    return cmd;
  }


  /**
   * Formate les données pour Firebase selon le type
   */
  formatDataForFirebase(command: ParsedCommandResult) {
    // Construire la note avec le contexte enrichi si disponible
    let note = `Ajouté par commande vocale: "${command.rawText}"`;
    if (command.contextNote) {
      note = `${command.contextNote} - ${note}`;
    }

    const baseData = {
      // timestamp: command.timestamp,
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
          // Ajouter des champs communs ici si besoin
        };

      default:
        return baseData;
    }
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
    autre: "autre",
  };
  return mapping[type] || type;
}

export default new VoiceCommandService();
