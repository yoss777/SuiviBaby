import { generateInsights } from "@/services/insightEngine";
import { generateCorrelations } from "@/services/correlationService";

const now = new Date(2026, 5, 15, 12, 0);
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

const temp = (valeur: number, daysBack = 1, id = `t${valeur}-${daysBack}`) => ({
  id,
  type: "temperature" as const,
  date: day(daysBack),
  valeur,
});

const nap = (location: string, quality: "paisible" | "agite" | "mauvais", i: number) => ({
  id: `s${location}${i}`,
  type: "sommeil" as const,
  date: day(1 + (i % 5)),
  location,
  quality,
  isNap: true,
  duree: 60,
});

const isTempInsight = (i: { title: string }) => /Fièvre|Température/.test(i.title);

const run = (events: any[], birthDate: Date | null, ageMonths = 2) =>
  generateInsights({ events, babyName: "Léa", ageMonths, birthDate, now });

describe("5.2 insight fièvre selon l'âge", () => {
  it("moins de 3 mois : insight non masquable, priorité maximale, 15", () => {
    const birth = new Date(now.getTime() - 40 * 86_400_000);
    const ins = run([temp(38.4)], birth).find((i) => isTempInsight(i))!;
    expect(ins).toBeDefined();
    expect(ins.dismissible).toBe(false);
    expect(ins.priority).toBe(0);
    expect(ins.message).toContain("appelez le 15");
  });

  it("l'âge est celui de la mesure, pas celui d'aujourd'hui", () => {
    // 87 jours le jour de la mesure (il y a 5 j), 92 jours aujourd'hui.
    const birth = new Date(now.getTime() - 92 * 86_400_000);
    const ins = run([temp(38.4, 5)], birth, 3).find((i) => isTempInsight(i))!;
    expect(ins.dismissible).toBe(false);
  });

  it("3 à 6 mois : consultation rapide, masquable", () => {
    const birth = new Date(now.getTime() - 120 * 86_400_000);
    const ins = run([temp(38.4)], birth, 4).find((i) => isTempInsight(i))!;
    expect(ins.message).toContain("consultez rapidement un médecin");
    expect(ins.dismissible).not.toBe(false);
  });

  it("sans date de naissance : message générique, jamais rassurant", () => {
    const ins = run([temp(38.4)], null, 0).find((i) => isTempInsight(i))!;
    expect(ins.message).toContain("moins de 3 mois");
    expect(ins.message.toLowerCase()).not.toMatch(/normal|rassur/);
  });

  it("température < 36 °C : insight hypothermie", () => {
    const birth = new Date(now.getTime() - 400 * 86_400_000);
    const ins = run([temp(35.8)], birth, 13).find((i) => isTempInsight(i))!;
    expect(ins.message).toMatch(/médecin ou le 15/);
  });

  it("aucune alerte pour 37,9 °C", () => {
    const birth = new Date(now.getTime() - 40 * 86_400_000);
    expect(run([temp(37.9)], birth).some((i) => isTempInsight(i))).toBe(false);
  });

  it("prend la situation la plus grave de la semaine", () => {
    const birth = new Date(now.getTime() - 40 * 86_400_000);
    const list = run([temp(38.1, 5), temp(39.2, 1)], birth).filter((i) => isTempInsight(i));
    expect(list).toHaveLength(1);
    expect(list[0].message).toContain("39.2");
  });

  it("ignore une température hors de la fenêtre de 7 jours", () => {
    const birth = new Date(now.getTime() - 40 * 86_400_000);
    expect(run([temp(39, 9)], birth).some((i) => isTempInsight(i))).toBe(false);
  });
});

describe("5.4 meilleur endroit pour dormir", () => {
  const birth = new Date(now.getTime() - 200 * 86_400_000);
  const base = (loc: string) => [
    nap(loc, "paisible", 0), nap(loc, "paisible", 1),
    nap("lit", "agite", 2), nap("lit", "agite", 3), nap("lit", "agite", 4),
  ];

  it("ne recommande jamais cododo, poussette ou voiture", () => {
    for (const loc of ["cododo", "poussette", "voiture", "autre"]) {
      const all = run(base(loc), birth, 6);
      const best = all.find((i) => i.title === "Meilleur endroit");
      if (best) expect(best.message).not.toMatch(/cododo|poussette|voiture|ailleurs/);
    }
  });

  it("recommande uniquement le lit à barreaux ou berceau, sur le dos, espace vide", () => {
    const birth2 = birth;
    const events = [
      nap("lit", "paisible", 0), nap("lit", "paisible", 1), nap("lit", "paisible", 2),
      nap("voiture", "agite", 3), nap("voiture", "agite", 4),
    ];
    const best = run(events, birth2, 6).find((i) => i.title === "Meilleur endroit")!;
    expect(best.message).toMatch(/lit à barreaux|berceau/);
    expect(best.message).toContain("sur le dos");
    expect(best.message).toMatch(/espace de couchage (vide|dégagé)/);
  });

  it("siestes fréquentes en voiture / poussette / écharpe : rappel de couchage sûr", () => {
    const events = [
      nap("voiture", "paisible", 0), nap("poussette", "paisible", 1),
      nap("voiture", "paisible", 2), nap("lit", "agite", 3), nap("lit", "agite", 4),
    ];
    const reminder = run(events, birth, 6).find((i) => i.title === "Couchage sûr")!;
    expect(reminder).toBeDefined();
    expect(reminder.message).toMatch(/dès que possible|dès que vous le pouvez/);
    expect(reminder.message).toContain("lit");
    expect(reminder.message).toContain("sur le dos");
  });

  it("pas de rappel si ces siestes restent rares", () => {
    const events = [
      nap("voiture", "paisible", 0),
      nap("lit", "paisible", 1), nap("lit", "paisible", 2), nap("lit", "paisible", 3), nap("lit", "paisible", 4),
    ];
    expect(run(events, birth, 6).some((i) => i.title === "Couchage sûr")).toBe(false);
  });
});

describe("5.3 pas de rassurance dans les insights et corrélations", () => {
  it("l'insight post-vaccination ne dit pas que c'est normal", () => {
    const birth = new Date(now.getTime() - 200 * 86_400_000);
    const vac = { id: "v", type: "vaccin" as const, date: day(1) };
    const ins = run([vac], birth, 6).find((i) => i.title === "Post-vaccination")!;
    expect(ins.message.toLowerCase()).not.toMatch(/normal|rassur/);
    expect(ins.message).toMatch(/consultez|médecin/);
  });

  it("la corrélation fièvre / appétit ne dit pas « C'est normal »", () => {
    const events: any[] = [];
    for (let d = 1; d <= 20; d++) {
      const fever = d <= 4;
      events.push({ id: `tmp${d}`, type: "temperature", date: day(d), valeur: fever ? 38.6 : 36.8 });
      for (let k = 0; k < (fever ? 2 : 6); k++) {
        events.push({
          id: `b${d}-${k}`, type: "biberon", date: new Date(day(d).getTime() + k * 3_600_000), quantiteMl: 120,
        });
      }
    }
    const out = generateCorrelations({ events, babyName: "Léa", now } as any);
    const c = out.find((x) => x.title === "Fièvre et appétit");
    expect(c).toBeDefined();
    expect(c!.message.toLowerCase()).not.toMatch(/normal|rassur|naturellement/);
    expect(c!.message).toMatch(/médecin|consultez/);
  });
});
