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

// Température basse : < 36 °C (seuil du plan S5, 5.1). À FAIRE VALIDER PAR UN
// PÉDIATRE (Q3) : je n'ai pas de source officielle française vérifiée pour ce
// seuil ; il est conservé en orientation seulement (« appelez un médecin ou le
// 15 ») et figure dans la liste des questions pédiatre du plan.
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

// Signes de gravité : orientation uniquement. Source : ameli.fr, « La fièvre de
// l'enfant », rubrique signes d'alerte (appeler le 15). Liste volontairement
// courte ; liste finale à valider par un pédiatre (Q3).
export const WARNING_SIGNS: readonly string[] = [
  "difficultés à respirer",
  "peau pâle, grise ou marbrée",
  "bébé mou, très difficile à réveiller ou qui gémit",
  "fontanelle bombée ou nuque raide",
  "signes de déshydratation (moins de couches mouillées, refus de boire)",
  "vomissements répétés",
  "éruption qui ne s'efface pas à la pression",
  "pleurs inhabituels",
  "convulsions",
];

export const WARNING_SIGNS_HEADING = "Appelez le 15 sans attendre si :";

// Phrase commune à chaque palier : si un des signes apparaît, on appelle le 15.
const CALL_15_IF_SIGN = "Si un des signes ci-dessous apparaît, appelez le 15.";

