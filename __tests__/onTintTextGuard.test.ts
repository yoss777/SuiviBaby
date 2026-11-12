// Garde-fou (WCAG 1.4.3, audit P0-1/P0-2) : en sombre, le blanc ne fait que
// 2.54:1 sur `tint` (#60a5fa) et 2.98:1 sur `todayAccent` (#818cf8). Un texte
// ou une icône posé sur un de ces aplats utilise `Colors[scheme].onTint` /
// `nc.onTodayAccent` (ou getReadableTextColor), jamais du blanc en dur.
import fs from "fs";
import path from "path";

import { neutralColors, neutralColorsDark } from "@/constants/dashboardColors";
import { Colors, contrastRatio, getReadableTextColor } from "@/constants/theme";

const root = path.resolve(__dirname, "..");
// Les formulaires (components/forms) sont couverts par leur propre chantier.
const ROOTS = [
  "app",
  "components/ui",
  "components/suivibaby",
  "components/eventList",
  "components/moments",
  "components/drawer",
  "contexts",
];
const FILL = /backgroundColor:\s*[^,}\n]*\b(tint|tintColor|todayAccent)\b/;
// Aplats translucides (`tint + "15"`, getBackgroundTint…) : pas un aplat plein.
const NOT_SOLID = /\+ ?["'`]|Tint\(|\$\{|\? /;
const WHITE = /(color[=:]\s*\{?\s*)(nc\.white|neutralColors\.white|"#fff"|'#fff'|"#ffffff"|'#ffffff'|"white"|'white')/;
const WINDOW = 14;

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("texte posé sur un aplat tint / todayAccent", () => {
  it("les tokens on* sont lisibles (>= 4.5:1) en clair et en sombre", () => {
    for (const scheme of ["light", "dark"] as const) {
      expect(contrastRatio(Colors[scheme].onTint, Colors[scheme].tint)).toBeGreaterThanOrEqual(4.5);
    }
    for (const nc of [neutralColors, neutralColorsDark]) {
      expect(contrastRatio(nc.onTodayAccent, nc.todayAccent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(nc.onDestructive, nc.destructive)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("getReadableTextColor choisit la couleur la plus contrastée", () => {
    expect(getReadableTextColor(Colors.dark.tint)).toBe("#111827");
    expect(getReadableTextColor(Colors.light.tint)).toBe("#ffffff");
    expect(getReadableTextColor(neutralColors.success)).toBe("#111827");
    expect(getReadableTextColor("#dc3545")).toBe("#ffffff");
    expect(getReadableTextColor("not-a-color", "#000000")).toBe("#000000");
  });

  it("aucun blanc en dur dans les quelques lignes qui suivent un aplat tint/todayAccent", () => {
    const offenders: string[] = [];
    for (const r of ROOTS) {
      for (const file of walk(path.join(root, r), [])) {
        const lines = fs.readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!FILL.test(line) || NOT_SOLID.test(line)) return;
          for (let j = i + 1; j < Math.min(lines.length, i + 1 + WINDOW); j++) {
            if (/backgroundColor/.test(lines[j])) continue;
            if (WHITE.test(lines[j])) {
              offenders.push(`${path.relative(root, file)}:${j + 1}`);
            }
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
