// Contenu du widget Android (BebeMaintenant.android.tsx), rendu sans Glance :
// libellés de rappel, liens et clé, Proche, expiration à 24 h, ligne sommeil.
jest.mock("expo-widgets", () => ({ createWidget: (_n: string, fn: unknown) => fn }));

import { KEY, NOW, H, at, napLive, widgetProps } from "./helpers/widgetFixtures";
import { allText, compileWidget, dumpWidget } from "./helpers/widgetTree";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const render = compileWidget(require("@/widgets/BebeMaintenant.android").default, "android");
const show = (over: Record<string, unknown> = {}, size = { widthDp: 420, heightDp: 222 }) =>
  dumpWidget(render(widgetProps(over), { colorScheme: "light", nativeLevel: 3, ...size }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

it("au repos : derniers repas et change, ligne sommeil vers son formulaire", () => {
  const d = show();
  expect(allText(d)).toContain("Dernier repas");
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
  // À 420 dp, le libellé est raccourci pour tenir (lateSub) : texte exact.
  expect(d.texts).toContain("rappel · hier à 23:10");
});

it("sieste en cours : liens démarrer/arrêter avec la clé de l'appareil", () => {
  const d = show({ lives: [napLive(NOW - H)] });
  const stop = d.links.find((l) => l.includes("widget=sleep-stop"));
  expect(stop).toContain(`&k=${KEY}`);
  expect(d.links.find((l) => l.includes("widget=walk-start"))).toContain(`&k=${KEY}`);
});

it("Proche (lecture seule) : ni démarrer ni arrêter, liens vers l'Accueil seulement", () => {
  const d = show({ canWrite: false, lives: [napLive(NOW - H)] });
  expect(d.links.some((l) => /widget=(sleep|walk|nursing)-(start|stop)/.test(l))).toBe(false);
  expect(d.links.every((l) => l === "suivibaby:///baby/home")).toBe(true);
});

it("données de plus de 24 h : ni prénom ni données, invitation à ouvrir l'app (grand et petit)", () => {
  for (const size of [{ widthDp: 420, heightDp: 222 }, { widthDp: 200, heightDp: 200 }]) {
    const d = show({ generatedAtMs: NOW - 25 * H }, size);
    const visible = `${allText(d)} ${d.a11y.join(" ")}`;
    for (const leak of ["Léa", "Martin", "repas", "rep.", "change", "ch.", "Dernier", "sommeil", "dodo"]) {
      expect(visible).not.toContain(leak);
    }
    expect(allText(d)).toContain("Ouvrez SuiviBaby pour mettre à jour");
    expect(d.links.every((l) => l === "suivibaby:///baby/home")).toBe(true);
  }
});

it("sans repas noté : le dernier change reste visible", () => {
  const d = show({ lastMealMs: null, day: { mealsCount: 0, bottleMl: 0, lastMealMs: null, diapersCount: 1, lastDiaperMs: NOW - H, sleepMinutes: 0 } });
  expect(allText(d)).toContain("Dernier change");
});

describe("session oubliée ? (staleAtMs)", () => {
  const raw = (live: Record<string, unknown>, scheme = "light") =>
    JSON.stringify(render(widgetProps({ lives: [live] }), { colorScheme: scheme, nativeLevel: 3, widthDp: 420, heightDp: 222 }));
  const stale = (startMs: number, staleAtMs: number) => ({ ...napLive(startMs), staleAtMs });

  it("avant le seuil : titre normal, chrono non ambre", () => {
    const l = stale(NOW - 5 * H, NOW + H);
    const d = show({ lives: [l] });
    expect(allText(d)).not.toContain("oubliée");
    expect(d.a11y.join(" ")).not.toContain("oubliée");
    expect(raw(l)).not.toContain("#8A4B00");
  });

  it("au seuil : « Sieste · oubliée ? », chrono ambre (clair et sombre), phrase parlée complétée", () => {
    const l = stale(NOW - 6 * H, NOW);
    const d = show({ lives: [l] });
    expect(allText(d)).toContain("Sieste · oubliée ?");
    expect(d.a11y.join(" ")).toContain(", oubliée ? à vérifier");
    expect(raw(l)).toContain("#8A4B00");
    expect(raw(l, "dark")).toContain("#FBBF24");
  });

  it("redessin programmé à l'instant staleAtMs", () => {
    const l = stale(NOW - 5 * H, NOW + 20 * 60_000);
    expect(raw(l)).toContain(`"atMs":${NOW + 20 * 60_000}`);
  });
});
