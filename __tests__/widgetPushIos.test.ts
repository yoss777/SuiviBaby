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

const mockCapture = jest.fn();
jest.mock("@/utils/errorReporting", () => ({ captureServiceError: (...a: unknown[]) => mockCapture(...a) }));

import { handleWidgetPushIos, readW1 } from "@/services/widgetPushIos";
import {
  clearIosWidgetPush,
  clockOffsetMs,
  decideWidgetPush,
  nextOffsetSamples,
  noteIosAppSnapshot,
  readWidgetPushIosState,
  __resetWidgetPushIosReportsForTests,
} from "@/services/widgetPushIosState";

const store = new Map<string, string>();
const setAppState = (state: string) =>
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });

beforeEach(() => {
  store.clear();
  mockWrite.mockClear();
  mockCapture.mockClear();
  __resetWidgetPushIosReportsForTests();
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
  const state = { shownChildId: "c1", lastSeq: 100, appWriteAtMs: 50_000, offsetSamples: [] as [number, number][] };
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

describe("horloge du téléphone décalée (écart estimé, dernières 24 h)", () => {
  const T = 1_000_000_000_000; // écriture de l'app, heure serveur
  const AHEAD = 60_000; // téléphone en avance d'une minute
  const history = (offset: number, at: number) => JSON.stringify([[offset + 300, at - 3_600_000], [offset + 200, at - 1_800_000]]);

  it("écart = plus petit échantillon des dernières 24 h, sans le message en cours ; aucun : 0", () => {
    expect(clockOffsetMs([[60_300, T - 10], [60_200, T - 20]], T)).toBe(60_200);
    expect(clockOffsetMs([], T)).toBe(0);
    expect(clockOffsetMs([[60_200, T - 25 * 3_600_000]], T)).toBe(0);
    expect(clockOffsetMs([[-30_000, T - 10]], T)).toBe(-30_000);
    expect(nextOffsetSamples(Array.from({ length: 12 }, (_, i) => [60_000 + i, T - i] as [number, number]), 60_500, T)).toHaveLength(10);
  });

  it("téléphone en avance : un message frais n'est plus refusé, un vieux livré en retard l'est", async () => {
    await noteIosAppSnapshot("c1", T + AHEAD);
    store.set("widgetPushIos:offsets", history(AHEAD, T + AHEAD));
    expect(await handleWidgetPushIos(msg(T + 1_000), T + 1_000 + AHEAD + 1_200)).toBe("ok");
    store.delete("widgetPushIos:seq");
    expect(await handleWidgetPushIos(msg(T - 10_000), T + 10_000 + AHEAD)).toBe("app");
  });

  it("téléphone en retard : un vieux message reste refusé", async () => {
    await noteIosAppSnapshot("c1", T - 30_000);
    store.set("widgetPushIos:offsets", history(-30_000, T - 30_000));
    expect(await handleWidgetPushIos(msg(T - 10_000), T - 30_000 + 15_000)).toBe("app");
  });

  it("sans historique : tolérance fixe de 2 s, la garde protège dès le premier message", async () => {
    await noteIosAppSnapshot("c1", T);
    expect(await handleWidgetPushIos(msg(T - 10_000), T + 30_000)).toBe("app");
    expect(await handleWidgetPushIos(msg(T + 1_000), T + 2_000)).toBe("ok");
  });

  it("livraison très tardive : l'historique n'est pas effacé, le message reste refusé", async () => {
    await noteIosAppSnapshot("c1", T);
    store.set("widgetPushIos:offsets", history(0, T));
    expect(await handleWidgetPushIos(msg(T - 60_000), T + 9 * 60_000)).toBe("app");
    expect(JSON.parse(store.get("widgetPushIos:offsets")!)).toHaveLength(3);
  });

  it("plus de 10 min après l'écriture de l'app : la garde ne bloque plus (changement d'heure jamais durable)", async () => {
    await noteIosAppSnapshot("c1", T);
    store.set("widgetPushIos:offsets", history(-3_600_000, T));
    expect(await handleWidgetPushIos(msg(T + 60_000), T + 11 * 60_000)).toBe("ok");
  });

  it("heure du téléphone reculée après l'écriture de l'app : la garde ne fige pas le widget", async () => {
    await noteIosAppSnapshot("c1", T);
    expect(await handleWidgetPushIos(msg(T - 7_200_000), T - 3_600_000)).toBe("ok");
  });

  it("séquence aberrante ou données sans enfant : invalide, rien de retenu", async () => {
    await noteIosAppSnapshot("c1", 1_000);
    expect(await handleWidgetPushIos(msg(5_000_000_000_000))).toBe("invalid");
    expect(await handleWidgetPushIos({ t: "w1", c: "c1", s: 5_000, p: { v: 1, childName: "Léa" } })).toBe("invalid");
    expect(store.has("widgetPushIos:offsets")).toBe(false);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("une erreur sur un message ne bloque pas les suivants", async () => {
    await noteIosAppSnapshot("c1", 1_000);
    mockWrite.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(handleWidgetPushIos(msg(5_000))).rejects.toThrow("boom");
    expect(await handleWidgetPushIos(msg(6_000))).toBe("ok");
  });
});

it("données d'un autre enfant que celui annoncé : jamais écrites", async () => {
  await noteIosAppSnapshot("c1", 1_000);
  expect(await handleWidgetPushIos({ t: "w1", c: "c1", s: 5_000, p: { v: 1, childId: "c2", childName: "Autre" } })).toBe("invalid");
  expect(mockWrite).not.toHaveBeenCalled();
});

it("deux messages reçus en même temps : traités un par un (la séquence ne recule jamais)", async () => {
  await noteIosAppSnapshot("c1", 1_000);
  const [a, b] = await Promise.all([handleWidgetPushIos(msg(6_000)), handleWidgetPushIos(msg(5_000))]);
  expect([a, b]).toEqual(["ok", "seq"]);
  expect((await readWidgetPushIosState()).lastSeq).toBe(6_000);
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

  it("effacement et mise à jour reçus en même temps : la mise à jour ne revient jamais après l'effacement", async () => {
    await noteIosAppSnapshot("c1", 1_000);
    const [wipe, update] = await Promise.all([handleWidgetPushIos(w0("c1")), handleWidgetPushIos(msg(10_000))]);
    expect([wipe, update]).toEqual(["wipe", "child"]);
    expect(mockWrite).toHaveBeenCalledTimes(1);
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

describe("disque de l'iPhone en panne : jamais en silence", () => {
  it("lecture impossible : raison « state » (pas « enfant inconnu »), signalée une fois", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() => Promise.reject(new Error("disk")));
    expect(await handleWidgetPushIos(msg(5_000))).toBe("state");
    expect(await handleWidgetPushIos(msg(6_000))).toBe("state");
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture.mock.calls[0][1]).toMatchObject({ operation: "stateRead" });
  });

  it("séquence non notée après écriture du widget : « write » (iOS reçoit échec), signalée", async () => {
    await noteIosAppSnapshot("c1", 1_000);
    (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
      if (k === "widgetPushIos:seq") return Promise.reject(new Error("full"));
      store.set(k, v);
      return Promise.resolve();
    });
    expect(await handleWidgetPushIos(msg(5_000), 5_100)).toBe("write");
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockCapture.mock.calls.some((c) => c[1]?.operation === "stateWrite")).toBe(true);
  });

  it("échantillons d'horloge corrompus : signalés, le message s'applique quand même", async () => {
    await noteIosAppSnapshot("c1", 1_000);
    store.set("widgetPushIos:offsets", "{pas du json");
    expect(await handleWidgetPushIos(msg(5_000), 5_100)).toBe("ok");
    expect(mockCapture.mock.calls.some((c) => c[1]?.operation === "stateOffsetsCorrupt")).toBe(true);
  });
});
