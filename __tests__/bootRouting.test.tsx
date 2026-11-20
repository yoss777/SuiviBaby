/* eslint-disable import/first */
// S11.4 : garde de navigation de app/boot.tsx.
// Note : boot.tsx n applique pas la vérification e-mail (l écran verify-email
// n est atteint que depuis l inscription) ; ce comportement n est donc pas testé ici.

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

let mockNet: { isConnected: boolean | null; isInternetReachable: boolean | null } = {
  isConnected: true,
  isInternetReachable: true,
};
jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => mockNet,
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

jest.mock("@sentry/react-native", () => ({
  startInactiveSpan: jest.fn(() => ({ end: jest.fn() })),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

const mockUseAuth = jest.fn();
const mockUseBaby = jest.fn();
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("@/contexts/BabyContext", () => ({ useBaby: () => mockUseBaby() }));

jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
}));
jest.mock("@/components/ui/BackgroundImage", () => () => null);
jest.mock("@/components/ui/IconPulseDtos", () => ({ IconPulseDots: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));

const mockHasOnboarded = jest.fn();
jest.mock("@/app/(auth)/onboarding", () => ({
  hasCompletedOnboarding: () => mockHasOnboarded(),
}));
jest.mock("@/services/accountDeletionService", () => ({
  hasPendingDeletion: (u: any) => !!u?.pendingDeletion?.deletionDate,
}));
const mockBiometricEnabled = jest.fn();
jest.mock("@/services/biometricAuthService", () => ({
  isBiometricEnabled: () => mockBiometricEnabled(),
  unlockWithBiometric: jest.fn(),
}));
const mockConsent = jest.fn();
jest.mock("@/services/healthConsentService", () => ({
  fetchHealthConsentStatus: (uid: string) => mockConsent(uid),
}));
jest.mock("@/services/eventsService", () => ({
  obtenirEvenementsDuJour: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/services/userPreferencesService", () => ({
  obtenirPreferencesNotifications: jest.fn(() => Promise.resolve({})),
  synchroniserFuseauHoraire: jest.fn(() => Promise.resolve(false)),
}));
jest.mock("@/services/userPreferencesCache", () => ({
  setPreferencesCache: jest.fn(),
  setPermissionsCache: jest.fn(),
}));
jest.mock("@/services/todayEventsCache", () => ({
  getTodayEventsCache: jest.fn(() => null),
  loadTodayEventsOnce: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/utils/permissions", () => ({
  getUserChildAccess: jest.fn(() => Promise.resolve({ role: "admin" })),
}));

import BootScreen from "@/app/boot";

const signedIn = { uid: "u1" };
const child = { id: "c1", name: "Léa" };

function setAuth(over: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    user: signedIn,
    firebaseUser: { uid: "u1" },
    loading: false,
    status: "authenticated",
    refreshUser: jest.fn(),
    signOut: jest.fn(() => Promise.resolve()),
    ...over,
  });
}
function setBaby(over: Record<string, unknown> = {}) {
  mockUseBaby.mockReturnValue({
    children: [child],
    loading: false,
    activeChild: child,
    setActiveChild: jest.fn(),
    ...over,
  });
}

async function boot() {
  render(<BootScreen />);
  // Splash minimum (1200 ms) + unauth delay + async checks.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000);
  });
}

beforeEach(() => {
  mockNet = { isConnected: true, isInternetReachable: true };
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockHasOnboarded.mockResolvedValue(true);
  mockBiometricEnabled.mockResolvedValue(false);
  mockConsent.mockResolvedValue(true);
  setAuth();
  setBaby();
});
afterEach(() => jest.useRealTimers());

