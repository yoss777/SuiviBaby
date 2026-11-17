// Accessibilité du widget iPhone : phrases parlées (une tuile = une phrase),
// éléments décoratifs masqués, indications, Dynamic Type, zones tactiles, contraste.
jest.mock("expo-widgets", () => ({ createWidget: (_n: string, fn: unknown) => fn }));

import { H, NOW, at, napLive, widgetProps } from "./helpers/widgetFixtures";
import { allText, compileWidget, dumpWidget } from "./helpers/widgetTree";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const source: string = require("@/widgets/BebeMaintenant.ios").default;
const render = compileWidget(source, "ios");
const show = (over: Record<string, unknown> = {}, family = "systemMedium", nowMs = NOW) =>
  dumpWidget(render(widgetProps(over), { colorScheme: "light", widgetFamily: family, date: new Date(nowMs) }));

const TL = { timelineEndMs: NOW + H };
const nursing = {
  kind: "nursing",
  timerStartMs: NOW - 12 * 60_000,
  sinceMs: at(0, 14, 48),
  sinceLabel: "depuis 14:48",
  pausedAtMs: null,
  side: "G",
  otherSideLabel: "D 12 min",
  alsoKind: null,
  nap: null,
};
const walk = { ...napLive(NOW - 30 * 60_000), kind: "walk", nap: null, sinceLabel: "depuis 14:30" };

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("phrases parlées", () => {
  it("sieste : « en cours depuis HH:MM, N minutes » (durée à la minute quand la timeline la donne)", () => {
    const d = show({ lives: [napLive(NOW - 45 * 60_000)], ...TL });
    expect(d.a11y).toContain("Sieste en cours depuis 14:00, 45 minutes");
    expect(d.ignored).toBeGreaterThan(0);
  });

  it("hors timeline : pas de durée dite (le chrono natif défile seul)", () => {
    const d = show({ lives: [napLive(NOW - 45 * 60_000)] });
    expect(d.a11y).toContain("Sieste en cours depuis 14:00");
  });

  it("durée d'une heure ou plus : « 1 heure et 8 minutes », sans abréviation", () => {
    const d = show({ lives: [napLive(NOW - 68 * 60_000)], ...TL });
    expect(d.a11y).toContain("Sieste en cours depuis 14:00, 1 heure et 8 minutes");
  });

  it("tétée : côté dit en toutes lettres, « sein gauche »", () => {
    const d = show({ lives: [nursing], ...TL });
    expect(d.a11y.some((l) => l.startsWith("Tétée en cours, sein gauche, autre sein droit, 12 minutes, depuis 14:48"))).toBe(true);
    expect(d.a11y.join(" ")).not.toMatch(/sein G\b/);
  });

  it("écran verrouillé : phrases complètes (tétée en cours, repos, expiré)", () => {
    const rect = show({ lives: [nursing] }, "accessoryRectangular");
    expect(rect.a11y).toContain("Tétée en cours, sein gauche, autre sein droit, 12 minutes, depuis 14:48");
    // Pas de doublon « Autre sein » ajouté à la fin, jamais « min » abrégé
    expect(rect.a11y.join("|")).not.toMatch(/Autre sein|\bmin\b/);
    const inline = show({ lives: [nursing] }, "accessoryInline");
    expect(inline.a11y).toContain("Tétée en cours, sein gauche, autre sein droit, 12 minutes, depuis 14:48");
    expect(show({}, "accessoryRectangular").a11y).toContain("Dernier repas à 13:00");
    for (const f of ["accessoryRectangular", "accessoryInline"]) {
      expect(show({ generatedAtMs: NOW - 25 * H }, f).a11y).toContain("SuiviBaby. Ouvrez SuiviBaby pour mettre à jour");
    }
    expect(show({ generatedAtMs: NOW - 25 * H }, "systemMedium").a11y).toContain("SuiviBaby. Ouvrez SuiviBaby pour mettre à jour");
  });

  it("rappel dépassé : dit « rappel dépassé, dernier hier à 23:10 », pas « rappel · »", () => {
    const d = show({
      lastMealMs: at(-1, 23, 10),
      alerts: { mealAtMs: at(0, 2, 10) },
      day: { mealsCount: 0, bottleMl: 0, lastMealMs: at(-1, 23, 10), diapersCount: 2, lastDiaperMs: NOW - 3 * H, sleepMinutes: 0 },
    });
    expect(d.a11y.some((l) => l.includes("rappel dépassé, dernier hier à 23:10"))).toBe(true);
    expect(d.a11y.join(" ")).not.toContain("rappel ·");
    expect(allText(d)).toContain("rappel · hier 23:10");
  });

  it("jours : « il y a 2 jours » parlé, « 2 j » affiché", () => {
    const d = show({ lastMealMs: at(-2, 12, 0) });
    expect(d.a11y.some((l) => l.includes("Dernier repas il y a 2 jours"))).toBe(true);
    expect(allText(d)).toContain("2 j");
  });

  it("petit format : la bande se lit d'un bloc, sans abréviation, avec rappel dépassé", () => {
    const d = show({ alerts: { diaperAtMs: NOW - H } }, "systemSmall");
    expect(d.a11y).toContain("3 repas, 2 changes, rappel dépassé, 1 heure et 35 minutes de sommeil".replace("2 changes, rappel dépassé", "2 changes, rappel dépassé"));
    const ok = show({}, "systemSmall");
    expect(ok.a11y).toContain("3 repas, 2 changes, 1 heure et 35 minutes de sommeil");
    expect(allText(ok)).not.toMatch(/rep\.|dodo/);
  });

  it("petit format : « rappel dépassé » sous le chiffre ; deux sessions : pas de bande du jour", () => {
    const late = show({ alerts: { mealAtMs: NOW - H } }, "systemSmall");
    expect(late.texts).toContain("rappel dépassé");
    expect(late.texts).not.toContain("dépassé");
    const two = show({ lives: [napLive(NOW - H), { ...napLive(NOW - 30 * 60_000), kind: "walk" } as any] }, "systemSmall");
    expect(two.texts).not.toContain("1h35");
  });

  it("petit format, une sieste : « ■ » à côté du chrono, le widget ouvre l'arrêt SANS clé (l'app demande confirmation)", () => {
    const d = show({ lives: [napLive(NOW - H)] }, "systemSmall");
    expect(d.texts).toContain("■");
    const stop = d.links.find((l) => l.includes("widget=sleep-stop"));
    expect(stop).toBeDefined();
    expect(stop).not.toContain("&k=");
    // Deux sessions : impossible de savoir laquelle arrêter, ni « ■ » ni lien d'arrêt.
    const two = show({ lives: [napLive(NOW - H), { ...napLive(NOW - 30 * 60_000), kind: "walk" } as any] }, "systemSmall");
    expect(two.texts).not.toContain("■");
    expect(two.links.some((l) => l.includes("-stop"))).toBe(false);
    // Proche (lecture seule) : rien.
    const ro = show({ lives: [napLive(NOW - H)], canWrite: false }, "systemSmall");
    expect(ro.links.some((l) => l.includes("-stop"))).toBe(false);
  });

  it("données de plus de 2 h : « mis à jour à », « données à vérifier »", () => {
    const d = show({ generatedAtMs: NOW - 3 * H, lives: [napLive(NOW - H)] });
    expect(d.a11y).toContain("Données à vérifier, mis à jour à 12:00");
    const calm = show({ generatedAtMs: NOW - 3 * H });
    expect(calm.a11y).toContain("mis à jour à 12:00");
  });

  it("fil d'événements (grand) : une phrase par ligne, titre en-tête", () => {
    const d = show(
      { recent: [{ ms: at(-1, 23, 10), label: "Biberon 120 ml", kind: "meal" }, { ms: at(0, 14, 5), label: "Change", kind: "diaper" }] },
      "systemLarge",
    );
    expect(d.a11y).toContain("hier à 23:10, Biberon 120 ml");
    expect(d.a11y).toContain("à 14:05, Change");
    expect(d.traits).toContain("isHeader");
  });
});

