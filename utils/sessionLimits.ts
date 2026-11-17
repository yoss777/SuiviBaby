/**
 * Un sommeil ou une balade ne dure jamais 24 h : le serveur refuse une durée
 * de plus de 1440 min (functions/src/events/validation.js). Vérifié avant
 * l'envoi, sinon l'enregistrement optimiste était annulé sans message.
 */
export const MAX_SESSION_MS = 24 * 3600 * 1000;
export const MAX_SESSION_LABEL = "24 h";

export function exceedsMaxSession(start: Date, end: Date): boolean {
  return end.getTime() - start.getTime() >= MAX_SESSION_MS;
}

/** Fin proposée en décochant « En cours » : maintenant, sans dépasser 24 h après le début. */
export function defaultEndFor(start: Date, nowMs = Date.now()): Date {
  const startMs = start.getTime();
  if (!Number.isFinite(startMs)) return new Date(nowMs);
  return new Date(Math.min(nowMs, startMs + MAX_SESSION_MS - 60_000));
}
