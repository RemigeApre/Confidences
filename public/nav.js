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

// ── Recherche globale : champ qui s'agrandit dans le header ─────────────────
(function () {
  var wrap    = document.getElementById("pc-search-inline");
  var input   = document.getElementById("pc-search-input");
  var results = document.getElementById("pc-search-results");
  var openBtn = document.getElementById("pc-search-btn");
  if (!wrap || !input || !results || !openBtn) return;

  function isOpen() { return wrap.classList.contains("pc-search-open"); }

  function open() {
    wrap.classList.add("pc-search-open");
    openBtn.setAttribute("aria-expanded", "true");
    input.focus();
  }

  function close() {
    wrap.classList.remove("pc-search-open");
    openBtn.setAttribute("aria-expanded", "false");
    results.hidden = true;
    results.innerHTML = "";
    input.value = "";
  }

  openBtn.addEventListener("click", function () {
    if (isOpen()) close(); else open();
  });

  document.addEventListener("click", function (e) {
    if (isOpen() && !wrap.contains(e.target)) close();
  });

  document.addEventListener("keydown", function (e) {
    // Ctrl+K ou Cmd+K pour ouvrir la recherche
    if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      open();
    }
    if (e.key === "Escape" && isOpen()) close();
  });

  var timer;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    var q = input.value.trim();
    if (q.length < 2) { results.hidden = true; results.innerHTML = ""; return; }
    timer = setTimeout(function () { fetchSearch(q); }, 280);
  });

  function fetchSearch(q) {
    fetch("/api/search?q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) { render(data.results || {}); })
      .catch(function () {});
  }

  var LABELS = {
    wiki:    "Codex",
    galerie: "Galerie",
    bd:      "BD",
    liens:   "Liens",
    quizz:   "Quizz"
  };

  function render(data) {
    while (results.firstChild) results.removeChild(results.firstChild);
    results.hidden = false;
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

// ── Encarts "survol = aperçu, clic = épinglé, clic dehors = ferme" ──────────
// (rappel de consentement, menu profil). Pour <details> on pilote .open
// directement (le natif gère déjà l'affichage/l'accessibilité) ; pour les
// autres (.pc-has-drop) on pose/enlève .pc-menu-open (voir style.css).
(function () {
  var menus = document.querySelectorAll(".pc-hover-menu");
  if (!menus.length) return;

  menus.forEach(function (menu) {
    var isDetails = menu.tagName === "DETAILS";
    var trigger = menu.querySelector(isDetails ? ":scope > summary" : ":scope > button, :scope > a");
    if (!trigger) return;
    var pinned = false;
    var closeTimer = null;

    function setOpen(v) {
      if (isDetails) menu.open = v;
      menu.classList.toggle("pc-menu-open", v);
    }

    menu.addEventListener("mouseenter", function () {
      clearTimeout(closeTimer);
      setOpen(true);
    });
    menu.addEventListener("mouseleave", function () {
      if (pinned) return;
      // Petit délai avant fermeture : un mouvement rapide ou légèrement
      // diagonal peut faire sortir la souris du menu un instant, pas la
      // peine de refermer tout de suite.
      closeTimer = setTimeout(function () { setOpen(false); }, 300);
    });

    trigger.addEventListener("click", function (e) {
      if (isDetails) e.preventDefault(); // on gère l'ouverture nous-mêmes
      clearTimeout(closeTimer);
      pinned = !pinned;
      setOpen(pinned);
    });

    document.addEventListener("click", function (e) {
      if (!pinned) return;
      if (!menu.contains(e.target)) {
        clearTimeout(closeTimer);
        pinned = false;
        setOpen(false);
      }
    });
  });
})();

// ── Rappel de consentement "?" : couleur or tant qu'il n'a jamais été
// survolé/ouvert, puis couleur normale pour toujours (par navigateur). ───────
(function () {
  var details = document.querySelector(".pc-consent-details");
  if (!details) return;
  try {
    if (localStorage.getItem("lq-consent-seen") === "1") return;
  } catch (_) { return; }

  function markSeen() {
    try { localStorage.setItem("lq-consent-seen", "1"); } catch (_) {}
    document.documentElement.classList.remove("consent-unseen");
    details.removeEventListener("mouseenter", markSeen);
    details.removeEventListener("click", markSeen);
  }
  details.addEventListener("mouseenter", markSeen);
  details.addEventListener("click", markSeen);
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
      '" title="Voir la page codex" aria-label="Voir la page codex">&#8599;</a>';
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
  var blacklistBtn = document.getElementById("tag-popup-blacklist-btn");

  var currentTag = "";
  // Un tag masqué depuis cette popup ne doit disparaître des champs de tags
  // (chips, grille /tags...) qu'à la fermeture — pas pendant qu'on consulte
  // encore la popup — d'où ce drapeau plutôt qu'un événement au clic.
  var blacklistChangedSinceOpen = false;

  function close() {
    overlay.hidden = true;
    currentTag = "";
    if (blacklistChangedSinceOpen) {
      blacklistChangedSinceOpen = false;
      document.dispatchEvent(new CustomEvent("tag-blacklist-change"));
    }
  }

  function syncTypeBtns() {
    if (!typeBtnsWrap) return;
    var meta = (window.TAG_REGISTRY || {})[currentTag] || {};
    var activeType = (meta.tier === "ultra" || meta.tier === "irrealiste") ? meta.tier : "normal";
    typeBtnsWrap.querySelectorAll("[data-type]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.type === activeType);
    });
  }

  // "Masquer le tag" : ajoute/retire currentTag de la blacklist personnelle
  // (voir /tags/masques). Bascule tant que la popup reste ouverte — un clic
  // accidentel se corrige d'un second clic sans avoir à aller sur la page
  // dédiée ; l'effet ne se voit sur les autres champs de tags qu'à la
  // fermeture (voir close()).
  function syncBlacklistBtn() {
    if (!blacklistBtn) return;
    if (!window.IS_LOGGED_IN) { blacklistBtn.hidden = true; return; }
    blacklistBtn.hidden = false;
    var isBlacklisted = (window.TAG_BLACKLIST || []).indexOf(currentTag) !== -1;
    blacklistBtn.textContent = isBlacklisted ? "Ne plus masquer" : "Masquer le tag";
  }

  function open(tag) {
    currentTag = String(tag).toLowerCase().trim();
    if (!currentTag) return;
    blacklistChangedSinceOpen = false;
    titleEl.textContent = tag;
    pagesEl.innerHTML = "";
    galleryBtn.hidden = true;
    bdBtn.hidden = true;
    if (feedbackEl) feedbackEl.textContent = "";
    if (renameInput) renameInput.value = tag;
    syncTypeBtns();
    syncBlacklistBtn();
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
          empty.textContent = "Aucune page codex avec ce tag.";
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

  if (blacklistBtn) {
    blacklistBtn.addEventListener("click", function () {
      if (!currentTag || blacklistBtn.disabled) return;
      var wasBlacklisted = (window.TAG_BLACKLIST || []).indexOf(currentTag) !== -1;
      blacklistBtn.disabled = true; // évite un double-clic pendant l'aller-retour réseau
      fetch("/api/tags/blacklist", {
        method: wasBlacklisted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: currentTag }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) return;
          if (!window.TAG_BLACKLIST) window.TAG_BLACKLIST = [];
          var idx = window.TAG_BLACKLIST.indexOf(currentTag);
          if (wasBlacklisted) {
            if (idx !== -1) window.TAG_BLACKLIST.splice(idx, 1);
          } else if (idx === -1) {
            window.TAG_BLACKLIST.push(currentTag);
          }
          blacklistChangedSinceOpen = true;
        })
        .catch(function () {})
        .then(function () {
          blacklistBtn.disabled = false;
          syncBlacklistBtn();
        });
    });
  }

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
  // tard (lightbox, modale BD...), ouvre cette même popup — sauf en mode
  // "accès direct" (réglage /favoris/parametres) qui saute la popup et va
  // droit à la page codex du tag si elle existe, sinon à la galerie filtrée.
  document.addEventListener("click", function (e) {
    var badge = e.target.closest(".tag-badge[data-tag]");
    if (!badge) return;
    e.preventDefault();
    var tag = badge.dataset.tag;
    if (localStorage.getItem("tag-click-mode") === "direct") {
      var meta = (window.TAG_REGISTRY || {})[tag] || {};
      window.location.href = meta.wikiPageId
        ? "/wiki/" + meta.wikiPageId
        : "/galerie?tag=" + encodeURIComponent(tag);
      return;
    }
    open(tag);
  });
})();

