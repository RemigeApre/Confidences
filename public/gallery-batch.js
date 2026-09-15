(function () {
  "use strict";

  // ── Couleurs de groupes ───────────────────────────
  var COLORS = ["#e05c5c","#5cb8e0","#6dd68a","#e0b85c","#c45ce0","#e09b5c","#5ce0c5","#e05c96"];

  // ── État ─────────────────────────────────────────
  var files      = [];   // [{ file, previewUrl, removed, el, fi }]
  var selected   = {};   // { idx: true }
  var groups     = [];   // [{ id, label, color, extraTags, category, author, members: Set }]
  var nextGid    = 0;

  // ── DOM ──────────────────────────────────────────
  var dropzone     = document.getElementById("gb-dropzone");
  var fileTrigger  = document.getElementById("gb-file-trigger");
  var imgGrid      = document.getElementById("gb-img-grid");
  var imgSection   = document.getElementById("gb-images-section");
  var imgCountEl   = document.getElementById("gb-img-count");
  var groupsSec    = document.getElementById("gb-groups-section");
  var groupsList   = document.getElementById("gb-groups-list");
  var selBar       = document.getElementById("gb-sel-bar");
  var selCountEl   = document.getElementById("gb-sel-count");
  var newGroupBtn  = document.getElementById("gb-new-group-btn");
  var assignWrap   = document.getElementById("gb-assign-wrap");
  var assignSel    = document.getElementById("gb-assign-sel");
  var assignBtn    = document.getElementById("gb-assign-btn");
  var submitBtn    = document.getElementById("gb-submit-btn");
  var batchMeta    = document.getElementById("gb-batch-meta");
  var form         = document.getElementById("gb-form");
  var selAllBtn    = document.getElementById("gb-sel-all");
  var deselBtn     = document.getElementById("gb-desel-all");
  var tagsInput    = document.getElementById("gb-common-tags");
  var tagSuggest   = document.getElementById("gb-tag-suggest");

  // ── Tag suggestions pour le champ commun ─────────
  if (tagSuggest && tagsInput) {
    tagSuggest.addEventListener("click", function (e) {
      var chip = e.target.closest(".gb-tag-chip");
      if (!chip) return;
      var tag = chip.dataset.tag;
      var current = tagsInput.value.split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
      if (current.indexOf(tag) === -1) {
        tagsInput.value = current.concat(tag).join(", ");
      }
    });
  }

  // ── Sélection de fichiers ─────────────────────────
  dropzone.addEventListener("click", function () { fileTrigger.click(); });
  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropzone.classList.add("gb-dz--active");
  });
  ["dragleave", "dragend"].forEach(function (ev) {
    dropzone.addEventListener(ev, function () { dropzone.classList.remove("gb-dz--active"); });
  });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropzone.classList.remove("gb-dz--active");
    addFiles(Array.from(e.dataTransfer.files).filter(function (f) { return f.type.startsWith("image/"); }));
  });
  fileTrigger.addEventListener("change", function () {
    addFiles(Array.from(fileTrigger.files));
    fileTrigger.value = "";
  });

  function addFiles(newFiles) {
    newFiles.forEach(function (file) {
      var idx = files.length;
      var entry = { file: file, previewUrl: URL.createObjectURL(file), removed: false, el: null, fi: null };
      files.push(entry);
      var card = makeCard(idx, entry);
      entry.el = card;
      imgGrid.appendChild(card);
    });
    refreshUI();
  }

  // ── Carte image ──────────────────────────────────
  function makeCard(idx, entry) {
    var card = document.createElement("div");
    card.className = "gb-card";

    // Zone photo (cliquable pour sélectionner)
    var photo = document.createElement("div");
    photo.className = "gb-card-photo";

    var img = document.createElement("img");
    img.src = entry.previewUrl;
    img.className = "gb-card-img";
    img.alt = "";
    photo.appendChild(img);

    // Checkbox de sélection
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "gb-card-cb";
    cb.addEventListener("change", function () {
      if (cb.checked) selected[idx] = true; else delete selected[idx];
      refreshSelBar();
    });
    photo.appendChild(cb);

    // Bouton ×
    var rmBtn = document.createElement("button");
    rmBtn.type = "button";
    rmBtn.className = "gb-card-rm";
    rmBtn.title = "Retirer";
    rmBtn.textContent = "\u00d7";
    rmBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      entry.removed = true;
      entry.fi.disabled = true;
      delete selected[idx];
      groups.forEach(function (g) { g.members.delete(idx); });
      card.remove();
      refreshUI();
      refreshSelBar();
      refreshGroupCounts();
    });
    photo.appendChild(rmBtn);

    card.appendChild(photo);

    // Badges groupe
    var badges = document.createElement("div");
    badges.className = "gb-card-badges";
    card.appendChild(badges);

    // Click sur photo = toggle checkbox
    photo.addEventListener("click", function (e) {
      if (e.target === rmBtn || e.target === cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    });

    // Input fichier caché (soumis avec le form)
    var fi = document.createElement("input");
    fi.type = "file";
    fi.name = "images";
    fi.hidden = true;
    try { var dt = new DataTransfer(); dt.items.add(entry.file); fi.files = dt.files; } catch (_) {}
    card.appendChild(fi);
    entry.fi = fi;

    return card;
  }

  function updateCardBadges(idx) {
    var entry = files[idx];
    if (!entry || !entry.el) return;
    var badges = entry.el.querySelector(".gb-card-badges");
    if (!badges) return;
    while (badges.firstChild) badges.removeChild(badges.firstChild);
    groups.forEach(function (g) {
      if (!g.members.has(idx)) return;
      var dot = document.createElement("span");
      dot.className = "gb-badge-dot";
      dot.style.background = g.color;
      dot.title = g.label;
      badges.appendChild(dot);
    });
  }

  // ── Refresh global ────────────────────────────────
  function refreshUI() {
    var n = files.filter(function (f) { return !f.removed; }).length;
    imgCountEl.textContent = n;
    imgSection.hidden = n === 0;
    submitBtn.disabled = n === 0;
    submitBtn.textContent = "Envoyer\u00a0" + n + "\u00a0image" + (n > 1 ? "s" : "");
  }

  // ── Sélection ────────────────────────────────────
  function getSelected() {
    return Object.keys(selected).map(Number).filter(function (i) { return !files[i].removed; });
  }

  function clearSelection() {
    selected = {};
    files.forEach(function (entry) {
      if (!entry.el) return;
      var cb = entry.el.querySelector(".gb-card-cb");
      if (cb) cb.checked = false;
    });
    refreshSelBar();
  }

  function refreshSelBar() {
    var sel = getSelected();
    selBar.hidden = sel.length === 0;
    selCountEl.textContent = sel.length;
    if (groups.length > 0 && sel.length > 0) {
      assignWrap.hidden = false;
      while (assignSel.firstChild) assignSel.removeChild(assignSel.firstChild);
      groups.forEach(function (g) {
        var opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.label + "\u00a0(" + g.members.size + ")";
        assignSel.appendChild(opt);
      });
    } else {
      assignWrap.hidden = true;
    }
  }

  selAllBtn.addEventListener("click", function () {
    files.forEach(function (entry, idx) {
      if (entry.removed) return;
      selected[idx] = true;
      var cb = entry.el && entry.el.querySelector(".gb-card-cb");
      if (cb) cb.checked = true;
    });
    refreshSelBar();
  });

  deselBtn.addEventListener("click", function () {
    selected = {};
    files.forEach(function (entry) {
      var cb = entry.el && entry.el.querySelector(".gb-card-cb");
      if (cb) cb.checked = false;
    });
    refreshSelBar();
  });

  // ── Groupes ──────────────────────────────────────
  newGroupBtn.addEventListener("click", function () {
    var sel = getSelected();
    if (!sel.length) return;
    createGroup(sel);
    clearSelection();
  });

  assignBtn.addEventListener("click", function () {
    var gid = Number(assignSel.value);
    var g = groups.find(function (gr) { return gr.id === gid; });
    if (!g) return;
    getSelected().forEach(function (idx) {
      g.members.add(idx);
      updateCardBadges(idx);
    });
    refreshGroupCounts();
    clearSelection();
  });

  function createGroup(memberIdxs) {
    var color = COLORS[groups.length % COLORS.length];
    var g = {
      id: nextGid++,
      label: "Groupe\u00a0" + (groups.length + 1),
      color: color,
      extraTags: "",
      category: "",
      author: "",
      members: new Set(memberIdxs),
    };
    groups.push(g);
    memberIdxs.forEach(function (idx) { updateCardBadges(idx); });
    var card = makeGroupCard(g);
    groupsList.appendChild(card);
    groupsSec.hidden = false;
    refreshSelBar();
  }

  function makeGroupCard(g) {
    var card = document.createElement("div");
    card.className = "gb-group";

    // En-tête
    var head = document.createElement("div");
    head.className = "gb-group-head";

    var dot = document.createElement("span");
    dot.className = "gb-group-dot";
    dot.style.background = g.color;

    var labelEl = document.createElement("span");
    labelEl.className = "gb-group-label";
    labelEl.contentEditable = "true";
    labelEl.spellcheck = false;
    labelEl.textContent = g.label;
    labelEl.addEventListener("input", function () { g.label = labelEl.textContent.trim() || g.label; });

    var countEl = document.createElement("span");
    countEl.className = "gb-group-count";
    countEl.textContent = g.members.size + "\u00a0img.";
    g._countEl = countEl;

    var rmBtn = document.createElement("button");
    rmBtn.type = "button";
    rmBtn.className = "gb-group-rm";
    rmBtn.title = "Supprimer le groupe";
    rmBtn.textContent = "\u00d7";
    rmBtn.addEventListener("click", function () {
      groups = groups.filter(function (gr) { return gr.id !== g.id; });
      g.members.forEach(function (idx) { updateCardBadges(idx); });
      g.members.clear();
      card.remove();
      if (!groups.length) groupsSec.hidden = true;
      refreshSelBar();
    });

    head.appendChild(dot);
    head.appendChild(labelEl);
    head.appendChild(countEl);
    head.appendChild(rmBtn);
    card.appendChild(head);

    // Champs
    var fields = document.createElement("div");
    fields.className = "gb-group-fields";

    // Tags supplémentaires
    var tagsRow = document.createElement("div");
    tagsRow.className = "gb-field-row";
    var tagsLabel = document.createElement("label");
    tagsLabel.className = "gb-field-label";
    tagsLabel.textContent = "Tags suppl\u00e9mentaires";
    var tagsInput = document.createElement("input");
    tagsInput.type = "text";
    tagsInput.className = "gb-input";
    tagsInput.placeholder = "tag-extra1, tag-extra2\u2026";
    tagsInput.addEventListener("input", function () { g.extraTags = tagsInput.value; });
    tagsRow.appendChild(tagsLabel);
    tagsRow.appendChild(tagsInput);
    fields.appendChild(tagsRow);

    // Catégorie spécifique
    var catRow = document.createElement("div");
    catRow.className = "gb-field-row";
    var catLabel = document.createElement("label");
    catLabel.className = "gb-field-label";
    catLabel.textContent = "Cat\u00e9gorie (prioritaire)";
    var catSel = document.createElement("select");
    catSel.className = "gb-select";
    var opt0 = document.createElement("option");
    opt0.value = ""; opt0.textContent = "H\u00e9rite du commun";
    catSel.appendChild(opt0);
    (window.GB_CATEGORIES || []).forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.key; opt.textContent = c.label;
      catSel.appendChild(opt);
    });
    catSel.addEventListener("change", function () { g.category = catSel.value; });
    catRow.appendChild(catLabel);
    catRow.appendChild(catSel);
    fields.appendChild(catRow);

    // Auteur spécifique
    var authRow = document.createElement("div");
    authRow.className = "gb-field-row";
    var authLabel = document.createElement("label");
    authLabel.className = "gb-field-label";
    authLabel.textContent = "Auteur (prioritaire)";
    var authInput = document.createElement("input");
    authInput.type = "text";
    authInput.className = "gb-input";
    authInput.placeholder = "H\u00e9rite du commun\u2026";
    authInput.addEventListener("input", function () { g.author = authInput.value; });
    authRow.appendChild(authLabel);
    authRow.appendChild(authInput);
    fields.appendChild(authRow);

    card.appendChild(fields);
    return card;
  }

  function refreshGroupCounts() {
    groups.forEach(function (g) {
      g.members.forEach(function (idx) { if (files[idx] && files[idx].removed) g.members.delete(idx); });
      if (g._countEl) g._countEl.textContent = g.members.size + "\u00a0img.";
    });
  }

  // ── Soumission du formulaire ──────────────────────
  form.addEventListener("submit", function () {
    // Construire fileGroups : pour chaque fichier actif (dans l'ordre DOM),
    // la liste des IDs de groupe auxquels il appartient.
    var activeOrder = [];
    files.forEach(function (entry, idx) { if (!entry.removed) activeOrder.push(idx); });

    var fileGroups = activeOrder.map(function (origIdx) {
      var gids = [];
      groups.forEach(function (g) { if (g.members.has(origIdx)) gids.push(g.id); });
      return gids;
    });

    var groupsData = groups.map(function (g) {
      return { id: g.id, extraTags: g.extraTags, category: g.category, author: g.author };
    });

    batchMeta.value = JSON.stringify({ groups: groupsData, fileGroups: fileGroups });
  });

})();
