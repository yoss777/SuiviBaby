// Écritures et lectures typées des accès (children/{id}/access + index
// user_child_access), regroupées dans accessRepository.
import { deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

import {
  createOwnerAccess,
  getAllChildAccess,
  getChildAccess,
  grantChildAccess,
  revokeChildAccess,
} from "@/services/accessRepository";

jest.mock("@/config/firebase", () => ({ db: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  (doc as jest.Mock).mockImplementation((_db, ...path: string[]) => ({ path: path.join("/") }));
  (setDoc as jest.Mock).mockResolvedValue(undefined);
  (deleteDoc as jest.Mock).mockResolvedValue(undefined);
});

describe("grantChildAccess", () => {
  it("écrit le document d'accès avec les droits par défaut du rôle puis l'index", async () => {
    await grantChildAccess("c1", "u2", "viewer", "owner1", { invitationId: "inv1" });

    expect(setDoc).toHaveBeenNthCalledWith(
      1,
      { path: "children/c1/access/u2" },
      expect.objectContaining({
        userId: "u2",
        role: "viewer",
        canWriteEvents: false,
        grantedBy: "owner1",
        invitationId: "inv1",
      }),
    );
    expect(setDoc).toHaveBeenNthCalledWith(
      2,
      { path: "user_child_access/u2_c1" },
      expect.objectContaining({ userId: "u2", childId: "c1", invitationId: "inv1" }),
      { merge: true },
    );
  });

  it("laisse remonter l'échec d'écriture", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    (setDoc as jest.Mock).mockRejectedValueOnce(new Error("denied"));
    await expect(grantChildAccess("c1", "u2", "viewer", "o")).rejects.toThrow("denied");
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});

describe("createOwnerAccess / revokeChildAccess", () => {
  it("createOwnerAccess accorde le rôle owner à son propre auteur", async () => {
    await createOwnerAccess("c1", "o1");
    expect(setDoc).toHaveBeenCalledWith(
      { path: "children/c1/access/o1" },
      expect.objectContaining({ role: "owner", grantedBy: "o1" }),
    );
  });

  it("revokeChildAccess supprime le document puis l'index", async () => {
    await revokeChildAccess("c1", "u2");
    expect((deleteDoc as jest.Mock).mock.calls.map((c) => c[0].path)).toEqual([
      "children/c1/access/u2",
      "user_child_access/u2_c1",
    ]);
  });
});

describe("lectures typées", () => {
  it("getChildAccess renvoie le document ou null", async () => {
    (getDoc as jest.Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ userId: "u", role: "admin" }) })
      .mockResolvedValueOnce({ exists: () => false });
    await expect(getChildAccess("c1", "u")).resolves.toEqual({ userId: "u", role: "admin" });
    await expect(getChildAccess("c1", "x")).resolves.toBeNull();
  });

  it("getAllChildAccess indexe les documents par userId", async () => {
    const docs = [
      { id: "a", data: () => ({ role: "owner" }) },
      { id: "b", data: () => ({ role: "viewer" }) },
    ];
    (getDocs as jest.Mock).mockResolvedValueOnce({ forEach: (fn: (d: unknown) => void) => docs.forEach(fn) });
    await expect(getAllChildAccess("c1")).resolves.toEqual({
      a: { role: "owner" },
      b: { role: "viewer" },
    });
  });
});
