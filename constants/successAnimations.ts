// constants/successAnimations.ts

/**
 * Configuration des animations de succès par type d'action
 * Chaque type a une icône et une couleur spécifique
 */
export const SUCCESS_ANIMATIONS = {
  meal: {
    icon: 'utensils',
    color: '#E8785A', // corail
  },
  diaper: {
    icon: 'check',
    color: '#17a2b8', // teal
  },
  sleep: {
    icon: 'moon',
    color: '#7C6BA4', // violet
  },
  milestone: {
    icon: 'star',
    color: '#4A90E2', // bleu
  },
  voice: {
    icon: 'microphone',
    color: '#10b981', // vert
  },
  default: {
    icon: 'check',
    color: '#22c55e', // green-500
  },
} as const;

export type SuccessAnimationType = keyof typeof SUCCESS_ANIMATIONS;
