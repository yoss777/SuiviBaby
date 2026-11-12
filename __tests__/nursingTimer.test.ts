// Chrono de tétée persistant (P0-4 / P1-9) : modèle par horodatages et brouillon par enfant.
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  adjustSide,
  EMPTY_NURSING_TIMER,
  hasNursingProgress,
  isNursingDraftStale,
  loadLastBottle,
  loadNursingTimer,
  nursingTimerStorageKey,
  PAUSED_DRAFT_TTL_MS,
  resetSide,
  RUNNING_DRAFT_TTL_MS,
  saveLastBottle,
  saveNursingTimer,
  sideSeconds,
  toggleSide,
  type NursingTimerState,
} from "@/components/forms/nursingTimer";

const T0 = 1_700_000_000_000;
const s = (n: number) => n * 1000;

describe("modèle du chrono", () => {
  it("compte le temps à partir des horodatages, sans dépendre d'un intervalle", () => {
    const running = toggleSide(EMPTY_NURSING_TIMER, "left", T0);
    expect(running.runningSide).toBe("left");
    expect(running.startedAt).toBe(T0);
    // Feuille fermée 10 min puis rouverte : le temps a continué.
    expect(sideSeconds(running, "left", T0 + s(600))).toBe(600);
    expect(sideSeconds(running, "right", T0 + s(600))).toBe(0);
  });

  it("pause puis reprise cumulent les segments", () => {
    let st = toggleSide(EMPTY_NURSING_TIMER, "left", T0);
    st = toggleSide(st, "left", T0 + s(60)); // pause
    expect(st.runningSide).toBeNull();
    expect(st.leftSeconds).toBe(60);
    st = toggleSide(st, "left", T0 + s(120)); // reprise
    expect(sideSeconds(st, "left", T0 + s(150))).toBe(90);
    // L'heure de début reste celle du premier démarrage.
    expect(st.startedAt).toBe(T0);
  });

  it("démarrer l'autre côté fige le premier", () => {
    let st = toggleSide(EMPTY_NURSING_TIMER, "left", T0);
    st = toggleSide(st, "right", T0 + s(300));
    expect(st.runningSide).toBe("right");
    expect(st.leftSeconds).toBe(300);
    expect(sideSeconds(st, "left", T0 + s(900))).toBe(300);
    expect(sideSeconds(st, "right", T0 + s(900))).toBe(600);
  });

  it("la remise à zéro d'un côté ne touche pas l'autre (qui continue)", () => {
    let st = toggleSide(EMPTY_NURSING_TIMER, "left", T0);
    st = toggleSide(st, "right", T0 + s(300));
    st = resetSide(st, "left", T0 + s(400));
    expect(st.leftSeconds).toBe(0);
    expect(st.runningSide).toBe("right");
    expect(sideSeconds(st, "right", T0 + s(500))).toBe(200);
  });

  it("tout remettre à zéro vide le brouillon (plus d'heure de début)", () => {
    let st = toggleSide(EMPTY_NURSING_TIMER, "left", T0);
    st = resetSide(st, "left", T0 + s(30));
    expect(hasNursingProgress(st)).toBe(false);
    expect(st.startedAt).toBeNull();
  });

  it("l'ajustement manuel ne descend jamais sous zéro", () => {
    const st = adjustSide({ ...EMPTY_NURSING_TIMER, leftSeconds: 30 }, "left", -60, T0);
    expect(st.leftSeconds).toBe(0);
    expect(adjustSide(st, "right", 120, T0).rightSeconds).toBe(120);
  });

  it("un brouillon oublié est périmé (1 h en pause, 3 h en marche sans action)", () => {
    const paused: NursingTimerState = { ...EMPTY_NURSING_TIMER, leftSeconds: 60, updatedAt: T0 };
    expect(isNursingDraftStale(paused, T0 + PAUSED_DRAFT_TTL_MS - 1)).toBe(false);
    expect(isNursingDraftStale(paused, T0 + PAUSED_DRAFT_TTL_MS + 1)).toBe(true);
    const running = toggleSide(EMPTY_NURSING_TIMER, "left", T0);
    expect(isNursingDraftStale(running, T0 + PAUSED_DRAFT_TTL_MS + 1)).toBe(false);
    expect(isNursingDraftStale(running, T0 + RUNNING_DRAFT_TTL_MS + 1)).toBe(true);
  });
});

describe("persistance par enfant", () => {
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
  });

  it("un chrono en cours est repris après fermeture de la feuille", async () => {
    const running = toggleSide(EMPTY_NURSING_TIMER, "right", T0);
    await saveNursingTimer("c1", running);
    const restored = await loadNursingTimer("c1", T0 + s(1200));
    expect(restored).toEqual(running);
    expect(sideSeconds(restored!, "right", T0 + s(1200))).toBe(1200);
    // Chaque enfant a son propre chrono (jumeaux).
    expect(await loadNursingTimer("c2", T0)).toBeNull();
  });

  it("un chrono vide efface le brouillon", async () => {
    await saveNursingTimer("c1", toggleSide(EMPTY_NURSING_TIMER, "left", T0));
    await saveNursingTimer("c1", EMPTY_NURSING_TIMER);
    expect(store.has(nursingTimerStorageKey("c1"))).toBe(false);
  });

  it("un brouillon périmé ou corrompu est ignoré et effacé", async () => {
    store.set(nursingTimerStorageKey("c1"), "{pas du json");
    expect(await loadNursingTimer("c1", T0)).toBeNull();
    const paused = { ...EMPTY_NURSING_TIMER, leftSeconds: 60, updatedAt: T0 };
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(paused));
    expect(await loadNursingTimer("c1", T0 + PAUSED_DRAFT_TTL_MS + 1)).toBeNull();
    expect(store.has(nursingTimerStorageKey("c1"))).toBe(false);
  });

  it("mémorise le dernier biberon pour préremplir le suivant", async () => {
    expect(await loadLastBottle("c1")).toBeNull();
    await saveLastBottle("c1", { quantite: 150, typeBiberon: "lait_infantile" });
    expect(await loadLastBottle("c1")).toEqual({ quantite: 150, typeBiberon: "lait_infantile" });
  });
});
