import { generateInsights, generateHealthAlertInsights } from "@/services/insightEngine";
import { generateCorrelations } from "@/services/correlationService";

const now = new Date(2026, 5, 15, 12, 0);
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
const birthDaysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const temp = (valeur: number, daysBack = 1) => ({ id: `t${valeur}-${daysBack}`, type: "temperature" as const, date: day(daysBack), valeur });

describe("M2 alertes santé sans date de naissance", () => {
  it("generateHealthAlertInsights : message d'âge inconnu, non masquable", () => {
    const out = generateHealthAlertInsights({ events: [temp(38.4)], babyName: "Léa", ageMonths: 0, birthDate: null, now });
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("L'âge de l'enfant n'est pas renseigné");
    expect(out[0].dismissible).toBe(false);
  });
  it("température basse également", () => {
    const out = generateHealthAlertInsights({ events: [temp(35.2)], babyName: "Léa", ageMonths: 0, birthDate: undefined, now });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Température basse enregistrée");
  });
  it("ne produit que l'alerte de température (pas les autres insights)", () => {
    const events = [temp(38.4), ...[1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, type: "activite" as const, date: day(i) }))];
    const out = generateHealthAlertInsights({ events, babyName: "Léa", ageMonths: 5, birthDate: birthDaysAgo(150), now });
    expect(out.every((i) => /Température/.test(i.title))).toBe(true);
  });
  it("generateInsights includeHealth:false exclut l'alerte de température", () => {
    const out = generateInsights({ events: [temp(38.4)], babyName: "Léa", ageMonths: 5, birthDate: birthDaysAgo(150), now, includeHealth: false });
    expect(out.some((i) => /Température/.test(i.title))).toBe(false);
  });
});

describe("L4 titres et textes", () => {
  it("« Température élevée enregistrée » remplace « Fièvre détectée »", () => {
    const out = generateInsights({ events: [temp(38.4)], babyName: "Léa", ageMonths: 5, birthDate: birthDaysAgo(150), now });
    expect(out.map((i) => i.title)).toContain("Température élevée enregistrée");
    expect(out.map((i) => i.title)).not.toContain("Fièvre détectée");
  });

  it("Baisse d'appétit : ligne d'orientation", () => {
    const events: any[] = [];
    for (let i = 0; i < 12; i++) events.push({ id: `l${i}`, type: "biberon", date: day(8 + (i % 6)) });
    for (let i = 0; i < 4; i++) events.push({ id: `c${i}`, type: "biberon", date: day(1 + (i % 3)) });
    const ins = generateInsights({ events, babyName: "Léa", ageMonths: 5, birthDate: birthDaysAgo(150), now }).find((i) => i.title === "Baisse d'appétit")!;
    expect(ins.message).toContain("demandez conseil à votre médecin");
  });

  it("Sommeil en baisse : ne prétend plus à une régression", () => {
    const events: any[] = [];
    for (let i = 0; i < 4; i++) events.push({ id: `n${i}`, type: "sommeil", date: day(1 + i), duree: 60, quality: "paisible" });
    for (let i = 0; i < 4; i++) events.push({ id: `p${i}`, type: "sommeil", date: day(8 + i), duree: 120, quality: "paisible" });
    const ins = generateInsights({ events, babyName: "Léa", ageMonths: 5, birthDate: birthDaysAgo(150), now }).find((i) => i.title === "Sommeil en baisse")!;
    expect(ins).toBeDefined();
    expect(ins.message.toLowerCase()).not.toContain("régression");
  });
});

describe("M10 cododo dans le rappel de couchage sûr", () => {
  const nap = (location: string, i: number) => ({ id: `s${location}${i}`, type: "sommeil" as const, date: day(1 + (i % 5)), location, quality: "paisible" as const, isNap: true, duree: 60 });
  it("compte les siestes en cododo", () => {
    const events = [nap("cododo", 0), nap("cododo", 1), nap("cododo", 2), nap("lit", 3), nap("lit", 4)];
    const r = generateInsights({ events, babyName: "Léa", ageMonths: 5, birthDate: birthDaysAgo(150), now }).find((i) => i.title === "Couchage sûr")!;
    expect(r).toBeDefined();
    expect(r.message).toContain("dans son propre lit, dans la chambre des parents");
    expect(r.message).toContain("cododo");
  });
  it("mélange voiture + cododo : un seul rappel", () => {
    const events = [nap("cododo", 0), nap("voiture", 1), nap("poussette", 2), nap("lit", 3), nap("lit", 4)];
    const r = generateInsights({ events, babyName: "Léa", ageMonths: 5, birthDate: birthDaysAgo(150), now }).filter((i) => i.title === "Couchage sûr");
    expect(r).toHaveLength(1);
  });
});

describe("M6 corrélation fièvre/appétit selon l'âge", () => {
  const events = () => {
    const out: any[] = [];
    for (let d = 1; d <= 20; d++) {
      const fever = d <= 4;
      out.push({ id: `t${d}`, type: "temperature", date: day(d), valeur: fever ? 38.6 : 36.8 });
      for (let k = 0; k < (fever ? 2 : 6); k++) out.push({ id: `b${d}-${k}`, type: "biberon", date: new Date(day(d).getTime() + k * 3_600_000) });
    }
    return out;
  };
  const run = (birthDate: Date | null) => generateCorrelations({ events: events(), babyName: "Léa", birthDate, now } as any).find((c) => c.title === "Fièvre et appétit");

  it("moins de 3 mois : carte supprimée", () => {
    expect(run(birthDaysAgo(40))).toBeUndefined();
  });
  it("âge inconnu : carte supprimée", () => {
    expect(run(null)).toBeUndefined();
  });
  it("moins de 6 mois : sein ou biberon plus souvent, pas d'eau", () => {
    const c = run(birthDaysAgo(150))!;
    expect(c.message).toContain("Proposez le sein ou le biberon plus souvent");
    expect(c.message.toLowerCase()).not.toMatch(/\beau\b|à boire/);
  });
  it("6 mois et plus : à boire", () => {
    const c = run(birthDaysAgo(400))!;
    expect(c.message).toContain("Proposez régulièrement à boire");
    expect(c.message).toMatch(/médecin/);
  });
});
