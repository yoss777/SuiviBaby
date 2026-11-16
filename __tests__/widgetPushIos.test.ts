// iPhone, temps réel du widget au mieux (E7, option 1) : message serveur
// « w1 » reçu en notification silencieuse, mêmes gardes qu'Android.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

const mockWrite = jest.fn((_p: unknown) => true);
const mockClearWidget = jest.fn(() => true);
jest.mock("@/services/widgetSync", () => ({
  writeServerWidgetProps: (p: unknown) => mockWrite(p),
  clearNowWidget: () => mockClearWidget(),
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

it("écriture ratée : la séquence n'avance pas, le message suivant pourra s'appliquer", async () => {
  await noteIosAppSnapshot("c1", 1_000);
  mockWrite.mockReturnValueOnce(false);
  expect(await handleWidgetPushIos(msg(5_000))).toBe("write");
  expect((await readWidgetPushIosState()).lastSeq).toBe(0);
  expect(await handleWidgetPushIos(msg(5_000))).toBe("ok");
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

describe("capacité annoncée au serveur", () => {
  const load = (register: () => Promise<unknown>) => {
    let mod: typeof import("@/services/widgetPushIos") | undefined;
    jest.isolateModules(() => {
      jest.doMock("expo-task-manager", () => ({ defineTask: jest.fn() }));
      jest.doMock("expo-notifications", () => ({
        registerTaskAsync: register,
        BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("@/services/widgetPushIos");
    });
    return mod!;
  };

  it("iPhone, tâche enregistrée : 3 (données, effacement, widgetPush si widget posé)", async () => {
    expect(Platform.OS).toBe("ios");
    expect(await load(() => Promise.resolve()).widgetPushIosCap()).toBe(3);
  });

  it("enregistrement refusé (binaire sans mode d'arrière-plan) : 0", async () => {
    expect(await load(() => Promise.reject(new Error("E_BACKGROUND_REMOTE_NOTIFICATIONS_DISABLED"))).widgetPushIosCap()).toBe(0);
  });
});

describe("effacement à distance (« w0 »)", () => {
  const w0 = (c: string) => ({ t: "w0", c, s: 9_000, p: { v: 1, childName: "" } });

  it("widget qui affiche cet enfant : données vides écrites, enfant oublié", async () => {
    await noteIosAppSnapshot("c1", 1_000);
    expect(await handleWidgetPushIos({ dataString: JSON.stringify(w0("c1")) })).toBe("wipe");
    expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ childName: "" }));
    expect((await readWidgetPushIosState()).shownChildId).toBeNull();
    // Plus rien ne s'applique pour cet enfant ensuite.
    expect(await handleWidgetPushIos(msg(10_000))).toBe("child");
  });

  it("enfant affiché inconnu (état perdu) : effacé quand même", async () => {
    await clearIosWidgetPush();
    expect(await handleWidgetPushIos(w0("c1"))).toBe("wipe");
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it("autre enfant affiché : rien n'est effacé", async () => {
    await noteIosAppSnapshot("c2", 1_000);
    expect(await handleWidgetPushIos(w0("c1"))).toBe("child");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("appliqué même app ouverte (l'effacement prime)", async () => {
    await noteIosAppSnapshot("c1", 1_000);
    setAppState("active");
    expect(await handleWidgetPushIos(w0("c1"))).toBe("wipe");
  });
});

it("« w0 » : timeline impossible → repli sur l'effacement simple, l'enfant est oublié", async () => {
  await noteIosAppSnapshot("c1", 1_000);
  mockWrite.mockReturnValueOnce(false);
  expect(await handleWidgetPushIos({ t: "w0", c: "c1", s: 9_000, p: { v: 1 } })).toBe("wipe");
  expect(mockClearWidget).toHaveBeenCalled();
  expect((await readWidgetPushIosState()).shownChildId).toBeNull();
});

it("« w0 » : timeline ET effacement simple impossibles → échec annoncé, l'enfant reste (nouvel essai possible)", async () => {
  await noteIosAppSnapshot("c1", 1_000);
  mockWrite.mockReturnValueOnce(false);
  mockClearWidget.mockReturnValueOnce(false);
  expect(await handleWidgetPushIos({ t: "w0", c: "c1", s: 9_000, p: { v: 1 } })).toBe("write");
  expect((await readWidgetPushIosState()).shownChildId).toBe("c1");
});
