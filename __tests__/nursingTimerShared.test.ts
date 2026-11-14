// Tétée en cours partagée par le foyer : fusion du brouillon local et du
// document partagé (le plus récent l'emporte, pierre tombale à la fin).
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  clearNursingTimer,
  EMPTY_NURSING_TIMER,
  loadNursingTimer,
  nursingTimerStorageKey,
  pickNewerNursingState,
  saveNursingTimer,
  setNursingTimerRemote,
  subscribeNursingTimer,
  toggleSide,
  type NursingTimerRemote,
  type NursingTimerState,
} from "@/components/forms/nursingTimer";

const T0 = 1_700_000_000_000;
const s = (n: number) => n * 1000;

function fakeRemote() {
  const docs = new Map<string, NursingTimerState>();
  const listeners = new Map<string, (st: NursingTimerState | null) => void>();
  const remote: NursingTimerRemote = {
    read: jest.fn(async (id) => docs.get(id) ?? null),
    write: jest.fn(async (id, st) => {
      docs.set(id, st);
    }),
    subscribe: jest.fn((id, cb) => {
      listeners.set(id, cb);
      return () => listeners.delete(id);
    }),
  };
  return { remote, docs, emit: (id: string, st: NursingTimerState | null) => listeners.get(id)?.(st) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) =>
    Promise.resolve(store.has(k) ? store.get(k)! : null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation((k: string) => {
    store.delete(k);
    return Promise.resolve();
  });
  setNursingTimerRemote(null);
});

afterAll(() => setNursingTimerRemote(null));

describe("pickNewerNursingState", () => {
  it("garde le plus récent, et l'un ou l'autre s'il manque", () => {
    const a = { ...EMPTY_NURSING_TIMER, updatedAt: 1 };
    const b = { ...EMPTY_NURSING_TIMER, updatedAt: 2 };
    expect(pickNewerNursingState(a, b)).toBe(b);
    expect(pickNewerNursingState(b, a)).toBe(b);
    expect(pickNewerNursingState(null, a)).toBe(a);
    expect(pickNewerNursingState(a, null)).toBe(a);
  });
});

describe("synchronisation avec le foyer", () => {
  it("publie la tétée démarrée, puis une pierre tombale à la fin", async () => {
    const { remote, docs } = fakeRemote();
    setNursingTimerRemote(remote);
    const running = toggleSide(EMPTY_NURSING_TIMER, "left", T0);
    await saveNursingTimer("c1", running);
    expect(docs.get("c1")?.runningSide).toBe("left");

    await clearNursingTimer("c1", T0 + s(600));
    const tomb = docs.get("c1")!;
    expect(tomb.runningSide).toBeNull();
    expect(tomb.leftSeconds).toBe(0);
    expect(tomb.updatedAt).toBe(T0 + s(600));
    expect(await AsyncStorage.getItem(nursingTimerStorageKey("c1"))).toBeNull();
  });

  it("l'autre parent reprend la tétée lancée par la mère sur un autre téléphone", async () => {
    const { remote, docs } = fakeRemote();
    setNursingTimerRemote(remote);
    docs.set("c1", toggleSide(EMPTY_NURSING_TIMER, "right", T0));
    const draft = await loadNursingTimer("c1", T0 + s(300));
    expect(draft?.runningSide).toBe("right");
    // Le cache local est aligné : lisible ensuite sans réseau.
    expect(await AsyncStorage.getItem(nursingTimerStorageKey("c1"))).not.toBeNull();
  });

  it("une tétée terminée ailleurs efface le brouillon local plus ancien", async () => {
    const { remote, docs } = fakeRemote();
    await saveNursingTimer("c1", toggleSide(EMPTY_NURSING_TIMER, "left", T0));
    setNursingTimerRemote(remote);
    docs.set("c1", { ...EMPTY_NURSING_TIMER, updatedAt: T0 + s(60) });
    expect(await loadNursingTimer("c1", T0 + s(120))).toBeNull();
    expect(await AsyncStorage.getItem(nursingTimerStorageKey("c1"))).toBeNull();
  });

  it("hors ligne (lecture qui ne répond pas), le brouillon local suffit", async () => {
    jest.useFakeTimers();
    try {
      await saveNursingTimer("c1", toggleSide(EMPTY_NURSING_TIMER, "left", T0));
      setNursingTimerRemote({
        read: () => new Promise(() => {}),
        write: async () => {},
        subscribe: () => () => {},
      });
      const pending = loadNursingTimer("c1", T0 + s(60));
      await jest.advanceTimersByTimeAsync(2000);
      expect((await pending)?.runningSide).toBe("left");
    } finally {
      jest.useRealTimers();
    }
  });

  it("le bandeau suit le foyer : apparition puis disparition", async () => {
    const { remote, emit } = fakeRemote();
    setNursingTimerRemote(remote);
    const seen: (NursingTimerState | null)[] = [];
    const unsubscribe = subscribeNursingTimer("c1", (st) => seen.push(st));

    emit("c1", toggleSide(EMPTY_NURSING_TIMER, "left", Date.now()));
    await flush();
    expect(seen.at(-1)?.runningSide).toBe("left");

    emit("c1", { ...EMPTY_NURSING_TIMER, updatedAt: Date.now() + 1000 });
    await flush();
    expect(seen.at(-1)).toBeNull();
    unsubscribe();
  });

  it("sans adaptateur, rien n'est publié et l'abonnement est inerte", async () => {
    await saveNursingTimer("c1", toggleSide(EMPTY_NURSING_TIMER, "left", T0));
    const unsubscribe = subscribeNursingTimer("c1", () => {
      throw new Error("ne doit pas être appelé");
    });
    unsubscribe();
  });
});
