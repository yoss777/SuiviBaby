/* Redirige un lien de réinitialisation Firebase vers l'application.
   Le code n'est jamais affiché ni injecté dans le DOM. */
(function () {
  "use strict";
  var params = new URLSearchParams(window.location.search);
  var oobCode = params.get("oobCode");
  var mode = params.get("mode");

  var loading = document.getElementById("loading");
  var manual = document.getElementById("manual");
  var error = document.getElementById("error");
  var openApp = document.getElementById("openApp");

  // Codes Firebase : jetons opaques URL-safe. On refuse tout le reste.
  var validCode = oobCode && /^[A-Za-z0-9_-]{10,512}$/.test(oobCode);
  var validMode = !mode || mode === "resetPassword";

  if (!validCode || !validMode) {
    loading.hidden = true;
    error.textContent = "Lien invalide ou expiré. Refaites une demande de réinitialisation depuis l'application.";
    error.hidden = false;
    return;
  }

  var deepLink = "suivibaby://reset-password?oobCode=" + encodeURIComponent(oobCode);
  window.location.href = deepLink;

  setTimeout(function () {
    loading.hidden = true;
    openApp.href = deepLink;
    manual.hidden = false;
    openApp.focus();
  }, 2000);
})();
