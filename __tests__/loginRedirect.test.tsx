/* eslint-disable import/first */
// S11.4 : redirection automatique de app/(auth)/login.tsx (contrôle du
// consentement santé avant de router) et parcours d inscription.

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useFocusEffect: jest.fn(),
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Error: "error", Warning: "warning" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/utils/a11yAnnounce", () => ({ announceError: jest.fn() }));
jest.mock("@/config/firebase", () => ({ auth: {}, db: {}, functions: {} }));
jest.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(() => Promise.resolve()),
  signInWithEmailAndPassword: jest.fn(),
}));

const mockUseAuth = jest.fn();
const mockUseBaby = jest.fn();
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
jest.mock("@/contexts/BabyContext", () => ({ useBaby: () => mockUseBaby() }));

jest.mock("@/services/accountDeletionService", () => ({
  hasPendingDeletion: (u: any) => !!u?.pendingDeletion?.deletionDate,
}));
jest.mock("@/services/biometricAuthService", () => ({
  consumeBiometricOptInPending: jest.fn(() => Promise.resolve(false)),
  enableBiometric: jest.fn(() => Promise.resolve()),
  isBiometricAvailable: jest.fn(() => Promise.resolve(false)),
  isBiometricEnabled: jest.fn(() => Promise.resolve(false)),
}));
jest.mock("@/services/socialAuthService", () => ({
  isAppleSignInAvailable: jest.fn(() => Promise.resolve(false)),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
}));
jest.mock("@/services/userService", () => ({
  createPatientUser: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/services/onboardingAnalytics", () => ({ trackOnboardingEvent: jest.fn() }));
const mockFetchConsent = jest.fn();
const mockRecordConsent = jest.fn();
jest.mock("@/services/healthConsentService", () => ({
  fetchHealthConsentStatus: (uid: string) => mockFetchConsent(uid),
  recordHealthConsent: (uid: string) => mockRecordConsent(uid),
}));

import { createUserWithEmailAndPassword } from "firebase/auth";
import LoginScreen from "@/app/(auth)/login";

const child = { id: "c1", name: "Léa" };
const setActiveChild = jest.fn();

function setAuth(user: unknown, loading = false) {
  mockUseAuth.mockReturnValue({ user, loading });
}
function setBaby(over: Record<string, unknown> = {}) {
  mockUseBaby.mockReturnValue({
    children: [child],
    loading: false,
    childrenLoaded: true,
    setActiveChild,
    ...over,
  });
}

async function flush() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(100);
  });
}

// Aucun état partagé entre fichiers : l'écart venait du temps. Le premier rendu
// de l'écran charge (et, à froid, transforme) tout son arbre de composants ; en
// suite complète parallèle ou cache vide, il dépassait les 5 s par défaut du
// premier test, puis le démontage forcé faisait échouer les tests suivants
// (« Can't access .root on unmounted test renderer »). On le paie une fois, ici,
// avec une marge, et on laisse 30 s à chaque test.
jest.setTimeout(30000);
beforeAll(() => {
  setAuth(null);
  setBaby();
  const warmup = render(<LoginScreen />);
  warmup.unmount();
}, 120000);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockFetchConsent.mockResolvedValue(true);
  mockRecordConsent.mockResolvedValue(undefined);
  setAuth({ uid: "u1" });
  setBaby();
});
afterEach(() => jest.useRealTimers());

