// ── Filtrage BD (sidebar) ─────────────────────────────────────────────────
(function() {
  var grid     = document.getElementById("bd-grid");
  var cards    = grid ? Array.from(grid.querySelectorAll(".bd-card")) : [];
  var countEl  = document.getElementById("bd-count-hero");
  var resultEl = document.getElementById("bd-result-count");
  var searchInput = document.getElementById("bd-search");
  var searchClear = document.getElementById("bd-search-clear");
  var tagFilter   = document.getElementById("bd-tag-filter");

  var activeTags   = [];
  var searchQ      = "";
  // Etat initial derive du reglage de compte (voir /favoris > Parametres).
  var showUltra      = (window.ULTRA_MODE || "hidden") !== "hidden";
  var showIrrealiste = (window.IRREALISTE_MODE || "visible") !== "hidden";
  var activeLangue = "";
  var showCouleurOnly = false;

  function hasActiveFilter() {
    return activeTags.length > 0 || searchQ || activeLangue || showCouleurOnly;
  }

  function updateCount(visible) {
    if (countEl) countEl.textContent = visible;
    if (resultEl) {
      if (hasActiveFilter()) {
        resultEl.textContent = visible + " résultat" + (visible !== 1 ? "s" : "");
        resultEl.hidden = false;
      } else {
        resultEl.hidden = true;
      }
    }
  }

  function applyFilters() {
    var visible = 0;
    cards.forEach(function(card) {
      var tags    = (card.dataset.tags || "").split(",").filter(Boolean);
      var title   = card.dataset.title || "";
      var ultra      = card.dataset.ultra === "1";
      var irrealiste = card.dataset.irrealiste === "1";
      var langue  = card.dataset.langue || "";
      var couleur = card.dataset.couleur === "1";

      var okTags    = activeTags.length === 0 || activeTags.every(function(t) { return tags.indexOf(t) !== -1; });
      var okSearch  = !searchQ || title.indexOf(searchQ) !== -1;
      var okUltra   = showUltra || !ultra;
      var okIrrealiste = showIrrealiste || !irrealiste;
      var okLangue  = !activeLangue || langue === activeLangue;
      var okCouleur = !showCouleurOnly || couleur;

      if (okTags && okSearch && okUltra && okIrrealiste && okLangue && okCouleur) { card.style.display = ""; visible++; }
      else                                                         { card.style.display = "none"; }
    });
    updateCount(visible);
  }

  // Tags
  if (tagFilter) {
    tagFilter.addEventListener("click", function(e) {
      var chip = e.target.closest(".wiki-tag-chip");
      if (!chip) return;
      var tag = chip.dataset.tag;
      var idx = activeTags.indexOf(tag);
      if (idx === -1) { activeTags.push(tag); chip.dataset.state = "1"; chip.classList.add("active"); }
      else            { activeTags.splice(idx, 1); chip.dataset.state = "0"; chip.classList.remove("active"); }
      applyFilters();
    });
  }

  // Search
  if (searchInput) {
    searchInput.addEventListener("input", function() {
      searchQ = searchInput.value.toLowerCase().trim();
      if (searchClear) searchClear.hidden = !searchQ;
      applyFilters();
    });
    if (searchClear) {
      searchClear.addEventListener("click", function() {
        searchInput.value = "";
        searchQ = "";
        searchClear.hidden = true;
        applyFilters();
      });
    }
  }

  // Langue
  var langueFilter = document.getElementById("bd-langue-filter");
  if (langueFilter) {
    langueFilter.addEventListener("click", function(e) {
      var chip = e.target.closest(".bd-langue-chip");
      if (!chip) return;
      var lng = chip.dataset.langue;
      if (activeLangue === lng) {
        activeLangue = "";
        langueFilter.querySelectorAll(".bd-langue-chip").forEach(function(c) { c.classList.remove("active"); });
      } else {
        activeLangue = lng;
        langueFilter.querySelectorAll(".bd-langue-chip").forEach(function(c) { c.classList.remove("active"); });
        chip.classList.add("active");
      }
      applyFilters();
    });
  }

  // Couleur toggle
  var couleurBtn = document.getElementById("bd-couleur-toggle");
  if (couleurBtn) {
    couleurBtn.addEventListener("click", function() {
      showCouleurOnly = !showCouleurOnly;
      couleurBtn.classList.toggle("active", showCouleurOnly);
      applyFilters();
    });
  }

  // Ultra toggle
  var ultraBtn = document.getElementById("bd-ultra-toggle");
  if (ultraBtn) {
    ultraBtn.textContent = showUltra ? "\uD83D\uDD13 Afficher Ultra" : "\uD83D\uDD12 Masquer Ultra";
    ultraBtn.addEventListener("click", function() {
      showUltra = !showUltra;
      ultraBtn.textContent = showUltra ? "\uD83D\uDD13 Afficher Ultra" : "\uD83D\uDD12 Masquer Ultra";
      applyFilters();
    });
  }

  // Irr\u00E9aliste toggle
  var irrealisteBtn = document.getElementById("bd-irrealiste-toggle");
  if (irrealisteBtn) {
    irrealisteBtn.textContent = showIrrealiste ? "\uD83D\uDD13 Afficher Irr\u00E9aliste" : "\uD83D\uDD12 Masquer Irr\u00E9aliste";
    irrealisteBtn.addEventListener("click", function() {
      showIrrealiste = !showIrrealiste;
      irrealisteBtn.textContent = showIrrealiste ? "\uD83D\uDD13 Afficher Irr\u00E9aliste" : "\uD83D\uDD12 Masquer Irr\u00E9aliste";
      applyFilters();
    });
  }

  applyFilters();
})();

