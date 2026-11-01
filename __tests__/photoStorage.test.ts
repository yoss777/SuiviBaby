import {
  FIREBASE_STORAGE_BUCKET,
  LEGACY_STORAGE_BUCKET,
  buildStorageMediaUrl,
  normalizePhotoRef,
} from "@/utils/photoStorage";
import { deletePhotoFromStorage } from "@/services/events/photoCleanup";

jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { getIdToken: jest.fn(async () => "id-token") } },
}));
jest.mock("@/services/eventsService", () => ({
  obtenirEvenement: jest.fn(),
  supprimerEvenement: jest.fn(),
}));

const PATH = "children/child-1/jalons/photo 1.jpg";
const legacyUrl = `https://firebasestorage.googleapis.com/v0/b/${LEGACY_STORAGE_BUCKET}/o/${encodeURIComponent(PATH)}?alt=media&token=abc`;

describe("photo bucket migration", () => {
  it("serves photos from the EU bucket", () => {
    expect(FIREBASE_STORAGE_BUCKET).toBe("samaye-53723-photos-eu");
    expect(buildStorageMediaUrl(PATH)).toContain("/b/samaye-53723-photos-eu/o/");
  });

  it("turns a legacy full download URL into a storage path", () => {
    expect(normalizePhotoRef(legacyUrl)).toBe(PATH);
  });

  it("leaves storage paths and local files untouched", () => {
    expect(normalizePhotoRef(PATH)).toBe(PATH);
    expect(normalizePhotoRef("file:///tmp/photo.jpg")).toBe("file:///tmp/photo.jpg");
  });

  it("deletes a photo from both buckets while the migration runs", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 204, text: async () => "" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await deletePhotoFromStorage(legacyUrl);

    const urls = fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(urls).toEqual([
      `https://firebasestorage.googleapis.com/v0/b/samaye-53723-photos-eu/o/${encodeURIComponent(PATH)}`,
      `https://firebasestorage.googleapis.com/v0/b/${LEGACY_STORAGE_BUCKET}/o/${encodeURIComponent(PATH)}`,
    ]);
  });
});