describe("login.tsx : redirection d un utilisateur déjà connecté", () => {
  it("does nothing while auth is loading or when signed out", async () => {
    setAuth(null, true);
    render(<LoginScreen />);
    await flush();
    setAuth(null);
    render(<LoginScreen />);
    await flush();
    expect(mockFetchConsent).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("goes to pending-deletion without reading the consent", async () => {
    setAuth({ uid: "u1", pendingDeletion: { deletionDate: "2026-12-01" } });
    render(<LoginScreen />);
    await flush();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/pending-deletion");
    expect(mockFetchConsent).not.toHaveBeenCalled();
  });

  it("checks the consent before routing, and sends to health-consent when missing", async () => {
    mockFetchConsent.mockResolvedValue(false);
    render(<LoginScreen />);
    await flush();
    expect(mockFetchConsent).toHaveBeenCalledWith("u1");
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/health-consent");
    expect(setActiveChild).not.toHaveBeenCalled();
  });

  it("does not route anywhere before the consent read resolves", async () => {
    let resolve!: (v: boolean) => void;
    mockFetchConsent.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    render(<LoginScreen />);
    await flush();
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => resolve(true));
    await flush();
    expect(mockReplace).toHaveBeenCalledWith("/(drawer)/baby");
  });

  it("sends a consenting user with one child to the baby screen and selects it", async () => {
    render(<LoginScreen />);
    await flush();
    expect(setActiveChild).toHaveBeenCalledWith(child);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(drawer)/baby");
  });

  it("sends a consenting user with several children to the child picker", async () => {
    setBaby({ children: [child, { id: "c2", name: "Tom" }] });
    render(<LoginScreen />);
    await flush();
    expect(mockReplace).toHaveBeenCalledWith("/child-picker");
  });

  it("waits for the children to load before routing a consenting user", async () => {
    setBaby({ loading: true, childrenLoaded: false, children: [] });
    render(<LoginScreen />);
    await flush();
    expect(mockFetchConsent).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("hands over to boot when the consent read fails (unknown state)", async () => {
    mockFetchConsent.mockRejectedValue(new Error("offline"));
    render(<LoginScreen />);
    await flush();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/boot");
  });

  it("reads the consent once even if the screen re-renders", async () => {
    const { rerender } = render(<LoginScreen />);
    rerender(<LoginScreen />);
    rerender(<LoginScreen />);
    await flush();
    expect(mockFetchConsent).toHaveBeenCalledTimes(1);
  });
});

describe("login.tsx : l inscription garde son propre parcours", () => {
  it("records the consent, goes to verify-email and is not intercepted by the auto redirect", async () => {
    setAuth(null);
    (createUserWithEmailAndPassword as jest.Mock).mockImplementation(async () => {
      // Simulates onAuthStateChanged delivering the new user mid-signup.
      setAuth({ uid: "new1" });
      return { user: { uid: "new1" } };
    });

    const { getByLabelText, rerender } = render(<LoginScreen />);
    await flush();
    fireEvent.press(getByLabelText("Créer un compte"));
    fireEvent.changeText(getByLabelText("Adresse email"), "a@b.fr");
    fireEvent.changeText(getByLabelText("Pseudo"), "Alex");
    fireEvent.changeText(getByLabelText("Mot de passe"), "Passw0rd!");
    fireEvent.changeText(getByLabelText("Confirmer le mot de passe"), "Passw0rd!");
    fireEvent.press(getByLabelText("Accepter les conditions et la politique de confidentialité"));
    fireEvent.press(
      getByLabelText("Consentir au traitement des données de santé de mon enfant"),
    );
    fireEvent.press(getByLabelText("Créer mon compte"));
    await flush();

    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(mockRecordConsent).toHaveBeenCalledWith("new1");
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/verify-email");

    rerender(<LoginScreen />);
    await flush();
    expect(mockFetchConsent).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("does not create the account without the health consent", async () => {
    setAuth(null);
    const { getByLabelText } = render(<LoginScreen />);
    await flush();
    fireEvent.press(getByLabelText("Créer un compte"));
    fireEvent.changeText(getByLabelText("Adresse email"), "a@b.fr");
    fireEvent.changeText(getByLabelText("Pseudo"), "Alex");
    fireEvent.changeText(getByLabelText("Mot de passe"), "Passw0rd!");
    fireEvent.changeText(getByLabelText("Confirmer le mot de passe"), "Passw0rd!");
    fireEvent.press(getByLabelText("Créer mon compte"));
    await flush();
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(mockRecordConsent).not.toHaveBeenCalled();
  });
});
