// P0-5 : les pastilles du FAB dérivent des tokens de catégorie. En sombre,
// plus de disques quasi blancs ; partout, l'icône reste lisible sur sa pastille.
import { getQuickActionColors as getFabActionColors } from "@/constants/quickActionColors";
import {
  categoryColors,
  getNeutralColors,
  itemColors,
} from "@/constants/dashboardColors";
import { contrastRatio, relativeLuminance } from "@/constants/theme";

const KEYS = ["tetee", "miction", "vitamine", "more"] as const;

describe("couleurs des actions du FAB", () => {
  it.each(["light", "dark"] as const)("icône >= 4.5:1 sur sa pastille (%s)", (scheme) => {
    for (const key of KEYS) {
      const { iconColor, backgroundColor } = getFabActionColors(key, scheme);
      expect(contrastRatio(iconColor, backgroundColor)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("en sombre, aucune pastille claire (pas de flash la nuit)", () => {
    const darkBg = getNeutralColors("dark").background;
    for (const key of KEYS) {
      const { backgroundColor } = getFabActionColors(key, "dark");
      expect(relativeLuminance(backgroundColor)!).toBeLessThan(0.1);
      expect(contrastRatio(backgroundColor, darkBg)).toBeLessThan(2);
    }
  });

  it("Repas reprend la couleur Alimentation de l'Accueil (fond de catégorie)", () => {
    expect(getFabActionColors("tetee", "light").backgroundColor).toBe(
      categoryColors.alimentation.background,
    );
    expect(getFabActionColors("miction", "light").backgroundColor).toBe(
      categoryColors.sante.background,
    );
  });

  it("plus de teal Bootstrap #17a2b8", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const key of KEYS) {
        expect(getFabActionColors(key, scheme).iconColor.toLowerCase()).not.toBe("#17a2b8");
      }
    }
    expect(itemColors.miction).toBe(categoryColors.sante.primary);
  });
});
