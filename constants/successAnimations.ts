// constants/successAnimations.ts

/**
 * Configuration des animations de succès par type d'action
 * Chaque type a une icône et une couleur spécifique
 */
import { eventColors } from "@/constants/eventColors";

export const SUCCESS_ANIMATIONS = {
  meal: {
    icon: "utensils",
    color: eventColors.meal.dark,
  },
  diaper: {
    icon: "toilet",
    color: eventColors.miction.dark,
  },
  sleep: {
    icon: "bed",
    color: eventColors.sommeil.dark,
  },
  bath: {
    icon: "bath",
    color: eventColors.bain.dark,
  },
  milestone: {
    icon: "star",
    color: eventColors.jalon.dark,
  },
  activity: {
    icon: "play-circle",
    color: eventColors.activite.dark,
  },
  pumping: {
    icon: "pump-medical",
    color: eventColors.pumping.dark,
  },
  temperature: {
    icon: "temperature-half",
    color: eventColors.temperature.dark,
  },
  medicament: {
    icon: "pills",
    color: eventColors.medicament.dark,
  },
  symptome: {
    icon: "virus",
    color: eventColors.symptome.dark,
  },
  voice: {
    icon: "microphone",
    color: eventColors.activite.dark,
  },
  default: {
    icon: "check",
    color: "#22c55e",
  },
  growth: {
    icon: "seedling",
    color: eventColors.croissance.dark,
  },
  vaccine: {
    icon: "syringe",
    color: eventColors.vaccin.dark,
  },
  vitamin: {
    icon: "pills",
    color: eventColors.vitamine.dark,
  },
} as const;

export type SuccessAnimationType = keyof typeof SUCCESS_ANIMATIONS;