describe("lot 5 : dernière passe d'accessibilité", () => {
  it("tuile tétée : une seule étiquette (le lien), pas son contenu en double (I4)", () => {
    const d = show({ lives: [nursing], ...TL });
    expect(d.a11y.filter((a) => a.startsWith("Tétée en cours, sein gauche"))).toHaveLength(1);
  });

  it("rappel dépassé (écran verrouillé) : « rappel dépassé », pas « en retard » (I6)", () => {
    const d = show({ lastMealMs: NOW - 2 * H, alerts: { mealAtMs: NOW - 60_000 } }, "accessoryRectangular");
    expect(d.a11y).toContain("Dernier repas à 13:00, rappel dépassé");
    expect(d.a11y.join("|")).not.toContain("en retard");
  });
});

describe("lot 2 : phrases parlées", () => {
  it("tétée en pause : « Tétée en pause, sein gauche, depuis 14:20 » (pas « en cours … en pause »)", () => {
    const paused = { ...nursing, otherSideLabel: null, sinceLabel: "depuis 14:20", pausedAtMs: NOW - 5 * 60_000 };
    const d = show({ lives: [paused] });
    expect(d.a11y).toContain("Tétée en pause, sein gauche, depuis 14:20");
    expect(d.a11y.join("|")).not.toContain("en cours");
  });

  it("autre sein : « 1h08 » dit « 1 heure et 8 minutes »", () => {
    const d = show({ lives: [{ ...nursing, otherSideLabel: "G 1h08", side: "D" }] });
    expect(d.a11y.some((l) => l.includes("autre sein gauche, 1 heure et 8 minutes"))).toBe(true);
  });

  it("hors timeline : le chrono natif reste lisible (durée dite) ; en timeline : masqué", () => {
    const off = show({ lives: [napLive(NOW - 45 * 60_000)] });
    const on = show({ lives: [napLive(NOW - 45 * 60_000)], ...TL });
    expect(on.hidden).toBeGreaterThan(off.hidden);
  });

  it("boutons d'arrêt : phrases identiques à Android", () => {
    expect(show({ lives: [napLive(NOW - H)] }).a11y).toContain("Arrêter la sieste");
    expect(show({ lives: [{ ...napLive(NOW - H), nap: false }] }).a11y).toContain("Arrêter la nuit");
    expect(show({ lives: [walk] }).a11y).toContain("Arrêter la balade");
    expect(show({ lives: [nursing] }).a11y).toContain("Arrêter la tétée");
  });

  it("sommeil du jour dit en minutes complètes, jamais « min » ni « 1h35 »", () => {
    const d = show({});
    expect(d.a11y).toContain("1 heure et 35 minutes de sommeil");
    expect(d.a11y.join("|")).not.toMatch(/\d+h\d+|\bmin\b/);
  });

  it("jalon d'humeur : « humeur 😊 »", () => {
    const d = show({ recent: [{ ms: at(0, 14, 0), label: "😊", kind: "other", icon: "jalon" }] }, "systemLarge");
    expect(d.a11y).toContain("à 14:00, humeur 😊");
  });

  it("police 30 : style « title » (28 pt), plus de largeTitle", () => {
    expect(source).not.toMatch(/"largeTitle"/);
    expect(source).toMatch(/size>=26\?"title"/);
  });
});

