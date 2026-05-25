// utils/eventBounds.ts
//
// Source unique des bornes quantitatives event côté client. Doit rester
// strictement aligné avec validateEventData() dans functions/index.js et
// avec project_event_quantity_bounds.md.
//
// Pourquoi ici plutôt que dans services/voice/enums.ts : ces bornes
// s'appliquent à TOUS les events (UI manuelle, voice, futurs imports CSV,
// API tiers), pas qu'au pipeline vocal. Le module voice/enums.ts garde
// les enums vocaux (typeBiberon, typeActivite...) qui sont vocale-only.
//
// Toute modification ICI doit être mirrorée dans functions/index.js
// validateEventData et inversement.

export const NUMERIC_BOUNDS = {
  biberon: {
    // Note : CF accepte 0-500 ml. UI plafonne à 300 ml par décision produit
    // (médicalement raisonnable). Si tu lèves ce 300, lève aussi le UI.
    quantite: { min: 0, max: 300, unit: "ml" as const, step: 10 },
  },
  tetee: {
    duree: { min: 0, max: 180, unit: "min" as const, step: 1 },
    dureeGauche: { min: 0, max: 180, unit: "min" as const, step: 1 },
    dureeDroite: { min: 0, max: 180, unit: "min" as const, step: 1 },
  },
  pompage: {
    quantiteGauche: { min: 0, max: 500, unit: "ml" as const, step: 5 },
    quantiteDroite: { min: 0, max: 500, unit: "ml" as const, step: 5 },
  },
  sommeil: {
    // CF min=1 (refuse 0), pas 0. Cohérent : un sommeil de 0 min n'a pas
    // de sens. Le picker démarre donc à 1.
    duree: { min: 1, max: 1440, unit: "min" as const, step: 5 },
  },
  activite: {
    duree: { min: 0, max: 1440, unit: "min" as const, step: 1 },
  },
  bain: {
    // Pas borné CF côté duree. UI plafonne à 60min (parité red team voice).
    duree: { min: 0, max: 60, unit: "min" as const, step: 1 },
    temperatureEau: { min: 20, max: 45, unit: "°C" as const, step: 1 },
  },
  temperature: {
    valeur: { min: 34, max: 43, unit: "°C" as const, step: 0.1 },
  },
  croissance: {
    poidsKg: { min: 0.3, max: 50, unit: "kg" as const, step: 0.01 },
    tailleCm: { min: 20, max: 200, unit: "cm" as const, step: 0.5 },
    teteCm: { min: 20, max: 60, unit: "cm" as const, step: 0.5 },
  },
  jalon: {
    humeur: { min: 1, max: 5, unit: "" as const, step: 1 },
  },
} as const;

export const STRING_LENGTH_LIMITS = {
  // CF : tous les events ont note ≤ 1000 chars.
  note: 1000,
  // CF : nomMedicament/dosage/nomVaccin/nomVitamine ≤ 100 chars chacun.
  nomMedicament: 100,
  dosage: 100,
  nomVaccin: 100,
  nomVitamine: 100,
  // Pas bornés CF actuellement, mais cap défensif côté UI pour éviter
  // qu'un futur cap CF casse l'app sans préavis. 500 = raisonnable.
  description: 500,
  title: 200,
} as const;

export const DATE_BOUNDS = {
  // CF : date max = now + 5min (tolérance horloge serveur).
  maxFutureMs: 5 * 60 * 1000,
  // CF : date min = now - 365 jours (1 an de rétro-saisie).
  maxPastMs: 365 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Calcule les bornes Date min/max applicables maintenant.
 * Utiliser le résultat directement comme `minimumDate`/`maximumDate` des
 * DateTimePicker (RN ou web).
 */
export function getEventDateBounds(): { minDate: Date; maxDate: Date } {
  const now = Date.now();
  return {
    minDate: new Date(now - DATE_BOUNDS.maxPastMs),
    maxDate: new Date(now + DATE_BOUNDS.maxFutureMs),
  };
}

/**
 * Clamp défensif sur une valeur numérique. Utile quand on passe une valeur
 * dont on n'est pas sûr (parse, calcul, état dirty) avant de la soumettre.
 *
 * Retourne `min` si la valeur n'est pas finie (NaN, Infinity, undefined).
 */
export function clampNumber(
  value: number | null | undefined,
  min: number,
  max: number,
): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Tronque une chaîne au length max et trim. Retourne "" pour null/undefined.
 */
export function clampString(
  value: string | null | undefined,
  maxLength: number,
): string {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
