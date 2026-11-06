import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import {
  MAX_RECORDING_SECONDS,
  TAP_TO_TOGGLE_MAX_MS,
  formatRecordingDuration,
  getVoiceInputStatus,
  useVoiceInput,
} from "@/hooks/useVoiceInput";

const mockVoice = {
  isRecording: false,
  isProcessing: false,
  testMode: false,
  confirmModal: { visible: false },
  startVoiceCommand: jest.fn(),
  stopVoiceCommand: jest.fn(),
  cancelRecording: jest.fn(),
};
let mockChildId = "child-1";
let mockHasUnlimitedVoice = false;
let mockQuota = { allowed: true, remaining: 2 };

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Warning: "warning", Success: "success" },
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ firebaseUser: { uid: "u1" } }),
}));
jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({ activeChild: { id: mockChildId } }),
}));
jest.mock("@/contexts/PremiumContext", () => ({
  usePremium: () => ({ checkFeatureAccess: () => mockHasUnlimitedVoice }),
}));
jest.mock("@/hooks/useVoiceCommand", () => ({
  useVoiceCommand: () => mockVoice,
}));
let mockNoticeSeen = true;
jest.mock("@/services/voiceNoticeService", () => ({
  hasSeenVoiceNotice: jest.fn(async () => mockNoticeSeen),
  markVoiceNoticeSeen: jest.fn(async () => undefined),
}));
jest.mock("@/services/premiumUsageService", () => ({
  getVoiceUsageStatus: jest.fn(async () => mockQuota),
}));

describe("getVoiceInputStatus", () => {
  const base = { isRecording: false, isProcessing: false, confirmModal: { visible: false } };

  it("is idle by default", () => {
    expect(getVoiceInputStatus(base)).toBe("idle");
  });

  it("prioritises the confirmation over processing", () => {
    expect(
      getVoiceInputStatus({ ...base, isProcessing: true, confirmModal: { visible: true } }),
    ).toBe("confirming");
  });

  it("reports recording before processing", () => {
    expect(getVoiceInputStatus({ ...base, isRecording: true, isProcessing: true })).toBe(
      "recording",
    );
    expect(getVoiceInputStatus({ ...base, isProcessing: true })).toBe("processing");
  });
});

describe("formatRecordingDuration", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatRecordingDuration(0)).toBe("0:00");
    expect(formatRecordingDuration(7)).toBe("0:07");
    expect(formatRecordingDuration(75)).toBe("1:15");
  });
});

describe("useVoiceInput gestures", () => {
  let now = 1_000_000;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockVoice, { isRecording: false, isProcessing: false, testMode: false });
    mockHasUnlimitedVoice = false;
    mockQuota = { allowed: true, remaining: 2 };
    mockChildId = "child-1";
    mockNoticeSeen = true;
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    (Date.now as jest.Mock).mockRestore();
  });

  it("starts recording on press-in when the free quota allows it", async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.onPressIn();
    });
    expect(mockVoice.startVoiceCommand).toHaveBeenCalledTimes(1);
    expect(result.current.voiceLimitReached).toBe(false);
  });

  it("shows the first-use notice instead of recording, then records once dismissed", async () => {
    mockNoticeSeen = false;
    const notice = jest.requireMock("@/services/voiceNoticeService");
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.onPressIn();
    });
    expect(result.current.voiceNoticeVisible).toBe(true);
    expect(mockVoice.startVoiceCommand).not.toHaveBeenCalled();

    act(() => result.current.dismissVoiceNotice());
    expect(result.current.voiceNoticeVisible).toBe(false);
    expect(notice.markVoiceNoticeSeen).toHaveBeenCalledWith("u1");
    expect(notice.hasSeenVoiceNotice).toHaveBeenCalledWith("u1");

    mockNoticeSeen = true;
    await act(async () => {
      await result.current.onPressIn();
    });
    expect(mockVoice.startVoiceCommand).toHaveBeenCalledTimes(1);
  });

  it("opens the quota paywall instead of recording when the quota is used up", async () => {
    mockQuota = { allowed: false, remaining: 0 };
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.onPressIn();
    });
    expect(mockVoice.startVoiceCommand).not.toHaveBeenCalled();
    expect(result.current.voiceLimitReached).toBe(true);
  });

  it("skips the quota check for unlimited (Premium) users", async () => {
    mockHasUnlimitedVoice = true;
    const premiumUsage = jest.requireMock("@/services/premiumUsageService");
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.onPressIn();
    });
    expect(premiumUsage.getVoiceUsageStatus).not.toHaveBeenCalled();
    expect(mockVoice.startVoiceCommand).toHaveBeenCalledTimes(1);
  });

  it("sends the recording when a long press is released", async () => {
    const { result, rerender } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.onPressIn();
    });
    mockVoice.isRecording = true;
    rerender({});
    now += TAP_TO_TOGGLE_MAX_MS + 500;
    act(() => {
      result.current.onPressOut();
    });
    expect(mockVoice.stopVoiceCommand).toHaveBeenCalledTimes(1);
  });

  it("keeps listening after a short tap and stops on the next tap", async () => {
    const { result, rerender } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.onPressIn();
    });
    mockVoice.isRecording = true;
    rerender({});
    now += 100;
    act(() => {
      result.current.onPressOut();
    });
    expect(mockVoice.stopVoiceCommand).not.toHaveBeenCalled();
    expect(result.current.isHandsFree).toBe(true);

    now += 3000;
    await act(async () => {
      await result.current.onPressIn();
    });
    act(() => {
      result.current.onPressOut();
    });
    expect(mockVoice.stopVoiceCommand).toHaveBeenCalledTimes(1);
    expect(mockVoice.startVoiceCommand).toHaveBeenCalledTimes(1);
  });

  it("ignores presses while a command is being processed", async () => {
    mockVoice.isProcessing = true;
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.onPressIn();
    });
    act(() => {
      result.current.onPressOut();
    });
    expect(mockVoice.startVoiceCommand).not.toHaveBeenCalled();
    expect(mockVoice.stopVoiceCommand).not.toHaveBeenCalled();
  });

  it("cancels instead of sending when the finger is released outside the bar", async () => {
    const { result, rerender } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.onPressIn();
    });
    mockVoice.isRecording = true;
    rerender({});
    now += 2000;
    act(() => {
      result.current.onPressOut(true);
    });
    expect(mockVoice.cancelRecording).toHaveBeenCalledTimes(1);
    expect(mockVoice.stopVoiceCommand).not.toHaveBeenCalled();
  });

  it("cancels the recording when the app goes to background", () => {
    let listener: ((state: string) => void) | undefined;
    const spy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, handler) => {
        listener = handler as (state: string) => void;
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
    mockVoice.isRecording = true;
    renderHook(() => useVoiceInput());
    act(() => {
      listener?.("background");
    });
    expect(mockVoice.cancelRecording).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("cancels the recording when the active child changes", () => {
    mockVoice.isRecording = true;
    const { rerender } = renderHook(() => useVoiceInput());
    expect(mockVoice.cancelRecording).not.toHaveBeenCalled();
    mockChildId = "child-2";
    rerender({});
    expect(mockVoice.cancelRecording).toHaveBeenCalledTimes(1);
  });

  it("sends a forgotten recording automatically after the maximum duration", () => {
    jest.useFakeTimers();
    try {
      mockVoice.isRecording = true;
      renderHook(() => useVoiceInput());
      // Fake timers also drive Date.now, so advancing them moves the clock.
      act(() => {
        jest.advanceTimersByTime((MAX_RECORDING_SECONDS + 1) * 1000);
      });
      expect(mockVoice.stopVoiceCommand).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
