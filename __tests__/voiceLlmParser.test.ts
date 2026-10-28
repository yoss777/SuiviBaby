jest.mock("@/config/firebase", () => ({ functions: {}, auth: { currentUser: null } }));
jest.mock("@/utils/errorReporting", () => ({
  captureServiceError: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

const mockCallable = jest.fn();
jest.mock("firebase/functions", () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import { captureServiceError } from "@/utils/errorReporting";
import { parseVoiceText, LLM_PARSE_TIMEOUT_MS } from "@/services/voice/llmParser";

const NOW = new Date(2026, 9, 28, 14, 30);
const callableError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  jest.clearAllMocks();
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
});

describe("parseVoiceText", () => {
  it("uses the LLM result when the function answers", async () => {
    mockCallable.mockResolvedValue({
      data: {
        action: "add",
        truncated: false,
        events: [{ type: "biberon", time: { kind: "at", clock: "13:00" }, quantiteMl: 180 }],
      },
    });

    const out = await parseVoiceText("Il a bu un biberon de 180 à 13h", NOW);

    expect(out.source).toBe("llm");
    expect(out.commands).toHaveLength(1);
    expect(out.commands[0]).toEqual(expect.objectContaining({ type: "biberon", quantite: 180 }));
    expect(out.commands[0].timestamp.getHours()).toBe(13);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "parseVoiceCommand", { timeout: LLM_PARSE_TIMEOUT_MS });
    expect(mockCallable).toHaveBeenCalledWith({ text: "Il a bu un biberon de 180 à 13h", localTime: "14:30" });
  });

  it("trusts an LLM 'none' instead of second-guessing it with the rules", async () => {
    mockCallable.mockResolvedValue({ data: { action: "none", events: [], truncated: false } });
    const out = await parseVoiceText("Combien de biberons il a bu aujourd'hui ?", NOW);
    expect(out).toEqual(expect.objectContaining({ source: "llm", commands: [] }));
  });

  it.each(["functions/unavailable", "functions/resource-exhausted", "functions/deadline-exceeded", "functions/not-found"])(
    "falls back to the rules on %s without reporting an error",
    async (code) => {
      mockCallable.mockRejectedValue(callableError(code));
      const out = await parseVoiceText("Biberon de 150 ml", NOW);
      expect(out.source).toBe("rules");
      expect(out.fallbackReason).toBe(code);
      expect(out.commands[0]).toEqual(expect.objectContaining({ type: "biberon", quantite: 150 }));
      expect(captureServiceError).not.toHaveBeenCalled();
    },
  );

  it("falls back and reports unexpected errors", async () => {
    mockCallable.mockRejectedValue(callableError("functions/internal"));
    const out = await parseVoiceText("pipi", NOW);
    expect(out.source).toBe("rules");
    expect(captureServiceError).toHaveBeenCalledTimes(1);
  });

  it("falls back on a malformed payload", async () => {
    mockCallable.mockResolvedValue({ data: { action: "add", events: "nope" } });
    const out = await parseVoiceText("pipi", NOW);
    expect(out).toEqual(expect.objectContaining({ source: "rules", fallbackReason: "malformed" }));
  });

  it("skips the network call when offline", async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
    const out = await parseVoiceText("pipi", NOW);
    expect(out).toEqual(expect.objectContaining({ source: "rules", fallbackReason: "offline" }));
    expect(mockCallable).not.toHaveBeenCalled();
  });

  it("skips the network call for text over the server limit", async () => {
    const out = await parseVoiceText("biberon ".repeat(100), NOW);
    expect(out.fallbackReason).toBe("too-long");
    expect(mockCallable).not.toHaveBeenCalled();
  });

  it("still calls the LLM when NetInfo itself fails", async () => {
    (NetInfo.fetch as jest.Mock).mockRejectedValue(new Error("netinfo down"));
    mockCallable.mockResolvedValue({ data: { action: "none", events: [], truncated: false } });
    expect((await parseVoiceText("bonjour", NOW)).source).toBe("llm");
  });
});
