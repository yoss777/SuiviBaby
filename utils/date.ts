/**
 * Conversion unique des dates d'événements : Date, Timestamp Firestore
 * (`.toDate()`), objets `{seconds, nanoseconds}` / `{_seconds}` (JSON des
 * Cloud Functions), nombre (ms) ou chaîne ISO. Valeur absente → date invalide.
 */
export function toDate(value: unknown): Date {
  if (value == null) return new Date(Number.NaN);

  if (value instanceof Date) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  if (typeof value === "object" && value !== null) {
    const timestampLike = value as {
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };
    const seconds = timestampLike.seconds ?? timestampLike._seconds;
    const nanoseconds =
      timestampLike.nanoseconds ?? timestampLike._nanoseconds ?? 0;

    if (typeof seconds === "number") {
      return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
    }
  }

  if (typeof value === "number" || typeof value === "string") {
    return new Date(value);
  }

  return new Date(Number.NaN);
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Comme `toDate`, mais renvoie `fallback` quand la valeur est absente
 * (null/undefined) ou ne donne pas une date valide.
 */
export function toDateOr(value: unknown, fallback: Date): Date {
  if (value == null) return fallback;
  const date = toDate(value);
  return isValidDate(date) ? date : fallback;
}

/** Horodatage en ms pour trier ; 0 quand la date est absente ou invalide. */
export function getDateTime(value: unknown): number {
  const time = toDate(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** "À 13h05" today, "Hier à 23h00" yesterday, "Le 26/10 à 8h00" before that. */
export function formatEventClock(date: Date, now: Date = new Date()): string {
  const hm = `${date.getHours()}h${date.getMinutes().toString().padStart(2, "0")}`;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return `À ${hm}`;
  if (days === 1) return `Hier à ${hm}`;
  const dd = date.getDate().toString().padStart(2, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  return `Le ${dd}/${mm} à ${hm}`;
}
