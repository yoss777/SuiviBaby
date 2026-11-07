import { exportAllEventsCSV } from "@/services/exportService";
import { obtenirEvenements } from "@/services/eventsService";
import * as FileSystem from "expo-file-system";

jest.mock("expo-file-system", () => ({
  writeAsStringAsync: jest.fn(async () => undefined),
  EncodingType: { UTF8: "utf8" },
}));
jest.mock("@/services/tempShareService", () => ({
  prepareExportFile: jest.fn(async (n: string) => `/tmp/${n}`),
  shareTempFile: jest.fn(async () => true),
  deleteTempFile: jest.fn(async () => undefined),
}));
jest.mock("@/services/eventsService", () => ({ obtenirEvenements: jest.fn() }));
jest.mock("@/services/hiddenPhotosService", () => ({
  getHiddenEventIds: jest.fn(async () => []),
}));

describe("exportAllEventsCSV", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queries every derived type, nettoyage_nez included", async () => {
    (obtenirEvenements as jest.Mock).mockResolvedValue([]);
    const res = await exportAllEventsCSV("c1", "Léa");
    const queried = (obtenirEvenements as jest.Mock).mock.calls.map((c) => c[1].type);
    expect(queried).toContain("nettoyage_nez");
    expect(queried).toContain("couche");
    expect(res.failedTypes).toEqual([]);
  });

  it("reports the types that failed instead of ignoring them", async () => {
    (obtenirEvenements as jest.Mock).mockImplementation(async (_c, { type }) => {
      if (type === "vaccin" || type === "nettoyage_nez") throw new Error("boom");
      return [];
    });
    const res = await exportAllEventsCSV("c1", "Léa");
    expect(res.failedTypes.sort()).toEqual(["nettoyage_nez", "vaccin"]);
  });

  it("exports a {seconds: 0} date (epoch) instead of \"Invalid Date\"", async () => {
    (obtenirEvenements as jest.Mock).mockImplementation(async (_c, { type }) =>
      type === "couche" ? [{ id: "e0", date: { seconds: 0 } }] : [],
    );
    await exportAllEventsCSV("c1", "Léa");
    const csv = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;
    expect(csv).not.toContain("Invalid Date");
    expect(csv).toMatch(/\b(31\/12\/1969|01\/01\/1970)\b/);
  });
});
