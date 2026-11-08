// Garde-fou expo-router 58 : `href: null` sur un écran d'onglets le marque
// « hidden » et toute navigation vers lui est redirigée vers l'onglet initial
// (les sous-écrans de Plus renvoyaient vers l'Accueil, TestFlight 1.0.13).
// Un onglet caché mais navigable s'écrit avec `tabBarButton: () => null`.
import fs from "fs";
import path from "path";

function layoutFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return layoutFiles(full);
    return entry.name === "_layout.tsx" ? [full] : [];
  });
}

describe("onglets cachés", () => {
  it.each(layoutFiles(path.join(__dirname, "..", "app")))("%s n'utilise pas href: null", (file) => {
    const code = fs.readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/href:\s*[^,}\n]*null/);
  });
});
