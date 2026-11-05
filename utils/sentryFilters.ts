// Sentry privacy filters (audit A6, sprint 2): Sentry must never receive
// health data, e-mails, children's names or voice transcripts.
//
// - console breadcrumbs are dropped (logs may contain transcripts or events);
// - HTTP breadcrumbs keep the method, status and URL without query string;
// - extras and contexts lose every key that may hold personal data, and every
//   remaining string has e-mail addresses masked.

type AnyRecord = Record<string, unknown>;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Keys whose value is personal or health data, whatever the service. */
const SENSITIVE_KEY =
  /(email|e-mail|name|nom|prenom|prénom|transcript|text|note|description|message|phone|address|token|password|valeur|value|quantite|quantity|amount|temperature|symptom|medicament|photo|poids|weight|taille|height|birth|naissance|dob|mood|humeur|title|titre)/i;

export function maskEmails(value: string): string {
  return value.replace(EMAIL, "[email]");
}

/** Copy of `data` without sensitive keys, strings masked, nested up to depth 3. */
export function scrubData(data: unknown, depth = 0): unknown {
  if (typeof data === "string") return maskEmails(data);
  if (data === null || typeof data !== "object") return data;
  // Too deep to inspect: drop it rather than send it unfiltered.
  if (depth > 3) return "[truncated]";
  if (Array.isArray(data)) return data.map((item) => scrubData(item, depth + 1));
  const out: AnyRecord = {};
  for (const [key, value] of Object.entries(data as AnyRecord)) {
    if (SENSITIVE_KEY.test(key)) continue;
    out[key] = scrubData(value, depth + 1);
  }
  return out;
}

function stripQuery(url: unknown): unknown {
  return typeof url === "string" ? url.split("?")[0] : url;
}

type Breadcrumb = { category?: string; message?: string; data?: AnyRecord };

/** Generic over Sentry's own Breadcrumb type: returns the same shape. */
export function filterBreadcrumb<T>(input: T): T | null {
  const breadcrumb = input as T & Breadcrumb;
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr" || breadcrumb.category === "http") {
    const data = breadcrumb.data ?? {};
    return {
      ...breadcrumb,
      data: { method: data.method, status_code: data.status_code, url: stripQuery(data.url) },
    };
  }
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: maskEmails(breadcrumb.message) } : {}),
    ...(breadcrumb.data ? { data: scrubData(breadcrumb.data) as AnyRecord } : {}),
  };
}

type SentryEventLike = {
  message?: string;
  user?: AnyRecord;
  extra?: AnyRecord;
  contexts?: AnyRecord;
  request?: AnyRecord;
  breadcrumbs?: Breadcrumb[];
  exception?: { values?: { value?: string }[] };
  tags?: AnyRecord;
  spans?: { description?: string; data?: AnyRecord }[];
  transaction?: string;
};

/** Generic over Sentry's own event type: returns the same shape. */
export function filterEvent<T>(event: T): T {
  const next = { ...(event as T & SentryEventLike) };
  if (next.message) next.message = maskEmails(next.message);
  if (next.user) next.user = next.user.id ? { id: next.user.id } : undefined;
  if (next.extra) next.extra = scrubData(next.extra) as AnyRecord;
  if (next.contexts) next.contexts = scrubData(next.contexts) as AnyRecord;
  if (next.tags) next.tags = scrubData(next.tags) as AnyRecord;
  if (next.request) next.request = { method: next.request.method, url: stripQuery(next.request.url) };
  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs
      .map((b) => filterBreadcrumb(b))
      .filter((b): b is Breadcrumb => b !== null);
  }
  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((v) => (v.value ? { ...v, value: maskEmails(v.value) } : v)),
    };
  }
  return next as T;
}

/**
 * Performance transactions (tracesSampleRate) bypass beforeSend: span
 * descriptions are URLs with query strings and Firestore paths with ids.
 */
export function filterTransaction<T>(event: T): T {
  const next = filterEvent(event) as T & SentryEventLike;
  if (next.transaction) next.transaction = String(stripQuery(next.transaction));
  if (next.spans) {
    next.spans = next.spans.map((span) => ({
      ...span,
      ...(span.description ? { description: maskEmails(String(stripQuery(span.description))) } : {}),
      ...(span.data ? { data: scrubData(span.data) as AnyRecord } : {}),
    }));
  }
  return next as T;
}
