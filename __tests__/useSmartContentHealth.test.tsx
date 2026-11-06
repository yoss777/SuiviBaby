import { renderHook } from "@testing-library/react-native";

jest.mock("@/config/firebase", () => ({ db: {}, auth: {} }));
jest.mock("@/services/smartContentService", () => ({
  fetchAllMilestones: jest.fn().mockResolvedValue([]),
  fetchTipsForAge: jest.fn().mockResolvedValue([]),
  getUpcomingMilestones: jest.fn().mockResolvedValue([]),
  getUserContentState: jest.fn().mockResolvedValue({ dismissedTips: [], bookmarks: [], milestoneStatuses: {} }),
  dismissTip: jest.fn(),
  bookmarkTip: jest.fn(),
  removeBookmark: jest.fn(),
  updateMilestoneStatus: jest.fn(),
}));

import { computeEventsFingerprint, useSmartContent } from "@/hooks/useSmartContent";

const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
const temp = (valeur: number, over: Record<string, unknown> = {}) => ({
  id: "t1",
  type: "temperature",
  date: ago(1),
  valeur,
  ...over,
});

const params = (over: Record<string, unknown> = {}) => ({
  events: [temp(38.5)],
  childId: "c1",
  babyBirthDate: ago(150) as any,
  babyName: "Léa",
  tipsEnabled: false,
  insightsEnabled: true,
  correlationsEnabled: false,
  ...over,
});

// Les paramètres doivent être stables entre deux rendus (sinon les effets du hook bouclent).
const render = (p: any) => renderHook(() => useSmartContent(p));

describe("M2 alertes santé hors réglage insights et sans date de naissance", () => {
  it("insights désactivés : l'alerte de température reste calculée", () => {
    const { result } = render(params({ insightsEnabled: false }));
    expect(result.current.insights.map((i) => i.title)).toEqual(["Température élevée enregistrée"]);
  });

  it("insights désactivés : les autres insights restent masqués", () => {
    const activities = [1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, type: "activite", date: ago(i) }));
    const { result } = render(params({ insightsEnabled: false, events: [temp(38.5), ...activities] }));
    expect(result.current.insights.every((i) => /Température/.test(i.title))).toBe(true);
  });

  it("sans date de naissance : message d'âge inconnu, non masquable", () => {
    const { result } = render(params({ babyBirthDate: null, insightsEnabled: false }));
    expect(result.current.insights).toHaveLength(1);
    expect(result.current.insights[0].message).toContain("L'âge de l'enfant n'est pas renseigné");
    expect(result.current.insights[0].dismissible).toBe(false);
  });

  it("sans date de naissance, insights actifs : autres insights toujours masqués", () => {
    const activities = [1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, type: "activite", date: ago(i) }));
    const { result } = render(params({ babyBirthDate: null, events: [temp(38.5), ...activities] }));
    expect(result.current.insights.every((i) => /Température/.test(i.title))).toBe(true);
  });

  it("insights actifs : alerte en tête puis les autres", () => {
    const activities = [1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, type: "activite", date: ago(i) }));
    const { result } = render(params({ events: [temp(38.5), ...activities] }));
    expect(result.current.insights[0].title).toBe("Température élevée enregistrée");
    expect(result.current.insights.length).toBeGreaterThan(1);
    expect(result.current.insights.length).toBeLessThanOrEqual(3);
  });

  it("pas d'événement : aucune alerte", () => {
    const { result } = render(params({ events: [] }));
    expect(result.current.insights).toEqual([]);
  });
});

describe("M1 empreinte des événements", () => {
  it("change quand la valeur change (même id, même nombre)", () => {
    expect(computeEventsFingerprint([temp(37.2)] as any)).not.toBe(computeEventsFingerprint([temp(38.5)] as any));
  });
  it("change quand seule la date change", () => {
    expect(computeEventsFingerprint([temp(38.5, { date: ago(1) })] as any)).not.toBe(
      computeEventsFingerprint([temp(38.5, { date: ago(5) })] as any),
    );
  });
  it("change quand seul updatedAt change (Date, Timestamp, nombre)", () => {
    const a = computeEventsFingerprint([temp(38.5, { updatedAt: new Date(1000) })] as any);
    const b = computeEventsFingerprint([temp(38.5, { updatedAt: new Date(2000) })] as any);
    const c = computeEventsFingerprint([temp(38.5, { updatedAt: { seconds: 3, nanoseconds: 0 } })] as any);
    expect(new Set([a, b, c]).size).toBe(3);
  });
  it("change quand l'id change", () => {
    expect(computeEventsFingerprint([temp(38.5, { id: "a" })] as any)).not.toBe(
      computeEventsFingerprint([temp(38.5, { id: "b" })] as any),
    );
  });
  it("stable pour les mêmes données ; vide si aucun événement", () => {
    const e = [temp(38.5)] as any;
    expect(computeEventsFingerprint(e)).toBe(computeEventsFingerprint([...e]));
    expect(computeEventsFingerprint([])).toBe("");
  });

  it("modification de la valeur : l'alerte est recalculée", () => {
    const { result, rerender } = renderHook((p: any) => useSmartContent(p), {
      initialProps: params({ events: [temp(37.2)] }),
    });
    expect(result.current.insights.some((i) => /Température/.test(i.title))).toBe(false);
    rerender(params({ events: [temp(38.5)] }));
    expect(result.current.insights[0]?.title).toBe("Température élevée enregistrée");
  });

  it("changement du prénom ou de la date de naissance : alerte recalculée", () => {
    const { result, rerender } = renderHook((p: any) => useSmartContent(p), { initialProps: params() });
    expect(result.current.insights[0].message).toContain("Léa");
    rerender(params({ babyName: "Zoé", babyBirthDate: ago(20) }));
    expect(result.current.insights[0].message).toContain("Zoé");
    expect(result.current.insights[0].dismissible).toBe(false);
  });
});
