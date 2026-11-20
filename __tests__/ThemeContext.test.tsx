// ThemeContext : « Sombre la nuit », écriture unique, retour arrière, hors ligne.
import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Appearance, AppState, Text } from "react-native";

const mockObtenir = jest.fn();
const mockMaj = jest.fn();
jest.mock("@/services/userPreferencesService", () => ({
  obtenirReglagesTheme: () => mockObtenir(),
  mettreAJourReglagesTheme: (...a: unknown[]) => mockMaj(...a),
}));
const mockUser = { uid: "u1" };
let mockAuthUser: { uid: string } | null = mockUser;
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ firebaseUser: mockAuthUser }) }));

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
  mockAuthUser = mockUser;
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

  it("clavier et alertes suivent l'app : sombre forcé la nuit, retour au téléphone en Automatique le jour", async () => {
    const set = jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
    const appState = jest.spyOn(AppState, "addEventListener");
    mockObtenir.mockResolvedValue({ theme: "auto", darkAtNight: true });
    await mount();
    await waitFor(() => expect(set).toHaveBeenLastCalledWith("dark"));
    mockHour = 10;
    const handler = appState.mock.calls[appState.mock.calls.length - 1][1] as (s: string) => void;
    act(() => handler("active"));
    await waitFor(() => expect(set).toHaveBeenLastCalledWith("auto"));
  });

  it("Clair interrupteur coupé : clavier forcé en clair même si le téléphone est sombre", async () => {
    const set = jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: false });
    await mount();
    await waitFor(() => expect(set).toHaveBeenLastCalledWith("light"));
  });

  it("première connexion, rien en base : le choix fait sur ce téléphone est gardé et enregistré", async () => {
    await AsyncStorage.setItem("@suivibaby_dark_at_night", "0");
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: undefined });
    await mount();
    expect(ctx.darkAtNight).toBe(false);
    expect(mockMaj).toHaveBeenCalledWith({ darkAtNight: false });
    expect(ctx.syncedFromServer).toBe(true);
  });

  it("hors ligne : réglage pas relu sur le serveur (le message unique attendra)", async () => {
    mockObtenir.mockRejectedValue(new Error("offline"));
    await mount();
    expect(ctx.syncedFromServer).toBe(false);
  });

  it("changement fait pendant la lecture serveur : la réponse tardive ne l'écrase pas", async () => {
    let resolveRead: (v: unknown) => void = () => {};
    mockObtenir.mockImplementation(() => new Promise((r) => (resolveRead = r)));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(ctx).toBeDefined());
    await ctx.setPreference("dark");
    await act(async () => resolveRead({ theme: "light", darkAtNight: true }));
    expect(ctx.preference).toBe("dark");
  });

  it("deux changements rapides, le premier échoue : pas de retour arrière qui écrase le second", async () => {
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: false });
    await mount();
    let rejectFirst: (e: Error) => void = () => {};
    mockMaj.mockImplementationOnce(() => new Promise((_, rej) => (rejectFirst = rej)));
    const first = ctx.setPreference("auto");
    await waitFor(() => expect(ctx.preference).toBe("auto"));
    await ctx.setDarkAtNight(false);
    await waitFor(() => expect(ctx.darkAtNight).toBe(false));
    rejectFirst(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    await act(async () => {});
    expect(ctx.preference).toBe("auto");
    expect(ctx.darkAtNight).toBe(false);
  });

  it("changer de thème met à jour clavier et alertes", async () => {
    mockHour = 10;
    const set = jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
    mockObtenir.mockResolvedValue({ theme: "auto", darkAtNight: true });
    await mount();
    await waitFor(() => expect(set).toHaveBeenLastCalledWith("auto"));
    await ctx.setPreference("dark");
    await waitFor(() => expect(set).toHaveBeenLastCalledWith("dark"));
    await ctx.setPreference("light");
    await waitFor(() => expect(set).toHaveBeenLastCalledWith("light"));
  });

  it("déconnexion : le choix « Sombre la nuit » ne passe pas au compte suivant", async () => {
    mockObtenir.mockResolvedValue({ theme: "light", darkAtNight: false });
    const r = await mount();
    expect(ctx.darkAtNight).toBe(false);
    mockAuthUser = null;
    r.rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(ctx.darkAtNight).toBe(true));
    expect(ctx.storedDarkAtNight).toBeUndefined();
    expect(await AsyncStorage.getItem("@suivibaby_dark_at_night")).toBeNull();
  });
});
