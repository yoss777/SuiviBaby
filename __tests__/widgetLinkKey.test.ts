// Clé des liens du widget : créée une fois par installation, vérifiée à
// chaque action démarrer/arrêter venue d'un lien.
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
let mockSeed = 1;
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (i * 7 + mockSeed) % 256),
}));

import * as SecureStore from "expo-secure-store";

import { __resetWidgetLinkKeyForTests, getWidgetLinkKey, isWidgetLinkKeyValid, rotateWidgetLinkKey } from "@/services/widgetLinkKey";

beforeEach(() => {
  mockStore.clear();
  __resetWidgetLinkKeyForTests();
  jest.clearAllMocks();
});

it("crée une clé de 32 caractères hexadécimaux, une seule fois, gardée dans le trousseau", async () => {
  const k1 = await getWidgetLinkKey();
  expect(k1).toMatch(/^[0-9a-f]{32}$/);
  __resetWidgetLinkKeyForTests();
  mockSeed = 2; // une nouvelle clé serait différente : elle n'est pas recréée
  expect(await getWidgetLinkKey()).toBe(k1);
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
});

it("vérifie la clé portée par un lien", async () => {
  const key = await getWidgetLinkKey();
  expect(await isWidgetLinkKeyValid(key)).toBe(true);
  expect(await isWidgetLinkKeyValid("00".repeat(16))).toBe(false);
  expect(await isWidgetLinkKeyValid(undefined)).toBe(false);
});

it("trousseau indisponible : pas de clé, tout lien demande confirmation", async () => {
  (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error("keychain locked"));
  expect(await getWidgetLinkKey()).toBeNull();
  expect(await isWidgetLinkKeyValid("abc")).toBe(false);
});

it("déconnexion : la clé est renouvelée, l'ancienne n'ouvre plus rien", async () => {
  mockSeed = 3;
  const old = await getWidgetLinkKey();
  await rotateWidgetLinkKey();
  mockSeed = 4;
  const next = await getWidgetLinkKey();
  expect(next).not.toBe(old);
  expect(await isWidgetLinkKeyValid(old)).toBe(false);
});

it("renouvellement pendant une lecture : l'ancienne lecture n'écrit pas de clé", async () => {
  let release: () => void = () => {};
  (SecureStore.getItemAsync as jest.Mock).mockImplementationOnce(
    () => new Promise((r) => (release = () => r(null))),
  );
  const inFlight = getWidgetLinkKey();
  await rotateWidgetLinkKey();
  release();
  expect(await inFlight).toBeNull();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