// ── Modal BD ──────────────────────────────────────────────────────────────────
(function() {
  var dataEl = document.getElementById("bd-data-json");
  if (!dataEl) return;

  var bdMap = {};
  try {
    JSON.parse(dataEl.textContent).forEach(function(b) { bdMap[b.id] = b; });
  } catch(_) { return; }

  var overlay  = document.getElementById("bd-modal");
  var closeBtn = document.getElementById("bd-modal-close");
  var coverImg = document.getElementById("bd-modal-cover");
  var titleEl  = document.getElementById("bd-modal-title");
  var descEl   = document.getElementById("bd-modal-desc");
  var tagsEl   = document.getElementById("bd-modal-tags");
  var reactEl  = document.getElementById("bd-modal-reactions");
  var previewEl= document.getElementById("bd-modal-preview");
  var previewWrap = document.getElementById("bd-modal-preview-wrap");
  var readBtn  = document.getElementById("bd-modal-read-btn");

  if (!overlay) return;

  function openModal(book) {
    // Cover
    if (book.imagePaths && book.imagePaths[0]) {
      coverImg.src = book.imagePaths[0];
      coverImg.style.display = "";
    } else {
      coverImg.style.display = "none";
    }

    // Infos
    titleEl.textContent = book.title;
    descEl.textContent  = book.description || "";
    descEl.style.display = book.description ? "" : "none";

    // Tags
    tagsEl.innerHTML = (book.tags || []).map(function(t) { return window.buildTagBadgeHTML(t); }).join("");

    // Réactions
    reactEl.textContent = "";
    function makeReactBadge(emoji, label) {
      var sp = document.createElement("span");
      sp.className = "bd-card-react-badge";
      sp.title = label;
      sp.textContent = emoji;
      return sp;
    }
    if (book.flame)      reactEl.appendChild(makeReactBadge("\uD83D\uDD25", "J\u2019adore"));
    if (book.interested) reactEl.appendChild(makeReactBadge("\u2728", "\u00C7a m\u2019int\u00E9resse"));
    if (book.rating > 0) {
      var ratingSpan = document.createElement("span");
      ratingSpan.className = "bd-modal-rating";
      var starsStr = "";
      for (var i = 1; i <= 5; i++) starsStr += (i <= book.rating ? "\u2605" : "\u2606");
      ratingSpan.textContent = starsStr;
      reactEl.appendChild(ratingSpan);
    }

    // Prévisualisation (max 10 images, sans la couverture)
    previewEl.innerHTML = "";
    var previews = book.imagePaths.slice(0, 10);
    previews.forEach(function(src, idx) {
      var thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "bd-modal-thumb" + (idx === 0 ? " bd-modal-thumb--cover" : "");
      thumb.title = "Page " + (idx + 1);
      var img = document.createElement("img");
      img.src = src;
      img.alt = "Page " + (idx + 1);
      img.loading = "lazy";
      var num = document.createElement("span");
      num.className = "bd-modal-thumb-num";
      num.textContent = idx + 1;
      thumb.appendChild(img);
      thumb.appendChild(num);
      thumb.addEventListener("click", function() {
        window.location.href = "/bd/" + book.id + "?start=" + idx;
      });
      previewEl.appendChild(thumb);
    });

    // "+N pages" si plus de 10
    if (book.totalPages > 10) {
      var more = document.createElement("span");
      more.className = "bd-modal-thumb-more";
      more.textContent = "+" + (book.totalPages - 10);
      previewEl.appendChild(more);
    }

    previewWrap.style.display = previews.length > 0 ? "" : "none";

    // Bouton lire
    readBtn.href = "/bd/" + book.id;

    // Ouvrir
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  // Interception des clics sur les cartes
  var grid = document.getElementById("bd-grid");
  if (grid) {
    grid.addEventListener("click", function(e) {
      var card = e.target.closest(".bd-card[data-bd-id]");
      if (!card) return;
      e.preventDefault();
      var book = bdMap[Number(card.dataset.bdId)];
      if (book) openModal(book);
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && !overlay.hidden) closeModal();
  });
})();

(function () {
  "use strict";

  // ══════════════════════════════════════════════════
  // TAG WIDGET (same as gallery.js)
  // ══════════════════════════════════════════════════
  function tagHue(tag) {
    var TAG_HUES = [4, 28, 48, 140, 175, 210, 270, 330];
    var h = 0, s = tag.toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TAG_HUES[Math.abs(h) % TAG_HUES.length];
  }

  document.querySelectorAll(".wiki-tags-widget").forEach(function (widget) {
    var board  = widget.querySelector(".wiki-tags-board");
    var typing = widget.querySelector(".wiki-tags-typing");
    var hidden = widget.querySelector(".wiki-tags-hidden");
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

    typing.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        var t = typing.value.trim();
        if (t && !tags.includes(t)) { tags.push(t); render(); }
        typing.value = "";
      } else if (e.key === "Backspace" && !typing.value && tags.length) {
        tags.pop();
        hidden.value = tags.join(", ");
        render();
      }
    });
    typing.addEventListener("blur", function () {
      var t = typing.value.trim();
      if (t && !tags.includes(t)) { tags.push(t); render(); }
      typing.value = "";
    });

    render();
  });

  // ══════════════════════════════════════════════════
  // DRAG-AND-DROP ORDER FOR EXISTING IMAGES
  // ══════════════════════════════════════════════════
  var sortGrid   = document.getElementById("bd-sort-grid");
  var orderInput = document.getElementById("bd-image-order");

  function syncOrder() {
    if (!sortGrid || !orderInput) return;
    var items = Array.from(sortGrid.querySelectorAll(".bd-sort-item:not(.bd-sort-item-removed)"));
    // Existing images: use their data-src. New images: use __new__:N
    var parts = items.map(function(item) {
      return item.dataset.src;
    });
    orderInput.value = parts.join(",");
    // Update numbering
    var num = 1;
    Array.from(sortGrid.querySelectorAll(".bd-sort-item")).forEach(function(item) {
      var n = item.querySelector(".bd-sort-num");
      var removed = item.classList.contains("bd-sort-item-removed");
      if (n) n.textContent = removed ? "✕" : num++;
    });
  }

  if (sortGrid) {
    var dragSrc = null;

    sortGrid.addEventListener("dragstart", function(e) {
      dragSrc = e.target.closest(".bd-sort-item");
      if (!dragSrc) return;
      dragSrc.classList.add("bd-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    sortGrid.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      var target = e.target.closest(".bd-sort-item");
      if (!target || target === dragSrc) return;
      sortGrid.querySelectorAll(".bd-sort-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      target.classList.add("bd-drop-over");
    });

    sortGrid.addEventListener("dragleave", function(e) {
      var target = e.target.closest(".bd-sort-item");
      if (target) target.classList.remove("bd-drop-over");
    });

    sortGrid.addEventListener("drop", function(e) {
      e.preventDefault();
      var target = e.target.closest(".bd-sort-item");
      if (!target || !dragSrc || target === dragSrc) return;
      sortGrid.querySelectorAll(".bd-sort-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      // Insert dragSrc before or after target
      var items = Array.from(sortGrid.querySelectorAll(".bd-sort-item"));
      var srcIdx = items.indexOf(dragSrc);
      var tgtIdx = items.indexOf(target);
      if (srcIdx < tgtIdx) {
        sortGrid.insertBefore(dragSrc, target.nextSibling);
      } else {
        sortGrid.insertBefore(dragSrc, target);
      }
      syncOrder();
    });

    sortGrid.addEventListener("dragend", function() {
      sortGrid.querySelectorAll(".bd-sort-item").forEach(function(el){
        el.classList.remove("bd-dragging");
        el.classList.remove("bd-drop-over");
      });
      dragSrc = null;
    });

    // Mark removed items
    sortGrid.querySelectorAll(".bd-remove-cb").forEach(function(cb) {
      cb.addEventListener("change", function() {
        var item = cb.closest(".bd-sort-item");
        if (item) item.classList.toggle("bd-sort-item-removed", cb.checked);
        syncOrder();
      });
    });

    syncOrder();
  }

  // ══════════════════════════════════════════════════
  // NEW IMAGE PREVIEWS WITH ORDERING
  // ══════════════════════════════════════════════════
  var fileInput   = document.getElementById("bd-file-input");
  var previewZone = document.getElementById("bd-new-previews");

  // Track order of new files as indices
  var newFileOrder = []; // array of original file indices in current order

  function syncNewOrder() {
    if (!orderInput || !previewZone) return;
    // Build order string: existing items first (from sortGrid), then new items
    var existingParts = [];
    if (sortGrid) {
      var items = Array.from(sortGrid.querySelectorAll(".bd-sort-item:not(.bd-sort-item-removed)"));
      existingParts = items.map(function(item) { return item.dataset.src; });
    }
    var newParts = newFileOrder.map(function(idx) { return "__new__:" + idx; });
    orderInput.value = existingParts.concat(newParts).join(",");

    // Update numbering on new previews
    var baseNum = existingParts.length;
    Array.from(previewZone.querySelectorAll(".bd-preview-item")).forEach(function(item, i) {
      var n = item.querySelector(".bd-sort-num");
      if (n) n.textContent = baseNum + i + 1;
    });
  }

  function buildPreviews(files) {
    if (!previewZone) return;
    previewZone.innerHTML = "";
    newFileOrder = files.map(function(_, i) { return i; });

    newFileOrder.forEach(function(origIdx) {
      var file = files[origIdx];
      var item = document.createElement("div");
      item.className = "bd-sort-item bd-preview-item";
      item.draggable = true;
      item.dataset.newIdx = origIdx;

      var handle = document.createElement("div");
      handle.className = "bd-sort-handle";
      handle.innerHTML = "&#8597;";

      var img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = "";
      img.className = "bd-sort-img";

      var num = document.createElement("span");
      num.className = "bd-sort-num";

      item.appendChild(handle);
      item.appendChild(img);
      item.appendChild(num);
      previewZone.appendChild(item);
    });

    // Drag for new previews
    var dragSrcNew = null;
    previewZone.addEventListener("dragstart", function(e) {
      dragSrcNew = e.target.closest(".bd-preview-item");
      if (dragSrcNew) dragSrcNew.classList.add("bd-dragging");
    });
    previewZone.addEventListener("dragover", function(e) {
      e.preventDefault();
      var target = e.target.closest(".bd-preview-item");
      if (!target || target === dragSrcNew) return;
      previewZone.querySelectorAll(".bd-preview-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      target.classList.add("bd-drop-over");
    });
    previewZone.addEventListener("drop", function(e) {
      e.preventDefault();
      var target = e.target.closest(".bd-preview-item");
      if (!target || !dragSrcNew || target === dragSrcNew) return;
      previewZone.querySelectorAll(".bd-preview-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      var items = Array.from(previewZone.querySelectorAll(".bd-preview-item"));
      var srcIdx = items.indexOf(dragSrcNew);
      var tgtIdx = items.indexOf(target);
      if (srcIdx < tgtIdx) previewZone.insertBefore(dragSrcNew, target.nextSibling);
      else previewZone.insertBefore(dragSrcNew, target);
      // Rebuild newFileOrder from current DOM order
      newFileOrder = Array.from(previewZone.querySelectorAll(".bd-preview-item")).map(function(el) {
        return Number(el.dataset.newIdx);
      });
      syncNewOrder();
    });
    previewZone.addEventListener("dragend", function() {
      if (dragSrcNew) dragSrcNew.classList.remove("bd-dragging");
      previewZone.querySelectorAll(".bd-preview-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      dragSrcNew = null;
    });

    syncNewOrder();
  }

  if (fileInput) {
    fileInput.addEventListener("change", function() {
      buildPreviews(Array.from(fileInput.files || []));
    });
  }

})();
