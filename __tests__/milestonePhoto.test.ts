/* eslint-disable import/first */
// Sprint 6 (6.6) : photo de jalon. Délai maximal, message réseau distinct,
// photo supprimée si la création échoue, ancienne photo supprimée à la
// modification (une fois le serveur d'accord).

const mockUploadAsync = jest.fn();
jest.mock("expo-file-system", () => ({
  uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "u1", getIdToken: jest.fn(() => Promise.resolve("tok")) } },
  db: {},
  functions: {},
}));
jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));

const mockAdd = jest.fn();
const mockModify = jest.fn();
jest.mock("@/services/eventsService", () => ({
  ajouterEvenementOptimistic: (...a: unknown[]) => mockAdd(...a),
  modifierEvenementOptimistic: (...a: unknown[]) => mockModify(...a),
}));
const mockDeletePhoto = jest.fn(() => Promise.resolve());
jest.mock("@/services/events/photoCleanup", () => ({
  deletePhotoFromStorage: (...a: unknown[]) => (mockDeletePhoto as any)(...a),
}));

import { captureServiceError } from "@/utils/errorReporting";
import {
  PHOTO_NETWORK_MESSAGE,
  PHOTO_UPLOAD_TIMEOUT_MS,
  PhotoUploadError,
  photoUploadErrorMessage,
  submitMilestone,
  uploadMilestonePhoto,
} from "@/services/events/milestonePhoto";

const ok = (name = "x") => ({ status: 200, body: JSON.stringify({ name }) });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUploadAsync.mockResolvedValue(ok());
});
afterEach(() => jest.useRealTimers());

