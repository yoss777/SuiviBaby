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
