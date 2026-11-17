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

const UNUSUAL_MS = { nap: 6 * 3600_000, night: 15 * 3600_000, walk: 9 * 3600_000 } as const;
const KIND_LABEL = { nap: "une sieste", night: "une nuit", walk: "une balade" } as const;

function durationLabel(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/**
 * Durée inhabituelle (sieste > 6 h, nuit > 15 h, balade > 9 h, mais < 24 h) :
 * sans doute une erreur de saisie (date ou heure). Message à confirmer, ou
 * null si la durée est plausible. Session en cours : jusqu'à maintenant.
 */
export function unusualSessionMessage(
  kind: "nap" | "night" | "walk",
  start: Date,
  end: Date | null,
  nowMs = Date.now(),
): string | null {
  const endMs = end ? end.getTime() : nowMs;
  const ms = endMs - start.getTime();
  if (!Number.isFinite(ms) || ms <= UNUSUAL_MS[kind] || ms >= MAX_SESSION_MS) return null;
  return `${durationLabel(ms)} pour ${KIND_LABEL[kind]}, c'est inhabituel : est-ce une erreur de date ou d'heure ?`;
}
