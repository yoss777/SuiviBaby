// Garde-fou (WCAG 1.4.3) : `error` (#ef4444, 3.8:1 sur blanc) est réservé aux
// icônes, bordures et aplats. Le texte doit utiliser `errorText` (≥ 4.5:1).
// Repère les styles de texte en ligne du type `{ color: nc.error }`.
import fs from "fs";
import path from "path";

const ROOTS = ["app", "components"];
const PATTERNS = [
  /\{\s*color:\s*(nc|neutral|neutralColors|colors)\.error\s*[,}]/,
  /color:\s*(nc|neutral|neutralColors|colors)\.error,\s*\n\s*fontWeight/,
];

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "backups" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("couleur d'erreur dans les textes", () => {
  it("aucun style de texte n'utilise `error` au lieu de `errorText`", () => {
    const root = path.resolve(__dirname, "..");
    const offenders: string[] = [];
    for (const r of ROOTS) {
      for (const file of walk(path.join(root, r), [])) {
        const src = fs.readFileSync(file, "utf8");
        for (const re of PATTERNS) {
          const m = re.exec(src);
          if (m) {
            const line = src.slice(0, m.index).split("\n").length;
            offenders.push(`${path.relative(root, file)}:${line}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
