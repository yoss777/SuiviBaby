const { mockFirestore } = require("./setup");

const mockCreate = jest.fn();
jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}));

const fns = require("../index");

const call = (data, uid = "u1") => ({ auth: uid ? { uid } : null, data, app: null });
const noDoc = () => ({ exists: false, data: () => ({}) });

/** Fresh Firestore stubs: no rate-limit history, usage doc as given. */
function stubFirestore(usage = null) {
  const usageSet = jest.fn();
  mockFirestore.doc.mockImplementation((p) => {
    if (p.startsWith("rate_limits/")) return { get: jest.fn().mockResolvedValue(noDoc()), set: jest.fn() };
    return {
      path: p,
      get: jest.fn().mockResolvedValue(usage ? { exists: true, data: () => usage } : noDoc()),
      set: usageSet,
    };
  });
  mockFirestore.runTransaction.mockImplementation(async (fn) =>
    fn({ get: (ref) => ref.get(), set: usageSet }),
  );
  return { usageSet };
}

const modelAnswer = (obj) => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(obj) }],
  usage: { input_tokens: 30, output_tokens: 50, cache_read_input_tokens: 1400 },
});

describe("parseVoiceCommand", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, ANTHROPIC_API_KEY: "test-key" };
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(() => { process.env = OLD_ENV; });

  it("requires authentication", async () => {
    await expect(fns.parseVoiceCommand(call({ text: "pipi" }, null)))
      .rejects.toMatchObject({ code: "unauthenticated" });
  });

  it.each([[undefined], [""], ["   "], [42], ["x".repeat(501)]])(
    "rejects invalid text %p",
    async (text) => {
      stubFirestore();
      await expect(fns.parseVoiceCommand(call({ text })))
        .rejects.toMatchObject({ code: "invalid-argument" });
      expect(mockCreate).not.toHaveBeenCalled();
    },
  );

  it("honours the kill switch without calling the model", async () => {
    process.env.VOICE_LLM_PARSE_ENABLED = "false";
    stubFirestore();
    await expect(fns.parseVoiceCommand(call({ text: "pipi" })))
      .rejects.toMatchObject({ code: "unavailable" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("enforces the daily cap before calling the model", async () => {
    const today = new Date().toISOString().split("T")[0];
    stubFirestore({ voiceParseDate: today, voiceParseCount: 200 });
    await expect(fns.parseVoiceCommand(call({ text: "pipi" })))
      .rejects.toMatchObject({ code: "resource-exhausted" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns the sanitized result and counts the call", async () => {
    const { usageSet } = stubFirestore();
    mockCreate.mockResolvedValue(modelAnswer({
      action: "add",
      events: [{ type: "biberon", time: { kind: "now" }, quantiteMl: 150 }],
    }));

    const out = await fns.parseVoiceCommand(call({ text: "Biberon de 150 ml", localTime: "14:30" }));

    expect(out).toEqual({
      action: "add",
      truncated: false,
      events: [{ type: "biberon", time: { kind: "now" }, quantiteMl: 150 }],
    });
    expect(usageSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ voiceParseCount: 1 }),
      { merge: true },
    );
  });

  it("never logs the transcript", async () => {
    stubFirestore();
    mockCreate.mockResolvedValue(modelAnswer({ action: "none", events: [] }));
    await fns.parseVoiceCommand(call({ text: "Doliprane pour Léa qui a 39 de fièvre" }));
    const logged = [...console.log.mock.calls, ...console.warn.mock.calls].flat().join(" ");
    expect(logged).not.toContain("Doliprane");
    expect(logged).not.toContain("Léa");
  });

  it.each([
    ["an API error", () => mockCreate.mockRejectedValue(Object.assign(new Error("overloaded"), { status: 529 }))],
    ["a refusal", () => mockCreate.mockResolvedValue({ stop_reason: "refusal", content: [] })],
    ["invalid JSON", () => mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "{" }] })],
  ])("maps %s to 'unavailable' so the client falls back", async (_label, arrange) => {
    stubFirestore();
    arrange();
    await expect(fns.parseVoiceCommand(call({ text: "pipi" })))
      .rejects.toMatchObject({ code: "unavailable" });
  });
});
