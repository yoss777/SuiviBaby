// Widget Android : accessibilité (TalkBack, cibles tactiles, contraste) et grand
// texte (fontScale), rendus sans Glance avec les vrais modificateurs d'@expo/ui.
jest.mock("expo-widgets", () => ({ createWidget: (_n: string, fn: unknown) => fn }));

import { NOW, H, at, napLive, widgetProps } from "./helpers/widgetFixtures";
import { allText, compileWidget, dumpWidget } from "./helpers/widgetTree";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const render = compileWidget(require("@/widgets/BebeMaintenant.android").default, "android");

type Node = { type: string; props: { modifiers?: Array<Record<string, unknown>>; children?: unknown } };
const walk = (n: unknown, out: Node[] = []): Node[] => {
  if (n == null || typeof n !== "object") return out;
  if (Array.isArray(n)) {
    n.forEach((c) => walk(c, out));
    return out;
  }
  const el = n as Node;
  out.push(el);
  walk(el.props?.children, out);
  return out;
};
const BIG = { widthDp: 420, heightDp: 222 };
const env = (size = BIG, extra: Record<string, unknown> = {}) => ({ colorScheme: "light", nativeLevel: 3, ...size, ...extra });
const tree = (over: Record<string, unknown> = {}, size = BIG, extra: Record<string, unknown> = {}) =>
  render(widgetProps(over), env(size, extra)) as unknown as Node;
const show = (over: Record<string, unknown> = {}, size = BIG, extra: Record<string, unknown> = {}) =>
  dumpWidget(render(widgetProps(over), env(size, extra)));
const mod = (n: Node, name: string) => n.props.modifiers?.find((m) => JSON.stringify(m).includes(`"${name}"`));
const heightOf = (n: Node) => (n.props.modifiers ?? []).map((m) => (m as { height?: number }).height).find((v) => typeof v === "number");
const sizeHeightOf = (n: Node) => (n.props.modifiers ?? []).map((m) => (m as { height?: number }).height).find((v) => typeof v === "number");
const descOf = (n: Node) =>
  (n.props.modifiers ?? []).map((m) => (m as { contentDescription?: string }).contentDescription).find((v) => typeof v === "string");
const urlOf = (n: Node) => (n.props.modifiers ?? []).map((m) => (m as { url?: string }).url).find((v) => typeof v === "string") ?? "";
const chipsOf = (t: Node, action: string) => walk(t).filter((n) => urlOf(n).includes(`widget=${action}`));

const walkLive = (startMs: number) => ({ ...napLive(startMs), kind: "walk", nap: null });
const nursingLive = (startMs: number) => ({
  kind: "nursing", timerStartMs: startMs, sinceMs: startMs, sinceLabel: "depuis 14:50", pausedAtMs: null, side: "G", otherSideLabel: null, alsoKind: null, nap: null,
});
const BAIN = { ms: NOW - H, label: "Bain", icon: "bain", kind: "other" };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

