// Les sous-écrans de Plus vivent dans le groupe (tabs) pour garder la barre
// d'onglets (et sa marge au-dessus des boutons Android). Retour 1.0.13 :
// Galerie et Gestion des accès étaient dans la pile, sans barre du bas.
// Dans un onglet, router.back() suit l'historique des onglets (Accueil) :
// ces écrans reviennent explicitement à leur écran d'origine.
import fs from "fs";
import path from "path";

const TABS = path.join(__dirname, "..", "app", "(drawer)", "baby", "(tabs)");
const read = (name: string) =>
  fs.readFileSync(path.join(TABS, name), "utf8").replace(/\/\/.*$/gm, "");

describe("sous-écrans de Plus dans les onglets", () => {
  it.each(["gallery", "manage-access"])("%s est un onglet caché", (name) => {
    expect(fs.existsSync(path.join(TABS, `${name}.tsx`))).toBe(true);
    expect(read("_layout.tsx")).toMatch(
      new RegExp(`name="${name}"\\s*options={hiddenTabOptions}`),
    );
  });

  it.each(["gallery.tsx", "manage-access.tsx"])("%s n'utilise pas router.back()", (file) => {
    expect(read(file)).not.toMatch(/router\.back\(\)/);
  });

  it("la galerie revient à Plus ou à Moments selon returnTo", () => {
    expect(read("gallery.tsx")).toMatch(
      /returnTarget === "plus" \? "\/baby\/plus" : "\/baby\/moments"/,
    );
    expect(fs.readFileSync(path.join(__dirname, "..", "hooks", "useMomentsActions.ts"), "utf8"))
      .toContain('"/baby/gallery?returnTo=moments"');
  });
});
