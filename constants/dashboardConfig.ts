import { eventColors } from "./eventColors";

// ============================================
// EVENT CONFIGURATION
// ============================================

export interface EventConfigItem {
  label: string;
  short: string;
  icon: { lib: "fa6" | "mci"; name: string };
  color: string;
}

export const EVENT_CONFIG: Record<string, EventConfigItem> = {
  tetee: {
    label: "Tétée",
    short: "Tétée",
    icon: { lib: "fa6", name: "person-breastfeeding" },
    color: "#E91E63",
  },
  biberon: {
    label: "Biberon",
    short: "Bib",
    icon: { lib: "mci", name: "baby-bottle" },
    color: "#FF5722",
  },
  solide: {
    label: "Repas solide",
    short: "Solide",
    icon: { lib: "fa6", name: "bowl-food" },
    color: "#8BC34A",
  },
  pompage: {
    label: "Pompage",
    short: "Pompe",
    icon: { lib: "fa6", name: "pump-medical" },
    color: "#28a745",
  },
  croissance: {
    label: "Croissance",
    short: "Croiss.",
    icon: { lib: "fa6", name: "seedling" },
    color: "#8BCF9B",
  },
  couche: {
    label: "Couche",
    short: "Couche",
    icon: { lib: "fa6", name: "baby" },
    color: "#4A90E2",
  },
  sommeil: {
    label: "Sommeil",
    short: "Sommeil",
    icon: { lib: "fa6", name: "bed" },
    color: "#6f42c1",
  },
  bain: {
    label: "Bain",
    short: "Bain",
    icon: { lib: "fa6", name: "bath" },
    color: "#3b82f6",
  },
  temperature: {
    label: "Température",
    short: "Temp",
    icon: { lib: "fa6", name: "temperature-half" },
    color: "#e03131",
  },
  medicament: {
    label: "Médicament",
    short: "Médoc",
    icon: { lib: "fa6", name: "pills" },
    color: "#2f9e44",
  },
  symptome: {
    label: "Symptôme",
    short: "Sympt.",
    icon: { lib: "fa6", name: "virus" },
    color: "#f59f00",
  },
  miction: {
    label: "Miction",
    short: "Pipi",
    icon: { lib: "fa6", name: "water" },
    color: "#17a2b8",
  },
  selle: {
    label: "Selle",
    short: "Popo",
    icon: { lib: "fa6", name: "poop" },
    color: "#dc3545",
  },
  vitamine: {
    label: "Vitamine",
    short: "Vitamine",
    icon: { lib: "fa6", name: "pills" },
    color: "#FF9800",
  },
  vaccin: {
    label: "Vaccin",
    short: "Vaccin",
    icon: { lib: "fa6", name: "syringe" },
    color: "#9C27B0",
  },
  activite: {
    label: "Activité",
    short: "Activité",
    icon: { lib: "fa6", name: "play-circle" },
    color: "#10b981",
  },
  jalon: {
    label: "Jalon",
    short: "Jalon",
    icon: { lib: "fa6", name: "star" },
    color: eventColors.jalon.dark,
  },
};

// ============================================
// BIBERON CONFIGURATION
// ============================================

export const BIBERON_TYPE_OPTIONS = [
  { value: "lait_maternel", label: "Lait maternel", icon: "droplet" },
  { value: "lait_infantile", label: "Lait infantile", icon: "baby-bottle" },
  { value: "eau", label: "Eau", icon: "glass-water" },
  { value: "jus", label: "Jus", icon: "lemon" },
  { value: "autre", label: "Autre", icon: "mug-hot" },
] as const;

export const BIBERON_TYPE_LABELS: Record<string, string> = {
  lait_maternel: "Lait maternel",
  lait_infantile: "Lait infantile",
  eau: "Eau",
  jus: "Jus",
  autre: "Autre",
};

// ============================================
// SOLIDE (REPAS SOLIDES) CONFIGURATION
// ============================================

