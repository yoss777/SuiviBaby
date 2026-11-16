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
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type: typeof type === "string" ? type : String(type), props: props ?? {} });
  Object.assign(scope, { _jsx: jsx, _jsxs: jsx, _Fragment: "Fragment" });
  const names = Object.keys(scope).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, `return (${src});`)(...names.map((n) => scope[n])) as (props: unknown, env: unknown) => El;
}

export type WidgetDump = { texts: string[]; links: string[]; a11y: string[]; types: string[] };

function fromModifiers(mods: unknown, acc: WidgetDump) {
  if (!Array.isArray(mods)) return;
  const s = JSON.stringify(mods);
  for (const m of s.matchAll(/"(?:label|contentDescription)":"((?:[^"\\]|\\.)*)"/g)) acc.a11y.push(JSON.parse(`"${m[1]}"`));
  for (const m of s.matchAll(/"(?:url)":"((?:[^"\\]|\\.)*)"/g)) acc.links.push(JSON.parse(`"${m[1]}"`));
}

export function dumpWidget(node: unknown, acc: WidgetDump = { texts: [], links: [], a11y: [], types: [] }): WidgetDump {
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
  fromModifiers(p.modifiers, acc);
  dumpWidget(p.children, acc);
  return acc;
}

export const allText = (d: WidgetDump) => d.texts.join(" | ");
