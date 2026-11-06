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

type FullTip = SeedTip & { sourceUrl?: string };
const bodyOf = (id: string) => (byId(id) as FullTip).body;

describe("tips_seed.json - revue sécurité clinique", () => {
  it("H2 fiche fièvre : titre « Appelez le 15 sans attendre si : » et signes complétés", () => {
    const b = bodyOf("sante_fievre_guide");
    expect(b).toContain("## Appelez le 15 sans attendre si :");
    expect(b).toContain("Peau pâle, grise ou marbrée");
    expect(b).toMatch(/Bébé mou, très difficile à réveiller ou qui gémit/);
    expect(b).toContain("Fontanelle bombée ou nuque raide");
    expect(b).toContain("Signes de déshydratation (moins de couches mouillées, refus de boire)");
    expect(b).not.toContain("## Signes qui doivent alerter");
  });

  it("H2 fiche fièvre : chaque palier d'âge dit d'appeler le 15 si un signe apparaît", () => {
    const lines = bodyOf("sante_fievre_guide").split("\n");
    for (const prefix of ["- **Moins de 3 mois**", "- **De 3 à 6 mois**", "- **Après 6 mois**"]) {
      const line = lines.find((l) => l.startsWith(prefix))!;
      expect(line).toMatch(/si un des signes ci-dessous apparaît, appelez le 15/);
    }
  });

  it("H4 plus de tissu / doudou dans le lit (moins de 12 mois)", () => {
    expect(bodyOf("dev_eveil_sensoriel")).not.toContain("Un tissu avec votre odeur dans le lit");
    const reg = bodyOf("sommeil_regression_8mois");
    expect(reg).not.toMatch(/doudou, tissu avec votre odeur|Objet transitionnel/);
    expect(reg).toMatch(/espace de couchage vide/);
  });

  it("M11 vitamine D : 400 à 800 UI par jour de 0 à 18 mois, source citée", () => {
    const t = byId("sante_vitamine_d");
    expect(t.body).toContain("400 à 800 UI");
    expect(t.body).not.toMatch(/1000-1200|600-800/);
    expect(t.source).toMatch(/consensus.*2022/i);
  });

  it("M11 post-vaccination : plus de calendrier détaillé, renvoi au carnet de santé", () => {
    const b = bodyOf("sante_post_vaccination");
    expect(b).not.toMatch(/Méningocoque C|2 mois|5 mois|11 mois/);
    expect(b).toContain("carnet de santé");
  });

  it("M11 diversification : Santé publique France 2021, tous les groupes d'aliments entre 4 et 6 mois", () => {
    const t = byId("alim_diversification_debut");
    expect(t.source).toMatch(/Santé publique France.*2021/);
    expect(t.body).toMatch(/entre 4 et 6 mois/);
    expect(t.body).toMatch(/tous les groupes d'aliments/);
    expect(t.body).not.toMatch(/L'OMS recommande|Sans gluten avant 7 mois/);
  });

  it("M11 conservation du lait : 48 h au réfrigérateur (ameli)", () => {
    const t = byId("alim_conservation_lait");
    expect(t.body).toContain("48 heures");
    expect(t.body).not.toContain("4 jours");
    expect(t.source).toMatch(/ameli/);
  });

  it("M11 biberon : la stérilisation n'est pas obligatoire, lavage soigneux", () => {
    const b = bodyOf("alim_biberon_preparation");
    expect(b).not.toMatch(/Obligatoire avant 4 mois|Recommandée jusqu'à 6 mois/);
    expect(b).toMatch(/stérilisation n'est pas obligatoire/);
    expect(b).toMatch(/lavage soigneux/);
  });

  it("M11 eau : les boissons végétales ne conviennent pas aux nourrissons", () => {
    expect(bodyOf("alim_eau_hydratation")).toMatch(/boissons végétales[^\n]*ne conviennent pas aux nourrissons/i);
  });

  it("M11 baby blues : 3114", () => {
    expect(bodyOf("bienetre_baby_blues")).toContain("3114");
  });

  it("M11 tummy time : toujours éveillé et sous surveillance", () => {
    expect(bodyOf("dev_tummy_time")).toContain("toujours éveillé et sous surveillance");
  });

  it("aucune fiche ne donne de dose de médicament ou de supplément chiffrée hors vitamine D", () => {
    const all = JSON.stringify(tips);
    expect(all).not.toMatch(/\d+\s*mg\/kg|\d+\s*ml de (sirop|paracétamol)/i);
  });
});

