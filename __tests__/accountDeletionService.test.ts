import { updateDoc } from "firebase/firestore";
import { reauthenticateWithCredential } from "firebase/auth";
import {
  getDeletionAuthMethod,
  getOwnershipBlockers,
  mapDeletionError,
  requestAccountDeletion,
} from "@/services/accountDeletionService";
import { getQueueSize, onAccountDelete, processQueue } from "@/services/offlineQueueService";
import {
  getAppleCredential,
  getGoogleCredential,
} from "@/services/socialAuthService";

const mockAuth: { currentUser: any } = { currentUser: null };
jest.mock("@/config/firebase", () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
  functions: {},
}));

jest.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: (e: string, p: string) => ({ kind: "password", e, p }) },
  reauthenticateWithCredential: jest.fn(),
}));

const mockCallables: Record<string, jest.Mock> = {};
jest.mock("firebase/functions", () => ({
  httpsCallable: (_f: unknown, name: string) => {
    mockCallables[name] = mockCallables[name] ?? jest.fn();
    return (...args: unknown[]) => mockCallables[name](...args);
  },
}));

jest.mock("@/services/socialAuthService", () => ({
  getGoogleCredential: jest.fn(),
  getAppleCredential: jest.fn(),
}));

jest.mock("@/services/offlineQueueService", () => ({
  onAccountDelete: jest.fn(),
  getQueueSize: jest.fn(),
  processQueue: jest.fn(),
}));

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const providers = (...ids: string[]) => ids.map((providerId) => ({ providerId }));
const setUser = (ids: string[], email: string | null = "a@b.c") => {
  mockAuth.currentUser = { uid: "u1", email, providerData: providers(...ids) };
};
const callable = (name: string) => {
  mockCallables[name] = mockCallables[name] ?? jest.fn();
  return mockCallables[name];
};

