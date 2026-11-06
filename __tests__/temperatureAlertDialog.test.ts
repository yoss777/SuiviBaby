import { Linking } from "react-native";

import { EMERGENCY_NUMBER_URL, showTemperatureAlertDialog } from "@/utils/temperatureAlertDialog";
import { getTemperatureAlert, WARNING_SIGNS } from "@/utils/temperatureAlert";

const birth = new Date(2026, 0, 1);
const at = (n: number) => new Date(2026, 0, 1 + n, 10);

describe("showTemperatureAlertDialog", () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });
  afterEach(() => openURL.mockRestore());

  it("moins de 3 mois : deux boutons, appel du 15 via tel:15", () => {
    const showAlert = jest.fn();
    const alert = getTemperatureAlert({ valeur: 38.5, birthDate: birth, measuredAt: at(20) })!;
    showTemperatureAlertDialog(showAlert, alert);

    const [title, message, buttons] = showAlert.mock.calls[0];
    expect(title).toBe("Température élevée");
    expect(message).toContain("Consultez en urgence un médecin ou appelez le 15");
    for (const sign of WARNING_SIGNS) expect(message).toContain(sign);
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(["J'ai compris", "Appeler le 15"]);

    expect(EMERGENCY_NUMBER_URL).toBe("tel:15");
    buttons[1].onPress();
    expect(openURL).toHaveBeenCalledWith("tel:15");
  });

  it("ne plante pas si l'appel est impossible (tablette sans téléphonie)", async () => {
    openURL.mockRejectedValue(new Error("no tel"));
    const showAlert = jest.fn();
    const alert = getTemperatureAlert({ valeur: 38.5, birthDate: birth, measuredAt: at(20) })!;
    showTemperatureAlertDialog(showAlert, alert);
    expect(() => showAlert.mock.calls[0][2][1].onPress()).not.toThrow();
    await Promise.resolve();
  });

  it("3 à 6 mois : alerte simple avec un seul bouton « J'ai compris »", () => {
    const showAlert = jest.fn();
    const alert = getTemperatureAlert({ valeur: 38.5, birthDate: birth, measuredAt: at(120) })!;
    showTemperatureAlertDialog(showAlert, alert);
    const [, message, buttons] = showAlert.mock.calls[0];
    expect(message).toContain("consultez rapidement un médecin");
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(["J'ai compris"]);
  });

  it("hypothermie : propose d'appeler le 15", () => {
    const showAlert = jest.fn();
    const alert = getTemperatureAlert({ valeur: 35.5, birthDate: birth, measuredAt: at(400) })!;
    showTemperatureAlertDialog(showAlert, alert);
    expect(showAlert.mock.calls[0][2].map((b: { text: string }) => b.text)).toEqual(["J'ai compris", "Appeler le 15"]);
  });
});
