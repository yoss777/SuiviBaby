// Centralized enum whitelists for voice-detected event fields.
// Kept in sync with the CF copy at functions/lib/enums.js — any change here
// must be mirrored there so server-side validation matches client output.

export const TYPES_BIBERON = ["lait_maternel", "lait_infantile", "eau", "jus"] as const;

export const TYPES_ACTIVITE = [
  "tummyTime",
  "motricite",
  "jeux",
  "lecture",
  "promenade",
  "sortie",
  "massage",
  "calin",
  "musique",
  "eveil",
  "garde",
  "autre",
] as const;

export const TYPES_JALON = [
  "dent",
  "pas",
  "retournement",
  "assis",
  "rampe",
  "debout",
  "sourire",
  "rire",
  "mot",
  "gazouillis",
  "geste_social",
  "coordination",
  "humeur",
  "photo",
  "autre",
] as const;

export const CONSISTANCES_SELLE = ["liquide", "molle", "normale", "dure"] as const;

export const COULEURS_SELLE = ["jaune", "vert", "marron"] as const;

export const TYPES_SOLIDE = [
  "puree",
  "compote",
  "cereales",
  "yaourt",
  "morceaux",
  "autre",
] as const;

export const MOMENTS_REPAS = [
  "petit_dejeuner",
  "dejeuner",
  "gouter",
  "diner",
  "collation",
] as const;

export const QUANTITES_SOLIDE = ["peu", "moyen", "beaucoup"] as const;

export const METHODES_NETTOYAGE_NEZ = ["serum", "mouche_bebe", "coton"] as const;

export type TypeBiberon = (typeof TYPES_BIBERON)[number];
export type TypeActivite = (typeof TYPES_ACTIVITE)[number];
export type TypeJalon = (typeof TYPES_JALON)[number];
export type ConsistanceSelle = (typeof CONSISTANCES_SELLE)[number];
export type CouleurSelle = (typeof COULEURS_SELLE)[number];
export type TypeSolide = (typeof TYPES_SOLIDE)[number];
export type MomentRepas = (typeof MOMENTS_REPAS)[number];
export type QuantiteSolide = (typeof QUANTITES_SOLIDE)[number];
export type MethodeNettoyageNez = (typeof METHODES_NETTOYAGE_NEZ)[number];

/**
 * Returns the input value if it matches the whitelist, otherwise undefined.
 * Use this in firebaseFormatter as a defensive filter before writing to
 * Firestore — even if our detectors assign clean values today, a future
 * refactor or AssemblyAI quirk shouldn't be able to slip an arbitrary
 * string into a typed enum field.
 */
export function filterEnum<T extends readonly string[]>(
  value: unknown,
  whitelist: T,
): T[number] | undefined {
  if (typeof value !== "string") return undefined;
  return (whitelist as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;
}
