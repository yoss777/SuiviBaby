import {
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocFromServer,
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
import { getUserByEmail } from "@/services/usersService";
import { grantChildAccess, revokeChildAccess } from "@/utils/permissions";
import { captureServiceError } from "@/utils/errorReporting";

// Mock config/firebase
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "test-uid", email: "test@example.com" } },
  db: {},
}));

// Mock dependencies
jest.mock("@/services/usersService", () => ({
  getUserByEmail: jest.fn(),
}));

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

  describe("redeemShareCode", () => {
    it("should redeem a valid code successfully", async () => {
      (getDoc as jest.Mock)
        // First call: get the share code doc
        .mockResolvedValueOnce(
          mockDocSnap(true, {
            code: "ABC123",
            childId: "child-1",
            childName: "Bébé",
            createdBy: "owner-uid",
            used: false,
            expiresAt: futureTimestamp(),
          }),
        )
        // Second call: check access doc (does not exist)
        .mockResolvedValueOnce(mockDocSnap(false));

      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);
      (grantChildAccess as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await redeemShareCode("abc123");

      expect(result).toEqual({ childId: "child-1", childName: "Bébé" });
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          used: true,
          usedBy: "test-uid",
          usedByEmail: "test@example.com",
        }),
      );
      expect(grantChildAccess).toHaveBeenCalledWith(
        "child-1",
        "test-uid",
        "contributor",
        "owner-uid",
        { invitationId: "ABC123" },
      );
    });

    it("should throw when code is not found", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(false));

      await expect(redeemShareCode("BADCODE")).rejects.toThrow(
        "Code invalide ou expiré",
      );
    });

    it("should throw when code is already used", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        mockDocSnap(true, {
          used: true,
          expiresAt: futureTimestamp(),
        }),
      );

      await expect(redeemShareCode("USED01")).rejects.toThrow(
        "Ce code a déjà été utilisé",
      );
    });

    it("should throw when code is expired", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        mockDocSnap(true, {
          used: false,
          expiresAt: pastTimestamp(),
        }),
      );

      await expect(redeemShareCode("EXPIRD")).rejects.toThrow(
        "Ce code a expiré",
      );
    });

    it("should throw when user already has access", async () => {
      (getDoc as jest.Mock)
        .mockResolvedValueOnce(
          mockDocSnap(true, {
            used: false,
            childId: "child-1",
            expiresAt: futureTimestamp(),
          }),
        )
        .mockResolvedValueOnce(mockDocSnap(true)); // access doc exists

      await expect(redeemShareCode("DUPLIC")).rejects.toThrow(
        "Vous avez déjà accès à cet enfant",
      );
    });

    it("should throw when user has no email", async () => {
      getAuthMock().currentUser = { uid: "test-uid", email: null };

      (getDoc as jest.Mock)
        .mockResolvedValueOnce(
          mockDocSnap(true, {
            used: false,
            childId: "child-1",
            createdBy: "owner-uid",
            expiresAt: futureTimestamp(),
          }),
        )
        .mockResolvedValueOnce(mockDocSnap(false));

      await expect(redeemShareCode("NOEMAL")).rejects.toThrow(
        "Vous devez avoir un email associé à votre compte",
      );
    });

    it("should throw when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      await expect(redeemShareCode("ANY")).rejects.toThrow(
        "Utilisateur non connecté",
      );
    });

    it("should uppercase the code for lookup", async () => {
      (getDoc as jest.Mock)
        .mockResolvedValueOnce(
          mockDocSnap(true, {
            code: "XYZ789",
            childId: "child-1",
            childName: "Bébé",
            createdBy: "owner-uid",
            used: false,
            expiresAt: futureTimestamp(),
          }),
        )
        .mockResolvedValueOnce(mockDocSnap(false));
      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);
      (grantChildAccess as jest.Mock).mockResolvedValueOnce(undefined);

      await redeemShareCode("xyz789");

      // doc() should be called with the uppercased code
      expect(doc).toHaveBeenCalledWith(expect.anything(), "shareCodes", "XYZ789");
    });
  });

  // ─── createEmailInvitation ────────────────────────────────────────────

  describe("createEmailInvitation", () => {
    it("should create an invitation successfully", async () => {
      (getUserByEmail as jest.Mock).mockResolvedValueOnce({ id: "invited-uid" });
      (getDocFromServer as jest.Mock).mockResolvedValueOnce(mockDocSnap(true, { parentIds: ["test-uid"] }));
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(false)); // access check
      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([])); // no pending
      (addDoc as jest.Mock).mockResolvedValueOnce({ id: "invite-123" });

      const id = await createEmailInvitation("child-1", "Bébé", "friend@example.com");

      expect(id).toBe("invite-123");
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          childId: "child-1",
          childName: "Bébé",
          inviterId: "test-uid",
          inviterEmail: "test@example.com",
          invitedEmail: "friend@example.com",
          invitedUserId: "invited-uid",
          status: "pending",
        }),
      );
    });

    it("should throw self-invite error when inviting own email", async () => {
      await expect(
        createEmailInvitation("child-1", "Bébé", "test@example.com"),
      ).rejects.toThrow("Vous ne pouvez pas vous inviter vous-même");

      try {
        await createEmailInvitation("child-1", "Bébé", "TEST@EXAMPLE.COM");
      } catch (error: any) {
        expect(error.code).toBe("self-invite");
      }
    });

    it("should throw no-user error when invited email not found", async () => {
      (getUserByEmail as jest.Mock).mockResolvedValueOnce(null);

      try {
        await createEmailInvitation("child-1", "Bébé", "nobody@example.com");
        fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe("no-user");
        expect(error.message).toContain("Aucun utilisateur trouvé");
      }
    });

    it("should throw already-linked error when user already has access", async () => {
      (getUserByEmail as jest.Mock).mockResolvedValueOnce({ id: "invited-uid" });
      (getDocFromServer as jest.Mock).mockResolvedValueOnce(mockDocSnap(true, { parentIds: ["test-uid", "invited-uid"] }));
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(true)); // access exists

      try {
        await createEmailInvitation("child-1", "Bébé", "friend@example.com");
        fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe("already-linked");
      }
    });

    it("should throw already-pending error when invitation exists", async () => {
      (getUserByEmail as jest.Mock).mockResolvedValueOnce({ id: "invited-uid" });
      (getDocFromServer as jest.Mock).mockResolvedValueOnce(mockDocSnap(true, {}));
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(false)); // no access
      (getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnap([mockDocSnap(true, { status: "pending" }, "existing-invite")]),
      );

      try {
        await createEmailInvitation("child-1", "Bébé", "friend@example.com");
        fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe("already-pending");
      }
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
    });

    it("should throw when child does not exist", async () => {
      (getUserByEmail as jest.Mock).mockResolvedValueOnce({ id: "invited-uid" });
      (getDocFromServer as jest.Mock).mockResolvedValueOnce(mockDocSnap(false));

      await expect(
        createEmailInvitation("child-1", "Bébé", "friend@example.com"),
      ).rejects.toThrow("Enfant introuvable");
    });

    it("should normalize invited email to lowercase", async () => {
      (getUserByEmail as jest.Mock).mockResolvedValueOnce({ id: "invited-uid" });
      (getDocFromServer as jest.Mock).mockResolvedValueOnce(mockDocSnap(true, {}));
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(false));
      (getDocs as jest.Mock).mockResolvedValueOnce(mockQuerySnap([]));
      (addDoc as jest.Mock).mockResolvedValueOnce({ id: "invite-456" });

      await createEmailInvitation("child-1", "Bébé", "  FRIEND@Example.COM  ");

      expect(getUserByEmail).toHaveBeenCalledWith("friend@example.com");
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ invitedEmail: "friend@example.com" }),
      );
    });

    it("should not call captureServiceError for expected error codes", async () => {
      (getUserByEmail as jest.Mock).mockResolvedValueOnce(null);

      try {
        await createEmailInvitation("child-1", "Bébé", "nobody@example.com");
      } catch {
        // expected
      }

      expect(captureServiceError).not.toHaveBeenCalled();
    });

    it("should call captureServiceError for unexpected errors", async () => {
      (getUserByEmail as jest.Mock).mockRejectedValueOnce(new Error("network fail"));

      try {
        await createEmailInvitation("child-1", "Bébé", "friend@example.com");
      } catch {
        // expected
      }

      expect(captureServiceError).toHaveBeenCalledWith(
        expect.any(Error),
        { service: "childSharing", operation: "createEmailInvitation" },
      );
    });
  });

  // ─── acceptInvitation ─────────────────────────────────────────────────

  describe("acceptInvitation", () => {
    it("should accept a pending invitation successfully", async () => {
      (getDoc as jest.Mock)
        // First: invitation doc
        .mockResolvedValueOnce(
          mockDocSnap(true, {
            childId: "child-1",
            inviterId: "owner-uid",
            invitedUserId: "test-uid",
            invitedEmail: "test@example.com",
            status: "pending",
          }),
        )
        // Second: check existing access
        .mockResolvedValueOnce(mockDocSnap(false));

      (grantChildAccess as jest.Mock).mockResolvedValueOnce(undefined);
      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);

      await acceptInvitation("invite-1");

      expect(grantChildAccess).toHaveBeenCalledWith(
        "child-1",
        "test-uid",
        "contributor",
        "owner-uid",
        { invitationId: "invite-1" },
      );
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: "accepted" },
      );
    });

    it("should throw when invitation is not found", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(mockDocSnap(false));

      await expect(acceptInvitation("nope")).rejects.toThrow(
        "Invitation introuvable",
      );
    });

    it("should throw when invitation is not pending", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        mockDocSnap(true, {
          invitedUserId: "test-uid",
          invitedEmail: "test@example.com",
          status: "accepted",
        }),
      );

      await expect(acceptInvitation("done")).rejects.toThrow(
        "Cette invitation a déjà été traitée",
      );
    });

    it("should throw when user is not the intended recipient", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        mockDocSnap(true, {
          invitedUserId: "other-uid",
          invitedEmail: "other@example.com",
          status: "pending",
        }),
      );

      await expect(acceptInvitation("wrong")).rejects.toThrow(
        "Cette invitation ne vous est pas destinée",
      );
    });

    it("should handle already-has-access gracefully (mark accepted, no grantChildAccess)", async () => {
      (getDoc as jest.Mock)
        .mockResolvedValueOnce(
          mockDocSnap(true, {
            childId: "child-1",
            invitedUserId: "test-uid",
            invitedEmail: "test@example.com",
            status: "pending",
          }),
        )
        .mockResolvedValueOnce(mockDocSnap(true)); // access already exists

      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);

      await acceptInvitation("dup-access");

      expect(grantChildAccess).not.toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: "accepted" },
      );
    });

    it("should allow accepting via invitedEmail match", async () => {
      (getDoc as jest.Mock)
        .mockResolvedValueOnce(
          mockDocSnap(true, {
            childId: "child-1",
            inviterId: "owner-uid",
            invitedUserId: "different-uid", // doesn't match current user uid
            invitedEmail: "test@example.com", // matches current user email
            status: "pending",
          }),
        )
        .mockResolvedValueOnce(mockDocSnap(false));

      (grantChildAccess as jest.Mock).mockResolvedValueOnce(undefined);
      (updateDoc as jest.Mock).mockResolvedValueOnce(undefined);

      await acceptInvitation("email-match");

      expect(grantChildAccess).toHaveBeenCalled();
    });

    it("should throw when user is not logged in", async () => {
      getAuthMock().currentUser = null;

      await expect(acceptInvitation("any")).rejects.toThrow(
        "Utilisateur non connecté",
      );
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
    it("should remove access when current user is owner", async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        mockDocSnap(true, { role: "owner" }),
      );
      (revokeChildAccess as jest.Mock).mockResolvedValueOnce(undefined);

      await removeParentAccess("child-1", "other-uid");

      expect(revokeChildAccess).toHaveBeenCalledWith("child-1", "other-uid");
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
