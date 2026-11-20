// Message unique « Sombre la nuit » pour les comptes existants en Clair.
import { act, renderHook } from "@testing-library/react-native";

const mockShowActionToast = jest.fn();
const mockShowToast = jest.fn();
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showActionToast: mockShowActionToast, showToast: mockShowToast }),
}));
const mockTheme = {
  preference: "light" as "light" | "dark" | "auto",
  storedDarkAtNight: undefined as boolean | undefined,
  isNightMode: true,
  isLoading: false,
  syncedFromServer: true,
  setDarkAtNight: jest.fn(() => Promise.resolve()),
};
jest.mock("@/contexts/ThemeContext", () => ({ useThemePreference: () => mockTheme }));

import { DARK_AT_NIGHT_NOTICE_KEY, useDarkAtNightNotice } from "@/hooks/useDarkAtNightNotice";

const AsyncStorage = require("@react-native-async-storage/async-storage");
let store: Record<string, string>;

beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  AsyncStorage.getItem.mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
  AsyncStorage.setItem.mockImplementation((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  });
  Object.assign(mockTheme, {
    preference: "light",
    storedDarkAtNight: undefined,
    isNightMode: true,
    isLoading: false,
    syncedFromServer: true,
    setDarkAtNight: jest.fn(() => Promise.resolve()),
  });
});

async function flush() {
  await act(async () => {});
}

describe("useDarkAtNightNotice", () => {
  it("compte Clair jamais réglé, la nuit : un seul message, avec « Désactiver »", async () => {
    const { rerender } = renderHook(() => useDarkAtNightNotice());
    await flush();
    expect(mockShowActionToast).toHaveBeenCalledTimes(1);
    expect(mockShowActionToast.mock.calls[0][1]).toBe("Désactiver");
    expect(store[DARK_AT_NIGHT_NOTICE_KEY]).toBe("1");
    rerender({});
    await flush();
    expect(mockShowActionToast).toHaveBeenCalledTimes(1);
  });

  it("déjà vu sur ce téléphone : rien", async () => {
    store[DARK_AT_NIGHT_NOTICE_KEY] = "1";
    renderHook(() => useDarkAtNightNotice());
    await flush();
    expect(mockShowActionToast).not.toHaveBeenCalled();
  });

  it("réglage pas encore relu sur le serveur (hors ligne) : rien, et le message reste à montrer", async () => {
    mockTheme.syncedFromServer = false;
    renderHook(() => useDarkAtNightNotice());
    await flush();
    expect(mockShowActionToast).not.toHaveBeenCalled();
    expect(store[DARK_AT_NIGHT_NOTICE_KEY]).toBeUndefined();
  });

  it.each([
    ["Automatique", { preference: "auto" }],
    ["Sombre", { preference: "dark" }],
    ["interrupteur déjà réglé", { storedDarkAtNight: true }],
    ["de jour", { isNightMode: false }],
  ])("%s : rien", async (_l, over) => {
    Object.assign(mockTheme, over);
    renderHook(() => useDarkAtNightNotice());
    await flush();
    expect(mockShowActionToast).not.toHaveBeenCalled();
  });

  it("« Désactiver » : coupe l'interrupteur et confirme ; échec : le dit", async () => {
    renderHook(() => useDarkAtNightNotice());
    await flush();
    const onAction = mockShowActionToast.mock.calls[0][2] as () => void;
    await act(async () => onAction());
    expect(mockTheme.setDarkAtNight).toHaveBeenCalledWith(false);
    expect(mockShowToast).toHaveBeenCalledWith("Sombre la nuit désactivé");
    (mockTheme.setDarkAtNight as jest.Mock).mockImplementation(() => Promise.reject(new Error("offline")));
    await act(async () => onAction());
    expect(mockShowToast).toHaveBeenLastCalledWith("Impossible d'enregistrer. Réessayez dans Paramètres › Thème.");
  });
});
