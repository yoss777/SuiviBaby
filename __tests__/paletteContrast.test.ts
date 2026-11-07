// Contrastes WCAG 2.2 de la palette (SC 1.4.3 texte >= 4.5:1, SC 1.4.11 icônes/graphiques >= 3:1)
import {
  neutralColors,
  neutralColorsDark,
  categoryColors,
  categoryColorsDark,
  categoryTextColors,
  categoryTextColorsDark,
} from "../constants/dashboardColors";
import { Colors } from "../constants/theme";
import { getChartColors } from "../constants/dashboardColors";
import {
  GENDER_COLORS,
  GENDER_SELECTED_TEXT,
} from "../components/forms/GenderRadioGroup";

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_MIN = 4.5;
const LARGE_MIN = 3;

describe("contraste de la palette", () => {
  it("calcule correctement le ratio (noir/blanc = 21)", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  describe.each([
    ["clair", neutralColors, categoryColors, categoryTextColors],
    ["sombre", neutralColorsDark, categoryColorsDark, categoryTextColorsDark],
  ] as const)("mode %s", (_name, nc, cc, ct) => {
    const baseBackgrounds = [nc.background, nc.backgroundCard];

    it.each(["textStrong", "textNormal", "textLight"] as const)(
      "%s >= 4.5:1 sur les fonds de base",
      (token) => {
        for (const bg of baseBackgrounds) {
          expect(contrast(nc[token], bg)).toBeGreaterThanOrEqual(TEXT_MIN);
        }
      },
    );

    it("textStrong et textNormal >= 4.5:1 sur backgroundPressed", () => {
      expect(
        contrast(nc.textStrong, nc.backgroundPressed),
      ).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(
        contrast(nc.textNormal, nc.backgroundPressed),
      ).toBeGreaterThanOrEqual(TEXT_MIN);
    });

    it("errorText >= 4.5:1 sur les fonds de base et errorBg", () => {
      for (const bg of [...baseBackgrounds, nc.errorBg]) {
        expect(contrast(nc.errorText, bg)).toBeGreaterThanOrEqual(TEXT_MIN);
      }
    });

    it("successText >= 4.5:1 sur les fonds de base et successBg", () => {
      for (const bg of [...baseBackgrounds, nc.successBg]) {
        expect(contrast(nc.successText, bg)).toBeGreaterThanOrEqual(TEXT_MIN);
      }
    });

    it.each(["alimentation", "sante", "sommeil", "moments"] as const)(
      "texte de catégorie %s >= 4.5:1 sur fond de base et fond de catégorie",
      (cat) => {
        for (const bg of [...baseBackgrounds, cc[cat].background]) {
          expect(contrast(ct[cat], bg)).toBeGreaterThanOrEqual(TEXT_MIN);
        }
      },
    );
  });

  it("textMuted sombre (décoratif) >= 3:1 sur les fonds sombres", () => {
    for (const bg of [
      neutralColorsDark.background,
      neutralColorsDark.backgroundCard,
    ]) {
      expect(contrast(neutralColorsDark.textMuted, bg)).toBeGreaterThanOrEqual(
        LARGE_MIN,
      );
    }
  });

  it("textMuted reste plus discret que textLight (usage décoratif)", () => {
    expect(
      contrast(neutralColors.textMuted, neutralColors.backgroundCard),
    ).toBeLessThan(contrast(neutralColors.textLight, neutralColors.backgroundCard));
  });

  it("couleurs primaires de catégorie sombres >= 3:1 (icônes, aplats)", () => {
    for (const cat of ["alimentation", "sante", "moments"] as const) {
      expect(
        contrast(categoryColorsDark[cat].primary, categoryColorsDark[cat].background),
      ).toBeGreaterThanOrEqual(LARGE_MIN);
    }
  });

  it.each(["light", "dark"] as const)(
    "icônes de thème (%s) >= 3:1 sur le fond",
    (scheme) => {
      const c = Colors[scheme];
      expect(contrast(c.icon, c.background)).toBeGreaterThanOrEqual(LARGE_MIN);
      expect(contrast(c.tint, c.background)).toBeGreaterThanOrEqual(LARGE_MIN);
    },
  );

  it.each(["female", "male"] as const)(
    "sexe coché (%s) : texte >= 4.5:1 sur l'aplat",
    (g) => {
      expect(contrast(GENDER_SELECTED_TEXT[g], GENDER_COLORS[g])).toBeGreaterThanOrEqual(
        TEXT_MIN,
      );
    },
  );

  it.each(["light", "dark"] as const)(
    "texte secondaire des graphiques (%s) >= 4.5:1 sur surface, metricBg et navButtonBg",
    (scheme) => {
      const charts = getChartColors(scheme);
      for (const c of Object.values(charts) as {
        muted: string;
        surface: string;
        metricBg: string;
        navButtonBg: string;
      }[]) {
        for (const bg of [c.surface, c.metricBg, c.navButtonBg]) {
          expect(contrast(c.muted, bg)).toBeGreaterThanOrEqual(TEXT_MIN);
        }
      }
    },
  );

  describe.each([
    ["clair", neutralColors],
    ["sombre", neutralColorsDark],
  ] as const)("todayAccent (%s)", (_name, nc) => {
    it("en texte >= 4.5:1 sur les fonds de base", () => {
      for (const bg of [nc.background, nc.backgroundCard]) {
        expect(contrast(nc.todayAccent, bg)).toBeGreaterThanOrEqual(TEXT_MIN);
      }
    });

    it("onTodayAccent >= 4.5:1 sur un aplat todayAccent", () => {
      expect(contrast(nc.onTodayAccent, nc.todayAccent)).toBeGreaterThanOrEqual(
        TEXT_MIN,
      );
    });
  });

  it("todayAccent clair accepte du texte blanc (boutons pleins)", () => {
    expect(contrast(neutralColors.white, neutralColors.todayAccent)).toBeGreaterThanOrEqual(
      TEXT_MIN,
    );
  });
});
