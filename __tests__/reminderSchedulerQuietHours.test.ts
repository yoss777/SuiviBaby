import { act, renderHook } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { useReminderScheduler } from "@/hooks/useReminderScheduler";
import { rescheduleAllReminders, scheduleReminder } from "@/services/localNotificationService";

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve("id")),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const secondsOf = (call = 0) => schedule.mock.calls[call][0].trigger.seconds;
const HOUR = 3600;
const paris = (over = {}) => ({ enabled: true, start: "22:00", end: "07:00", timeZone: "Europe/Paris", ...over });
const thresholds = { repas: 3, pompages: 0, changes: 0, vitamines: 0 };

describe("rappels locaux et heures calmes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: Date.parse("2026-06-15T18:00:00Z") }); // 20:00 Paris
  });
  afterEach(() => jest.useRealTimers());

  it("scheduleReminder : un rappel qui tomberait en heures calmes est décalé à leur fin", async () => {
    await scheduleReminder("c", "Léa", "repas", 3, paris()); // 23:00 -> 07:00
    expect(secondsOf()).toBe(11 * HOUR);
  });

  it("scheduleReminder : hors heures calmes, délai inchangé", async () => {
    await scheduleReminder("c", "Léa", "repas", 1, paris()); // 21:00
    expect(secondsOf()).toBe(1 * HOUR);
  });

  it("scheduleReminder : heures calmes désactivées, délai inchangé", async () => {
    await scheduleReminder("c", "Léa", "repas", 3, paris({ enabled: false }));
    expect(secondsOf()).toBe(3 * HOUR);
  });

  it("rescheduleAllReminders : dépassé (notif dans 1 min) la nuit -> décalé à la fin", async () => {
    jest.setSystemTime(Date.parse("2026-06-15T22:00:00Z")); // 00:00 Paris
    await rescheduleAllReminders("c", "Léa", thresholds, { repas: new Date(Date.now() - 5 * HOUR * 1000) }, paris());
    expect(secondsOf()).toBe(7 * HOUR); // 00:00 -> 07:00
  });

  it("rescheduleAllReminders : temps restant qui tombe la nuit -> décalé à la fin", async () => {
    // Dernier événement il y a 1 h (19:00), seuil 3 h -> 22:00 pile : début de la plage.
    await rescheduleAllReminders("c", "Léa", thresholds, { repas: new Date(Date.now() - 1 * HOUR * 1000) }, paris());
    expect(secondsOf()).toBe(11 * HOUR); // 20:00 -> 07:00
  });

  it("rescheduleAllReminders : temps restant hors plage -> inchangé", async () => {
    await rescheduleAllReminders("c", "Léa", thresholds, { repas: new Date(Date.now() - 2 * HOUR * 1000) }, paris());
    expect(secondsOf()).toBe(1 * HOUR);
  });

  it("rescheduleAllReminders sans heures calmes fournies : défaut 22:00-07:00 (comme le serveur)", async () => {
    await rescheduleAllReminders("c", "Léa", thresholds, { repas: null });
    expect(secondsOf()).toBe(11 * HOUR);
  });
});

describe("useReminderScheduler : heures calmes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: Date.parse("2026-06-15T18:00:00Z") });
  });
  afterEach(() => jest.useRealTimers());

  const prefs = (quietHours: ReturnType<typeof paris>) => ({ enabled: true, thresholds, quietHours });

  const flush = () => act(async () => {});

  it("passe les heures calmes au planificateur", async () => {
    renderHook(() => useReminderScheduler("c", "Léa", prefs(paris()), {}));
    await flush();
    expect(secondsOf()).toBe(11 * HOUR);
  });

  it("replanifie quand les heures calmes changent", async () => {
    const { rerender } = renderHook(
      ({ qh }: { qh: ReturnType<typeof paris> }) => useReminderScheduler("c", "Léa", prefs(qh), {}),
      { initialProps: { qh: paris() } },
    );
    await flush();
    expect(schedule).toHaveBeenCalledTimes(1);
    rerender({ qh: paris({ enabled: false }) });
    await flush();
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(secondsOf(1)).toBe(3 * HOUR);
    rerender({ qh: paris({ enabled: false, timeZone: "America/Montreal" }) });
    await flush();
    expect(schedule).toHaveBeenCalledTimes(3);
  });
});
