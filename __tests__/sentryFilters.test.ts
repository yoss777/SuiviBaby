import { filterBreadcrumb, filterEvent, maskEmails, scrubData } from "@/utils/sentryFilters";

describe("Sentry privacy filters (audit A6)", () => {
  it("drops console breadcrumbs (logs may hold transcripts and events)", () => {
    expect(filterBreadcrumb({ category: "console", message: "Transcription: Léo a bu 120 ml" })).toBeNull();
  });

  it("keeps only method, status and URL without query for HTTP breadcrumbs", () => {
    const b = filterBreadcrumb({
      category: "fetch",
      data: { method: "POST", status_code: 200, url: "https://x.test/api?email=a@b.fr", request_body: "{...}", response_body: "{...}" },
    });
    expect(b?.data).toEqual({ method: "POST", status_code: 200, url: "https://x.test/api" });
  });

  it("removes sensitive keys and masks e-mails in breadcrumbs from the app", () => {
    const b = filterBreadcrumb({
      category: "offlineQueue",
      message: "retry for parent@exemple.fr",
      data: { eventId: "e1", childName: "Léo", quantite: 120, retryCount: 2 },
    });
    expect(b?.message).toBe("retry for [email]");
    expect(b?.data).toEqual({ eventId: "e1", retryCount: 2 });
  });

  it("scrubs extras, contexts, user, request and exception messages of events", () => {
    const event = filterEvent({
      message: "failed for a@b.fr",
      user: { id: "uid1", email: "a@b.fr", ip_address: "1.2.3.4" },
      extra: { childId: "c1", transcript: "Léo a dormi", nested: { email: "a@b.fr", count: 3 } },
      contexts: { voice: { text: "biberon 120", durationMs: 900 } },
      request: { method: "POST", url: "https://x.test/p?token=abc", data: "body" },
      exception: { values: [{ value: "User a@b.fr not found" }] },
    });
    expect(event.message).toBe("failed for [email]");
    expect(event.user).toEqual({ id: "uid1" });
    expect(event.extra).toEqual({ childId: "c1", nested: { count: 3 } });
    expect(event.contexts).toEqual({ voice: { durationMs: 900 } });
    expect(event.request).toEqual({ method: "POST", url: "https://x.test/p" });
    expect(event.exception?.values?.[0].value).toBe("User [email] not found");
  });

  it("masks e-mails anywhere in strings and arrays", () => {
    expect(maskEmails("contact: x.y+z@mail.co.uk")).toBe("contact: [email]");
    expect(scrubData(["a@b.fr", 3])).toEqual(["[email]", 3]);
  });
});
