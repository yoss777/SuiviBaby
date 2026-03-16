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
  | "nettoyage_nez"
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
  typeActivite: string;
  duree?: number;
}

interface JalonCommand extends BaseCommand {
  type: "jalon";
  typeJalon: string;
  humeur?: number;
}

interface CroissanceCommand extends BaseCommand {
  type: "croissance";
  poids?: number;
  taille?: number;
  perimetreCranien?: number;
}

interface SolideCommand extends BaseCommand {
  type: "solide";
  typeSolide: string;
  momentRepas?: string;
  quantite?: string;
}

interface BainCommand extends BaseCommand {
  type: "bain";
  duree?: number;
}

interface NettoyageNezCommand extends BaseCommand {
  type: "nettoyage_nez";
  methode?: string;
}

interface TemperatureCommand extends BaseCommand {
  type: "temperature";
  valeur: number;
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
  | NettoyageNezCommand
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
  consistance?: string;
  couleur?: string;
  typeBiberon?: string;
  methode?: string;
  isFuture?: boolean;
  contextNote?: string;
}

// Interface pour un segment de phrase parsé
export interface ParsedSegment {
  text: string;
  rawText: string;
  timestamp: Date;
  timeOffset: number;
  isFuture: boolean;
  isRelativeToPrevious: boolean;
  relativeOffset?: number;
}

// Common timestamp info passed to detectors
export interface TimestampInfo {
  timestamp: Date;
  timeOffset: number;
  isFuture: boolean;
}
