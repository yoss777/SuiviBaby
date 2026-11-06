// utils/temperatureAlert.ts
//
// Décision d'alerte à partir d'une température et de l'âge de l'enfant au
// moment de la mesure. Fonction pure, partagée par le formulaire de saisie
// (SoinsForm) et par les insights (insightEngine).
//
// Position dispositif médical (décision propriétaire, Q4) : les messages sont
// de l'ORIENTATION uniquement (« consultez », « appelez le 15 »). Ni
// diagnostic, ni interprétation, ni formule rassurante.
// Les textes sont soumis à relecture pédiatre (Q3), voir docs/PLAN_SPRINTS_AUDIT.md (S5).

import { parseBirthDateOrNull, type BirthDateInput } from "@/utils/ageUtils";

// Seuil de fièvre : 38 °C. Source : ameli.fr (« Fièvre chez l'enfant ») et
// Santé publique France ; la HAS retient aussi 38 °C comme seuil de fièvre
// du nourrisson.
export const FEVER_THRESHOLD_C = 38;

// Température basse : < 36 °C, tout âge (seuil du plan S5, 5.1).
export const HYPOTHERMIA_THRESHOLD_C = 36;

// Moins de 3 mois et >= 38 °C : consultation en urgence / 15. Source : HAS et
// ameli.fr (fièvre du nourrisson de moins de 3 mois = avis médical urgent).
// Âge en MOIS CALENDAIRES : « moins de 3 mois » = date de la mesure strictement
// avant le jour du 3e anniversaire mensuel de la naissance (voir addMonths).
export const URGENT_AGE_MONTHS = 3;

// De 3 à 6 mois et >= 38 °C : consultation rapide. Source : ameli.fr.
// Même règle : strictement avant le 6e anniversaire mensuel.
export const QUICK_CONSULT_AGE_MONTHS = 6;

export type TemperatureAlertLevel =
  | "urgent"
  | "rapide"
  | "fievre"
  | "hypothermie";

export interface TemperatureAlert {
  level: TemperatureAlertLevel;
  /** false : l'alerte ne peut pas être masquée (modale ou insight). */
  dismissible: boolean;
  /** true : proposer un bouton « Appeler le 15 ». */
  callEmergency: boolean;
  title: string;
  message: string;
  signs: readonly string[];
}

// Signes de gravité : orientation uniquement.
export const WARNING_SIGNS: readonly string[] = [
  "difficultés à respirer",
  "somnolence inhabituelle ou bébé mou",
  "refus de s'alimenter",
  "vomissements répétés",
  "éruption qui ne s'efface pas à la pression",
  "pleurs inhabituels",
  "convulsions",
];

export function formatWarningSigns(signs: readonly string[] = WARNING_SIGNS): string {
  return `Signes à surveiller : ${signs.join(", ")}.`;
}

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Ajoute des mois calendaires. Si le jour n'existe pas dans le mois d'arrivée
 * (naissance un 31, 30 ou 29 février), on retombe sur le dernier jour du mois :
 * 31 janvier + 1 mois = 28 (ou 29) février. Équivalent de date-fns addMonths.
 */
export function addMonths(date: Date, months: number): Date {
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay));
}

export type AgeTier = "under3m" | "from3to6m" | "from6m";

/**
 * Tranche d'âge à la date `at` (et non à la date du jour), en mois calendaires.
 * null si la date de naissance est absente/invalide ou postérieure à `at`.
 */
export function getAgeTierAt(birthDate: BirthDateInput, at: Date): AgeTier | null {
  const parsed = parseBirthDateOrNull(birthDate);
  if (!parsed || Number.isNaN(at.getTime())) return null;
  const birth = startOfLocalDay(parsed);
  const day = startOfLocalDay(at);
  if (day < birth) return null;
  if (day < addMonths(birth, URGENT_AGE_MONTHS)) return "under3m";
  if (day < addMonths(birth, QUICK_CONSULT_AGE_MONTHS)) return "from3to6m";
  return "from6m";
}

export interface TemperatureAlertInput {
  valeur: number | null | undefined;
  birthDate: BirthDateInput;
  /** Date de la mesure (par défaut : maintenant). */
  measuredAt?: Date;
}

export function getTemperatureAlert({
  valeur,
  birthDate,
  measuredAt = new Date(),
}: TemperatureAlertInput): TemperatureAlert | null {
  if (typeof valeur !== "number" || !Number.isFinite(valeur)) return null;

  if (valeur < HYPOTHERMIA_THRESHOLD_C) {
    return {
      level: "hypothermie",
      dismissible: true,
      callEmergency: true,
      title: "Température basse",
      message: `Température de ${valeur} °C, inférieure à ${HYPOTHERMIA_THRESHOLD_C} °C. Appelez un médecin ou le 15.`,
      signs: WARNING_SIGNS,
    };
  }

  if (valeur < FEVER_THRESHOLD_C) return null;

  const tier = getAgeTierAt(birthDate, measuredAt);

  if (tier === "under3m") {
    return {
      level: "urgent",
      dismissible: false,
      callEmergency: true,
      title: "Température élevée",
      message: `Température de ${valeur} °C chez un bébé de moins de 3 mois. Consultez en urgence un médecin ou appelez le 15.`,
      signs: WARNING_SIGNS,
    };
  }

  if (tier === "from3to6m") {
    return {
      level: "rapide",
      dismissible: true,
      callEmergency: false,
      title: "Température élevée",
      message: `Température de ${valeur} °C chez un bébé de 3 à 6 mois : consultez rapidement un médecin. En cas de doute ou si un des signes ci-dessous apparaît, appelez le 15.`,
      signs: WARNING_SIGNS,
    };
  }

  if (tier === "from6m") {
    return {
      level: "fievre",
      dismissible: true,
      callEmergency: false,
      title: "Température élevée",
      message: `Température de ${valeur} °C. Consultez un médecin si la fièvre persiste ou si un des signes ci-dessous apparaît. En cas de doute, appelez le 15.`,
      signs: WARNING_SIGNS,
    };
  }

  // Date de naissance inconnue : message générique qui couvre le cas
  // « moins de 3 mois ».
  return {
    level: "fievre",
    dismissible: true,
    callEmergency: true,
    title: "Température élevée",
    message: `Température de ${valeur} °C. L'âge de l'enfant n'est pas renseigné : s'il a moins de 3 mois, consultez en urgence un médecin ou appelez le 15. Sinon, consultez un médecin si la fièvre persiste ou si un des signes ci-dessous apparaît.`,
    signs: WARNING_SIGNS,
  };
}
