/* eslint-disable import/first */
// S7.4 : galerie paginée par 60 (première page en direct, suite à la demande).

jest.mock("@/config/firebase", () => ({ db: {}, auth: {} }));
type Evt = { id: string; date: { seconds: number } };
let mockLiveCb: ((events: Evt[]) => void) | null = null;
const mockEcouter = jest.fn((_c: string, cb: (e: Evt[]) => void, _opts?: unknown) => {
  mockLiveCb = cb;
  return jest.fn();
});
jest.mock("@/services/eventsService", () => ({
  ecouterEvenements: (...a: [string, (e: Evt[]) => void, unknown]) => mockEcouter(...a),
}));
const mockQueryParts: unknown[][] = [];
const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn(() => Promise.resolve({ exists: () => true }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => "events"),
  doc: jest.fn((_d: unknown, ...p: string[]) => p.join("/")),
  where: jest.fn((...a: unknown[]) => ({ where: a })),
  orderBy: jest.fn((...a: unknown[]) => ({ orderBy: a })),
  limit: jest.fn((n: number) => ({ limit: n })),
  startAfter: jest.fn((c: unknown) => ({ startAfter: c })),
  query: jest.fn((...parts: unknown[]) => { mockQueryParts.push(parts); return parts; }),
  getDoc: (...a: unknown[]) => (mockGetDoc as any)(...a),
  getDocs: (...a: unknown[]) => mockGetDocs(...a),
}));

import { act, renderHook } from "@testing-library/react-native";
import {
  GALLERY_PAGE_SIZE,
  appendOlderPage,
  applyFirstPage,
  useGalleryMilestones,
} from "@/hooks/useGalleryMilestones";

// i = 0 est le plus récent
const evt = (i: number): any => ({ id: `e${i}`, date: { seconds: 10_000_000 - i * 100 }, type: "jalon" });
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => evt(from + k));
const ids = (list: { id: string }[]) => list.map((e) => e.id);

beforeEach(() => {
  jest.clearAllMocks();
  mockLiveCb = null;
  mockQueryParts.length = 0;
});

describe("applyFirstPage", () => {
  it("replaces everything when the first page is not full (all history loaded)", () => {
    const result = applyFirstPage(range(0, 5), range(0, 3));
    expect(ids(result)).toEqual(["e0", "e1", "e2"]);
  });

  it("keeps older pages already loaded when the live page changes", () => {
    const previous = range(0, 120); // pages 1 et 2
    const livePage = range(0, 60);
    expect(applyFirstPage(previous, livePage)).toHaveLength(120);
  });

  it("a new event shifts the window without losing the event that left it (no gap)", () => {
    const previous = range(0, 120);
    const newest = { id: "new", date: { seconds: 20_000_000 } } as any;
    const livePage = [newest, ...range(0, 59)]; // e59 sort de la fenêtre
    const result = applyFirstPage(previous, livePage);
    expect(result).toHaveLength(121);
    expect(ids(result)).toContain("e59");
    expect(result[0].id).toBe("new");
  });

  it("drops an event deleted from the window", () => {
    const previous = range(0, 120);
    const livePage = [...range(0, 10), ...range(11, 61)]; // e10 supprimé, e60 entre
    const result = applyFirstPage(previous, livePage);
    expect(ids(result)).not.toContain("e10");
    expect(result).toHaveLength(119);
  });
});

describe("appendOlderPage", () => {
  it("appends without duplicates, newest first", () => {
    const result = appendOlderPage(range(0, 60), [...range(58, 62)]);
    expect(result).toHaveLength(62);
    expect(new Set(ids(result)).size).toBe(62);
    expect(result[61].id).toBe("e61");
  });
});

describe("useGalleryMilestones", () => {
  it("listens to the first page only (limit 60), never the whole history", () => {
    renderHook(() => useGalleryMilestones("c1"));
    expect(mockEcouter).toHaveBeenCalledTimes(1);
    expect(mockEcouter.mock.calls[0][2]).toMatchObject({ type: "jalon", limite: GALLERY_PAGE_SIZE });
  });

  it("has no next page when the first page is incomplete", () => {
    const { result } = renderHook(() => useGalleryMilestones("c1"));
    act(() => mockLiveCb!(range(0, 12)));
    expect(result.current.loaded).toBe(true);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.events).toHaveLength(12);
  });

  it("loads the next 60 after the oldest event, then stops on a short page", async () => {
    const { result } = renderHook(() => useGalleryMilestones("c1"));
    act(() => mockLiveCb!(range(0, 60)));
    expect(result.current.hasMore).toBe(true);

    mockGetDocs.mockResolvedValueOnce({
      docs: range(60, 100).map((e) => ({ id: e.id, data: () => ({ date: e.date, type: "jalon" }) })),
    });
    await act(async () => { await result.current.loadMore(); });

    expect(mockGetDoc).toHaveBeenCalledWith("events/e59"); // curseur = dernier jalon chargé
    const parts = mockQueryParts[mockQueryParts.length - 1];
    expect(parts).toEqual(expect.arrayContaining([{ limit: GALLERY_PAGE_SIZE }, { startAfter: { exists: expect.any(Function) } }]));
    expect(result.current.events).toHaveLength(100);
    expect(result.current.hasMore).toBe(false); // page de 40 < 60
  });

  it("does not start a second page read while one is in flight", async () => {
    const { result } = renderHook(() => useGalleryMilestones("c1"));
    act(() => mockLiveCb!(range(0, 60)));
    let release: (v: unknown) => void = () => {};
    mockGetDocs.mockReturnValueOnce(new Promise((r) => { release = r; }));
    await act(async () => {
      const first = result.current.loadMore();
      void result.current.loadMore();
      release({ docs: [] });
      await first;
    });
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it("keeps hasMore after a failed page read so the user can retry", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useGalleryMilestones("c1"));
    act(() => mockLiveCb!(range(0, 60)));
    mockGetDocs.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.hasMore).toBe(true);
    expect(result.current.events).toHaveLength(60);
    err.mockRestore();
  });
});