describe("uploadMilestonePhoto", () => {
  it("uploads and returns the storage path under the child's folder", async () => {
    const progress = jest.fn();
    const path = await uploadMilestonePhoto("c1", "file:///a.jpg", progress);
    expect(path).toMatch(/^children\/c1\/jalons\/.+\.jpg$/);
    expect(mockUploadAsync).toHaveBeenCalledWith(
      expect.stringContaining("firebasestorage.googleapis.com"),
      "file:///a.jpg",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) }),
    );
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("gives up after the maximum delay with a 'timeout' error", async () => {
    mockUploadAsync.mockReturnValue(new Promise(() => {}));
    const promise = uploadMilestonePhoto("c1", "file:///a.jpg").catch((e) => e);
    await jest.advanceTimersByTimeAsync(PHOTO_UPLOAD_TIMEOUT_MS + 1);
    const error = await promise;
    expect(error).toBeInstanceOf(PhotoUploadError);
    expect(error.kind).toBe("timeout");
  });

  it("deletes the photo if the upload finishes after the timeout (no orphan)", async () => {
    let finish: (v: unknown) => void = () => {};
    mockUploadAsync.mockReturnValue(new Promise((r) => { finish = r; }));
    const promise = uploadMilestonePhoto("c1", "file:///a.jpg", undefined, { timeoutMs: 1000 }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(1001);
    await promise;
    expect(mockDeletePhoto).not.toHaveBeenCalled();

    finish(ok());
    await jest.advanceTimersByTimeAsync(0);
    expect(mockDeletePhoto).toHaveBeenCalledWith(expect.stringMatching(/^children\/c1\/jalons\//));
  });

  it("classifies a network failure", async () => {
    mockUploadAsync.mockRejectedValue(new Error("Network request failed"));
    await expect(uploadMilestonePhoto("c1", "file:///a.jpg")).rejects.toMatchObject({ kind: "network" });
  });

  it("classifies a server refusal as 'other'", async () => {
    mockUploadAsync.mockResolvedValue({ status: 403, body: "{}" });
    await expect(uploadMilestonePhoto("c1", "file:///a.jpg")).rejects.toMatchObject({ kind: "other" });
  });

  it("5xx from the storage edge is treated as a connection problem", async () => {
    mockUploadAsync.mockResolvedValue({ status: 503, body: "" });
    await expect(uploadMilestonePhoto("c1", "file:///a.jpg")).rejects.toMatchObject({ kind: "network" });
  });
});

describe("photoUploadErrorMessage", () => {
  it("has a distinct message for network and timeout, a generic one otherwise", () => {
    expect(PHOTO_NETWORK_MESSAGE).toBe(
      "La photo n'a pas pu être envoyée : connexion trop lente ou absente. Vérifiez votre connexion puis réessayez.",
    );
    expect(photoUploadErrorMessage(new PhotoUploadError("network"))).toEqual({ title: "Photo non envoyée", message: PHOTO_NETWORK_MESSAGE });
    expect(photoUploadErrorMessage(new PhotoUploadError("timeout"))).toEqual({ title: "Photo non envoyée", message: PHOTO_NETWORK_MESSAGE });
    expect(photoUploadErrorMessage(new PhotoUploadError("other"))).toEqual({ title: "Erreur", message: "Impossible de sauvegarder." });
    expect(photoUploadErrorMessage(new Error("x"))).toEqual({ title: "Erreur", message: "Impossible de sauvegarder." });
  });
});

describe("submitMilestone : création", () => {
  const data = { type: "jalon", typeJalon: "photo", titre: "Premier sourire" };

  it("uploads the photo then creates the event with the storage path", async () => {
    await submitMilestone({ childId: "c1", photoUri: "file:///a.jpg", data });
    expect(mockAdd).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ ...data, photos: [expect.stringMatching(/^children\/c1\/jalons\//)] }),
      expect.objectContaining({ onFailed: expect.any(Function), retryable: false }),
    );
  });

  it("deletes the uploaded photo when the creation fails afterwards", async () => {
    await submitMilestone({ childId: "c1", photoUri: "file:///a.jpg", data });
    const options = mockAdd.mock.calls[0][2];
    const path = mockAdd.mock.calls[0][1].photos[0];
    options.onFailed(new Error("refused"));
    expect(mockDeletePhoto).toHaveBeenCalledWith(path);
  });

  it("deletes the uploaded photo and rethrows when the creation throws at once", async () => {
    mockAdd.mockImplementationOnce(() => { throw new Error("no user"); });
    await expect(submitMilestone({ childId: "c1", photoUri: "file:///a.jpg", data })).rejects.toThrow("no user");
    expect(mockDeletePhoto).toHaveBeenCalledWith(expect.stringMatching(/^children\/c1\/jalons\//));
  });

  it("without a new photo: no upload, nothing to clean, retry allowed", async () => {
    await submitMilestone({ childId: "c1", photoUri: null, data: { ...data, typeJalon: "dent" } });
    expect(mockUploadAsync).not.toHaveBeenCalled();
    expect(mockAdd.mock.calls[0][1].photos).toBeUndefined();
    expect(mockAdd.mock.calls[0][2]).toEqual({ onFailed: undefined, retryable: undefined });
  });

  it("does not create anything when the upload fails", async () => {
    mockUploadAsync.mockRejectedValue(new Error("network down"));
    await expect(submitMilestone({ childId: "c1", photoUri: "file:///a.jpg", data })).rejects.toBeInstanceOf(PhotoUploadError);
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe("submitMilestone : modification", () => {
  const editData = { id: "ev1", photos: ["children/c1/jalons/old.jpg"] };
  const data = { type: "jalon", titre: "x" };

  it("deletes the old photo only once the server accepted the new one", async () => {
    await submitMilestone({ childId: "c1", editData, photoUri: "file:///new.jpg", data });
    const [childId, id, sent, previous, expected, options] = mockModify.mock.calls[0];
    expect([childId, id, previous, expected]).toEqual(["c1", "ev1", editData, undefined]);
    expect(sent.photos).toEqual([expect.stringMatching(/^children\/c1\/jalons\//)]);
    expect(mockDeletePhoto).not.toHaveBeenCalled();

    options.onConfirmed();
    expect(mockDeletePhoto).toHaveBeenCalledWith("children/c1/jalons/old.jpg");
  });

  it("keeps the old photo and removes the new one when the update fails", async () => {
    await submitMilestone({ childId: "c1", editData, photoUri: "file:///new.jpg", data });
    const options = mockModify.mock.calls[0][5];
    const newPath = mockModify.mock.calls[0][2].photos[0];
    options.onFailed(new Error("refused"));
    expect(mockDeletePhoto).toHaveBeenCalledTimes(1);
    expect(mockDeletePhoto).toHaveBeenCalledWith(newPath);
  });

  it("leaves the photo alone when it did not change", async () => {
    await submitMilestone({ childId: "c1", editData, photoUri: "children/c1/jalons/old.jpg", data });
    expect(mockUploadAsync).not.toHaveBeenCalled();
    const options = mockModify.mock.calls[0][5];
    options?.onConfirmed?.();
    options?.onFailed?.(new Error("x"));
    expect(mockDeletePhoto).not.toHaveBeenCalled();
  });

  it("a cleanup that fails never breaks the flow and is reported", async () => {
    mockDeletePhoto.mockRejectedValueOnce(new Error("storage down"));
    await submitMilestone({ childId: "c1", editData, photoUri: "file:///new.jpg", data });
    mockModify.mock.calls[0][5].onConfirmed();
    await jest.advanceTimersByTimeAsync(0);
    expect(captureServiceError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "storage down" }),
      expect.objectContaining({ operation: "milestonePhotoCleanup" }),
    );
  });
});
