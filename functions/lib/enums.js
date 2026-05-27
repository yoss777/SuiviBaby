// Server-side mirror of services/voice/enums.ts.
// Any change here MUST be mirrored client-side so detector output and CF
// validation stay aligned. The duplication is intentional: keeping the two
// independent avoids a Node ESM/CJS interop layer.

const TYPES_BIBERON = ["lait_maternel", "lait_infantile", "eau", "jus"];

const TYPES_ACTIVITE = [
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
];

const TYPES_JALON = [
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
];

const CONSISTANCES_SELLE = ["liquide", "molle", "normale", "dure"];
const COULEURS_SELLE = ["jaune", "vert", "marron"];

const TYPES_SOLIDE = [
  "puree",
  "compote",
  "cereales",
  "yaourt",
  "morceaux",
  "autre",
];

const MOMENTS_REPAS = [
  "petit_dejeuner",
  "dejeuner",
  "gouter",
  "diner",
  "collation",
];

const QUANTITES_SOLIDE = ["peu", "moyen", "beaucoup"];

module.exports = {
  TYPES_BIBERON,
  TYPES_ACTIVITE,
  TYPES_JALON,
  CONSISTANCES_SELLE,
  COULEURS_SELLE,
  TYPES_SOLIDE,
  MOMENTS_REPAS,
  QUANTITES_SOLIDE,
};
