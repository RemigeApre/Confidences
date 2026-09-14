(function () {
  "use strict";

  // ══════════════════════════════════════════════════
  // 1. TAG WIDGET (même logique que wiki.js)
  // ══════════════════════════════════════════════════
  function tagHue(tag) {
    var TAG_HUES = [4, 28, 48, 140, 175, 210, 270, 330];
    var h = 0, s = tag.toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TAG_HUES[Math.abs(h) % TAG_HUES.length];
  }

  document.querySelectorAll(".wiki-tags-widget").forEach(function (widget) {
    var board   = widget.querySelector(".wiki-tags-board");
    var typing  = widget.querySelector(".wiki-tags-typing");
    var hidden  = widget.querySelector(".wiki-tags-hidden");
    var suggest = widget.querySelector(".wiki-tag-suggestions");
    if (!board || !typing || !hidden) return;

    var tags = hidden.value ? hidden.value.split(",").map(function(t){ return t.trim(); }).filter(Boolean) : [];

    function render() {
      board.querySelectorAll(".wiki-tag-pill-btn").forEach(function(el){ el.remove(); });
      tags.forEach(function (t) {
        var pill = document.createElement("span");
        pill.className = "link-tag-pill wiki-tag-pill-btn";
        pill.style.background = "hsl(" + tagHue(t) + ", 55%, 42%)";
        pill.style.color = "#fff";
        pill.style.cursor = "pointer";
        pill.textContent = t + " ×";
        pill.addEventListener("click", function () {
          tags = tags.filter(function(x){ return x !== t; });
          hidden.value = tags.join(", ");
          render();
        });
        board.insertBefore(pill, typing);
      });
      hidden.value = tags.join(", ");
    }

    function addTag(t) {
      t = t.trim();
      if (t && !tags.includes(t)) { tags.push(t); render(); }
    }

    typing.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(typing.value);
        typing.value = "";
      } else if (e.key === "Backspace" && !typing.value && tags.length) {
        tags.pop();
        hidden.value = tags.join(", ");
        render();
      }
    });
    typing.addEventListener("blur", function () {
      if (typing.value.trim()) { addTag(typing.value); typing.value = ""; }
    });

    if (suggest) {
      suggest.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
        chip.addEventListener("click", function () { addTag(chip.dataset.tag); });
      });
    }

    render();
  });

  // ══════════════════════════════════════════════════
  // 2. FAB + PANEL UPLOAD
  // ══════════════════════════════════════════════════
  var fabMain     = document.getElementById("gallery-fab-main");
  var fabMenu     = document.getElementById("gallery-fab-menu");
  var fabImage    = document.getElementById("gallery-fab-image");
  var fabBd       = document.getElementById("gallery-fab-bd");
  var uploadPanel = document.getElementById("gallery-upload-panel");
  var uploadType  = document.getElementById("gallery-upload-type");
  var uploadLabel = document.getElementById("gallery-upload-type-label");
  var cancelBtn   = document.getElementById("gallery-upload-cancel");
  var fileInput   = uploadPanel ? uploadPanel.querySelector(".gallery-file-input") : null;
  var previewZone = document.getElementById("gallery-upload-previews");

  function closeUpload() {
    if (uploadPanel) uploadPanel.hidden = true;
    if (fabMenu) fabMenu.hidden = true;
    if (fabMain) fabMain.textContent = "+";
  }

  function openUploadAs(type) {
    if (uploadType) uploadType.value = type;
    if (uploadPanel) uploadPanel.hidden = false;
    if (fabMenu) fabMenu.hidden = true;
    if (fabMain) fabMain.textContent = "\u00d7";
  }

  if (fabMain) {
    fabMain.addEventListener("click", function () {
      if (uploadPanel && !uploadPanel.hidden) { closeUpload(); return; }
      openUploadAs("image");
    });
  }
  if (cancelBtn) cancelBtn.addEventListener("click", closeUpload);
  var uploadBack = document.getElementById("gallery-upload-back");
  if (uploadBack) uploadBack.addEventListener("click", closeUpload);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && uploadPanel && !uploadPanel.hidden) closeUpload();
  });

  function renderUploadPreviews(files) {
    if (!previewZone) return;
    previewZone.innerHTML = "";
    Array.from(files || []).forEach(function (file) {
      var wrap = document.createElement("div");
      wrap.className = "gallery-preview-wrap";
      var img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = "";
      img.className = "gallery-preview-img";
      wrap.appendChild(img);
      previewZone.appendChild(wrap);
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function () { renderUploadPreviews(fileInput.files); });
  }

  // Zone de dépôt (drag & drop)
  var dropZone = document.getElementById("guf-drop-zone");
  if (dropZone && fileInput) {
    dropZone.addEventListener("dragover", function (e) { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", function () { dropZone.classList.remove("drag-over"); });
    dropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      var files = e.dataTransfer.files;
      if (!files.length) return;
      // Transférer dans l'input file via DataTransfer
      try {
        var dt = new DataTransfer();
        Array.from(files).forEach(function (f) { dt.items.add(f); });
        fileInput.files = dt.files;
      } catch (_) {}
      renderUploadPreviews(files);
    });
  }

  // Boutons spéciaux tags (ultra / irréaliste) dans la modale
  (function () {
    var panel = document.getElementById("gallery-upload-panel");
    if (!panel) return;
    panel.querySelectorAll(".guf-tag-special").forEach(function (btn) {
      btn.addEventListener("click", function () {
        // Trouver le widget tags principal (non parody)
        var mainWidget = null;
        panel.querySelectorAll(".wiki-tags-widget").forEach(function (w) {
          if (!w.classList.contains("guf-parody-widget")) mainWidget = w;
        });
        if (!mainWidget) return;
        var chip = mainWidget.querySelector('.wiki-tag-suggest-chip[data-tag="' + btn.dataset.tag + '"]');
        if (chip) { chip.click(); return; }
        var typer = mainWidget.querySelector(".wiki-tags-typing");
        if (typer) {
          typer.value = btn.dataset.tag;
          typer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          typer.value = "";
        }
      });
    });
    // ── Autocomplete auteur + parodies ──────────────────────
    function makeAcDrop(anchor) {
      var drop = document.createElement("ul");
      drop.className = "guf-ac-drop";
      drop.hidden = true;
      anchor.appendChild(drop);
      return drop;
    }

    function attachAc(input, fetchUrl, onSelect) {
      var wrap = input.closest(".guf-ac-wrap");
      if (!wrap) return;
      var drop = makeAcDrop(wrap);
      var timer = null;

      function showDrop(list) {
        drop.innerHTML = "";
        if (!list || !list.length) { drop.hidden = true; return; }
        list.slice(0, 8).forEach(function (item) {
          var li = document.createElement("li");
          li.className = "guf-ac-item";
          li.textContent = item;
          li.addEventListener("mousedown", function (e) {
            e.preventDefault();
            onSelect(item, input);
            drop.hidden = true;
          });
          drop.appendChild(li);
        });
        drop.hidden = false;
      }

      function query(q) {
        fetch(fetchUrl + "?q=" + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (list) { showDrop(list); })
          .catch(function () {});
      }

      input.addEventListener("input", function () {
        clearTimeout(timer);
        var q = input.value.trim();
        if (!q) { drop.hidden = true; return; }
        timer = setTimeout(function () { query(q); }, 180);
      });

      input.addEventListener("focus", function () {
        var q = input.value.trim();
        if (q) query(q);
      });

      input.addEventListener("blur", function () {
        setTimeout(function () { drop.hidden = true; }, 180);
      });

      input.addEventListener("keydown", function (e) {
        if (drop.hidden) return;
        var items = drop.querySelectorAll(".guf-ac-item");
        var sel = drop.querySelector(".guf-ac-item.selected");
        var idx = Array.prototype.indexOf.call(items, sel);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          idx = Math.min(idx + 1, items.length - 1);
          items.forEach(function (li, i) { li.classList.toggle("selected", i === idx); });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          idx = Math.max(idx - 1, 0);
          items.forEach(function (li, i) { li.classList.toggle("selected", i === idx); });
        } else if (e.key === "Enter" && sel) {
          e.preventDefault();
          e.stopImmediatePropagation();
          onSelect(sel.textContent, input);
          drop.hidden = true;
        } else if (e.key === "Escape") {
          drop.hidden = true;
        }
      }, true);
    }

    // Auteur : simple champ texte
    var authorInput = panel.querySelector(".guf-author-input");
    if (authorInput) {
      attachAc(authorInput, "/galerie/autocomplete/authors", function (val, inp) {
        inp.value = val;
      });
    }

    // Parodies : tag widget → ajouter comme tag via typer + Enter
    var parodyTyper = panel.querySelector(".guf-parody-widget .wiki-tags-typing");
    if (parodyTyper) {
      attachAc(parodyTyper, "/galerie/autocomplete/parodies", function (val, inp) {
        inp.value = val;
        inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        inp.value = "";
      });
    }

    // Filtrer les suggestions top tags en temps réel
    panel.querySelectorAll(".wiki-tags-widget:not(.guf-parody-widget)").forEach(function (w) {
      var typer = w.querySelector(".wiki-tags-typing");
      var suggestions = w.querySelector(".guf-tag-suggestions");
      if (!typer || !suggestions) return;
      typer.addEventListener("input", function () {
        var q = typer.value.trim().toLowerCase();
        suggestions.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
          chip.hidden = q.length > 0 && chip.dataset.tag.toLowerCase().indexOf(q) === -1;
        });
      });
    });
  })();

  // ══════════════════════════════════════════════════
  // 3. FILTRES
  // ══════════════════════════════════════════════════
  var grid           = document.getElementById("gallery-grid");
  var tagFilter      = document.getElementById("gallery-tag-filter");
  var typeFilter     = document.getElementById("gallery-type-filter");
  var categoryFilter = document.getElementById("gallery-category-filter");
  var searchInput    = document.getElementById("gallery-search");
  var searchClear    = document.getElementById("gallery-search-clear");
  var resultCount    = document.getElementById("gallery-result-count");
  var countHero      = document.getElementById("gallery-count-hero");

  var typeState      = 0;   // 0=neutre, 1=inclure, 2=exclure
  var typeValue      = "";  // "image" ou "bd"
  var tagStates      = {}; // { "tag": 0|1|2 }
  var activeCategory = "";
  var searchQ        = "";
  // Etat initial derive du reglage de compte (voir /favoris > Parametres),
  // plus fiable qu'un localStorage par navigateur qui pouvait diverger.
  var hideUltra      = (window.ULTRA_MODE || "hidden") === "hidden";
  var hideIrrealiste = (window.IRREALISTE_MODE || "visible") === "hidden";
  var activeRating   = 0;
  var sortMode       = "date-desc";
  var randomSeeds    = null; // Map<card, number> — persistant entre pages
  var currentPage    = 0;
  var MOBILE_BREAK   = 641;
  var ITEMS_PER_PAGE = window.innerWidth < MOBILE_BREAK ? 10 : 50;
  var filteredCards  = [];

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function applyFilters() {
    currentPage = 0;
    renderPage();
    if (typeof applyGalleryTagOverflow === "function") applyGalleryTagOverflow();
  }

  function renderPage() {
    if (!grid) return;
    var cards = Array.from(grid.querySelectorAll(".gallery-card"));
    var q = norm(searchQ);

    var typeIncludes = typeState === 1 ? [typeValue] : [];
    var typeExcludes = typeState === 2 ? [typeValue] : [];
    var tagIncludes  = Object.keys(tagStates).filter(function(t){ return tagStates[t] === 1; });
    var tagExcludes  = Object.keys(tagStates).filter(function(t){ return tagStates[t] === 2; });

    filteredCards = [];
    cards.forEach(function(card) {
      var cardTags = (card.dataset.tags || "").split("|").filter(Boolean);

      var okType = true;
      if (typeIncludes.length) okType = typeIncludes.indexOf(card.dataset.type) !== -1;
      if (typeExcludes.length) okType = okType && typeExcludes.indexOf(card.dataset.type) === -1;

      var okCategory = !activeCategory || card.dataset.category === activeCategory;
      var okSearch   = !q || norm(card.dataset.title).indexOf(q) !== -1 || cardTags.some(function(t){ return norm(t).indexOf(q) !== -1; });
      var okUltra       = !hideUltra || card.dataset.ultra !== "1";
      var okIrrealiste  = !hideIrrealiste || card.dataset.irrealiste !== "1";
      var okRating   = !activeRating || Number(card.dataset.rating) >= activeRating;

      var okTag = true;
      if (tagIncludes.length) okTag = tagIncludes.every(function(t){ return cardTags.indexOf(t) !== -1; });
      if (tagExcludes.length) okTag = okTag && tagExcludes.every(function(t){ return cardTags.indexOf(t) === -1; });

      var passes = okType && okCategory && okSearch && okUltra && okIrrealiste && okRating && okTag;
      card.dataset.filtered = passes ? "1" : "0";
      if (passes) filteredCards.push(card);
    });

    var start = currentPage * ITEMS_PER_PAGE;
    var end   = start + ITEMS_PER_PAGE;
    cards.forEach(function(card) {
      if (card.dataset.filtered !== "1") { card.hidden = true; return; }
      var idx = filteredCards.indexOf(card);
      card.hidden = idx < start || idx >= end;
    });

    var total = filteredCards.length;
    var totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;
    var hasFilter = typeState || Object.keys(tagStates).some(function(t){ return tagStates[t]; }) || activeCategory || q || hideUltra || hideIrrealiste || activeRating;
    if (countHero) countHero.textContent = hasFilter ? (total + "/" + cards.length) : cards.length;
    if (resultCount) { resultCount.hidden = !hasFilter; if (hasFilter) resultCount.textContent = total + " / " + cards.length; }

    updatePagination(totalPages);
    sortCards();
  }

  function updatePagination(totalPages) {
    ["gallery-pagination-top", "gallery-pagination-bot"].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.hidden = totalPages <= 1;
      el.innerHTML = "";
      if (totalPages <= 1) return;
      var prev = document.createElement("button");
      prev.type = "button"; prev.className = "gallery-page-btn";
      prev.textContent = "\u2039 Pr\u00e9c.";
      prev.disabled = currentPage === 0;
      prev.addEventListener("click", function() { if (currentPage > 0) { currentPage--; renderPage(); window.scrollTo(0,0); } });
      var info = document.createElement("span");
      info.className = "gallery-page-info";
      info.textContent = (currentPage + 1) + " / " + totalPages;
      var next = document.createElement("button");
      next.type = "button"; next.className = "gallery-page-btn";
      next.textContent = "Suiv. \u203a";
      next.disabled = currentPage >= totalPages - 1;
      next.addEventListener("click", function() { if (currentPage < totalPages - 1) { currentPage++; renderPage(); window.scrollTo(0,0); } });
      el.appendChild(prev); el.appendChild(info); el.appendChild(next);
    });
  }

  function sortCards() {
    if (!grid) return;
    var cards = Array.from(grid.querySelectorAll(".gallery-card:not([hidden])"));
    if (sortMode === "random") {
      // Initialise les seeds sur TOUTES les cartes (une seule fois)
      if (!randomSeeds) {
        randomSeeds = new Map();
        Array.from(grid.querySelectorAll(".gallery-card")).forEach(function(c) {
          randomSeeds.set(c, Math.random());
        });
      }
      cards.sort(function(a, b) { return (randomSeeds.get(a) || 0) - (randomSeeds.get(b) || 0); });
    } else {
      cards.sort(function(a, b) {
        if (sortMode === "alpha-asc") return (a.dataset.title || "").localeCompare(b.dataset.title || "", "fr");
        if (sortMode === "rating-desc") return (Number(b.dataset.rating) || 0) - (Number(a.dataset.rating) || 0);
        if (sortMode === "date-asc") return (a.dataset.date || "").localeCompare(b.dataset.date || "");
        return (b.dataset.date || "").localeCompare(a.dataset.date || "");
      });
    }
    cards.forEach(function(c) { grid.appendChild(c); });
  }

  // Type filter — 3 états (neutre → inclure → exclure → neutre)
  if (typeFilter) {
    typeFilter.querySelectorAll(".tag-chip[data-type]").forEach(function(chip) {
      chip.addEventListener("click", function() {
        var t = chip.dataset.type || "";
        if (typeValue !== t) {
          typeFilter.querySelectorAll(".tag-chip").forEach(function(c){ c.dataset.state = "0"; c.classList.remove("chip-include","chip-exclude"); });
          typeValue = t; typeState = 1;
        } else {
          typeState = (typeState + 1) % 3;
          if (typeState === 0) typeValue = "";
        }
        chip.dataset.state = typeState;
        chip.classList.toggle("chip-include", typeState === 1);
        chip.classList.toggle("chip-exclude", typeState === 2);
        applyFilters();
      });
    });
  }

  // Category filter — toggle
  if (categoryFilter) {
    categoryFilter.querySelectorAll(".tag-chip[data-category]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var t = chip.dataset.category || "";
        if (activeCategory === t) {
          chip.classList.remove("active");
          activeCategory = "";
        } else {
          categoryFilter.querySelectorAll(".tag-chip").forEach(function(c){ c.classList.remove("active"); });
          chip.classList.add("active");
          activeCategory = t;
        }
        applyFilters();
      });
    });
  }

  // Tag filter — 3 états (neutre → inclure → exclure → neutre)
  if (tagFilter) {
    tagFilter.querySelectorAll(".wiki-tag-chip").forEach(function(chip) {
      chip.addEventListener("click", function() {
        var t = (chip.dataset.tag || "").toLowerCase();
        var state = ((tagStates[t] || 0) + 1) % 3;
        tagStates[t] = state;
        chip.dataset.state = state;
        chip.classList.toggle("chip-include", state === 1);
        chip.classList.toggle("chip-exclude", state === 2);
        applyFilters();
      });
    });
  }

  // ── Tag overflow galerie (20 par palier, max 40) ──────────────────────────
  var GTAG_PAGE = 20;
  var GTAG_MAX  = 40;
  var gTagExpandedCount = GTAG_PAGE;
  var gTagExpandBtn = document.getElementById("gallery-tag-expand-btn");

  function applyGalleryTagOverflow() {
    if (!tagFilter) return;
    var allChips = Array.from(tagFilter.querySelectorAll(".wiki-tag-chip[data-tag]"));
    // Les chips actives (include/exclude) restent toujours visibles
    var neutralIdx = 0;
    allChips.forEach(function(chip) {
      var isActive = (tagStates[(chip.dataset.tag || "").toLowerCase()] || 0) !== 0;
      if (isActive) {
        chip.classList.remove("wiki-tag-overflow-hidden");
      } else {
        chip.classList.toggle("wiki-tag-overflow-hidden", neutralIdx >= gTagExpandedCount);
        neutralIdx++;
      }
    });
    if (gTagExpandBtn) {
      var neutralTotal = allChips.filter(function(c) {
        return (tagStates[(c.dataset.tag || "").toLowerCase()] || 0) === 0;
      }).length;
      gTagExpandBtn.hidden = !(neutralTotal > gTagExpandedCount && gTagExpandedCount < GTAG_MAX);
    }
  }

  if (gTagExpandBtn) {
    gTagExpandBtn.addEventListener("click", function() {
      gTagExpandedCount = Math.min(gTagExpandedCount + GTAG_PAGE, GTAG_MAX);
      applyGalleryTagOverflow();
    });
  }

  applyGalleryTagOverflow();

  // Search
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchQ = searchInput.value;
      if (searchClear) searchClear.hidden = !searchQ;
      applyFilters();
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", function () {
      if (searchInput) { searchInput.value = ""; searchQ = ""; }
      searchClear.hidden = true;
      applyFilters();
    });
  }

  // Ultra toggle
  var ultraToggle = document.getElementById("gallery-ultra-toggle");
  function syncUltraBtn() {
    if (!ultraToggle) return;
    ultraToggle.textContent = hideUltra ? "Masquer Ultra" : "Afficher Ultra";
    ultraToggle.classList.toggle("active", hideUltra);
  }
  if (ultraToggle) {
    ultraToggle.addEventListener("click", function() {
      hideUltra = !hideUltra;
      syncUltraBtn();
      applyFilters();
    });
  }
  syncUltraBtn();

  // Irréaliste toggle
  var irrealisteToggle = document.getElementById("gallery-irrealiste-toggle");
  function syncIrrealisteBtn() {
    if (!irrealisteToggle) return;
    irrealisteToggle.textContent = hideIrrealiste ? "Masquer Irr\u00e9aliste" : "Afficher Irr\u00e9aliste";
    irrealisteToggle.classList.toggle("active", hideIrrealiste);
  }
  if (irrealisteToggle) {
    irrealisteToggle.addEventListener("click", function() {
      hideIrrealiste = !hideIrrealiste;
      syncIrrealisteBtn();
      applyFilters();
    });
  }
  syncIrrealisteBtn();

  // Reset filters
  var resetFiltersBtn = document.getElementById("gallery-reset-filters");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", function() {
      // Revient aux reglages de compte (voir /favoris > Parametres)
      hideUltra = (window.ULTRA_MODE || "hidden") === "hidden";
      hideIrrealiste = (window.IRREALISTE_MODE || "visible") === "hidden";
      syncUltraBtn();
      syncIrrealisteBtn();
      // Effacer type
      typeState = 0; typeValue = "";
      if (typeFilter) {
        typeFilter.querySelectorAll(".tag-chip").forEach(function(c) {
          c.dataset.state = "0";
          c.classList.remove("chip-include","chip-exclude");
        });
      }
      // Effacer catégorie
      activeCategory = "";
      if (categoryFilter) {
        categoryFilter.querySelectorAll(".tag-chip").forEach(function(c) { c.classList.remove("active"); });
      }
      // Effacer tags
      tagStates = {};
      if (tagFilter) {
        tagFilter.querySelectorAll(".wiki-tag-chip").forEach(function(c) {
          c.dataset.state = "0";
          c.classList.remove("chip-include","chip-exclude");
        });
      }
      // Effacer recherche
      searchQ = "";
      if (searchInput) { searchInput.value = ""; }
      if (searchClear) searchClear.hidden = true;
      applyFilters();
    });
  }

  // Sort
  var sortSelect = document.getElementById("gallery-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      if (sortSelect.value === "random") randomSeeds = null; // nouveau mélange
      sortMode = sortSelect.value;
      currentPage = 0;
      sortCards();
    });
  }

  // Taille des cartes
  var sizeSelect = document.getElementById("gallery-size-select");
  var SIZES = { small: "120px", medium: "180px", large: "240px", xlarge: "320px" };
  function applySize(val) {
    if (grid) grid.style.setProperty("--gallery-card-min", SIZES[val] || "180px");
    localStorage.setItem("gallery-size", val);
  }
  if (sizeSelect) {
    var savedSize = localStorage.getItem("gallery-size") || "medium";
    sizeSelect.value = savedSize;
    applySize(savedSize);
    sizeSelect.addEventListener("change", function() { applySize(sizeSelect.value); });
  }

  // Support ?tag= URL param (navigation depuis un tag wiki)
  var _urlGalleryTag = new URLSearchParams(window.location.search).get("tag");
  if (_urlGalleryTag && tagFilter) {
    var _gtBtn = tagFilter.querySelector('[data-tag="' + _urlGalleryTag.toLowerCase() + '"]');
    if (_gtBtn) {
      var _t = _urlGalleryTag.toLowerCase();
      tagStates[_t] = 1;
      _gtBtn.dataset.state = "1";
      _gtBtn.classList.add("chip-include");
    }
  }

  applyFilters();

  // ══════════════════════════════════════════════════
  // 4. LIGHTBOX
  // ══════════════════════════════════════════════════
  var lightbox  = document.getElementById("gallery-lightbox");
  var lbImg     = lightbox ? lightbox.querySelector(".gallery-lb-img")       : null;
  var lbDots    = document.getElementById("gallery-lb-dots");
  var lbTags    = lightbox ? lightbox.querySelector(".gallery-lb-tags")      : null;
  var lbLink    = lightbox ? lightbox.querySelector(".gallery-lb-wiki-btn")  : null;
  var lbNotes   = lightbox ? lightbox.querySelector(".gallery-lb-notes")     : null;
  var lbClose   = lightbox ? lightbox.querySelector(".gallery-lb-close")     : null;
  var lbPrev    = lightbox ? lightbox.querySelector(".gallery-lb-prev")      : null;
  var lbNext    = lightbox ? lightbox.querySelector(".gallery-lb-next")      : null;
  var lbActions    = document.getElementById("gallery-lb-actions");
  var lbRating     = document.getElementById("gallery-lb-rating");
  var lbFavBtn     = document.getElementById("gallery-lb-fav-btn");
  var lbEditBtn    = document.getElementById("gallery-lb-edit-btn");
  var lbProcessBtn = document.getElementById("gallery-lb-processed-btn");
  var lbSeriesNav  = document.getElementById("gallery-lb-series-nav");
  var lbSeriesInfo = document.getElementById("gallery-lb-series-info");
  var lbSeriesPrev = document.getElementById("gallery-lb-series-prev");
  var lbSeriesNext = document.getElementById("gallery-lb-series-next");

  var lbVisible    = [];
  var lbCardIndex  = 0;
  var lbImgIndex   = 0;
  var lbCurrentSeriesNav = null; // {seriesId, prevId, nextId, position, total, seriesTitle}

  function buildVisible() {
    if (!grid) return;
    lbVisible = Array.from(grid.querySelectorAll(".gallery-card:not([hidden])"));
  }

  function currentCard() { return lbVisible[lbCardIndex]; }
  function currentImages() {
    var card = currentCard();
    return card ? (card.dataset.images || "").split("|").filter(Boolean) : [];
  }

  var lastTrackedGalleryId = null;

  function renderLightbox() {
    var card = currentCard();
    if (!lightbox || !card) return;
    var images  = currentImages();
    var src          = images[lbImgIndex] || "";
    var displayTitle = card.dataset.displayTitle || card.dataset.title || "";
    var tags         = (card.dataset.tags || "").split("|").filter(Boolean);
    var wikiId       = card.dataset.wikiId || "";
    var galleryId    = card ? Number(card.dataset.galleryId) : 0;

    if (lbImg) lbImg.src = src;
    if (lbTags) {
      lbTags.innerHTML = tags.map(function(t) { return window.buildTagBadgeHTML(t); }).join("");
    }
    if (lbLink) {
      lbLink.hidden = !wikiId;
      if (wikiId) {
        lbLink.href = "/wiki/" + wikiId;
        lbLink.textContent = displayTitle ? "Wiki : " + displayTitle : "Voir la page wiki";
      }
    }

    // Auteur / parodie
    var author = card.dataset.author || "";
    var parody = card.dataset.parody || "";
    if (lbNotes) {
      lbNotes.innerHTML = "";
      if (author) {
        var p = document.createElement("span");
        p.className = "gallery-lb-meta-pill";
        p.textContent = "Auteur : " + author;
        lbNotes.appendChild(p);
      }
      if (parody) {
        var q = document.createElement("span");
        q.className = "gallery-lb-meta-pill";
        q.textContent = "Parodie : " + parody;
        lbNotes.appendChild(q);
      }
    }

    if (lbDots) {
      lbDots.innerHTML = "";
      lbDots.hidden = images.length <= 1;
      images.forEach(function (_, i) {
        var d = document.createElement("button");
        d.type = "button";
        d.className = "gallery-lb-dot" + (i === lbImgIndex ? " active" : "");
        d.addEventListener("click", function () { lbImgIndex = i; renderLightbox(); });
        lbDots.appendChild(d);
      });
    }

    var atFirst = lbCardIndex === 0 && lbImgIndex === 0;
    var atLast  = lbCardIndex === lbVisible.length - 1 && lbImgIndex === images.length - 1;
    if (lbPrev) lbPrev.hidden = atFirst;
    if (lbNext) lbNext.hidden = atLast;

    // Série : charger la nav si l'image appartient à une série
    lbCurrentSeriesNav = null;
    if (lbSeriesNav) lbSeriesNav.hidden = true;
    var seriesIds = (card.dataset.series || "").split(",").map(Number).filter(Boolean);
    if (galleryId && seriesIds.length) {
      var sid = seriesIds[0];
      fetch("/galerie/series-nav?galleryId=" + galleryId + "&seriesId=" + sid)
        .then(function (r) { return r.json(); })
        .then(function (nav) {
          if (!nav) return;
          lbCurrentSeriesNav = nav;
          if (lbSeriesInfo) lbSeriesInfo.textContent = nav.seriesTitle + "\u00a0(" + nav.position + "\u00a0/\u00a0" + nav.total + ")";
          if (lbSeriesPrev) lbSeriesPrev.hidden = nav.prevId == null;
          if (lbSeriesNext) lbSeriesNext.hidden = nav.nextId == null;
          if (lbSeriesNav) lbSeriesNav.hidden = false;
        })
        .catch(function () {});
    }

    // Track view pour les images de galerie (une fois par item par session lightbox)
    var galleryIdStr = card.dataset.galleryId || "";
    if (galleryIdStr && galleryIdStr !== lastTrackedGalleryId) {
      lastTrackedGalleryId = galleryIdStr;
      fetch("/galerie/" + galleryIdStr + "/view", { method: "POST" }).catch(function(){});
    }

    // Actions : rating, fav, edit (uniquement pour les images de galerie avec ID)
    if (lbActions) {
      lbActions.hidden = !galleryId;
      if (galleryId) {
        // Rating
        var rating = Number(card.dataset.rating) || 0;
        if (lbRating) {
          lbRating.dataset.galleryId = galleryId;
          lbRating.querySelectorAll(".gallery-star").forEach(function(s, i) {
            s.classList.toggle("filled", i < rating);
          });
        }
        // Fav
        if (lbFavBtn) {
          lbFavBtn.dataset.itemId = galleryId;
          lbFavBtn.classList.toggle("active", card.dataset.fav === "1");
        }
        // Edit + Processed
        if (lbEditBtn) {
          lbEditBtn.dataset.galleryId = galleryId;
          lbEditBtn.dataset.isBd = card.dataset.type === "bd" ? "1" : "0";
        }
        if (lbProcessBtn) {
          lbProcessBtn.dataset.galleryId = galleryId;
          lbProcessBtn.hidden = !window.GALLERY_CAN_EDIT;
          lbProcessBtn.textContent = card.dataset.processed === "1" ? "Retirer trait\u00e9" : "Marquer trait\u00e9";
        }
      }
    }
  }

  function openLightbox(cardIdx, imgIdx) {
    if (!lightbox || !lbVisible.length) return;
    lbCardIndex = Math.max(0, Math.min(cardIdx, lbVisible.length - 1));
    var images = currentImages();
    lbImgIndex = Math.max(0, Math.min(imgIdx || 0, Math.max(images.length - 1, 0)));
    renderLightbox();
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.style.overflow = "";
    lastTrackedGalleryId = null;
    if (lbImg) lbImg.src = "";
  }

  function navigate(dir) {
    var images = currentImages();
    var nextImgIdx = lbImgIndex + dir;
    if (nextImgIdx >= 0 && nextImgIdx < images.length) {
      lbImgIndex = nextImgIdx;
      renderLightbox();
      return;
    }
    var nextCardIdx = lbCardIndex + dir;
    if (nextCardIdx < 0 || nextCardIdx >= lbVisible.length) return;
    lbCardIndex = nextCardIdx;
    var nextImages = currentImages();
    lbImgIndex = dir > 0 ? 0 : Math.max(nextImages.length - 1, 0);
    renderLightbox();
  }

  // Naviguer vers un gallery item par son ID (pour la nav série)
  function openLightboxByGalleryId(galleryId) {
    if (!galleryId) return;
    // Chercher d'abord dans les cartes visibles
    var idx = lbVisible.findIndex(function (c) { return Number(c.dataset.galleryId) === galleryId; });
    if (idx !== -1) { openLightbox(idx, 0); return; }
    // Si pas visible (filtré), chercher dans tout le DOM
    var card = document.querySelector(".gallery-card[data-gallery-id='" + galleryId + "']");
    if (!card) return;
    // Ouvrir temporairement en ajoutant la carte au tableau visible
    var prev = lbVisible;
    lbVisible = [card];
    openLightbox(0, 0);
    lbVisible = prev;
  }

  if (lbClose)  lbClose.addEventListener("click", closeLightbox);
  if (lbPrev)   lbPrev.addEventListener("click", function(){ navigate(-1); });
  if (lbNext)   lbNext.addEventListener("click", function(){ navigate(1);  });
  if (lbSeriesPrev) lbSeriesPrev.addEventListener("click", function () {
    if (lbCurrentSeriesNav && lbCurrentSeriesNav.prevId != null) openLightboxByGalleryId(lbCurrentSeriesNav.prevId);
  });
  if (lbSeriesNext) lbSeriesNext.addEventListener("click", function () {
    if (lbCurrentSeriesNav && lbCurrentSeriesNav.nextId != null) openLightboxByGalleryId(lbCurrentSeriesNav.nextId);
  });
  if (lightbox) {
    lightbox.addEventListener("click", function(e) {
      if (e.target === lightbox) closeLightbox();
    });
  }

  // Rating in lightbox
  if (lbRating) {
    lbRating.addEventListener("click", function(e) {
      var star = e.target.closest(".gallery-star");
      if (!star) return;
      var galleryId = Number(lbRating.dataset.galleryId);
      if (!galleryId) return;
      var val = Number(star.dataset.val);
      var current = lbRating.querySelectorAll(".gallery-star.filled").length;
      var newRating = current === val ? 0 : val;
      fetch("/galerie/" + galleryId + "/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: newRating }),
      }).then(function(r){ return r.json(); }).then(function(data){
        if (data.ok) {
          lbRating.querySelectorAll(".gallery-star").forEach(function(s, i){ s.classList.toggle("filled", i < newRating); });
          var card = currentCard();
          if (card) card.dataset.rating = newRating;
        }
      });
    });
  }

  // Fav in lightbox
  if (lbFavBtn) {
    lbFavBtn.addEventListener("click", function() {
      var itemId = Number(lbFavBtn.dataset.itemId);
      if (!itemId) return;
      var isActive = lbFavBtn.classList.contains("active");
      fetch("/favoris/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_type: "gallery", item_id: itemId, action: isActive ? "remove" : "add" }),
      }).then(function(r){ return r.json(); }).then(function(data){
        if (data.ok) {
          lbFavBtn.classList.toggle("active", !isActive);
          var card = currentCard();
          if (card) card.dataset.fav = isActive ? "0" : "1";
        }
      });
    });
  }

  // Edit in lightbox — ouvre le quick-edit panel
  if (lbEditBtn) {
    lbEditBtn.addEventListener("click", function() {
      var galleryId = Number(lbEditBtn.dataset.galleryId);
      var isBd = lbEditBtn.dataset.isBd === "1";
      var card = currentCard();
      openQuickEdit(galleryId, isBd, card);
    });
  }

  // Processed toggle in lightbox
  if (lbProcessBtn) {
    lbProcessBtn.addEventListener("click", function() {
      var galleryId = Number(lbProcessBtn.dataset.galleryId);
      if (!galleryId) return;
      fetch("/galerie/" + galleryId + "/processed", { method: "POST" })
        .then(function(r){ return r.json(); })
        .then(function(data){
          if (!data.ok) return;
          var card = currentCard();
          if (card) {
            card.dataset.processed = data.processed ? "1" : "0";
            // Mise à jour du badge sur la carte
            var badge = card.querySelector(".gallery-processed-badge");
            if (data.processed && !badge) {
              var b = document.createElement("span");
              b.className = "gallery-processed-badge";
              card.insertBefore(b, card.firstChild);
            } else if (!data.processed && badge) {
              badge.remove();
            }
          }
          lbProcessBtn.textContent = data.processed ? "Retirer trait\u00e9" : "Marquer trait\u00e9";
        });
    });
  }

  document.addEventListener("keydown", function (e) {
    if (!lightbox || lightbox.hidden) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  navigate(-1);
    if (e.key === "ArrowRight") navigate(1);
  });

  var touchStartX = 0;
  if (lightbox) {
    lightbox.addEventListener("touchstart", function(e){ touchStartX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener("touchend", function(e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    });
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var card = e.target.closest(".gallery-card");
      if (!card) return;
      if (e.target.closest("a, button, form, label, input")) return;
      buildVisible();
      var idx = lbVisible.indexOf(card);
      if (idx !== -1) openLightbox(idx, 0);
    });
  }

  // ══════════════════════════════════════════════════
  // 5. SÉLECTION GROUPÉE
  // ══════════════════════════════════════════════════
  (function () {
    var selectToggle = document.getElementById("gallery-select-toggle");
    var bulkBar       = document.getElementById("gallery-bulk-bar");
    var bulkCount     = document.getElementById("gallery-bulk-count");
    var bulkCancel    = document.getElementById("gallery-bulk-cancel");
    var bulkDelete    = document.getElementById("gallery-bulk-delete");
    var bulkUltraOn   = document.getElementById("gallery-bulk-ultra-on");
    var bulkUltraOff  = document.getElementById("gallery-bulk-ultra-off");
    if (!grid || !bulkBar) return;

    var checkboxes = Array.from(grid.querySelectorAll(".gallery-select-input"));
    if (selectToggle) selectToggle.hidden = checkboxes.length === 0;

    if (selectToggle) {
      selectToggle.addEventListener("click", function() {
        grid.classList.toggle("gallery-selecting");
        selectToggle.textContent = grid.classList.contains("gallery-selecting") ? "Annuler s\u00e9lection" : "S\u00e9lectionner";
      });
    }

    function selectedIds() {
      return checkboxes.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
    }

    function syncBar() {
      var ids = selectedIds();
      bulkBar.hidden = ids.length === 0;
      if (bulkCount) bulkCount.textContent = ids.length + " s\u00e9lectionn\u00e9e" + (ids.length > 1 ? "s" : "");
    }

    checkboxes.forEach(function (cb) { cb.addEventListener("change", syncBar); });

    if (bulkCancel) {
      bulkCancel.addEventListener("click", function () {
        checkboxes.forEach(function (cb) { cb.checked = false; });
        syncBar();
        grid.classList.remove("gallery-selecting");
        if (selectToggle) selectToggle.textContent = "S\u00e9lectionner";
      });
    }

    function runBulk(action) {
      var ids = selectedIds();
      if (!ids.length) return;
      fetch("/galerie/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids, action: action }),
      }).then(function () { window.location.reload(); });
    }

    if (bulkDelete)  bulkDelete.addEventListener("click", function () { if (window.confirm("Supprimer les images s\u00e9lectionn\u00e9es ?")) runBulk("delete"); });
    if (bulkUltraOn)  bulkUltraOn.addEventListener("click", function () { runBulk("ultra-on"); });
    if (bulkUltraOff) bulkUltraOff.addEventListener("click", function () { runBulk("ultra-off"); });
  })();

  // ══════════════════════════════════════════════════
  // 6. ÉDITION RAPIDE (admin)
  // ══════════════════════════════════════════════════
  var quickEditPanel = null;
  var quickEditCurrentId = null;

  function buildQuickEditPanel() {
    if (quickEditPanel) return;
    quickEditPanel = document.createElement("div");
    quickEditPanel.className = "gallery-qedit-panel";
    quickEditPanel.innerHTML = [
      '<div class="gallery-qedit-inner">',
        '<button type="button" class="gallery-qedit-close">&times;</button>',
        '<div class="gallery-qedit-bd-fields" hidden>',
          '<input type="text" class="gallery-qedit-title wiki-title-input" placeholder="Titre\u2026" />',
          '<textarea class="gallery-qedit-notes wiki-textarea" rows="2" placeholder="Notes\u2026"></textarea>',
        '</div>',
        '<div class="gallery-lb-meta-tags gallery-qedit-tags"></div>',
        '<div class="gallery-lb-meta-tag-edit">',
          '<input type="text" class="gallery-qedit-tag-input wiki-lb-meta-tag-input" placeholder="Ajouter un tag\u2026" autocomplete="off" />',
        '</div>',
        '<input type="text" class="gallery-qedit-author wiki-title-input" placeholder="Auteur\u2026" autocomplete="off" />',
        '<input type="text" class="gallery-qedit-parody wiki-title-input" placeholder="Parodie\u2026" autocomplete="off" />',
        '<div class="gallery-qedit-actions">',
          '<button type="button" class="gallery-qedit-save gallery-submit-btn">Enregistrer</button>',
          '<button type="button" class="gallery-qedit-cancel link-button">Annuler</button>',
        '</div>',
      '</div>',
    ].join("");
    document.body.appendChild(quickEditPanel);
    quickEditPanel.hidden = true;

    var qClose    = quickEditPanel.querySelector(".gallery-qedit-close");
    var qCancel   = quickEditPanel.querySelector(".gallery-qedit-cancel");
    var qSave     = quickEditPanel.querySelector(".gallery-qedit-save");
    var qTagInput = quickEditPanel.querySelector(".gallery-qedit-tag-input");
    var qTagsEl   = quickEditPanel.querySelector(".gallery-qedit-tags");

    function closeQEdit() { quickEditPanel.hidden = true; quickEditCurrentId = null; }
    if (qClose)  qClose.addEventListener("click", closeQEdit);
    if (qCancel) qCancel.addEventListener("click", closeQEdit);
    quickEditPanel.addEventListener("click", function(e) { if (e.target === quickEditPanel) closeQEdit(); });

    if (qTagInput) {
      qTagInput.addEventListener("keydown", function(e) {
        if ((e.key === "Enter" || e.key === ",") && qTagInput.value.trim()) {
          e.preventDefault();
          addQEditTag(qTagInput.value.trim());
          qTagInput.value = "";
        }
      });
    }

    if (qSave) {
      qSave.addEventListener("click", function() {
        if (!quickEditCurrentId) return;
        var tags = Array.from(qTagsEl.querySelectorAll(".wiki-lb-tag-chip")).map(function(c){ return c.dataset.tag; }).filter(Boolean);
        var author = quickEditPanel.querySelector(".gallery-qedit-author").value.trim();
        var parody = quickEditPanel.querySelector(".gallery-qedit-parody").value.trim();
        var isBd = quickEditPanel.dataset.isBd === "1";
        var body = { id: quickEditCurrentId, tags: tags, author: author, parody: parody };
        if (isBd) {
          body.title = quickEditPanel.querySelector(".gallery-qedit-title").value.trim();
          body.notes = quickEditPanel.querySelector(".gallery-qedit-notes").value.trim();
        }
        fetch("/galerie/image-meta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(function(r){ return r.json(); }).then(function(data){
          if (data.ok) closeQEdit();
        });
      });
    }
  }

  function addQEditTag(tag) {
    if (!quickEditPanel) return;
    var qTagsEl = quickEditPanel.querySelector(".gallery-qedit-tags");
    var existing = Array.from(qTagsEl.querySelectorAll(".wiki-lb-tag-chip")).map(function(c){ return c.dataset.tag; });
    if (existing.indexOf(tag) !== -1) return;
    var chip = document.createElement("span");
    chip.className = "wiki-lb-tag-chip";
    chip.dataset.tag = tag;
    chip.textContent = tag;
    var rm = document.createElement("button");
    rm.type = "button"; rm.className = "wiki-lb-tag-rm"; rm.innerHTML = "&times;";
    rm.addEventListener("click", function() { chip.remove(); });
    chip.appendChild(rm);
    qTagsEl.appendChild(chip);
  }

  function openQuickEdit(galleryId, isBd, card) {
    buildQuickEditPanel();
    quickEditCurrentId = galleryId;
    quickEditPanel.dataset.isBd = isBd ? "1" : "0";
    var qTagsEl = quickEditPanel.querySelector(".gallery-qedit-tags");
    qTagsEl.innerHTML = "";
    quickEditPanel.querySelector(".gallery-qedit-author").value = "";
    quickEditPanel.querySelector(".gallery-qedit-parody").value = "";
    var bdFields = quickEditPanel.querySelector(".gallery-qedit-bd-fields");
    bdFields.hidden = !isBd;
    if (isBd) {
      quickEditPanel.querySelector(".gallery-qedit-title").value = card ? (card.dataset.title || "") : "";
      quickEditPanel.querySelector(".gallery-qedit-notes").value = "";
    }
    var src = card ? (card.dataset.images || "").split("|")[0] : "";
    if (src) {
      fetch("/galerie/image-meta?src=" + encodeURIComponent(src))
        .then(function(r){ return r.json(); })
        .then(function(meta){
          if (!meta) return;
          (meta.tags || []).forEach(function(t){ addQEditTag(t); });
          quickEditPanel.querySelector(".gallery-qedit-author").value = meta.author || "";
          quickEditPanel.querySelector(".gallery-qedit-parody").value = meta.parody || "";
        });
    }
    quickEditPanel.hidden = false;
  }

  if (grid) {
    grid.addEventListener("click", function(e) {
      var btn = e.target.closest(".gallery-quick-edit-btn");
      if (!btn) return;
      e.stopPropagation();
      var card = btn.closest(".gallery-card");
      openQuickEdit(Number(btn.dataset.galleryId), btn.dataset.isBd === "1", card);
    });
  }

  // Sur desktop, le volet filtre est ouvert par défaut
  if (window.innerWidth >= 641) {
    document.querySelectorAll(".wiki-sidebar-filter-details").forEach(function (el) {
      el.setAttribute("open", "");
    });
  }

})();
