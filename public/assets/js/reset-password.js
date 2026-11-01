/* Redirige un lien de réinitialisation Firebase vers l'application.
   Le code n'est jamais affiché ni injecté dans le DOM. */
(function () {
  "use strict";
  let params = new URLSearchParams(window.location.search);
  let oobCode = params.get("oobCode");
  let mode = params.get("mode");

  let loading = document.getElementById("loading");
  let manual = document.getElementById("manual");
  let error = document.getElementById("error");
  let openApp = document.getElementById("openApp");

  // Codes Firebase : jetons opaques URL-safe. On refuse tout le reste.
  let validCode = oobCode && /^[A-Za-z0-9_-]{10,512}$/.test(oobCode);
  let validMode = !mode || mode === "resetPassword";

  if (!validCode || !validMode) {
    loading.hidden = true;
    error.textContent = "Lien invalide ou expiré. Refaites une demande de réinitialisation depuis l'application.";
    error.hidden = false;
    return;
  }

  let deepLink = "suivibaby://reset-password?oobCode=" + encodeURIComponent(oobCode);
  window.location.href = deepLink;

  setTimeout(function () {
    loading.hidden = true;
    openApp.href = deepLink;
    manual.hidden = false;
    openApp.focus();
  }, 2000);
})();
