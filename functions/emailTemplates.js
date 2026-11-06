// functions/emailTemplates.js
// Weekly recap e-mail. It deliberately carries NO health figures (no stats,
// growth or health section): e-mail is not a secure channel for health data
// (GDPR sprint 3, decision 3.5). It only tells the parent the recap is ready.

/**
 * Builds the weekly recap e-mail HTML.
 *
 * @param {object} params
 * @param {string} params.childName - First name of the child
 * @param {string} params.openAppUrl - Deep link opening the app
 * @param {string} params.unsubscribeUrl - Public one-click unsubscribe page
 * @returns {string} HTML
 */
function buildRecapHTML({ childName, openAppUrl, unsubscribeUrl }) {
  const name = escapeHtml(childName);
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Le récap de la semaine est prêt</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0891b2, #06b6d4); padding: 28px 24px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .body { padding: 24px 24px 8px; font-size: 15px; color: #4a5568; line-height: 1.6; text-align: center; }
    .cta { text-align: center; padding: 16px 20px 28px; }
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
        <h1>Le récap de la semaine est prêt</h1>
      </div>
      <div class="body">
        <p>Bonjour, le récap de la semaine de <strong>${name}</strong> est disponible dans Suivi Baby.</p>
        <p>Ouvrez l'application pour le consulter.</p>
      </div>
      <div class="cta">
        <a href="${escapeHtml(openAppUrl)}">Ouvrir Suivi Baby</a>
      </div>
      <div class="footer">
        <a href="${escapeHtml(unsubscribeUrl)}">Se désabonner des récaps</a>
        <p>Suivi Baby — Suivi bébé</p>
      </div>
    </div>
  </div>
</body>
</html>`;
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

module.exports = { buildRecapHTML };
