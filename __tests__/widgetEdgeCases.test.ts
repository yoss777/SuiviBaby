// Cas limites du calcul partagé du widget : sommeil à cheval sur minuit,
// expiration de la tétée identique dans l'app et pour le widget.
import { nursingDraftExpiresAt } from "@/components/forms/nursingTimer";
import { sleepMinutesInDay, usableNursing } from "@/functions/shared/widget";

const day = (d: number, h = 0, m = 0) => new Date(2026, 10, d, h, m).getTime();
const MIN = 60_000;

describe("sommeil à cheval sur minuit", () => {
  const night = { startMs: day(15, 22), endMs: day(16, 7) }; // 22:00 → 07:00

  it("compté dans chaque jour pour sa part : 2 h la veille, 7 h le jour même", () => {
    expect(sleepMinutesInDay([night], day(15), day(16), day(16, 10))).toBe(120);
    expect(sleepMinutesInDay([night], day(16), day(17), day(16, 10))).toBe(420);
  });

  it("nuit en cours consultée à 00:30 : 30 min aujourd'hui, rien de la veille", () => {
    const running = { startMs: day(15, 22) };
    expect(sleepMinutesInDay([running], day(16), day(17), day(16, 0, 30))).toBe(30);
  });

  it("sieste qui franchit minuit et sommeil hors du jour : bornés, jamais négatifs", () => {
    const nap = { startMs: day(16, 23, 30), endMs: day(17, 0, 45) };
    expect(sleepMinutesInDay([nap], day(16), day(17), day(17, 1))).toBe(30);
    expect(sleepMinutesInDay([{ startMs: day(14, 10), endMs: day(14, 11) }], day(16), day(17), day(16, 12))).toBe(0);
  });
});

describe("expiration de la tétée : même instant dans l'app et pour le widget", () => {
  const updatedAt = day(16, 10);
  const running = { leftSeconds: 60, rightSeconds: 0, runningSide: "left", runningSince: updatedAt - 60_000, updatedAt };
  const paused = { leftSeconds: 60, rightSeconds: 0, runningSide: null, runningSince: null, updatedAt };

  it.each([
    ["en cours", running, 99, true],
    ["en cours", running, 100, true],
    ["en cours", running, 101, false],
    ["en pause", paused, 39, true],
    ["en pause", paused, 40, true],
    ["en pause", paused, 41, false],
  ])("%s, %i min après la dernière action : %s", (_label, state, minutes, alive) => {
    const now = updatedAt + (minutes as number) * MIN;
    expect(usableNursing(state, now) != null).toBe(alive);
    expect(now <= nursingDraftExpiresAt(state as never)).toBe(alive);
  });
});
