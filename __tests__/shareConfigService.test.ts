// Interrupteur distant du lien de partage : coupé par défaut et en cas d'erreur.
const mockGetDoc = jest.fn();
jest.mock("firebase/firestore", () => ({
  doc: jest.fn((_db, col, id) => ({ path: `${col}/${id}` })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));
jest.mock("@/config/firebase", () => ({ db: {} }));

import { __resetShareConfigCache, isShareAppLinkEnabled } from "@/services/shareConfigService";

const snap = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});

beforeEach(() => {
  __resetShareConfigCache();
  mockGetDoc.mockReset();
});

describe("isShareAppLinkEnabled", () => {
  it("vrai seulement si includeAppLink === true", async () => {
    mockGetDoc.mockResolvedValue(snap({ includeAppLink: true }));
    await expect(isShareAppLinkEnabled()).resolves.toBe(true);
  });

  it("faux sans document, avec une valeur non booléenne, ou en erreur", async () => {
    mockGetDoc.mockResolvedValueOnce(snap(null));
    await expect(isShareAppLinkEnabled()).resolves.toBe(false);
    __resetShareConfigCache();
    mockGetDoc.mockResolvedValueOnce(snap({ includeAppLink: "true" }));
    await expect(isShareAppLinkEnabled()).resolves.toBe(false);
    __resetShareConfigCache();
    mockGetDoc.mockRejectedValueOnce(new Error("offline"));
    await expect(isShareAppLinkEnabled()).resolves.toBe(false);
  });

  it("lu une fois par session, relu après une erreur", async () => {
    mockGetDoc.mockResolvedValue(snap({ includeAppLink: true }));
    await isShareAppLinkEnabled();
    await isShareAppLinkEnabled();
    expect(mockGetDoc).toHaveBeenCalledTimes(1);

    __resetShareConfigCache();
    mockGetDoc.mockReset();
    mockGetDoc.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(snap({ includeAppLink: true }));
    await expect(isShareAppLinkEnabled()).resolves.toBe(false);
    await expect(isShareAppLinkEnabled()).resolves.toBe(true);
  });
});
