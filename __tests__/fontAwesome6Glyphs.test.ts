/**
 * @jest-environment node
 */
// Garde-fou FontAwesome 6 : tout nom d'icône écrit en dur (littéral, ou
// branche littérale d'un ternaire / d'un `??`) sur un composant FontAwesome6
// doit exister dans la police FA6 livrée, sinon l'icône s'affiche en « ? ».
// Un nom présent dans la glyph map mais absent des métadonnées (alias FA5
// comme `calendar-alt`) ne suffit pas : il retombe sur la famille regular et
// peut ne rien rendre. Le prop `solid` exige une variante pleine.
// Et plus aucun import FontAwesome 5.
import fs from "fs";
import path from "path";
import type * as TS from "typescript";

// Globals paresseux d'Expo (winter, SDK 58) : les résoudre pendant le
// chargement du module, sinon TypeScript les touche plus tard et Jest refuse
// le require « hors du test » (cf. eslintDataLayer.test.ts).
for (const name of ["__ExpoImportMetaRegistry", "structuredClone", "URL", "URLSearchParams", "TextDecoderStream", "TextEncoderStream", "DOMException", "fetch"]) {
  void (globalThis as Record<string, unknown>)[name];
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ts: typeof TS = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const GLYPHMAPS = path.join(
  ROOT,
  "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps",
);
const glyphMap: Record<string, number> = JSON.parse(
  fs.readFileSync(path.join(GLYPHMAPS, "FontAwesome6Free.json"), "utf8"),
);
const meta: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(GLYPHMAPS, "FontAwesome6Free_meta.json"), "utf8"),
);
const families = Object.fromEntries(
  Object.entries(meta).map(([family, names]) => [family, new Set(names)]),
);

const SCAN_DIRS = ["app", "components"];
const NO_FA5_DIRS = ["app", "components", "hooks", "constants", "contexts", "services", "utils"];

function listSources(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSources(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Littéraux qu'une expression `name` peut produire (branches, pas opérandes de test). */
function literalNames(expr: TS.Expression): string[] {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return literalNames(expr.expression);
  }
  if (ts.isConditionalExpression(expr)) {
    return [...literalNames(expr.whenTrue), ...literalNames(expr.whenFalse)];
  }
  if (
    ts.isBinaryExpression(expr) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expr.operatorToken.kind)
  ) {
    return [...literalNames(expr.left), ...literalNames(expr.right)];
  }
  return [];
}

type Usage = { file: string; line: number; name: string; style: "solid" | "brand" | null };

function collectUsages(file: string): Usage[] {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tags = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const mod = (stmt.moduleSpecifier as TS.StringLiteral).text;
    const clause = stmt.importClause;
    if (mod === "@expo/vector-icons/FontAwesome6" && clause.name) tags.add(clause.name.text);
    if (mod === "@expo/vector-icons" && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        if ((el.propertyName ?? el.name).text === "FontAwesome6") tags.add(el.name.text);
      }
    }
  }
  if (!tags.size) return [];
  const usages: Usage[] = [];
  const visit = (node: TS.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      tags.has(node.tagName.text)
    ) {
      let style: Usage["style"] = null;
      let nameExpr: TS.Expression | undefined;
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
        const key = attr.name.text;
        const on =
          !attr.initializer ||
          (ts.isJsxExpression(attr.initializer) &&
            attr.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword);
        if ((key === "solid" || key === "brand") && on) style = key;
        if (key === "name" && attr.initializer) {
          if (ts.isStringLiteral(attr.initializer)) nameExpr = attr.initializer;
          else if (ts.isJsxExpression(attr.initializer)) nameExpr = attr.initializer.expression;
        }
      }
      if (nameExpr) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        for (const name of literalNames(nameExpr)) usages.push({ file, line, name, style });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return usages;
}

describe("FontAwesome 6", () => {
  const usages = SCAN_DIRS.flatMap(listSources).flatMap(collectUsages);

  it("scanne bien des usages FA6", () => {
    expect(usages.length).toBeGreaterThan(50);
  });

  it("chaque nom littéral existe dans la police FA6 (et dans la variante demandée)", () => {
    const invalid = usages
      .filter(({ name, style }) => {
        if (!(name in glyphMap)) return true;
        if (style === "solid") return !families.solid.has(name);
        if (style === "brand") return !families.brands.has(name);
        return !Object.values(families).some((set) => set.has(name));
      })
      .map(({ file, line, name, style }) => `${file}:${line} ${name}${style ? ` (${style})` : ""}`);
    expect(invalid).toEqual([]);
  });

  it("aucun import FontAwesome 5 ne subsiste", () => {
    const offenders = NO_FA5_DIRS.flatMap(listSources).filter((file) => {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      return (
        /["']@expo\/vector-icons\/FontAwesome5["']/.test(text) ||
        /import\s*\{[^}]*\bFontAwesome5\b[^}]*\}\s*from\s*["']@expo\/vector-icons["']/.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });
});
