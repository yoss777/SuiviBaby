// utils/frenchNumber.ts
// Affichage et saisie des nombres décimaux à la française (« 38,5 °C »).
// Les valeurs stockées restent des `number` : seul le texte change.

const NBSP = " ";

/** « 38,5 » pour 38.5 (virgule décimale, nombre de décimales fixe). */
export function formatDecimalFr(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return "";
  const fixed = value.toFixed(fractionDigits);
  // Évite « -0,0 » pour une valeur arrondie à zéro.
  const normalized = /^-0(\.0+)?$/.test(fixed) ? fixed.slice(1) : fixed;
  return normalized.replace(".", ",");
}

/** « 38,5 °C » (espace insécable avant l'unité). */
export function formatTemperatureFr(value: number): string {
  return `${formatDecimalFr(value, 1)}${NBSP}°C`;
}

/**
 * Valeur d'un champ décimal pré-rempli : « 3,45 » pour 3.45, sans zéros
 * superflus (« 52 » pour 52). Chaîne vide si la valeur est absente.
 */
export function toDecimalInputFr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

/**
 * Lit un nombre saisi avec une virgule ou un point. Renvoie undefined pour
 * une saisie vide ou invalide (« 3,4,5 », « abc »), sans tronquer en silence.
 */
export function parseDecimalFr(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}
