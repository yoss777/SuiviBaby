import { fireEvent, render, screen } from "@testing-library/react-native";

import { VoiceBar, getVoiceBarCopy, isOutsideBounds } from "@/components/suivibaby/VoiceBar";
import type { VoiceInput } from "@/hooks/useVoiceInput";

// The real module pulls in the recording/RevenueCat stack; only its formatter is needed here.
jest.mock("@/hooks/useVoiceInput", () => ({
  formatRecordingDuration: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
}));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
let mockIsNight = false;
jest.mock("@/hooks/useNightMode", () => ({
  useNightMode: () => ({
    isNightMode: mockIsNight,
    fontSize: mockIsNight ? { small: 14, normal: 17, large: 22 } : { small: 12, normal: 15, large: 20 },
    animations: { decorative: !mockIsNight },
  }),
}));
jest.mock("@expo/vector-icons/FontAwesome5", () => "FontAwesome5");

const makeInput = (overrides: Partial<VoiceInput> = {}) =>
  ({
    status: "idle",
    elapsedSeconds: 0,
    isHandsFree: false,
    onPressIn: jest.fn(),
    onPressOut: jest.fn(),
    onPress: jest.fn(),
    ...overrides,
  }) as unknown as VoiceInput;

const renderBar = (input: VoiceInput, dimmed = false) =>
  render(<VoiceBar input={input} bottom={60} right={88} dimmed={dimmed} />);

describe("getVoiceBarCopy", () => {
  it("invites to hold the bar when idle", () => {
    expect(getVoiceBarCopy("idle", 0, false).title).toBe("Maintenez pour parler");
  });

  it("shows the duration and how to send while recording", () => {
    expect(getVoiceBarCopy("recording", 7, false)).toEqual({
      title: "Je vous écoute… 0:07",
      subtitle: "Relâchez pour envoyer",
    });
    expect(getVoiceBarCopy("recording", 7, true).subtitle).toBe("Touchez pour envoyer");
  });

  it("warns that releasing will cancel when the finger left the bar", () => {
    expect(getVoiceBarCopy("recording", 3, false, true).subtitle).toBe("Relâchez pour annuler");
  });

  it("explains processing and confirmation", () => {
    expect(getVoiceBarCopy("processing", 0, false).title).toBe("Je réfléchis…");
    expect(getVoiceBarCopy("confirming", 0, false).subtitle).toBe(
      "Rien n'est enregistré sans votre accord",
    );
  });
});

describe("isOutsideBounds", () => {
  const bounds = { x: 16, y: 700, width: 280, height: 56 };

  it("is false inside the bar and within the tolerance", () => {
    expect(isOutsideBounds(bounds, 100, 720)).toBe(false);
    expect(isOutsideBounds(bounds, 300, 690)).toBe(false);
  });

  it("is true once the finger drifts beyond the tolerance", () => {
    expect(isOutsideBounds(bounds, 100, 600)).toBe(true);
    expect(isOutsideBounds(bounds, 340, 720)).toBe(true);
  });

  it("never cancels when the bar was not measured", () => {
    expect(isOutsideBounds(null, 0, 0)).toBe(false);
  });
});

describe("VoiceBar", () => {
  beforeEach(() => {
    mockIsNight = false;
  });

  it("exposes the visible text in its accessible name (WCAG 2.5.3)", () => {
    renderBar(makeInput());
    const bar = screen.getByRole("button", { name: "Maintenez pour parler, commande vocale" });
    expect(bar.props.accessibilityHint).toMatch(/Touchez deux fois pour démarrer/);
  });

  it("forwards press-in and an inside release to the voice input", () => {
    const input = makeInput();
    renderBar(input);
    const bar = screen.getByTestId("voice-bar");
    fireEvent(bar, "pressIn", { nativeEvent: { pageX: 50, pageY: 50 } });
    fireEvent(bar, "pressOut", { nativeEvent: { pageX: 50, pageY: 50 } });
    expect(input.onPressIn).toHaveBeenCalledTimes(1);
    expect(input.onPressOut).toHaveBeenCalledWith(false);
  });

  it("shows the recording state with its duration", () => {
    renderBar(makeInput({ status: "recording", elapsedSeconds: 12 }));
    expect(screen.getByText("Je vous écoute… 0:12")).toBeTruthy();
    expect(screen.getByTestId("voice-bar").props.accessibilityValue).toEqual({ text: "0:12" });
    // La durée n'est pas dupliquée dans le libellé
    expect(screen.getByTestId("voice-bar").props.accessibilityLabel).not.toMatch(/0:12/);
  });

  it("is marked busy while the command is processed", () => {
    renderBar(makeInput({ status: "processing" }));
    expect(screen.getByTestId("voice-bar").props.accessibilityState).toMatchObject({ busy: true });
  });

  it("ignores touches while the quick-add menu is open", () => {
    renderBar(makeInput(), true);
    expect(screen.getByTestId("voice-bar").props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it("drops the example sentence at night", () => {
    mockIsNight = true;
    renderBar(makeInput());
    expect(screen.queryByText("« Biberon de 150 ml à 6 h 40 »")).toBeNull();
  });
});
