import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  mettreAJourPreferencesNotifications,
  obtenirPreferencesNotifications,
  synchroniserFuseauHoraire,
} from "@/services/userPreferencesService";
import * as quietHoursUtil from "@/utils/quietHours";

jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "u1" } },
  db: {},
}));
jest.mock("@/utils/errorReporting", () => ({ captureServiceError: jest.fn() }));

const snap = (data: unknown) => ({ exists: () => data !== undefined, data: () => data });
const stored = (reminders?: Record<string, unknown>) =>
  snap({ hiddenChildrenIds: [], notifications: { push: true, reminders } });

describe("heures calmes dans les préférences utilisateur", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue("ref");
    jest.spyOn(quietHoursUtil, "getDeviceTimeZone").mockReturnValue("America/Montreal");
  });
  afterEach(() => jest.restoreAllMocks());

  it("sans champ : par défaut activé 22:00-07:00, fuseau de l'appareil", async () => {
    (getDoc as jest.Mock).mockResolvedValue(stored({ enabled: true, thresholds: { repas: 3 } }));
    const prefs = await obtenirPreferencesNotifications();
    expect(prefs.reminders?.quietHours).toEqual({
      enabled: true, start: "22:00", end: "07:00", timeZone: "America/Montreal",
    });
  });

  it("document sans rappels du tout : même défaut", async () => {
    (getDoc as jest.Mock).mockResolvedValue(snap({ hiddenChildrenIds: [], notifications: { push: true } }));
    const prefs = await obtenirPreferencesNotifications();
    expect(prefs.reminders?.quietHours?.enabled).toBe(true);
    expect(prefs.reminders?.quietHours?.start).toBe("22:00");
  });

  it("relit une valeur stockée valide, corrige une valeur invalide", async () => {
    (getDoc as jest.Mock).mockResolvedValue(
      stored({ enabled: true, quietHours: { enabled: false, start: "21:00", end: "06:30", timeZone: "Europe/Paris" } }),
    );
    expect((await obtenirPreferencesNotifications()).reminders?.quietHours).toEqual({
      enabled: false, start: "21:00", end: "06:30", timeZone: "Europe/Paris",
    });

    (getDoc as jest.Mock).mockResolvedValue(stored({ quietHours: { start: "bad", end: "07:00", timeZone: "Nope/Nope" } }));
    expect((await obtenirPreferencesNotifications()).reminders?.quietHours).toEqual({
      enabled: true, start: "22:00", end: "07:00", timeZone: "Europe/Paris",
    });
  });

  it("l'écriture fusionne quietHours sans perdre les seuils", async () => {
    (getDoc as jest.Mock).mockResolvedValue(
      stored({ enabled: true, thresholds: { repas: 3, pompages: 0, changes: 0, vitamines: 0 } }),
    );
    await mettreAJourPreferencesNotifications({
      reminders: {
        enabled: true,
        thresholds: { repas: 3, pompages: 0, changes: 0, vitamines: 0 },
        quietHours: { enabled: true, start: "23:00", end: "06:00", timeZone: "America/Montreal" },
      },
    });
    const payload = (updateDoc as jest.Mock).mock.calls[0][1];
    expect(payload.notifications.reminders.thresholds.repas).toBe(3);
    expect(payload.notifications.reminders.quietHours).toEqual({
      enabled: true, start: "23:00", end: "06:00", timeZone: "America/Montreal",
    });
  });

  describe("synchroniserFuseauHoraire (au démarrage)", () => {
    it("ne fait rien si le fuseau stocké est celui de l'appareil", async () => {
      (getDoc as jest.Mock).mockResolvedValue(
        stored({ quietHours: { enabled: true, start: "22:00", end: "07:00", timeZone: "America/Montreal" } }),
      );
      expect(await synchroniserFuseauHoraire()).toBe(false);
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it("met à jour le fuseau seul quand il a changé, sans toucher aux heures choisies", async () => {
      (getDoc as jest.Mock).mockResolvedValue(
        stored({ quietHours: { enabled: false, start: "21:00", end: "06:00", timeZone: "Europe/Paris" } }),
      );
      expect(await synchroniserFuseauHoraire()).toBe(true);
      expect(updateDoc).toHaveBeenCalledWith("ref", {
        "notifications.reminders.quietHours": { enabled: false, start: "21:00", end: "06:00", timeZone: "America/Montreal" },
      });
    });

    it("écrit le défaut avec le fuseau de l'appareil quand aucun réglage n'est stocké", async () => {
      (getDoc as jest.Mock).mockResolvedValue(snap({ hiddenChildrenIds: [], notifications: { push: true } }));
      expect(await synchroniserFuseauHoraire()).toBe(true);
      expect(updateDoc).toHaveBeenCalledWith("ref", {
        "notifications.reminders.quietHours": { enabled: true, start: "22:00", end: "07:00", timeZone: "America/Montreal" },
      });
    });

    it("n'échoue jamais (hors ligne) : renvoie false", async () => {
      (getDoc as jest.Mock).mockRejectedValue(new Error("offline"));
      jest.spyOn(console, "error").mockImplementation(() => {});
      await expect(synchroniserFuseauHoraire()).resolves.toBe(false);
    });
  });
});
