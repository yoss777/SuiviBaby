/* Liens d'action Firebase : réinitialisation → ouverture de l'application ;
   vérification d'adresse → validée ici. Le code n'est jamais affiché ni
   injecté dans le DOM. */
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

  function showError(message) {
    loading.hidden = true;
    error.hidden = false;
    setTimeout(function () {
      error.textContent = message;
    }, 100);
  }

  // Vérification d'adresse e-mail : Firebase envoie tous les liens d'action
  // (réinitialisation, vérification) vers cette même page. Sans l'application
  // installée, on valide l'adresse ici au lieu d'afficher le mot de passe.
  if (mode === "verifyEmail") {
    let apiKey = params.get("apiKey");
    let title = document.getElementById("title");
    let icon = document.getElementById("icon");
    document.title = "Vérification de l'adresse e-mail — SuiviBaby";
    if (title) title.textContent = "Vérification de l'adresse e-mail";
    if (icon) icon.textContent = "✉️";
    if (!validCode || !apiKey || !/^AIza[0-9A-Za-z_-]{35}$/.test(apiKey)) {
      showError("Lien invalide ou expiré. Demandez un nouvel e-mail de vérification depuis l'application.");
      return;
    }
    fetch("https://identitytoolkit.googleapis.com/v1/accounts:update?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oobCode: oobCode }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("invalid");
        loading.hidden = true;
        let done = document.getElementById("verified");
        done.hidden = false;
        done.focus();
      })
      .catch(function () {
        showError("Ce lien de vérification n'est plus valide (déjà utilisé ou expiré). Demandez un nouvel e-mail depuis l'application.");
      });
    return;
  }

  let validMode = !mode || mode === "resetPassword";

  if (!validCode || !validMode) {
    loading.hidden = true;
    // Conteneur d'alerte d'abord affiché (vide), texte injecté ensuite : les
    // lecteurs d'écran n'annoncent pas toujours un contenu déjà présent à
    // l'apparition d'un élément masqué.
    error.hidden = false;
    setTimeout(function () {
      error.textContent = "Lien invalide ou expiré. Refaites une demande de réinitialisation depuis l'application.";
    }, 100);
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
