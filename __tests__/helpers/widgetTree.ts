// Rendu d'un widget dans Jest : le plugin Babel d'expo-widgets transforme la
// fonction du widget en code source (exécuté par le moteur du widget, qui
// fournit _jsx, les composants et les modificateurs). On l'exécute ici avec
// les vrais modificateurs d'@expo/ui et des composants-étiquettes, puis on lit
// l'arbre : textes, liens, libellés d'accessibilité.

type El = { type: string; props: Record<string, unknown> };

export function compileWidget(src: string, platform: "ios" | "android"): (props: unknown, env: unknown) => El {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ui = platform === "ios" ? require("@expo/ui/swift-ui") : require("@expo/ui/jetpack-compose");
  const mods = platform === "ios" ? require("@expo/ui/swift-ui/modifiers") : require("@expo/ui/jetpack-compose/modifiers");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const scope: Record<string, unknown> = {};
  for (const k of Object.keys(ui)) scope[k] = k;
  for (const k of Object.keys(mods)) scope[k] = mods[k];
  // Un composant inconnu (non exporté par @expo/ui, renommé) fait échouer le
  // test clairement au lieu d'un nœud « undefined » silencieux.
  const jsx = (type: unknown, props: Record<string, unknown>) => {
    if (type == null) throw new Error("Widget : composant inconnu (non exporté par @expo/ui ?)");
    return { type: typeof type === "string" ? type : String(type), props: props ?? {} };
  };
  Object.assign(scope, { _jsx: jsx, _jsxs: jsx, _Fragment: "Fragment" });
  if (typeof src !== "string") {
    throw new Error("Widget : le plugin expo-widgets ne fournit plus le code source (transformation changée ?)");
  }
  const names = Object.keys(scope).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, `return (${src});`)(...names.map((n) => scope[n])) as (props: unknown, env: unknown) => El;
}

export type WidgetDump = {
  texts: string[];
  links: string[];
  a11y: string[];
  types: string[];
  nativeTimers: number;
  /** accessibilityHint */
  hints: string[];
  /** Traits ajoutés (ex. isHeader) */
  traits: string[];
  /** Nombre d'éléments masqués au lecteur d'écran */
  hidden: number;
  /** Nombre d'accessibilityElement("ignore") */
  ignored: number;
  /** Polices à taille fixe (font({ size }) sans textStyle) : tailles */
  fixedFonts: number[];
  /** Plafonds Dynamic Type (dynamicTypeSize({ max })) */
  typeCaps: string[];
  /** frame({ minHeight }) posés */
  minHeights: number[];
};

function fromModifiers(mods: unknown, acc: WidgetDump) {
  if (!Array.isArray(mods)) return;
  for (const m of mods as Record<string, unknown>[]) {
    if (m.$type === "accessibilityHint") acc.hints.push(String(m.hint));
    if (m.$type === "accessibilityAddTraits") acc.traits.push(...(m.traits as string[]));
    if (m.$type === "accessibilityHidden" && m.hidden) acc.hidden += 1;
    if (m.$type === "accessibilityElement" && m.children === "ignore") acc.ignored += 1;
    if (m.$type === "font" && m.textStyle == null && typeof m.size === "number") acc.fixedFonts.push(m.size);
    if (m.$type === "dynamicTypeSize" && typeof m.max === "string") acc.typeCaps.push(m.max);
    if (m.$type === "frame" && typeof m.minHeight === "number") acc.minHeights.push(m.minHeight);
  }
  const s = JSON.stringify(mods);
  for (const m of s.matchAll(/"(?:label|contentDescription)":"((?:[^"\\]|\\.)*)"/g)) acc.a11y.push(JSON.parse(`"${m[1]}"`));
  for (const m of s.matchAll(/"(?:url)":"((?:[^"\\]|\\.)*)"/g)) acc.links.push(JSON.parse(`"${m[1]}"`));
}

export function dumpWidget(node: unknown, acc: WidgetDump = {
    texts: [], links: [], a11y: [], types: [], nativeTimers: 0,
    hints: [], traits: [], hidden: 0, ignored: 0, fixedFonts: [], typeCaps: [], minHeights: [],
  }): WidgetDump {
  if (node == null || typeof node === "boolean") return acc;
  if (typeof node === "string" || typeof node === "number") {
    acc.texts.push(String(node));
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => dumpWidget(n, acc));
    return acc;
  }
  const el = node as El;
  acc.types.push(el.type);
  const p = el.props ?? {};
  if (typeof p.destination === "string") acc.links.push(p.destination);
  if (typeof p.label === "string") acc.texts.push(p.label);
  if (typeof p.text === "string") acc.texts.push(p.text);
  // Compteur natif d'iOS (Text timerInterval) : défile seul, jamais figé.
  if (p.timerInterval) acc.nativeTimers += 1;
  fromModifiers(p.modifiers, acc);
  dumpWidget(p.children, acc);
  return acc;
}

export const allText = (d: WidgetDump) => d.texts.join(" | ");
