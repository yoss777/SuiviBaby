// functions/emailTemplates.js
// Template HTML responsive pour le récap hebdomadaire.

/**
 * Formate une durée en minutes en "Xh YYmin"
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "0min";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

/**
 * Calcule la tendance par rapport à la semaine précédente.
 * @returns {string} "↑ +N" | "↓ -N" | "→ Stable" | ""
 */
function trend(current, previous, unit = "") {
  if (previous === null || previous === undefined) return "";
  const diff = current - previous;
  if (diff === 0) return "→ Stable";
  const sign = diff > 0 ? "↑" : "↓";
  const absVal = Math.abs(diff);
  const suffix = unit ? ` ${unit}` : "";
  return `${sign} ${diff > 0 ? "+" : "-"}${absVal}${suffix} vs semaine précédente`;
}

/**
 * Génère le HTML du récap hebdomadaire.
 *
 * @param {object} params
 * @param {string} params.childName
 * @param {string} params.weekLabel - ex: "9 mars au 15 mars 2026"
 * @param {object} params.stats - Stats de la semaine courante
 * @param {object|null} params.previousStats - Stats de la semaine précédente (pour tendances)
 * @param {string} params.unsubscribeUrl - Deep link ou URL de désabonnement
 * @returns {string} HTML
 */
function buildRecapHTML({ childName, weekLabel, stats, previousStats, unsubscribeUrl }) {
  const prev = previousStats || {};

  const sections = [];

  // --- Alimentation ---
  const mealLines = [];
  mealLines.push(`<strong>${stats.meals.count}</strong> repas`);
  if (stats.meals.biberonsCount > 0) {
    mealLines.push(`${stats.meals.biberonsCount} biberons · ${stats.meals.biberonsMl}ml`);
  }
  if (stats.meals.teteesCount > 0) {
    mealLines.push(`${stats.meals.teteesCount} tétées · ${formatDuration(stats.meals.teteesMinutes)}`);
  }
  if (stats.meals.solidesCount > 0) {
    mealLines.push(`${stats.meals.solidesCount} solides`);
  }
  const mealTrend = trend(stats.meals.count, prev.meals?.count, "repas");

  sections.push(buildSection(
    "🍽️", "Alimentation",
    mealLines.join("<br>"),
    mealTrend,
  ));

  // --- Sommeil ---
  const avgSleepPerDay = stats.sleep.totalMinutes > 0
    ? formatDuration(Math.round(stats.sleep.totalMinutes / 7))
    : "—";
  const sleepLines = [
    `<strong>${avgSleepPerDay}</strong> en moyenne/jour`,
    `${stats.sleep.nightCount} nuits · ${stats.sleep.napCount} siestes`,
  ];
  const sleepTrend = trend(
    Math.round(stats.sleep.totalMinutes / 7),
    prev.sleep?.totalMinutes ? Math.round(prev.sleep.totalMinutes / 7) : null,
    "min/jour",
  );

  sections.push(buildSection("😴", "Sommeil", sleepLines.join("<br>"), sleepTrend));

  // --- Changes ---
  const changeLines = [
    `<strong>${stats.changes.total}</strong> changes`,
    `${stats.changes.mictions} pipis · ${stats.changes.selles} selles`,
  ];
  const changeTrend = trend(stats.changes.total, prev.changes?.total);

  sections.push(buildSection("🧷", "Changes", changeLines.join("<br>"), changeTrend));

  // --- Pompages ---
  if (stats.pompages.count > 0 || (prev.pompages && prev.pompages.count > 0)) {
    const pompageLines = [
      `<strong>${stats.pompages.count}</strong> pompages · ${stats.pompages.totalMl}ml`,
    ];
    const pompageTrend = trend(stats.pompages.count, prev.pompages?.count, "pompages");
    sections.push(buildSection("🤱", "Tire-lait", pompageLines.join("<br>"), pompageTrend));
  }

  // --- Croissance ---
  if (stats.growth.hasData) {
    const growthParts = [];
    if (stats.growth.weight) growthParts.push(`Poids : ${stats.growth.weight}kg`);
    if (stats.growth.height) growthParts.push(`Taille : ${stats.growth.height}cm`);
    if (stats.growth.head) growthParts.push(`Tour de tête : ${stats.growth.head}cm`);
    if (growthParts.length > 0) {
      sections.push(buildSection("📏", "Croissance", growthParts.join("<br>"), ""));
    }
  }

  // --- Santé ---
  const healthParts = [];
  if (stats.health.vitamines > 0) healthParts.push(`${stats.health.vitamines} vitamine${stats.health.vitamines > 1 ? "s" : ""}`);
  if (stats.health.medicaments > 0) healthParts.push(`${stats.health.medicaments} médicament${stats.health.medicaments > 1 ? "s" : ""}`);
  if (stats.health.vaccins > 0) healthParts.push(`${stats.health.vaccins} vaccin${stats.health.vaccins > 1 ? "s" : ""}`);
  if (stats.health.symptomes > 0) healthParts.push(`${stats.health.symptomes} symptôme${stats.health.symptomes > 1 ? "s" : ""}`);
  if (healthParts.length === 0) healthParts.push("Aucun événement santé ✓");
  sections.push(buildSection("💊", "Santé", healthParts.join(" · "), ""));

  // --- Activités ---
  if (stats.activities > 0) {
    sections.push(buildSection(
      "🎯", "Activités",
      `<strong>${stats.activities}</strong> activité${stats.activities > 1 ? "s" : ""} d'éveil`,
      "",
    ));
  }

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Récap semaine — ${escapeHtml(childName)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0891b2, #06b6d4); padding: 28px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0 0 4px 0; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 0; }
    .body { padding: 8px 20px 20px; }
    .section { padding: 16px 0; border-bottom: 1px solid #f0f2f5; }
    .section:last-child { border-bottom: none; }
    .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .section-icon { font-size: 18px; }
    .section-title { font-size: 15px; font-weight: 600; color: #1e2a36; margin: 0; }
    .section-body { font-size: 14px; color: #4a5568; line-height: 1.6; padding-left: 28px; }
    .trend { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .cta { text-align: center; padding: 24px 20px; }
    .cta a { display: inline-block; background: #0891b2; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 16px; font-weight: 600; }
    .footer { text-align: center; padding: 16px 20px 24px; }
    .footer a { color: #9ca3af; font-size: 12px; text-decoration: underline; }
    .footer p { color: #9ca3af; font-size: 11px; margin: 8px 0 0; }
  </style>
</head>
<body>
  <div style="padding: 20px 12px;">
    <div class="container">
      <div class="header">
        <h1>Récap semaine — ${escapeHtml(childName)}</h1>
        <p>Semaine du ${escapeHtml(weekLabel)}</p>
      </div>
      <div class="body">
        ${sections.join("\n")}
      </div>
      <div class="cta">
        <a href="samaye://baby/home">Ouvrir Samaye</a>
      </div>
      <div class="footer">
        <a href="${escapeHtml(unsubscribeUrl)}">Se désabonner des récaps</a>
        <p>Samaye — Suivi bébé</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Construit une section HTML du récap.
 */
function buildSection(icon, title, bodyHtml, trendText) {
  return `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">${icon}</span>
        <h2 class="section-title">${escapeHtml(title)}</h2>
      </div>
      <div class="section-body">
        ${bodyHtml}
        ${trendText ? `<div class="trend">${escapeHtml(trendText)}</div>` : ""}
      </div>
    </div>`;
}

/**
 * Échappe les caractères HTML.
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { buildRecapHTML, formatDuration };
