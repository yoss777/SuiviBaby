// utils/nickname.ts
// Règle unique du pseudo (inscription et profil). 2 caractères minimum :
// « Léa », « Tom » ou « Jo » doivent passer (l'ancien minimum de 6 les refusait).

export const NICKNAME_MIN_LENGTH = 2;

/** Message d'erreur lisible, ou null si le pseudo est valide. */
export function validateNickname(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) {
    return "Entrez un pseudo (votre prénom suffit).";
  }
  // Compte les caractères visibles (une lettre accentuée composée ou un emoji = 1).
  if (Array.from(value.normalize("NFC")).length < NICKNAME_MIN_LENGTH) {
    return `Le pseudo doit contenir au moins ${NICKNAME_MIN_LENGTH} caractères.`;
  }
  return null;
}