export function formatWarningSigns(signs: readonly string[] = WARNING_SIGNS): string {
  return `${WARNING_SIGNS_HEADING} ${signs.join(", ")}.`;
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

// Gravité croissante, pour retenir l'alerte la plus grave d'une liste.
export const ALERT_SEVERITY: Record<TemperatureAlertLevel, number> = {
  fievre: 1,
  rapide: 2,
  hypothermie: 3,
  urgent: 4,
};

export function pickMostSevereAlert(
  alerts: readonly TemperatureAlert[],
): TemperatureAlert | null {
  let worst: TemperatureAlert | null = null;
  for (const alert of alerts) {
    if (!worst || ALERT_SEVERITY[alert.level] > ALERT_SEVERITY[worst.level]) worst = alert;
  }
  return worst;
}

export function getTemperatureAlert({
  valeur,
  birthDate,
  measuredAt = new Date(),
}: TemperatureAlertInput): TemperatureAlert | null {
  if (typeof valeur !== "number" || !Number.isFinite(valeur)) return null;

  const tier = getAgeTierAt(birthDate, measuredAt);

  if (valeur < HYPOTHERMIA_THRESHOLD_C) {
    const base = `Température de ${valeur} °C, inférieure à ${HYPOTHERMIA_THRESHOLD_C} °C`;
    // Moins de 3 mois (M7) ou âge inconnu (M8) : urgent et non masquable.
    // Seuil et formulation à valider par un pédiatre (Q3).
    if (tier === "under3m") {
      return {
        level: "hypothermie",
        dismissible: false,
        callEmergency: true,
        title: "Température basse",
        message: `${base} chez un bébé de moins de 3 mois. Appelez le 15 ou consultez en urgence un médecin. ${CALL_15_IF_SIGN}`,
        signs: WARNING_SIGNS,
      };
    }
    if (tier === null) {
      return {
        level: "hypothermie",
        dismissible: false,
        callEmergency: true,
        title: "Température basse",
        message: `${base}. L'âge de l'enfant n'est pas renseigné : s'il a moins de 3 mois, appelez le 15 ou consultez en urgence un médecin. Sinon, appelez un médecin ou le 15. ${CALL_15_IF_SIGN}`,
        signs: WARNING_SIGNS,
      };
    }
    return {
      level: "hypothermie",
      dismissible: true,
      callEmergency: true,
      title: "Température basse",
      message: `${base}. Appelez un médecin ou le 15. ${CALL_15_IF_SIGN}`,
      signs: WARNING_SIGNS,
    };
  }

  if (valeur < FEVER_THRESHOLD_C) return null;

  if (tier === "under3m") {
    return {
      level: "urgent",
      dismissible: false,
      callEmergency: true,
      title: "Température élevée",
      message: `Température de ${valeur} °C chez un bébé de moins de 3 mois. Consultez en urgence un médecin ou appelez le 15. ${CALL_15_IF_SIGN}`,
      signs: WARNING_SIGNS,
    };
  }

  if (tier === "from3to6m") {
    return {
      level: "rapide",
      dismissible: true,
      callEmergency: false,
      title: "Température élevée",
      message: `Température de ${valeur} °C chez un bébé de 3 à 6 mois : consultez rapidement un médecin. ${CALL_15_IF_SIGN} En cas de doute, appelez le 15.`,
      signs: WARNING_SIGNS,
    };
  }

  if (tier === "from6m") {
    return {
      level: "fievre",
      dismissible: true,
      callEmergency: false,
      title: "Température élevée",
      message: `Température de ${valeur} °C. Consultez un médecin si la fièvre persiste. ${CALL_15_IF_SIGN} En cas de doute, appelez le 15.`,
      signs: WARNING_SIGNS,
    };
  }

  // Âge inconnu (M8) : message générique qui couvre le cas « moins de 3 mois »,
  // alerte non masquable.
  return {
    level: "fievre",
    dismissible: false,
    callEmergency: true,
    title: "Température élevée",
    message: `Température de ${valeur} °C. L'âge de l'enfant n'est pas renseigné : s'il a moins de 3 mois, consultez en urgence un médecin ou appelez le 15. Sinon, consultez un médecin si la fièvre persiste. ${CALL_15_IF_SIGN}`,
    signs: WARNING_SIGNS,
  };
}

export interface TemperatureEditAlertInput {
  previousValeur: number | null | undefined;
  previousDate: Date;
  nextValeur: number | null | undefined;
  nextDate: Date;
  birthDate: BirthDateInput;
}

/**
 * Alerte à afficher après la MODIFICATION d'une température : si la valeur a
 * changé, ou si seule la date a changé et que cela change le palier d'alerte
 * (ex. une mesure de 38,5 °C déplacée de « 3 à 6 mois » à « moins de 3 mois »).
 */
export function getTemperatureEditAlert(input: TemperatureEditAlertInput): TemperatureAlert | null {
  const next = getTemperatureAlert({
    valeur: input.nextValeur,
    birthDate: input.birthDate,
    measuredAt: input.nextDate,
  });
  if (!next) return null;
  if (input.nextValeur !== input.previousValeur) return next;
  const previous = getTemperatureAlert({
    valeur: input.previousValeur,
    birthDate: input.birthDate,
    measuredAt: input.previousDate,
  });
  if (!previous) return next;
  return previous.level !== next.level || previous.dismissible !== next.dismissible ? next : null;
}

/**
 * Texte d'orientation quand une température vocale n'a pas de valeur : la
 * mesure n'est PAS enregistrée, on demande la valeur et on oriente selon l'âge
 * (mêmes paliers que getTemperatureAlert). Orientation uniquement, jamais
 * rassurant. Texte à relire par un pédiatre (Q3).
 */
export function getMissingTemperatureMessage({
  birthDate,
  measuredAt = new Date(),
}: {
  birthDate: BirthDateInput;
  measuredAt?: Date;
}): string {
  const head =
    "La température n'a pas été enregistrée : la valeur n'a pas été comprise. Redites-la, par exemple « température 38,5 ».";
  const tier = getAgeTierAt(birthDate, measuredAt);
  if (tier === "under3m") {
    return `${head} Si votre bébé de moins de 3 mois a de la fièvre, consultez en urgence un médecin ou appelez le 15.`;
  }
  if (tier === "from3to6m") {
    return `${head} Si votre bébé a de la fièvre, consultez rapidement un médecin. En cas de doute, appelez le 15.`;
  }
  if (tier === "from6m") {
    return `${head} Si votre enfant a de la fièvre, consultez un médecin. En cas de doute, appelez le 15.`;
  }
  return `${head} L'âge de l'enfant n'est pas renseigné : s'il a moins de 3 mois et de la fièvre, consultez en urgence un médecin ou appelez le 15.`;
}
