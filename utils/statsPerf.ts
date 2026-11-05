// Lightweight instrumentation for the statistics screen
// (docs/STATS_PERF_REFONTE.md, sprint 0).
//
// Counters are always kept (an integer increment per render) so tests can
// assert render counts. Console output only happens in development builds
// started with EXPO_PUBLIC_STATS_PERF=1, e.g. read on the device with
// `adb logcat | grep stats-perf`.

const counters: Record<string, number> = {};
let mountedAt: number | null = null;
const firstPaintLogged = new Set<string>();

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function logEnabled(): boolean {
  return (
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_STATS_PERF === "1"
  );
}

function log(message: string) {
  if (logEnabled()) console.log(`[stats-perf] ${message}`);
}

/** Count one render of `name`. Call it in the component body. */
export function countStatsRender(name: string): void {
  counters[name] = (counters[name] ?? 0) + 1;
  log(`render ${name} #${counters[name]}`);
}

/** Count a non-render event (snapshot received, merge emitted…). */
export function countStatsEvent(name: string): void {
  counters[name] = (counters[name] ?? 0) + 1;
}

/** Mark the statistics screen mount: start of the "open → first chart" timer. */
export function markStatsMount(): void {
  mountedAt = now();
  firstPaintLogged.clear();
}

/** Mark the first render of a chart since the last mount and log the delay. */
export function markStatsChartPainted(name: string): void {
  if (mountedAt === null || firstPaintLogged.has(name)) return;
  firstPaintLogged.add(name);
  log(`first paint ${name} ${Math.round(now() - mountedAt)}ms`);
}

export function getStatsPerfCounters(): Readonly<Record<string, number>> {
  return { ...counters };
}

export function resetStatsPerfCounters(): void {
  for (const key of Object.keys(counters)) delete counters[key];
  mountedAt = null;
  firstPaintLogged.clear();
}
