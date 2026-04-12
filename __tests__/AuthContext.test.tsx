import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { getDoc } from "firebase/firestore";

// Mock config/firebase
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "test-uid" } },
  db: {},
}));

// Mock ModalContext
const mockShowAlert = jest.fn();
jest.mock("@/contexts/ModalContext", () => ({
  useModal: () => ({ showAlert: mockShowAlert }),
  ModalProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock all service dependencies
jest.mock("@/services/localNotificationService", () => ({
  cancelAllReminders: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/services/pushTokenService", () => ({
  registerPushToken: jest.fn(() => Promise.resolve()),
  removePushTokens: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/services/offlineQueueService", () => ({
  onSignOut: jest.fn(() => Promise.resolve()),
  startAutoSync: jest.fn(),
}));

jest.mock("@/services/todayEventsCache", () => ({
  clearTodayEventsCache: jest.fn(),
}));

jest.mock("@/services/socialAuthService", () => ({
  signOutGoogle: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/services/userPreferencesCache", () => ({
  clearPreferencesCache: jest.fn(),
  clearPermissionsCache: jest.fn(),
}));

jest.mock("@/services/userService", () => ({
  canUserAccessApp: jest.fn(() =>
    Promise.resolve({ canAccess: true, reason: null }),
  ),
  createPatientUser: jest.fn(() =>
    Promise.resolve({
      uid: "test-uid",
      email: "test@example.com",
      userName: "Test",
      userType: "patient",
    }),
  ),
  updateLastLogin: jest.fn(() => Promise.resolve()),
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { canUserAccessApp, createPatientUser } from "@/services/userService";
import { startAutoSync } from "@/services/offlineQueueService";
import { clearTodayEventsCache } from "@/services/todayEventsCache";

// Helper: create a mock Firebase user
function mockFirebaseUser(overrides: Partial<any> = {}) {
  return {
    uid: "test-uid",
    email: "test@example.com",
    displayName: "Test User",
    ...overrides,
  };
}

// Helper: create a mock Firestore user doc
function mockUserDoc(data: any = {}) {
  return {
    exists: () => true,
    data: () => ({
      email: "test@example.com",
      userName: "Test User",
      userType: "patient" as const,
      ...data,
    }),
  };
}

// Helper: capture onAuthStateChanged callback
function captureAuthCallback() {
  const call = (onAuthStateChanged as jest.Mock).mock.calls[0];
  return call ? call[1] : null;
}

// Wrapper for renderHook
function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: onAuthStateChanged returns unsubscribe
  (onAuthStateChanged as jest.Mock).mockReturnValue(jest.fn());
  // Default: getDoc returns a valid user doc
  (getDoc as jest.Mock).mockResolvedValue(mockUserDoc());
  // Default: canUserAccessApp allows access
  (canUserAccessApp as jest.Mock).mockResolvedValue({
    canAccess: true,
    reason: null,
  });
});

describe("AuthContext", () => {
  describe("initial state", () => {
    it("should start with loading=true and no user", () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBeNull();
      expect(result.current.firebaseUser).toBeNull();
      expect(result.current.userName).toBeNull();
      expect(result.current.email).toBeNull();
    });

    it("should subscribe to onAuthStateChanged on mount", () => {
      renderHook(() => useAuth(), { wrapper });

      expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe("user login", () => {
    it("should load user data when Firebase auth user is set", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();
      expect(authCallback).not.toBeNull();

      await act(async () => {
        await authCallback(mockFirebaseUser());
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.user).toBeTruthy();
        expect(result.current.userName).toBe("Test User");
        expect(result.current.email).toBe("test@example.com");
      });
    });

    it("should start auto-sync after login", async () => {
      renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();
      await act(async () => {
        await authCallback(mockFirebaseUser());
      });

      expect(startAutoSync).toHaveBeenCalled();
    });

    it("should retry Firestore doc fetch if not found initially", async () => {
      // First call: doc doesn't exist; Second call: doc exists
      (getDoc as jest.Mock)
        .mockResolvedValueOnce({ exists: () => false, data: () => null })
        .mockResolvedValueOnce(mockUserDoc());

      const { result } = renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();
      await act(async () => {
        await authCallback(mockFirebaseUser());
      });

      await waitFor(() => {
        expect(result.current.user).toBeTruthy();
      });

      // Should have called getDoc twice (initial + retry)
      expect(getDoc).toHaveBeenCalledTimes(2);
    });

    it("should create fallback user if doc never found (patient app)", async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
        data: () => null,
      });

      renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();
      await act(async () => {
        await authCallback(mockFirebaseUser());
      });

      await waitFor(() => {
        expect(createPatientUser).toHaveBeenCalledWith(
          "test-uid",
          "test@example.com",
          "Test User",
        );
      });
    });

    it("should show alert and sign out when access denied", async () => {
      (canUserAccessApp as jest.Mock).mockResolvedValue({
        canAccess: false,
        reason: "Accès réservé aux professionnels",
      });

      renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();
      await act(async () => {
        await authCallback(mockFirebaseUser());
      });

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          "Accès non autorisé",
          expect.any(String),
          expect.any(Array),
        );
      });
    });

    it("should switch to degraded when user doc loading times out", async () => {
      jest.useFakeTimers();
      (getDoc as jest.Mock).mockImplementation(
        () => new Promise(() => {}),
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();

      act(() => {
        authCallback(mockFirebaseUser());
      });

      act(() => {
        jest.advanceTimersByTime(8000);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.status).toBe("degraded");
        expect(result.current.firebaseUser?.uid).toBe("test-uid");
        expect(result.current.user).toBeNull();
      });

      jest.useRealTimers();
    });
  });

  describe("user logout", () => {
    it("should clear state when Firebase auth user is null", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();

      // Login first
      await act(async () => {
        await authCallback(mockFirebaseUser());
      });

      await waitFor(() => {
        expect(result.current.user).toBeTruthy();
      });

      // Then logout
      await act(async () => {
        await authCallback(null);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.firebaseUser).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it("should clear caches on signOut", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();
      await act(async () => {
        await authCallback(mockFirebaseUser());
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(clearTodayEventsCache).toHaveBeenCalled();
      expect(firebaseSignOut).toHaveBeenCalled();
    });
  });

  describe("refreshUser", () => {
    it("should reload user data from Firestore", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      const authCallback = captureAuthCallback();
      await act(async () => {
        await authCallback(mockFirebaseUser());
      });

      await waitFor(() => {
        expect(result.current.user).toBeTruthy();
      });

      // Change the mock to return updated data
      (getDoc as jest.Mock).mockResolvedValueOnce(
        mockUserDoc({ userName: "Updated Name" }),
      );

      await act(async () => {
        await result.current.refreshUser();
      });

      await waitFor(() => {
        expect(result.current.userName).toBe("Updated Name");
      });
    });

    it("should do nothing when no firebase user", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.refreshUser();
      });

      // getDoc should only have been called from the auth listener setup, not refreshUser
      expect(getDoc).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should unsubscribe from auth on unmount", () => {
      const unsubscribe = jest.fn();
      (onAuthStateChanged as jest.Mock).mockReturnValue(unsubscribe);

      const { unmount } = renderHook(() => useAuth(), { wrapper });

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
