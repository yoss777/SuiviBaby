import {
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  doc,
  collection,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { revokeChildAccess } from "@/utils/permissions";
import { captureServiceError } from "@/utils/errorReporting";
import { createShareInvitationCF } from "@/services/premiumUsageService";

// Mock config/firebase
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "test-uid", email: "test@example.com" } },
  db: {},
  functions: {},
}));

// Every callable created by the service (redeem, accept) shares this mock.
const mockCallable = jest.fn();
jest.mock("firebase/functions", () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

jest.mock("@/services/premiumUsageService", () => ({
  createShareInvitationCF: jest.fn(),
}));

// Shape of an HttpsError as the client SDK surfaces it.
function callableError(code: string, message = code) {
  return Object.assign(new Error(message), { code });
}

jest.mock("@/utils/permissions", () => ({
  grantChildAccess: jest.fn(),
  revokeChildAccess: jest.fn(),
}));

jest.mock("@/utils/errorReporting", () => ({
  captureServiceError: jest.fn(),
}));

const mockBatchCommit = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchDelete = jest.fn();
(writeBatch as jest.Mock).mockReturnValue({
  commit: mockBatchCommit,
  update: mockBatchUpdate,
  delete: mockBatchDelete,
});

import {
  createShareCode,
  redeemShareCode,
  createEmailInvitation,
  acceptInvitation,
  rejectInvitation,
  getActiveShareCode,
  removeParentAccess,
  getPendingInvitations,
  deleteShareCode,
  cleanupExpiredShareCodes,
  cleanupDuplicatePendingInvitations,
  cleanupAlreadyLinkedInvitations,
  listenToPendingInvitations,
  listenToActiveShareCode,
} from "@/services/childSharingService";

// Helper to get auth mock and manipulate currentUser
function getAuthMock() {
  return require("@/config/firebase").auth;
}

// Helper: create a mock Firestore doc snapshot
function mockDocSnap(exists: boolean, data: Record<string, any> = {}, id = "doc-id") {
  return {
    exists: () => exists,
    data: () => data,
    id,
    ref: { id },
  };
}

// Helper: create a mock Firestore query snapshot
function mockQuerySnap(docs: any[] = []) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

// Helper: future timestamp
function futureTimestamp() {
  const future = new Date();
  future.setDate(future.getDate() + 3);
  return { toDate: () => future, toMillis: () => future.getTime(), seconds: Math.floor(future.getTime() / 1000), nanoseconds: 0 };
}

// Helper: past timestamp
function pastTimestamp() {
  const past = new Date();
  past.setDate(past.getDate() - 3);
  return { toDate: () => past, toMillis: () => past.getTime(), seconds: Math.floor(past.getTime() / 1000), nanoseconds: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset currentUser to default
  const auth = getAuthMock();
  auth.currentUser = { uid: "test-uid", email: "test@example.com" };

  // Make doc() return a mock ref so assertions with expect.anything() work
  (doc as jest.Mock).mockReturnValue({ id: "mock-doc-ref", path: "mock/path" });
  // Make collection() return a mock ref
  (collection as jest.Mock).mockReturnValue({ id: "mock-collection-ref" });
  // Make query() return something
  (query as jest.Mock).mockReturnValue({ type: "mock-query" });

  // Reset batch mock
  (writeBatch as jest.Mock).mockReturnValue({
    commit: mockBatchCommit,
    update: mockBatchUpdate,
    delete: mockBatchDelete,
  });
});

describe("childSharingService", () => {
  // ─── createShareCode ─────────────────────────────────────────────────

  describe("createShareCode", () => {
    it("should create a share code and return it", async () => {
      (setDoc as jest.Mock).mockResolvedValueOnce(undefined);

      const code = await createShareCode("child-1", "Bébé");

      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z2-9]+$/);
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          code: expect.any(String),
          childId: "child-1",
          childName: "Bébé",
          createdBy: "test-uid",
          used: false,
        }),
      );
    });

    it("should throw when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      await expect(createShareCode("child-1", "Bébé")).rejects.toThrow(
        "Utilisateur non connecté",
      );
      expect(setDoc).not.toHaveBeenCalled();
    });

    it("should retry on permission-denied collision", async () => {
      const permError: Error & { code?: string } = new Error("denied");
      permError.code = "permission-denied";

      (setDoc as jest.Mock)
        .mockRejectedValueOnce(permError)
        .mockRejectedValueOnce(permError)
        .mockResolvedValueOnce(undefined);

      const code = await createShareCode("child-1", "Bébé");

      expect(code).toHaveLength(6);
      expect(setDoc).toHaveBeenCalledTimes(3);
    });

    it("should throw after max collision attempts", async () => {
      const permError: Error & { code?: string } = new Error("denied");
      permError.code = "permission-denied";

      (setDoc as jest.Mock).mockRejectedValue(permError);

      await expect(createShareCode("child-1", "Bébé")).rejects.toThrow(
        "Impossible de générer un code unique",
      );
      expect(setDoc).toHaveBeenCalledTimes(5);
    });

    it("should rethrow non-permission errors immediately", async () => {
      (setDoc as jest.Mock).mockRejectedValueOnce(new Error("network error"));

      await expect(createShareCode("child-1", "Bébé")).rejects.toThrow(
        "network error",
      );
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it("should call captureServiceError on failure", async () => {
      (setDoc as jest.Mock).mockRejectedValueOnce(new Error("boom"));

      await expect(createShareCode("child-1", "Bébé")).rejects.toThrow("boom");
      expect(captureServiceError).toHaveBeenCalledWith(
        expect.any(Error),
        { service: "childSharing", operation: "createShareCode" },
      );
    });
  });

  // ─── redeemShareCode ─────────────────────────────────────────────────
  // B1.1 — delegated to the transactional redeemShareCodeCF.

  describe("redeemShareCode", () => {
    it("should redeem through the CF with the uppercased code", async () => {
      mockCallable.mockResolvedValueOnce({ data: { childId: "child-1", childName: "Bébé" } });

      const result = await redeemShareCode("abc123");

      expect(result).toEqual({ childId: "child-1", childName: "Bébé" });
      expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "redeemShareCodeCF");
      expect(mockCallable).toHaveBeenCalledWith({ code: "ABC123" });
    });

    it.each([
      ["functions/not-found", "Code invalide ou expiré"],
      ["functions/already-exists", "Vous avez déjà accès à cet enfant"],
      ["functions/resource-exhausted", "Trop de tentatives. Réessayez dans une minute."],
    ])("should map %s to a user message without reporting", async (code, message) => {
      mockCallable.mockRejectedValueOnce(callableError(code));

      await expect(redeemShareCode("BADCODE")).rejects.toThrow(message);
      expect(captureServiceError).not.toHaveBeenCalled();
    });

    it("should pass the server message through on failed-precondition", async () => {
      mockCallable.mockRejectedValueOnce(callableError("functions/failed-precondition", "Ce code a expiré"));

      await expect(redeemShareCode("EXPIRD")).rejects.toThrow("Ce code a expiré");
    });

    it("should report and rethrow unexpected errors", async () => {
      mockCallable.mockRejectedValueOnce(callableError("functions/internal"));

      await expect(redeemShareCode("ANY123")).rejects.toThrow("functions/internal");
      expect(captureServiceError).toHaveBeenCalledWith(
        expect.any(Error),
        { service: "childSharing", operation: "redeemShareCode" },
      );
    });

    it("should throw when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      await expect(redeemShareCode("ANY")).rejects.toThrow(
        "Utilisateur non connecté",
      );
      expect(mockCallable).not.toHaveBeenCalled();
    });
  });

  // ─── createEmailInvitation ────────────────────────────────────────────
  // Delegated to the createShareInvitation CF, which checks the invitee,
  // existing access and pending invitations server-side.

  describe("createEmailInvitation", () => {
    it("should create an invitation through the CF and return its id", async () => {
      (createShareInvitationCF as unknown as jest.Mock).mockResolvedValueOnce({ data: { id: "invite-123" } });

      const id = await createEmailInvitation("child-1", "Bébé", "friend@example.com");

      expect(id).toBe("invite-123");
      expect(createShareInvitationCF).toHaveBeenCalledWith({
        childId: "child-1",
        childName: "Bébé",
        invitedEmail: "friend@example.com",
      });
    });

    it("should normalize invited email to lowercase", async () => {
      (createShareInvitationCF as unknown as jest.Mock).mockResolvedValueOnce({ data: { id: "invite-456" } });

      await createEmailInvitation("child-1", "Bébé", "  FRIEND@Example.COM  ");

      expect(createShareInvitationCF).toHaveBeenCalledWith(
        expect.objectContaining({ invitedEmail: "friend@example.com" }),
      );
    });

    it.each(["self-invite", "no-user", "already-pending", "already-linked", "sharing-limit"])(
      "should expose the %s reason as error.code without reporting",
      async (reason) => {
        (createShareInvitationCF as unknown as jest.Mock).mockRejectedValueOnce(
          Object.assign(callableError("functions/failed-precondition"), { details: { reason } }),
        );

        await expect(
          createEmailInvitation("child-1", "Bébé", "friend@example.com"),
        ).rejects.toMatchObject({ code: reason });
        expect(captureServiceError).not.toHaveBeenCalled();
      },
    );

    it("should attach the invited email to an already-linked error", async () => {
      (createShareInvitationCF as unknown as jest.Mock).mockRejectedValueOnce(
        Object.assign(callableError("functions/failed-precondition"), { details: { reason: "already-linked" } }),
      );

      await expect(
        createEmailInvitation("child-1", "Bébé", "friend@example.com"),
      ).rejects.toMatchObject({ code: "already-linked", email: "friend@example.com" });
    });

    it("should throw when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      await expect(
        createEmailInvitation("child-1", "Bébé", "friend@example.com"),
      ).rejects.toThrow("Utilisateur non connecté");
    });

    it("should throw when childId is empty", async () => {
      await expect(
        createEmailInvitation("", "Bébé", "friend@example.com"),
      ).rejects.toThrow("Enfant introuvable");
      expect(createShareInvitationCF).not.toHaveBeenCalled();
    });

    it("should call captureServiceError for unexpected errors", async () => {
      (createShareInvitationCF as unknown as jest.Mock).mockRejectedValueOnce(new Error("network fail"));

      await expect(
        createEmailInvitation("child-1", "Bébé", "friend@example.com"),
      ).rejects.toThrow("network fail");
      expect(captureServiceError).toHaveBeenCalledWith(
        expect.any(Error),
        { service: "childSharing", operation: "createEmailInvitation" },
      );
    });
  });

  // ─── acceptInvitation ─────────────────────────────────────────────────
  // B1.4 — delegated to the transactional acceptInvitationCF.

  describe("acceptInvitation", () => {
    it("should accept through the CF", async () => {
      mockCallable.mockResolvedValueOnce({ data: { success: true } });

      await acceptInvitation("invite-1");

      expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "acceptInvitationCF");
      expect(mockCallable).toHaveBeenCalledWith({ invitationId: "invite-1" });
    });

    it.each([
      ["functions/not-found", "Invitation introuvable"],
      ["functions/permission-denied", "Cette invitation ne vous est pas destinée"],
      ["functions/failed-precondition", "Cette invitation a déjà été traitée"],
      ["functions/resource-exhausted", "Trop de tentatives. Réessayez dans une minute."],
    ])("should map %s to a user message without reporting", async (code, message) => {
      mockCallable.mockRejectedValueOnce(callableError(code));

      await expect(acceptInvitation("invite-1")).rejects.toThrow(message);
      expect(captureServiceError).not.toHaveBeenCalled();
    });

    it("should report and rethrow unexpected errors", async () => {
      mockCallable.mockRejectedValueOnce(callableError("functions/internal"));

      await expect(acceptInvitation("invite-1")).rejects.toThrow("functions/internal");
      expect(captureServiceError).toHaveBeenCalledWith(
        expect.any(Error),
        { service: "childSharing", operation: "acceptInvitation" },
      );
    });

    it("should throw when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      await expect(acceptInvitation("any")).rejects.toThrow(
        "Utilisateur non connecté",
      );
      expect(mockCallable).not.toHaveBeenCalled();
    });
  });

  // ─── rejectInvitation ─────────────────────────────────────────────────

  describe("rejectInvitation", () => {
    it("should reject an invitation by updating status", async () => {
      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);

      await rejectInvitation("invite-1");

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: "rejected" },
      );
    });

    it("should throw and report on Firestore error", async () => {
      (updateDoc as jest.Mock).mockRejectedValueOnce(new Error("permission denied"));

      await expect(rejectInvitation("invite-1")).rejects.toThrow("permission denied");
      expect(captureServiceError).toHaveBeenCalledWith(
        expect.any(Error),
        { service: "childSharing", operation: "rejectInvitation" },
      );
    });
  });

  // ─── getActiveShareCode ───────────────────────────────────────────────

  describe("getActiveShareCode", () => {
    it("should return a non-expired code", async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnap([
          mockDocSnap(true, {
            code: "ACTIVE",
            expiresAt: futureTimestamp(),
          }),
        ]),
      );

      const code = await getActiveShareCode("child-1");

      expect(code).toBe("ACTIVE");
    });

    it("should return null when no codes exist", async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([]));

      const code = await getActiveShareCode("child-1");

      expect(code).toBeNull();
    });

    it("should return null when all codes are expired", async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnap([
          mockDocSnap(true, {
            code: "OLDONE",
            expiresAt: pastTimestamp(),
          }),
        ]),
      );

      const code = await getActiveShareCode("child-1");

      expect(code).toBeNull();
    });

    it("should return null when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      const code = await getActiveShareCode("child-1");

      expect(code).toBeNull();
    });

    it("should return null on error (does not throw)", async () => {
      (getDocs as jest.Mock).mockRejectedValueOnce(new Error("fail"));

      const code = await getActiveShareCode("child-1");

      expect(code).toBeNull();
      expect(captureServiceError).toHaveBeenCalled();
    });

    it("should skip expired codes and return the first valid one", async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnap([
          mockDocSnap(true, { code: "EXPIRED1", expiresAt: pastTimestamp() }),
          mockDocSnap(true, { code: "VALID01", expiresAt: futureTimestamp() }),
        ]),
      );

      const code = await getActiveShareCode("child-1");

      expect(code).toBe("VALID01");
    });
  });

  // ─── removeParentAccess ───────────────────────────────────────────────

  describe("removeParentAccess", () => {
    it("should remove a non-owner parent when current user is owner", async () => {
      (getDoc as jest.Mock)
        .mockResolvedValueOnce(mockDocSnap(true, { role: "owner" })) // my access
        .mockResolvedValueOnce(mockDocSnap(true, { role: "contributor" })); // target
      (revokeChildAccess as jest.Mock).mockResolvedValueOnce(undefined);

      await removeParentAccess("child-1", "other-uid");

      expect(getDocs).not.toHaveBeenCalled();
      expect(revokeChildAccess).toHaveBeenCalledWith("child-1", "other-uid");
    });

    it("should remove another owner when one owner remains", async () => {
      (getDoc as jest.Mock)
        .mockResolvedValueOnce(mockDocSnap(true, { role: "owner" }))
        .mockResolvedValueOnce(mockDocSnap(true, { role: "owner" }));
      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([mockDocSnap(true), mockDocSnap(true)]));
      (revokeChildAccess as jest.Mock).mockResolvedValueOnce(undefined);

      await removeParentAccess("child-1", "other-owner");

      expect(revokeChildAccess).toHaveBeenCalledWith("child-1", "other-owner");
    });

    it("should refuse to remove the last owner (B1.3)", async () => {
      (getDoc as jest.Mock)
        .mockResolvedValueOnce(mockDocSnap(true, { role: "owner" }))
        .mockResolvedValueOnce(mockDocSnap(true, { role: "owner" }));
      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([mockDocSnap(true)]));

      await expect(removeParentAccess("child-1", "other-owner")).rejects.toThrow(
        "Impossible de retirer le dernier propriétaire",
      );
      expect(revokeChildAccess).not.toHaveBeenCalled();
    });

    it("should throw when current user is not owner", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        mockDocSnap(true, { role: "contributor" }),
      );

      await expect(removeParentAccess("child-1", "other-uid")).rejects.toThrow(
        "Vous n'avez pas la permission",
      );
      expect(revokeChildAccess).not.toHaveBeenCalled();
    });

    it("should throw when access doc does not exist", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(false));

      await expect(removeParentAccess("child-1", "other-uid")).rejects.toThrow(
        "Vous n'avez pas la permission",
      );
    });

    it("should throw when trying to remove own access", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        mockDocSnap(true, { role: "owner" }),
      );

      await expect(removeParentAccess("child-1", "test-uid")).rejects.toThrow(
        "Impossible de retirer votre propre accès owner",
      );
      expect(revokeChildAccess).not.toHaveBeenCalled();
    });

    it("should throw when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      await expect(removeParentAccess("child-1", "other-uid")).rejects.toThrow(
        "Utilisateur non connecté",
      );
    });

    it("should call captureServiceError on failure", async () => {
      (getDoc as jest.Mock).mockRejectedValueOnce(new Error("oops"));

      await expect(removeParentAccess("child-1", "other-uid")).rejects.toThrow("oops");
      expect(captureServiceError).toHaveBeenCalledWith(
        expect.any(Error),
        { service: "childSharing", operation: "removeParentAccess" },
      );
    });
  });

  // ─── getPendingInvitations ────────────────────────────────────────────

  describe("getPendingInvitations", () => {
    it("should merge email and userId query results and deduplicate", async () => {
      const invite1 = mockDocSnap(true, { childId: "child-1", status: "pending" }, "inv-1");
      const invite2 = mockDocSnap(true, { childId: "child-2", status: "pending" }, "inv-2");
      const invite1Dup = mockDocSnap(true, { childId: "child-1", status: "pending" }, "inv-1"); // same id

      (getDocs as jest.Mock)
        .mockResolvedValueOnce(mockQuerySnap([invite1, invite2])) // email query
        .mockResolvedValueOnce(mockQuerySnap([invite1Dup])); // userId query (duplicate)

      const invitations = await getPendingInvitations();

      expect(invitations).toHaveLength(2);
      expect(invitations.map((i) => i.id)).toContain("inv-1");
      expect(invitations.map((i) => i.id)).toContain("inv-2");
    });

    it("should return empty array when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      const invitations = await getPendingInvitations();

      expect(invitations).toEqual([]);
    });

    it("should return empty array when user has no email", async () => {
      getAuthMock().currentUser = { uid: "test-uid", email: null };

      const invitations = await getPendingInvitations();

      expect(invitations).toEqual([]);
    });

    it("should return empty array on error (does not throw)", async () => {
      (getDocs as jest.Mock).mockRejectedValueOnce(new Error("fail"));

      const invitations = await getPendingInvitations();

      expect(invitations).toEqual([]);
      expect(captureServiceError).toHaveBeenCalled();
    });

    it("should combine non-overlapping results from both queries", async () => {
      const inviteA = mockDocSnap(true, { childId: "child-a" }, "inv-a");
      const inviteB = mockDocSnap(true, { childId: "child-b" }, "inv-b");

      (getDocs as jest.Mock)
        .mockResolvedValueOnce(mockQuerySnap([inviteA]))
        .mockResolvedValueOnce(mockQuerySnap([inviteB]));

      const invitations = await getPendingInvitations();

      expect(invitations).toHaveLength(2);
    });
  });

  // ─── deleteShareCode ─────────────────────────────────────────────────

  describe("deleteShareCode", () => {
    it("should delete the share code document", async () => {
      (deleteDoc as jest.Mock).mockResolvedValueOnce(undefined);

      await deleteShareCode("ABC123");

      expect(deleteDoc).toHaveBeenCalledTimes(1);
      expect(doc).toHaveBeenCalledWith(expect.anything(), "shareCodes", "ABC123");
    });

    it("should throw when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      await expect(deleteShareCode("ABC123")).rejects.toThrow(
        "Utilisateur non connecté",
      );
    });
  });

  // ─── cleanupExpiredShareCodes ─────────────────────────────────────────

  describe("cleanupExpiredShareCodes", () => {
    it("should delete expired codes and return count", async () => {
      const expiredDoc = {
        ...mockDocSnap(true, { expiresAt: pastTimestamp() }, "exp-1"),
        ref: { id: "exp-1" },
      };
      const validDoc = {
        ...mockDocSnap(true, { expiresAt: futureTimestamp() }, "val-1"),
        ref: { id: "val-1" },
      };

      (getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnap([expiredDoc, validDoc]),
      );
      mockBatchCommit.mockResolvedValueOnce(undefined);

      const count = await cleanupExpiredShareCodes("child-1");

      expect(count).toBe(1);
      expect(mockBatchDelete).toHaveBeenCalledTimes(1);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it("should return 0 when no codes exist", async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([]));

      const count = await cleanupExpiredShareCodes("child-1");

      expect(count).toBe(0);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it("should return 0 when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      const count = await cleanupExpiredShareCodes("child-1");

      expect(count).toBe(0);
    });

    it("should return 0 on error (does not throw)", async () => {
      (getDocs as jest.Mock).mockRejectedValueOnce(new Error("fail"));

      const count = await cleanupExpiredShareCodes("child-1");

      expect(count).toBe(0);
      expect(captureServiceError).toHaveBeenCalled();
    });
  });

  // ─── cleanupDuplicatePendingInvitations ───────────────────────────────

  describe("cleanupDuplicatePendingInvitations", () => {
    it("should reject older duplicates for the same childId", async () => {
      const newer = {
        ...mockDocSnap(true, {
          childId: "child-1",
          createdAt: { toMillis: () => 2000 },
        }, "inv-new"),
        ref: { id: "inv-new" },
      };
      const older = {
        ...mockDocSnap(true, {
          childId: "child-1",
          createdAt: { toMillis: () => 1000 },
        }, "inv-old"),
        ref: { id: "inv-old" },
      };

      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([newer, older]));
      mockBatchCommit.mockResolvedValueOnce(undefined);

      const count = await cleanupDuplicatePendingInvitations("user@example.com");

      expect(count).toBe(1);
      expect(mockBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "inv-old" }),
        { status: "rejected" },
      );
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it("should return 0 when no duplicates", async () => {
      const inv = {
        ...mockDocSnap(true, {
          childId: "child-1",
          createdAt: { toMillis: () => 1000 },
        }, "inv-1"),
        ref: { id: "inv-1" },
      };

      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([inv]));

      const count = await cleanupDuplicatePendingInvitations("user@example.com");

      expect(count).toBe(0);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it("should return 0 when no invitations", async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([]));

      const count = await cleanupDuplicatePendingInvitations("user@example.com");

      expect(count).toBe(0);
    });

    it("should return 0 when no email provided and no user", async () => {
      getAuthMock().currentUser = null;

      const count = await cleanupDuplicatePendingInvitations();

      expect(count).toBe(0);
    });
  });

  // ─── cleanupAlreadyLinkedInvitations ──────────────────────────────────

  describe("cleanupAlreadyLinkedInvitations", () => {
    it("should reject invitations where user already has access", async () => {
      const inv = {
        ...mockDocSnap(true, { childId: "child-1" }, "inv-1"),
        ref: { id: "inv-1" },
      };

      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([inv]));
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(true)); // access exists
      mockBatchCommit.mockResolvedValueOnce(undefined);

      const count = await cleanupAlreadyLinkedInvitations("user@example.com");

      expect(count).toBe(1);
      expect(mockBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "inv-1" }),
        { status: "rejected" },
      );
    });

    it("should not reject invitations where user does not have access", async () => {
      const inv = {
        ...mockDocSnap(true, { childId: "child-1" }, "inv-1"),
        ref: { id: "inv-1" },
      };

      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([inv]));
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(false)); // no access

      const count = await cleanupAlreadyLinkedInvitations("user@example.com");

      expect(count).toBe(0);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it("should return 0 when no user", async () => {
      getAuthMock().currentUser = null;

      const count = await cleanupAlreadyLinkedInvitations();

      expect(count).toBe(0);
    });
  });

  // ─── listenToPendingInvitations ───────────────────────────────────────

  describe("listenToPendingInvitations", () => {
    it("should call callback with empty array when user is not logged in", () => {
      getAuthMock().currentUser = null;
      const callback = jest.fn();

      const unsub = listenToPendingInvitations(callback);

      expect(callback).toHaveBeenCalledWith([]);
      expect(typeof unsub).toBe("function");
    });

    it("should set up two onSnapshot listeners", () => {
      const callback = jest.fn();

      listenToPendingInvitations(callback);

      expect(onSnapshot).toHaveBeenCalledTimes(2);
    });

    it("should return an unsubscribe function that calls both unsubscribers", () => {
      const unsub1 = jest.fn();
      const unsub2 = jest.fn();
      (onSnapshot as jest.Mock)
        .mockReturnValueOnce(unsub1)
        .mockReturnValueOnce(unsub2);

      const callback = jest.fn();
      const unsub = listenToPendingInvitations(callback);

      unsub();

      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
    });
  });

  // ─── listenToActiveShareCode ──────────────────────────────────────────

  describe("listenToActiveShareCode", () => {
    it("should call callback with null when user is not logged in", () => {
      getAuthMock().currentUser = null;
      const callback = jest.fn();

      const unsub = listenToActiveShareCode("child-1", callback);

      expect(callback).toHaveBeenCalledWith(null);
      expect(typeof unsub).toBe("function");
    });

    it("should set up an onSnapshot listener", () => {
      const callback = jest.fn();

      listenToActiveShareCode("child-1", callback);

      expect(onSnapshot).toHaveBeenCalledTimes(1);
    });
  });
});
