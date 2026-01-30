import { eventColors } from "./eventColors";

// ============================================
// EVENT CONFIGURATION
// ============================================

export interface EventConfigItem {
  label: string;
  icon: { lib: "fa6" | "mci"; name: string };
  color: string;
}

export const EVENT_CONFIG: Record<string, EventConfigItem> = {
  tetee: {
    label: "Tétée",
    icon: { lib: "fa6", name: "person-breastfeeding" },
    color: "#E91E63",
  },
  biberon: {
    label: "Biberon",
    icon: { lib: "mci", name: "baby-bottle" },
    color: "#FF5722",
  },
  pompage: {
    label: "Pompage",
    icon: { lib: "fa6", name: "pump-medical" },
    color: "#28a745",
  },
  sommeil: {
    label: "Sommeil",
    icon: { lib: "fa6", name: "bed" },
    color: "#6f42c1",
  },
  bain: {
    label: "Bain",
    icon: { lib: "fa6", name: "bath" },
    color: "#3b82f6",
  },
  temperature: {
    label: "Température",
    icon: { lib: "fa6", name: "temperature-half" },
    color: "#e03131",
  },
  medicament: {
    label: "Médicament",
    icon: { lib: "fa6", name: "pills" },
    color: "#2f9e44",
  },
  symptome: {
    label: "Symptôme",
    icon: { lib: "fa6", name: "virus" },
    color: "#f59f00",
  },
  miction: {
    label: "Miction",
    icon: { lib: "fa6", name: "water" },
    color: "#17a2b8",
  },
  selle: {
    label: "Selle",
    icon: { lib: "fa6", name: "poop" },
    color: "#dc3545",
  },
  vitamine: {
    label: "Vitamine",
    icon: { lib: "fa6", name: "pills" },
    color: "#FF9800",
  },
  vaccin: {
    label: "Vaccin",
    icon: { lib: "fa6", name: "syringe" },
    color: "#9C27B0",
  },
  activite: {
    label: "Activité",
    icon: { lib: "fa6", name: "play-circle" },
    color: "#10b981",
  },
  jalon: {
    label: "Jalon",
    icon: { lib: "fa6", name: "star" },
    color: eventColors.jalon.dark,
  },
};

// ============================================
// ACTIVITY TYPE LABELS
// ============================================

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
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

// ============================================
// JALON TYPE LABELS
// ============================================

export const JALON_TYPE_LABELS: Record<string, string> = {
  dent: "Première dent",
  pas: "Premiers pas",
  sourire: "Premier sourire",
  mot: "Premiers mots",
  humeur: "Humeur du jour",
  photo: "Moment photo",
  autre: "Autre moment",
};

// ============================================
// MOOD EMOJIS
// ============================================

export const MOOD_EMOJIS: Record<number, string> = {
  1: "😢",
  2: "😐",
  3: "🙂",
  4: "😄",
  5: "🥰",
};

export const MOOD_OPTIONS: { value: 1 | 2 | 3 | 4 | 5; emoji: string }[] = [
  { value: 1, emoji: "😢" },
  { value: 2, emoji: "😐" },
  { value: 3, emoji: "🙂" },
  { value: 4, emoji: "😄" },
  { value: 5, emoji: "🥰" },
];

// ============================================
// QUICK ADD ACTIONS
// ============================================

export interface QuickAddAction {
  key: string;
  label: string;
  icon: { type: "fa" | "mc"; name: string; color: string };
  route: string;
}

export const QUICK_ADD_ACTIONS: QuickAddAction[] = [
  {
    key: "growth",
    label: "Croissance",
    icon: { type: "fa", name: "seedling", color: "#8BCF9B" },
    route: "/baby/croissance?openModal=true&returnTo=home",
  },
  {
    key: "tetee",
    label: "Tétée",
    icon: { type: "fa", name: "person-breastfeeding", color: "#4A90E2" },
    route: "/baby/meals?tab=seins&openModal=true&returnTo=home",
  },
  {
    key: "biberon",
    label: "Biberon",
    icon: { type: "mc", name: "baby-bottle", color: "#28a745" },
    route: "/baby/meals?tab=biberons&openModal=true&returnTo=home",
  },
  {
    key: "pompage",
    label: "Pompage",
    icon: { type: "fa", name: "pump-medical", color: "#20c997" },
    route: "/baby/pumping?openModal=true&returnTo=home",
  },
  {
    key: "vitamine",
    label: "Vitamine",
    icon: { type: "fa", name: "pills", color: "#FF9800" },
    route: "/baby/soins?type=vitamine&openModal=true&returnTo=home",
  },
  {
    key: "vaccin",
    label: "Vaccin",
    icon: { type: "fa", name: "syringe", color: "#9C27B0" },
    route: "/baby/soins?type=vaccin&openModal=true&returnTo=home",
  },
  {
    key: "temperature",
    label: "Température",
    icon: { type: "fa", name: "temperature-half", color: "#FF6B6B" },
    route: "/baby/soins?type=temperature&openModal=true&returnTo=home",
  },
  {
    key: "medicament",
    label: "Médicament",
    icon: { type: "fa", name: "pills", color: "#4CAF50" },
    route: "/baby/soins?type=medicament&openModal=true&returnTo=home",
  },
  {
    key: "symptome",
    label: "Symptôme",
    icon: { type: "fa", name: "virus", color: "#FF8C42" },
    route: "/baby/soins?type=symptome&openModal=true&returnTo=home",
  },
  {
    key: "bain",
    label: "Bain",
    icon: { type: "fa", name: "bath", color: "#3b82f6" },
    route: "/baby/routines?type=bain&openModal=true&returnTo=home",
  },
  {
    key: "miction",
    label: "Miction",
    icon: { type: "fa", name: "droplet", color: "#17a2b8" },
    route: "/baby/diapers?tab=mictions&openModal=true&returnTo=home",
  },
  {
    key: "selle",
    label: "Selle",
    icon: { type: "fa", name: "poop", color: "#dc3545" },
    route: "/baby/diapers?tab=selles&openModal=true&returnTo=home",
  },
  {
    key: "sommeil",
    label: "Sommeil",
    icon: { type: "fa", name: "bed", color: "#6f42c1" },
    route: "/baby/routines?type=sommeil&openModal=true&returnTo=home",
  },
  {
    key: "activite",
    label: "Activité",
    icon: { type: "fa", name: "baby", color: "#10b981" },
    route: "/baby/activities?openModal=true&returnTo=home",
  },
  {
    key: "jalon",
    label: "Jalon",
    icon: { type: "fa", name: "star", color: eventColors.jalon.dark },
    route: "/baby/milestones?openModal=true&returnTo=home",
  },
  {
    key: "humeur",
    label: "Humeur du jour",
    icon: { type: "fa", name: "heart", color: eventColors.jalon.dark },
    route: "/baby/milestones?type=humeur&openModal=true&returnTo=home",
  },
];
