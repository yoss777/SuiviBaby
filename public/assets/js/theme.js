/* Chargé de façon bloquante dans <head> pour éviter un flash de thème.
   Préférence stockée localement (localStorage), jamais transmise. */
(function () {
  let root = document.documentElement;
  root.classList.add("js");
  let stored = null;
  try { stored = localStorage.getItem("sb-theme"); } catch (e) { /* stockage indisponible */ }
  let prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", stored || (prefersDark ? "dark" : "light"));
})();