export const SOLIDE_TYPE_OPTIONS = [
  { value: "puree", label: "Purée", icon: "bowl-food" },
  { value: "compote", label: "Compote", icon: "jar" },
  { value: "cereales", label: "Céréales", icon: "wheat-awn" },
  { value: "yaourt", label: "Yaourt", icon: "cheese" },
  { value: "morceaux", label: "Morceaux / DME", icon: "hand-holding-heart" },
  { value: "autre", label: "Autre", icon: "utensils" },
] as const;

export const SOLIDE_TYPE_LABELS: Record<string, string> = {
  puree: "Purée",
  compote: "Compote",
  cereales: "Céréales",
  yaourt: "Yaourt",
  morceaux: "Morceaux / DME",
  autre: "Autre",
};

export const MOMENT_REPAS_OPTIONS = [
  { value: "petit_dejeuner", label: "Petit-déjeuner", icon: "sun" },
  { value: "dejeuner", label: "Déjeuner", icon: "utensils" },
  { value: "gouter", label: "Goûter", icon: "cookie" },
  { value: "diner", label: "Dîner", icon: "moon" },
  { value: "collation", label: "Collation", icon: "clock" },
] as const;

export const MOMENT_REPAS_LABELS: Record<string, string> = {
  petit_dejeuner: "Petit-déjeuner",
  dejeuner: "Déjeuner",
  gouter: "Goûter",
  diner: "Dîner",
  collation: "Collation",
};

export const QUANTITE_SOLIDE_OPTIONS = [
  { value: "peu", label: "Peu", description: "Quelques cuillères" },
  { value: "moyen", label: "Moyen", description: "Une portion normale" },
  { value: "beaucoup", label: "Beaucoup", description: "A bien mangé" },
] as const;

export const ALLERGENES_OPTIONS = [
  { value: "lait", label: "Lait", emoji: "🥛" },
  { value: "oeuf", label: "Œuf", emoji: "🥚" },
  { value: "gluten", label: "Gluten", emoji: "🌾" },
  { value: "arachide", label: "Arachide", emoji: "🥜" },
  { value: "poisson", label: "Poisson", emoji: "🐟" },
  { value: "crustaces", label: "Crustacés", emoji: "🦐" },
  { value: "fruits_coque", label: "Fruits à coque", emoji: "🌰" },
] as const;

export const REACTION_OPTIONS = [
  { value: "aucune", label: "Aucune réaction", color: "#22c55e" },
  { value: "legere", label: "Réaction légère", color: "#f59e0b" },
  { value: "importante", label: "Réaction importante", color: "#ef4444" },
] as const;

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
  dent: "Nouvelle dent",
  pas: "Nouveau pas",
  sourire: "Nouveau sourire",
  mot: "Nouveau mot",
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
  sheetParams: Record<string, string>;
}

export interface QuickAddCategory {
  key: string;
  label: string;
  actions: QuickAddAction[];
}

