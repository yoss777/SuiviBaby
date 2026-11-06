import tips from "@/data/tips_seed.json";

type SeedTip = { id: string; title: string; summary: string; body: string; category: string; source?: string };
const all = tips as SeedTip[];
const byId = (id: string) => all.find((t) => t.id === id)!;
const text = (t: SeedTip) => `${t.title}\n${t.summary}\n${t.body}`;

describe("tips_seed.json - sécurité santé (S5)", () => {
  it("les identifiants sont uniques", () => {
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
  });

  it("fiche fièvre : règle des moins de 3 mois et « appelez le 15 »", () => {
    const t = text(byId("sante_fievre_guide"));
    expect(t).toMatch(/Moins de 3 mois.*consultez en urgence un médecin ou appelez le 15/);
    expect(t).toMatch(/De 3 à 6 mois.*consultez rapidement un médecin/);
    expect(t).toContain("Éruption qui ne s'efface pas à la pression");
    expect(t).toContain("Convulsions");
  });

  it("fiche fièvre : ne contient plus de seuils élevés (39/40 °C) ni de dosage", () => {
    const t = text(byId("sante_fievre_guide"));
    expect(t).not.toMatch(/39\s*°?C|40\s*°?C|ibuprof|parac/i);
  });

  it("fiche cododo : même chambre, lit séparé, au moins jusqu'à 6 mois, pas de lit partagé", () => {
    const t = byId("sommeil_cododo_securite");
    expect(t.body).toContain("dans la chambre des parents, dans son propre lit");
    expect(t.body).toContain("au minimum jusqu'à ses 6 mois");
    expect(t.body).toContain("Pas de partage du lit");
    expect(t.source).toBe("Santé publique France");
    expect(text(t)).not.toMatch(/partager le lit|dans le lit des parents|Matelas ferme et plat, pas de canapé/);
  });

  it("fiche eau : aucune marque, mention d'étiquette pour les biberons", () => {
    const t = byId("alim_eau_hydratation");
    expect(JSON.stringify(all)).not.toMatch(/Évry|Évian|Volvic|Roucous/);
    expect(t.body).toContain("une eau adaptée à la préparation des biberons (mention sur l'étiquette)");
  });

  it("fiche cododo visible jusqu'à 12 mois", () => {
    expect((byId("sommeil_cododo_securite") as unknown as { ageMaxMonths: number }).ageMaxMonths).toBe(12);
  });

  it("fiche DME : sécurité sans rassurance, assis droit, surveillance, formation aux premiers secours", () => {
    const t = byId("alim_blw_introduction");
    expect(t.body).not.toMatch(/haut-le-c|normal|gag/i);
    expect(t.body).toContain("assis bien droit");
    expect(t.body).toContain("Toujours surveiller");
    expect(t.body).toMatch(/formation aux premiers secours/);
    expect(t.body).toContain("appelez le 15");
  });

  it("aucune fiche santé ne rassure (« normal », « parfait », « pas grave »)", () => {
    for (const t of all.filter((x) => x.category === "sante")) {
      expect({ id: t.id, hit: /normal|parfait|pas grave|rassur|sans danger/i.test(text(t)) }).toEqual({
        id: t.id,
        hit: false,
      });
    }
  });
});
