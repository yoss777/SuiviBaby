jest.mock("@/config/firebase", () => ({ functions: {} }));
jest.mock("@/utils/errorReporting", () => ({ captureServiceError: jest.fn() }));
jest.mock("firebase/functions", () => ({ httpsCallable: jest.fn() }));
jest.mock("expo-file-system", () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

const mockRecorder = {
  prepareToRecordAsync: jest.fn(),
  record: jest.fn(),
  stop: jest.fn(),
  release: jest.fn(),
  uri: "file:///rec.m4a" as string | null,
};
jest.mock("expo-audio", () => ({
  AudioModule: { AudioRecorder: jest.fn(() => mockRecorder) },
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: ".m4a",
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      ios: { audioQuality: 127, outputFormat: "aac " },
      android: { outputFormat: "mpeg4", audioEncoder: "aac" },
    },
  },
  getRecordingPermissionsAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

import {
  AudioModule,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { Platform } from "react-native";
import { captureServiceError } from "@/utils/errorReporting";
import {
  requestPermissions,
  startRecording,
  stopRecording,
  VoicePermissionDeniedError,
} from "@/services/voice/recorder";

const granted = { status: "granted", granted: true, canAskAgain: true };
const denied = (canAskAgain: boolean) => ({ status: "denied", granted: false, canAskAgain });

beforeEach(async () => {
  jest.clearAllMocks();
  mockRecorder.uri = "file:///rec.m4a";
  mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
  mockRecorder.stop.mockResolvedValue(undefined);
  (getRecordingPermissionsAsync as jest.Mock).mockResolvedValue(granted);
  (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue(granted);
  await stopRecording(); // reset module state between tests
  jest.clearAllMocks();
});

describe("recorder (expo-audio)", () => {
  it("requestPermissions reports the OS answer", async () => {
    (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue(denied(true));
    expect(await requestPermissions()).toBe(false);
    (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    expect(await requestPermissions()).toBe(true);
  });

  it("starts with the platform-flattened HIGH_QUALITY preset", async () => {
    await startRecording();
    expect(setAudioModeAsync).toHaveBeenCalledWith({ allowsRecording: true, playsInSilentMode: true });
    const options = (AudioModule.AudioRecorder as unknown as jest.Mock).mock.calls[0][0];
    expect(options).toEqual(expect.objectContaining({ extension: ".m4a", sampleRate: 44100 }));
    // Nested per-platform blocks must be merged, not passed through.
    expect(options).not.toHaveProperty("ios");
    expect(options).not.toHaveProperty("android");
    expect(options).toEqual(expect.objectContaining(
      Platform.OS === "ios" ? { outputFormat: "aac " } : { outputFormat: "mpeg4" },
    ));
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(mockRecorder.record).toHaveBeenCalled();
  });

  it("flattens the android block on Android", async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
    try {
      await startRecording();
      const options = (AudioModule.AudioRecorder as unknown as jest.Mock).mock.calls[0][0];
      expect(options).toEqual(expect.objectContaining({ outputFormat: "mpeg4", audioEncoder: "aac" }));
      expect(options).not.toHaveProperty("audioQuality");
    } finally {
      Object.defineProperty(Platform, "OS", { get: () => original, configurable: true });
    }
  });

  it("ignores a second start while recording", async () => {
    await startRecording();
    await startRecording();
    expect(AudioModule.AudioRecorder).toHaveBeenCalledTimes(1);
  });

  it("T3.2 — re-checks permission at record time and asks when possible", async () => {
    (getRecordingPermissionsAsync as jest.Mock).mockResolvedValue(denied(true));
    (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    await startRecording();
    expect(requestRecordingPermissionsAsync).toHaveBeenCalled();
    expect(mockRecorder.record).toHaveBeenCalled();
  });

  it("T3.2 — throws VoicePermissionDeniedError without prompting when the OS refuses", async () => {
    (getRecordingPermissionsAsync as jest.Mock).mockResolvedValue(denied(false));
    const err = await startRecording().catch((e) => e);
    expect(err).toBeInstanceOf(VoicePermissionDeniedError);
    expect(err.canAskAgain).toBe(false);
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(AudioModule.AudioRecorder).not.toHaveBeenCalled();
  });

  it("releases the native recorder if preparing fails, and can start again", async () => {
    mockRecorder.prepareToRecordAsync.mockRejectedValueOnce(new Error("mic busy"));
    await expect(startRecording()).rejects.toThrow("mic busy");
    expect(mockRecorder.release).toHaveBeenCalledTimes(1);
    await startRecording();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  });

  it("stops, returns the file uri and releases the recorder", async () => {
    await startRecording();
    expect(await stopRecording()).toBe("file:///rec.m4a");
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(mockRecorder.release).toHaveBeenCalled();
  });

  it("returns null when nothing is recording", async () => {
    expect(await stopRecording()).toBeNull();
  });

  it("does not stay stuck in 'recording' when stop fails", async () => {
    await startRecording();
    mockRecorder.stop.mockRejectedValueOnce(new Error("io"));
    expect(await stopRecording()).toBeNull();
    expect(mockRecorder.release).toHaveBeenCalled();
    expect(captureServiceError).toHaveBeenCalledWith(
      expect.any(Error), expect.objectContaining({ operation: "stopRecording" }),
    );
    await startRecording();
    expect(AudioModule.AudioRecorder).toHaveBeenCalledTimes(2);
  });
});
