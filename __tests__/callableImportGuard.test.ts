// 1.0.28 : tous les appels de fonctions passent par config/callable.ts, qui attend
// App Check. Un import direct de firebase/functions partirait sans attendre le
// premier jeton et serait refusé une fois App Check imposé (ADR 0002).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const DIRS = ["services", "hooks", "app", "components", "utils", "contexts"];
// Seule exception : revokeDeviceToken est exclue d'App Check et ne doit pas
// retarder la déconnexion.
const ALLOWED = ["services/pushTokenService.ts"];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "__tests__") walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("appels de fonctions : toujours via config/callable", () => {
  it("aucun import de httpsCallable depuis firebase/functions hors exception", () => {
    const offenders = DIRS.flatMap((d) => walk(path.join(ROOT, d)))
      .filter((f) => /import\s*{[^}]*\bhttpsCallable\b[^}]*}\s*from\s*["']firebase\/functions["']/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .sort();
    expect(offenders).toEqual(ALLOWED);
  });
});