describe("éléments décoratifs, indications, mise en page", () => {
  it("pastilles et filet masqués au lecteur d'écran", () => {
    const d = show();
    expect(d.hidden).toBeGreaterThan(3);
    expect(d.texts.filter((t) => t === "●").length).toBeLessThanOrEqual(d.hidden);
  });

  it("indications sur les boutons et les zones, sans rôle bouton", () => {
    const d = show({ lives: [napLive(NOW - H)] });
    // Même mot que le libellé « Arrêter la sieste » (I5).
    expect(d.hints).toContain("Ouvre SuiviBaby et arrête la sieste");
    expect(d.hints).not.toContain("Ouvre SuiviBaby et arrête le sommeil");
    const nuit = show({ lives: [{ ...napLive(NOW - H), nap: false }] });
    expect(nuit.hints).toContain("Ouvre SuiviBaby et arrête la nuit");
    expect(d.hints).toContain("Ouvre SuiviBaby et démarre une balade");
    expect(d.hints).toContain("Ouvre SuiviBaby et permet de noter un repas");
    expect(d.traits).not.toContain("isButton");
    const rest = show({ canWrite: false });
    expect(rest.hints.every((h) => h === "Ouvre SuiviBaby pour consulter")).toBe(true);
  });

  it("aucune police à taille fixe (hors pastilles décoratives) : Dynamic Type", () => {
    for (const f of ["systemSmall", "systemMedium", "systemLarge", "accessoryRectangular", "accessoryInline"]) {
      const d = show({ lives: [nursing, napLive(NOW - H)], recent: [{ ms: NOW - H, label: "Change", kind: "diaper" }], ...TL }, f);
      expect(d.fixedFonts.filter((s) => s > 9)).toEqual([]);
    }
  });

  it("plafond Dynamic Type : xxxLarge sur l'écran d'accueil, xLarge sur l'écran verrouillé", () => {
    for (const f of ["systemSmall", "systemMedium", "systemLarge"]) expect(show({}, f).typeCaps).toContain("xxxLarge");
    for (const f of ["accessoryRectangular", "accessoryInline"]) expect(show({}, f).typeCaps).toEqual(["xLarge"]);
    expect(show({ generatedAtMs: NOW - 25 * H }, "systemLarge").typeCaps).toContain("xxxLarge");
  });

  it("zones tactiles : arrêt 44 pt (tuile seule), 40 pt (deux sessions), en-tête 32 pt", () => {
    const one = show({ lives: [napLive(NOW - H)], ...TL });
    expect(one.minHeights).toContain(44);
    expect(one.minHeights).toContain(32);
    const two = show({ lives: [napLive(NOW - H), walk], ...TL });
    expect(two.minHeights).toContain(40);
  });

  it("trois sessions : plus de bouton « ■ » (le lien de la tuile reste)", () => {
    const d = show({ lives: [nursing, napLive(NOW - H), walk], ...TL });
    expect(d.texts).not.toContain("■");
    expect(d.texts).not.toContain("■ Arrêter");
    expect(d.a11y.some((l) => l.startsWith("Tétée en cours"))).toBe(true);
  });

  it("lignes du jour : 44 pt en grand, 32 pt en moyen", () => {
    expect(show({}, "systemLarge").minHeights).toContain(44);
    expect(show({}, "systemMedium").minHeights).not.toContain(44);
  });

  it("branche accessoryCircular supprimée du widget", () => {
    expect(source).not.toContain("accessoryCircular");
  });
});

describe("contraste", () => {
  it("texte vert sur tuile balade ≥ 4,5:1 (clair)", () => {
    expect(contrast("#386F26", "#E6F2DE")).toBeGreaterThanOrEqual(4.5);
    expect(source).toContain("#386F26");
    expect(source).not.toContain("#3F7A2A");
  });
});
