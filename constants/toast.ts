// constants/toast.ts
// Durées minimales des toasts (WCAG 2.2.1, temps suffisant). Hors du contexte
// React pour que hooks et tests les importent sans charger le provider.

/** Un toast avec action reste au moins 8 s. */
export const ACTION_TOAST_MIN_MS = 8000;

/** Lecteur d'écran actif : un toast avec « Annuler » reste au moins 20 s, un toast d'info ou d'erreur 5 s. */
export const SR_ACTION_TOAST_MIN_MS = 20000;
export const SR_INFO_TOAST_MIN_MS = 5000;
