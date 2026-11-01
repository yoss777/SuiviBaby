/* SuiviBaby — interactions du site. Vanilla JS, aucune dépendance, aucun traceur. */
(function () {
  "use strict";

  let root = document.documentElement;
  let reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  let $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- Thème clair / sombre ---------- */
  $$(".theme-toggle").forEach(function (btn) {
    let sync = function () {
      let dark = root.getAttribute("data-theme") === "dark";
      btn.setAttribute("aria-pressed", String(dark));
    };
    sync();
    btn.addEventListener("click", function () {
      let next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("sb-theme", next); } catch (e) { /* ignore */ }
      sync();
    });
  });

  /* ---------- En-tête : ombre au scroll ---------- */
  let header = $(".header");
  if (header) {
    let onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Menu mobile ---------- */
  let menuBtn = $(".menu-toggle");
  let nav = $("#site-nav");
  if (menuBtn && nav) {
    let setOpen = function (open) {
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
      nav.classList.toggle("is-open", open);
    };
    menuBtn.addEventListener("click", function () {
      setOpen(menuBtn.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); menuBtn.focus(); }
    });
  }

  /* ---------- Store adapté à l'appareil ---------- */
  let ua = navigator.userAgent || "";
  let isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let isAndroid = /Android/i.test(ua);
  let platform = isIOS ? "ios" : isAndroid ? "android" : null;
  if (platform) {
    $$(".stores").forEach(function (group) {
      let match = $('.store[data-platform="' + platform + '"]', group);
      if (match) { match.classList.add("is-suggested"); group.insertBefore(match, group.firstElementChild); }
    });
    $$("[data-store-cta]").forEach(function (cta) {
      let target = $('.store[data-platform="' + platform + '"]');
      if (target) { cta.href = target.href; cta.target = "_blank"; cta.rel = "noopener"; }
    });
  }

  /* ---------- Apparition au scroll ---------- */
  let revealEls = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    let io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- Lien de navigation actif (scrollspy) ---------- */
  function scrollSpy(links) {
    if (!links.length || !("IntersectionObserver" in window)) return;
    let byId = {};
    links.forEach(function (a) {
      let id = decodeURIComponent(a.hash.slice(1));
      let target = id && document.getElementById(id);
      if (target) byId[id] = a;
    });
    let spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        let link = byId[entry.target.id];
        if (!link || !entry.isIntersecting) return;
        links.forEach(function (l) { l.removeAttribute("aria-current"); });
        link.setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    Object.keys(byId).forEach(function (id) { spy.observe(document.getElementById(id)); });
  }
  scrollSpy($$('#site-nav a[href^="#"]'));
  scrollSpy($$('.doc__toc a[href^="#"]'));

  /* ---------- Filtre des types d'événements ---------- */
  let tabs = $$(".types-tabs .tab");
  let types = $$(".types .type");
  let typesStatus = $("#types-status");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      let cat = tab.getAttribute("data-filter");
      tabs.forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      let count = 0;
      types.forEach(function (el) {
        let on = cat === "all" || el.getAttribute("data-cat") === cat;
        el.classList.toggle("is-dim", !on);
        if (on) count++;
      });
      if (typesStatus) typesStatus.textContent = count + " types mis en évidence : " + tab.textContent.trim();
    });
  });

  /* ---------- Tarifs mensuel / annuel ---------- */
  let billingBtns = $$(".billing button");
  billingBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      let period = btn.getAttribute("data-period");
      billingBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      $$("[data-price-monthly]").forEach(function (el) {
        el.textContent = el.getAttribute("data-price-" + period);
      });
      $$("[data-unit]").forEach(function (el) { el.textContent = period === "annual" ? "/an" : "/mois"; });
      $$("[data-sub-monthly]").forEach(function (el) {
        el.textContent = el.getAttribute("data-sub-" + period);
      });
    });
  });

  /* ---------- Démo animée du téléphone (hero) ---------- */
  let demo = $("#live-demo");
  if (demo) {
    let list = $(".demo__list", demo);
    let transcript = $(".demo__transcript", demo);
    let mic = $(".demo__mic", demo);
    let statFeeds = $('[data-stat="feeds"]', demo);
    let statSleep = $('[data-stat="sleep"]', demo);
    let statChanges = $('[data-stat="changes"]', demo);

    // Icônes au trait proches de celles de l'app, couleurs de la palette « Pastel Moderne ».
    let ICONS = {
      biberon: "M9 2h6M10 2v3M14 2v3M8 8a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2zM8 12h8M8 16h8",
      miction: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
      sommeil: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
      temperature: "M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0zM12 9v6",
      tetee: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"
    };
    let COLORS = { biberon: "#E8785A", miction: "#5BA4A4", sieste: "#7C6BA4", nuit: "#5A6BA4", temperature: "#E85A5A", tetee: "#D66B8F" };

    let script = [
      { say: "Biberon de 150 ml à 6 h 40", icon: "biberon", color: COLORS.biberon, title: "Biberon", meta: "150 ml · lait infantile", time: "06:40", confirm: "Biberon · 150 ml · 06:40", feeds: 1 },
      { say: "Couche mouillée", icon: "miction", color: COLORS.miction, title: "Miction", meta: "Couche changée", time: "07:05", confirm: "Change · pipi · 07:05", changes: 1 },
      { say: "Il s'est endormi à 9 h 30", icon: "sommeil", color: COLORS.sieste, title: "Sieste", meta: "En cours…", time: "09:30", confirm: "Sieste · début 09:30", sleep: true },
      { say: "Température 37,8", icon: "temperature", color: COLORS.temperature, title: "Température", meta: "37,8 °C · rectale", time: "11:15", confirm: "Température · 37,8 °C · 11:15" },
      { say: "Tétée sein gauche 12 minutes", icon: "tetee", color: COLORS.tetee, title: "Tétée", meta: "Gauche · 12 min", time: "12:02", confirm: "Tétée · gauche · 12 min", feeds: 1 }
    ];
    let seed = [
      { icon: "sommeil", color: COLORS.nuit, title: "Nuit", meta: "21:10 → 06:20 · 9 h 10", time: "06:20" }
    ];
    let IDLE = "Maintenez pour parler…";

    let feeds = 0;
    let changes = 0;
    let timers = [];
    let running = false;
    let idx = 0;

    let later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };
    let clearTimers = function () { timers.forEach(clearTimeout); timers = []; };

    let SVG_NS = "http://www.w3.org/2000/svg";
    let iconEl = function (ev) {
      let i = document.createElement("i");
      i.setAttribute("aria-hidden", "true");
      i.style.background = ev.color + "1f";
      let svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      let path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", ICONS[ev.icon]);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", ev.color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      i.appendChild(svg);
      return i;
    };

    let itemEl = function (ev, isNew) {
      let li = document.createElement("li");
      li.className = "demo__item" + (isNew ? " is-new" : "");
      let txt = document.createElement("div");
      let b = document.createElement("b"); b.textContent = ev.title;
      let s = document.createElement("span"); s.textContent = ev.meta;
      txt.appendChild(b); txt.appendChild(s);
      let t = document.createElement("time"); t.textContent = ev.time;
      li.appendChild(iconEl(ev)); li.appendChild(txt); li.appendChild(t);
      return li;
    };

    let setStatus = function (text, state) {
      transcript.textContent = text;
      transcript.classList.toggle("is-confirm", state === "confirm");
      transcript.classList.toggle("is-done", state === "done");
    };

    let reset = function () {
      list.textContent = "";
      seed.forEach(function (ev) { list.appendChild(itemEl(ev, false)); });
      feeds = 0; changes = 0; idx = 0;
      if (statFeeds) statFeeds.textContent = "0";
      if (statSleep) statSleep.textContent = "9 h 10";
      if (statChanges) statChanges.textContent = "0";
      setStatus(IDLE);
    };

    let addEvent = function (ev) {
      $$(".is-new", list).forEach(function (el) { el.classList.remove("is-new"); });
      list.insertBefore(itemEl(ev, true), list.firstChild);
      while (list.children.length > 5) list.removeChild(list.lastChild);
      if (ev.feeds) { feeds += ev.feeds; if (statFeeds) statFeeds.textContent = String(feeds); }
      if (ev.changes) { changes += ev.changes; if (statChanges) statChanges.textContent = String(changes); }
      if (ev.sleep && statSleep) statSleep.textContent = "9 h 10 +";
    };

    let typeText = function (text, done) {
      let n = 0;
      setStatus("");
      transcript.classList.add("is-typing");
      mic.classList.add("is-listening");
      let step = function () {
        if (!running) return;
        n++;
        transcript.textContent = "« " + text.slice(0, n) + (n >= text.length ? " »" : "");
        if (n < text.length) later(step, 38 + Math.random() * 40);
        else { transcript.classList.remove("is-typing"); mic.classList.remove("is-listening"); later(done, 450); }
      };
      later(step, 300);
    };

    // Comme dans l'app : dictée → proposition à confirmer → ajout au journal.
    let next = function () {
      if (!running) return;
      if (idx >= script.length) { later(function () { reset(); next(); }, 2600); return; }
      let ev = script[idx++];
      typeText(ev.say, function () {
        setStatus(ev.confirm + " — Confirmer ?", "confirm");
        later(function () {
          addEvent(ev);
          setStatus("Confirmé ✓ ajouté au journal", "done");
          later(function () { setStatus(IDLE); }, 1100);
          later(next, 1500);
        }, 1300);
      });
    };

    let start = function () { if (running) return; running = true; next(); };
    let stop = function () { running = false; clearTimers(); transcript.classList.remove("is-typing"); mic.classList.remove("is-listening"); };

    reset();
    let pauseBtn = $("#demo-toggle");
    if (reduceMotion) {
      // Pas d'animation : on affiche un état final statique et lisible.
      script.slice(0, 4).forEach(addEvent);
      $$(".is-new", list).forEach(function (el) { el.classList.remove("is-new"); });
      setStatus("Température · 37,8 °C · 11:15 — confirmé ✓", "done");
      if (pauseBtn) pauseBtn.hidden = true;
    } else {
      // La démo tourne seulement si elle est visible, l'onglet actif et non mise en pause.
      let visible = true;
      let userPaused = false;
      let sync = function () {
        if (visible && !userPaused && !document.hidden) start(); else stop();
      };
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
          sync();
        }).observe(demo);
      } else { sync(); }
      document.addEventListener("visibilitychange", sync);
      if (pauseBtn) {
        pauseBtn.addEventListener("click", function () {
          userPaused = !userPaused;
          pauseBtn.setAttribute("aria-pressed", String(userPaused));
          pauseBtn.textContent = userPaused ? "Reprendre la démo" : "Mettre la démo en pause";
          sync();
        });
      }
    }
  }

  /* ---------- Année du copyright ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
