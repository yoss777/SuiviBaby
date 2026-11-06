jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  moveAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  adoptTempFile,
  cleanupStaleExports,
  deleteTempFile,
  getCacheFileUri,
  prepareExportFile,
  shareTempFile,
} from "@/services/tempShareService";

const uri = "file:///cache/exports/export.json";
const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

describe("tempShareService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.moveAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("builds paths in the exports folder of the cache directory", () => {
    expect(getCacheFileUri("a.csv")).toBe("file:///cache/exports/a.csv");
  });

  it("does NOT delete the file after a successful share", async () => {
    expect(await shareTempFile(uri, { mimeType: "text/csv" })).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, { mimeType: "text/csv" });
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it("does not delete when sharing fails, and rethrows", async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error("cancelled"));
    await expect(shareTempFile(uri)).rejects.toThrow("cancelled");
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it("returns false without sharing when sharing is unavailable", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    expect(await shareTempFile(uri)).toBe(false);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("deleteTempFile never throws", async () => {
    (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error("busy"));
    await expect(deleteTempFile(uri)).resolves.toBeUndefined();
  });

  describe("cleanupStaleExports", () => {
    const dir = "file:///cache/exports/";

    it("does nothing when the folder does not exist", async () => {
      expect(await cleanupStaleExports(HOUR, NOW)).toBe(0);
      expect(FileSystem.readDirectoryAsync).not.toHaveBeenCalled();
    });

    it("deletes files older than one hour and keeps recent ones", async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(["old.csv", "fresh.csv", "edge.csv"]);
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (u: string) => {
        if (u === dir) return { exists: true };
        const ageMs = u.endsWith("old.csv") ? 2 * HOUR : u.endsWith("edge.csv") ? HOUR : 5 * 60 * 1000;
        return { exists: true, modificationTime: (NOW - ageMs) / 1000 };
      });
      expect(await cleanupStaleExports(HOUR, NOW)).toBe(2);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${dir}old.csv`, { idempotent: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${dir}edge.csv`, { idempotent: true });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(`${dir}fresh.csv`, expect.anything());
    });

    it("treats a file with unknown age as stale", async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(["x.pdf"]);
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      expect(await cleanupStaleExports(HOUR, NOW)).toBe(1);
    });

    it("never throws and continues after a failing file", async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(["a", "b"]);
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (u: string) =>
        u === dir ? { exists: true } : { exists: true, modificationTime: 0 },
      );
      (FileSystem.deleteAsync as jest.Mock).mockRejectedValueOnce(new Error("busy"));
      expect(await cleanupStaleExports(HOUR, NOW)).toBe(1);
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error("io"));
      await expect(cleanupStaleExports(HOUR, NOW)).resolves.toBe(0);
    });
  });

  it("prepareExportFile purges stale files, creates the folder and returns the uri", async () => {
    expect(await prepareExportFile("a.json")).toBe("file:///cache/exports/a.json");
    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith("file:///cache/exports/");
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith("file:///cache/exports/", {
      intermediates: true,
    });
  });

  describe("adoptTempFile", () => {
    it("moves the file into the exports folder", async () => {
      const result = await adoptTempFile("file:///cache/Print/x.pdf", "s.pdf");
      expect(result).toBe("file:///cache/exports/s.pdf");
      expect(FileSystem.moveAsync).toHaveBeenCalledWith({
        from: "file:///cache/Print/x.pdf",
        to: "file:///cache/exports/s.pdf",
      });
    });

    it("falls back to the original uri when the move fails", async () => {
      (FileSystem.moveAsync as jest.Mock).mockRejectedValue(new Error("io"));
      expect(await adoptTempFile("file:///cache/Print/x.pdf", "s.pdf")).toBe("file:///cache/Print/x.pdf");
    });
  });
});
