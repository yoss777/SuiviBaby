// services/events/types.ts
//
// Event domain types — extracted from services/eventsService.ts (S3-T2a).
// The CRUD layer, the optimistic store, and the Cloud Functions client
// all share these definitions, so they live in their own module.
//
// eventsService.ts re-exports every symbol below so existing imports
// (`from "@/services/eventsService"`) keep working unchanged.

import type { Timestamp } from "firebase/firestore";

export type EventType =
  | "biberon"
  | "tetee"
  | "solide" // Repas solide (diversification)
  | "pompage"
  | "couche" // Legacy/backend event; modern UI derives diaper tracking from miction/selle
  | "miction" // Pipi
  | "selle" // Popo
  | "sommeil"
  | "bain"
  | "temperature"
  | "medicament"
  | "symptome"
  | "croissance" // Taille, poids, tête
  | "vaccin"
  | "vitamine"
  | "activite" // Activités d'éveil
  | "jalon" // Jalons et moments
  | "nettoyage_nez"; // Nettoyage de nez

export interface BaseEvent {
  id?: string;
  childId: string;
  userId: string;
  type: EventType;
  date: Date | Timestamp;
  createdAt: Date | Timestamp;
  updatedAt?: Date | Timestamp;
  note?: string;
  migratedAt?: Date | Timestamp; // Pour tracking migration
}

// Interfaces spécifiques par type
export interface BiberonEvent extends BaseEvent {
  type: "biberon";
  quantite: number; // ml
  typeBiberon?: "lait_maternel" | "lait_infantile" | "eau" | "jus" | "autre";
}

export interface TeteeEvent extends BaseEvent {
  type: "tetee";
  coteGauche: boolean;
  coteDroit: boolean;
  dureeGauche?: number; // minutes
  dureeDroite?: number; // minutes
}

export interface SolideEvent extends BaseEvent {
  type: "solide";
  typeSolide:
    | "puree"
    | "compote"
    | "cereales"
    | "yaourt"
    | "morceaux"
    | "autre";
  momentRepas?:
    | "petit_dejeuner"
    | "dejeuner"
    | "gouter"
    | "diner"
    | "collation";
  ingredients?: string; // Liste libre des ingrédients
  quantite?: "peu" | "moyen" | "beaucoup";
  nouveauAliment?: boolean; // Flag pour premier essai
  nomNouvelAliment?: string; // Nom de l'aliment introduit (ex: "avocat", "fraise")
  allergenes?: string[]; // Liste des allergènes présents
  reaction?: "aucune" | "legere" | "importante"; // Réaction si nouvel aliment
  aime?: boolean; // Bébé a aimé ou non
}

export interface PompageEvent extends BaseEvent {
  type: "pompage";
  quantiteGauche?: number; // ml
  quantiteDroite?: number; // ml
  duree?: number; // minutes
}

export interface CoucheEvent extends BaseEvent {
  type: "couche";
  // Legacy/backend-only raw diaper change event.
  // The modern UI product contract models diaper tracking through
  // MictionEvent and SelleEvent.
}

export interface MictionEvent extends BaseEvent {
  type: "miction";
  volume?: number; // ml
  couleur?: "claire" | "jaune" | "foncee" | "autre";
  avecCouche?: boolean; // Si c'était dans une couche
}

export interface SelleEvent extends BaseEvent {
  type: "selle";
  consistance?: "liquide" | "molle" | "normale" | "dure";
  couleur?: string;
  quantite?: "peu" | "moyen" | "beaucoup";
  avecCouche?: boolean; // Si c'était dans une couche
}

export interface SommeilEvent extends BaseEvent {
  type: "sommeil";
  heureDebut?: Date | Timestamp;
  heureFin?: Date | Timestamp; // Le sommeil est peut-être en cours
  duree?: number; // minutes // Calculé à partir de heureDebut et heureFin
  location?: "lit" | "cododo" | "poussette" | "voiture" | "autre";
  quality?: "paisible" | "agité" | "mauvais";
  isNap: boolean; // Si c'est une sieste (true) ou sommeil nocturne (false)
}

export interface BainEvent extends BaseEvent {
  type: "bain";
  duree?: number; // minutes
  temperatureEau?: number; // °C
  produits?: string;
}

export interface NettoyageNezEvent extends BaseEvent {
  type: "nettoyage_nez";
  methode?: "serum" | "mouche_bebe" | "coton" | "autre";
  resultat?: "efficace" | "mucus_clair" | "mucus_epais" | "mucus_colore";
}

export interface TemperatureEvent extends BaseEvent {
  type: "temperature";
  valeur: number; // °C
  modePrise?: "rectale" | "axillaire" | "auriculaire" | "frontale" | "autre";
}

export interface MedicamentEvent extends BaseEvent {
  type: "medicament";
  nomMedicament: string;
  dosage?: string;
  voie?: "orale" | "topique" | "inhalation" | "autre";
}

export interface SymptomeEvent extends BaseEvent {
  type: "symptome";
  symptomes: string[];
  intensite?: "leger" | "modere" | "fort";
}

export interface CroissanceEvent extends BaseEvent {
  type: "croissance";
  tailleCm?: number;
  poidsKg?: number;
  teteCm?: number;
}

export interface VaccinEvent extends BaseEvent {
  type: "vaccin";
  nomVaccin: string;
  dosage?: string;
  lieu?: string;
}

export interface VitamineEvent extends BaseEvent {
  type: "vitamine";
  nomVitamine: string;
  dosage?: string;
}

export interface ActiviteEvent extends BaseEvent {
  type: "activite";
  typeActivite:
    | "tummyTime"
    | "jeux"
    | "lecture"
    | "promenade"
    | "massage"
    | "musique"
    | "eveil"
    | "sortie"
    | "autre";
  duree?: number; // minutes
  description?: string;
  heureDebut?: Date | Timestamp; // For chrono mode (promenade)
  heureFin?: Date | Timestamp; // For chrono mode (promenade)
}

export interface JalonEvent extends BaseEvent {
  type: "jalon";
  typeJalon: "dent" | "pas" | "sourire" | "mot" | "humeur" | "photo" | "autre";
  titre?: string;
  description?: string;
  photos?: string[]; // Legacy URLs or Storage paths
  humeur?: 1 | 2 | 3 | 4 | 5;
}

export type Event =
  | BiberonEvent
  | TeteeEvent
  | SolideEvent
  | PompageEvent
  | CoucheEvent
  | MictionEvent
  | SelleEvent
  | SommeilEvent
  | BainEvent
  | TemperatureEvent
  | MedicamentEvent
  | SymptomeEvent
  | CroissanceEvent
  | VaccinEvent
  | VitamineEvent
  | ActiviteEvent
  | JalonEvent
  | NettoyageNezEvent;
