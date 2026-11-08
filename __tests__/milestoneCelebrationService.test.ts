// Jalons de célébration : détection, portée par enfant, filtre Premium, une fois par jour.
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildShareMessage,
  commitMilestoneShown,
  computeLongestNightSleepMin,
  computeStreak,
  detectNewMilestones,
  findMilestoneForToday,
  markMilestoneCelebrated,
  selectMilestoneToShow,
  type DetectionParams,
} from "@/services/milestoneCelebrationService";
import { countChildEvents, getFirstEventDate } from "@/services/eventsRepository";

jest.mock("@/services/eventsRepository", () => ({
  countChildEvents: jest.fn(),
  getFirstEventDate: jest.fn(),
}));

const store = new Map<string, string>();
const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const countMock = countChildEvents as jest.Mock;
const firstMock = getFirstEventDate as jest.Mock;

const NOW = new Date("2026-11-07T10:00:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

const base = (over: Partial<DetectionParams> = {}): DetectionParams => ({
  childId: "child-a",
  premium: true,
  trackingStart: daysAgo(5),
  totalEventCount: 10,
  feedingCount: 5,
  longestNightSleepMin: 120,
  currentStreak: 1,
  now: NOW,
  ...over,
});

beforeEach(() => {
  store.clear();
  store.set("@suivibaby_milestone_baseline", JSON.stringify(["child-a", "child-b"])); // déjà vérifiés : seuls les nouveaux paliers s'affichent
  getItem.mockImplementation((k: string) => Promise.resolve(store.get(k) ?? null));
  setItem.mockImplementation((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  });
  countMock.mockReset();
  firstMock.mockReset();
});

describe("detectNewMilestones", () => {
  it("ne propose rien quand aucun seuil n'est atteint", async () => {
    expect(await detectNewMilestones(base())).toEqual([]);
  });

  it("propose le jalon de durée à partir de la date de début du suivi", async () => {
    const res = await detectNewMilestones(base({ trackingStart: daysAgo(31) }));
    expect(res.map((m) => m.id)).toEqual(["tracking_30d"]);
  });

  it("ignore la durée quand la date de début est inconnue", async () => {
    const res = await detectNewMilestones(base({ trackingStart: undefined }));
    expect(res).toEqual([]);
  });

  it("détecte les seuils de nombre d'événements, de repas et de nuit longue", async () => {
    const res = await detectNewMilestones(
      base({ totalEventCount: 120, feedingCount: 100, longestNightSleepMin: 361 }),
    );
    expect(res.map((m) => m.id).sort()).toEqual(["events_100", "feedings_100", "first_sleep_6h"]);
  });

  it("filtre le jalon Premium (série) pour un utilisateur gratuit", async () => {
    const free = await detectNewMilestones(base({ currentStreak: 8, premium: false }));
    expect(free).toEqual([]);
    const premium = await detectNewMilestones(base({ currentStreak: 8, premium: true }));
    expect(premium.map((m) => m.id)).toEqual(["streak_7d"]);
    expect(premium[0].isPremium).toBe(true);
  });

  it("un utilisateur gratuit garde les autres jalons", async () => {
    const res = await detectNewMilestones(
      base({ currentStreak: 8, premium: false, totalEventCount: 100 }),
    );
    expect(res.map((m) => m.id)).toEqual(["events_100"]);
  });

  it("un jalon célébré pour l'enfant A reste proposé à l'enfant B", async () => {
    await markMilestoneCelebrated("child-a", "events_100");
    const a = await detectNewMilestones(base({ totalEventCount: 100 }));
    const b = await detectNewMilestones(base({ childId: "child-b", totalEventCount: 100 }));
    expect(a).toEqual([]);
    expect(b.map((m) => m.id)).toEqual(["events_100"]);
  });

  it("rattache les anciens ids non préfixés au premier enfant évalué (compatibilité)", async () => {
    store.set("@suivibaby_celebrated_milestones", JSON.stringify(["events_100"]));
    const a = await detectNewMilestones(base({ totalEventCount: 100 }));
    expect(a).toEqual([]);
    const b = await detectNewMilestones(base({ childId: "child-b", totalEventCount: 100 }));
    expect(b.map((m) => m.id)).toEqual(["events_100"]);
    const saved = JSON.parse(store.get("@suivibaby_celebrated_milestones")!);
    expect(saved).toEqual(["child-a:events_100"]);
  });

  it("tolère un stockage corrompu", async () => {
    store.set("@suivibaby_celebrated_milestones", "{pas du json");
    const res = await detectNewMilestones(base({ totalEventCount: 100 }));
    expect(res.map((m) => m.id)).toEqual(["events_100"]);
  });
});

describe("selectMilestoneToShow", () => {
  it("renvoie null sans candidat", () => {
    expect(selectMilestoneToShow([])).toBeNull();
  });

  it("garde le plus haut seuil d'une famille et marque les plus bas comme dépassés", async () => {
    const candidates = await detectNewMilestones(base({ trackingStart: daysAgo(200) }));
    const sel = selectMilestoneToShow(candidates)!;
    expect(sel.milestone.id).toBe("tracking_180d");
    expect(sel.supersededIds.sort()).toEqual(["tracking_30d", "tracking_90d"]);
  });

  it("choisit un seul jalon entre familles, la durée avant le reste", async () => {
    const candidates = await detectNewMilestones(
      base({ trackingStart: daysAgo(31), totalEventCount: 100, currentStreak: 8 }),
    );
    const sel = selectMilestoneToShow(candidates)!;
    expect(sel.milestone.id).toBe("tracking_30d");
    expect(sel.supersededIds).toEqual([]);
  });
});

describe("computeStreak / computeLongestNightSleepMin", () => {
  const ev = (n: number, extra: Record<string, unknown> = {}) => ({
    type: "tetee",
    date: new Date(daysAgo(n).setHours(9, 0, 0, 0)),
    ...extra,
  });

  it("compte les jours consécutifs finissant aujourd'hui", () => {
    expect(computeStreak([ev(0), ev(1), ev(2), ev(4)], NOW)).toBe(3);
  });

  it("accepte une journée en cours encore vide (série finissant hier)", () => {
    expect(computeStreak([ev(1), ev(2)], NOW)).toBe(2);
  });

  it("renvoie 0 sans événement ou si la série est rompue", () => {
    expect(computeStreak([], NOW)).toBe(0);
    expect(computeStreak([ev(3)], NOW)).toBe(0);
  });

  it("ignore les dates invalides", () => {
    expect(computeStreak([{ type: "tetee", date: new Date("x") }, ev(0)], NOW)).toBe(1);
  });

  it("mesure la plus longue nuit (hors sieste) depuis début et fin", () => {
    const night = {
      type: "sommeil",
      isNap: false,
      date: daysAgo(1),
      heureDebut: new Date("2026-11-06T21:00:00"),
      heureFin: new Date("2026-11-07T04:30:00"),
    };
    const nap = {
      type: "sommeil",
      isNap: true,
      date: daysAgo(1),
      heureDebut: new Date("2026-11-06T13:00:00"),
      heureFin: new Date("2026-11-06T18:00:00"),
    };
    expect(computeLongestNightSleepMin([night, nap])).toBe(450);
  });

  it("retombe sur duree et ignore le sommeil en cours", () => {
    const withDuree = { type: "sommeil", isNap: false, date: daysAgo(1), duree: 400 };
    const running = {
      type: "sommeil",
      isNap: false,
      date: daysAgo(0),
      heureDebut: new Date("2026-11-07T01:00:00"),
    };
    expect(computeLongestNightSleepMin([withDuree, running])).toBe(400);
    expect(computeLongestNightSleepMin([])).toBe(0);
  });
});

describe("findMilestoneForToday (une fois par jour et par enfant)", () => {
  const local = { currentStreak: 1, longestNightSleepMin: 0 };

  beforeEach(() => {
    firstMock.mockResolvedValue(daysAgo(40));
    countMock.mockImplementation((_c: string, types?: string[]) =>
      Promise.resolve(types ? 20 : 30),
    );
  });

  it("trouve un jalon, avec 3 lectures légères au plus", async () => {
    const sel = await findMilestoneForToday({ childId: "child-a", premium: false, local, now: NOW });
    expect(sel?.milestone.id).toBe("tracking_30d");
    expect(firstMock).toHaveBeenCalledTimes(1);
    expect(countMock).toHaveBeenCalledTimes(2);
  });

  it("ne repropose rien le même jour après affichage, sans nouvelle lecture", async () => {
    const sel = (await findMilestoneForToday({ childId: "child-a", premium: false, local, now: NOW }))!;
    await commitMilestoneShown("child-a", sel, NOW);
    firstMock.mockClear();
    countMock.mockClear();
    const again = await findMilestoneForToday({ childId: "child-a", premium: false, local, now: NOW });
    expect(again).toBeNull();
    expect(firstMock).not.toHaveBeenCalled();
    expect(countMock).not.toHaveBeenCalled();
  });

  it("n'est jamais rejoué : le lendemain, le jalon affiché reste célébré", async () => {
    const sel = (await findMilestoneForToday({ childId: "child-a", premium: false, local, now: NOW }))!;
    await commitMilestoneShown("child-a", sel, NOW);
    const tomorrow = new Date(NOW.getTime() + 86400000);
    const next = await findMilestoneForToday({ childId: "child-a", premium: false, local, now: tomorrow });
    expect(next).toBeNull();
  });

  it("un autre enfant a sa propre limite quotidienne", async () => {
    const sel = (await findMilestoneForToday({ childId: "child-a", premium: false, local, now: NOW }))!;
    await commitMilestoneShown("child-a", sel, NOW);
    const b = await findMilestoneForToday({ childId: "child-b", premium: false, local, now: NOW });
    expect(b?.milestone.id).toBe("tracking_30d");
  });

  it("ne relit pas le même jour quand il n'y avait rien à fêter", async () => {
    firstMock.mockResolvedValue(daysAgo(3));
    countMock.mockResolvedValue(5);
    expect(await findMilestoneForToday({ childId: "child-a", premium: true, local, now: NOW })).toBeNull();
    firstMock.mockClear();
    countMock.mockClear();
    expect(await findMilestoneForToday({ childId: "child-a", premium: true, local, now: NOW })).toBeNull();
    expect(firstMock).not.toHaveBeenCalled();
    expect(countMock).not.toHaveBeenCalled();
  });

  it("en cas d'échec de lecture (hors ligne) : rien n'est affiché ni mémorisé", async () => {
    countMock.mockRejectedValue(new Error("offline"));
    expect(await findMilestoneForToday({ childId: "child-a", premium: true, local, now: NOW })).toBeNull();
    countMock.mockImplementation(() => Promise.resolve(30));
    const retry = await findMilestoneForToday({ childId: "child-a", premium: true, local, now: NOW });
    expect(retry?.milestone.id).toBe("tracking_30d");
  });

  it("un échec de lecture serveur (ex. index manquant) est signalé à Sentry", async () => {
    const { captureServiceError } = jest.requireMock("@/utils/errorReporting");
    (captureServiceError as jest.Mock).mockClear();
    const err = Object.assign(new Error("The query requires an index"), { code: "failed-precondition" });
    firstMock.mockRejectedValue(err);
    expect(await findMilestoneForToday({ childId: "child-a", premium: true, local, now: NOW })).toBeNull();
    expect(captureServiceError).toHaveBeenCalledWith(err, { service: "milestones", operation: "loadServerStats" });
  });

  it("sans événement : aucune lecture de comptage, aucun jalon", async () => {
    firstMock.mockResolvedValue(null);
    expect(await findMilestoneForToday({ childId: "child-a", premium: true, local, now: NOW })).toBeNull();
    expect(countMock).not.toHaveBeenCalled();
  });

  it("une série locale Premium est proposée, pas à un gratuit", async () => {
    firstMock.mockResolvedValue(daysAgo(10));
    countMock.mockResolvedValue(5);
    const streak = { currentStreak: 8, longestNightSleepMin: 0 };
    const free = await findMilestoneForToday({ childId: "child-a", premium: false, local: streak, now: NOW });
    expect(free).toBeNull();
    // Le passage gratuit a été mémorisé pour la journée ; autre enfant pour le test Premium.
    const prem = await findMilestoneForToday({ childId: "child-b", premium: true, local: streak, now: NOW });
    expect(prem?.milestone.id).toBe("streak_7d");
  });
});

describe("première vérification : pas de rattrapage des paliers déjà franchis", () => {
  const local = { currentStreak: 1, longestNightSleepMin: 0 };

  beforeEach(() => {
    store.delete("@suivibaby_milestone_baseline");
    firstMock.mockResolvedValue(daysAgo(200));
    countMock.mockImplementation((_c: string, types?: string[]) =>
      Promise.resolve(types ? 150 : 600),
    );
  });

  it("enregistre en silence les paliers atteints, sans pop-up", async () => {
    expect(await findMilestoneForToday({ childId: "child-a", premium: false, local, now: NOW })).toBeNull();
    const ids = JSON.parse(store.get("@suivibaby_celebrated_milestones") ?? "[]");
    expect(ids).toEqual(
      expect.arrayContaining(["child-a:tracking_180d", "child-a:events_500", "child-a:feedings_100"]),
    );
    // Les jours suivants, rien d'ancien ne revient.
    const tomorrow = new Date(NOW.getTime() + 86400000);
    expect(await findMilestoneForToday({ childId: "child-a", premium: false, local, now: tomorrow })).toBeNull();
  });

  it("célèbre ensuite un palier franchi après cette vérification", async () => {
    await findMilestoneForToday({ childId: "child-a", premium: false, local, now: NOW });
    countMock.mockImplementation((_c: string, types?: string[]) =>
      Promise.resolve(types ? 150 : 1001),
    );
    const tomorrow = new Date(NOW.getTime() + 86400000);
    const sel = await findMilestoneForToday({ childId: "child-a", premium: false, local, now: tomorrow });
    expect(sel?.milestone.id).toBe("events_1000");
  });

  it("chaque enfant a sa propre première vérification", async () => {
    await findMilestoneForToday({ childId: "child-a", premium: false, local, now: NOW });
    expect(await findMilestoneForToday({ childId: "child-b", premium: false, local, now: NOW })).toBeNull();
    expect(JSON.parse(store.get("@suivibaby_milestone_baseline") ?? "[]")).toEqual(["child-a", "child-b"]);
  });
});

describe("commitMilestoneShown", () => {
  it("marque le jalon affiché et les dépassés comme célébrés pour cet enfant seulement", async () => {
    const cands = await detectNewMilestones(base({ trackingStart: daysAgo(100) }));
    const sel = selectMilestoneToShow(cands)!;
    await commitMilestoneShown("child-a", sel, NOW);
    const a = await detectNewMilestones(base({ trackingStart: daysAgo(100) }));
    const b = await detectNewMilestones(base({ childId: "child-b", trackingStart: daysAgo(100) }));
    expect(a).toEqual([]);
    expect(b.length).toBe(2);
  });
});

describe("buildShareMessage", () => {
  it("phrase française avec prénom, sans donnée de santé", async () => {
    const [m] = await detectNewMilestones(base({ trackingStart: daysAgo(31) }));
    expect(buildShareMessage(m, "Léa")).toBe("Léa a 1 mois de suivi sur SuiviBaby 🎉");
  });

  it("retombe sur « Mon bébé » sans prénom", async () => {
    const [m] = await detectNewMilestones(base({ longestNightSleepMin: 400 }));
    expect(buildShareMessage(m, "  ")).toBe("Mon bébé a fait une belle et longue nuit sur SuiviBaby 🌙");
    expect(buildShareMessage(m)).not.toMatch(/\d/);
  });
});
