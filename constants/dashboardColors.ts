/**
 * Dashboard Color Palette - "Pastel Moderne"
 *
 * Une palette douce et chaleureuse pour l'univers bébé,
 * avec suffisamment de contraste pour rester professionnelle.
 */

// ============================================
// CATEGORY COLORS (groupes principaux)
// ============================================

export const categoryColors = {
  alimentation: {
    primary: "#E8785A", // corail
    background: "#FEF5F3", // pêche très pâle
    border: "#FCEAE6",
  },
  sante: {
    primary: "#5BA4A4", // teal
    background: "#F0F7F7", // menthe très pâle
    border: "#E3EEEE",
  },
  sommeil: {
    primary: "#7C6BA4", // violet doux
    background: "#F5F3F8", // lavande très pâle
    border: "#EBE7F0",
  },
  moments: {
    primary: "#E8A85A", // doré
    background: "#FDF8F0", // crème
    border: "#F8EFE0",
  },
} as const;

// ============================================
// ITEM COLORS (sous-éléments)
// ============================================

export const itemColors = {
  // Alimentation
  tetee: "#D66B8F", // rose framboise
  biberon: "#E8785A", // corail (parent)
  solide: "#E89A5A", // orange pêche
  pompage: "#6BA47C", // vert sauge

  // Santé & Hygiène
  miction: "#5BA4A4", // teal (parent)
  selle: "#A47C5B", // brun doux
  vitamine: "#E8A85A", // doré
  vaccin: "#8B7CB4", // mauve
  temperature: "#E85A5A", // rouge doux
  medicament: "#5A8BE8", // bleu
  symptome: "#E85A8B", // rose vif

  // Sommeil
  sieste: "#7C6BA4", // violet (parent)
  nuit: "#5A6BA4", // bleu nuit

  // Moments
  jalon: "#E8A85A", // doré (parent)
  humeur: "#E8785A", // corail
  photo: "#6BA4A4", // teal

  // Autres
  bain: "#5AADE8", // bleu ciel
  activite: "#8BC46B", // vert pomme
  croissance: "#E8C45A", // jaune doré
} as const;

// ============================================
// NEUTRAL COLORS (textes, fonds, bordures)
// ============================================

export const neutralColors = {
  // Textes
  textStrong: "#1f2937", // gray-800
  textNormal: "#4b5563", // gray-600
  textLight: "#6b7280", // gray-500
  textMuted: "#9ca3af", // gray-400

  // Fonds
  background: "#f9fafb", // gray-50
  backgroundCard: "#ffffff",
  backgroundPressed: "#f3f4f6", // gray-100

  // Bordures
  border: "#e5e7eb", // gray-200
  borderLight: "#f3f4f6", // gray-100

  // États
  success: "#22c55e", // green-500
  warning: "#f59e0b", // amber-500
  error: "#ef4444", // red-500
} as const;

// ============================================
// HELPERS
// ============================================

/**
 * Génère une couleur de fond très légère à partir d'une couleur primaire
 * @param hex - Couleur hexadécimale (ex: "#E8785A")
 * @param opacity - Opacité de 0 à 1 (défaut: 0.1)
 */
export function getBackgroundTint(hex: string, opacity = 0.1): string {
  // Convertir hex en RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Retourne la couleur de catégorie pour un type d'événement
 */
export function getCategoryForEventType(
  type: string,
): keyof typeof categoryColors {
  switch (type) {
    case "tetee":
    case "biberon":
    case "solide":
    case "pompage":
      return "alimentation";
    case "miction":
    case "selle":
    case "vitamine":
    case "vaccin":
    case "temperature":
    case "medicament":
    case "symptome":
      return "sante";
    case "sommeil":
    case "sieste":
    case "nuit":
    case "bain":
      return "sommeil";
    case "jalon":
    case "humeur":
    case "activite":
    case "croissance":
    default:
      return "moments";
  }
}
