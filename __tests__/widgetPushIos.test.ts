// iPhone, temps réel du widget au mieux (E7, option 1) : message serveur
// « w1 » reçu en notification silencieuse, mêmes gardes qu'Android.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

const mockWrite = jest.fn();
jest.mock("@/services/widgetSync", () => ({
  writeServerWidgetProps: (...a: unknown[]) => mockWrite(...a),
}));

import { handleWidgetPushIos, readW1 } from "@/services/widgetPushIos";
import { clearIosWidgetPush, decideWidgetPush, noteIosAppSnapshot, readWidgetPushIosState } from "@/services/widgetPushIosState";

const store = new Map<string, string>();
const setAppState = (state: string) =>
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });

beforeEach(() => {
  store.clear();
  mockWrite.mockClear();
  setAppState("background");
  (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) => Promise.resolve(store.get(k) ?? null));
  (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation((k: string) => {
    store.delete(k);
    return Promise.resolve();
  });
});

const msg = (s: number, c = "c1") => ({ t: "w1", c, s, p: { v: 1, childId: c, childName: "Léa" } });

describe("gardes (comme WidgetPushGuards.kt)", () => {
  const state = { shownChildId: "c1", lastSeq: 100, appWriteAtMs: 50_000 };
  it("décisions", () => {
    expect(decideWidgetPush({ childId: "c1", seq: 60_000, propsVersion: 1, state, foreground: false })).toBe("ok");
    expect(decideWidgetPush({ childId: "c1", seq: 60_000, propsVersion: 1, state, foreground: true })).toBe("fg");
    expect(decideWidgetPush({ childId: "c2", seq: 60_000, propsVersion: 1, state, foreground: false })).toBe("child");
    expect(decideWidgetPush({ childId: "c1", seq: 100, propsVersion: 1, state, foreground: false })).toBe("seq");
    expect(decideWidgetPush({ childId: "c1", seq: 40_000, propsVersion: 1, state, foreground: false })).toBe("app");
    expect(decideWidgetPush({ childId: "c1", seq: 60_000, propsVersion: 2, state, foreground: false })).toBe("invalid");
    expect(
      decideWidgetPush({ childId: "c1", seq: 60_000, propsVersion: 1, state: { ...state, shownChildId: null }, foreground: false }),
    ).toBe("child");
  });
});

it("lit le message où qu'il soit (dataString, body, objet direct)", () => {
  expect(readW1({ dataString: JSON.stringify(msg(1)) })?.s).toBe(1);
  expect(readW1({ body: msg(2) })?.s).toBe(2);
  expect(readW1({ body: JSON.stringify(msg(3)) })?.s).toBe(3);
  expect(readW1(msg(4))?.s).toBe(4);
  expect(readW1({ foo: 1 })).toBeNull();
});

it("arrière-plan, bon enfant, plus récent que l'app : écrit puis retient la séquence", async () => {
  await noteIosAppSnapshot("c1", 1_000);
  expect(await handleWidgetPushIos({ dataString: JSON.stringify(msg(5_000)) })).toBe("ok");
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ childId: "c1" }));
  expect((await readWidgetPushIosState()).lastSeq).toBe(5_000);
  // Même message rejoué : refusé.
  expect(await handleWidgetPushIos({ dataString: JSON.stringify(msg(5_000)) })).toBe("seq");
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it("app au premier plan, autre enfant, ou déconnexion : rien n'est écrit", async () => {
  await noteIosAppSnapshot("c1", 1_000);
  setAppState("active");
  expect(await handleWidgetPushIos(msg(5_000))).toBe("fg");
  setAppState("background");
  expect(await handleWidgetPushIos(msg(5_000, "c2"))).toBe("child");
  await clearIosWidgetPush();
  expect(await handleWidgetPushIos(msg(6_000))).toBe("child");
  expect(mockWrite).not.toHaveBeenCalled();
});

it("iPhone : la tâche d'arrière-plan est déclarée au chargement (capacité annoncée au serveur)", () => {
  expect(Platform.OS).toBe("ios");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expect(require("@/services/widgetPushIos").widgetPushIosReady).toBe(true);
});
