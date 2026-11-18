// Cache partagé de l'état VoiceOver / TalkBack : préchargé à l'import, tenu à
// jour par l'écouteur système, lisible de façon synchrone.
import { AccessibilityInfo } from "react-native";

type Service = typeof import("@/services/screenReader");

function load(initial: boolean): { svc: Service; fire: (on: boolean) => void; setFresh: (on: boolean) => void } {
  let listener: (on: boolean) => void = () => {};
  let fresh = initial;
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockImplementation(() => Promise.resolve(fresh));
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((_: string, cb: (on: boolean) => void) => {
    listener = cb;
    return { remove: jest.fn() };
  }) as never);
  let svc!: Service;
  jest.isolateModules(() => {
    svc = require("@/services/screenReader");
  });
  return { svc, fire: (on) => listener(on), setFresh: (on) => (fresh = on) };
}

afterEach(() => jest.restoreAllMocks());

it("précharge l'état système à l'import", async () => {
  const { svc } = load(true);
  expect(svc.isScreenReaderOnNow()).toBe(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(svc.isScreenReaderOnNow()).toBe(true);
});

it("l'écouteur système met le cache à jour et prévient les abonnés", () => {
  const { svc, fire } = load(false);
  const seen: boolean[] = [];
  const off = svc.subscribeScreenReader((on) => seen.push(on));
  fire(true);
  expect(svc.isScreenReaderOnNow()).toBe(true);
  fire(false);
  off();
  fire(true);
  expect(seen).toEqual([true, false]);
});

it("refreshScreenReader lit l'état frais et met le cache à jour", async () => {
  const { svc, setFresh } = load(false);
  await Promise.resolve();
  setFresh(true);
  await expect(svc.refreshScreenReader()).resolves.toBe(true);
  expect(svc.isScreenReaderOnNow()).toBe(true);
});

it("échec de la lecture : le cache est conservé", async () => {
  const { svc } = load(false);
  (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockRejectedValue(new Error("boom"));
  await expect(svc.refreshScreenReader()).resolves.toBe(false);
});

it("échec de la lecture avec un cache à true : le cache reste true", async () => {
  const { svc, fire } = load(false);
  fire(true);
  expect(svc.isScreenReaderOnNow()).toBe(true);
  (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockRejectedValue(new Error("boom"));
  await expect(svc.refreshScreenReader()).resolves.toBe(true);
  expect(svc.isScreenReaderOnNow()).toBe(true);
});

it("une lecture fraîche ancienne n'écrase pas un événement plus récent (R2)", async () => {
  const { svc, fire } = load(false);
  await Promise.resolve();
  await Promise.resolve();
  // Lecture lancée (réponse « faux » en attente), puis l'événement système « vrai » arrive.
  let answer!: (on: boolean) => void;
  (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockImplementation(
    () => new Promise<boolean>((resolve) => (answer = resolve)),
  );
  const pending = svc.refreshScreenReader();
  fire(true);
  answer(false);
  await expect(pending).resolves.toBe(true);
  expect(svc.isScreenReaderOnNow()).toBe(true);
});

it("une lecture fraîche sans événement entre-temps met bien le cache à jour", async () => {
  const { svc } = load(false);
  await Promise.resolve();
  await Promise.resolve();
  let answer!: (on: boolean) => void;
  (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockImplementation(
    () => new Promise<boolean>((resolve) => (answer = resolve)),
  );
  const pending = svc.refreshScreenReader();
  answer(true);
  await expect(pending).resolves.toBe(true);
});
