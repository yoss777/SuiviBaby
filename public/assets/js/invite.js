/* SuiviBaby — page d'invitation : affiche le code de parrainage présent dans l'URL (/invite/CODE).
   textContent uniquement (pas d'injection HTML), et seulement si le code a un format plausible. */
(function () {
  "use strict";

  let match = /^\/invite\/([^/?#]+)\/?$/.exec(window.location.pathname);
  if (!match) return;
  let code;
  try { code = decodeURIComponent(match[1]).trim().toUpperCase(); } catch (e) { return; }
  // Codes serveur au format SAM-XXXX-XXXX ; on reste tolérant mais borné.
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) return;

  let block = document.querySelector(".invite-code");
  let value = document.getElementById("invite-code");
  if (!block || !value) return;
  value.textContent = code;
  block.hidden = false;
})();
