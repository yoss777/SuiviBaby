// utils/idempotencyKey.ts
// Clé d'idempotence d'une création d'événement. Format accepté par le serveur :
// /^[A-Za-z0-9_-]+$/, 100 caractères max.

export function generateIdempotencyKey(uid?: string | null): string {
  const prefix = (uid ?? "anon").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "anon";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
