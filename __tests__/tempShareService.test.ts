jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  deleteAsync: jest.fn(),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { deleteTempFile, getCacheFileUri, shareAndDelete } from "@/services/tempShareService";

const uri = "file:///cache/export.json";

describe("tempShareService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("builds paths in the cache directory", () => {
    expect(getCacheFileUri("a.csv")).toBe("file:///cache/a.csv");
  });

  it("deletes after a successful share", async () => {
    expect(await shareAndDelete(uri, { mimeType: "text/csv" })).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, { mimeType: "text/csv" });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  it("deletes when sharing fails and rethrows", async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error("cancelled"));
    await expect(shareAndDelete(uri)).rejects.toThrow("cancelled");
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  it("deletes and returns false when sharing is unavailable", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    expect(await shareAndDelete(uri)).toBe(false);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  });

  it("a failing delete does not change the outcome", async () => {
    (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error("busy"));
    await expect(shareAndDelete(uri)).resolves.toBe(true);
    await expect(deleteTempFile(uri)).resolves.toBeUndefined();
  });
});
