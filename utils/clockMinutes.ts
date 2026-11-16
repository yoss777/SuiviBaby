/**
 * Minutes écoulées « à la pendule » : différence entre la minute de maintenant
 * et la minute de début (secondes ignorées), comme l'heure affichée
 * (« depuis 10:00 »). Même règle que le widget (BebeMaintenant.*.tsx) : l'Accueil
 * et le widget passent de « 0 min » à « 1 min » au même instant.
 */
export function clockMinutesBetween(startMs: number, nowMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor(nowMs / 60000) - Math.floor(startMs / 60000));
}