/** @deprecated Use QUICK_ADD_CATEGORIES instead */
export const QUICK_ADD_ACTIONS: QuickAddAction[] = [
  {
    key: "tetee",
    label: "Tétée",
    icon: { type: "fa", name: "person-breastfeeding", color: "#4A90E2" },
    route: "/baby/meals?tab=seins&openModal=true&returnTo=home",
    sheetParams: { formType: "meals", mealType: "tetee" },
  },
  {
    key: "biberon",
    label: "Biberon",
    icon: { type: "mc", name: "baby-bottle", color: "#28a745" },
    route: "/baby/meals?tab=biberons&openModal=true&returnTo=home",
    sheetParams: { formType: "meals", mealType: "biberon" },
  },
  {
    key: "pompage",
    label: "Tire-lait",
    icon: { type: "fa", name: "pump-medical", color: "#20c997" },
    route: "/baby/pumping?openModal=true&returnTo=home",
    sheetParams: { formType: "pumping" },
  },
  {
    key: "miction",
    label: "Miction",
    icon: { type: "fa", name: "droplet", color: "#17a2b8" },
    route: "/baby/diapers?tab=mictions&openModal=true&returnTo=home",
    sheetParams: { formType: "diapers", diapersType: "miction" },
  },
  {
    key: "selle",
    label: "Selle",
    icon: { type: "fa", name: "poop", color: "#dc3545" },
    route: "/baby/diapers?tab=selles&openModal=true&returnTo=home",
    sheetParams: { formType: "diapers", diapersType: "selle" },
  },
  {
    key: "vitamine",
    label: "Vitamine",
    icon: { type: "fa", name: "pills", color: "#FF9800" },
    route: "/baby/soins?type=vitamine&openModal=true&returnTo=home",
    sheetParams: { formType: "soins", soinsType: "vitamine" },
  },
  {
    key: "vaccin",
    label: "Vaccin",
    icon: { type: "fa", name: "syringe", color: "#9C27B0" },
    route: "/baby/soins?type=vaccin&openModal=true&returnTo=home",
    sheetParams: { formType: "soins", soinsType: "vaccin" },
  },
  {
    key: "temperature",
    label: "Température",
    icon: { type: "fa", name: "temperature-half", color: "#FF6B6B" },
    route: "/baby/soins?type=temperature&openModal=true&returnTo=home",
    sheetParams: { formType: "soins", soinsType: "temperature" },
  },
  {
    key: "medicament",
    label: "Médicament",
    icon: { type: "fa", name: "pills", color: "#4CAF50" },
    route: "/baby/soins?type=medicament&openModal=true&returnTo=home",
    sheetParams: { formType: "soins", soinsType: "medicament" },
  },
  {
    key: "symptome",
    label: "Symptôme",
    icon: { type: "fa", name: "virus", color: "#FF8C42" },
    route: "/baby/soins?type=symptome&openModal=true&returnTo=home",
    sheetParams: { formType: "soins", soinsType: "symptome" },
  },
  {
    key: "bain",
    label: "Bain",
    icon: { type: "fa", name: "bath", color: "#3b82f6" },
    route: "/baby/routines?type=bain&openModal=true&returnTo=home",
    sheetParams: { formType: "routines", routineType: "bain" },
  },
  {
    key: "sommeil",
    label: "Sommeil",
    icon: { type: "fa", name: "bed", color: "#6f42c1" },
    route: "/baby/routines?type=sommeil&openModal=true&returnTo=home",
    sheetParams: { formType: "routines", routineType: "sommeil", sleepMode: "nap" },
  },
  {
    key: "activite",
    label: "Activité",
    icon: { type: "fa", name: "baby", color: "#10b981" },
    route: "/baby/activities?openModal=true&returnTo=home",
    sheetParams: { formType: "activities", activiteType: "tummyTime" },
  },
  {
    key: "jalon",
    label: "Jalon",
    icon: { type: "fa", name: "star", color: eventColors.jalon.dark },
    route: "/baby/milestones?openModal=true&returnTo=home",
    sheetParams: { formType: "milestones", jalonType: "photo" },
  },
  {
    key: "humeur",
    label: "Humeur du jour",
    icon: { type: "fa", name: "heart", color: eventColors.jalon.dark },
    route: "/baby/milestones?type=humeur&openModal=true&returnTo=home",
    sheetParams: { formType: "milestones", jalonType: "humeur" },
  },
  {
    key: "growth",
    label: "Croissance",
    icon: { type: "fa", name: "seedling", color: "#8BCF9B" },
    route: "/baby/croissance?openModal=true&returnTo=home",
    sheetParams: { formType: "croissance" },
  },
];

export const QUICK_ADD_CATEGORIES: QuickAddCategory[] = [
  {
    key: "alimentation",
    label: "Alimentation",
    actions: QUICK_ADD_ACTIONS.filter((a) =>
      ["tetee", "biberon", "pompage"].includes(a.key),
    ),
  },
  {
    key: "sante",
    label: "Santé & Hygiène",
    actions: QUICK_ADD_ACTIONS.filter((a) =>
      ["miction", "selle", "vitamine", "vaccin", "temperature", "medicament", "symptome", "bain"].includes(a.key),
    ),
  },
  {
    key: "routine",
    label: "Routine",
    actions: QUICK_ADD_ACTIONS.filter((a) =>
      ["sommeil", "activite"].includes(a.key),
    ),
  },
  {
    key: "moments",
    label: "Moments",
    actions: QUICK_ADD_ACTIONS.filter((a) =>
      ["jalon", "humeur", "growth"].includes(a.key),
    ),
  },
];
