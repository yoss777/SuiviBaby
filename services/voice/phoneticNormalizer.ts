/**
 * Normalise le texte pour gérer les prononciations phonétiques
 * Ex: "èmèl" → "ml", "céèm" → "cm", "kagé" → "kg"
 */
export function normalizePhonetics(text: string): string {
  let normalized = text.toLowerCase();

  // Unités de volume - ml (millilitres)
  normalized = normalized.replace(/\bèmèl\b/gi, "ml");
  normalized = normalized.replace(/\bémelle?\b/gi, "ml");
  normalized = normalized.replace(/\baime\s*l\b/gi, "ml");
  normalized = normalized.replace(/\bm\s*l\b/gi, "ml");
  normalized = normalized.replace(/\bmillilitre?s?\b/gi, "ml");

  // Unités de longueur - cm (centimètres)
  normalized = normalized.replace(/\bcéèm\b/gi, "cm");
  normalized = normalized.replace(/\bcé\s*aime\b/gi, "cm");
  normalized = normalized.replace(/\bc\s*m\b/gi, "cm");
  normalized = normalized.replace(/\bcentimètre?s?\b/gi, "cm");
  normalized = normalized.replace(/\bcentimetre?s?\b/gi, "cm");

  // Unités de poids - kg (kilogrammes)
  normalized = normalized.replace(/\bkagé\b/gi, "kg");
  normalized = normalized.replace(/\bka\s*gé\b/gi, "kg");
  normalized = normalized.replace(/\bk\s*g\b/gi, "kg");
  normalized = normalized.replace(/\bkilogramme?s?\b/gi, "kg");
  normalized = normalized.replace(/\bkilo?s?\b/gi, "kg");

  // Unités de poids - grammes
  normalized = normalized.replace(/\bgramme?s?\b/gi, "g");

  // Unités de dosage - mg (milligrammes)
  normalized = normalized.replace(/\bmilligramme?s?\b/gi, "mg");

  // Degrés pour température
  normalized = normalized.replace(/\bdegré?s?\b/gi, "°");
  normalized = normalized.replace(/\bdegres?\b/gi, "°");

  return normalized;
}
