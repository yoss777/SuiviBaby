// Contenu du widget iPhone (BebeMaintenant.ios.tsx), rendu sans WidgetKit :
// libellés de rappel, liens et clé, Proche, expiration à 24 h, petit format.
jest.mock("expo-widgets", () => ({ createWidget: (_n: string, fn: unknown) => fn }));

import { KEY, NOW, H, at, napLive, widgetProps } from "./helpers/widgetFixtures";
import { allText, compileWidget, dumpWidget } from "./helpers/widgetTree";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const render = compileWidget(require("@/widgets/BebeMaintenant.ios").default, "ios");
const show = (over: Record<string, unknown> = {}, family = "systemMedium", nowMs = NOW) =>
  dumpWidget(render(widgetProps(over), { colorScheme: "light", widgetFamily: family, date: new Date(nowMs) }));

it("au repos : derniers repas et change, liens vers leurs formulaires, fond vers l'Accueil", () => {
  const d = show();
  expect(allText(d)).toContain("Dernier repas");
  expect(allText(d)).toContain("2h00");
  expect(d.links).toContain("suivibaby:///baby/home");
  expect(d.links.some((l) => l.includes("widget=meal&child=c1"))).toBe(true);
  expect(d.links.some((l) => l.includes("widget=diaper&child=c1"))).toBe(true);
  expect(d.links.some((l) => l.includes("widget=sleep&child=c1"))).toBe(true);
});

it("rappel dépassé : « rappel / dépassé » et « rappel · dernier hier à 23:10 »", () => {
  const d = show({
    lastMealMs: at(-1, 23, 10),
    alerts: { mealAtMs: at(0, 2, 10) },
    day: { mealsCount: 0, bottleMl: 0, lastMealMs: at(-1, 23, 10), diapersCount: 2, lastDiaperMs: NOW - 3 * H, sleepMinutes: 0 },
  });
  expect(d.texts).toContain("dépassé");
  expect(allText(d)).toContain("rappel · dernier hier à 23:10");
});

it("dernier change il y a plusieurs jours : « dernier le JJ/MM »", () => {
  const d = show({ day: { mealsCount: 3, bottleMl: 0, lastMealMs: NOW - 2 * H, diapersCount: 0, lastDiaperMs: at(-3, 9), sleepMinutes: 0 } });
  expect(allText(d)).toContain("dernier le 13/11");
});

it("sieste en cours : « ■ Arrêter », boutons ▶ ; liens démarrer/arrêter avec la clé de l'appareil", () => {
  const d = show({ lives: [napLive(NOW - H)] });
  expect(d.texts).toContain("■ Arrêter");
  const stop = d.links.find((l) => l.includes("widget=sleep-stop"));
  const walk = d.links.find((l) => l.includes("widget=walk-start"));
  expect(stop).toContain(`&k=${KEY}`);
  expect(walk).toContain(`&k=${KEY}`);
  // Pas de « ▶ Sieste » quand une sieste tourne déjà.
  expect(d.texts).not.toContain("▶ Sieste");
  expect(d.a11y).toContain("Démarrer une balade");
});

it("sans clé (widget pas encore à jour) : liens sans &k= (l'app demandera confirmation)", () => {
  const d = show({ lives: [napLive(NOW - H)], linkKey: undefined });
  expect(d.links.every((l) => !l.includes("&k="))).toBe(true);
});

it("Proche (lecture seule) : ni bouton démarrer/arrêter, tous les liens vers l'Accueil", () => {
  const d = show({ canWrite: false, lives: [napLive(NOW - H)] });
  expect(d.texts).not.toContain("■ Arrêter");
  expect(allText(d)).not.toContain("▶");
  expect(d.links.every((l) => l === "suivibaby:///baby/home")).toBe(true);
});

it("données de plus de 24 h : ni prénom ni données, invitation à ouvrir l'app (toutes les familles)", () => {
  for (const family of ["systemSmall", "systemMedium", "systemLarge", "accessoryRectangular", "accessoryInline"]) {
    const d = show({ generatedAtMs: NOW - 25 * H }, family);
    const text = allText(d);
    expect(text).not.toContain("Léa");
    expect(text).not.toContain("repas");
    expect(d.a11y.join(" ")).not.toContain("Léa");
    expect(d.links.every((l) => l === "suivibaby:///baby/home")).toBe(true);
  }
  expect(allText(show({ generatedAtMs: NOW - 25 * H }))).toContain("Ouvrez SuiviBaby pour mettre à jour");
});

it("petit format : un seul lien (repas au repos), bande du jour", () => {
  const d = show({}, "systemSmall");
  expect(d.links.filter((l) => l.startsWith("suivibaby")).some((l) => l.includes("widget=meal"))).toBe(true);
  expect(allText(d)).toContain("3 rep.");
  expect(allText(d)).toContain("2 ch.");
});
