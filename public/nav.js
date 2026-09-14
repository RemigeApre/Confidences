// ── Historique de navigation (bouton retour mobile) ─────────────────────────
(function () {
  var MAX = 5;
  var KEY = "lq_nav_stack";
  var BACK_FLAG = "lq_nav_back";

  function getStack() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (_) { return []; }
  }
  function saveStack(s) {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
  }

  var cur = location.pathname + location.search;
  var stack = getStack();

  var isBackNav = sessionStorage.getItem(BACK_FLAG) === "1";
  if (isBackNav) {
    // On vient du bouton retour : le stack est déjà correct, ne pas repousser
    try { sessionStorage.removeItem(BACK_FLAG); } catch (_) {}
  } else if (!stack.length || stack[stack.length - 1] !== cur) {
    stack.push(cur);
    if (stack.length > MAX) stack = stack.slice(stack.length - MAX);
    saveStack(stack);
  }

  var btn = document.querySelector(".nav-back-btn");
  if (!btn) return;

  if (stack.length >= 2) {
    btn.href = stack[stack.length - 2];
  }

  btn.addEventListener("click", function (e) {
    var s = getStack();
    if (s.length >= 2) {
      e.preventDefault();
      var dest = s[s.length - 2];
      s.pop();
      saveStack(s);
      try { sessionStorage.setItem(BACK_FLAG, "1"); } catch (_) {}
      window.location.href = dest;
    }
    // sinon : laisser le href statique (fallback)
  });
})();

// ── Drawer mobile ────────────────────────────────────────────────────────────
(function () {
  var burger = document.getElementById("nav-burger");
  var drawer = document.getElementById("nav-drawer");
  var backdrop = document.getElementById("nav-backdrop");
  var closeBtn = document.getElementById("nav-drawer-close");
  if (!burger || !drawer || !backdrop) return;

  function openDrawer() {
    drawer.classList.add("open");
    backdrop.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    document.body.classList.add("nav-drawer-locked");
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-drawer-locked");
  }

  burger.addEventListener("click", openDrawer);
  backdrop.addEventListener("click", closeDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });
})();

// ── Recherche globale (overlay desktop) ─────────────────────────────────────
(function () {
  var overlay  = document.getElementById("pc-search-overlay");
  var input    = document.getElementById("pc-search-input");
  var closeBtn = document.getElementById("pc-search-close");
  var results  = document.getElementById("pc-search-results");
  var openBtn  = document.getElementById("pc-search-btn");
  if (!overlay || !input || !results) return;

  function open() {
    overlay.hidden = false;
    input.focus();
    input.select();
  }

  function close() {
    overlay.hidden = true;
    results.innerHTML = "";
    input.value = "";
  }

  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", function (e) {
    // Ctrl+K ou Cmd+K pour ouvrir la recherche
    if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      open();
    }
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  var timer;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    var q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ""; return; }
    timer = setTimeout(function () { fetchSearch(q); }, 280);
  });

  function fetchSearch(q) {
    fetch("/api/search?q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) { render(data.results || {}); })
      .catch(function () {});
  }

  var LABELS = {
    wiki:    "Wiki",
    galerie: "Galerie",
    bd:      "BD",
    liens:   "Liens",
    quizz:   "Quizz"
  };

  function render(data) {
    while (results.firstChild) results.removeChild(results.firstChild);
    var keys = Object.keys(data);
    if (!keys.length) {
      var empty = document.createElement("p");
      empty.className = "pc-search-empty";
      empty.textContent = "Aucun r\u00e9sultat";
      results.appendChild(empty);
      return;
    }
    keys.forEach(function (k) {
      var items = data[k];
      var sec = document.createElement("div");
      sec.className = "pc-search-section";

      var lbl = document.createElement("div");
      lbl.className = "pc-search-section-label";
      lbl.textContent = LABELS[k] || k;
      sec.appendChild(lbl);

      items.forEach(function (item) {
        var a = document.createElement("a");
        a.className = "pc-search-result-link";
        a.href = item.url;
        a.textContent = item.title;
        a.addEventListener("click", close);
        sec.appendChild(a);
      });

      results.appendChild(sec);
    });
  }
})();

// ── Chargement des images : toutes les <img> ont en permanence un fond
// sombre + spinner (voir style.css), visible tant que l'image n'a pas fini
// de se dessiner par-dessus — plus de flash blanc qui se remplit du haut
// vers le bas. C'est du pur CSS (marche meme sans JS, et pour toute image
// ajoutee dynamiquement ailleurs : lightbox, formulaires...). Le JS ici sert
// juste a : 1) enlever le fond une fois l'image chargee (sinon une image
// avec de la transparence garderait un fond sombre en permanence derriere),
// 2) arreter le spinner sur une image en erreur (404) au lieu qu'il tourne
// indefiniment derriere l'icone cassee. "load"/"error" ne bubblent pas sur
// <img>, d'ou l'ecoute en capture sur document (couvre toute image, presente
// ou ajoutee plus tard).
document.addEventListener("load", function (e) {
  if (e.target && e.target.tagName === "IMG") e.target.classList.add("lq-img-ready");
}, true);
document.addEventListener("error", function (e) {
  if (e.target && e.target.tagName === "IMG") e.target.classList.add("lq-img-error");
}, true);
// Rattrapage : une image deja en cache peut avoir fini de charger (et donc
// declenche son evenement "load") avant que ce script (charge en fin de
// page) n'ait eu le temps de poser l'ecouteur ci-dessus — sans ca elle
// resterait coincee avec le spinner affiche pour rien.
document.querySelectorAll("img").forEach(function (img) {
  if (!img.complete) return;
  img.classList.add(img.naturalWidth > 0 ? "lq-img-ready" : "lq-img-error");
});
