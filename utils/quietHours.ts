// utils/quietHours.ts
// Heures calmes des rappels : pas de rappel entre `start` et `end`, heure locale
// du téléphone. Stockage : user_preferences/{uid}.notifications.reminders.quietHours.
// Miroir du serveur (functions/lib/quietHours.js) : garder les deux alignés.

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" (24 h) */
  start: string;
  /** "HH:MM" (24 h) */
  end: string;
  /** Fuseau IANA du téléphone, ex. "Europe/Paris" */
  timeZone: string;
}

export const DEFAULT_TIME_ZONE = "Europe/Paris";

export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: true,
  start: "22:00",
  end: "07:00",
  timeZone: DEFAULT_TIME_ZONE,
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return false;
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Fuseau IANA du téléphone ; "Europe/Paris" si le moteur ne le fournit pas. */
export function getDeviceTimeZone(): string {
  try {
    const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** "HH:MM" -> minutes depuis minuit, null si invalide. */
export function parseHHMM(value: unknown): number | null {
  const m = typeof value === "string" ? HHMM.exec(value) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Valeur stockée (absente ou corrompue) -> valeur sûre, champ par champ. */
export function normalizeQuietHours(raw: unknown): QuietHours {
  const r = (raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_QUIET_HOURS.enabled,
    start: parseHHMM(r.start) !== null ? (r.start as string) : DEFAULT_QUIET_HOURS.start,
    end: parseHHMM(r.end) !== null ? (r.end as string) : DEFAULT_QUIET_HOURS.end,
    timeZone: isValidTimeZone(r.timeZone) ? r.timeZone : DEFAULT_TIME_ZONE,
  };
}

function localMinutes(timeZone: string, ms: number): number {
  const parts = getFormatter(timeZone).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return (get("hour") % 24) * 60 + get("minute");
}

/** Vrai si `nowMs` est dans les heures calmes (début inclus, fin exclue). */
export function isInQuietHours(raw: unknown, nowMs: number): boolean {
  const qh = normalizeQuietHours(raw);
  if (!qh.enabled) return false;
  const start = parseHHMM(qh.start) as number;
  const end = parseHHMM(qh.end) as number;
  if (start === end) return false;
  const now = localMinutes(qh.timeZone, nowMs);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * Premier instant (ms) à partir de `fromMs` où les heures calmes sont terminées.
 * `fromMs` lui-même s'il est déjà hors plage. Corrige l'écart dû à un
 * changement d'heure entre les deux instants.
 */
export function nextQuietHoursEnd(raw: unknown, fromMs: number): number {
  if (!isInQuietHours(raw, fromMs)) return fromMs;
  const qh = normalizeQuietHours(raw);
  const end = parseHHMM(qh.end) as number;
  let candidate = fromMs + (((end - localMinutes(qh.timeZone, fromMs) + 1440) % 1440) || 1440) * 60000;
  // Un changement d'heure entre fromMs et la fin décale l'estimation : on la recale.
  for (let i = 0; i < 3; i++) {
    const diff = ((end - localMinutes(qh.timeZone, candidate) + 1440 + 720) % 1440) - 720;
    if (diff === 0) break;
    candidate += diff * 60000;
  }
  // Fin dans un trou d'heure d'été (ex. 02:30 inexistante) : on avance jusqu'à sortir de la plage.
  for (let i = 0; i < 180 && isInQuietHours(qh, candidate); i++) candidate += 60000;
  return candidate;
}

/**
 * Rappel local prévu dans `seconds` : si l'instant tombe dans les heures calmes,
 * on le décale à leur fin (même règle que le serveur : s'il est toujours dû à
 * ce moment-là, il part, sinon la replanification l'annule).
 */
export function secondsAfterQuietHours(seconds: number, raw: unknown, nowMs: number = Date.now()): number {
  const fireMs = nowMs + seconds * 1000;
  const shifted = nextQuietHoursEnd(raw, fireMs);
  return shifted === fireMs ? seconds : Math.max(60, Math.ceil((shifted - nowMs) / 1000));
}

/** "HH:MM" -> Date du jour à cette heure locale (valeur du sélecteur d'heure). */
export function hhmmToDate(value: string): Date {
  const minutes = parseHHMM(value) ?? 0;
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** Date -> "HH:MM" (heure locale de l'appareil). */
export function dateToHHMM(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
