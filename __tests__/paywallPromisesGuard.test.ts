// Garde-fou : le paywall ne promet pas une fonctionnalité absente (pratique
// commerciale trompeuse, rejet App Store 3.1.2). « Insights IA » a été retiré
// le 2026-11-09 : la Cloud Function generateAiInsight n'existe pas.
// Voir docs/PREMIUM_OFFRE_CIBLE.md avant de remettre une ligne.
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("promesses du paywall", () => {
  it("n'annonce pas Insights IA tant que generateAiInsight n'existe pas", () => {
    const functionsCode = ["functions/index.js", "functions/src"]
      .filter((p) => fs.existsSync(path.join(root, p)))
      .map((p) => {
        const full = path.join(root, p);
        if (fs.statSync(full).isFile()) return read(p);
        const walk = (dir: string): string[] =>
          fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".js") ? [fs.readFileSync(path.join(dir, e.name), "utf8")] : [],
          );
        return walk(full).join("\n");
      })
      .join("\n");
    const implemented = /exports\.generateAiInsight|generateAiInsight\s*=/.test(functionsCode);
    if (!implemented) {
      expect(read("app/settings/premium.tsx")).not.toMatch(/Insights IA/i);
    }
  });
});
