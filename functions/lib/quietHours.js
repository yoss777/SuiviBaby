/**
 * Heures calmes des rappels : pas de push entre `start` et `end`, heure locale
 * du téléphone de l'utilisateur (fuseau IANA stocké avec la préférence).
 *
 * Stockage : user_preferences/{uid}.notifications.reminders.quietHours =
 *   { enabled, start: "HH:MM", end: "HH:MM", timeZone }
 * Sans champ (ou valeur invalide) : activé, 22:00-07:00, Europe/Paris. Les
 * valeurs stockées sont validées une à une : une valeur douteuse ne fait jamais
 * échouer le job, elle retombe sur la valeur par défaut.
 *
 * Miroir côté appli : utils/quietHours.ts (garder les deux alignés).
 */

const DEFAULT_TIME_ZONE = "Europe/Paris";
const DEFAULT_QUIET_HOURS = Object.freeze({
  enabled: true,
  start: "22:00",
  end: "07:00",
  timeZone: DEFAULT_TIME_ZONE,
});

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Formateurs mis en cache par fuseau (la construction d'Intl est coûteuse). */
const formatters = new Map();

function getFormatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Fuseau IANA reconnu par le moteur ? (Intl lève une RangeError sinon.) */
function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return false;
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** "HH:MM" -> minutes depuis minuit, ou null si le format est invalide. */
function parseHHMM(value) {
  const m = typeof value === "string" ? HHMM.exec(value) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Valeur stockée (potentiellement absente ou corrompue) -> valeur sûre complète. */
function normalizeQuietHours(raw) {
  const r = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_QUIET_HOURS.enabled,
    start: parseHHMM(r.start) !== null ? r.start : DEFAULT_QUIET_HOURS.start,
    end: parseHHMM(r.end) !== null ? r.end : DEFAULT_QUIET_HOURS.end,
    timeZone: isValidTimeZone(r.timeZone) ? r.timeZone : DEFAULT_TIME_ZONE,
  };
}

/** Minutes depuis minuit de l'instant `ms` dans le fuseau donné. */
function localMinutes(timeZone, ms) {
  const parts = getFormatter(timeZone).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  // % 24 : certains moteurs rendent « 24 » pour minuit malgré h23.
  return (get("hour") % 24) * 60 + get("minute");
}

/**
 * Vrai si l'instant `nowMs` tombe dans les heures calmes. Début inclus, fin
 * exclue. Désactivé ou début == fin : jamais. Gère les plages qui passent minuit.
 */
function isInQuietHours(rawQuietHours, nowMs) {
  const qh = normalizeQuietHours(rawQuietHours);
  if (!qh.enabled) return false;
  const start = parseHHMM(qh.start);
  const end = parseHHMM(qh.end);
  if (start === end) return false;
  const now = localMinutes(qh.timeZone, nowMs);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

module.exports = {
  DEFAULT_QUIET_HOURS,
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  normalizeQuietHours,
  isInQuietHours,
};
