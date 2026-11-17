// « Session oubliée ? » sur l'Accueil : sieste > 6 h, nuit > 15 h, balade > 9 h.
import { fireEvent, render, screen } from "@testing-library/react-native";

import { PromenadeWidget } from "@/components/suivibaby/dashboard/PromenadeWidget";
import { SleepWidget } from "@/components/suivibaby/dashboard/SleepWidget";

jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock("@expo/vector-icons/FontAwesome6", () => "FontAwesome6");

const H = 3600_000;
const MESSAGE = "En cours depuis longtemps — oubliée ?";
const FIX = "Corriger l'heure de fin";
const ago = (ms: number) => Date.now() - ms;

const sleep = (isNap: boolean, startMs: number, over: Record<string, unknown> = {}) => (
  <SleepWidget
    isActive
    isNap={isNap}
    startTimestamp={startMs}
    startTime="08:00"
    onStartSleep={jest.fn()}
    onStopSleep={jest.fn()}
    onEditSleep={jest.fn()}
    colorScheme="light"
    {...over}
  />
);
const walk = (startMs: number, over: Record<string, unknown> = {}) => (
  <PromenadeWidget
    isActive
    startTimestamp={startMs}
    startTime="08:00"
    onStart={jest.fn()}
    onStop={jest.fn()}
    onEdit={jest.fn()}
    colorScheme="light"
    {...over}
  />
);

describe("SleepWidget", () => {
  it("sieste : avertissement seulement au-delà de 6 h", () => {
    render(sleep(true, ago(5 * H + 50 * 60_000)));
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(screen.queryByText(FIX)).toBeNull();
  });

  it("sieste > 6 h : message, bouton, libellé parlé complété", () => {
    render(sleep(true, ago(6 * H + 60_000)));
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(screen.getByText(FIX)).toBeTruthy();
    expect(screen.getByLabelText(/en cours depuis .*, oubliée \? à vérifier/)).toBeTruthy();
  });

  it("nuit : 10 h n'alerte pas, 15 h 01 alerte", () => {
    const { unmount } = render(sleep(false, ago(10 * H)));
    expect(screen.queryByText(MESSAGE)).toBeNull();
    unmount();
    render(sleep(false, ago(15 * H + 60_000)));
    expect(screen.getByText(MESSAGE)).toBeTruthy();
  });

  it("le bouton ouvre le formulaire d'édition de la session", () => {
    const onEditSleep = jest.fn();
    render(sleep(true, ago(7 * H), { onEditSleep }));
    fireEvent.press(screen.getByLabelText("Corriger l'heure de fin de la sieste"));
    expect(onEditSleep).toHaveBeenCalledTimes(1);
  });

  it("sans droit de modification : message sans bouton", () => {
    render(sleep(true, ago(7 * H), { showStopButton: false }));
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(screen.queryByText(FIX)).toBeNull();
  });

  it("session inactive : rien", () => {
    render(sleep(true, ago(20 * H), { isActive: false }));
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });
});

describe("PromenadeWidget", () => {
  it("balade : avertissement seulement au-delà de 9 h", () => {
    render(walk(ago(8 * H + 50 * 60_000)));
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it("balade > 9 h : message, bouton, libellé parlé ; le bouton ouvre l'édition", () => {
    const onEdit = jest.fn();
    render(walk(ago(9 * H + 60_000), { onEdit }));
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(screen.getByLabelText(/en cours depuis .*, oubliée \? à vérifier/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Corriger l'heure de fin de la balade"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