describe("accountDeletionService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (reauthenticateWithCredential as jest.Mock).mockResolvedValue(undefined);
    (updateDoc as jest.Mock).mockResolvedValue(undefined);
    Object.values(mockCallables).forEach((m) => m.mockReset());
    mockAuth.currentUser = null;
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("getDeletionAuthMethod", () => {
    it.each([
      [["password"], "password"],
      [["password", "google.com"], "password"],
      [["google.com"], "google"],
      [["apple.com"], "apple"],
      [["phone"], null],
      [[], null],
    ])("%p -> %p", (ids, expected) => {
      expect(getDeletionAuthMethod({ providerData: providers(...(ids as string[])) })).toBe(expected);
    });
    it("handles a missing user", () => {
      expect(getDeletionAuthMethod(null)).toBeNull();
    });
  });

  describe("requestAccountDeletion", () => {
    it("rejects when unauthenticated", async () => {
      await expect(requestAccountDeletion({ password: "x" })).rejects.toThrow("non authentifié");
    });

    it("password: re-auths with email credential then schedules", async () => {
      setUser(["password"]);
      const info = await requestAccountDeletion({ password: "secret" });
      expect(reauthenticateWithCredential).toHaveBeenCalledWith(
        mockAuth.currentUser,
        expect.objectContaining({ kind: "password", p: "secret" }),
      );
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(new Date(info.deletionDate).getTime()).toBeGreaterThan(Date.now());
      expect(getGoogleCredential).not.toHaveBeenCalled();
    });

    it("purges directly when the offline queue is already empty", async () => {
      setUser(["password"]);
      (getQueueSize as jest.Mock).mockResolvedValue(0);
      await requestAccountDeletion({ password: "secret" });
      expect(processQueue).not.toHaveBeenCalled();
      expect(onAccountDelete).toHaveBeenCalledWith("u1");
    });

    it("syncs the queue first and purges once it is empty", async () => {
      setUser(["password"]);
      (getQueueSize as jest.Mock).mockResolvedValueOnce(2).mockResolvedValueOnce(0);
      (processQueue as jest.Mock).mockResolvedValue(2);
      await requestAccountDeletion({ password: "secret" });
      expect(processQueue).toHaveBeenCalledTimes(1);
      expect(onAccountDelete).toHaveBeenCalledWith("u1");
    });

    it("keeps the queue when entries remain after the sync attempt", async () => {
      setUser(["password"]);
      (getQueueSize as jest.Mock).mockResolvedValue(2);
      (processQueue as jest.Mock).mockResolvedValue(0);
      await expect(requestAccountDeletion({ password: "secret" })).resolves.toBeDefined();
      expect(onAccountDelete).not.toHaveBeenCalled();
    });

    it("keeps the queue when the sync fails", async () => {
      setUser(["password"]);
      (getQueueSize as jest.Mock).mockResolvedValue(1);
      (processQueue as jest.Mock).mockRejectedValue(new Error("offline"));
      await expect(requestAccountDeletion({ password: "secret" })).resolves.toBeDefined();
      expect(onAccountDelete).not.toHaveBeenCalled();
    });

    it("keeps the queue and does not hang when the sync times out", async () => {
      jest.useFakeTimers();
      try {
        setUser(["password"]);
        (getQueueSize as jest.Mock).mockResolvedValue(1);
        (processQueue as jest.Mock).mockReturnValue(new Promise(() => {}));
        const promise = requestAccountDeletion({ password: "secret" });
        await jest.advanceTimersByTimeAsync(6000);
        await expect(promise).resolves.toBeDefined();
        expect(onAccountDelete).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("does not touch the queue when scheduling fails", async () => {
      setUser(["password"]);
      (updateDoc as jest.Mock).mockRejectedValue(new Error("offline"));
      await expect(requestAccountDeletion({ password: "secret" })).rejects.toThrow("offline");
      expect(onAccountDelete).not.toHaveBeenCalled();
      expect(processQueue).not.toHaveBeenCalled();
    });

    it("a failing queue purge does not block the deletion", async () => {
      setUser(["password"]);
      (getQueueSize as jest.Mock).mockResolvedValue(0);
      (onAccountDelete as jest.Mock).mockRejectedValue(new Error("sqlite"));
      await expect(requestAccountDeletion({ password: "secret" })).resolves.toBeDefined();
    });

    it("password: requires a password", async () => {
      setUser(["password"]);
      await expect(requestAccountDeletion({})).rejects.toMatchObject({ code: "auth/wrong-password" });
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it("google: re-auths with the Google credential", async () => {
      setUser(["google.com"]);
      const credential = { kind: "google" };
      (getGoogleCredential as jest.Mock).mockResolvedValue(credential);
      await requestAccountDeletion();
      expect(reauthenticateWithCredential).toHaveBeenCalledWith(mockAuth.currentUser, credential);
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(callable("registerAppleRevocation")).not.toHaveBeenCalled();
    });

    it("google: cancellation stops before scheduling", async () => {
      setUser(["google.com"]);
      (getGoogleCredential as jest.Mock).mockResolvedValue(null);
      await expect(requestAccountDeletion()).rejects.toMatchObject({ code: "deletion/cancelled" });
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it("google: user-mismatch propagates and nothing is scheduled", async () => {
      setUser(["google.com"]);
      (getGoogleCredential as jest.Mock).mockResolvedValue({});
      (reauthenticateWithCredential as jest.Mock).mockRejectedValue({ code: "auth/user-mismatch" });
      await expect(requestAccountDeletion()).rejects.toMatchObject({ code: "auth/user-mismatch" });
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it("apple: re-auths then registers revocation with the authorization code", async () => {
      setUser(["apple.com"]);
      const credential = { kind: "apple" };
      (getAppleCredential as jest.Mock).mockResolvedValue({ credential, authorizationCode: "code-1" });
      callable("registerAppleRevocation").mockResolvedValue({ data: { stored: true } });
      await requestAccountDeletion();
      expect(reauthenticateWithCredential).toHaveBeenCalledWith(mockAuth.currentUser, credential);
      expect(callable("registerAppleRevocation")).toHaveBeenCalledWith({ authorizationCode: "code-1" });
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it("apple: revocation failure is not blocking", async () => {
      setUser(["apple.com"]);
      (getAppleCredential as jest.Mock).mockResolvedValue({ credential: {}, authorizationCode: "c" });
      callable("registerAppleRevocation").mockRejectedValue(new Error("network"));
      await expect(requestAccountDeletion()).resolves.toBeDefined();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it("apple: skips revocation when there is no authorization code", async () => {
      setUser(["apple.com"]);
      (getAppleCredential as jest.Mock).mockResolvedValue({ credential: {}, authorizationCode: null });
      await requestAccountDeletion();
      expect(callable("registerAppleRevocation")).not.toHaveBeenCalled();
    });

    it("apple: native cancellation is normalised", async () => {
      setUser(["apple.com"]);
      (getAppleCredential as jest.Mock).mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
      await expect(requestAccountDeletion()).rejects.toMatchObject({ code: "deletion/cancelled" });
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it("rejects unsupported providers", async () => {
      setUser(["phone"]);
      await expect(requestAccountDeletion({ password: "x" })).rejects.toThrow();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it("transfers ownership after re-auth and before scheduling", async () => {
      setUser(["password"]);
      const order: string[] = [];
      (reauthenticateWithCredential as jest.Mock).mockImplementation(async () => void order.push("reauth"));
      callable("transferAndLeave").mockImplementation(async () => {
        order.push("transfer");
        return { data: { success: true } };
      });
      (updateDoc as jest.Mock).mockImplementation(async () => void order.push("schedule"));
      await requestAccountDeletion({
        password: "p",
        transfers: [
          { childId: "c1", newOwnerId: "u2" },
          { childId: "c2", newOwnerId: "u3" },
        ],
      });
      expect(callable("transferAndLeave")).toHaveBeenCalledWith({ childId: "c1", newOwnerId: "u2" });
      expect(callable("transferAndLeave")).toHaveBeenCalledWith({ childId: "c2", newOwnerId: "u3" });
      expect(order).toEqual(["reauth", "transfer", "transfer", "schedule"]);
    });

    it("stops with a transfer error and does not schedule", async () => {
      setUser(["password"]);
      callable("transferAndLeave").mockRejectedValue({ code: "functions/permission-denied" });
      await expect(
        requestAccountDeletion({ password: "p", transfers: [{ childId: "c1", newOwnerId: "u2" }] }),
      ).rejects.toMatchObject({ code: "deletion/transfer-failed" });
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe("getOwnershipBlockers", () => {
    it("returns the children from the callable", async () => {
      const children = [
        { childId: "c1", childName: "Léa", members: [{ uid: "u2", role: "admin" }] },
      ];
      callable("getOwnershipBlockers").mockResolvedValue({ data: { children } });
      await expect(getOwnershipBlockers()).resolves.toEqual(children);
    });
    it("tolerates a malformed payload", async () => {
      callable("getOwnershipBlockers").mockResolvedValue({ data: {} });
      await expect(getOwnershipBlockers()).resolves.toEqual([]);
    });
    it("propagates errors so deletion is not silently allowed", async () => {
      callable("getOwnershipBlockers").mockRejectedValue(new Error("boom"));
      await expect(getOwnershipBlockers()).rejects.toThrow("boom");
    });
  });

  describe("mapDeletionError", () => {
    it.each([
      ["auth/user-mismatch", /autre compte/],
      ["auth/wrong-password", /Mot de passe incorrect/],
      ["auth/invalid-credential", /Mot de passe incorrect|identifiants/i],
      ["auth/requires-recent-login", /reconnecter/],
      ["auth/network-request-failed", /connexion/i],
      ["functions/unavailable", /connexion/i],
      ["deletion/cancelled", /annulée/],
      ["ERR_REQUEST_CANCELED", /annulée/],
      ["deletion/transfer-failed", /transfert/i],
      ["whatever", /Impossible de programmer/],
    ])("%s", (code, re) => {
      expect(mapDeletionError({ code })).toMatch(re);
    });
    it("handles non-error input", () => {
      expect(mapDeletionError(undefined)).toMatch(/Impossible de programmer/);
    });
  });
});
