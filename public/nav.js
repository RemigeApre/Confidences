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

// ── Badges de tag unifiés (couleur + comportement identiques partout) ──────
// Construit le HTML d'un badge de tag à partir de window.TAG_REGISTRY (voir
// src/tagRegistry.js, exposé par partials/head.ejs) : utilisé par
// gallery.js/bd.js pour les listes de tags construites en JS (lightbox,
// modale BD). Le rendu serveur équivalent est partials/tag-badge.ejs.
function lqEscapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
window.buildTagBadgeHTML = function (tag) {
  var reg = window.TAG_REGISTRY || {};
  var meta = reg[String(tag).toLowerCase().trim()] || { tier: "normal", wikiPageId: null, pct: 0 };
  var style = meta.tier === "normal" ? ' style="--pct:' + meta.pct + '"' : "";
  var html = '<span class="tag-badge tag-badge--' + meta.tier + '" data-tag="' +
    lqEscapeHtml(String(tag).toLowerCase().trim()) + '"' + style + '>' + lqEscapeHtml(tag) + "</span>";
  if (meta.wikiPageId) {
    html += '<a class="tag-badge-arrow" href="/wiki/' + meta.wikiPageId +
      '" title="Voir la page wiki" aria-label="Voir la page wiki">&#8599;</a>';
  }
  return html;
};

// ── Popup de tag unifiée (voir partials/tag-popup.ejs) ──────────────────────
(function () {
  var overlay = document.getElementById("tag-popup-overlay");
  if (!overlay) return;
  var titleEl     = document.getElementById("tag-popup-title");
  var pagesEl     = document.getElementById("tag-popup-pages");
  var galleryBtn  = document.getElementById("tag-popup-gallery-btn");
  var bdBtn       = document.getElementById("tag-popup-bd-btn");
  var closeBtn    = document.getElementById("tag-popup-close");
  var adminPanel  = document.getElementById("tag-popup-admin");
  var renameInput = document.getElementById("tag-popup-rename-input");
  var renameBtn   = document.getElementById("tag-popup-rename-btn");
  var typeBtnsWrap = document.getElementById("tag-popup-type-btns");
  var feedbackEl  = document.getElementById("tag-popup-admin-feedback");

  var currentTag = "";

  function close() {
    overlay.hidden = true;
    currentTag = "";
  }

  function syncTypeBtns() {
    if (!typeBtnsWrap) return;
    var meta = (window.TAG_REGISTRY || {})[currentTag] || {};
    var activeType = (meta.tier === "ultra" || meta.tier === "irrealiste") ? meta.tier : "normal";
    typeBtnsWrap.querySelectorAll("[data-type]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.type === activeType);
    });
  }

  function open(tag) {
    currentTag = String(tag).toLowerCase().trim();
    if (!currentTag) return;
    titleEl.textContent = tag;
    pagesEl.innerHTML = "";
    galleryBtn.hidden = true;
    bdBtn.hidden = true;
    if (feedbackEl) feedbackEl.textContent = "";
    if (renameInput) renameInput.value = tag;
    syncTypeBtns();
    if (adminPanel) adminPanel.hidden = !window.IS_ADMIN;
    overlay.hidden = false;

    fetch("/api/tags/results?tag=" + encodeURIComponent(currentTag))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (currentTag !== String(tag).toLowerCase().trim()) return;
        (data.wiki || []).forEach(function (p) {
          var a = document.createElement("a");
          a.className = "tag-popup-page-card";
          a.href = "/wiki/" + p.id;
          a.textContent = p.title;
          pagesEl.appendChild(a);
        });
        if (!data.wiki || !data.wiki.length) {
          var empty = document.createElement("p");
          empty.className = "tag-popup-empty";
          empty.textContent = "Aucune page wiki avec ce tag.";
          pagesEl.appendChild(empty);
        }
        if (data.galerie && data.galerie.length) {
          galleryBtn.hidden = false;
          galleryBtn.textContent = "Voir les images (" + data.galerie.length + ")";
        }
        if (data.bd && data.bd.length) {
          bdBtn.hidden = false;
          bdBtn.textContent = "Voir les BD (" + data.bd.length + ")";
        }
      })
      .catch(function () {});
  }
  window.openTagPopup = open;

  galleryBtn.addEventListener("click", function () {
    if (currentTag) window.location.href = "/galerie?tag=" + encodeURIComponent(currentTag);
  });
  bdBtn.addEventListener("click", function () {
    if (currentTag) window.location.href = "/bd?tag=" + encodeURIComponent(currentTag);
  });
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !overlay.hidden) close(); });

  if (renameBtn) {
    renameBtn.addEventListener("click", function () {
      var newTag = (renameInput.value || "").trim().toLowerCase();
      if (!newTag || !currentTag || newTag === currentTag) return;
      fetch("/api/tags/rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldTag: currentTag, newTag: newTag }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) { close(); window.location.reload(); }
          else if (feedbackEl) feedbackEl.textContent = (d && d.error) || "Erreur";
        })
        .catch(function () { if (feedbackEl) feedbackEl.textContent = "Erreur reseau"; });
    });
  }

  if (typeBtnsWrap) {
    typeBtnsWrap.querySelectorAll("[data-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!currentTag) return;
        fetch("/api/tags/type", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: currentTag, type: btn.dataset.type }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d.ok) return;
            if (window.TAG_REGISTRY && window.TAG_REGISTRY[currentTag]) {
              window.TAG_REGISTRY[currentTag].tier = btn.dataset.type;
            }
            syncTypeBtns();
            document.querySelectorAll('.tag-badge[data-tag="' + currentTag + '"]').forEach(function (el) {
              el.className = el.className.replace(/tag-badge--\S+/, "tag-badge--" + btn.dataset.type);
            });
          })
          .catch(function () {});
      });
    });
  }

  // Délégation globale : n'importe quel badge de tag, présent ou ajouté plus
  // tard (lightbox, modale BD...), ouvre cette même popup.
  document.addEventListener("click", function (e) {
    var badge = e.target.closest(".tag-badge[data-tag]");
    if (!badge) return;
    e.preventDefault();
    open(badge.dataset.tag);
  });
})();

// ── Mode discret (masquer les images) ───────────────────────────────────────
// La classe est déjà posée au chargement par partials/head.ejs (évite le
// flash) ; ici on ne fait que synchroniser les boutons et gérer le clic.
(function () {
  var KEY = "lq-discreet";
  var btns = [
    document.getElementById("pc-discreet-btn"),
    document.getElementById("nav-drawer-discreet-btn"),
  ].filter(Boolean);
  if (!btns.length) return;

  function isOn() { return document.documentElement.classList.contains("lq-discreet-mode"); }
  function sync() {
    var on = isOn();
    btns.forEach(function (btn) { btn.setAttribute("aria-pressed", on ? "true" : "false"); });
  }
  sync();

  btns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var on = !isOn();
      document.documentElement.classList.toggle("lq-discreet-mode", on);
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) {}
      sync();
    });
  });
})();
