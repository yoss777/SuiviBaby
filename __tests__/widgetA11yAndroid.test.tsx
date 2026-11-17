// Widget Android : accessibilité (TalkBack, cibles tactiles, contraste) et grand
// texte (fontScale), rendus sans Glance avec les vrais modificateurs d'@expo/ui.
jest.mock("expo-widgets", () => ({ createWidget: (_n: string, fn: unknown) => fn }));

import { KEY, NOW, H, at, napLive, widgetProps } from "./helpers/widgetFixtures";
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
    // La sous-ligne est dite aussi, comme sur iPhone (A6).
    expect(d.a11y).toContain("3 repas, dernier à 13:00. Noter un repas");
    expect(d.a11y).toContain("2 changes, dernier à 12:00. Noter un change");
    expect(d.a11y).toContain("1 heure et 35 minutes de sommeil. Noter un sommeil");
    expect(show({ alerts: { mealAtMs: NOW - 60_000 } }).a11y).toContain("3 repas, rappel dépassé, dernier à 13:00. Noter un repas");
  });

  it("espaces de la liste « Aujourd'hui » : ni lien ni description", () => {
    const spacers = walk(tree({ recent: [BAIN] })).filter((n) => n.type === "Spacer" && String(n.props.modifiers?.map((m) => JSON.stringify(m))).includes('"height":8'));
    expect(spacers.length).toBeGreaterThanOrEqual(3);
    for (const sp of spacers) {
      expect(descOf(sp)).toBeUndefined();
      expect(urlOf(sp)).toBe("");
    }
  });

  it("racine courte : le prénom seul ; sessions et fraîcheur lues par leurs propres nœuds (A5)", () => {
    const d = show({ lives: [napLive(NOW - H)], generatedAtMs: NOW - 3 * H, recent: [BAIN] });
    expect(d.a11y.find((a) => a.startsWith("Léa"))).toBe("Léa");
    expect(d.a11y.filter((a) => a.startsWith("Sieste en cours"))).toEqual(["Sieste en cours depuis 14:00, 1 heure"]);
    expect(d.a11y.filter((a) => a.includes("mis à jour à 12:00") || a.includes("Mis à jour à 12:00"))).toHaveLength(1);
  });

  it("racine en chargement : prénom et « Mise à jour en cours »", () => {
    expect(show({ loading: true }).a11y.find((a) => a.startsWith("Léa"))).toBe("Léa. Mise à jour en cours");
  });

  it("autre sein dit en toutes lettres : jamais « min » ni « 1h08 » (A1)", () => {
    const nurse = (otherSideLabel: string) => ({ ...nursingLive(NOW - 10 * 60_000), side: "D", otherSideLabel });
    const say = (label: string) => show({ lives: [nurse(label)] }).a11y.find((a) => a.startsWith("Tétée en cours")) ?? "";
    expect(say("G 12 min")).toContain("autre sein gauche, 12 minutes");
    expect(say("G 1 min")).toContain("autre sein gauche, 1 minute,");
    expect(say("G 1h08")).toContain("autre sein gauche, 1 heure et 8 minutes");
    expect(say("G 2h00")).toContain("autre sein gauche, 2 heures,");
    expect(say("G 12 min")).not.toMatch(/\bmin\b/);
    expect(say("G 1h08")).not.toContain("1h08");
  });

  it("lignes « Aujourd'hui » : sous-ligne dite (jour d'hier, biberon, aucun noté) (A6)", () => {
    const d = show({
      day: { mealsCount: 2, bottleMl: 120, lastMealMs: at(0, 14, 0), diapersCount: 1, lastDiaperMs: at(-1, 19, 37), sleepMinutes: 0, noMealEver: false },
    }).a11y;
    expect(d).toContain("2 repas, à 14:00, 120 millilitres. Noter un repas");
    expect(d).toContain("1 change, dernier hier à 19:37. Noter un change");
    const none = show({
      day: { mealsCount: 0, bottleMl: 0, lastMealMs: null, diapersCount: 0, lastDiaperMs: null, sleepMinutes: 0, noMealEver: true, noDiaperEver: true },
      lastMealMs: null,
    }).a11y;
    expect(none).toContain("0 repas, aucun noté. Noter un repas");
    expect(none).toContain("0 change, aucun noté. Noter un change");
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

  it("320 × 130 : le bouton passe sur la ligne du chrono, à 32 dp au moins (jamais forcé en dessous)", () => {
    const stops = chipsOf(tree({ lives: [napLive(NOW - H)] }, { widthDp: 320, heightDp: 130 }), "sleep-stop");
    expect(stops).toHaveLength(1);
    expect(heightOf(stops[0])).toBeGreaterThanOrEqual(32);
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

// ----- Grand texte : somme des hauteurs et largeurs fixes <= place disponible -----
describe("grand texte : tuiles de session sans débordement (A2, A3, A4, A7)", () => {
  const TILE = ["#ECE8F4", "#E6F2DE", "#FBE1EA"];
  const kids = (n: Node): Node[] => {
    const out: Node[] = [];
    const add = (c: unknown) => {
      if (Array.isArray(c)) c.forEach(add);
      else if (c && typeof c === "object" && "type" in (c as object)) out.push(c as Node);
    };
    add(n.props.children);
    return out;
  };
  const modVal = (n: Node, key: string, field: string) =>
    (n.props.modifiers ?? []).map((m) => m as Record<string, unknown>).find((m) => m.$type === key)?.[field] as number | undefined;
  const fontOf = (n: Node) => (n.props as unknown as { style?: { fontSize?: number } }).style?.fontSize;
  const nativeSp = (n: Node) => (n.props as unknown as { fontSize: number }).fontSize;
  // Hauteur occupée : explicite si posée, sinon texte (1,25 × sp × échelle), ligne = max, colonne = somme.
  const hOf = (n: Node, FS: number): number => {
    const explicit = modVal(n, "height", "height") ?? modVal(n, "size", "height");
    if (explicit !== undefined) return explicit;
    if (n.type === "Text") return Math.ceil((fontOf(n) ?? 12) * 1.25 * FS);
    if (n.type === "Row") return Math.max(0, ...kids(n).map((c) => hOf(c, FS)));
    if (n.type === "Column") return kids(n).reduce((s, c) => s + hOf(c, FS), 0);
    return 0;
  };
  const wOf = (n: Node): number => modVal(n, "width", "width") ?? modVal(n, "size", "width") ?? 0;
  const tiles = (t: Node) =>
    walk(t).filter(
      (n) => (n.type === "Column" || n.type === "Row") && modVal(n, "size", "width") !== undefined && TILE.some((c) => JSON.stringify(n.props.modifiers).includes(c)),
    );
  const lives2 = () => [napLive(NOW - H), walkLive(NOW - 20 * 60_000)];
  const lives3 = () => [napLive(NOW - H), walkLive(NOW - 20 * 60_000), nursingLive(NOW - 5 * 60_000)];
  const natives = (t: Node) => walk(t).filter((n) => ["ElapsedClockView", "ChronometerView"].includes(n.type));

  describe.each([1.3, 1.5, 2])("échelle %s", (FS) => {
    it("deux sessions : hauteur de la ligne (titre + chrono/bouton) et largeur du chrono tiennent", () => {
      const t = tree({ lives: lives2() }, { widthDp: 320, heightDp: 330 }, { fontScale: FS });
      const rows = tiles(t);
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        const h = modVal(r, "size", "height") as number;
        const w = modVal(r, "size", "width") as number;
        // padding(10, 6, 10, 6)
        expect(kids(r).reduce((s, c) => s + hOf(c, FS), 0) + 12).toBeLessThanOrEqual(h);
        const line = kids(r).find((c) => c.type === "Row" && kids(c).some((k) => k.type === "Spacer"));
        if (line) {
          const widths = kids(line).reduce((s, c) => s + (wOf(c) || (c.type === "Box" ? 16 + Math.ceil(10 * FS) : 0)), 0);
          expect(widths + 20).toBeLessThanOrEqual(w);
        }
      }
      for (const n of natives(t)) expect(nativeSp(n)).toBeLessThanOrEqual(Math.max(10, Math.floor((296 - 20) / (4.3 * FS))));
    });

    it("trois sessions : titre + chrono tiennent en largeur et en hauteur ; chrono jamais plus haut que la ligne", () => {
      const t = tree({ lives: lives3() }, { widthDp: 320, heightDp: 330 }, { fontScale: FS });
      const rows = tiles(t);
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        const h = modVal(r, "size", "height") as number;
        const w = modVal(r, "size", "width") as number;
        expect(kids(r).reduce((s, c) => s + wOf(c), 0) + 20).toBeLessThanOrEqual(w);
        expect(Math.max(...kids(r).map((c) => hOf(c, FS)))).toBeLessThanOrEqual(h - 4);
        // Colonne du titre agrandie avec la police (S()), sans dépasser la moitié de la ligne.
        expect(wOf(kids(r)[0])).toBe(Math.min(Math.ceil(56 * FS), Math.floor((w - 20) / 2)));
      }
    });

    it("2×2 (110 × 110) avec une session : la tuile tient dans sa zone", () => {
      const t = tree({ lives: [napLive(NOW - H)] }, { widthDp: 110, heightDp: 110 }, { fontScale: FS });
      const [tile] = tiles(t);
      const h = modVal(tile, "size", "height") as number;
      const pad = modVal(tile, "paddingAll", "all") as number;
      expect(kids(tile).reduce((s, c) => s + hOf(c, FS), 0) + 2 * pad).toBeLessThanOrEqual(h);
      // La zone elle-même tient dans le widget : en-tête + écart + zone <= intérieur.
      expect(Math.ceil(22 * FS) + 4 + h).toBeLessThanOrEqual(110 - 24);
    });
  });

  it("chrono d'une tuile seule : divisé par l'échelle (A2), plafonné par la hauteur (A7)", () => {
    const sp = (FS: number, heightDp: number) =>
      nativeSp(natives(tree({ lives: [napLive(NOW - H)] }, { widthDp: 320, heightDp }, { fontScale: FS }))[0]);
    expect(sp(2, 330)).toBeLessThan(sp(1, 330));
    expect(sp(1.5, 140)).toBeLessThan(sp(1.5, 330));
  });

  it("2×2 sans la place pour la bande du bas : la bande est retirée plutôt que de déborder", () => {
    const t = tree({ lives: [napLive(NOW - H)] }, { widthDp: 110, heightDp: 110 }, { fontScale: 2 });
    expect(walk(t).map(descOf)).not.toContain("3 repas");
  });

  // ----- Petite présentation : « ■ » sur la ligne du chrono -----
  describe.each([
    [110, 1],
    [160, 1],
    [110, 1.3],
    [160, 1.5],
    [160, 2],
    [220, 1],
  ])("2×2 (%s dp), échelle %s : bouton d'arrêt à côté du chrono", (dp, FS) => {
    const size = { widthDp: dp, heightDp: dp };
    const cases: [string, Record<string, unknown>, string, string][] = [
      ["sieste", napLive(NOW - H), "sleep-stop", "Arrêter la sieste"],
      ["balade", walkLive(NOW - 20 * 60_000), "walk-stop", "Arrêter la balade"],
      ["tétée", nursingLive(NOW - 5 * 60_000), "nursing-stop", "Arrêter la tétée"],
    ];
    it.each(cases)("une session (%s) : bouton présent s'il tient, dans les bornes, avec lien et clé", (_n, live, action, say) => {
      const t = tree({ lives: [live] }, size, { fontScale: FS });
      const [tile] = tiles(t);
      const stops = chipsOf(t, action);
      const h = modVal(tile, "size", "height") as number;
      const w = modVal(tile, "size", "width") as number;
      const pad = modVal(tile, "paddingAll", "all") as number;
      // Tout tient dans la tuile, avec ou sans bouton.
      expect(kids(tile).reduce((s, c) => s + hOf(c, FS), 0) + 2 * pad).toBeLessThanOrEqual(h);
      if (!stops.length) return;
      expect(stops).toHaveLength(1);
      expect(heightOf(stops[0])).toBeGreaterThanOrEqual(32);
      expect(descOf(stops[0])).toBe(say);
      expect(urlOf(stops[0])).toContain(`widget=${action}`);
      expect(urlOf(stops[0])).toContain(`&k=${KEY}`);
      const line = kids(tile).find((c) => c.type === "Row" && chipsOf(c, action).length) as Node;
      const [chronoBox, , chip] = kids(line);
      expect(chip).toBe(stops[0]);
      // Même ligne que le chrono, largeur : chrono + écart + bouton dans la tuile.
      expect(kids(chronoBox).some((c) => ["ElapsedClockView", "ChronometerView"].includes(c.type) || natives(c).length > 0)).toBe(true);
      expect(wOf(chronoBox) + 6 + wOf(chip) + 2 * pad).toBeLessThanOrEqual(w);
      expect(wOf(chip)).toBeGreaterThanOrEqual(24);
      for (const n of natives(line)) expect(nativeSp(n)).toBeGreaterThanOrEqual(10);
    });

    it("deux sessions : « ■ » compact par ligne s'il tient (24 × 32 au moins), sinon aucun", () => {
      const t = tree({ lives: lives2() }, size, { fontScale: FS });
      const rows = tiles(t);
      expect(rows).toHaveLength(2);
      const stops = [...chipsOf(t, "sleep-stop"), ...chipsOf(t, "walk-stop")];
      expect([0, 2]).toContain(stops.length);
      for (const c of stops) {
        expect(heightOf(c)).toBeGreaterThanOrEqual(32);
        expect(urlOf(c)).toContain(`&k=${KEY}`);
      }
      for (const r of rows) {
        const h = modVal(r, "size", "height") as number;
        const w = modVal(r, "size", "width") as number;
        const pv = (r.props.modifiers as unknown as Record<string, unknown>[]).find((m) => m.$type === "padding") as unknown as Record<string, number>;
        // Ligne trop basse : version compacte (Row), la hauteur est alors le maximum des enfants.
        const used = r.type === "Row" ? Math.max(0, ...kids(r).map((c) => hOf(c, FS))) : kids(r).reduce((s, c) => s + hOf(c, FS), 0);
        expect(used + (pv.top ?? 0) + (pv.bottom ?? 0)).toBeLessThanOrEqual(h);
        const line = kids(r).find((c) => c.type === "Row" && chipsOf(c, "-stop").length > 0);
        if (line) {
          const [, , chip] = kids(line);
          expect(r.type).toBe("Column");
          expect(wOf(chip) || 16 + Math.ceil(10 * FS)).toBeGreaterThanOrEqual(24);
          expect(wOf(kids(line)[0]) + 6 + (16 + Math.ceil(10 * FS)) + 20).toBeLessThanOrEqual(w);
        }
      }
    });
  });

  it("2×2 : le bouton existe bien aux tailles courantes (160 × 160, une session et deux sessions)", () => {
    expect(chipsOf(tree({ lives: [napLive(NOW - H)] }, { widthDp: 160, heightDp: 160 }), "sleep-stop")).toHaveLength(1);
    expect(chipsOf(tree({ lives: [walkLive(NOW - H)] }, { widthDp: 110, heightDp: 110 }), "walk-stop")).toHaveLength(1);
    expect(chipsOf(tree({ lives: [nursingLive(NOW - H)] }, { widthDp: 160, heightDp: 160 }), "nursing-stop")).toHaveLength(1);
    const two = tree({ lives: lives2() }, { widthDp: 160, heightDp: 160 });
    expect(chipsOf(two, "sleep-stop")).toHaveLength(1);
    expect(chipsOf(two, "walk-stop")).toHaveLength(1);
  });

  it("2×2 : Proche (lecture seule) n'a aucun bouton d'arrêt", () => {
    for (const lives of [[napLive(NOW - H)], lives2()]) {
      expect(chipsOf(tree({ lives, canWrite: false }, { widthDp: 160, heightDp: 160 }), "-stop")).toHaveLength(0);
    }
  });

  it("bande du 2×2 : emoji + nombre, plus d'abréviation ; descriptions inchangées", () => {
    const t = tree({}, { widthDp: 160, heightDp: 160 });
    const d = dumpWidget(t);
    expect(d.texts).toEqual(expect.arrayContaining(["🍼", "3", "💧", "2", "🌙", "1h35"]));
    const text = allText(d);
    for (const old of ["rep.", "ch.", "dodo"]) expect(text).not.toContain(old);
    expect(d.a11y).toEqual(expect.arrayContaining(["3 repas", "2 changes", "1 heure et 35 minutes de sommeil"]));
  });

  it("bande du 2×2 : rappel dépassé, nombre en rouge et description dite", () => {
    const t = tree({ alerts: { mealAtMs: NOW - 60_000 }, lives: [] }, { widthDp: 160, heightDp: 160 });
    // Au repos la bande ne garde le rouge que pendant une session ; avec session :
    const running = tree({ alerts: { mealAtMs: NOW - 60_000, diaperAtMs: NOW - 60_000 }, lives: [walkLive(NOW - H)] }, { widthDp: 160, heightDp: 160 });
    const d = dumpWidget(running);
    expect(d.a11y).toEqual(expect.arrayContaining(["3 repas, rappel dépassé", "2 changes, rappel dépassé"]));
    const reds = walk(running).filter((n) => n.type === "Text" && (n.props as unknown as { color?: string }).color === "#b91c1c");
    expect(reds.map((n) => (n.props as unknown as { children: string }).children)).toEqual(expect.arrayContaining(["3", "2"]));
    expect(dumpWidget(t).a11y).not.toContain("3 repas, rappel dépassé");
  });

  it("bande du 2×2 : les trois cellules tiennent dans la largeur intérieure", () => {
    for (const FS of [1, 1.5, 2]) {
      for (const dp of [130, 160, 200]) {
        const t = tree({ day: { mealsCount: 12, bottleMl: 0, lastMealMs: NOW - H, diapersCount: 10, lastDiaperMs: NOW - H, sleepMinutes: 755 } }, { widthDp: dp, heightDp: 160 }, { fontScale: FS });
        const cells = walk(t).filter((n) => n.type === "Row" && ["repas", "changes", "sommeil"].some((w) => (descOf(n) ?? "").includes(w)) && wOf(n) > 0 && kids(n).length === 3);
        if (!cells.length) continue;
        const gaps = walk(t).filter((n) => n.type === "Spacer" && wOf(n) > 0 && wOf(n) !== 4 && wOf(n) !== 6 && wOf(n) !== 8 && wOf(n) <= 16);
        void gaps;
        expect(cells.reduce((s, c) => s + wOf(c), 0)).toBeLessThanOrEqual(dp - 24);
      }
    }
  });
});
