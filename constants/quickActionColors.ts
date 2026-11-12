import {
  getCategoryColors,
  getCategoryTextColors,
  getNeutralColors,
} from "./dashboardColors";

type Scheme = "light" | "dark";
export type QuickActionColors = { iconColor: string; backgroundColor: string };

/**
 * Catégorie de chaque action rapide (FAB) : Repas = alimentation (corail),
 * Change = santé (teal, comme l'Accueil), Vitamine = doré (itemColors.vitamine).
 */
const QUICK_ACTION_CATEGORY = {
  tetee: "alimentation",
  miction: "sante",
  vitamine: "moments",
} as const;

/**
 * Pastilles dérivées des tokens de catégorie : fond pâle en clair, fond
 * sombre teinté en sombre (plus de disques quasi blancs la nuit) ; icône
 * dans la couleur de texte de la catégorie (≥ 4.5:1 sur ce fond).
 * Clé inconnue (ex. « Plus ») : pastille neutre.
 */
export function getQuickActionColors(key: string, scheme: Scheme): QuickActionColors {
  const nc = getNeutralColors(scheme);
  const category = QUICK_ACTION_CATEGORY[key as keyof typeof QUICK_ACTION_CATEGORY];
  if (!category) {
    return { iconColor: nc.textNormal, backgroundColor: nc.backgroundPressed };
  }
  return {
    iconColor: getCategoryTextColors(scheme)[category],
    backgroundColor: getCategoryColors(scheme)[category].background,
  };
}
