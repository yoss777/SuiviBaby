// Calcul du thème : choix × « Sombre la nuit » × heure × réglage du téléphone.
import {
  isNightHour,
  resolveColorScheme,
  resolveDarkAtNight,
  shouldShowDarkAtNightNotice,
  themeOptionDescription,
  themeSummaryLabel,
} from "@/utils/themeResolution";
import type { ThemePreference } from "@/services/userPreferencesService";

describe("isNightHour", () => {
  it("22 h – 7 h", () => {
    expect([21, 22, 23, 0, 6, 7].map(isNightHour)).toEqual([false, true, true, true, true, false]);
  });
});

describe("resolveDarkAtNight", () => {
  it("activé par défaut pour tous, sinon la valeur enregistrée", () => {
    expect(resolveDarkAtNight(undefined)).toBe(true);
    expect(resolveDarkAtNight(false)).toBe(false);
    expect(resolveDarkAtNight(true)).toBe(true);
  });
});

describe("resolveColorScheme", () => {
  const cases: [ThemePreference, boolean, boolean, "light" | "dark", "light" | "dark"][] = [
    // préférence, sombre la nuit, nuit, téléphone, attendu
    ["dark", false, false, "light", "dark"],
    ["dark", true, true, "light", "dark"],
    ["light", true, true, "light", "dark"],
    ["light", true, false, "dark", "light"],
    ["light", false, true, "dark", "light"],
    ["auto", true, true, "light", "dark"],
    ["auto", true, false, "light", "light"],
    ["auto", true, false, "dark", "dark"],
    ["auto", false, true, "light", "light"],
    ["auto", false, true, "dark", "dark"],
  ];
  it.each(cases)("%s, sombre la nuit=%s, nuit=%s, téléphone=%s → %s", (preference, darkAtNight, isNight, systemScheme, expected) => {
    expect(resolveColorScheme({ preference, darkAtNight, isNight, systemScheme })).toBe(expected);
  });
});

describe("textes", () => {
  it("descriptions qui suivent l'interrupteur", () => {
    expect(themeOptionDescription("auto", true)).toBe("Suit votre téléphone, et passe en sombre de 22 h à 7 h");
    expect(themeOptionDescription("auto", false)).toBe("Suit votre téléphone, même la nuit");
    expect(themeOptionDescription("light", true)).toBe("Clair le jour, sombre de 22 h à 7 h");
    expect(themeOptionDescription("light", false)).toBe("Clair à toute heure");
    expect(themeOptionDescription("dark", true)).toBe("Sombre à toute heure");
  });
  it("ligne Thème des Paramètres", () => {
    expect(themeSummaryLabel("light", true)).toBe("Clair · sombre la nuit");
    expect(themeSummaryLabel("light", false)).toBe("Clair");
    expect(themeSummaryLabel("auto", true)).toBe("Automatique");
    expect(themeSummaryLabel("auto", false)).toBe("Automatique · sans sombre la nuit");
    expect(themeSummaryLabel("dark", false)).toBe("Sombre");
  });
});

describe("shouldShowDarkAtNightNotice", () => {
  const base = { preference: "light" as ThemePreference, storedDarkAtNight: undefined, isNight: true, alreadyShown: false };
  it("compte Clair jamais réglé, la nuit, pas encore vu", () => {
    expect(shouldShowDarkAtNightNotice(base)).toBe(true);
  });
  it("pas pour Automatique, Sombre, de jour, déjà vu, ou interrupteur déjà réglé", () => {
    expect(shouldShowDarkAtNightNotice({ ...base, preference: "auto" })).toBe(false);
    expect(shouldShowDarkAtNightNotice({ ...base, preference: "dark" })).toBe(false);
    expect(shouldShowDarkAtNightNotice({ ...base, isNight: false })).toBe(false);
    expect(shouldShowDarkAtNightNotice({ ...base, alreadyShown: true })).toBe(false);
    expect(shouldShowDarkAtNightNotice({ ...base, storedDarkAtNight: true })).toBe(false);
  });
});

describe("aucun \\\\u00 affiché brut dans les écrans de réglages", () => {
  it("theme.tsx, language.tsx, backup.tsx", () => {
    const fs = require("fs");
    const path = require("path");
    for (const f of ["theme.tsx", "language.tsx", "backup.tsx"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", "app", "settings", f), "utf8");
      expect(src).not.toMatch(/\\u00[0-9a-fA-F]{2}/);
    }
  });
});
