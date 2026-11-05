// scripts/statsPerfFixtures.js
// Deterministic event history for the statistics screen performance work
// (docs/STATS_PERF_REFONTE.md, sprint 0). Shared by the Jest benchmarks and by
// scripts/seedStatsPerf.mjs, which writes the same data to the Firestore emulator.
//
// CommonJS on purpose: Jest requires it directly and the .mjs seed script loads
// it through createRequire.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Small seeded PRNG (mulberry32) so every run produces the same history. */
function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SOLIDE_TYPES = ["puree", "compote", "cereales", "yaourt", "morceaux", "autre"];
const LOCATIONS = ["lit", "cododo", "poussette", "voiture", "autre"];
const QUALITIES = ["paisible", "agité", "mauvais"];

/**
 * Build `total` events spread over `days` days before `now`, in the same
 * proportions as a real account: ~60 % meals, ~15 % pumping, ~25 % sleep.
 * Dates are plain Date objects; callers convert them (Timestamp, millis…).
 */
function buildStatsEvents({ total = 3000, days = 365, now = Date.UTC(2026, 10, 5, 12), seed = 42 } = {}) {
  const random = createRandom(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const events = [];

  for (let i = 0; i < total; i += 1) {
    const date = new Date(now - Math.floor(random() * days * DAY_MS));
    const roll = random();
    const id = `perf-${i}`;

    if (roll < 0.3) {
      events.push({ id, type: "tetee", date, dureeGauche: 5 + Math.floor(random() * 15), dureeDroite: 5 + Math.floor(random() * 15) });
    } else if (roll < 0.5) {
      events.push({ id, type: "biberon", date, quantite: 60 + Math.floor(random() * 150) });
    } else if (roll < 0.6) {
      events.push({
        id,
        type: "solide",
        date,
        typeSolide: pick(SOLIDE_TYPES),
        nouveauAliment: random() < 0.1,
        reaction: random() < 0.1 ? "rougeur" : "aucune",
      });
    } else if (roll < 0.75) {
      events.push({
        id,
        type: "pompage",
        date,
        quantiteGauche: Math.floor(random() * 120),
        quantiteDroite: Math.floor(random() * 120),
      });
    } else {
      const isNap = random() < 0.6;
      const durationMin = isNap ? 30 + Math.floor(random() * 90) : 300 + Math.floor(random() * 360);
      events.push({
        id,
        type: "sommeil",
        date,
        heureDebut: date,
        heureFin: new Date(date.getTime() + durationMin * 60000),
        isNap,
        location: pick(LOCATIONS),
        quality: pick(QUALITIES),
      });
    }
  }

  events.sort((a, b) => b.date.getTime() - a.date.getTime());
  return events;
}

/** Split a history the way the statistics screen receives it. */
function splitStatsEvents(events) {
  return {
    repas: events.filter((e) => e.type === "tetee" || e.type === "biberon" || e.type === "solide"),
    pompages: events.filter((e) => e.type === "pompage"),
    sommeils: events.filter((e) => e.type === "sommeil"),
  };
}

module.exports = { DAY_MS, buildStatsEvents, splitStatsEvents, createRandom };
