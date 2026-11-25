// 1.0.28 : chaque appel de fonction attend App Check (borné), puis part.
const mockWait = jest.fn();
const mockInner = Object.assign(jest.fn(), { stream: jest.fn() });
const mockFirebaseHttpsCallable = jest.fn((..._args: unknown[]) => mockInner);

jest.mock("@/config/appCheck", () => ({
  waitForAppCheckReady: (...args: unknown[]) => mockWait(...args),
}));
jest.mock("firebase/functions", () => ({
  httpsCallable: (...args: unknown[]) => mockFirebaseHttpsCallable(...args),
}));

// eslint-disable-next-line import/first
import { httpsCallable } from "@/config/callable";

const fakeApp = { name: "app" };
const functionsInstance = { app: fakeApp } as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockInner.mockResolvedValue({ data: "ok" });
  mockInner.stream.mockResolvedValue({ data: Promise.resolve("ok"), stream: [] });
});

describe("httpsCallable (config/callable)", () => {
  it("attend App Check avant d'appeler la fonction", async () => {
    const order: string[] = [];
    mockWait.mockImplementation(async () => {
      order.push("wait");
      return true;
    });
    mockInner.mockImplementation(async () => {
      order.push("call");
      return { data: "ok" };
    });
    await expect(httpsCallable(functionsInstance, "f")({ a: 1 })).resolves.toEqual({ data: "ok" });
    expect(order).toEqual(["wait", "call"]);
    expect(mockWait).toHaveBeenCalledWith(fakeApp);
    expect(mockInner).toHaveBeenCalledWith({ a: 1 });
  });

  it("appelle quand même si l'attente échoue (le serveur tranche)", async () => {
    mockWait.mockResolvedValue(false);
    await httpsCallable(functionsInstance, "f")();
    expect(mockInner).toHaveBeenCalledTimes(1);
  });

  it("transmet les options seulement si elles sont données", () => {
    httpsCallable(functionsInstance, "f");
    httpsCallable(functionsInstance, "g", { timeout: 8000 });
    expect(mockFirebaseHttpsCallable.mock.calls[0]).toEqual([functionsInstance, "f"]);
    expect(mockFirebaseHttpsCallable.mock.calls[1]).toEqual([functionsInstance, "g", { timeout: 8000 }]);
  });

  it("attend aussi App Check avant un appel en flux", async () => {
    mockWait.mockResolvedValue(true);
    await httpsCallable(functionsInstance, "f").stream({ a: 1 });
    expect(mockWait).toHaveBeenCalledTimes(1);
    expect(mockInner.stream).toHaveBeenCalledWith({ a: 1 }, undefined);
  });
});