describe("accessibilité", () => {
  it("tuiles sieste et balade : phrase avec heure de début et durée", () => {
    expect(show({ lives: [napLive(NOW - 68 * 60_000)] }).a11y).toContain("Sieste en cours depuis 13:52, 1 heure et 8 minutes");
    expect(show({ lives: [walkLive(NOW - 25 * 60_000)] }).a11y).toContain("Balade en cours depuis 14:35, 25 minutes");
  });

  it("tuile tétée : le contenu, puis l'action", () => {
    const d = show({ lives: [nursingLive(NOW - 10 * 60_000)] });
    expect(d.a11y.some((a) => a.startsWith("Tétée en cours") && a.endsWith("Ouvrir la tétée en cours"))).toBe(true);
  });

  it("repas au repos et lignes « Aujourd'hui » : contenu dans le libellé", () => {
    const d = show();
    expect(d.a11y.some((a) => a.startsWith("Dernier repas") && a.endsWith("Noter un repas"))).toBe(true);
    expect(d.a11y).toContain("3 repas. Noter un repas");
    expect(d.a11y).toContain("2 changes. Noter un change");
    expect(d.a11y).toContain("1 heure et 35 minutes de sommeil. Noter un sommeil");
    expect(show({ alerts: { mealAtMs: NOW - 60_000 } }).a11y).toContain("3 repas, rappel dépassé. Noter un repas");
  });

  it("espaces de la liste « Aujourd'hui » : ni lien ni description", () => {
    const spacers = walk(tree({ recent: [BAIN] })).filter((n) => n.type === "Spacer" && String(n.props.modifiers?.map((m) => JSON.stringify(m))).includes('"height":8'));
    expect(spacers.length).toBeGreaterThanOrEqual(3);
    for (const sp of spacers) {
      expect(descOf(sp)).toBeUndefined();
      expect(urlOf(sp)).toBe("");
    }
  });

  it("racine courte : prénom, sessions, fraîcheur ; pas de phrase d'aide", () => {
    const d = show({ lives: [napLive(NOW - H)], generatedAtMs: NOW - 3 * H, recent: [BAIN] });
    const root = d.a11y.find((a) => a.startsWith("Léa"));
    expect(root).toBe("Léa. Sieste en cours depuis 14:00, 1 heure. À vérifier, informations mises à jour à 12:00");
    expect(root).not.toContain("Toucher");
    expect(root).not.toContain("Derniers évènements");
  });

  it("lignes du fil : non cliquables, « à HH:MM, libellé » (humeur pour un jalon)", () => {
    const t = tree({
      recent: [
        { ms: NOW - H, label: "😊", icon: "jalon", kind: "other" },
        { ms: NOW - 2 * H, label: "Bain", icon: "bain", kind: "other" },
        { ms: at(-1, 22, 5), label: "Biberon", icon: "biberon", kind: "meal" },
      ],
    });
    const rows = walk(t).filter((n) => /^(hier )?à \d\d:\d\d, /.test(descOf(n) ?? ""));
    expect(rows.map(descOf)).toEqual(["à 14:00, humeur 😊", "à 13:00, Bain", "hier à 22:05, Biberon"]);
    for (const r of rows) expect(urlOf(r)).toBe("");
    const titles = walk(t).filter((n) => n.type === "Column" && sizeHeightOf(n) === 28);
    expect(titles.length).toBeGreaterThan(0);
    for (const x of titles) expect(urlOf(x)).toBe("");
  });

  it("bouton d'arrêt : 44 dp (une session), 40 dp (deux), aucun à trois", () => {
    expect(heightOf(chipsOf(tree({ lives: [napLive(NOW - H)] }), "sleep-stop")[0])).toBe(44);
    const tall = { widthDp: 420, heightDp: 330 };
    const two = tree({ lives: [napLive(NOW - H), walkLive(NOW - 20 * 60_000)] }, tall);
    for (const c of [...chipsOf(two, "sleep-stop"), ...chipsOf(two, "walk-stop")]) expect(heightOf(c)).toBe(40);
    const three = tree({ lives: [napLive(NOW - H), walkLive(NOW - 20 * 60_000), nursingLive(NOW - 5 * 60_000)] }, tall);
    expect(chipsOf(three, "-stop")).toHaveLength(0);
  });

  it("boutons ▶ de l'en-tête : 32 dp dans un en-tête de 34 dp", () => {
    const t = tree();
    const chips = [...chipsOf(t, "sleep-start"), ...chipsOf(t, "walk-start")];
    expect(chips).toHaveLength(2);
    for (const c of chips) expect(heightOf(c)).toBe(32);
    expect(walk(t).some((n) => n.type === "Row" && heightOf(n) === 34)).toBe(true);
  });

  it("bande 2×2 : descriptions complètes, abréviations non lues", () => {
    const d = walk(tree({ lives: [napLive(NOW - H)], alerts: { mealAtMs: NOW - 1000 } }, { widthDp: 200, heightDp: 200 })).map(descOf);
    expect(d).toContain("3 repas, rappel dépassé");
    expect(d).toContain("2 changes");
    expect(d).toContain("1 heure et 35 minutes de sommeil");
  });

  it("textes lus tels quels : « Mise à jour en cours », « Mis à jour à 12:00 »", () => {
    expect(allText(show({ loading: true }))).toContain("Mise à jour en cours");
    expect(show({ generatedAtMs: NOW - 3 * H }).a11y).toContain("Mis à jour à 12:00");
  });

  it("texte balade : contraste WCAG >= 4,5 sur sa tuile", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    expect(JSON.stringify(tree({ lives: [walkLive(NOW - H)] }))).toContain("#386F26");
    const [a, b] = [lum("#386F26"), lum("#E6F2DE")];
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("grand texte (fontScale)", () => {
  const hasDayColumn = (t: Node) => walk(t).some((n) => n.type === "LazyColumn");
  const headerH = (t: Node) => heightOf(walk(t).find((n) => n.type === "Row" && heightOf(n) !== undefined)!);

  it("échelle 1 : présentation habituelle", () => {
    const t = tree({}, BIG, { fontScale: 1 });
    expect(hasDayColumn(t)).toBe(true);
    expect(headerH(t)).toBe(34);
  });

  it("échelle absente : comme 1", () => {
    expect(hasDayColumn(tree())).toBe(true);
  });

  it("échelle 1,5 : présentation compacte, hauteurs fixes agrandies", () => {
    const t = tree({ lives: [napLive(NOW - H)] }, { widthDp: 420, heightDp: 330 }, { fontScale: 1.5 });
    expect(hasDayColumn(t)).toBe(false);
    expect(headerH(t)).toBe(Math.ceil(22 * 1.5));
    const base = tree({ lives: [napLive(NOW - H)] }, { widthDp: 200, heightDp: 330 }, { fontScale: 1 });
    expect(headerH(t)).toBeGreaterThan(headerH(base)!);
  });

  it.each([1.3, 1.5])("échelle %s, largeur 420 : démarrage (▶) et arrêt (■) conservés", (fontScale) => {
    const size = { widthDp: 420, heightDp: 330 };
    const running = tree({ lives: [napLive(NOW - H)] }, size, { fontScale });
    const stops = chipsOf(running, "sleep-stop");
    expect(stops).toHaveLength(1);
    expect(heightOf(stops[0])).toBeGreaterThanOrEqual(40);
    expect(descOf(stops[0])).toBe("Arrêter la sieste");
    expect(chipsOf(running, "walk-start")).toHaveLength(1);
    const idle = tree({}, size, { fontScale });
    expect(chipsOf(idle, "sleep-start")).toHaveLength(1);
    expect(chipsOf(idle, "walk-start")).toHaveLength(1);
    for (const c of [...chipsOf(idle, "sleep-start"), ...chipsOf(idle, "walk-start")]) expect(heightOf(c)).toBeGreaterThanOrEqual(32);
  });

  it("échelle 1,5, largeur étroite (< 250) : pas de boutons de démarrage", () => {
    const t = tree({}, { widthDp: 200, heightDp: 330 }, { fontScale: 1.5 });
    expect(chipsOf(t, "sleep-start")).toHaveLength(0);
  });

  it("échelle 3 : plafonnée à 2, sans erreur", () => {
    const t = tree({ lives: [napLive(NOW - H)] }, BIG, { fontScale: 3 });
    expect(headerH(t)).toBe(Math.ceil(22 * 2));
  });
});

describe("bouton d'arrêt : jamais de débordement", () => {
  it.each([130, 160])("une session, 320 × %s dp : bouton absent (la tuile reste un lien) ou contenu", (heightDp) => {
    const t = tree({ lives: [napLive(NOW - H)] }, { widthDp: 320, heightDp });
    const stops = chipsOf(t, "sleep-stop");
    if (stops.length) expect(heightOf(stops[0])).toBeGreaterThanOrEqual(32);
    else expect(urlOf(walk(t).find((n) => descOf(n)?.startsWith("Sieste en cours")) as Node)).toBe("");
  });

  it("320 × 130 : aucun bouton d'arrêt (jamais forcé à 32 dp)", () => {
    expect(chipsOf(tree({ lives: [napLive(NOW - H)] }, { widthDp: 320, heightDp: 130 }), "sleep-stop")).toHaveLength(0);
  });

  it("deux sessions dans une zone basse : pas de bouton sous 32 dp", () => {
    const t = tree({ lives: [napLive(NOW - H), walkLive(NOW - 20 * 60_000)] }, { widthDp: 320, heightDp: 160 });
    expect(chipsOf(t, "-stop")).toHaveLength(0);
  });
});

describe("libellés d'arrêt parlés", () => {
  it("sieste, nuit, balade, tétée", () => {
    expect(show({ lives: [napLive(NOW - H)] }).a11y).toContain("Arrêter la sieste");
    expect(show({ lives: [{ ...napLive(NOW - H), nap: false }] }).a11y).toContain("Arrêter la nuit");
    expect(show({ lives: [walkLive(NOW - H)] }).a11y).toContain("Arrêter la balade");
    expect(show({ lives: [nursingLive(NOW - H)] }).a11y).toContain("Arrêter la tétée");
  });
});
