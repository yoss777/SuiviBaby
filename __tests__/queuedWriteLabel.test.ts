import { describeQueuedWrite } from "@/utils/queuedWriteLabel";
import { getEventTypeLabel } from "@/utils/eventTypeLabels";
import { generateIdempotencyKey } from "@/utils/idempotencyKey";

describe("describeQueuedWrite", () => {
  const at = new Date(2026, 3, 1, 9, 5).getTime();

  it("names the action, the event type and the time, never the values", () => {
    expect(
      describeQueuedWrite({ action: "create", payload: JSON.stringify({ type: "biberon", quantite: 9999 }), createdAt: at }),
    ).toBe("Ajout : biberon (09h05)");
  });

  it("falls back when the type is unknown, missing or the payload unreadable", () => {
    expect(describeQueuedWrite({ action: "update", payload: JSON.stringify({ eventId: "e1" }), createdAt: at })).toBe("Modification (09h05)");
    expect(describeQueuedWrite({ action: "delete", payload: "{not json", createdAt: at })).toBe("Suppression (09h05)");
    expect(describeQueuedWrite({ action: "zzz", payload: "{}", createdAt: at })).toBe("Écriture (09h05)");
  });
});

describe("getEventTypeLabel", () => {
  it("returns null for anything that is not a known type", () => {
    expect(getEventTypeLabel("jalon")).toBe("jalon");
    expect(getEventTypeLabel("inconnu")).toBeNull();
    expect(getEventTypeLabel(undefined)).toBeNull();
    expect(getEventTypeLabel(42)).toBeNull();
  });
});

describe("generateIdempotencyKey", () => {
  it("fits the server format and is unique", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateIdempotencyKey("uid-1")));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_-]{1,100}$/);
  });

  it("copes with a missing uid and a hostile or very long one", () => {
    expect(generateIdempotencyKey(undefined)).toMatch(/^anon_/);
    expect(generateIdempotencyKey("a/b é")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateIdempotencyKey("x".repeat(500)).length).toBeLessThanOrEqual(100);
    expect(generateIdempotencyKey("///")).toMatch(/^anon_/);
  });
});
