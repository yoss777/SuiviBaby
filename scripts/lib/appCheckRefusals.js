// Fonctions pures de scripts/appCheckRefusals.mjs (suivi des refus App Check,
// ADR 0002), isolées pour être testées.
//
// Sources Cloud Logging :
// - ligne de vérification du SDK firebase-functions, label
//   firebase-log-type=callable-request-verification : `verifications.app` vaut
//   VALID, MISSING ou INVALID. MISSING est écrit au niveau DEBUG, INVALID au
//   niveau WARNING : il faut lire tous les niveaux ;
// - requête HTTP Cloud Run (run.googleapis.com/requests) : code de réponse et
//   agent HTTP. Une fonction qui impose App Check répond 401 avant le handler.
// Les deux lignes d'un même appel partagent le champ `trace`.

// Exceptions de l'ADR 0002 : jamais imposées, exclues du verdict.
const EXEMPT_FUNCTIONS = new Set(["revokedevicetoken", "resolvereport", "setadminclaim"]);

const WINDOW = /^(\d+)([hd])$/;

/** "24h" ou "7d" → { start, end } en ISO. Lève une erreur si le format est invalide. */
function windowToRange(window, now = new Date()) {
  const m = WINDOW.exec(String(window || ""));
  if (!m) throw new Error(`Fenêtre invalide : "${window}" (attendu par exemple 24h ou 7d)`);
  const hours = Number(m[1]) * (m[2] === "d" ? 24 : 1);
  if (hours <= 0 || hours > 30 * 24) throw new Error("Fenêtre hors bornes (1h à 30d)");
  return { start: new Date(now.getTime() - hours * 3600e3).toISOString(), end: now.toISOString() };
}

/** Agent HTTP → ios | android | autre. */
function platformOf(userAgent) {
  const ua = String(userAgent || "");
  if (/CFNetwork|Darwin|iOS/i.test(ua)) return "ios";
  if (/okhttp|Dalvik|Android/i.test(ua)) return "android";
  return "autre";
}

/** Nom de la fonction (en minuscules, comme le service Cloud Run). */
function functionOf(entry) {
  const labels = entry.labels || {};
  const res = (entry.resource && entry.resource.labels) || {};
  return String(labels["goog-drz-cloudfunctions-id"] || res.service_name || res.function_name || "?").toLowerCase();
}

/**
 * Rapproche vérifications et requêtes par trace et compte, par fonction et
 * plateforme, les appels VALID / MISSING / INVALID et les 401.
 * Les fonctions exclues sont comptées à part, hors verdict.
 */
function summarize(verifications, requests) {
  const byTrace = new Map();
  for (const r of requests) if (r.trace) byTrace.set(r.trace, r);

  const rows = new Map();
  const notVerified = [];
  const exempt = { total: 0, notValid: 0 };
  const verifiedTraces = new Set();

  for (const v of verifications) {
    const fn = functionOf(v);
    const app = (v.jsonPayload && v.jsonPayload.verifications && v.jsonPayload.verifications.app) || "?";
    const auth = (v.jsonPayload && v.jsonPayload.verifications && v.jsonPayload.verifications.auth) || "?";
    const req = v.trace ? byTrace.get(v.trace) : undefined;
    if (v.trace) verifiedTraces.add(v.trace);
    const http = req && req.httpRequest ? req.httpRequest : {};
    const status = http.status || null;
    const platform = platformOf(http.userAgent);

    if (EXEMPT_FUNCTIONS.has(fn)) {
      exempt.total += 1;
      if (app !== "VALID") exempt.notValid += 1;
      continue;
    }

    const key = `${fn}\t${platform}`;
    const row = rows.get(key) || { fn, platform, VALID: 0, MISSING: 0, INVALID: 0, other: 0, refused401: 0, other401: 0 };
    if (app === "VALID" || app === "MISSING" || app === "INVALID") row[app] += 1;
    else row.other += 1;
    if (status === 401) {
      if (app !== "VALID") row.refused401 += 1;
      else row.other401 += 1;
    }
    rows.set(key, row);

    if (app !== "VALID") {
      notVerified.push({ t: v.timestamp, fn, platform, app, auth, status, ua: String(http.userAgent || "").slice(0, 40) });
    }
  }

  // 401 sur une fonction appelable sans ligne de vérification : refus en amont
  // du SDK (rare), à examiner.
  const callableServices = new Set(verifications.map(functionOf));
  const orphan401 = requests.filter((r) => {
    const status = r.httpRequest && r.httpRequest.status;
    return status === 401 && !verifiedTraces.has(r.trace) && callableServices.has(functionOf(r)) && !EXEMPT_FUNCTIONS.has(functionOf(r));
  }).length;

  notVerified.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  const table = [...rows.values()].sort((a, b) => a.fn.localeCompare(b.fn) || a.platform.localeCompare(b.platform));
  const total = table.reduce((n, r) => n + r.VALID + r.MISSING + r.INVALID + r.other, 0);
  return { table, notVerified, exempt, orphan401, total };
}

/** Code de sortie : 0 tout vérifié, 1 au moins un appel non vérifié ou un 401 orphelin. */
function exitCodeOf(summary) {
  return summary.notVerified.length > 0 || summary.orphan401 > 0 ? 1 : 0;
}

module.exports = { EXEMPT_FUNCTIONS, windowToRange, platformOf, functionOf, summarize, exitCodeOf };
