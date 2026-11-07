/* global Buffer */
// Fonctions pures de scripts/updateAppConfig.mjs, isolées pour être testées
// (le script lui-même s'exécute dès qu'on l'importe).

const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * minVersion à écrire : MIN_VERSION si fourni (et valide), sinon la valeur déjà
 * en base (un force update levé à la main ne doit pas être remis à zéro par
 * une publication), sinon 1.0.0 (pas de force update).
 */
function resolveMinVersion(env, remote) {
  const fromEnv = env.MIN_VERSION;
  if (fromEnv) {
    if (!SEMVER.test(fromEnv)) {
      throw new Error(`MIN_VERSION must look like 1.2.3 (got "${fromEnv}").`);
    }
    return fromEnv;
  }
  return remote?.minVersion || "1.0.0";
}

/**
 * Clé de compte de service : JSON brut ou son encodage base64 (les deux
 * formes existent dans les secrets GitHub). Erreur lisible sinon, sans jamais
 * recopier le contenu du secret.
 */
function parseServiceAccountKey(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("The service account key is empty.");
  }
  const trimmed = raw.trim();
  let key;
  try {
    key = JSON.parse(trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf-8"));
  } catch {
    throw new Error("The service account key is neither valid JSON nor base64-encoded JSON.");
  }
  if (!key || typeof key.client_email !== "string" || typeof key.private_key !== "string") {
    throw new Error("The service account key lacks client_email or private_key.");
  }
  return key;
}

/**
 * Chemins du masque de mise à jour (updateMask) pour les champs écrits : les
 * autres champs du document (ajoutés à la main, par exemple) restent intacts.
 * Les maps sont listées feuille par feuille pour ne pas écraser leurs autres clés.
 */
function buildUpdateMask(fields, prefix = "") {
  return Object.entries(fields).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? buildUpdateMask(value, path)
      : [path];
  });
}

/** Query string `updateMask.fieldPaths=…` (une entrée par chemin). */
function updateMaskQuery(fields) {
  return buildUpdateMask(fields)
    .map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`)
    .join("&");
}

module.exports = { resolveMinVersion, parseServiceAccountKey, buildUpdateMask, updateMaskQuery };
