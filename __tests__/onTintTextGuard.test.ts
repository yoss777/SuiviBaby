// Garde-fou (WCAG 1.4.3, audit P0-1/P0-2) : en sombre, le blanc ne fait que
// 2.54:1 sur `tint` (#60a5fa) et 2.98:1 sur `todayAccent` (#818cf8) ; sur les
// couleurs de catégorie (corail, teal, doré…), il tombe entre 1.8 et 3.5:1.
// Un texte ou une icône posé sur un de ces aplats utilise
// `Colors[scheme].onTint`, `nc.onTodayAccent`, `getAccentColors(…).filledText`
// (ou getReadableTextColor), jamais du blanc en dur.
import fs from "fs";
import path from "path";

import { neutralColors, neutralColorsDark } from "@/constants/dashboardColors";
import { Colors, contrastRatio, getReadableTextColor } from "@/constants/theme";

const root = path.resolve(__dirname, "..");
// Tout le code d'interface, formulaires compris (components/forms : pied
// collant « Ajouter », AllergiesEditor).
const ROOTS = ["app", "components", "contexts"];

/** Aplats pleins d'accent : tint, todayAccent, couleurs d'événement/catégorie. */
const SOLID_ACCENT =
  /\b(tint|tintColor|todayAccent|filledBg|accent|accentColor|routineAccent|ONBOARDING_ACCENT)\b|eventColors\.\w+\.dark\b|eventColors\[[^\]]+\]\.dark\b|itemColors\.\w+\b|categoryColors\w*\.\w+\.primary\b|\.primary\b/;
/** Aplats translucides (`tint + "15"`, `${c}20`, getBackgroundTint, withAlpha…). */
const TRANSLUCENT = /\+\s*["'`]|\$\{|Tint\(|withAlpha\(|softBg|\bbg\b/;
const WHITE_TOKEN =
  /(nc\.white|neutralColors\.white|["'](#fff|#FFF|#ffffff|#FFFFFF|white)["'])/;
/** Propriété `color` (texte ou icône), y compris dans un ternaire. */
const COLOR_PROP = /(^|[^A-Za-z])color\s*[=:]/;
const WINDOW = 14;

/**
 * Une ligne `backgroundColor: …` pose-t-elle un aplat d'accent plein ? Les
 * ternaires sont découpés : il suffit qu'une branche soit un accent plein
 * (`checked ? accent : nc.backgroundPressed` est un aplat quand `checked`).
 */
function isSolidAccentFill(line: string): boolean {
  const m = line.match(/backgroundColor\s*[:=]\s*\{?\s*(.*)$/);
  if (!m) return false;
  return m[1]
    .split(/\?|(?<![a-zA-Z"'])\s:\s/)
    .some((branch) => SOLID_ACCENT.test(branch) && !TRANSLUCENT.test(branch));
}

function isHardcodedWhiteText(line: string): boolean {
  if (/backgroundColor|borderColor|shadowColor/.test(line)) return false;
  const m = line.match(COLOR_PROP);
  if (!m || m.index === undefined) return false;
  return WHITE_TOKEN.test(line.slice(m.index));
}

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("texte posé sur un aplat tint / todayAccent / catégorie", () => {
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

  it("détecte les aplats pleins, ternaires compris, et ignore les translucides", () => {
    expect(isSolidAccentFill("{ backgroundColor: accentColors.filledBg },")).toBe(true);
    expect(isSolidAccentFill("backgroundColor: checked ? nc.todayAccent : nc.backgroundPressed,")).toBe(true);
    expect(isSolidAccentFill("backgroundColor: eventColors.jalon.dark,")).toBe(true);
    expect(isSolidAccentFill("backgroundColor: on ? itemColors.biberon : nc.border,")).toBe(true);
    expect(isSolidAccentFill('backgroundColor: checked ? nc.todayAccent + "20" : nc.backgroundPressed,')).toBe(false);
    expect(isSolidAccentFill("backgroundColor: `${eventColors.meal.dark}15`,")).toBe(false);
    expect(isSolidAccentFill("backgroundColor: accentColors.softBg,")).toBe(false);
    expect(isSolidAccentFill("backgroundColor: nc.backgroundCard,")).toBe(false);

    expect(isHardcodedWhiteText("color: nc.white,")).toBe(true);
    expect(isHardcodedWhiteText('color={selected ? "#fff" : nc.textStrong}')).toBe(true);
    expect(isHardcodedWhiteText("color: accentColors.filledText,")).toBe(false);
    expect(isHardcodedWhiteText("borderColor: nc.white,")).toBe(false);
  });

  it("aucun blanc en dur dans les quelques lignes qui suivent un aplat d'accent plein", () => {
    const offenders: string[] = [];
    for (const r of ROOTS) {
      for (const file of walk(path.join(root, r), [])) {
        const lines = fs.readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!isSolidAccentFill(line)) return;
          for (let j = i + 1; j < Math.min(lines.length, i + 1 + WINDOW); j++) {
            if (/backgroundColor/.test(lines[j])) break;
            if (isHardcodedWhiteText(lines[j])) {
              offenders.push(`${path.relative(root, file)}:${j + 1}`);
            }
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
