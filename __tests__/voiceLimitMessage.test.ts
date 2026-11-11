// No paywall at night (22 h-7 h) and an honest message for the Premium cap.
jest.mock("@/hooks/useGuardedNavigation", () => ({ useGuardedNavigation: () => ({ push: jest.fn() }) }));
import { isQuietHours, voiceLimitMessage } from "@/components/suivibaby/voice/VoiceCommandModals";

const at = (h: number) => new Date(2026, 10, 11, h, 30);

describe("voice limit messages", () => {
  it("treats 22 h-7 h as quiet hours", () => {
    expect(isQuietHours(at(3))).toBe(true);
    expect(isQuietHours(at(22))).toBe(true);
    expect(isQuietHours(at(7))).toBe(false);
    expect(isQuietHours(at(14))).toBe(false);
  });

  it("offers Premium to free users only during the day", () => {
    expect(voiceLimitMessage("free", at(14))).toMatch(/jusqu'à 50/);
    expect(voiceLimitMessage("free", at(3))).not.toMatch(/Premium/);
    expect(voiceLimitMessage("free", at(3))).toMatch(/saisie manuelle/);
  });

  it("tells Premium users about their 50-a-day allowance", () => {
    const m = voiceLimitMessage("premium", at(14));
    expect(m).toMatch(/50 commandes vocales du jour/);
    expect(m).not.toMatch(/Passez à Premium/);
  });
});
