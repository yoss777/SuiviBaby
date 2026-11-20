// ThemeContext : « Sombre la nuit », écriture unique, retour arrière, hors ligne.
import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { AppState, Text } from "react-native";

const mockObtenir = jest.fn();
const mockMaj = jest.fn();
jest.mock("@/services/userPreferencesService", () => ({
  obtenirReglagesTheme: () => mockObtenir(),
  mettreAJourReglagesTheme: (...a: unknown[]) => mockMaj(...a),
}));
const mockUser = { uid: "u1" };
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ firebaseUser: mockUser }) }));

import { ThemeProvider, useThemePreference } from "@/contexts/ThemeContext";

let ctx: ReturnType<typeof useThemePreference>;
let mockHour = 23;
function Probe() {
  ctx = useThemePreference();
  return <Text>{ctx.resolvedColorScheme}</Text>;
}

const AsyncStorage = require("@react-native-async-storage/async-storage");

async function mount() {
  const r = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  await waitFor(() => expect(ctx?.isLoading).toBe(false));
  return r;
}

beforeEach(async () => {
  mockHour = 23;
  ctx = undefined as unknown as typeof ctx;
  jest.spyOn(Date.prototype, "getHours").mockImplementation(() => mockHour);
  const store: Record<string, string> = {};
  AsyncStorage.getItem.mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
  AsyncStorage.setItem.mockImplementation((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  });
  AsyncStorage.removeItem.mockImplementation((k: string) => {
    delete store[k];
    return Promise.resolve();
  });
  mockObtenir.mockReset();
  mockMaj.mockReset().mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe("ThemeContext", () => {
  it("compte Clair jamais réglé : sombre la nuit par défaut", async () => {
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: undefined });
    await mount();
    expect(ctx.darkAtNight).toBe(true);
    expect(ctx.storedDarkAtNight).toBeUndefined();
    expect(ctx.resolvedColorScheme).toBe("dark");
  });

  it("interrupteur coupé : Clair reste clair à 23 h, l'ergonomie de nuit reste active", async () => {
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: false });
    await mount();
    expect(ctx.resolvedColorScheme).toBe("light");
    expect(ctx.isNightMode).toBe(true);
  });

  it("choisir Automatique : une seule écriture avec l'interrupteur activé", async () => {
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: false });
    await mount();
    await ctx.setPreference("auto");
    expect(mockMaj).toHaveBeenCalledTimes(1);
    expect(mockMaj).toHaveBeenCalledWith({ theme: "auto", darkAtNight: true });
    await waitFor(() => expect(ctx.darkAtNight).toBe(true));
  });

  it("choisir Clair garde la valeur de l'interrupteur", async () => {
    mockObtenir.mockResolvedValue({ theme: "auto", darkAtNight: false });
    await mount();
    await ctx.setPreference("light");
    expect(mockMaj).toHaveBeenCalledWith({ theme: "light" });
    await waitFor(() => expect(ctx.preference).toBe("light"));
    expect(ctx.darkAtNight).toBe(false);
  });

  it("échec d'écriture : thème et interrupteur rétablis", async () => {
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: false });
    await mount();
    mockMaj.mockRejectedValueOnce(new Error("offline"));
    await expect(ctx.setPreference("auto")).rejects.toThrow("offline");
    await waitFor(() => expect(ctx.preference).toBe("light"));
    expect(ctx.storedDarkAtNight).toBe(false);
  });

  it("Firestore injoignable : la valeur locale est gardée (plus de retour à Automatique)", async () => {
    await AsyncStorage.setItem("@suivibaby_theme_preference", "light");
    await AsyncStorage.setItem("@suivibaby_dark_at_night", "0");
    mockObtenir.mockRejectedValue(new Error("offline"));
    await mount();
    expect(ctx.preference).toBe("light");
    expect(ctx.darkAtNight).toBe(false);
  });

  it("retour au premier plan après 22 h : sombre tout de suite", async () => {
    mockHour = 21;
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: true });
    const spy = jest.spyOn(AppState, "addEventListener");
    await mount();
    expect(ctx.resolvedColorScheme).toBe("light");
    mockHour = 22;
    const handler = spy.mock.calls[spy.mock.calls.length - 1][1] as (s: string) => void;
    act(() => handler("active"));
    expect(ctx.resolvedColorScheme).toBe("dark");
  });
});