describe("boot.tsx routing", () => {
  it("waits while auth is loading", async () => {
    setAuth({ loading: true, user: null, firebaseUser: null });
    await boot();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends a signed-out user who has not done onboarding to onboarding", async () => {
    setAuth({ user: null, firebaseUser: null });
    mockHasOnboarded.mockResolvedValue(false);
    await boot();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/onboarding");
  });

  it("sends a signed-out user who finished onboarding to login", async () => {
    setAuth({ user: null, firebaseUser: null });
    await boot();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("does not redirect while a Firebase session exists but the user doc is pending (degraded)", async () => {
    setAuth({ user: null, status: "degraded" });
    await boot();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("degraded session: offers a way out (Se déconnecter) besides Réessayer", async () => {
    const signOut = jest.fn(() => Promise.resolve());
    setAuth({ user: null, status: "degraded", signOut });
    const { getByText } = render(<BootScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(getByText("Réessayer")).toBeTruthy();
    fireEvent.press(getByText("Se déconnecter"));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("sends a user with a pending deletion to pending-deletion, before any consent read", async () => {
    setAuth({ user: { uid: "u1", pendingDeletion: { deletionDate: "2026-12-01" } } });
    await boot();
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/pending-deletion");
    expect(mockConsent).not.toHaveBeenCalled();
  });

  it("sends a user without valid health consent to health-consent", async () => {
    mockConsent.mockResolvedValue(false);
    await boot();
    expect(mockConsent).toHaveBeenCalledWith("u1");
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/health-consent");
  });

  it("does not let the user through when the consent read fails, and shows the retry card", async () => {
    mockConsent.mockRejectedValue(new Error("offline"));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { getByText } = render(<BootScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(getByText("Réessayer")).toBeTruthy();
  });

  it("continues to the baby screen when consent is present", async () => {
    await boot();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(drawer)/baby");
  });

  it("sends a consenting user with no child to add-baby", async () => {
    setBaby({ children: [], activeChild: null });
    await boot();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/(drawer)/add-baby",
      params: { firstRun: "true" },
    });
  });

  it("signs out and goes to login when the biometric lock is refused", async () => {
    const signOut = jest.fn(() => Promise.resolve());
    setAuth({ signOut });
    mockBiometricEnabled.mockResolvedValue(true);
    // unlockWithBiometric returns undefined -> refused
    await boot();
    expect(signOut).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  describe("test 27 : retour du réseau après un lancement hors ligne", () => {
    async function bootDegradedOffline() {
      const refreshUser = jest.fn(() => Promise.resolve());
      setAuth({ user: null, status: "degraded", refreshUser });
      mockNet = { isConnected: false, isInternetReachable: false };
      const r = render(<BootScreen />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5000);
      });
      return { ...r, refreshUser };
    }
    async function setNet(net: typeof mockNet, rerender: (el: React.ReactElement) => void) {
      mockNet = net;
      rerender(<BootScreen />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
    }

    it("hors ligne : aucun essai automatique", async () => {
      const { refreshUser, getByText } = await bootDegradedOffline();
      expect(getByText("Connexion indisponible")).toBeTruthy();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
      expect(refreshUser).not.toHaveBeenCalled();
    });

    it("Wi-Fi revenu mais internet pas encore confirmé, puis confirmé : un essai à la confirmation", async () => {
      const { refreshUser, rerender } = await bootDegradedOffline();
      await setNet({ isConnected: true, isInternetReachable: null }, rerender);
      expect(refreshUser).not.toHaveBeenCalled();
      await setNet({ isConnected: true, isInternetReachable: true }, rerender);
      expect(refreshUser).toHaveBeenCalledTimes(1);
    });

    it("le premier essai échoue : nouvel essai toutes les 10 s", async () => {
      const { refreshUser, rerender } = await bootDegradedOffline();
      await setNet({ isConnected: true, isInternetReachable: null }, rerender);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(refreshUser).toHaveBeenCalledTimes(3);
    });

    it("12 essais au plus, puis seul « Réessayer » relance", async () => {
      const { refreshUser, rerender, getByText } = await bootDegradedOffline();
      await setNet({ isConnected: true, isInternetReachable: null }, rerender);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10 * 60_000);
      });
      expect(refreshUser).toHaveBeenCalledTimes(12);
      fireEvent.press(getByText("Réessayer"));
      expect(refreshUser).toHaveBeenCalledTimes(13);
    });
  });
});
