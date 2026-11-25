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
// Les journaux arrivent avec quelques secondes à quelques minutes de retard : la
// fenêtre s'arrête 2 minutes avant maintenant.
const INGESTION_MARGIN_MS = 2 * 60e3;
// La ligne de vérification est écrite au début de l'appel, la requête HTTP à la
// fin : les vérifications sont lues 2 minutes avant le début de la fenêtre pour
// rapprocher un appel commencé juste avant.
const VERIFICATION_LEAD_MS = 2 * 60e3;

/**
 * "24h" ou "7d" → { start, end, verificationStart } en ISO. Lève une erreur si
 * le format est invalide.
 */
function windowToRange(window, now = new Date()) {
  const m = WINDOW.exec(String(window || ""));
  if (!m) throw new Error(`Fenêtre invalide : "${window}" (attendu par exemple 24h ou 7d)`);
  const hours = Number(m[1]) * (m[2] === "d" ? 24 : 1);
  if (hours <= 0 || hours > 30 * 24) throw new Error("Fenêtre hors bornes (1h à 30d)");
  const end = now.getTime() - INGESTION_MARGIN_MS;
  const start = end - hours * 3600e3;
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    verificationStart: new Date(start - VERIFICATION_LEAD_MS).toISOString(),
  };
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
 * `responses401` : toutes les réponses 401 de la fenêtre, tous services confondus
 * (par défaut, celles de `requests`). `start` : début de la fenêtre ; les
 * vérifications plus anciennes (lues en avance) ne servent qu'au rapprochement.
 *
 * Rapproche vérifications et requêtes par trace et compte, par fonction et
 * plateforme, les appels VALID / MISSING / INVALID et les 401.
 * Les fonctions exclues sont comptées à part, hors verdict.
 */
function summarize(
  verifications,
  requests,
  responses401 = requests.filter((r) => r.httpRequest && r.httpRequest.status === 401),
  { start } = {},
) {
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
    // Vérification lue en avance : gardée seulement si sa requête tombe dans la fenêtre.
    if (start && String(v.timestamp) < start && !(req && String(req.timestamp) >= start)) continue;
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

  // 401 de n'importe quel service sans ligne de vérification rapprochée : refus
  // en amont du SDK, fonction sans aucun appel vérifié, trace absente… à examiner.
  // Les fonctions exclues restent hors verdict.
  const orphan401 = responses401.filter(
    (r) => !(r.trace && verifiedTraces.has(r.trace)) && !EXEMPT_FUNCTIONS.has(functionOf(r)),
  ).length;

  notVerified.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  const table = [...rows.values()].sort((a, b) => a.fn.localeCompare(b.fn) || a.platform.localeCompare(b.platform));
  const total = table.reduce((n, r) => n + r.VALID + r.MISSING + r.INVALID + r.other, 0);
  return { table, notVerified, exempt, orphan401, total };
}

/** Code de sortie : 0 aucun appel non vérifié observé, 1 au moins un appel non vérifié ou un 401 orphelin. */
function exitCodeOf(summary) {
  return summary.notVerified.length > 0 || summary.orphan401 > 0 ? 1 : 0;
}

module.exports = { EXEMPT_FUNCTIONS, windowToRange, platformOf, functionOf, summarize, exitCodeOf };
