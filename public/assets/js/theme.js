/* Chargé de façon bloquante dans <head> pour éviter un flash de thème.
   Préférence stockée localement (localStorage), jamais transmise. */
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var stored = null;
  try { stored = localStorage.getItem("sb-theme"); } catch (e) { /* stockage indisponible */ }
  var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", stored || (prefersDark ? "dark" : "light"));
})();