// ── Bouton "ULTRA" du volet profil (partials/profil-nav.ejs) ────────────────
// Présent sur toutes les pages du profil. Cette IIFE ne gère que l'état
// visuel du bouton lui-même (partagé par toutes) ; chaque page qui a du
// contenu Ultra à masquer (favoris, notes codex/images/BD) écoute
// l'évènement "profil-ultra-toggle-change" pour réagir sans dupliquer
// cette logique ici.
(function () {
  var btn = document.getElementById("profil-ultra-toggle");
  if (!btn) return;
  var KEY = "profil-hide-ultra";
  function sync() {
    var on = localStorage.getItem(KEY) === "1";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "Afficher Ultra" : "Masquer Ultra";
    btn.title = on ? "Afficher les contenus Ultra" : "Masquer les contenus Ultra";
    btn.setAttribute("aria-label", btn.title);
  }
  sync();
  btn.addEventListener("click", function () {
    var on = localStorage.getItem(KEY) === "1";
    localStorage.setItem(KEY, on ? "0" : "1");
    sync();
    document.dispatchEvent(new CustomEvent("profil-ultra-toggle-change"));
  });
})();

// ── Mode discret (masquer les images) ───────────────────────────────────────
// La classe est déjà posée au chargement par partials/head.ejs (évite le
// flash) ; ici on ne fait que synchroniser les boutons et gérer le clic.
(function () {
  var KEY = "lq-discreet";
  var btns = [
    document.getElementById("pc-discreet-btn"),
    document.getElementById("nav-mobile-discreet-btn"),
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
