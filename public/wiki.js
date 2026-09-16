(function () {
  "use strict";

  // ══════════════════════════════════════════════════
  // 0. TODO-PANEL : cocher l'item si page vient d'être créée
  // ══════════════════════════════════════════════════
  (function () {
    var pending;
    try { pending = JSON.parse(sessionStorage.getItem("wiki-todo-pending") || "null"); } catch (_) { pending = null; }
    if (!pending) return;

    // On est sur une page détail si .wiki-detail-banner-title existe
    var titleEl = document.querySelector(".wiki-detail-banner-title");
    if (!titleEl) return;

    var pageTitle = titleEl.textContent.trim().toLowerCase();
    var pendingTitle = String(pending.title || "").trim().toLowerCase();
    if (pageTitle !== pendingTitle) return;

    // Correspondance : cocher l'item (= le supprimer de la liste)
    try { sessionStorage.removeItem("wiki-todo-pending"); } catch (_) {}
    try {
      var TODO_KEY = "wiki-todo-list";
      var d = JSON.parse(localStorage.getItem(TODO_KEY) || "{}");
      if (d[pending.catKey]) {
        d[pending.catKey] = d[pending.catKey].filter(function (t) {
          return t.trim().toLowerCase() !== pendingTitle;
        });
        localStorage.setItem(TODO_KEY, JSON.stringify(d));
      }
    } catch (_) {}
  })();

  // ══════════════════════════════════════════════════
  // 1. MARKDOWN RENDERER
  // ══════════════════════════════════════════════════
  function esc(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // Table titre (minuscules) → id, lue depuis #wiki-existing-pages si présent
  // sur la page (détail d'une page, formulaire d'édition/création).
  var wikiTitleMap = null;
  function getWikiTitleMap() {
    if (wikiTitleMap) return wikiTitleMap;
    wikiTitleMap = {};
    var el = document.getElementById("wiki-existing-pages");
    if (el) {
      try {
        JSON.parse(el.textContent || el.innerText).forEach(function (p) {
          wikiTitleMap[String(p.title).toLowerCase().trim()] = p.id;
        });
      } catch (_) {}
    }
    return wikiTitleMap;
  }

  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>")
      .replace(/`(.+?)`/g,       "<code>$1</code>")
      // [[Titre d'une autre page]] → lien élégant, intégrable dans une phrase
      .replace(/\[\[(.+?)\]\]/g, function (m, title) {
        var id = getWikiTitleMap()[title.toLowerCase().trim()];
        return id ? '<a class="wiki-inline-link" href="/wiki/' + id + '">' + title + '</a>' : title;
      });
  }
  // Rend une suite de lignes (déjà échappées) en HTML ; ## n'est pas géré
  // ici, il sert de séparateur de section plus haut dans renderMarkdown.
  function renderLines(lines) {
    var out = [], inList = false;
    function closeList() { if (inList) { out.push("</ul>"); inList = false; } }
    lines.forEach(function (line) {
      if      (/^### /.test(line))  { closeList(); out.push("<h3>" + inline(line.slice(4)) + "</h3>"); }
      else if (/^---+\s*$/.test(line)) { closeList(); out.push("<hr />"); }
      else if (/^- /.test(line))    { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + inline(line.slice(2)) + "</li>"); }
      else if (line.trim() === "")  { closeList(); }
      else                          { closeList(); out.push("<p>" + inline(line) + "</p>"); }
    });
    closeList();
    return out.join("\n");
  }

  // Un "## Titre" démarre une nouvelle section repliable (accordéon) ;
  // tout ce qui précède le premier "##" est la section principale,
  // toujours affichée, jamais repliable.
  function renderMarkdown(text) {
    if (!text) return "";
    var lines = text.split("\n");
    var sections = [{ heading: null, lines: [] }];
    lines.forEach(function (raw) {
      var line = esc(raw);
      if (/^## /.test(line)) {
        sections.push({ heading: inline(line.slice(3)), lines: [] });
      } else {
        sections[sections.length - 1].lines.push(line);
      }
    });
    return sections.map(function (sec, i) {
      var body = renderLines(sec.lines);
      if (i === 0) return body;
      return '<details class="wiki-section">' +
        '<summary class="wiki-section-summary">' + sec.heading + '</summary>' +
        '<div class="wiki-section-body">' + body + '</div>' +
      '</details>';
    }).join("\n");
  }

  // Convertit les <h2> du contenu HTML riche en sections accordéon (toutes fermées)
  function processH2Accordions(container) {
    var h2s = Array.prototype.slice.call(container.querySelectorAll("h2"));
    h2s.forEach(function (h2) {
      var details = document.createElement("details");
      details.className = "wiki-section";
      details.open = false;
      var summary = document.createElement("summary");
      summary.className = "wiki-section-summary";
      summary.innerHTML = h2.innerHTML;
      details.appendChild(summary);
      var body = document.createElement("div");
      body.className = "wiki-section-body";
      var next = h2.nextSibling;
      while (next && next.nodeName !== "H2") {
        var tmp = next.nextSibling;
        body.appendChild(next);
        next = tmp;
      }
      details.appendChild(body);
      h2.parentNode.replaceChild(details, h2);
    });
  }

  // Rendu du contenu dans la page détail (HTML riche ou markdown hérité)
  document.querySelectorAll(".wiki-md").forEach(function (el) {
    try {
      var raw = el.querySelector(".wiki-md-raw");
      if (!raw) return;
      var content = raw.textContent || raw.innerText;
      if (/^\s*<[a-zA-Z]/.test(content) || /<(?:h[1-6]|p|div|ul|ol|li|strong|em|a\s|hr|br)\b/i.test(content)) {
        el.innerHTML = content;
        processH2Accordions(el);
      } else {
        el.innerHTML = renderMarkdown(content);
      }
      // S'assure que tous les accordéons h2 sont fermés au chargement
      el.querySelectorAll("details.wiki-section").forEach(function (d) { d.open = false; });
    } catch (e) { console.error("[wiki-md] erreur de rendu :", e); }
  });

  // Mobile : place l'image principale avant la première section ## du contenu
  // (les ## sont rendus en <details class="wiki-section">, pas en <h2>)
  (function () {
    var hero = document.getElementById("wiki-mobile-hero");
    if (!hero) return;
    var mainMd = document.querySelector(".wiki-detail-body .wiki-md");
    if (!mainMd) return;
    // :scope > garantit que firstSection est un enfant direct de mainMd
    // (insertBefore échoue silencieusement sinon et tue tout le script)
    var firstSection = mainMd.querySelector(":scope > details.wiki-section");
    if (firstSection) {
      mainMd.insertBefore(hero, firstSection);
    } else {
      // Pas de section ## directe : on place l'image après tout le texte intro
      mainMd.appendChild(hero);
    }
  })();

  // ══════════════════════════════════════════════════
  // 2. COULEURS DES TAGS (hash → teinte HSL)
  // ══════════════════════════════════════════════════
  var TAG_HUES = [4, 28, 48, 140, 175, 210, 270, 330];
  function tagHue(tag) {
    var h = 0, s = tag.toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TAG_HUES[Math.abs(h) % TAG_HUES.length];
  }
  // Applique la couleur à tous les pills existants dans le DOM
  function applyTagColors() {
    document.querySelectorAll(".link-tag-pill").forEach(function (el) {
      el.style.setProperty("--h", tagHue(el.textContent.trim()));
    });
  }
  applyTagColors();

  // Tags de la fiche détail : limiter à 1 ligne avec bouton étendre/réduire
  (function () {
    var tagsEl = document.querySelector(".wiki-right-tags");
    if (!tagsEl) return;

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "wiki-tags-toggle";
    tagsEl.after(toggle);

    var expanded = false;

    function update() {
      if (expanded) {
        tagsEl.classList.add("tags-expanded");
        toggle.textContent = "Réduire ▲";
        toggle.style.display = "block";
      } else {
        tagsEl.classList.remove("tags-expanded");
        var overflows = tagsEl.scrollHeight > tagsEl.clientHeight + 2;
        if (overflows) {
          toggle.textContent = "Voir tout ▼";
          toggle.style.display = "block";
        } else {
          toggle.style.display = "none";
        }
      }
    }

    toggle.addEventListener("click", function () {
      expanded = !expanded;
      update();
    });

    update();
  })();

  // ══════════════════════════════════════════════════
  // 3. WIDGET TAGS VISUELS
  // ══════════════════════════════════════════════════
  // isDerived : widget des synonymes, où chaque terme peut être marqué
  // "anglais" individuellement via un petit bouton EN sur sa puce
  // (remplace l'ancien réglage global qui s'appliquait à tort à tous
  // les synonymes en même temps).
  function createChipEl(item, onRemove, isDerived, onToggleEn) {
    var hue = tagHue(item.term);
    var chip = document.createElement("span");
    chip.className = "wiki-chip";
    chip.style.setProperty("--h", hue);
    chip.dataset.tag = item.term;
    var text = document.createElement("span");
    text.textContent = item.term;
    chip.appendChild(text);
    if (isDerived) {
      var enBtn = document.createElement("button");
      enBtn.type = "button";
      enBtn.className = "wiki-chip-en" + (item.en ? " active" : "");
      enBtn.textContent = "EN";
      enBtn.title = item.en ? "Terme anglais (cliquer pour retirer)" : "Marquer comme terme anglais";
      enBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        onToggleEn(item.term);
      });
      chip.appendChild(enBtn);
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wiki-chip-remove";
    btn.innerHTML = "&#215;";
    btn.title = "Retirer";
    btn.addEventListener("click", function () { onRemove(item.term); });
    chip.appendChild(btn);
    return chip;
  }

  function initTagWidget(widget) {
    var board   = widget.querySelector(".wiki-tags-board");
    var typer   = widget.querySelector(".wiki-tags-typing");
    var hidden  = widget.querySelector(".wiki-tags-hidden");
    var suggestBox = widget.querySelector(".wiki-tag-suggestions");
    if (!board || !typer || !hidden) return;

    var isDerived = widget.classList.contains("wiki-derived-widget");
    var tags = []; // { term, en }

    function findTag(term) {
      for (var i = 0; i < tags.length; i++) if (tags[i].term === term) return tags[i];
      return null;
    }

    // Initialise depuis la valeur cachée (formulaire d'édition) ; un
    // terme dérivé anglais porte le suffixe interne "::en".
    var initVal = (hidden.value || "").trim();
    if (initVal) {
      initVal.split(/[,;]+/).forEach(function (raw) {
        var t = raw.trim();
        if (!t) return;
        var en = false;
        if (isDerived && /::en$/.test(t)) { en = true; t = t.replace(/::en$/, "").trim(); }
        if (t && !findTag(t)) tags.push({ term: t, en: en });
      });
    }

    function syncHidden() {
      hidden.value = tags.map(function (t) {
        return isDerived && t.en ? t.term + "::en" : t.term;
      }).join(", ");
    }

    function renderBoard() {
      // Supprime les chips existants (pas le typer)
      Array.from(board.querySelectorAll(".wiki-chip")).forEach(function (c) { c.remove(); });
      // Recrée dans l'ordre
      tags.forEach(function (t) {
        var chip = createChipEl(t, removeTag, isDerived, toggleEn);
        board.insertBefore(chip, typer);
      });
      syncHidden();
      syncSuggestions();
    }

    function syncSuggestions() {
      if (!suggestBox) return;
      suggestBox.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
        chip.classList.toggle("active", !!findTag(chip.dataset.tag));
      });
      // Sync special shortcut buttons outside the widget
      if (!isDerived) {
        document.querySelectorAll(".wf-tag-special").forEach(function (btn) {
          btn.classList.toggle("active", !!findTag(btn.dataset.tag));
        });
      }
    }

    function addTag(raw) {
      raw.split(/[,;]+/).forEach(function (part) {
        var t = part.trim();
        if (t && !findTag(t)) tags.push({ term: t, en: false });
      });
      renderBoard();
    }

    function removeTag(term) {
      var idx = -1;
      for (var i = 0; i < tags.length; i++) if (tags[i].term === term) { idx = i; break; }
      if (idx !== -1) tags.splice(idx, 1);
      renderBoard();
    }

    function toggleEn(term) {
      var item = findTag(term);
      if (item) { item.en = !item.en; renderBoard(); }
    }

    // Clavier dans le champ de saisie
    typer.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === ".") {
        e.preventDefault();
        var val = typer.value.trim().replace(/\.$/, ""); // strip trailing dot
        if (val) { addTag(val); typer.value = ""; closeAc(); }
      } else if (e.key === "Backspace" && typer.value === "" && tags.length) {
        removeTag(tags[tags.length - 1].term);
      }
    });

    // Coller une liste séparée par virgules/points-virgules
    typer.addEventListener("paste", function (e) {
      e.preventDefault();
      var pasted = (e.clipboardData || window.clipboardData).getData("text");
      if (pasted) { addTag(pasted); typer.value = ""; }
    });

    // Clic sur le board (focus le typer)
    board.addEventListener("click", function (e) {
      if (e.target === board) typer.focus();
    });

    // Suggestions (chips statiques)
    if (suggestBox) {
      suggestBox.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          var tag = chip.dataset.tag;
          if (!findTag(tag)) { addTag(tag); }
          else { removeTag(tag); }
        });
      });
    }

    // ── Autocomplete dropdown (temps réel pendant la saisie) ──────────────
    var allAvailTags = [];
    if (suggestBox) {
      suggestBox.querySelectorAll(".wiki-tag-suggest-chip[data-tag]").forEach(function (chip) {
        allAvailTags.push(chip.dataset.tag);
      });
    }

    var acDrop = document.createElement("ul");
    acDrop.className = "wiki-tag-autocomplete";
    acDrop.hidden = true;
    board.parentNode.insertBefore(acDrop, board.nextSibling);
    var acSelected = -1;

    function closeAc() { acDrop.hidden = true; acDrop.innerHTML = ""; acSelected = -1; }

    function showAc(query) {
      var q = (query || "").trim().toLowerCase();
      if (!q) { closeAc(); return; }
      var matches = allAvailTags.filter(function (t) {
        return t.toLowerCase().indexOf(q) !== -1 && !findTag(t);
      }).slice(0, 9);
      if (!matches.length) { closeAc(); return; }
      acDrop.innerHTML = "";
      acSelected = -1;
      matches.forEach(function (t) {
        var li = document.createElement("li");
        li.className = "wiki-tag-ac-item";
        li.textContent = t;
        li.addEventListener("mousedown", function (e) {
          e.preventDefault(); // empêche blur du typer
          addTag(t);
          typer.value = "";
          closeAc();
          typer.focus();
        });
        acDrop.appendChild(li);
      });
      acDrop.hidden = false;
    }

    typer.addEventListener("input", function () {
      showAc(typer.value);
      // Filter visible suggestion chips as the user types
      if (suggestBox) {
        var q = typer.value.trim().toLowerCase();
        suggestBox.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
          chip.hidden = q.length > 0 && chip.dataset.tag.toLowerCase().indexOf(q) === -1;
        });
      }
    });
    typer.addEventListener("blur",  function () { setTimeout(closeAc, 160); });

    // Navigation clavier dans le dropdown (capture → avant le handler Enter existant)
    typer.addEventListener("keydown", function (e) {
      if (acDrop.hidden) return;
      var items = acDrop.querySelectorAll(".wiki-tag-ac-item");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        acSelected = Math.min(acSelected + 1, items.length - 1);
        items.forEach(function (li, i) { li.classList.toggle("selected", i === acSelected); });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        acSelected = Math.max(acSelected - 1, 0);
        items.forEach(function (li, i) { li.classList.toggle("selected", i === acSelected); });
      } else if ((e.key === "Enter" || e.key === "Tab") && acSelected >= 0 && items[acSelected]) {
        e.preventDefault();
        e.stopImmediatePropagation();
        addTag(items[acSelected].textContent);
        typer.value = "";
        closeAc();
      } else if (e.key === "Escape") {
        closeAc();
      }
    }, true); // capture phase → s'exécute avant le handler Enter/virgule existant

    renderBoard();
  }

  document.querySelectorAll(".wiki-tags-widget").forEach(initTagWidget);

  // ══════════════════════════════════════════════════
  // 3b. AVERTISSEMENT TITRE DUPLIQUÉ
  // ══════════════════════════════════════════════════
  (function () {
    var titleInput = document.getElementById("wiki-new-title");
    var warnBox    = document.getElementById("wiki-title-warn");
    var pagesEl    = document.getElementById("wiki-existing-pages");
    if (!titleInput || !warnBox || !pagesEl) return;

    var existingPages = [];
    try { existingPages = JSON.parse(pagesEl.textContent); } catch (_) {}

    // Flag : l'utilisateur a explicitement confirmé la création malgré le doublon
    var userConfirmed = false;

    function normalize(s) {
      return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function findSimilar(query) {
      var q = normalize(query);
      if (q.length < 2) return [];
      return existingPages.filter(function (p) {
        var t = normalize(p.title);
        return t === q || t.includes(q) || q.includes(t);
      });
    }

    function renderWarn(matches) {
      userConfirmed = false;
      warnBox.innerHTML = "";

      var msg = document.createElement("span");
      msg.innerHTML = "\u26A0\uFE0F Page similaire d\u00e9j\u00e0 existante\u00a0: " +
        matches.map(function (p) {
          return '<a href="/wiki/' + p.id + '" target="_blank" class="wiki-warn-link">' + p.title + "</a>";
        }).join(", ");
      warnBox.appendChild(msg);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wiki-warn-confirm";
      btn.textContent = "Cr\u00e9er quand m\u00eame";
      btn.addEventListener("click", function () {
        userConfirmed = true;
        warnBox.hidden = true;
        // Soumettre le formulaire directement
        var form = document.getElementById("wiki-new-form");
        if (form) form.submit();
      });
      warnBox.appendChild(btn);
      warnBox.hidden = false;
    }

    var warnTimer;
    titleInput.addEventListener("input", function () {
      userConfirmed = false;
      clearTimeout(warnTimer);
      warnTimer = setTimeout(function () {
        var matches = findSimilar(titleInput.value.trim());
        if (!matches.length) { warnBox.hidden = true; warnBox.innerHTML = ""; return; }
        renderWarn(matches);
      }, 350);
    });

    // Bloque la soumission si warning visible et non confirmé
    var form = document.getElementById("wiki-new-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        if (!warnBox.hidden && !userConfirmed) {
          e.preventDefault();
          var btn = warnBox.querySelector(".wiki-warn-confirm");
          if (btn) {
            btn.style.outline = "2px solid #e53";
            setTimeout(function () { btn.style.outline = ""; }, 1200);
          }
        }
      });
    }
  })();

  // ══════════════════════════════════════════════════
  // 4. FLOW CRÉATION (étape 1 → étape 2)
  // ══════════════════════════════════════════════════
  var newBtn          = document.getElementById("wiki-new-btn");
  var step1           = document.getElementById("wiki-step1");
  var step2           = document.getElementById("wiki-step2");
  var catInput        = document.getElementById("wiki-new-cat-input");
  var catBadge        = document.getElementById("wiki-new-cat-badge");
  var cancelBtn       = document.getElementById("wiki-cancel-new");
  var newOwned        = document.getElementById("wiki-new-owned");
  var newPosMeta      = step2 ? step2.querySelector(".wiki-position-meta")      : null;
  var newFantasMeta   = step2 ? step2.querySelector(".wiki-fantasmes-meta")     : null;
  var newPartMeta     = step2 ? step2.querySelector(".wiki-partenaires-meta")   : null;
  var newLieuxMeta    = step2 ? step2.querySelector(".wiki-lieux-meta")         : null;
  var newObjetsMeta   = step2 ? step2.querySelector(".wiki-objets-meta")        : null;

  function showStep(n) {
    if (!step1 || !step2) return;
    step1.hidden = n !== 1;
    step2.hidden = n !== 2;
    if (newBtn) newBtn.textContent = n === 0 ? "+ Nouvelle page" : "Annuler";
  }

  if (newBtn) {
    newBtn.addEventListener("click", function () {
      if (!step1.hidden || !step2.hidden) { showStep(0); }
      else { showStep(1); }
    });
  }

  if (step1) {
    step1.querySelectorAll(".wiki-cat-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var key   = card.dataset.category;
        var hue   = card.dataset.hue  || 220;
        var label = card.dataset.label || key;
        if (catInput) catInput.value = key;
        if (catBadge) {
          catBadge.textContent = label;
          catBadge.style.background = "hsl(" + hue + ", 55%, 45%)";
        }
        if (newOwned)      newOwned.hidden      = key !== "objets" && key !== "tenues";
        if (newFantasMeta) newFantasMeta.hidden  = key !== "fantasmes";
        if (newPartMeta)   newPartMeta.hidden    = key !== "partenaires";
        if (newLieuxMeta)  newLieuxMeta.hidden   = key !== "lieux";
        if (newPosMeta)    newPosMeta.hidden      = key !== "position";
        if (newObjetsMeta) newObjetsMeta.hidden   = key !== "objets";
        // Cache la catégorie principale dans les options supplémentaires
        var newExtraOpts = document.querySelectorAll("#wiki-new-extra-cats .wiki-extra-cat-option");
        newExtraOpts.forEach(function (opt) {
          var hide = opt.dataset.cat === key;
          opt.hidden = hide;
          if (hide) opt.querySelector("input").checked = false;
        });
        showStep(2);
      });
    });
  }

  // Badge cliquable pour revenir à l'étape 1
  if (catBadge) {
    catBadge.addEventListener("click", function () { showStep(1); });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () { showStep(0); });
  }

  // ══════════════════════════════════════════════════
  // 5. FORMULAIRE ÉDITION : catégorie + champs conditionnels
  // ══════════════════════════════════════════════════
  var editCatSelect      = document.getElementById("wiki-category-select");
  var editOwned          = document.getElementById("wiki-owned-field");
  var editPosMeta        = document.querySelector("#wiki-edit-form .wiki-position-meta");
  var editFantasMeta     = document.querySelector("#wiki-edit-form .wiki-fantasmes-meta");
  var editPartSousCat    = document.getElementById("wf-partenaires-sous-cat");
  var editPartParams     = document.getElementById("wf-partenaires-params");
  var editLieuxMeta      = document.querySelector("#wiki-edit-form .wiki-lieux-meta");
  var editObjetsMeta     = document.querySelector("#wiki-edit-form .wiki-objets-meta");
  var editScenarioField  = document.getElementById("wf-scenario-field");

  // Toggle exact / qualitatif pour les champs de mesure
  document.querySelectorAll(".wf-measure-toggle").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var target = btn.dataset.target;
      var field = document.getElementById("wf-" + target + "-field");
      if (!field) return;
      var isExact = field.dataset.mode === "exact";
      field.dataset.mode = isExact ? "qual" : "exact";
      btn.textContent = isExact ? "Valeurs exactes" : "Qualitatif";
    });
  });

  // Sous-panneaux partenaires selon le type sélectionné
  function syncPartSubs() {
    if (!editPartParams) return;
    var radios = document.querySelectorAll("input[name='meta_sous_cat']");
    var val = "";
    radios.forEach(function (r) { if (r.checked) val = r.value; });
    var elNombre   = editPartParams.querySelector(".wf-part-sub--nombre");
    var elMonstre  = editPartParams.querySelector(".wf-part-sub--monstre");
    var elAnimaux  = editPartParams.querySelector(".wf-part-sub--animaux");
    var elBio      = editPartParams.querySelector(".wf-part-sub--biodetail");
    if (elNombre)  { elNombre.hidden  = val !== "nombre";  if (!elNombre.hidden)  elNombre.open  = true; }
    if (elMonstre) { elMonstre.hidden = val !== "monstre"; if (!elMonstre.hidden) elMonstre.open = true; }
    if (elAnimaux) { elAnimaux.hidden = val !== "animaux"; if (!elAnimaux.hidden) elAnimaux.open = true; }
    if (elBio)     { elBio.hidden     = (val !== "monstre" && val !== "animaux"); if (!elBio.hidden) elBio.open = true; }
  }
  if (editPartSousCat) {
    editPartSousCat.querySelectorAll("input[name='meta_sous_cat']").forEach(function (r) {
      r.addEventListener("change", syncPartSubs);
    });
    syncPartSubs();
  }

  function syncEditFields() {
    if (!editCatSelect) return;
    var cat = editCatSelect.value;
    if (editOwned)         editOwned.hidden         = cat !== "objets" && cat !== "tenues";
    if (editFantasMeta)    editFantasMeta.hidden     = cat !== "fantasmes";
    if (editPartSousCat)   editPartSousCat.hidden    = cat !== "partenaires";
    if (editPartParams)    editPartParams.hidden     = cat !== "partenaires";
    if (editLieuxMeta)     editLieuxMeta.hidden      = cat !== "lieux";
    if (editPosMeta)       editPosMeta.hidden        = cat !== "position";
    if (editObjetsMeta)    editObjetsMeta.hidden     = cat !== "objets";
    if (editScenarioField) editScenarioField.hidden  = cat !== "partenaires";
    // Cache la catégorie principale dans les options supplémentaires
    var editExtraOpts = document.querySelectorAll("#wiki-edit-extra-cats .wiki-extra-cat-option");
    editExtraOpts.forEach(function (opt) {
      var hide = opt.dataset.cat === cat;
      opt.hidden = hide;
      if (hide) opt.querySelector("input").checked = false;
    });
    // Couleur du select (optionnel, via data-hue)
    var opt = editCatSelect.options[editCatSelect.selectedIndex];
    if (opt && opt.dataset.hue) {
      editCatSelect.style.color = "hsl(" + opt.dataset.hue + ", 55%, 40%)";
    }
  }
  if (editCatSelect) {
    editCatSelect.addEventListener("change", syncEditFields);
    syncEditFields();
  }

  // ══════════════════════════════════════════════════
  // 6. RÉACTIONS (étoiles, flamme, intérêt)
  // La note (étoiles) vit désormais dans son propre bloc, au-dessus de
  // l'image principale ; flamme/intérêt restent dans .wiki-react plus
  // bas. Les deux partagent le même data-id et sont sauvegardés
  // ensemble via le même endpoint.
  // ══════════════════════════════════════════════════
  var ratingWidget = document.querySelector(".wiki-detail-rating");
  var reactWidget  = document.querySelector(".wiki-react");
  if (ratingWidget || reactWidget) {
    var reactId       = (ratingWidget || reactWidget).dataset.id;
    var reactRating   = Number((ratingWidget || reactWidget).dataset.rating) || 0;
    var reactFlame    = reactWidget ? reactWidget.dataset.flame === "1" : false;
    var reactInterest = reactWidget ? reactWidget.dataset.interested === "1" : false;
    var reactReadLater = reactWidget ? reactWidget.dataset.readlater === "1" : false;
    var reactPracticed = reactWidget ? reactWidget.dataset.practiced === "1" : false;
    var reactHidden    = reactWidget ? reactWidget.dataset.hidden === "1" : false;

    var starBtns = (ratingWidget || reactWidget).querySelectorAll(".wiki-star");
    var flamBtn  = reactWidget ? reactWidget.querySelector("[data-key='flame']") : null;
    var intrBtn  = reactWidget ? reactWidget.querySelector("[data-key='interested']") : null;
    var rlBtn    = reactWidget ? reactWidget.querySelector("[data-key='readlater']") : null;
    var pracBtn  = reactWidget ? reactWidget.querySelector("[data-key='practiced']") : null;
    var hideBtn  = reactWidget ? reactWidget.querySelector("[data-key='hidden']") : null;

    function save() {
      fetch("/wiki/" + reactId + "/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reactRating, flame: reactFlame, interested: reactInterest, readLater: reactReadLater, practiced: reactPracticed, hidden: reactHidden }),
      });
    }

    function renderStars() {
      starBtns.forEach(function (btn) {
        var v = Number(btn.dataset.value);
        btn.innerHTML = v <= reactRating ? "&#9733;" : "&#9734;";
        btn.classList.toggle("active", v <= reactRating);
      });
    }
    // Sans cet appel initial, les étoiles déjà notées gardaient la
    // couleur "vide" tant qu'on n'avait pas survolé/cliqué une fois :
    // le glyphe ★ était bon mais la classe "active" (donc l'or) ne
    // s'appliquait qu'après une première interaction.
    renderStars();

    // Étoiles : hover pour preview, clic pour valider
    // Si on reclique la même étoile → remet à 0
    starBtns.forEach(function (btn) {
      var v = Number(btn.dataset.value);

      btn.addEventListener("mouseenter", function () {
        starBtns.forEach(function (b) {
          b.innerHTML = Number(b.dataset.value) <= v ? "&#9733;" : "&#9734;";
        });
      });

      btn.addEventListener("mouseleave", renderStars);

      btn.addEventListener("click", function () {
        reactRating = (reactRating === v) ? 0 : v;
        renderStars();
        save();
      });
    });

    // Flamme
    if (flamBtn) {
      flamBtn.addEventListener("click", function () {
        reactFlame = !reactFlame;
        flamBtn.classList.toggle("active", reactFlame);
        save();
      });
    }

    // Intérêt
    if (intrBtn) {
      intrBtn.addEventListener("click", function () {
        reactInterest = !reactInterest;
        intrBtn.classList.toggle("active", reactInterest);
        save();
      });
    }

    // À lire plus tard
    if (rlBtn) {
      rlBtn.addEventListener("click", function () {
        reactReadLater = !reactReadLater;
        rlBtn.classList.toggle("active", reactReadLater);
        save();
      });
    }

    // Déjà pratiqué
    if (pracBtn) {
      pracBtn.addEventListener("click", function () {
        reactPracticed = !reactPracticed;
        pracBtn.classList.toggle("active", reactPracticed);
        save();
      });
    }

    // Masquer (voir /favoris/masques pour retrouver et réafficher) : reste
    // consultable sur cette page même une fois masquée, seulement retirée
    // des listings (sommaire, catégories, "tous", extraction des goûts...).
    if (hideBtn) {
      hideBtn.addEventListener("click", function () {
        reactHidden = !reactHidden;
        hideBtn.classList.toggle("active", reactHidden);
        hideBtn.title = reactHidden ? "Réafficher cette page" : "Masquer cette page";
        save();
      });
    }
  }

  // ══════════════════════════════════════════════════
  // 6. FILTRES + RECHERCHE + TRI DE LA GRILLE
  // ══════════════════════════════════════════════════
  var categoryFilter  = document.getElementById("wiki-category-filter");
  // Chips de catégorie (dont "Nos objets", hors du conteneur) : figées une
  // fois pour toutes au chargement — évite de refaire ce querySelectorAll
  // sur tout le document à chaque applyFilters() (recherche, clic tag...).
  var catChipEls = document.querySelectorAll(".tag-chip[data-category]");
  var tagFilter       = document.getElementById("wiki-tag-filter");
  var sortSelect      = document.getElementById("wiki-sort-select");
  var ultraToggle      = document.getElementById("wiki-ultra-toggle");
  var irrealisteToggle = document.getElementById("wiki-irrealiste-toggle");
  var wikiList        = document.getElementById("wiki-list");
  var searchInput     = document.getElementById("wiki-search-input");
  var searchClear     = document.getElementById("wiki-search-clear");
  var resultCount     = document.getElementById("wiki-result-count");
  var advToggle       = document.getElementById("wiki-adv-toggle");
  var advPanel        = document.getElementById("wiki-adv-panel");
  var advStarsWrap    = document.getElementById("wiki-adv-stars");
  var advStarReset    = document.getElementById("wiki-adv-star-reset");
  var propGrid        = document.getElementById("wiki-prop-grid");
  var tagSearchInput  = document.getElementById("wiki-tag-search");
  var colsSelect      = document.getElementById("wiki-cols-select");
  var paginationEl    = document.getElementById("wiki-pagination");
  var paginationTopEl = document.getElementById("wiki-pagination-top");
  var specialFilter   = document.getElementById("wiki-special-filter");
  var extraCatFilter  = document.getElementById("wiki-extra-cat-filter");
  var indexNative     = document.getElementById("wiki-index-native");

  // Catégories : multi-sélection à 3 états (comme les tags), plus de simple
  // "Tous" — aucune catégorie cochée revient déjà à "toutes affichées".
  var includedCategoriesSet = new Set(JSON.parse(localStorage.getItem("wiki-filter-cats-inc") || "[]"));
  var excludedCategoriesSet = new Set(JSON.parse(localStorage.getItem("wiki-filter-cats-exc") || "[]"));
  var propStates = {
    // "owned" retiré : doublon avec la bascule "Nos objets".
    "not-rated": Number(localStorage.getItem("wiki-prop-not-rated") || "0"),
    "flame":     Number(localStorage.getItem("wiki-prop-flame")     || "0"),
    "interested":Number(localStorage.getItem("wiki-prop-interested")|| "0")
  };
  var includedTagsSet = new Set(JSON.parse(localStorage.getItem("wiki-filter-tags-inc") || "[]"));
  var excludedTagsSet = new Set(JSON.parse(localStorage.getItem("wiki-filter-tags-exc") || "[]"));
  // Tags masqués (voir /favoris et le bouton "Masquer le tag" de la popup
  // tag) : toute page portant l'un de ces tags reste masquée partout, sans
  // bascule possible ici (on les retire depuis /tags/masques).
  var blacklistSet = new Set((window.TAG_BLACKLIST || []).map(function(t) { return String(t).toLowerCase(); }));
  // Effectif à la fermeture de la popup tag (voir public/nav.js), pas au
  // clic sur "Masquer le tag" : on ne veut pas faire disparaître le tag
  // sous les yeux de l'utilisateur pendant qu'il consulte encore la popup.
  document.addEventListener("tag-blacklist-change", function () {
    blacklistSet = new Set((window.TAG_BLACKLIST || []).map(function(t) { return String(t).toLowerCase(); }));
    applyFilters();
  });
  var activeSort      = localStorage.getItem("wiki-filter-sort") || "alpha-asc";
  // Etat initial : le réglage de compte (voir /favoris > Parametres) sert de
  // valeur par défaut, mais une bascule explicite en session (via les
  // boutons Ultra/Irréaliste du volet filtre) est mémorisée et prime dessus
  // au rechargement — sinon revenir sur la page annulait silencieusement le
  // filtre qu'on venait de poser.
  var storedHideUltra      = localStorage.getItem("wiki-hide-ultra");
  var storedHideIrrealiste = localStorage.getItem("wiki-hide-irrealiste");
  var hideUltra       = storedHideUltra !== null ? storedHideUltra === "1" : (window.ULTRA_MODE || "hidden") === "hidden";
  var hideIrrealiste  = storedHideIrrealiste !== null ? storedHideIrrealiste === "1" : (window.IRREALISTE_MODE || "visible") === "hidden";
  var searchQuery     = localStorage.getItem("wiki-filter-search") || "";
  var advMinRating    = Number(localStorage.getItem("wiki-filter-rating")) || 0;
  var activeCols      = Number(localStorage.getItem("wiki-cols")) || 3;
  var activeSpecialFilter = localStorage.getItem("wiki-filter-special") || "";
  var activeMaturityFilter = Number(localStorage.getItem("wiki-filter-maturity") || "-1"); // -1 = pas de filtre
  var includedExtraCats = new Set();
  var excludedExtraCats = new Set();
  var activeSousCat   = localStorage.getItem("wiki-filter-sous-cat") || "";
  var tagLogic        = localStorage.getItem("wiki-tag-logic") || "and"; // "and" | "or"
  var currentPage     = 1;
  var _paginationNavigation = false;

  // La recherche du sommaire (page d'accueil) arrive ici en ?q=... : elle
  // prend le pas sur la recherche mémorisée et devient la nouvelle valeur.
  var urlSearchQuery = new URLSearchParams(window.location.search).get("q");
  if (urlSearchQuery !== null) {
    searchQuery = urlSearchQuery;
    localStorage.setItem("wiki-filter-search", searchQuery);
  }

  // Un lien tag depuis une page wiki arrive en ?tag=... : sélectionne le tag
  // comme filtre actif (mode "inclus") et efface les filtres tags précédents.
  var urlTagParam = new URLSearchParams(window.location.search).get("tag");
  if (urlTagParam !== null) {
    var _urlTag = urlTagParam.toLowerCase();
    includedTagsSet.clear();
    excludedTagsSet.clear();
    includedTagsSet.add(_urlTag);
    localStorage.setItem("wiki-filter-tags-inc", JSON.stringify([_urlTag]));
    localStorage.setItem("wiki-filter-tags-exc", "[]");
  }

  // Normalise une chaîne : minuscules + sans accents
  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // ── Trigrammes : tolérance aux fautes de frappe ───────────────────────
  // Génère l'ensemble des trigrammes d'un mot (ex: "assis" → {" as","ass","ssi","sis","is "})
  function trigrams(w) {
    var s = " " + w + " ";
    var set = {};
    for (var i = 0; i < s.length - 2; i++) set[s.slice(i, i + 3)] = true;
    return set;
  }

  // Similarité de Jaccard sur les trigrammes, entre 0 et 1
  function trigramSim(a, b) {
    if (!a || !b) return 0;
    var ta = trigrams(a);
    var tb = trigrams(b);
    var inter = 0, union = 0;
    var all = {};
    Object.keys(ta).forEach(function (k) { all[k] = true; });
    Object.keys(tb).forEach(function (k) { all[k] = true; });
    Object.keys(all).forEach(function (k) {
      if (ta[k] && tb[k]) inter++;
      union++;
    });
    return union ? inter / union : 0;
  }

  // Score fuzzy d'un mot de query contre un champ texte.
  // Retourne 0..1 : 1 = correspondance exacte, >0.4 = faute tolérable.
  function fuzzyScore(word, field) {
    if (!word || !field) return 0;
    if (field.includes(word)) return 1; // correspondance exacte → priorité
    var best = 0;
    field.split(/\s+/).forEach(function (fw) {
      if (!fw) return;
      var sim = trigramSim(word, fw);
      if (sim > best) best = sim;
    });
    return best;
  }

  // Score de pertinence d'une carte pour un terme de recherche
  function scoreCard(card, q) {
    if (!q) return 1;
    var words = q.split(/\s+/).filter(Boolean);
    var title     = norm(card.dataset.title || "");
    var derived   = norm(card.dataset.derived || "");
    var tags      = norm(card.dataset.tags || "").replace(/\|/g, " ");
    var content   = norm(card.dataset.content || "");
    var variantes = norm(card.dataset.variantes || "");
    var cat       = norm(card.dataset.category || "");

    // Texte combiné pour détecter les requêtes multi-mots réparties
    // entre le titre et les variantes (ex: "assis de dos")
    var combined  = title + " " + variantes;

    var score = 0;

    // Bonus si la requête complète apparaît dans le texte combiné
    var fullQ = words.join(" ");
    if (combined.includes(fullQ))     score += 10;
    else if (title.includes(fullQ))   score += 10;

    words.forEach(function (w) {
      // ── Correspondances exactes (titre) ──
      if (title === w)                score += 12;
      else if (title.startsWith(w))   score += 8;
      else if (title.includes(w))     score += 5;

      // ── Correspondances exactes (autres champs) ──
      if (derived.includes(w))        score += 4;
      if (tags.includes(w))           score += 3;
      if (variantes.includes(w))      score += 3;
      if (content.includes(w))        score += 2;
      if (cat.includes(w))            score += 1;

      // ── Fuzzy (seulement si pas de correspondance exacte) ──
      // Tolère ~1 caractère de différence (sim > 0.5)
      var titleSim = fuzzyScore(w, title);
      if (titleSim >= 0.5 && !title.includes(w))  score += titleSim * 4;

      var varSim = fuzzyScore(w, variantes);
      if (varSim >= 0.5 && !variantes.includes(w)) score += varSim * 2;

      var derSim = fuzzyScore(w, derived);
      if (derSim >= 0.5 && !derived.includes(w))  score += derSim * 2;
    });
    return score;
  }

  // Regroupe visuellement les chips par état : inclus (vert) en premier,
  // puis exclus (rouge), puis neutres (noir) — dans leur ordre d'origine au
  // sein de chaque groupe. Purement visuel, ne touche pas au filtrage.
  function reorderTagChips() {
    if (!tagFilter) return;
    var chips = Array.prototype.slice.call(tagFilter.querySelectorAll(".wiki-tag-chip[data-tag]"));
    var inc = [], exc = [], neu = [];
    chips.forEach(function (chip) {
      var s = chip.dataset.state || "0";
      if (s === "1") inc.push(chip);
      else if (s === "2") exc.push(chip);
      else neu.push(chip);
    });
    inc.concat(exc, neu).forEach(function (chip) { tagFilter.appendChild(chip); });
  }

  function updateTagChipVisibility(baseCards) {
    if (!tagFilter) return;
    reorderTagChips();
    var chips = tagFilter.querySelectorAll(".wiki-tag-chip[data-tag]");
    if (includedTagsSet.size === 0 && excludedTagsSet.size === 0) {
      chips.forEach(function(chip) {
        var t = (chip.dataset.tag || "").toLowerCase();
        // Un tag masqué (voir /tags/masques) n'est plus un choix disponible,
        // pas seulement un choix inutile : on le retire sans même regarder
        // s'il "rapporterait" des cartes.
        if (blacklistSet.has(t)) { chip.hidden = true; return; }
        chip.hidden = !baseCards.some(function(c) {
          return (c.dataset.tags || "").split("|").indexOf(t) !== -1;
        });
      });
      applyTagOverflow();
      return;
    }
    chips.forEach(function(chip) {
      var chipTag = (chip.dataset.tag || "").toLowerCase();
      if (blacklistSet.has(chipTag)) { chip.hidden = true; return; }
      var chipState = chip.dataset.state || "0";
      if (chipState !== "0") {
        chip.hidden = false; // always show active chips
        return;
      }
      // Would adding this chip as "include" still yield cards?
      var wouldYield = baseCards.some(function(card) {
        var cardTags = (card.dataset.tags || "").split("|");
        if (cardTags.indexOf(chipTag) === -1) return false;
        // Must have all currently included tags
        for (var incT of includedTagsSet) {
          if (cardTags.indexOf(incT) === -1) return false;
        }
        // Must not have any excluded tags
        for (var excT of excludedTagsSet) {
          if (cardTags.indexOf(excT) !== -1) return false;
        }
        return true;
      });
      chip.hidden = !wouldYield;
    });
    applyTagOverflow();
  }

  function hasActiveFilters() {
    if (searchQuery) return true;
    if (includedCategoriesSet.size > 0 || excludedCategoriesSet.size > 0) return true;
    if (advMinRating > 0) return true;
    if (includedTagsSet.size > 0 || excludedTagsSet.size > 0) return true;
    for (var _p in propStates) { if (propStates[_p] !== 0) return true; }
    return false;
  }

  function applyFilters() {
    if (!wikiList) return;
    if (!_paginationNavigation) currentPage = 1;
    var cards   = Array.from(wikiList.querySelectorAll(".wiki-card"));
    var q       = norm(searchQuery);
    var _anyPropAdv = false;
    for (var _pk in propStates) { if (propStates[_pk] !== 0) { _anyPropAdv = true; break; } }
    var hasAdv  = advMinRating > 0 || _anyPropAdv;

    var scores = new Map();

    // Filtrage
    cards.forEach(function (card) {
      var extraCats = (card.dataset.extraCats || "").split("|").filter(Boolean);
      // Catégories : multi-sélection 3 états, OR entre catégories incluses,
      // exclusion prioritaire (comme les tags / catégories liées).
      function cardMatchesCat(cat) {
        return cat === "__owned__" ? card.dataset.owned === "1"
          : (card.dataset.category === cat || extraCats.indexOf(cat) !== -1);
      }
      var okCat = true;
      if (includedCategoriesSet.size > 0) {
        okCat = Array.from(includedCategoriesSet).some(cardMatchesCat);
      }
      if (okCat && excludedCategoriesSet.size > 0) {
        okCat = !Array.from(excludedCategoriesSet).some(cardMatchesCat);
      }
      var cardTags  = (card.dataset.tags || "").split("|");
      var okTag = true;
      if (includedTagsSet.size > 0) {
        if (tagLogic === "or") {
          okTag = Array.from(includedTagsSet).some(function(t) { return cardTags.indexOf(t) !== -1; });
        } else {
          okTag = Array.from(includedTagsSet).every(function(t) { return cardTags.indexOf(t) !== -1; });
        }
      }
      if (okTag && excludedTagsSet.size > 0) {
        okTag = !Array.from(excludedTagsSet).some(function(t) { return cardTags.indexOf(t) !== -1; });
      }
      var okBlacklist = blacklistSet.size === 0 || !cardTags.some(function(t) { return blacklistSet.has(t); });
      // Ultra toggle only applies to cards that are ultra but NOT irréaliste
      var okUltra = !hideUltra || card.dataset.ultra !== "1" || card.dataset.irrealiste === "1";
      // Irréaliste toggle controls all irréaliste cards
      var okIrrealiste = !hideIrrealiste || card.dataset.irrealiste !== "1";

      // Filtre spécial (ultra/irréaliste inclusif)
      var okSpecial = true;
      if (activeSpecialFilter === "ultra") {
        okSpecial = card.dataset.ultra === "1" && card.dataset.irrealiste !== "1";
      } else if (activeSpecialFilter === "irrealiste") {
        okSpecial = card.dataset.irrealiste === "1";
      } else if (activeSpecialFilter === "both") {
        okSpecial = card.dataset.ultra === "1" || card.dataset.irrealiste === "1";
      }

      // Filtre catégories liées (3 états : inclure / exclure / neutre)
      var okExtraCat = true;
      if (includedExtraCats.size > 0) {
        var ecList = (card.dataset.extraCats || "").split("|").filter(Boolean);
        okExtraCat = Array.from(includedExtraCats).some(function(ec) { return ecList.indexOf(ec) !== -1; });
      }
      if (okExtraCat && excludedExtraCats.size > 0) {
        var ecList2 = (card.dataset.extraCats || "").split("|").filter(Boolean);
        okExtraCat = !Array.from(excludedExtraCats).some(function(ec) { return ecList2.indexOf(ec) !== -1; });
      }

      // Recherche textuelle
      var sc = scoreCard(card, q);
      // Seuil ≥ 1 pour éviter les faux-positifs du fuzzy (0 < sim < 0.5)
      var okSearch = !q || sc >= 1;
      scores.set(card, sc);

      // Filtres avancés
      var okRating = !advMinRating || Number(card.dataset.rating) >= advMinRating;
      // Prop filters (3-state)
      var isUnrated = !Number(card.dataset.rating);
      var okNotRated   = propStates["not-rated"]  === 0 ? true : (propStates["not-rated"]  === 1 ? isUnrated              : !isUnrated);
      var okFlame      = propStates["flame"]      === 0 ? true : (propStates["flame"]      === 1 ? card.dataset.flame === "1"      : card.dataset.flame !== "1");
      var okInterested = propStates["interested"] === 0 ? true : (propStates["interested"] === 1 ? card.dataset.interested === "1" : card.dataset.interested !== "1");
      var okMaturity   = activeMaturityFilter < 0 || Number(card.dataset.maturity || 0) === activeMaturityFilter;
      var okSousCat    = !activeSousCat || (card.dataset.sousCat || "") === activeSousCat;

      // Track which cards pass all non-tag filters (for smart tag chip visibility)
      var okNonTag = okCat && okUltra && okIrrealiste && okSpecial && okExtraCat && okSearch && okRating && okNotRated && okFlame && okInterested && okMaturity && okSousCat && okBlacklist;
      card._passesNonTag = okNonTag;
      // Track which cards pass all filters except the category (for 9/27 chip counts)
      card._passesNonCat = okUltra && okIrrealiste && okSpecial && okExtraCat && okSearch && okRating && okNotRated && okFlame && okInterested && okMaturity && okSousCat && okTag && okBlacklist;
      card.hidden = !(okNonTag && okTag);
    });

    var baseCards = cards.filter(function(c) { return c._passesNonTag; });
    updateTagChipVisibility(baseCards);

    // Mise à jour des chips catégories avec les compteurs "x/y"
    if (categoryFilter) {
      var anyNonCatFilter = !!q || includedTagsSet.size > 0 || excludedTagsSet.size > 0 || advMinRating > 0 || _anyPropAdv;
      // catTotal : catégorie principale seulement (évite le double-comptage des extra_categories).
      // catFiltered : pages passant les filtres non-catégorie, dans cette catégorie (primary OR extra).
      var catFiltered = {}, catTotal = {};
      cards.forEach(function(card) {
        var primary = card.dataset.category;
        if (primary) catTotal[primary] = (catTotal[primary] || 0) + 1;
        // Pour le compteur filtré, on inclut primary + extra_cats (cohérent avec le filtre catégorie)
        var allCats = [primary].concat((card.dataset.extraCats || "").split("|").filter(Boolean));
        if (card._passesNonCat) {
          allCats.forEach(function(cat) { if (cat) catFiltered[cat] = (catFiltered[cat] || 0) + 1; });
        }
      });
      var totalPasses = cards.filter(function(c) { return c._passesNonCat; }).length;
      catChipEls.forEach(function(chip) {
        var cat   = chip.dataset.category || "";
        var label = chip.dataset.label || chip.textContent.trim();
        if (!chip.dataset.label) chip.dataset.label = label; // cache on first call
        if (!anyNonCatFilter) {
          chip.textContent = chip.dataset.label;
        } else if (cat === "__owned__") {
          var ownedTotal = cards.filter(function(c) { return c.dataset.owned === "1"; }).length;
          var ownedFilt  = cards.filter(function(c) { return c.dataset.owned === "1" && c._passesNonCat; }).length;
          chip.textContent = chip.dataset.label + "\u00a0" + ownedFilt + "/" + ownedTotal;
        } else {
          var f = catFiltered[cat] || 0;
          var t = catTotal[cat] || 0;
          chip.textContent = chip.dataset.label + (t > 0 ? "\u00a0" + f + "/" + t : "");
        }
      });
    }

    // Tri
    var visible = cards.filter(function (c) { return !c.hidden; });
    visible.sort(function (a, b) {
      // Si recherche active : d'abord par score de pertinence, puis par le tri choisi
      if (q) {
        var diff = (scores.get(b) || 0) - (scores.get(a) || 0);
        if (diff !== 0) return diff;
      }
      switch (activeSort) {
        case "alpha-asc":   return (a.dataset.title || "").localeCompare(b.dataset.title || "", "fr", { sensitivity: "base" });
        case "alpha-desc":  return (b.dataset.title || "").localeCompare(a.dataset.title || "", "fr", { sensitivity: "base" });
        case "date-desc":   return Number(b.dataset.date) - Number(a.dataset.date);
        case "date-asc":    return Number(a.dataset.date) - Number(b.dataset.date);
        case "rating-desc": return Number(b.dataset.rating) - Number(a.dataset.rating);
        case "category":    return (a.dataset.category || "").localeCompare(b.dataset.category || "", "fr");
        default:            return 0;
      }
    });
    visible.forEach(function (card) { wikiList.appendChild(card); });

    // Pagination
    applyPagination(visible);

    // Compteur
    if (resultCount) {
      var showCount = q || hasAdv;
      resultCount.hidden = !showCount;
      if (showCount) {
        var n = visible.length;
        resultCount.textContent = n + "\u00a0r\u00e9sultat" + (n > 1 ? "s" : "");
      }
    }

    var heroCountEl = document.querySelector(".wiki-chapter-hero-count");
    if (heroCountEl) {
      var hasFilter = q || hasAdv || includedCategoriesSet.size > 0 || excludedCategoriesSet.size > 0 || includedTagsSet.size > 0 || excludedTagsSet.size > 0;
      heroCountEl.textContent = hasFilter ? (visible.length + "/" + cards.length) : cards.length;
    }

    // Page d'accueil wiki : bascule entre la vue native (intro + strips)
    // et la grille filtrée selon qu'un filtre est actif ou non.
    if (indexNative) {
      var _filtersActive = hasActiveFilters();
      indexNative.hidden = _filtersActive;
      if (wikiList) wikiList.hidden = !_filtersActive;
      if (!_filtersActive) {
        if (paginationEl) paginationEl.hidden = true;
        if (paginationTopEl) paginationTopEl.hidden = true;
      }
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  function applyPagination(visibleCards) {
    var pageSize = Math.ceil(25 / activeCols) * activeCols;
    var totalPages = Math.ceil(visibleCards.length / pageSize);
    if (totalPages <= 1) {
      visibleCards.forEach(function (c) { c.classList.remove("wiki-page-hidden"); });
      if (paginationEl) paginationEl.hidden = true;
      if (paginationTopEl) paginationTopEl.hidden = true;
      return;
    }
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * pageSize;
    var end = start + pageSize;
    visibleCards.forEach(function (c, i) {
      c.classList.toggle("wiki-page-hidden", i < start || i >= end);
    });
    if (paginationEl) { paginationEl.hidden = false; renderPaginationInto(paginationEl, totalPages); }
    if (paginationTopEl) { paginationTopEl.hidden = false; renderPaginationInto(paginationTopEl, totalPages); }
  }

  function renderPaginationInto(container, totalPages) {
    while (container.firstChild) container.removeChild(container.firstChild);
    function makePage(label, page, disabled) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.textContent = label;
      btn.className = "wiki-page-btn" + (page === currentPage ? " active" : "") + (disabled ? " disabled" : "");
      if (!disabled) {
        btn.addEventListener("click", function () {
          _paginationNavigation = true;
          currentPage = page;
          applyFilters();
          _paginationNavigation = false;
          wikiList.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return btn;
    }
    container.appendChild(makePage("\u2190", currentPage - 1, currentPage <= 1));
    for (var p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
        container.appendChild(makePage(String(p), p, false));
      } else if (p === currentPage - 2 || p === currentPage + 2) {
        var ellipsis = document.createElement("span");
        ellipsis.className = "wiki-page-ellipsis"; ellipsis.textContent = "\u2026";
        container.appendChild(ellipsis);
      }
    }
    container.appendChild(makePage("\u2192", currentPage + 1, currentPage >= totalPages));
  }

  // ── Cols selector ───────────────────────────────────────────────────────────
  function applyCols() {
    if (!wikiList) return;
    wikiList.className = wikiList.className.replace(/\bwiki-grid--cols-\d\b/g, "");
    wikiList.classList.add("wiki-grid--cols-" + activeCols);
    // Carousel: only in 1-2 cols mode, max 3 images
    var doCarousel = activeCols <= 2;
    wikiList.querySelectorAll(".wiki-card-image[data-images]").forEach(function (imgDiv) {
      var paths = imgDiv.dataset.images.split("|").filter(Boolean).slice(0, 3);
      if (paths.length <= 1) return;
      if (doCarousel) {
        enableCarousel(imgDiv, paths);
      } else {
        disableCarousel(imgDiv, paths[0]);
      }
    });
    // Sync select value
    if (colsSelect) colsSelect.value = String(activeCols);
  }

  function enableCarousel(imgDiv, paths) {
    if (imgDiv.dataset.carouselActive === "1") return;
    imgDiv.dataset.carouselActive = "1";
    var idx = Number(imgDiv.dataset.imgIdx || 0);
    var img = imgDiv.querySelector(".wiki-card-img");
    if (!img) return;

    var prevBtn = document.createElement("button");
    prevBtn.type = "button"; prevBtn.className = "wiki-card-carousel-btn wiki-card-carousel-btn--prev";
    prevBtn.setAttribute("aria-label", "Image pr\u00e9c\u00e9dente"); prevBtn.textContent = "\u2039";
    var nextBtn = document.createElement("button");
    nextBtn.type = "button"; nextBtn.className = "wiki-card-carousel-btn wiki-card-carousel-btn--next";
    nextBtn.setAttribute("aria-label", "Image suivante"); nextBtn.textContent = "\u203a";
    // Prevent card link navigation when clicking carousel buttons
    [prevBtn, nextBtn].forEach(function(b) { b.addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); }); });

    function goTo(newIdx) {
      idx = ((newIdx % paths.length) + paths.length) % paths.length;
      img.src = paths[idx];
      imgDiv.dataset.imgIdx = idx;
    }

    prevBtn.addEventListener("click", function (e) { e.preventDefault(); goTo(idx - 1); });
    nextBtn.addEventListener("click", function (e) { e.preventDefault(); goTo(idx + 1); });

    imgDiv.appendChild(prevBtn);
    imgDiv.appendChild(nextBtn);
  }

  function disableCarousel(imgDiv, firstPath) {
    if (imgDiv.dataset.carouselActive !== "1") return;
    imgDiv.dataset.carouselActive = "0";
    imgDiv.dataset.imgIdx = "0";
    var img = imgDiv.querySelector(".wiki-card-img");
    if (img) img.src = firstPath;
    imgDiv.querySelectorAll(".wiki-card-carousel-btn").forEach(function (el) { el.remove(); });
  }

  if (colsSelect) {
    colsSelect.addEventListener("change", function () {
      activeCols = Number(colsSelect.value);
      localStorage.setItem("wiki-cols", activeCols);
      applyCols();
      applyFilters();
    });
  }

  // Barre de recherche. applyFilters() rescore/trie/repagine toute la
  // grille : coûteux à chaque frappe sur une grosse collection, donc
  // léger débounce (l'input reste instantané, seul le filtrage est différé).
  var searchDebounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchQuery = searchInput.value;
      localStorage.setItem("wiki-filter-search", searchQuery);
      if (searchClear) searchClear.hidden = !searchQuery;
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(applyFilters, 120);
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", function () {
      searchQuery = "";
      localStorage.setItem("wiki-filter-search", "");
      if (searchInput) searchInput.value = "";
      searchClear.hidden = true;
      applyFilters();
    });
  }

  // Panneau avancé
  if (advToggle && advPanel) {
    advToggle.addEventListener("click", function () {
      advPanel.hidden = !advPanel.hidden;
      advToggle.innerHTML = advPanel.hidden ? "Filtres avanc\u00e9s &#9662;" : "Filtres avanc\u00e9s &#9652;";
    });
  }

  // Étoiles min dans le panneau avancé
  if (advStarsWrap) {
    var advStarBtns = advStarsWrap.querySelectorAll(".wiki-adv-star");
    function renderAdvStars() {
      advStarBtns.forEach(function (btn) {
        var v = Number(btn.dataset.value);
        btn.innerHTML = v <= advMinRating ? "&#9733;" : "&#9734;";
        btn.classList.toggle("active", v <= advMinRating);
      });
    }
    renderAdvStars(); // applique l'état restauré visuellement
    advStarBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = Number(btn.dataset.value);
        advMinRating = advMinRating === v ? 0 : v;
        localStorage.setItem("wiki-filter-rating", advMinRating);
        renderAdvStars();
        applyFilters();
      });
    });
    if (advStarReset) {
      advStarReset.addEventListener("click", function () {
        advMinRating = 0;
        localStorage.setItem("wiki-filter-rating", "0");
        renderAdvStars();
        applyFilters();
      });
    }
  }

  // Prop buttons (3-state)
  if (propGrid) {
    propGrid.querySelectorAll(".wiki-prop-btn").forEach(function(btn) {
      var prop = btn.dataset.prop;
      var saved = propStates[prop] || 0;
      btn.dataset.state = String(saved);
      btn.addEventListener("click", function() {
        var s = Number(btn.dataset.state);
        s = (s + 1) % 3;
        btn.dataset.state = String(s);
        propStates[prop] = s;
        localStorage.setItem("wiki-prop-" + prop, String(s));
        applyFilters();
      });
    });
  }

  // Filtre maturité (admin uniquement)
  var maturityFilterWrap = document.getElementById("wiki-maturity-filter");
  if (maturityFilterWrap) {
    // Restaure visuellement le filtre mémorisé
    if (activeMaturityFilter >= 0) {
      var restoredMBtn = maturityFilterWrap.querySelector('[data-level="' + activeMaturityFilter + '"]');
      if (restoredMBtn) restoredMBtn.classList.add("active");
    }
    maturityFilterWrap.querySelectorAll(".wiki-maturity-filter-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var lvl = Number(btn.dataset.level);
        if (activeMaturityFilter === lvl) {
          // Désactiver le filtre (toggle off)
          activeMaturityFilter = -1;
          localStorage.setItem("wiki-filter-maturity", "-1");
          maturityFilterWrap.querySelectorAll(".wiki-maturity-filter-btn").forEach(function(b) { b.classList.remove("active"); });
        } else {
          activeMaturityFilter = lvl;
          localStorage.setItem("wiki-filter-maturity", String(lvl));
          maturityFilterWrap.querySelectorAll(".wiki-maturity-filter-btn").forEach(function(b) { b.classList.remove("active"); });
          btn.classList.add("active");
        }
        applyFilters();
      });
    });
  }

  // Filtre sous-catégorie (objets)
  var sousCatFilterWrap = document.getElementById("wiki-sous-cat-filter");
  if (sousCatFilterWrap) {
    if (activeSousCat) {
      var restoredSCBtn = sousCatFilterWrap.querySelector('[data-sous-cat="' + activeSousCat + '"]');
      if (restoredSCBtn) restoredSCBtn.classList.add("active");
    }
    sousCatFilterWrap.querySelectorAll(".wiki-sous-cat-chip").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var sc = btn.dataset.sousCat || "";
        if (activeSousCat === sc) {
          activeSousCat = "";
          localStorage.removeItem("wiki-filter-sous-cat");
          sousCatFilterWrap.querySelectorAll(".wiki-sous-cat-chip").forEach(function(b) { b.classList.remove("active"); });
        } else {
          activeSousCat = sc;
          localStorage.setItem("wiki-filter-sous-cat", sc);
          sousCatFilterWrap.querySelectorAll(".wiki-sous-cat-chip").forEach(function(b) { b.classList.remove("active"); });
          btn.classList.add("active");
        }
        applyFilters();
      });
    });
  }

  if (categoryFilter) {
    // "Nos objets" (data-category="__owned__") vit hors de #wiki-category-filter,
    // sous Ultra/Irréaliste : on cible l'attribut data-category partout sur la
    // page plutôt que le conteneur, pour qu'il reste synchronisé avec les
    // vraies catégories. Multi-sélection à 3 états (neutre → inclure (vert)
    // → exclure (rouge) → neutre), comme les tags.
    function syncCatChip(chip) {
      var cat = chip.dataset.category || "";
      var state = includedCategoriesSet.has(cat) ? "1" : (excludedCategoriesSet.has(cat) ? "2" : "0");
      chip.dataset.state = state;
      chip.classList.toggle("chip-include", state === "1");
      chip.classList.toggle("chip-exclude", state === "2");
    }
    catChipEls.forEach(function (chip) {
      var cat = chip.dataset.category || "";
      syncCatChip(chip);
      chip.addEventListener("click", function () {
        var state = chip.dataset.state || "0";
        if (state === "0") {
          includedCategoriesSet.add(cat);
          excludedCategoriesSet.delete(cat);
        } else if (state === "1") {
          includedCategoriesSet.delete(cat);
          excludedCategoriesSet.add(cat);
        } else {
          includedCategoriesSet.delete(cat);
          excludedCategoriesSet.delete(cat);
        }
        syncCatChip(chip);
        localStorage.setItem("wiki-filter-cats-inc", JSON.stringify(Array.from(includedCategoriesSet)));
        localStorage.setItem("wiki-filter-cats-exc", JSON.stringify(Array.from(excludedCategoriesSet)));
        applyFilters();
      });
    });
  }
  if (tagFilter) {
    // Restore state from localStorage
    tagFilter.querySelectorAll(".wiki-tag-chip[data-tag]").forEach(function(chip) {
      var t = (chip.dataset.tag || "").toLowerCase();
      if (includedTagsSet.has(t)) chip.dataset.state = "1";
      else if (excludedTagsSet.has(t)) chip.dataset.state = "2";
      else chip.dataset.state = "0";
      chip.addEventListener("click", function() {
        var s = Number(chip.dataset.state);
        var t2 = (chip.dataset.tag || "").toLowerCase();
        // Remove from both sets first
        includedTagsSet.delete(t2);
        excludedTagsSet.delete(t2);
        s = (s + 1) % 3;
        chip.dataset.state = String(s);
        if (s === 1) includedTagsSet.add(t2);
        else if (s === 2) excludedTagsSet.add(t2);
        // Persist
        localStorage.setItem("wiki-filter-tags-inc", JSON.stringify(Array.from(includedTagsSet)));
        localStorage.setItem("wiki-filter-tags-exc", JSON.stringify(Array.from(excludedTagsSet)));
        currentPage = 1;
        applyFilters();
      });
    });
  }
  // ── Tag overflow (max 4 lignes = 12 chips, expand = 12 de plus) ──────────
  var TAG_PAGE = 12; // chips par palier (4 lignes × 3 cols)
  var TAG_MAX  = 24; // maximum affiché dans la sidebar
  var tagExpandedCount = TAG_PAGE;
  var tagExpandBtn = document.getElementById("wiki-tag-expand-btn");
  var tagAllLink   = document.getElementById("wiki-tag-all-link");

  function applyTagOverflow() {
    if (!tagFilter) return;
    var chips = tagFilter.querySelectorAll(".wiki-tag-chip[data-tag]");
    // Chips "smart-visibles" (non masquées par le filtre intelligent)
    var smartVisible = [];
    chips.forEach(function(chip) { if (!chip.hidden) smartVisible.push(chip); });
    var shown = 0;
    chips.forEach(function(chip) {
      if (chip.hidden) { chip.classList.remove("wiki-tag-overflow-hidden"); return; }
      if (shown < tagExpandedCount) {
        chip.classList.remove("wiki-tag-overflow-hidden");
        shown++;
      } else {
        chip.classList.add("wiki-tag-overflow-hidden");
      }
    });
    // Bouton Plus : visible si des chips débordent ET qu'on n'a pas atteint le max
    if (tagExpandBtn) {
      var overflow = smartVisible.length > tagExpandedCount;
      var canExpand = tagExpandedCount < TAG_MAX;
      tagExpandBtn.hidden = !(overflow && canExpand);
    }
    // Lien "Tous les tags" : visible seulement quand la liste est étendue (au moins 1 clic sur Plus)
    if (tagAllLink) {
      tagAllLink.hidden = tagExpandedCount <= TAG_PAGE;
    }
  }

  if (tagExpandBtn) {
    tagExpandBtn.addEventListener("click", function () {
      tagExpandedCount = Math.min(tagExpandedCount + TAG_PAGE, TAG_MAX);
      applyTagOverflow();
    });
  }

  // Réinitialise le niveau d'expansion quand la recherche de tag change
  var tagSearchDebounceTimer = null;
  if (tagSearchInput) {
    tagSearchInput.addEventListener("input", function () {
      clearTimeout(tagSearchDebounceTimer);
      tagSearchDebounceTimer = setTimeout(function () {
        tagExpandedCount = TAG_MAX; // on montre tout lors d'une recherche
        var q = tagSearchInput.value.trim().toLowerCase();
        if (tagFilter) {
          tagFilter.querySelectorAll(".wiki-tag-chip").forEach(function (chip) {
            var tag = (chip.dataset.tag || "").toLowerCase();
            chip.hidden = q.length > 0 && (chip.dataset.state || "0") === "0" && tag.indexOf(q) === -1;
          });
          applyTagOverflow();
        }
      }, 120);
    });
  }

  if (sortSelect) {
    sortSelect.value = activeSort;
    sortSelect.addEventListener("change", function () {
      activeSort = sortSelect.value;
      localStorage.setItem("wiki-filter-sort", activeSort);
      applyFilters();
    });
  }

  function syncUltraBtn() {
    if (!ultraToggle) return;
    ultraToggle.textContent = "Ultra";
    ultraToggle.classList.toggle("active", hideUltra);
  }
  if (ultraToggle) {
    ultraToggle.addEventListener("click", function () {
      hideUltra = !hideUltra;
      localStorage.setItem("wiki-hide-ultra", hideUltra ? "1" : "0");
      syncUltraBtn();
      applyFilters();
      // Sans cet appel, les cartes proposées du sommaire (Derniers ajouts,
      // Mieux notées...) ne reflétaient pas la bascule Ultra — seul le
      // bouton Irréaliste l'appelait.
      applyChapterStripFilters();
    });
  }
  syncUltraBtn();

  // Filtre les cartes dans les strips du sommaire (wiki-index)
  function applyChapterStripFilters() {
    document.querySelectorAll(".wiki-chapter-strip .wiki-card").forEach(function (card) {
      var isI = card.dataset.irrealiste === "1";
      var isU = card.dataset.ultra === "1" && !isI; // pure ultra only (not irréaliste)
      card.hidden = (hideIrrealiste && isI) || (hideUltra && isU);
    });
  }

  function syncIrralisteBtn() {
    if (!irrealisteToggle) return;
    irrealisteToggle.textContent = "Irr\u00e9aliste";
    irrealisteToggle.classList.toggle("active", hideIrrealiste);
  }
  if (irrealisteToggle) {
    irrealisteToggle.addEventListener("click", function () {
      hideIrrealiste = !hideIrrealiste;
      localStorage.setItem("wiki-hide-irrealiste", hideIrrealiste ? "1" : "0");
      syncIrralisteBtn();
      applyFilters();
      applyChapterStripFilters();
    });
  }
  syncIrralisteBtn();
  applyChapterStripFilters();

  // Reset filters
  var resetFiltersBtn = document.getElementById("wiki-reset-filters");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", function() {
      // Revient aux reglages de compte (voir /favoris > Parametres) et
      // oublie la bascule mémorisée, sinon elle reviendrait au prochain chargement.
      localStorage.removeItem("wiki-hide-ultra");
      localStorage.removeItem("wiki-hide-irrealiste");
      hideUltra = (window.ULTRA_MODE || "hidden") === "hidden";
      hideIrrealiste = (window.IRREALISTE_MODE || "visible") === "hidden";
      syncUltraBtn();
      syncIrralisteBtn();
      // Catégories : plus rien inclus/exclu
      includedCategoriesSet.clear();
      excludedCategoriesSet.clear();
      localStorage.setItem("wiki-filter-cats-inc", "[]");
      localStorage.setItem("wiki-filter-cats-exc", "[]");
      catChipEls.forEach(function(c) {
        c.dataset.state = "0";
        c.classList.remove("chip-include", "chip-exclude");
      });
      // Tags
      includedTagsSet.clear();
      excludedTagsSet.clear();
      localStorage.setItem("wiki-filter-tags-inc", "[]");
      localStorage.setItem("wiki-filter-tags-exc", "[]");
      if (tagFilter) {
        tagFilter.querySelectorAll(".wiki-tag-chip").forEach(function(c) {
          c.dataset.state = "0";
          c.classList.remove("chip-include","chip-exclude");
          c.hidden = false;
        });
      }
      // Recherche de tag + niveau d'expansion du nuage (voir "Plus"/"Tous
      // les tags") : sans ça, le volet restait déplié après réinitialisation.
      tagExpandedCount = TAG_PAGE;
      if (tagSearchInput) tagSearchInput.value = "";
      // Propriétés
      for (var pk in propStates) { propStates[pk] = 0; localStorage.setItem("wiki-prop-" + pk, "0"); }
      if (propGrid) {
        propGrid.querySelectorAll(".wiki-prop-btn").forEach(function(b) {
          b.dataset.state = "0";
          b.classList.remove("active","chip-include","chip-exclude");
        });
      }
      // Note minimale
      advMinRating = 0;
      localStorage.setItem("wiki-filter-rating", "0");
      if (advStarsWrap) {
        advStarsWrap.querySelectorAll(".wiki-adv-star").forEach(function(s) { s.classList.remove("active"); });
      }
      // Recherche
      searchQuery = "";
      localStorage.setItem("wiki-filter-search", "");
      if (searchInput) { searchInput.value = ""; }
      if (searchClear) searchClear.hidden = true;
      // Sous-catégorie
      activeSousCat = "";
      localStorage.removeItem("wiki-filter-sous-cat");
      if (sousCatFilterWrap) {
        sousCatFilterWrap.querySelectorAll(".wiki-sous-cat-chip").forEach(function(b) { b.classList.remove("active"); });
      }
      applyFilters();
      applyChapterStripFilters();
    });
  }

  // ── Profils de recherche (voir partials/filter-profiles.ejs) ────────────
  // Toutes les dimensions du filtre Codex vivent déjà dans localStorage (une
  // clé par dimension, lues plus haut dans ce fichier) : un profil de
  // recherche n'est donc qu'un instantané nommé de ces clés — l'appliquer
  // revient à les réécrire puis recharger la page, qui se réinitialise
  // alors exactement comme un retour normal sur le Codex avec ces réglages.
  (function () {
    var WIKI_PROFILE_KEYS = [
      "wiki-filter-cats-inc", "wiki-filter-cats-exc",
      "wiki-prop-not-rated", "wiki-prop-flame", "wiki-prop-interested",
      "wiki-filter-tags-inc", "wiki-filter-tags-exc",
      "wiki-filter-sort",
      "wiki-hide-ultra", "wiki-hide-irrealiste",
      "wiki-filter-search",
      "wiki-filter-rating",
      "wiki-filter-special",
      "wiki-filter-sous-cat"
    ];
    var saveBtn    = document.getElementById("wiki-save-filter-btn");
    var modal      = document.getElementById("wiki-filter-profile-modal");
    var nameInput  = document.getElementById("wiki-filter-profile-name");
    var confirmBtn = document.getElementById("wiki-filter-profile-confirm");
    var cancelBtn  = document.getElementById("wiki-filter-profile-cancel");
    var listEl     = document.getElementById("wiki-filter-profiles-list");
    if (!saveBtn && !listEl) return;

    function syncSaveBtn() {
      if (saveBtn) saveBtn.hidden = !hasActiveFilters();
    }
    syncSaveBtn();
    // hasActiveFilters() dépend de variables mises à jour un peu partout
    // dans applyFilters() : plus sûr de resynchroniser à chaque appel que
    // de dupliquer sa logique ici. applyFilters est une déclaration de
    // fonction (hoisted) : la réaffecter après coup est sans risque, tous
    // les appelants existants (déclarés plus haut) la référencent par son
    // nom au moment de l'appel, pas au moment de leur déclaration.
    var _origApplyFilters = applyFilters;
    applyFilters = function () {
      _origApplyFilters();
      syncSaveBtn();
    };

    function collectState() {
      var state = {};
      WIKI_PROFILE_KEYS.forEach(function (k) {
        var v = localStorage.getItem(k);
        if (v !== null) state[k] = v;
      });
      return state;
    }

    function openModal() {
      if (!modal) return;
      if (nameInput) nameInput.value = "";
      modal.hidden = false;
      if (nameInput) nameInput.focus();
    }
    function closeModal() { if (modal) modal.hidden = true; }

    if (saveBtn) saveBtn.addEventListener("click", openModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    }
    if (nameInput) {
      nameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && confirmBtn) confirmBtn.click();
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        var name = nameInput ? nameInput.value.trim() : "";
        if (!name) return;
        confirmBtn.disabled = true;
        fetch("/api/filter-profils", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "wiki", name: name, state: collectState() })
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            confirmBtn.disabled = false;
            if (!d.ok) return;
            closeModal();
            window.location.reload();
          })
          .catch(function () { confirmBtn.disabled = false; });
      });
    }

    if (listEl) {
      listEl.addEventListener("click", function (e) {
        var chip = e.target.closest(".filter-profile-chip");
        if (!chip) return;
        var id = Number(chip.dataset.profileId);

        if (e.target.closest(".filter-profile-apply")) {
          var profile = (window.WIKI_FILTER_PROFILES || []).find(function (p) { return p.id === id; });
          if (!profile) return;
          WIKI_PROFILE_KEYS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(profile.state, k)) localStorage.setItem(k, profile.state[k]);
            else localStorage.removeItem(k);
          });
          window.location.href = "/wiki";
          return;
        }

        var removeBtn = e.target.closest(".filter-profile-remove");
        if (removeBtn) {
          removeBtn.disabled = true;
          fetch("/api/filter-profils/" + id, { method: "DELETE" })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d.ok) { removeBtn.disabled = false; return; }
              chip.remove();
              if (!listEl.querySelector(".filter-profile-chip")) {
                var details = listEl.closest(".filter-profiles-details");
                if (details) details.hidden = true;
              }
            })
            .catch(function () { removeBtn.disabled = false; });
        }
      });
    }
  })();

  // Restaure la barre de recherche
  if (searchInput && searchQuery) {
    searchInput.value = searchQuery;
    if (searchClear) searchClear.hidden = false;
  }
  // Ouvre le panneau avancé si un filtre avancé est actif
  var _anyPropInit = false;
  for (var _pki in propStates) { if (propStates[_pki] !== 0) { _anyPropInit = true; break; } }
  var anyAdv = advMinRating > 0 || _anyPropInit || includedTagsSet.size > 0 || excludedTagsSet.size > 0;
  if (advPanel && anyAdv) {
    advPanel.hidden = false;
    if (advToggle) advToggle.innerHTML = "Filtres avanc\u00e9s &#9652;";
  }

  var filtersPanel = document.getElementById("wiki-filters-panel");
  var anyCatFilter = includedCategoriesSet.size > 0 || excludedCategoriesSet.size > 0;
  if (filtersPanel && (anyAdv || anyCatFilter || activeSort !== "alpha-asc" || !hideUltra || !hideIrrealiste)) {
    filtersPanel.open = true;
  }

  // Filtre spécial (ultra/irréaliste inclusif)
  if (specialFilter) {
    // Restaure l'état actif
    if (activeSpecialFilter) {
      specialFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
        chip.classList.toggle("active", (chip.dataset.special || "") === activeSpecialFilter);
      });
    }
    specialFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        activeSpecialFilter = chip.dataset.special || "";
        localStorage.setItem("wiki-filter-special", activeSpecialFilter);
        specialFilter.querySelectorAll(".tag-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        applyFilters();
      });
    });
  }

  // Filtre catégories liées (3 états)
  if (extraCatFilter) {
    extraCatFilter.querySelectorAll(".wiki-extra-cat-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var cat = chip.dataset.cat;
        var state = chip.dataset.state || "0";
        if (state === "0") {
          chip.dataset.state = "1";
          includedExtraCats.add(cat);
          excludedExtraCats.delete(cat);
          chip.classList.add("wiki-extra-cat-include");
          chip.classList.remove("wiki-extra-cat-exclude");
        } else if (state === "1") {
          chip.dataset.state = "2";
          includedExtraCats.delete(cat);
          excludedExtraCats.add(cat);
          chip.classList.remove("wiki-extra-cat-include");
          chip.classList.add("wiki-extra-cat-exclude");
        } else {
          chip.dataset.state = "0";
          includedExtraCats.delete(cat);
          excludedExtraCats.delete(cat);
          chip.classList.remove("wiki-extra-cat-include", "wiki-extra-cat-exclude");
        }
        applyFilters();
      });
    });
  }

  applyCols(); // applique le nombre de colonnes et les carousels
  applyFilters(); // toujours appelé au chargement
  applyTagOverflow(); // collapse les tags au-delà de 4 lignes

  // ══════════════════════════════════════════════════
  // 7. AUTO-RESIZE TEXTAREA
  // ══════════════════════════════════════════════════
  function autoResize(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }
  document.querySelectorAll(".wiki-textarea").forEach(function (ta) {
    ta.addEventListener("input", function () { autoResize(ta); });
    autoResize(ta);
  });

  // ══════════════════════════════════════════════════
  // 8. PREVIEW IMAGES MULTIPLES + SUPPRESSION
  // ══════════════════════════════════════════════════
  document.querySelectorAll(".wiki-image-field").forEach(function (wrapper) {
    var input        = wrapper.querySelector(".wiki-image-input");
    var previewsZone = wrapper.querySelector(".wiki-new-previews");
    if (!input || !previewsZone) return;

    // DataTransfer permet de reconstruire la FileList après suppression d'un fichier
    var currentFiles = [];

    function rebuildInput() {
      var dt = new DataTransfer();
      currentFiles.forEach(function (f) { dt.items.add(f); });
      input.files = dt.files;
    }

    function renderPreviews() {
      previewsZone.innerHTML = "";
      // Vérifie si la couverture est déjà une image existante (radio coché hors previewsZone)
      var form = wrapper.closest("form");
      var existingCoverChecked = form && !!form.querySelector(".wiki-cover-radio:checked");

      currentFiles.forEach(function (file, idx) {
        var wrap = document.createElement("div");
        wrap.className = "wiki-new-preview-wrap";

        var img = document.createElement("img");
        img.className = "wiki-new-preview-img";
        img.src = URL.createObjectURL(file);
        img.alt = "";
        img.addEventListener("click", function () { openLightbox(img.src); });

        // Radio couverture
        var coverLabel = document.createElement("label");
        coverLabel.className = "wiki-cover-radio-label";
        coverLabel.title = "D\u00e9finir comme couverture";
        var coverRadio = document.createElement("input");
        coverRadio.type = "radio";
        coverRadio.name = "cover_image";
        coverRadio.value = "__new__:" + idx;
        coverRadio.className = "wiki-cover-radio";
        // Si aucune image existante n'est déjà couverte et c'est le premier fichier nouveau
        if (!existingCoverChecked && idx === 0) coverRadio.checked = true;
        var coverStar = document.createElement("span");
        coverStar.className = "wiki-cover-badge-icon";
        coverStar.innerHTML = "&#9733;";
        coverLabel.appendChild(coverRadio);
        coverLabel.appendChild(coverStar);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "wiki-preview-remove";
        removeBtn.innerHTML = "&#215;";
        removeBtn.title = "Retirer";
        removeBtn.addEventListener("click", function () {
          currentFiles.splice(idx, 1);
          rebuildInput();
          renderPreviews();
        });

        wrap.appendChild(img);
        wrap.appendChild(coverLabel);
        wrap.appendChild(removeBtn);
        previewsZone.appendChild(wrap);
      });
    }

    input.addEventListener("change", function () {
      Array.from(input.files || []).forEach(function (f) {
        // Évite les doublons (même nom + même taille)
        var exists = currentFiles.some(function (e) { return e.name === f.name && e.size === f.size; });
        if (!exists) currentFiles.push(f);
      });
      rebuildInput();
      renderPreviews();
    });
  });

  // ══════════════════════════════════════════════════
  // LIGHTBOX + ASSOCIATIONS + NAVIGATION
  // ══════════════════════════════════════════════════
  var lightbox = document.createElement("div");
  lightbox.className = "wiki-lightbox";
  lightbox.innerHTML = [
    '<button class="wiki-lightbox-close" title="Fermer">&#215;</button>',
    '<button class="wiki-lightbox-prev" title="Image pr\u00e9c\u00e9dente">&#8249;</button>',
    '<button class="wiki-lightbox-next" title="Image suivante">&#8250;</button>',
    '<div class="wiki-lightbox-inner">',
      '<img class="wiki-lightbox-img" alt="" />',
      '<div class="wiki-lightbox-panel" hidden>',
        '<div class="wiki-lb-meta-section">',
          '<div class="wiki-lb-meta-tags"></div>',
          '<div class="wiki-lb-meta-tag-edit" hidden>',
            '<input type="text" class="wiki-lb-meta-tag-input" placeholder="Ajouter un tag\u2026" autocomplete="off" />',
          '</div>',
          '<div class="wiki-lb-meta-fields">',
            '<div class="wiki-lb-meta-field" data-field="author">',
              '<span class="wiki-lb-meta-label">Auteur</span>',
              '<span class="wiki-lb-meta-value"></span>',
              '<div class="wiki-lb-meta-edit" hidden>',
                '<input type="text" class="wiki-lb-meta-input" placeholder="Auteur\u2026" autocomplete="off" />',
                '<ul class="wiki-lb-meta-suggest"></ul>',
              '</div>',
            '</div>',
            '<div class="wiki-lb-meta-field" data-field="parody">',
              '<span class="wiki-lb-meta-label">Parodie</span>',
              '<span class="wiki-lb-meta-value"></span>',
              '<div class="wiki-lb-meta-edit" hidden>',
                '<input type="text" class="wiki-lb-meta-input" placeholder="Parodie\u2026" autocomplete="off" />',
                '<ul class="wiki-lb-meta-suggest"></ul>',
              '</div>',
            '</div>',
          '</div>',
          '<button class="wiki-lb-meta-edit-btn" hidden>Modifier</button>',
          '<div class="wiki-lb-meta-save-row" hidden>',
            '<button class="wiki-lb-meta-save">Enregistrer</button>',
            '<button class="wiki-lb-meta-cancel">Annuler</button>',
          '</div>',
        '</div>',
        '<div class="wiki-lb-pages-section">',
          '<div class="wiki-lightbox-panel-title">Pages li&#233;es</div>',
          '<ul class="wiki-lightbox-links"></ul>',
          '<div class="wiki-lightbox-search">',
            '<input type="text" class="wiki-lightbox-search-input" placeholder="Rechercher une page\u2026" autocomplete="off" />',
            '<ul class="wiki-lightbox-results"></ul>',
          '</div>',
        '</div>',
      '</div>',
    '</div>',
  ].join("");
  lightbox.hidden = true;
  document.body.appendChild(lightbox);

  var lbImg      = lightbox.querySelector(".wiki-lightbox-img");
  var lbPanel    = lightbox.querySelector(".wiki-lightbox-panel");
  var lbPagesSection = lightbox.querySelector(".wiki-lb-pages-section");
  var lbLinks    = lightbox.querySelector(".wiki-lightbox-links");
  var lbSearch   = lightbox.querySelector(".wiki-lightbox-search-input");
  var lbResults  = lightbox.querySelector(".wiki-lightbox-results");
  var lbCloseBtn = lightbox.querySelector(".wiki-lightbox-close");
  var lbPrevBtn  = lightbox.querySelector(".wiki-lightbox-prev");
  var lbNextBtn  = lightbox.querySelector(".wiki-lightbox-next");

  var lbMetaSection  = lightbox.querySelector(".wiki-lb-meta-section");
  var lbMetaTags     = lightbox.querySelector(".wiki-lb-meta-tags");
  var lbMetaFields   = lightbox.querySelector(".wiki-lb-meta-fields");
  var lbMetaEditBtn  = lightbox.querySelector(".wiki-lb-meta-edit-btn");
  var lbMetaSaveRow  = lightbox.querySelector(".wiki-lb-meta-save-row");
  var lbMetaSaveBtn  = lightbox.querySelector(".wiki-lb-meta-save");
  var lbMetaCancelBtn= lightbox.querySelector(".wiki-lb-meta-cancel");
  var lbTagEditWrap  = lightbox.querySelector(".wiki-lb-meta-tag-edit");
  var lbTagInput     = lightbox.querySelector(".wiki-lb-meta-tag-input");
  var lbCurrentMeta  = null; // { id, tags, author, parody }
  var lbEditMode     = false;
  var lbCanEdit      = typeof window.GALLERY_CAN_EDIT !== "undefined" ? window.GALLERY_CAN_EDIT : false;

  // Liste des src de la page dans l'ordre DOM, et index courant
  var lbSrcs = [];
  var lbIndex = 0;
  var lbCurrentSrc = "";

  function lbGetSrc(img) {
    var src = img.dataset.src || img.getAttribute("src");
    if (src && !src.startsWith("blob:") && !src.startsWith("/")) src = "/" + src;
    return src || "";
  }

  function rebuildSrcList() {
    lbSrcs = [];
    document.querySelectorAll(".wiki-infobox-img, .wiki-gallery-img, .wiki-form-existing-image, .wiki-card-img, .wiki-var-img, .wiki-right-img, .wiki-secondary-img, .wiki-scenario-img").forEach(function (img) {
      var src = lbGetSrc(img);
      if (src) lbSrcs.push(src);
    });
    // Ajoute aussi les previews de nouvelles images (blob:)
    document.querySelectorAll(".wiki-new-preview-img").forEach(function (img) {
      if (img.src) lbSrcs.push(img.src);
    });
  }

  function syncNavButtons() {
    var multi = lbSrcs.length > 1;
    lbPrevBtn.hidden = !multi;
    lbNextBtn.hidden = !multi;
  }

  // Charge et affiche les associations pour l'image en cours
  function loadLinks() {
    if (!lbCurrentSrc.startsWith("/uploads/")) return;
    lbLinks.innerHTML = "";
    fetch("/wiki/image-links?src=" + encodeURIComponent(lbCurrentSrc))
      .then(function (r) { return r.json(); })
      .then(function (pages) {
        lbLinks.innerHTML = "";
        if (!pages.length) {
          lbPagesSection.hidden = true;
          return;
        }
        lbPagesSection.hidden = false;
        pages.forEach(function (page) {
          var li = document.createElement("li");
          li.className = "wiki-lb-link-item";
          var a = document.createElement("a");
          a.href = "/wiki/" + page.id;
          a.textContent = page.title;
          a.className = "wiki-lb-page-link";
          var rm = document.createElement("button");
          rm.type = "button";
          rm.className = "wiki-lb-unlink";
          rm.innerHTML = "&#215;";
          rm.title = "D\u00e9sassocier";
          rm.addEventListener("click", function (e) {
            e.preventDefault();
            fetch("/wiki/image-links", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ src: lbCurrentSrc, page_id: page.id }),
            }).then(loadLinks);
          });
          li.appendChild(a);
          li.appendChild(rm);
          lbLinks.appendChild(li);
        });
      });
  }

  var lbTagCounts = null; // { pages: {tag: n}, images: {tag: n} }
  function ensureTagCounts(cb) {
    if (lbTagCounts) { cb(); return; }
    fetch("/wiki/tag-counts")
      .then(function(r) { return r.json(); })
      .then(function(data) { lbTagCounts = data; cb(); })
      .catch(function() { lbTagCounts = { pages: {}, images: {} }; cb(); });
  }

  function renderMetaTags(tags, editable) {
    lbMetaTags.innerHTML = "";
    tags.forEach(function(tag) {
      var chip = document.createElement("span");
      chip.className = "wiki-lb-tag-chip";
      var label = document.createTextNode(tag);
      chip.appendChild(label);
      if (!editable && lbTagCounts) {
        var np = lbTagCounts.pages[tag] || 0;
        var ni = lbTagCounts.images[tag] || 0;
        if (np || ni) {
          var xy = document.createElement("span");
          xy.className = "wiki-tag-xy";
          var sp = document.createElement("span");
          sp.className = "wiki-tag-xy-pages";
          sp.textContent = np;
          var si = document.createElement("span");
          si.className = "wiki-tag-xy-imgs";
          si.textContent = ni;
          xy.appendChild(sp);
          xy.appendChild(document.createTextNode("|"));
          xy.appendChild(si);
          chip.appendChild(xy);
        }
      }
      if (editable) {
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "wiki-lb-tag-rm";
        rm.innerHTML = "&#215;";
        rm.title = "Supprimer";
        rm.addEventListener("click", function() {
          lbCurrentMeta.tags = lbCurrentMeta.tags.filter(function(t) { return t !== tag; });
          renderMetaTags(lbCurrentMeta.tags, true);
        });
        chip.appendChild(rm);
      }
      lbMetaTags.appendChild(chip);
    });
  }

  function enterEditMode() {
    if (!lbCurrentMeta) return;
    lbEditMode = true;
    lbMetaEditBtn.hidden = true;
    lbMetaSaveRow.hidden = false;
    lbTagEditWrap.hidden = false;
    renderMetaTags(lbCurrentMeta.tags, true);
    // Champs author/parody
    lbMetaFields.querySelectorAll(".wiki-lb-meta-field").forEach(function(field) {
      field.querySelector(".wiki-lb-meta-label").hidden = true;
      field.querySelector(".wiki-lb-meta-value").hidden = true;
      field.querySelector(".wiki-lb-meta-edit").hidden = false;
      field.querySelector(".wiki-lb-meta-input").value = lbCurrentMeta[field.dataset.field] || "";
    });
  }

  var LB_FIELD_PLACEHOLDER = { author: "Inconnu", parody: "Non" };

  function exitEditMode() {
    lbEditMode = false;
    lbMetaEditBtn.hidden = !lbCanEdit || !lbCurrentMeta;
    lbMetaSaveRow.hidden = true;
    lbTagEditWrap.hidden = true;
    if (!lbCurrentMeta) return;
    renderMetaTags(lbCurrentMeta.tags, false);
    lbMetaFields.querySelectorAll(".wiki-lb-meta-field").forEach(function(field) {
      var key = field.dataset.field;
      var val = lbCurrentMeta[key] || "";
      var valueEl = field.querySelector(".wiki-lb-meta-value");
      field.querySelector(".wiki-lb-meta-label").hidden = false;
      valueEl.hidden = false;
      valueEl.textContent = val || LB_FIELD_PLACEHOLDER[key] || "N/A";
      valueEl.classList.toggle("wiki-lb-meta-placeholder", !val);
      field.querySelector(".wiki-lb-meta-edit").hidden = true;
      field.hidden = false;
    });
  }

  function loadMeta() {
    if (!lbCurrentSrc.startsWith("/uploads/")) {
      lbMetaSection.hidden = true;
      lbCurrentMeta = null;
      return;
    }
    ensureTagCounts(function() {
    fetch("/galerie/image-meta?src=" + encodeURIComponent(lbCurrentSrc))
      .then(function(r) { return r.json(); })
      .then(function(meta) {
        lbMetaSection.hidden = false;
        lbCurrentMeta = meta || null;
        lbEditMode = false;
        // Toujours afficher auteur/parodie, même sans enregistrement DB
        lbMetaTags.innerHTML = "";
        if (meta && meta.tags && meta.tags.length) renderMetaTags(meta.tags, false);
        lbMetaEditBtn.hidden = !lbCanEdit || !meta;
        lbMetaSaveRow.hidden = true;
        lbTagEditWrap.hidden = true;
        lbMetaFields.querySelectorAll(".wiki-lb-meta-field").forEach(function(field) {
          var key = field.dataset.field;
          var val = (meta && meta[key]) || "";
          var valueEl = field.querySelector(".wiki-lb-meta-value");
          valueEl.hidden = false;
          valueEl.textContent = val || LB_FIELD_PLACEHOLDER[key] || "N/A";
          valueEl.classList.toggle("wiki-lb-meta-placeholder", !val);
          field.querySelector(".wiki-lb-meta-edit").hidden = true;
          field.hidden = false;
        });
      });
    }); // ensureTagCounts
  }

  // Recherche de pages à associer
  var lbSearchTimer;
  lbSearch.addEventListener("input", function () {
    clearTimeout(lbSearchTimer);
    lbSearchTimer = setTimeout(function () {
      var q = lbSearch.value.trim();
      fetch("/wiki/search?q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (pages) {
          lbResults.innerHTML = "";
          pages.forEach(function (page) {
            var li = document.createElement("li");
            li.className = "wiki-lb-result-item";
            li.textContent = page.title;
            li.addEventListener("click", function () {
              fetch("/wiki/image-links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ src: lbCurrentSrc, page_id: page.id }),
              }).then(function () {
                lbSearch.value = "";
                lbResults.innerHTML = "";
                loadLinks();
              });
            });
            lbResults.appendChild(li);
          });
        });
    }, 250);
  });

  function showImage(src) {
    lbCurrentSrc = src;
    lbImg.src = src;
    if (src.startsWith("/uploads/")) {
      lbPanel.hidden = false;
      lbPagesSection.hidden = true;
      lbSearch.value = "";
      lbResults.innerHTML = "";
      loadMeta();
      loadLinks();
    } else {
      lbPanel.hidden = true;
    }
  }

  function openLightbox(src) {
    rebuildSrcList();
    lbIndex = lbSrcs.indexOf(src);
    if (lbIndex === -1) lbIndex = 0;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    syncNavButtons();
    showImage(src);
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.src = "";
    lbCurrentSrc = "";
    document.body.style.overflow = "";
  }

  function lbNavigate(dir) {
    if (!lbSrcs.length) return;
    lbIndex = (lbIndex + dir + lbSrcs.length) % lbSrcs.length;
    showImage(lbSrcs[lbIndex]);
  }

  // Bouton Modifier (affiche formulaire d'édition)
  lbMetaEditBtn.addEventListener("click", enterEditMode);

  // Bouton Annuler
  lbMetaCancelBtn.addEventListener("click", function() {
    // Réinitialiser depuis le meta courant (pas encore modifié)
    fetch("/galerie/image-meta?src=" + encodeURIComponent(lbCurrentSrc))
      .then(function(r) { return r.json(); })
      .then(function(meta) {
        lbCurrentMeta = meta || lbCurrentMeta;
        exitEditMode();
      });
  });

  // Bouton Enregistrer
  lbMetaSaveBtn.addEventListener("click", function() {
    if (!lbCurrentMeta) return;
    // Récupérer les valeurs des inputs author/parody
    lbMetaFields.querySelectorAll(".wiki-lb-meta-field").forEach(function(field) {
      lbCurrentMeta[field.dataset.field] = field.querySelector(".wiki-lb-meta-input").value.trim();
    });
    fetch("/galerie/image-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lbCurrentMeta.id, tags: lbCurrentMeta.tags, author: lbCurrentMeta.author, parody: lbCurrentMeta.parody }),
    }).then(function(r) { return r.json(); }).then(function(d) {
      if (d.ok) exitEditMode();
    });
  });

  // Ajout d'un tag via input
  lbTagInput.addEventListener("keydown", function(e) {
    if (e.key !== "Enter") return;
    var tag = lbTagInput.value.trim().toLowerCase();
    if (tag && lbCurrentMeta && lbCurrentMeta.tags.indexOf(tag) === -1) {
      lbCurrentMeta.tags.push(tag);
      renderMetaTags(lbCurrentMeta.tags, true);
    }
    lbTagInput.value = "";
  });

  // Autocomplete pour author/parody
  lbMetaFields.querySelectorAll(".wiki-lb-meta-field").forEach(function(field) {
    var input   = field.querySelector(".wiki-lb-meta-input");
    var suggest = field.querySelector(".wiki-lb-meta-suggest");
    var apiPath = field.dataset.field === "author" ? "/galerie/autocomplete/authors" : "/galerie/autocomplete/parodies";
    var timer;
    input.addEventListener("input", function() {
      clearTimeout(timer);
      var q = input.value.trim();
      if (!q) { suggest.innerHTML = ""; suggest.hidden = true; return; }
      timer = setTimeout(function() {
        fetch(apiPath + "?q=" + encodeURIComponent(q))
          .then(function(r) { return r.json(); })
          .then(function(results) {
            suggest.innerHTML = "";
            if (!results.length) { suggest.hidden = true; return; }
            suggest.hidden = false;
            results.forEach(function(val) {
              var li = document.createElement("li");
              li.textContent = val;
              li.addEventListener("click", function() {
                input.value = val;
                suggest.innerHTML = "";
                suggest.hidden = true;
              });
              suggest.appendChild(li);
            });
          });
      }, 200);
    });
    input.addEventListener("blur", function() {
      setTimeout(function() { suggest.hidden = true; }, 200);
    });
  });

  // Boutons close / prev / next
  lbCloseBtn.addEventListener("click", function (e) { e.stopPropagation(); closeLightbox(); });
  lbPrevBtn.addEventListener("click",  function (e) { e.stopPropagation(); lbNavigate(-1); });
  lbNextBtn.addEventListener("click",  function (e) { e.stopPropagation(); lbNavigate(+1); });

  // Clic sur l'overlay (fond) → fermer
  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  // Clavier : Échap, flèches
  document.addEventListener("keydown", function (e) {
    if (lightbox.hidden) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  lbNavigate(-1);
    if (e.key === "ArrowRight") lbNavigate(+1);
  });

  // Swipe tactile
  var lbTouchStartX = 0;
  lightbox.addEventListener("touchstart", function (e) {
    lbTouchStartX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener("touchend", function (e) {
    var dx = e.changedTouches[0].clientX - lbTouchStartX;
    if (Math.abs(dx) > 50) lbNavigate(dx < 0 ? +1 : -1);
  }, { passive: true });

  // Rend cliquables toutes les images de la galerie, des formulaires et des variantes
  function attachLightboxToImages() {
    document.querySelectorAll(".wiki-infobox-img, .wiki-gallery-img, .wiki-form-existing-image, .wiki-card-img, .wiki-var-img, .wiki-right-img, .wiki-secondary-img, .wiki-scenario-img").forEach(function (img) {
      if (img.dataset.lbBound) return;
      // Les images dans les cartes de liste naviguent vers la page wiki — pas de lightbox
      if (img.closest(".wiki-card")) return;
      img.dataset.lbBound = "1";
      img.style.cursor = "zoom-in";
      img.addEventListener("click", function () {
        openLightbox(lbGetSrc(img));
      });
    });
  }
  attachLightboxToImages();

  // Rebind au premier open de chaque variante (images pas encore dans le DOM visuel)
  document.querySelectorAll(".wiki-var-detail").forEach(function (det) {
    det.addEventListener("toggle", function () {
      if (det.open) attachLightboxToImages();
    });
  });

  // ══════════════════════════════════════════════════
  // 9. NAVIGATION ENTRE PAGES WIKI (←/→ + swipe)
  // ══════════════════════════════════════════════════
  var wikiNavPrev = document.getElementById("wiki-nav-prev");
  var wikiNavNext = document.getElementById("wiki-nav-next");

  if (wikiNavPrev || wikiNavNext) {
    // Clavier : ← et → (ignoré si focus dans un champ de saisie)
    document.addEventListener("keydown", function (e) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (lightbox && !lightbox.hidden) return; // lightbox a la priorité
      if (e.key === "ArrowLeft"  && wikiNavPrev) { e.preventDefault(); location.href = wikiNavPrev.href; }
      if (e.key === "ArrowRight" && wikiNavNext) { e.preventDefault(); location.href = wikiNavNext.href; }
    });

    // Swipe horizontal sur tout le document
    var pageSwipeStartX = 0;
    var pageSwipeStartY = 0;
    document.addEventListener("touchstart", function (e) {
      pageSwipeStartX = e.touches[0].clientX;
      pageSwipeStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener("touchend", function (e) {
      if (lightbox && !lightbox.hidden) return; // lightbox gère son propre swipe
      var dx = e.changedTouches[0].clientX - pageSwipeStartX;
      var dy = e.changedTouches[0].clientY - pageSwipeStartY;
      // Swipe horizontal dominant (> 80px, moins de 60px vertical)
      if (Math.abs(dx) > 80 && Math.abs(dy) < 60) {
        if (dx < 0 && wikiNavNext) location.href = wikiNavNext.href; // swipe gauche = suivant
        if (dx > 0 && wikiNavPrev) location.href = wikiNavPrev.href; // swipe droit = précédent
      }
    }, { passive: true });
  }

  // ══════════════════════════════════════════════════
  // 10. TOOLBAR MARKDOWN
  // ══════════════════════════════════════════════════
  function insertMd(ta, action) {
    var start = ta.selectionStart, end = ta.selectionEnd;
    var sel   = ta.value.slice(start, end);
    var before = ta.value.slice(0, start), after = ta.value.slice(end);
    var insert, cursor;

    switch (action) {
      case "bold":
        insert = "**" + (sel || "texte") + "**";
        cursor = sel ? start + insert.length : start + 2;
        break;
      case "italic":
        insert = "*" + (sel || "texte") + "*";
        cursor = sel ? start + insert.length : start + 1;
        break;
      case "h2": {
        var ls = before.lastIndexOf("\n") + 1;
        var lt = before.slice(ls).replace(/^#{1,6}\s*/, "");
        before = before.slice(0, ls) + "## " + lt;
        ta.value = before + sel + after;
        ta.selectionStart = ta.selectionEnd = before.length + sel.length;
        autoResize(ta); ta.focus(); return;
      }
      case "h3": {
        var ls3 = before.lastIndexOf("\n") + 1;
        var lt3 = before.slice(ls3).replace(/^#{1,6}\s*/, "");
        before = before.slice(0, ls3) + "### " + lt3;
        ta.value = before + sel + after;
        ta.selectionStart = ta.selectionEnd = before.length + sel.length;
        autoResize(ta); ta.focus(); return;
      }
      case "list":
        insert = sel ? sel.split("\n").map(function (l) { return "- " + l; }).join("\n") : "- ";
        cursor = start + insert.length;
        break;
      case "hr":
        insert = (before === "" || before.endsWith("\n") ? "" : "\n") + "---\n";
        cursor = start + insert.length;
        break;
      case "link":
        insert = "[[" + (sel || "titre de la page") + "]]";
        cursor = sel ? start + insert.length : start + 2;
        break;
      default: return;
    }
    ta.value = before + insert + after;
    ta.selectionStart = ta.selectionEnd = cursor;
    autoResize(ta); ta.focus();
  }

  document.querySelectorAll(".md-toolbar").forEach(function (toolbar) {
    var editor  = toolbar.closest(".wiki-editor");
    if (!editor || editor.hasAttribute("data-rich")) return; // géré par l'éditeur riche
    var ta      = editor.querySelector(".wiki-textarea");
    var preview = editor.querySelector(".wiki-md-preview");
    var prevBtn = toolbar.querySelector(".md-preview-btn");
    var showing = false;
    if (!ta) return;

    toolbar.querySelectorAll("[data-md]").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.preventDefault(); insertMd(ta, btn.dataset.md); });
    });

    ta.addEventListener("keydown", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "b") { e.preventDefault(); insertMd(ta, "bold"); }
      if (e.key === "i") { e.preventDefault(); insertMd(ta, "italic"); }
    });

    if (prevBtn && preview) {
      prevBtn.addEventListener("click", function (e) {
        e.preventDefault();
        showing = !showing;
        if (showing) {
          preview.innerHTML = renderMarkdown(ta.value) || "<p class=\"wiki-md-empty\">Rien \u00e0 afficher.</p>";
          ta.hidden = true; preview.hidden = false;
          prevBtn.textContent = "\u00c9diter"; prevBtn.classList.add("active");
        } else {
          ta.hidden = false; preview.hidden = true;
          prevBtn.textContent = "Aper\u00e7u"; prevBtn.classList.remove("active");
        }
      });
    }
  });

  // ══════════════════════════════════════════════════
  // 10. ÉDITEUR RICHE (description wiki)
  // ══════════════════════════════════════════════════
  (function () {
    // ── Rendu markdown plat pour l'éditeur (pas de <details>) ──
    // Contrairement à renderMarkdown (qui crée des accordéons),
    // cette version garde ## en <h2> afin que l'éditeur puisse
    // correctement imbriquer les éléments suivants.
    function markdownToEditorHTML(text) {
      if (!text) return "";
      var out = [], inList = false;
      function closeList() { if (inList) { out.push("</ul>"); inList = false; } }
      text.split("\n").forEach(function (raw) {
        var line = esc(raw);
        if (/^## /.test(line))       { closeList(); out.push("<h2>" + inline(line.slice(3)) + "</h2>"); }
        else if (/^### /.test(line)) { closeList(); out.push("<h3>" + inline(line.slice(4)) + "</h3>"); }
        else if (/^---+\s*$/.test(line)) { closeList(); out.push("<hr>"); }
        else if (/^- /.test(line))   { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + inline(line.slice(2)) + "</li>"); }
        else if (line.trim() === "") { closeList(); out.push("<p><br></p>"); }
        else                         { closeList(); out.push("<p>" + inline(line) + "</p>"); }
      });
      closeList();
      return out.join("\n");
    }

    // ── Déplie les <details.wiki-section> sauvegardés en <h2> plats ──
    // Nécessaire pour le contenu HTML qui a été sauvegardé alors que
    // l'éditeur utilisait encore renderMarkdown (avec accordéons).
    function unwrapAccordions(html) {
      var tmp = document.createElement("div");
      tmp.innerHTML = html;
      tmp.querySelectorAll("details.wiki-section").forEach(function (det) {
        var sum  = det.querySelector(":scope > summary");
        var body = det.querySelector(":scope > .wiki-section-body");
        var h2   = document.createElement("h2");
        if (sum) h2.innerHTML = sum.innerHTML;
        det.parentNode.insertBefore(h2, det);
        if (body) {
          while (body.firstChild) det.parentNode.insertBefore(body.firstChild, det);
        }
        det.parentNode.removeChild(det);
      });
      return tmp.innerHTML;
    }

    // ── Pages disponibles (index titre → id) ──────
    var _pages = null;
    function getWikiPages() {
      if (_pages) return _pages;
      var el = document.getElementById("wiki-existing-pages");
      if (!el) return (_pages = []);
      try { _pages = JSON.parse(el.textContent || el.innerText); } catch (_) { _pages = []; }
      return _pages;
    }

    // ── Picker lien wiki : modal avec champ recherche ─
    var picker = document.createElement("div");
    picker.className = "wikilink-picker";
    picker.hidden = true;
    picker.innerHTML =
      '<input class="wikilink-picker-input" type="text" placeholder="Rechercher une page\u2026" autocomplete="off" />' +
      '<div class="wikilink-picker-results"></div>';
    document.body.appendChild(picker);

    var pickerInput   = picker.querySelector(".wikilink-picker-input");
    var pickerResults = picker.querySelector(".wikilink-picker-results");
    var savedRange    = null; // sélection sauvegardée dans l'éditeur
    var activeEditor  = null;
    var dropIdx = -1;
    var wikilinkCtx = null; // conservé pour compat

    // ── Rendu du picker ────────────────────────────
    function renderPickerResults(q) {
      dropIdx = -1;
      pickerResults.innerHTML = "";
      var all  = getWikiPages();
      var ql   = (q || "").toLowerCase().trim();
      var hits = ql
        ? all.filter(function (p) { return p.title.toLowerCase().indexOf(ql) !== -1; })
        : all.slice();
      hits = hits.slice(0, 15);

      if (!hits.length) {
        pickerResults.innerHTML = '<div class="wikilink-suggest-empty">Aucune page trouvée</div>';
        return;
      }
      hits.forEach(function (p) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wikilink-suggest-item";
        btn.textContent = p.title;
        btn.addEventListener("mousedown", function (e) {
          e.preventDefault();
          pickWikiPage(p.title, p.id);
        });
        pickerResults.appendChild(btn);
      });
    }

    function openPicker(editor, anchorRect) {
      activeEditor = editor;
      // Sauvegarde la sélection courante AVANT que l'éditeur perde le focus
      var sel = window.getSelection();
      if (sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      } else {
        // Aucune sélection dans l'éditeur : on ira en fin de contenu
        savedRange = null;
      }
      pickerInput.value = "";
      renderPickerResults("");
      // Positionnement sous le bouton
      var pw = 280;
      var left = Math.min(anchorRect.left, window.innerWidth - pw - 8);
      if (left < 8) left = 8;
      var top = anchorRect.bottom + 4;
      if (top + 260 > window.innerHeight - 8) top = anchorRect.top - 264;
      picker.style.left = left + "px";
      picker.style.top  = top  + "px";
      picker.hidden = false;
      pickerInput.focus();
    }

    function closePicker() {
      picker.hidden = true;
      savedRange = null;
      activeEditor = null;
      dropIdx = -1;
    }

    function highlightPickerItem(i) {
      var items = pickerResults.querySelectorAll(".wikilink-suggest-item");
      items.forEach(function (it, j) { it.classList.toggle("active", j === i); });
      if (items[i]) items[i].scrollIntoView({ block: "nearest" });
    }

    function pickWikiPage(title, pageId) {
      if (!activeEditor) { closePicker(); return; }
      var editor = activeEditor;
      closePicker();
      editor.focus();

      // Restaure la sélection sauvegardée ou positionne en fin d'éditeur
      var sel = window.getSelection();
      sel.removeAllRanges();
      if (savedRange) {
        sel.addRange(savedRange);
        savedRange = null;
      } else {
        var r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);
        sel.addRange(r);
      }

      // Insère le lien
      var range = sel.getRangeAt(0);
      range.deleteContents();
      var link = document.createElement("a");
      link.className = "wiki-inline-link";
      link.href = "/wiki/" + pageId;
      link.dataset.pageId = String(pageId);
      link.textContent = title;
      link.contentEditable = "false";
      range.insertNode(link);
      // Curseur après le lien
      var sp = document.createTextNode("\u00a0");
      if (link.nextSibling) {
        link.parentNode.insertBefore(sp, link.nextSibling);
      } else {
        link.parentNode.appendChild(sp);
      }
      var r2 = document.createRange();
      r2.setStart(sp, 1); r2.collapse(true);
      sel.removeAllRanges(); sel.addRange(r2);

      syncHidden(editor);
    }

    // Recherche live dans le picker
    pickerInput.addEventListener("input", function () {
      renderPickerResults(pickerInput.value);
    });
    pickerInput.addEventListener("keydown", function (e) {
      var items = pickerResults.querySelectorAll(".wikilink-suggest-item");
      if (e.key === "ArrowDown")  { e.preventDefault(); dropIdx = Math.min(dropIdx + 1, items.length - 1); highlightPickerItem(dropIdx); }
      else if (e.key === "ArrowUp") { e.preventDefault(); dropIdx = Math.max(dropIdx - 1, 0); highlightPickerItem(dropIdx); }
      else if (e.key === "Enter") {
        e.preventDefault();
        var it = items[dropIdx >= 0 ? dropIdx : 0];
        if (it) it.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      } else if (e.key === "Escape") { closePicker(); }
    });

    // ── Sync champ caché ──────────────────────────
    function syncHidden(editor) {
      if (!editor) return;
      var c = editor.closest(".wiki-editor[data-rich]");
      var h = c && c.querySelector(".wiki-richtext-hidden");
      if (h) h.value = editor.innerHTML;
    }

    // ── Lien externe ──────────────────────────────
    function insertExtLink(editor) {
      var sel = window.getSelection();
      var selText = (sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer))
        ? sel.getRangeAt(0).toString() : "";
      var savedR = (sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer))
        ? sel.getRangeAt(0).cloneRange() : null;

      var url = window.prompt("URL du lien externe :");
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;

      var label = selText || window.prompt("Texte à afficher :", url);
      if (label === null) return;
      if (!label) label = url;

      editor.focus();
      sel.removeAllRanges();
      var range;
      if (savedR) { sel.addRange(savedR); range = savedR; }
      else { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); sel.addRange(range); }

      range.deleteContents();
      var a = document.createElement("a");
      a.href = url; a.textContent = label;
      a.target = "_blank"; a.rel = "noopener noreferrer";
      range.insertNode(a);
      var r2 = document.createRange(); r2.setStartAfter(a); r2.collapse(true);
      sel.removeAllRanges(); sel.addRange(r2);
      syncHidden(editor);
    }

    // ── Init éditeur riche ────────────────────────
    function initRichEditor(container) {
      var editor  = container.querySelector(".wiki-richtext");
      var hidden  = container.querySelector(".wiki-richtext-hidden");
      var toolbar = container.querySelector(".md-toolbar");
      if (!editor || !hidden) return;

      // Charge le contenu existant
      var raw = (typeof window._wikiEditContent !== "undefined") ? window._wikiEditContent : "";
      if (raw) {
        if (/^\s*<[a-zA-Z]/.test(raw) || /<(?:h[1-6]|p|div|ul|ol|li|strong|em|a\s|hr|br)\b/i.test(raw)) {
          // HTML : déplie les éventuels accordéons pour que l'éditeur
          // ait des <h2> plats et puisse correctement insérer des H3 dedans.
          editor.innerHTML = unwrapAccordions(raw);
        } else {
          // Markdown : rendu plat (H2 → <h2>, pas de <details>)
          editor.innerHTML = markdownToEditorHTML(raw);
        }
      }
      hidden.value = editor.innerHTML;

      // Assure que Enter crée des <p> et pas des <div> ou du texte brut
      document.execCommand("defaultParagraphSeparator", false, "p");

      // Bloque la navigation sur les liens dans l'éditeur
      editor.addEventListener("click", function (e) {
        if (e.target.closest("a")) e.preventDefault();
      });

      // Garde le curseur visible dans l'éditeur scrollable
      function scrollCursorIntoView() {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        var rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect || rect.height === 0) return;
        var er = editor.getBoundingClientRect();
        var pad = 36;
        if (rect.bottom > er.bottom - pad) {
          editor.scrollTop += rect.bottom - er.bottom + pad;
        } else if (rect.top < er.top + pad) {
          editor.scrollTop -= er.top - rect.top + pad;
        }
      }

      // Sync à chaque frappe + suivi curseur
      editor.addEventListener("input", function () {
        hidden.value = editor.innerHTML;
        scrollCursorIntoView();
      });
      editor.addEventListener("keyup", scrollCursorIntoView);

      // Raccourcis clavier
      editor.addEventListener("keydown", function (e) {
        if (!e.ctrlKey && !e.metaKey) return;
        if (e.key === "b") { e.preventDefault(); document.execCommand("bold");   hidden.value = editor.innerHTML; }
        if (e.key === "i") { e.preventDefault(); document.execCommand("italic"); hidden.value = editor.innerHTML; }
      });

      // Toolbar
      toolbar.querySelectorAll("[data-cmd]").forEach(function (btn) {
        btn.addEventListener("mousedown", function (e) {
          e.preventDefault(); // conserve la sélection dans l'éditeur
          var cmd = btn.dataset.cmd, val = btn.dataset.val;

          if (cmd === "wikilink") {
            openPicker(editor, btn.getBoundingClientRect());
            return;
          }
          if (cmd === "extlink") {
            insertExtLink(editor);
            return;
          }

          editor.focus();
          switch (cmd) {
            case "bold":   document.execCommand("bold");   break;
            case "italic": document.execCommand("italic"); break;
            case "h2": {
              var curH2 = (document.queryCommandValue("formatBlock") || "").toLowerCase();
              document.execCommand("formatBlock", false, curH2 === "h2" ? "p" : "h2");
              break;
            }
            case "h3": {
              var curH3 = (document.queryCommandValue("formatBlock") || "").toLowerCase();
              document.execCommand("formatBlock", false, curH3 === "h3" ? "p" : "h3");
              break;
            }
            case "list":   document.execCommand("insertUnorderedList"); break;
            case "hr":     document.execCommand("insertHorizontalRule"); break;
            case "color":
              document.execCommand("styleWithCSS", false, true);
              document.execCommand("foreColor", false, val || getComputedStyle(editor).color);
              break;
          }
          hidden.value = editor.innerHTML;
        });
      });
    }

    document.querySelectorAll(".wiki-editor[data-rich]").forEach(initRichEditor);

    // Ferme le picker si on clique en dehors
    document.addEventListener("mousedown", function (e) {
      if (!picker.contains(e.target)) closePicker();
    });
  })();

  // ══════════════════════════════════════════════════
  // 11. SOUMISSION
  // ══════════════════════════════════════════════════
  document.querySelectorAll(".wiki-form").forEach(function (form) {
    form.addEventListener("submit", function () {
      // Réaffiche la textarea si en mode aperçu (sinon son contenu ne part pas)
      var ta = form.querySelector(".wiki-textarea");
      if (ta) ta.hidden = false;
      // Sync éditeur riche → champ caché
      var richEditor = form.querySelector(".wiki-richtext");
      var richHidden = form.querySelector(".wiki-richtext-hidden");
      if (richEditor && richHidden) richHidden.value = richEditor.innerHTML;
      var btn = form.querySelector("button[type=\"submit\"]");
      if (btn) { btn.disabled = true; btn.textContent = "Enregistrement\u2026"; }
    });
  });

  // ══════════════════════════════════════════════════
  // 11. CARROUSEL (images suivantes)
  // ══════════════════════════════════════════════════
  (function () {
    var rail = document.querySelector(".wiki-infobox-images-rest");
    if (!rail) return;
    var imgs = rail.querySelectorAll(".wiki-infobox-img");
    if (imgs.length < 2) return;

    // Wrapper relatif pour positionner les flèches
    var wrap = document.createElement("div");
    wrap.className = "wiki-carousel-wrap";
    rail.parentNode.insertBefore(wrap, rail);
    wrap.appendChild(rail);

    // Flèches prev / next
    var btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.className = "wiki-carousel-arrow wiki-carousel-arrow--prev";
    btnPrev.setAttribute("aria-label", "Image précédente");
    btnPrev.textContent = "‹";
    wrap.appendChild(btnPrev);

    var btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.className = "wiki-carousel-arrow wiki-carousel-arrow--next";
    btnNext.setAttribute("aria-label", "Image suivante");
    btnNext.textContent = "›";
    wrap.appendChild(btnNext);

    // Dots indicateurs
    var dotsWrap = document.createElement("div");
    dotsWrap.className = "wiki-carousel-dots";
    wrap.parentNode.insertBefore(dotsWrap, wrap.nextSibling);
    var dots = [];
    imgs.forEach(function (_, i) {
      var d = document.createElement("button");
      d.type = "button";
      d.className = "wiki-carousel-dot";
      d.addEventListener("click", function () { goTo(i); });
      dotsWrap.appendChild(d);
      dots.push(d);
    });

    var current = 0;
    var paused = false;

    function setDot(i) {
      dots.forEach(function (d, j) { d.classList.toggle("active", j === i); });
    }

    function updateArrows() {
      btnPrev.disabled = current === 0;
      btnNext.disabled = current === imgs.length - 1;
    }

    function goTo(i) {
      current = i;
      var target = imgs[i].offsetLeft - (rail.clientWidth - imgs[i].offsetWidth) / 2;
      rail.scrollTo({ left: target, behavior: "smooth" });
      setDot(i);
      updateArrows();
    }

    btnPrev.addEventListener("click", function () { if (current > 0) goTo(current - 1); });
    btnNext.addEventListener("click", function () { if (current < imgs.length - 1) goTo(current + 1); });

    setDot(0);
    updateArrows();

    // Auto-scroll toutes les 3,5 s si le carrousel est scrollable
    setInterval(function () {
      if (paused) return;
      if (rail.scrollWidth <= rail.clientWidth + 4) return;
      goTo((current + 1) % imgs.length);
    }, 3500);

    // Pause au toucher, reprise 4 s après
    rail.addEventListener("touchstart", function () { paused = true; }, { passive: true });
    rail.addEventListener("touchend",   function () { setTimeout(function () { paused = false; }, 4000); }, { passive: true });

    // Synchronise le dot au scroll manuel
    rail.addEventListener("scroll", function () {
      var mid = rail.scrollLeft + rail.clientWidth / 2;
      imgs.forEach(function (img, i) {
        if (img.offsetLeft <= mid && img.offsetLeft + img.offsetWidth > mid) {
          current = i;
          setDot(i);
          updateArrows();
        }
      });
    }, { passive: true });
  })();

  // ══════════════════════════════════════════════════
  // 12. LIENS ENTRE PAGES WIKI
  // ══════════════════════════════════════════════════
  (function () {
    var widget = document.querySelector(".wiki-page-links");
    if (!widget) return;
    var pageId      = widget.dataset.pageId;
    var linksArea   = widget.querySelector("[data-role='links']");
    var backArea    = widget.querySelector("[data-role='backlinks']");
    var backSection = widget.querySelector(".wiki-pl-backlinks-section");
    var searchInput = widget.querySelector(".wiki-pl-search");
    var resultsList = widget.querySelector(".wiki-pl-results");
    var searchTimer;

    // Hue de catégorie (doit rester cohérent avec le serveur)
    var CAT_HUES = { fantasmes:330, jeu_de_role:60, partenaires:210, pratique:5, position:270, lieux:140, objets:28, tenues:175, autre:220 };

    function makeCard(page, removable) {
      var hue = CAT_HUES[page.category] || 220;
      var a = document.createElement("a");
      a.href = "/wiki/" + page.id;
      a.className = "wiki-pl-card";
      var badge = document.createElement("span");
      badge.className = "wiki-pl-badge";
      badge.style.background = "hsl(" + hue + ",55%,45%)";
      badge.textContent = page.category;
      var title = document.createElement("span");
      title.className = "wiki-pl-title";
      title.textContent = page.title;
      a.appendChild(badge);
      a.appendChild(title);
      if (removable) {
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "wiki-pl-remove";
        rm.innerHTML = "&#215;";
        rm.title = "Retirer le lien";
        rm.addEventListener("click", function (e) {
          e.preventDefault();
          fetch("/wiki/" + pageId + "/page-links", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linked_page_id: page.id }),
          }).then(load);
        });
        a.appendChild(rm);
      }
      return a;
    }

    function renderCards(container, pages, removable) {
      container.innerHTML = "";
      if (!pages.length) {
        container.innerHTML = "";
      } else {
        pages.forEach(function (p) { container.appendChild(makeCard(p, removable)); });
      }
    }

    function load() {
      fetch("/wiki/" + pageId + "/page-links")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          renderCards(linksArea, data.links, true);
          renderCards(backArea, data.backlinks, false);
          backSection.hidden = data.backlinks.length === 0;
        });
    }

    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimer);
      var q = searchInput.value.trim();
      if (!q) { resultsList.innerHTML = ""; return; }
      searchTimer = setTimeout(function () {
        fetch("/wiki/search?q=" + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (pages) {
            resultsList.innerHTML = "";
            // Exclure la page courante
            pages.filter(function (p) { return String(p.id) !== pageId; })
              .forEach(function (p) {
                var li = document.createElement("li");
                li.className = "wiki-pl-result-item";
                var hue = CAT_HUES[p.category] || 220;
                li.innerHTML = '<span class="wiki-pl-result-badge" style="background:hsl(' + hue + ',55%,45%)">' + p.category + '</span><span>' + p.title + '</span>';
                li.addEventListener("click", function () {
                  fetch("/wiki/" + pageId + "/page-links", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ linked_page_id: p.id }),
                  }).then(function () {
                    searchInput.value = "";
                    resultsList.innerHTML = "";
                    load();
                  });
                });
                resultsList.appendChild(li);
              });
          });
      }, 200);
    });

    document.addEventListener("click", function (e) {
      if (!widget.contains(e.target)) resultsList.innerHTML = "";
    });

    load();
  })();

  // ══════════════════════════════════════════════════
  // 13. QUESTIONS LIÉES AU QUIZZ
  // ══════════════════════════════════════════════════
  var qlWidget = document.querySelector(".wiki-question-links");  // section 13
  if (qlWidget) {
    var qlPageId  = qlWidget.dataset.pageId;
    var qlList    = qlWidget.querySelector(".wiki-ql-list");
    var qlSearch  = qlWidget.querySelector(".wiki-ql-search");
    var qlResults = qlWidget.querySelector(".wiki-ql-results");
    var qlTimer;

    function qlLoadLinks() {
      fetch("/wiki/" + qlPageId + "/question-links")
        .then(function (r) { return r.json(); })
        .then(function (links) {
          qlList.innerHTML = "";
          if (!links.length) {
            qlList.innerHTML = "";
            return;
          }
          links.forEach(function (lk) {
            var li = document.createElement("li");
            li.className = "wiki-ql-item";
            // Ouvre dans un nouvel onglet : on est en cours d'édition, pas
            // question de perdre les modifications en cours en changeant de page.
            var label = (typeof lk.section_index === "number" && lk.section_index >= 0)
              ? document.createElement("a")
              : document.createElement("span");
            label.className = "wiki-ql-label";
            if (label.tagName === "A") {
              label.href = "/section/" + lk.section_index + "?q=" + encodeURIComponent(lk.question_id);
              label.target = "_blank";
              label.rel = "noopener";
            }
            var section = document.createElement("span");
            section.className = "wiki-ql-section";
            section.textContent = lk.section_title;
            var text = document.createElement("span");
            text.className = "wiki-ql-text";
            text.textContent = lk.question_text;
            label.appendChild(section);
            label.appendChild(text);
            var rm = document.createElement("button");
            rm.type = "button";
            rm.className = "wiki-ql-remove";
            rm.innerHTML = "&#215;";
            rm.title = "D\u00e9sassocier";
            rm.addEventListener("click", function () {
              fetch("/wiki/" + qlPageId + "/question-links", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ section_key: lk.section_key, question_id: lk.question_id }),
              }).then(qlLoadLinks);
            });
            li.appendChild(label);
            li.appendChild(rm);
            qlList.appendChild(li);
          });
        });
    }

    qlSearch.addEventListener("input", function () {
      clearTimeout(qlTimer);
      qlTimer = setTimeout(function () {
        var q = qlSearch.value.trim();
        if (!q) { qlResults.innerHTML = ""; return; }
        fetch("/wiki/question-search?q=" + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (items) {
            qlResults.innerHTML = "";
            items.forEach(function (it) {
              var li = document.createElement("li");
              li.className = "wiki-ql-result-item";
              var s = document.createElement("span");
              s.className = "wiki-ql-result-section";
              s.textContent = it.section_title;
              var t = document.createElement("span");
              t.className = "wiki-ql-result-text";
              t.textContent = it.question_text;
              li.appendChild(s);
              li.appendChild(t);
              li.addEventListener("click", function () {
                fetch("/wiki/" + qlPageId + "/question-links", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ section_key: it.section_key, question_id: it.question_id }),
                }).then(function () {
                  qlSearch.value = "";
                  qlResults.innerHTML = "";
                  qlLoadLinks();
                });
              });
              qlResults.appendChild(li);
            });
          });
      }, 200);
    });

    // Ferme les résultats si on clique ailleurs
    document.addEventListener("click", function (e) {
      if (!qlWidget.contains(e.target)) qlResults.innerHTML = "";
    });

    qlLoadLinks();
  }

  document.querySelectorAll(".link-delete-form, .link-delete-form-inline").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm("Supprimer cette page ?")) e.preventDefault();
    });
  });

  // ══════════════════════════════════════════════════
  // 14. PAGES LIÉES / QUESTIONS LIÉES — LECTURE SEULE
  // Affichage sur la page de lecture (contrairement à l'édition, pas
  // de recherche/ajout/suppression ici). Section masquée s'il n'y a
  // rien à montrer, pour ne pas afficher un bloc vide.
  // ══════════════════════════════════════════════════
  (function () {
    var widget = document.querySelector(".wiki-page-links-view");
    if (!widget) return;
    var pageId = widget.dataset.pageId;
    var area = widget.querySelector("[data-role='links']");
    var CAT_HUES = { fantasmes:330, jeu_de_role:60, partenaires:210, pratique:5, position:270, lieux:140, objets:28, tenues:175, autre:220 };

    fetch("/wiki/" + pageId + "/page-links")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var links = (data && data.links) || [];
        if (!links.length) return;
        links.forEach(function (p) {
          var hue = CAT_HUES[p.category] || 220;
          var a = document.createElement("a");
          a.href = "/wiki/" + p.id;
          a.className = "wiki-pl-card";
          var badge = document.createElement("span");
          badge.className = "wiki-pl-badge";
          badge.style.background = "hsl(" + hue + ",55%,45%)";
          badge.textContent = p.category;
          var title = document.createElement("span");
          title.className = "wiki-pl-title";
          title.textContent = p.title;
          a.appendChild(badge);
          a.appendChild(title);
          area.appendChild(a);
        });
        widget.hidden = false;
      });
  })();

  (function () {
    var widget = document.querySelector(".wiki-question-links-view");
    if (!widget) return;
    var pageId = widget.dataset.pageId;
    var list = widget.querySelector(".wiki-ql-list");

    fetch("/wiki/" + pageId + "/question-links")
      .then(function (r) { return r.json(); })
      .then(function (links) {
        if (!links || !links.length) return;
        links.forEach(function (lk) {
          var li = document.createElement("li");
          li.className = "wiki-ql-item";
          // Sans lien réel, cliquer ne menait nulle part : on renvoie vers
          // la section, avec ?q=... pour que section.js défile jusqu'à la
          // question précise et la mette en évidence.
          var label = (typeof lk.section_index === "number" && lk.section_index >= 0)
            ? document.createElement("a")
            : document.createElement("span");
          label.className = "wiki-ql-label";
          if (label.tagName === "A") {
            label.href = "/section/" + lk.section_index + "?q=" + encodeURIComponent(lk.question_id);
          }
          var section = document.createElement("span");
          section.className = "wiki-ql-section";
          section.textContent = lk.section_title;
          var text = document.createElement("span");
          text.className = "wiki-ql-text";
          text.textContent = lk.question_text;
          label.appendChild(section);
          label.appendChild(text);
          li.appendChild(label);
          list.appendChild(li);
        });
        widget.hidden = false;
      });
  })();

  // ══════════════════════════════════════════════════
  // 6b. MESSAGE D'INTRO RÉDUCTIBLE (sommaire du wiki)
  // Pas de bouton dédié : un clic/tap n'importe où sur le bloc réduit
  // ou rouvre le message. Réduit, seul l'intitulé "Information" reste.
  // ══════════════════════════════════════════════════
  (function () {
    var hero = document.getElementById("wiki-hero");
    if (!hero) return;
    var KEY      = "wiki-hero-collapsed";
    var SEEN_KEY = "wiki-hero-seen";

    function apply(collapsed) {
      hero.classList.toggle("collapsed", collapsed);
      hero.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    var seen     = localStorage.getItem(SEEN_KEY) === "1";
    var explicit = localStorage.getItem(KEY);
    var startCollapsed;
    if (!seen) {
      // Première visite : on montre le message, on mémorise que c'est vu
      localStorage.setItem(SEEN_KEY, "1");
      startCollapsed = false;
    } else {
      // Visites suivantes : réduit par défaut, sauf si l'utilisateur a
      // explicitement rouvert le bloc (KEY === "0").
      startCollapsed = explicit !== "0";
    }
    apply(startCollapsed);

    hero.addEventListener("click", function () {
      var collapsed = !hero.classList.contains("collapsed");
      localStorage.setItem(KEY, collapsed ? "1" : "0");
      apply(collapsed);
    });
    hero.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      hero.click();
    });
  })();

  // ══════════════════════════════════════════════════
  // 6c. FILTRES DE RECHERCHE DU SOMMAIRE (volet replié)
  // Ces réglages ne filtrent rien ici : ils sont mémorisés dans les
  // mêmes clés localStorage que "/wiki/tous", qui les applique tout
  // seul en arrivant (comme s'ils avaient été réglés là-bas).
  // ══════════════════════════════════════════════════
  (function () {
    var form = document.getElementById("wiki-hero-search-form");
    if (!form) return;
    var heroQ         = document.getElementById("wiki-hero-q");
    var heroSort      = document.getElementById("wiki-hero-sort");
    var heroUltraBtn       = document.getElementById("wiki-hero-ultra-toggle");
    var heroIrralisteBtn   = document.getElementById("wiki-hero-irrealiste-toggle");
    var rating        = document.getElementById("wiki-hero-rating");
    var owned         = document.getElementById("wiki-hero-owned");
    var flame         = document.getElementById("wiki-hero-flame");
    var interested    = document.getElementById("wiki-hero-interested");

    // ── Restauration de l'état depuis localStorage ───────────────────
    var savedSearch = localStorage.getItem("wiki-filter-search") || "";
    if (heroQ && savedSearch) heroQ.value = savedSearch;

    var savedSort = localStorage.getItem("wiki-filter-sort") || "alpha-asc";
    if (heroSort) heroSort.value = savedSort;

    // Tri : sauvegarde à chaque changement (pas besoin de soumettre)
    if (heroSort) {
      heroSort.addEventListener("change", function () {
        localStorage.setItem("wiki-filter-sort", heroSort.value);
      });
    }

    // Ultra toggle
    var heroHideUltra = (window.ULTRA_MODE || "hidden") === "hidden";
    function syncHeroUltraBtn() {
      if (!heroUltraBtn) return;
      heroUltraBtn.textContent = "Ultra";
      heroUltraBtn.classList.toggle("active", heroHideUltra);
    }
    if (heroUltraBtn) {
      syncHeroUltraBtn();
      heroUltraBtn.addEventListener("click", function () {
        heroHideUltra = !heroHideUltra;
        syncHeroUltraBtn();
      });
    }

    // Irréaliste toggle
    var heroHideIrrealiste = (window.IRREALISTE_MODE || "visible") === "hidden";
    function syncHeroIrralisteBtn() {
      if (!heroIrralisteBtn) return;
      heroIrralisteBtn.textContent = "Irr\u00e9aliste";
      heroIrralisteBtn.classList.toggle("active", heroHideIrrealiste);
    }
    if (heroIrralisteBtn) {
      syncHeroIrralisteBtn();
      heroIrralisteBtn.addEventListener("click", function () {
        heroHideIrrealiste = !heroHideIrrealiste;
        syncHeroIrralisteBtn();
      });
    }

    // Note min : restauration visuelle
    var savedRating = localStorage.getItem("wiki-filter-rating") || "0";
    if (rating) rating.value = savedRating;

    // Checkboxes : restauration visuelle
    if (owned      && localStorage.getItem("wiki-filter-owned")      === "1") owned.checked = true;
    if (flame      && localStorage.getItem("wiki-filter-flame")      === "1") flame.checked = true;
    if (interested && localStorage.getItem("wiki-filter-interested") === "1") interested.checked = true;

    // ── Sauvegarde à la soumission ────────────────────────────────────
    form.addEventListener("submit", function () {
      if (heroSort)   localStorage.setItem("wiki-filter-sort", heroSort.value);
      if (rating)     localStorage.setItem("wiki-filter-rating", rating.value);
      if (owned)      localStorage.setItem("wiki-filter-owned", owned.checked ? "1" : "0");
      if (flame)      localStorage.setItem("wiki-filter-flame", flame.checked ? "1" : "0");
      if (interested) localStorage.setItem("wiki-filter-interested", interested.checked ? "1" : "0");
    });
  })();

  // ══════════════════════════════════════════════════
  // 7. NAVIGATION CONTEXTUELLE PRÉCÉDENT / SUIVANT
  // Priorité : contexte sessionStorage (liste visible au clic d'une carte)
  // Repli : reconstruction depuis les métadonnées embarquées dans la page
  // (catégorie, tri mémorisé dans localStorage, recherche en cours).
  // ══════════════════════════════════════════════════
  (function () {
    var NAV_KEY  = "wikiNavContext";
    var BACK_KEY = "wikiNavBack";

    // ── Capture du contexte au clic sur une carte ──────────────────────
    document.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest("a.wiki-card") : null;
      if (!card) return;
      var list = card.closest("#wiki-list, .wiki-chapter-strip");
      if (!list) return;
      var cards = Array.prototype.slice.call(list.querySelectorAll("a.wiki-card")).filter(function (c) {
        return !c.hidden;
      });
      var entries = cards.map(function (c) {
        var m = (c.getAttribute("href") || "").match(/^\/wiki\/(\d+)$/);
        if (!m) return null;
        var titleEl = c.querySelector(".wiki-card-title");
        return { id: Number(m[1]), title: titleEl ? titleEl.textContent : "" };
      }).filter(Boolean);
      try { sessionStorage.setItem(NAV_KEY, JSON.stringify(entries)); } catch (_) {}
      // Mémorise l'origine pour le bouton ←
      try {
        var headingEl = document.querySelector(".wiki-chapter-hero-title, .section-title-h1");
        var backLabel = headingEl ? headingEl.textContent.trim() : document.title;
        sessionStorage.setItem(BACK_KEY, JSON.stringify({ href: location.href, label: backLabel }));
      } catch (_) {}
    }, true);

    // ── Sur la page de détail seulement ───────────────────────────────
    var prevBtn = document.getElementById("wiki-nav-prev");
    var nextBtn = document.getElementById("wiki-nav-next");
    if (!prevBtn || !nextBtn) return;

    var pageMatch = location.pathname.match(/^\/wiki\/(\d+)$/);
    if (!pageMatch) return;
    var currentId = Number(pageMatch[1]);

    // Métadonnées de toutes les pages (embarquées dans le HTML)
    var allPages = [];
    try {
      var pagesScript = document.getElementById("wiki-existing-pages");
      if (pagesScript) allPages = JSON.parse(pagesScript.textContent || "[]");
    } catch (_) {}

    // ── Étape 1 : essayer le contexte sessionStorage ───────────────────
    var context = null;
    try { context = JSON.parse(sessionStorage.getItem(NAV_KEY) || "null"); } catch (_) {}

    var idx = -1;
    if (Array.isArray(context)) {
      context.forEach(function (e, i) { if (e && e.id === currentId) idx = i; });
    }

    // ── Étape 2 : reconstruire le contexte depuis les métadonnées ─────
    if (idx === -1 && allPages.length) {
      var backInfo = null;
      try { backInfo = JSON.parse(sessionStorage.getItem(BACK_KEY) || "null"); } catch (_) {}

      var backHref = (backInfo && backInfo.href) || "";

      // Détermine le filtre de catégorie depuis l'URL d'origine
      var catFilter = "";
      var catMatch = backHref.match(/\/wiki\/categorie\/([^/?#]+)/);
      if (catMatch) catFilter = decodeURIComponent(catMatch[1]);

      // Si pas d'origine catégorie, utilise la catégorie de la page courante
      if (!catFilter) {
        try {
          var metaEl = document.getElementById("wiki-current-page-meta");
          if (metaEl) {
            var meta = JSON.parse(metaEl.textContent || "{}");
            catFilter = meta.category || "";
          }
        } catch (_) {}
      }

      // Filtre par catégorie (inclut extraCats)
      var filtered = catFilter
        ? allPages.filter(function (p) {
            return p.category === catFilter ||
                   (Array.isArray(p.extraCats) && p.extraCats.indexOf(catFilter) !== -1);
          })
        : allPages.slice();

      // Applique le même tri que la liste d'origine
      var sortKey = localStorage.getItem("wiki-filter-sort") || "alpha-asc";
      filtered.sort(function (a, b) {
        switch (sortKey) {
          case "alpha-desc":  return (b.title || "").localeCompare(a.title || "", "fr", { sensitivity: "base" });
          case "date-desc":   return (b.date || 0) - (a.date || 0);
          case "date-asc":    return (a.date || 0) - (b.date || 0);
          case "rating-desc": return (b.rating || 0) - (a.rating || 0);
          default:            return (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" });
        }
      });

      context = filtered;
      context.forEach(function (e, i) { if (e && e.id === currentId) idx = i; });

      // Sauvegarde ce contexte reconstruit pour les navigations suivantes
      if (idx !== -1) {
        try { sessionStorage.setItem(NAV_KEY, JSON.stringify(context)); } catch (_) {}
      }
    }

    if (idx === -1) return; // ni contexte ni métadonnées → on garde le serveur

    function applyBtn(btn, entry) {
      var label = btn.querySelector(".wiki-page-nav-label");
      if (!entry) {
        btn.classList.add("wiki-page-nav-disabled");
        btn.removeAttribute("href");
        btn.title = "";
        if (label) label.textContent = "";
        return;
      }
      btn.classList.remove("wiki-page-nav-disabled");
      btn.href = "/wiki/" + entry.id;
      btn.title = entry.title;
      if (label) label.textContent = entry.title;
    }

    applyBtn(prevBtn, context[idx - 1] || null);
    applyBtn(nextBtn, context[idx + 1] || null);

    // Applique le contexte de retour au bouton ←
    var backLink = document.querySelector(".wiki-detail-banner-back");
    if (backLink) {
      var storedBack = null;
      try { storedBack = JSON.parse(sessionStorage.getItem(BACK_KEY) || "null"); } catch (_) {}
      if (storedBack && storedBack.href) {
        var bp = "";
        try { bp = new URL(storedBack.href, location.origin).pathname; } catch (_) {}
        if (!/^\/wiki\/\d+$/.test(bp)) {
          backLink.href = storedBack.href;
          if (storedBack.label) {
            backLink.setAttribute("aria-label", storedBack.label);
            backLink.title = storedBack.label;
          }
        }
      }
    }
  })();

  // ══════════════════════════════════════════════════
  // 16. ÉDITEUR DE VARIANTES (formulaire position)
  // ══════════════════════════════════════════════════
  (function () {
    var editor    = document.getElementById("wiki-variante-editor");
    var hiddenIn  = document.getElementById("wiki-variantes-hidden");
    if (!editor || !hiddenIn) return;

    var varList = editor.querySelector(".wiki-var-list");
    var addBtn  = editor.querySelector(".wiki-var-add-btn");

    // Données en mémoire
    var data = [];
    try { data = JSON.parse(hiddenIn.value || "[]"); } catch (_) { data = []; }
    if (!Array.isArray(data)) data = [];

    function uid() { return "v_" + Date.now() + "_" + Math.floor(Math.random() * 1e6); }

    function sync() {
      hiddenIn.value = JSON.stringify(data);
    }

    // Miniatures des images existantes d'une variante avec bouton de suppression
    function makeImgPreview(obj, fieldPrefix) {
      var zone = document.createElement("div");
      zone.className = "wiki-var-imgs";
      function render() {
        zone.innerHTML = "";
        var imgs = Array.isArray(obj.images) ? obj.images : [];
        imgs.forEach(function (src, i) {
          var thumb = document.createElement("div");
          thumb.className = "wiki-var-img-thumb";
          var img = document.createElement("img");
          img.src = src;
          img.alt = "";
          var rm = document.createElement("button");
          rm.type = "button";
          rm.className = "wiki-var-img-rm";
          rm.title = "Supprimer cette image";
          rm.textContent = "\u00D7";
          rm.addEventListener("click", function () {
            obj.images.splice(i, 1);
            sync();
            render();
          });
          thumb.appendChild(img);
          thumb.appendChild(rm);
          zone.appendChild(thumb);
        });
        // Champ d'upload pour ajouter des images
        var fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.name = fieldPrefix + obj.id;
        fileInput.accept = "image/*";
        fileInput.multiple = true;
        fileInput.className = "wiki-var-img-input";
        zone.appendChild(fileInput);
      }
      render();
      return zone;
    }

    function makeSubItem(sv, parentData) {
      var wrap = document.createElement("div");
      wrap.className = "wiki-var-sub-item";
      wrap.dataset.id = sv.id;

      var head = document.createElement("div");
      head.className = "wiki-var-item-head";

      var nom = document.createElement("input");
      nom.type = "text";
      nom.className = "wiki-var-nom";
      nom.placeholder = "Nom de la sous-variante\u2026";
      nom.value = sv.nom || "";
      nom.addEventListener("input", function () { sv.nom = nom.value; sync(); });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "wiki-var-del-btn";
      del.title = "Supprimer";
      del.textContent = "\u00D7";
      del.addEventListener("click", function () {
        var idx = parentData.variantes.indexOf(sv);
        if (idx !== -1) parentData.variantes.splice(idx, 1);
        wrap.remove();
        sync();
      });

      head.appendChild(nom);
      head.appendChild(del);

      var desc = document.createElement("textarea");
      desc.className = "wiki-var-desc";
      desc.placeholder = "Description\u2026";
      desc.rows = 2;
      desc.value = sv.description || "";
      desc.addEventListener("input", function () { sv.description = desc.value; sync(); });

      if (!Array.isArray(sv.images)) sv.images = [];
      wrap.appendChild(head);
      wrap.appendChild(desc);
      wrap.appendChild(makeImgPreview(sv, "variante_sub_img_"));
      return wrap;
    }

    function makeItem(v) {
      var wrap = document.createElement("div");
      wrap.className = "wiki-var-item";
      wrap.dataset.id = v.id;

      var head = document.createElement("div");
      head.className = "wiki-var-item-head";

      var nom = document.createElement("input");
      nom.type = "text";
      nom.className = "wiki-var-nom";
      nom.placeholder = "Nom de la variante\u2026";
      nom.value = v.nom || "";
      nom.addEventListener("input", function () { v.nom = nom.value; sync(); });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "wiki-var-del-btn";
      del.title = "Supprimer";
      del.textContent = "\u00D7";
      del.addEventListener("click", function () {
        var idx = data.indexOf(v);
        if (idx !== -1) data.splice(idx, 1);
        wrap.remove();
        sync();
      });

      head.appendChild(nom);
      head.appendChild(del);

      var desc = document.createElement("textarea");
      desc.className = "wiki-var-desc";
      desc.placeholder = "Description\u2026";
      desc.rows = 3;
      desc.value = v.description || "";
      desc.addEventListener("input", function () { v.description = desc.value; sync(); });

      if (!Array.isArray(v.images)) v.images = [];

      var subList = document.createElement("div");
      subList.className = "wiki-var-sub-list";
      if (!Array.isArray(v.variantes)) v.variantes = [];
      v.variantes.forEach(function (sv) { subList.appendChild(makeSubItem(sv, v)); });

      var subAddBtn = document.createElement("button");
      subAddBtn.type = "button";
      subAddBtn.className = "wiki-var-sub-add-btn";
      subAddBtn.textContent = "+ Ajouter une sous-variante";
      subAddBtn.addEventListener("click", function () {
        var sv = { id: uid(), nom: "", description: "", images: [] };
        v.variantes.push(sv);
        subList.appendChild(makeSubItem(sv, v));
        sync();
      });

      wrap.appendChild(head);
      wrap.appendChild(desc);
      wrap.appendChild(makeImgPreview(v, "variante_img_"));
      wrap.appendChild(subList);
      wrap.appendChild(subAddBtn);
      return wrap;
    }

    // Initialiser depuis données existantes
    data.forEach(function (v) {
      if (!v.id) v.id = uid();
      if (!Array.isArray(v.variantes)) v.variantes = [];
      varList.appendChild(makeItem(v));
    });

    addBtn.addEventListener("click", function () {
      var v = { id: uid(), nom: "", description: "", variantes: [] };
      data.push(v);
      varList.appendChild(makeItem(v));
      sync();
    });
  })();

  // ══════════════════════════════════════════════════
  // 17. NOTES PERSONNELLES (page de lecture)
  // ══════════════════════════════════════════════════
  (function () {
    var noteWrap = document.querySelector(".wiki-user-note");
    if (!noteWrap) return;
    var area   = noteWrap.querySelector(".wiki-user-note-area");
    var status = noteWrap.querySelector(".wiki-user-note-status");
    var pageId = Number(noteWrap.dataset.pageId);
    if (!area || !pageId) return;

    var timer = null;
    var saving = false;

    function save() {
      if (saving) return;
      saving = true;
      status.textContent = "Enregistrement\u2026";
      fetch("/wiki/" + pageId + "/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: area.value }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          saving = false;
          status.textContent = d.ok ? "Sauvegard\u00e9" : "Erreur";
          setTimeout(function () { status.textContent = ""; }, 2000);
        })
        .catch(function () {
          saving = false;
          status.textContent = "Erreur";
        });
    }

    area.addEventListener("input", function () {
      clearTimeout(timer);
      status.textContent = "";
      timer = setTimeout(save, 1200);
    });
  })();

  // ══════════════════════════════════════════════════
  // MATURITÉ (widget admin sur la page de lecture)
  // ══════════════════════════════════════════════════
  (function () {
    var matWidget = document.getElementById("wiki-maturity-widget");
    if (!matWidget) return;
    var matId = Number(matWidget.dataset.id);
    if (!matId) return;
    var matBtns = matWidget.querySelectorAll(".wiki-maturity-lvl");
    matBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var lvl = Number(btn.dataset.level);
        fetch("/wiki/" + matId + "/maturity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level: lvl }),
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (!data.ok) return;
          matBtns.forEach(function (b) { b.classList.toggle("active", Number(b.dataset.level) === data.maturity); });
          matWidget.dataset.level = data.maturity;
        });
      });
    });
  })();

  // ══════════════════════════════════════════════════
  // 18. PANNEAU TAGS LATÉRAL (formulaire d'édition)
  // ══════════════════════════════════════════════════
  (function () {
    var panel = document.querySelector(".wiki-form-tag-panel");
    if (!panel) return;
    // Trouver le widget tags principal (non dérivé)
    var mainWidget = null;
    document.querySelectorAll(".wiki-tags-widget").forEach(function (w) {
      if (!w.classList.contains("wiki-derived-widget")) mainWidget = w;
    });
    if (!mainWidget) return;

    // Recherche dans le panneau
    var searchBox = panel.querySelector(".wiki-form-tag-panel-search");
    if (searchBox) {
      searchBox.addEventListener("input", function () {
        var q = searchBox.value.trim().toLowerCase();
        panel.querySelectorAll(".wiki-panel-tag-chip").forEach(function (chip) {
          if (chip.classList.contains("wf-tag-special")) return; // toujours visible
          chip.hidden = q && chip.dataset.tag.toLowerCase().indexOf(q) === -1;
        });
      });
    }

    // Clic sur un chip du panneau → ajoute dans le widget principal
    panel.addEventListener("click", function (e) {
      var chip = e.target.closest(".wiki-panel-tag-chip");
      if (!chip) return;
      // Déclenche un clic sur le chip équivalent dans le suggestBox du widget principal
      var suggestBox = mainWidget.querySelector(".wiki-tag-suggestions");
      var match = suggestBox && suggestBox.querySelector('[data-tag="' + chip.dataset.tag + '"]');
      if (match) {
        match.click();
      } else {
        // Tag non présent dans les suggestions locales : ajoute directement via l'input
        var typer = mainWidget.querySelector(".wiki-tags-typing");
        var hidden = mainWidget.querySelector(".wiki-tags-hidden");
        if (typer) {
          typer.value = chip.dataset.tag;
          typer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          typer.value = "";
        }
      }
      // Sync visuel sur le chip du panneau
      chip.classList.toggle("active", mainWidget.querySelector('.wiki-tag-suggest-chip[data-tag="' + chip.dataset.tag + '"]')
        ? mainWidget.querySelector('.wiki-tag-suggest-chip[data-tag="' + chip.dataset.tag + '"]').classList.contains("active")
        : false);
    });

    // Sync de l'état des chips du panneau quand le widget met à jour ses chips
    function syncPanelChips() {
      var hidden = mainWidget.querySelector(".wiki-tags-hidden");
      if (!hidden) return;
      var activeTags = (hidden.value || "").split(/[,;]+/).map(function (t) { return t.trim().toLowerCase(); });
      panel.querySelectorAll(".wiki-panel-tag-chip").forEach(function (chip) {
        chip.classList.toggle("active", activeTags.indexOf(chip.dataset.tag.toLowerCase()) !== -1);
      });
    }
    // Observer les changements du champ caché
    var hiddenInput = mainWidget.querySelector(".wiki-tags-hidden");
    if (hiddenInput) {
      new MutationObserver(syncPanelChips).observe(hiddenInput, { attributes: true, attributeFilter: ["value"] });
      // Fallback : re-sync après chaque clic dans le widget
      mainWidget.addEventListener("click", function () { setTimeout(syncPanelChips, 50); });
    }
    syncPanelChips();
  })();

  // ══════════════════════════════════════════════════
  // 19. BOUTONS SPÉCIAUX (ultra / irréaliste)
  // ══════════════════════════════════════════════════
  (function () {
    document.querySelectorAll(".wf-tag-special").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mainWidget = null;
        document.querySelectorAll(".wiki-tags-widget").forEach(function (w) {
          if (!w.classList.contains("wiki-derived-widget")) mainWidget = w;
        });
        if (!mainWidget) return;
        // Déléguer au chip dans les suggestions (toggle add/remove)
        var chip = mainWidget.querySelector('.wiki-tag-suggest-chip[data-tag="' + btn.dataset.tag + '"]');
        if (chip) { chip.click(); return; }
        // Fallback : ajouter via l'input
        var typer = mainWidget.querySelector(".wiki-tags-typing");
        if (typer) {
          typer.value = btn.dataset.tag;
          typer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          typer.value = "";
        }
      });
    });
  })();

  // Sur grand écran (sidebar fixe), le volet filtre est ouvert par défaut
  if (window.innerWidth >= 1101) {
    document.querySelectorAll(".wiki-sidebar-filter-details").forEach(function (el) {
      el.setAttribute("open", "");
    });
  }

  // Popup de tag unifiee : voir public/nav.js (openTagPopup), delegation
  // globale sur .tag-badge -- plus de mecanisme dedie ici.

  // ══════════════════════════════════════════════════
  // 20. IMAGES POSITIONNELLES — formulaire
  // ══════════════════════════════════════════════════
  (function () {
    var container = document.getElementById("wf-pos-images");
    if (!container) return;

    var newContainer = document.getElementById("wf-pos-new");
    var picker       = document.getElementById("wf-pos-picker");

    // ── Récupère les titres H2/H3 depuis l'éditeur riche ──
    function getHeadings() {
      var editor = document.querySelector(".wiki-richtext");
      if (!editor) return [];
      var list = [];
      editor.querySelectorAll("h2, h3").forEach(function (h) {
        var txt = h.textContent.trim();
        if (txt) list.push({ level: h.tagName.toLowerCase(), text: txt });
      });
      return list;
    }

    // ── Construit un <select> avec les titres disponibles ──
    function buildSelect(name, selectedSection) {
      var sel = document.createElement("select");
      sel.name = name;
      sel.className = "wf-pos-section-sel wf-select";
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Choisir une section";
      sel.appendChild(blank);
      getHeadings().forEach(function (h) {
        var opt = document.createElement("option");
        opt.value = h.text;
        opt.textContent = (h.level === "h2" ? "▸ " : "  › ") + h.text;
        if (h.text === selectedSection) opt.selected = true;
        sel.appendChild(opt);
      });
      return sel;
    }

    // ── Peuple les selects des images existantes ──
    container.querySelectorAll(".wf-pos-item[data-path]").forEach(function (item) {
      var section = item.dataset.section || "";
      var oldSel  = item.querySelector("select.wf-pos-section-sel");
      if (!oldSel) return;
      var newSel = buildSelect("pos_existing_section[]", section);
      oldSel.parentNode.replaceChild(newSel, oldSel);
      // Bouton retirer : on cache le path caché pour ne pas le soumettre
      item.querySelector(".wf-pos-remove").addEventListener("click", function () {
        item.remove();
      });
    });

    // ── Crée une carte pour une nouvelle image ──
    function addNewCard(file) {
      var item = document.createElement("div");
      item.className = "wf-pos-item";

      var thumb = document.createElement("img");
      thumb.className = "wf-pos-thumb";
      thumb.alt = "";
      thumb.src = URL.createObjectURL(file);

      // Input fichier caché (un par image)
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.name = "pos_images";
      fileInput.hidden = true;
      try {
        var dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
      } catch (_) {}

      var meta = document.createElement("div");
      meta.className = "wf-pos-item-meta";

      var sel = buildSelect("pos_new_section[]", "");

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "wf-pos-remove";
      removeBtn.title = "Retirer";
      removeBtn.textContent = "\u00D7";
      removeBtn.addEventListener("click", function () { item.remove(); });

      meta.appendChild(sel);
      meta.appendChild(removeBtn);
      item.appendChild(thumb);
      item.appendChild(fileInput);
      item.appendChild(meta);
      newContainer.appendChild(item);
    }

    picker.addEventListener("change", function () {
      Array.from(picker.files).forEach(addNewCard);
      picker.value = "";
    });

    // Recharge les options si l'éditeur change (H2/H3 ajoutés)
    var editor = document.querySelector(".wiki-richtext");
    if (editor) {
      editor.addEventListener("input", function () {
        // Met à jour uniquement les selects des nouvelles images (les existantes ont déjà leur valeur)
        newContainer.querySelectorAll("select.wf-pos-section-sel").forEach(function (sel) {
          var current = sel.value;
          var newSel = buildSelect("pos_new_section[]", current);
          sel.parentNode.replaceChild(newSel, sel);
        });
      });
    }
  })();

  // ══════════════════════════════════════════════════
  // 20b. IMAGES POSITIONNELLES — injection à l'affichage
  // ══════════════════════════════════════════════════
  (function () {
    var dataEl = document.getElementById("wiki-pos-images-data");
    if (!dataEl) return;
    var posImages;
    try { posImages = JSON.parse(dataEl.textContent); } catch (_) { return; }
    if (!posImages || !posImages.length) return;
    console.info("[wiki-pos] Images positionnelles :", posImages);

    // Attend que le rendu wiki-md soit terminé (il est synchrone, donc on peut lancer directement)
    var containers = document.querySelectorAll(".wiki-md, .wiki-section-body");
    var isMobile = window.innerWidth <= 640;

    // Normalise un titre : minuscules, espaces collapsés, sans ponctuation de fin
    function normTitle(t) {
      return t.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?:]+$/, "");
    }

    posImages.forEach(function (pi) {
      if (!pi.path || !pi.section) return;
      var needle = normTitle(pi.section);

      // ── Cherche un H3 correspondant ──
      var found = null, foundType = null;

      document.querySelectorAll(".wiki-md h3, .wiki-section-body h3").forEach(function (h3) {
        if (!found && normTitle(h3.textContent) === needle) {
          found = h3; foundType = "h3";
        }
      });

      // ── Cherche un <details.wiki-section> dont la summary correspond ──
      if (!found) {
        document.querySelectorAll("details.wiki-section").forEach(function (det) {
          var sum = det.querySelector(":scope > .wiki-section-summary");
          if (!found && sum && normTitle(sum.textContent) === needle) {
            found = det; foundType = "h2";
          }
        });
      }

      if (!found) {
        console.warn("[wiki-pos] Section introuvable pour :", pi.section, "| needle:", needle);
        return;
      }

      // ── Crée la figure ──
      var fig = document.createElement("figure");
      fig.className = "wiki-pos-figure";
      var img = document.createElement("img");
      img.src = pi.path;
      img.alt = "";
      img.loading = "lazy";
      fig.appendChild(img);

      if (foundType === "h3") {
        if (isMobile) {
          // Fin de la section H3 : juste avant le prochain H3, H2 ou details
          var sib = found.nextSibling;
          var last = found;
          while (sib) {
            var nn = sib.nodeName;
            if (nn === "H3" || nn === "H2" || (sib.classList && sib.classList.contains("wiki-section"))) break;
            last = sib;
            sib = sib.nextSibling;
          }
          last.parentNode.insertBefore(fig, last.nextSibling);
        } else {
          // Juste après le H3 → float droite, le texte suivant s'enroule
          found.parentNode.insertBefore(fig, found.nextSibling);
        }
      } else {
        // H2 section → dans le wiki-section-body
        var body = found.querySelector(":scope > .wiki-section-body");
        if (!body) return;
        if (isMobile) {
          body.appendChild(fig);
        } else {
          body.insertBefore(fig, body.firstChild);
        }
      }
    });
  })();

  // ══════════════════════════════════════════════════
  // 21. IMAGES SECONDAIRES — expand toggle
  // ══════════════════════════════════════════════════
  (function () {
    var grid   = document.getElementById("wiki-secondary-grid");
    var btn    = document.getElementById("wiki-secondary-expand");
    if (!grid || !btn) return;
    btn.addEventListener("click", function () {
      grid.classList.add("wiki-secondary-imgs--expanded");
      btn.hidden = true;
    });
  })();

  // ══════════════════════════════════════════════════
  // 22. NOTE ÉDITORIALE "!" — positionnement du panneau
  // ══════════════════════════════════════════════════
  (function () {
    var note = document.querySelector(".wiki-editorial-note");
    if (!note) return;
    var body = note.querySelector(".wiki-editorial-body");
    if (!body) return;

    note.addEventListener("toggle", function () {
      if (!note.open) return;
      var btnRect = note.querySelector("summary").getBoundingClientRect();
      var panelW  = body.offsetWidth || 288; // 18rem fallback
      var margin  = 8;

      // Vertical : juste en dessous du bouton
      var top = btnRect.bottom + margin;
      // Horizontal : aligné à droite du bouton, mais contraint dans la fenêtre
      var right = window.innerWidth - btnRect.right;
      var left  = btnRect.right - panelW;
      if (left < margin) left = margin;
      if (left + panelW > window.innerWidth - margin) left = window.innerWidth - panelW - margin;

      body.style.top  = top  + "px";
      body.style.left = left + "px";
    });
  })();

  // ══════════════════════════════════════════════════
  // 23. CAROUSEL D'IMAGES — zone unifiée (éditeur)
  // ══════════════════════════════════════════════════
  (function () {
    var carousel = document.getElementById("wf-img-carousel");
    var metaInput = document.getElementById("wf-images-meta");
    if (!carousel || !metaInput) return;

    // ── État ────────────────────────────────────────
    // cover   : chemin (string) ou token "__new__:N"
    // secondary : { path/token: true }
    // sections  : { path/token: sectionTitle }
    // remove    : { path: true }
    // newFiles  : { N: File }  (index → File, pour DataTransfer)
    var state = {
      cover: null,
      secondary: {},
      sections: {},
      remove: {},
      newFiles: {},
      newIdx: 0
    };

    // ── Init depuis les data-* des cartes existantes ─
    var initCards = carousel.querySelectorAll(".wf-img-card");
    var firstCard = true;
    initCards.forEach(function (card) {
      var path = card.dataset.path;
      if (!path) return;
      if (card.dataset.cover === "1" || firstCard) {
        state.cover = path;
        firstCard = false;
      }
      if (card.dataset.secondary === "1") state.secondary[path] = true;
      if (card.dataset.section) state.sections[path] = card.dataset.section;
    });

    // ── Sérialise l'état dans le champ caché ────────
    function syncMeta() {
      var meta = {
        cover: state.cover || "",
        secondary: Object.keys(state.secondary),
        sections: state.sections,
        remove: Object.keys(state.remove)
      };
      metaInput.value = JSON.stringify(meta);
    }

    // ── Récupère les H2/H3 de l'éditeur riche ───────
    function getHeadings() {
      var editor = document.querySelector(".wiki-richtext");
      if (!editor) return [];
      var headings = [];
      editor.querySelectorAll("h2, h3").forEach(function (h) {
        var t = h.textContent.trim();
        if (t) headings.push(t);
      });
      return headings;
    }

    // ── Met à jour les <select> de section ──────────
    function refreshSectionSelects() {
      var headings = getHeadings();
      carousel.querySelectorAll(".wf-img-ctrl--section").forEach(function (sel) {
        var card = sel.closest(".wf-img-card");
        var key  = card ? (card.dataset.token || card.dataset.path) : null;
        var current = (key && state.sections[key]) || "";
        // Reconstruit les options
        sel.innerHTML = '<option value="">\u25b7\u00a0Section</option>';
        headings.forEach(function (h) {
          var opt = document.createElement("option");
          opt.value = h;
          opt.textContent = h.length > 20 ? h.slice(0, 18) + "\u2026" : h;
          sel.appendChild(opt);
        });
        // Forcer la valeur APRÈS la construction des options (plus fiable que opt.selected)
        sel.value = current;
        sel.classList.toggle("on", !!current && sel.value === current);
      });
    }

    // ── Crée une carte pour un fichier uploadé ──────
    function createNewCard(file, idx) {
      var token = "__new__:" + idx;
      var url   = URL.createObjectURL(file);

      var card = document.createElement("div");
      card.className = "wf-img-card";
      card.dataset.token = token;

      var photo = document.createElement("div");
      photo.className = "wf-img-card-photo";

      var img = document.createElement("img");
      img.src = url;
      img.className = "wf-img-thumb";
      img.alt = "";

      var rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.className = "wf-img-rm";
      rmBtn.title = "Supprimer";
      rmBtn.textContent = "\u00d7";

      photo.appendChild(img);
      photo.appendChild(rmBtn);

      var controls = document.createElement("div");
      controls.className = "wf-img-card-controls";

      var starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = "wf-img-ctrl wf-img-ctrl--star";
      starBtn.dataset.action = "cover";
      starBtn.title = "Image principale";
      starBtn.textContent = "\u2605";

      var heartBtn = document.createElement("button");
      heartBtn.type = "button";
      heartBtn.className = "wf-img-ctrl wf-img-ctrl--heart";
      heartBtn.dataset.action = "secondary";
      heartBtn.title = "Image secondaire";
      heartBtn.textContent = "\u2764";

      var secSel = document.createElement("select");
      secSel.className = "wf-img-ctrl wf-img-ctrl--section";
      secSel.dataset.action = "section";
      secSel.title = "Intégrer dans une section";
      secSel.innerHTML = '<option value="">\u25b7\u00a0Section</option>';
      getHeadings().forEach(function (h) {
        var opt = document.createElement("option");
        opt.value = h;
        opt.textContent = h.length > 20 ? h.slice(0, 18) + "\u2026" : h;
        secSel.appendChild(opt);
      });

      // Input fichier caché individuel (pour multer)
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.name = "images";
      fileInput.accept = "image/*";
      fileInput.hidden = true;

      // Assign le fichier via DataTransfer
      try {
        var dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
      } catch (e) { /* Safari < 14 fallback — multer recevra un champ vide */ }

      controls.appendChild(starBtn);
      controls.appendChild(heartBtn);
      controls.appendChild(secSel);
      card.appendChild(photo);
      card.appendChild(controls);
      card.appendChild(fileInput);

      attachCardListeners(card);
      return card;
    }

    // ── Attache les listeners sur une carte ─────────
    function attachCardListeners(card) {
      var key = function () { return card.dataset.token || card.dataset.path; };

      // Suppression
      var rmBtn = card.querySelector(".wf-img-rm");
      if (rmBtn) {
        rmBtn.addEventListener("click", function () {
          var k = key();
          if (card.dataset.path) {
            state.remove[k] = true;
          } else {
            // Nouvelle image : désactiver le fileInput pour qu'il ne s'uploade pas
            var fi = card.querySelector('input[type="file"]');
            if (fi) fi.disabled = true;
          }
          // Nettoie les autres rôles
          delete state.secondary[k];
          delete state.sections[k];
          if (state.cover === k) state.cover = null;
          card.dataset.removed = "1";
          syncMeta();
          // Si c'était le cover, passe au suivant visible
          if (!state.cover) {
            var next = carousel.querySelector(".wf-img-card:not([data-removed='1'])");
            if (next) {
              var nk = next.dataset.token || next.dataset.path;
              state.cover = nk;
              next.querySelector(".wf-img-ctrl--star").classList.add("on");
            }
          }
          syncMeta();
        });
      }

      // Étoile (cover)
      var star = card.querySelector(".wf-img-ctrl--star");
      if (star) {
        star.addEventListener("click", function () {
          // Retire l'ancien cover
          carousel.querySelectorAll(".wf-img-ctrl--star.on").forEach(function (s) {
            s.classList.remove("on");
          });
          var k = key();
          state.cover = k;
          star.classList.add("on");
          syncMeta();
        });
      }

      // Cœur (secondary)
      var heart = card.querySelector(".wf-img-ctrl--heart");
      if (heart) {
        heart.addEventListener("click", function () {
          var k = key();
          if (state.secondary[k]) {
            delete state.secondary[k];
            heart.classList.remove("on");
          } else {
            state.secondary[k] = true;
            heart.classList.add("on");
          }
          syncMeta();
        });
      }

      // Select de section
      var secSel = card.querySelector(".wf-img-ctrl--section");
      if (secSel) {
        secSel.addEventListener("change", function () {
          var k = key();
          if (secSel.value) {
            state.sections[k] = secSel.value;
            secSel.classList.add("on");
          } else {
            delete state.sections[k];
            secSel.classList.remove("on");
          }
          syncMeta();
        });
      }
    }

    // ── Attache les listeners sur les cartes existantes ─
    initCards.forEach(function (card) {
      attachCardListeners(card);
      // Sync état initial dans les contrôles
      var key = card.dataset.path;
      var star   = card.querySelector(".wf-img-ctrl--star");
      var heart  = card.querySelector(".wf-img-ctrl--heart");
      var secSel = card.querySelector(".wf-img-ctrl--section");
      if (star)   star.classList.toggle("on", state.cover === key);
      if (heart)  heart.classList.toggle("on", !!state.secondary[key]);
      // Section : sync visuel explicite (refreshSectionSelects reconstruira les options ensuite)
      if (secSel && state.sections[key]) {
        secSel.classList.add("on");
      }
    });

    // ── Gestion de l'input "+" (ajout de nouveaux fichiers) ─
    var addCard = carousel.querySelector(".wf-img-add-card");
    var addInput = addCard ? addCard.querySelector("input[type=file]") : null;
    if (addInput) {
      addInput.addEventListener("change", function () {
        Array.from(addInput.files).forEach(function (file) {
          var idx  = state.newIdx++;
          state.newFiles[idx] = file;
          var card = createNewCard(file, idx);
          // Insère avant la carte "+"
          carousel.insertBefore(card, addCard);
          // Auto-scroll vers la nouvelle carte
          card.scrollIntoView({ behavior: "smooth", inline: "nearest" });
        });
        // Réinitialise l'input pour permettre d'ajouter les mêmes fichiers
        addInput.value = "";
        syncMeta();
      });
    }

    // ── Rafraîchit les selects quand l'éditeur change ─
    var richEditor = document.querySelector(".wiki-richtext");
    if (richEditor) {
      richEditor.addEventListener("input", function () {
        refreshSectionSelects();
      });
    }

    // ── LIGHTBOX ─────────────────────────────────────
    var lb = document.createElement("div");
    lb.className = "wf-lightbox";
    lb.setAttribute("hidden", "");
    lb.innerHTML =
      '<div class="wf-lb-backdrop"></div>' +
      '<div class="wf-lb-inner">' +
        '<span class="wf-lb-counter"></span>' +
        '<button type="button" class="wf-lb-close">&#215;</button>' +
        '<button type="button" class="wf-lb-prev">&#8249;</button>' +
        '<img class="wf-lb-img" src="" alt="" />' +
        '<button type="button" class="wf-lb-next">&#8250;</button>' +
        '<div class="wf-lb-controls">' +
          '<button type="button" class="wf-lb-star">&#9733;</button>' +
          '<button type="button" class="wf-lb-heart">&#10084;</button>' +
          '<select class="wf-lb-section"><option value="">&#9657;\u00a0Section</option></select>' +
        '</div>' +
      '</div>';
    document.body.appendChild(lb);

    var lbImg     = lb.querySelector(".wf-lb-img");
    var lbCounter = lb.querySelector(".wf-lb-counter");
    var lbStar    = lb.querySelector(".wf-lb-star");
    var lbHeart   = lb.querySelector(".wf-lb-heart");
    var lbSel     = lb.querySelector(".wf-lb-section");
    var lbPrev    = lb.querySelector(".wf-lb-prev");
    var lbNext    = lb.querySelector(".wf-lb-next");
    var lbIdx     = 0;

    function getVisibleCards() {
      return Array.from(carousel.querySelectorAll(".wf-img-card:not([data-removed='1'])"));
    }

    function syncLbCard(cards) {
      var card = cards[lbIdx];
      if (!card) return;
      var thumb   = card.querySelector(".wf-img-thumb");
      var cStar   = card.querySelector(".wf-img-ctrl--star");
      var cHeart  = card.querySelector(".wf-img-ctrl--heart");
      var cSec    = card.querySelector(".wf-img-ctrl--section");

      lbImg.src = thumb ? thumb.src : "";
      lbCounter.textContent = (lbIdx + 1) + " / " + cards.length;
      lbStar.classList.toggle("on",  cStar  && cStar.classList.contains("on"));
      lbHeart.classList.toggle("on", cHeart && cHeart.classList.contains("on"));
      lbSel.innerHTML = cSec ? cSec.innerHTML : '<option value="">&#9657;\u00a0Section</option>';
      lbSel.value = cSec ? cSec.value : "";
      lbSel.classList.toggle("on", !!lbSel.value);
      lbPrev.disabled = lbIdx <= 0;
      lbNext.disabled = lbIdx >= cards.length - 1;
    }

    function openLightbox(card) {
      var cards = getVisibleCards();
      lbIdx = cards.indexOf(card);
      if (lbIdx < 0) lbIdx = 0;
      syncLbCard(cards);
      lb.removeAttribute("hidden");
      document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
      lb.setAttribute("hidden", "");
      document.body.style.overflow = "";
    }

    lbPrev.addEventListener("click", function () {
      var cards = getVisibleCards();
      if (lbIdx > 0) { lbIdx--; syncLbCard(cards); }
    });
    lbNext.addEventListener("click", function () {
      var cards = getVisibleCards();
      if (lbIdx < cards.length - 1) { lbIdx++; syncLbCard(cards); }
    });
    lb.querySelector(".wf-lb-close").addEventListener("click", closeLightbox);
    lb.querySelector(".wf-lb-backdrop").addEventListener("click", closeLightbox);

    // Contrôles lightbox → délèguent au card réel
    lbStar.addEventListener("click", function () {
      var card = getVisibleCards()[lbIdx];
      if (!card) return;
      card.querySelector(".wf-img-ctrl--star").click();
      syncLbCard(getVisibleCards());
    });
    lbHeart.addEventListener("click", function () {
      var card = getVisibleCards()[lbIdx];
      if (!card) return;
      card.querySelector(".wf-img-ctrl--heart").click();
      syncLbCard(getVisibleCards());
    });
    lbSel.addEventListener("change", function () {
      var card = getVisibleCards()[lbIdx];
      if (!card) return;
      var cSec = card.querySelector(".wf-img-ctrl--section");
      cSec.value = lbSel.value;
      cSec.dispatchEvent(new Event("change"));
      lbSel.classList.toggle("on", !!lbSel.value);
    });

    // Clavier
    document.addEventListener("keydown", function (e) {
      if (lb.hasAttribute("hidden")) return;
      if (e.key === "Escape")      closeLightbox();
      if (e.key === "ArrowLeft")   lbPrev.click();
      if (e.key === "ArrowRight")  lbNext.click();
    });

    // Clic sur la photo pour ouvrir (délégation sur le carousel)
    carousel.addEventListener("click", function (e) {
      if (e.target.closest(".wf-img-rm") || e.target.closest(".wf-img-card-controls") ||
          e.target.closest(".wf-img-add-card")) return;
      var card = e.target.closest(".wf-img-card");
      if (!card) return;
      openLightbox(card);
    });

    // ── Initialisation ─
    refreshSectionSelects();
    syncMeta();

    // ── Sync avant soumission ─
    var form = document.getElementById("wiki-edit-form");
    if (form) {
      form.addEventListener("submit", function () {
        syncMeta();
        try {
          var dbg = JSON.parse(metaInput.value);
          console.info("[images_meta] soumis :", JSON.stringify(dbg, null, 2));
        } catch (_) {}
      });
    }
  })();

  // ══════════════════════════════════════════════════
  // 25. IMAGE SCÉNARIO — upload + prévisualisation
  // ══════════════════════════════════════════════════
  (function () {
    var input   = document.getElementById("wf-scenario-img-input");
    var preview = document.getElementById("wf-scenario-img-preview");
    var pathEl  = document.getElementById("wf-scenario-img-path");
    var removeBtn = document.getElementById("wf-scenario-img-remove");
    if (!input || !preview || !pathEl) return;

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var url = URL.createObjectURL(file);
      preview.innerHTML = "";
      var img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.className = "wf-scenario-thumb";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wf-scenario-img-remove";
      btn.title = "Retirer l\u2019image";
      btn.innerHTML = "\u00D7";
      btn.addEventListener("click", clearScenarioImg);
      preview.appendChild(img);
      preview.appendChild(btn);
      preview.hidden = false;
      pathEl.value = "";
    });

    function clearScenarioImg() {
      preview.hidden = true;
      preview.innerHTML = "";
      pathEl.value = "";
      input.value = "";
    }

    if (removeBtn) removeBtn.addEventListener("click", clearScenarioImg);
  })();

  // ══════════════════════════════════════════════════
  // 24. AGE GATE (non connectés)
  // ══════════════════════════════════════════════════
  (function() {
    var gate = document.getElementById("age-gate");
    if (!gate) return; // utilisateur connecté ou page sans gate

    var AGE_KEY = "age_confirmed";
    if (sessionStorage.getItem(AGE_KEY)) {
      gate.hidden = true;
      return;
    }

    document.getElementById("age-gate-yes").addEventListener("click", function () {
      sessionStorage.setItem(AGE_KEY, "1");
      gate.hidden = true;
    });
  })();

  // ══════════════════════════════════════════════════
  // 25. DÉTECTION DOUBLON TITRE (formulaire création/édition)
  // ══════════════════════════════════════════════════
  (function () {
    var titleInput = document.querySelector(".wiki-title-input");
    if (!titleInput) return;

    var existingEl = document.getElementById("wiki-existing-pages");
    if (!existingEl) return;
    var existingPages;
    try { existingPages = JSON.parse(existingEl.textContent || "[]"); } catch (e) { return; }

    // ID de la page courante (édition) — null si création
    var currentId = Number(document.querySelector("[data-page-id]") && document.querySelector("[data-page-id]").dataset.pageId) || null;

    // Normalisation : minuscules + sans accents + sans ponctuation
    function normT(s) {
      return (s || "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    }

    function findSimilar(title) {
      var n = normT(title);
      if (n.length < 2) return null;
      return existingPages.find(function (p) {
        if (currentId && p.id === currentId) return false;
        var pn = normT(p.title);
        return pn === n || pn.indexOf(n) !== -1 || n.indexOf(pn) !== -1;
      }) || null;
    }

    // Insérer le hint sous le champ titre
    var titleRow = titleInput.closest(".wf-title-row");
    var hint = document.createElement("div");
    hint.className = "wiki-title-dup-hint";
    hint.hidden = true;
    titleRow.insertAdjacentElement("afterend", hint);

    function check() {
      var match = findSimilar(titleInput.value);
      if (match) {
        titleInput.classList.add("wiki-title-input--dup");
        hint.hidden = false;
        hint.innerHTML = "Page similaire\u00a0: <a href=\"/wiki/" + match.id + "\" target=\"_blank\" rel=\"noopener\">" +
          match.title + " \u2197</a>";
      } else {
        titleInput.classList.remove("wiki-title-input--dup");
        hint.hidden = true;
      }
    }

    titleInput.addEventListener("input", check);
    if (titleInput.value) check();
  })();

  // ══════════════════════════════════════════════════
  // 26. PANNEAU TODO ADMIN (wiki-index : pages à créer)
  // ══════════════════════════════════════════════════
  (function () {
    var listBtn = document.getElementById("wiki-fab-list-btn");
    if (!listBtn) return;

    var overlay   = document.getElementById("wiki-todo-overlay");
    var drawer    = document.getElementById("wiki-todo-drawer");
    var closeBtn  = document.getElementById("wiki-todo-close");
    var bodyEl    = document.getElementById("wiki-todo-body");
    var catsEl    = document.getElementById("wiki-todo-cats");
    var existingEl = document.getElementById("wiki-existing-pages");
    if (!overlay || !drawer || !bodyEl || !catsEl || !existingEl) return;

    var cats = JSON.parse(catsEl.textContent);
    var existingPages;
    try { existingPages = JSON.parse(existingEl.textContent || "[]"); } catch (e) { existingPages = []; }

    var TODO_KEY = "wiki-todo-list";

    function loadTodo() {
      try { return JSON.parse(localStorage.getItem(TODO_KEY) || "{}"); } catch (e) { return {}; }
    }
    function saveTodo(data) { localStorage.setItem(TODO_KEY, JSON.stringify(data)); }

    function normT(s) {
      return (s || "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    }

    function findSimilar(title) {
      var n = normT(title);
      if (n.length < 2) return null;
      return existingPages.find(function (p) {
        var pn = normT(p.title);
        return pn === n || pn.indexOf(n) !== -1 || n.indexOf(pn) !== -1;
      }) || null;
    }

    // État d'ouverture par catégorie (conservé entre rendus)
    var openState = {};

    function renderBody() {
      var data = loadTodo();
      // Sauvegarder l'état open des details avant de tout reconstruire
      bodyEl.querySelectorAll(".wiki-todo-cat").forEach(function (d) {
        openState[d.dataset.cat] = d.open;
      });
      bodyEl.innerHTML = "";

      cats.forEach(function (cat) {
        var items = data[cat.key] || [];

        var section = document.createElement("details");
        section.className = "wiki-todo-cat";
        section.dataset.cat = cat.key;
        // Ouvrir si des items existent OU si était ouvert avant
        section.open = openState[cat.key] !== undefined ? openState[cat.key] : items.length > 0;

        var summary = document.createElement("summary");
        summary.className = "wiki-todo-cat-summary";
        summary.style.setProperty("--ch-hue", cat.hue);
        summary.innerHTML =
          '<span class="wiki-todo-cat-label">' + cat.label + "</span>" +
          (items.length ? '<span class="wiki-todo-cat-count">' + items.length + "</span>" : "");
        section.appendChild(summary);

        var secBody = document.createElement("div");
        secBody.className = "wiki-todo-cat-body";

        // Ligne d'ajout
        var addRow = document.createElement("div");
        addRow.className = "wiki-todo-add-row";
        var inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = "Titre pr\u00e9vu\u2026";
        inp.className = "wiki-todo-add-input";
        var addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "wiki-todo-add-btn";
        addBtn.textContent = "+";

        (function (catKey, input) {
          function doAdd() {
            var val = input.value.trim();
            if (!val) return;
            var d = loadTodo();
            if (!d[catKey]) d[catKey] = [];
            if (d[catKey].indexOf(val) === -1) d[catKey].push(val);
            saveTodo(d);
            openState[catKey] = true;
            renderBody();
          }
          addBtn.addEventListener("click", doAdd);
          input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); doAdd(); }
          });
        })(cat.key, inp);

        addRow.appendChild(inp);
        addRow.appendChild(addBtn);
        secBody.appendChild(addRow);

        // Liste d'items
        if (items.length) {
          var ul = document.createElement("ul");
          ul.className = "wiki-todo-list";

          items.forEach(function (item, idx) {
            var similar = findSimilar(item);

            var li = document.createElement("li");
            li.className = "wiki-todo-item" + (similar ? " wiki-todo-item--dup" : "");

            var textEl = document.createElement("span");
            textEl.className = "wiki-todo-item-text";
            textEl.textContent = item;
            if (similar) {
              textEl.title = "Similaire \u00e0 : " + similar.title;
            }

            var actions = document.createElement("div");
            actions.className = "wiki-todo-item-actions";

            var goBtn = document.createElement("a");
            goBtn.href = "/wiki/ajouter?category=" + encodeURIComponent(cat.key) + "&title=" + encodeURIComponent(item);
            goBtn.className = "wiki-todo-go-btn";
            goBtn.title = "Cr\u00e9er cette page";
            goBtn.textContent = "\u2192";

            (function (catKey, title) {
              goBtn.addEventListener("click", function () {
                try { sessionStorage.setItem("wiki-todo-pending", JSON.stringify({ catKey: catKey, title: title })); } catch (_) {}
              });
            })(cat.key, item);

            var delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "wiki-todo-del-btn";
            delBtn.title = "Supprimer";
            delBtn.textContent = "\u00d7";

            (function (catKey, i) {
              delBtn.addEventListener("click", function () {
                var d = loadTodo();
                if (d[catKey]) d[catKey].splice(i, 1);
                saveTodo(d);
                renderBody();
              });
            })(cat.key, idx);

            actions.appendChild(goBtn);
            actions.appendChild(delBtn);
            li.appendChild(textEl);
            li.appendChild(actions);
            ul.appendChild(li);
          });

          secBody.appendChild(ul);
        }

        section.appendChild(secBody);
        bodyEl.appendChild(section);
      });
    }

    function openDrawer() {
      renderBody();
      overlay.hidden = false;
      drawer.hidden = false;
      document.body.classList.add("wiki-todo-open");
    }

    function closeDrawer() {
      overlay.hidden = true;
      drawer.hidden = true;
      document.body.classList.remove("wiki-todo-open");
    }

    listBtn.addEventListener("click", openDrawer);
    closeBtn.addEventListener("click", closeDrawer);
    overlay.addEventListener("click", closeDrawer);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !drawer.hidden) closeDrawer();
    });
  })();

  // ── "Explorer l'inconnu" : page codex aléatoire jamais notée ni en
  // favori, avec petit historique de session pour Précédent/Suivant.
  // Bouton dans le volet filtre (wiki.ejs/wiki-index.ejs) et bandeau sur la
  // fiche (wiki-detail.ejs, ?explore=1) — réutilise hideUltra/hideIrrealiste
  // du reste du fichier pour piocher parmi ce que l'utilisateur voit déjà.
  (function () {
    var exploreBtn = document.getElementById("wiki-explore-btn");
    var banner     = document.getElementById("wiki-explore-banner");
    if (!exploreBtn && !banner) return;

    var HKEY = "wiki-explore-history";
    var PKEY = "wiki-explore-pos";

    function getHistory() {
      try { return JSON.parse(sessionStorage.getItem(HKEY) || "[]"); } catch (_) { return []; }
    }
    function getPos() { return Number(sessionStorage.getItem(PKEY) || "0"); }
    function saveState(history, pos) {
      sessionStorage.setItem(HKEY, JSON.stringify(history));
      sessionStorage.setItem(PKEY, String(pos));
    }
    function fetchRandom(excludeIds, cb) {
      var params = new URLSearchParams();
      if (excludeIds.length) params.set("exclude", excludeIds.join(","));
      if (hideUltra) params.set("hideUltra", "1");
      if (hideIrrealiste) params.set("hideIrrealiste", "1");
      fetch("/wiki/explorer/aleatoire?" + params.toString())
        .then(function (r) { return r.json(); })
        .then(function (d) { cb(d.id || null); })
        .catch(function () { cb(null); });
    }
    function goTo(id) { window.location.href = "/wiki/" + id + "?explore=1"; }

    // Bouton du volet filtre : démarre une nouvelle session d'exploration.
    if (exploreBtn) {
      exploreBtn.addEventListener("click", function () {
        exploreBtn.disabled = true;
        fetchRandom([], function (id) {
          if (!id) {
            exploreBtn.textContent = "Tout est déjà exploré !";
            return;
          }
          saveState([id], 0);
          goTo(id);
        });
      });
    }

    // Bandeau de la fiche : Précédent/Suivant dans l'historique de session.
    if (banner) {
      var currentId = Number(banner.dataset.pageId);
      var prevBtn = document.getElementById("wiki-explore-prev");
      var nextBtn = document.getElementById("wiki-explore-next");
      var history = getHistory();
      var pos = getPos();

      // Arrivée sur une page en mode exploration sans historique cohérent
      // (lien partagé, rechargement après un long moment...) : on démarre
      // un historique à une page plutôt que de planter le bandeau.
      if (!history.length || history[pos] !== currentId) {
        history = [currentId];
        pos = 0;
        saveState(history, pos);
      }

      if (prevBtn) {
        prevBtn.disabled = pos <= 0;
        prevBtn.addEventListener("click", function () {
          if (pos <= 0) return;
          pos -= 1;
          saveState(history, pos);
          goTo(history[pos]);
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          if (pos < history.length - 1) {
            pos += 1;
            saveState(history, pos);
            goTo(history[pos]);
            return;
          }
          nextBtn.disabled = true;
          fetchRandom(history, function (id) {
            if (!id) {
              nextBtn.textContent = "Tout est exploré !";
              return;
            }
            history.push(id);
            pos = history.length - 1;
            saveState(history, pos);
            goTo(id);
          });
        });
      }

      // Entrée / → / swipe droite : contenu suivant. ← / swipe gauche :
      // précédent. Ignoré si le focus est dans un champ de saisie (ex. la
      // zone "Mes notes"), pour ne pas voler la touche Entrée.
      document.addEventListener("keydown", function (e) {
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key === "Enter" || e.key === "ArrowRight") {
          if (nextBtn) { e.preventDefault(); nextBtn.click(); }
        } else if (e.key === "ArrowLeft") {
          if (prevBtn && !prevBtn.disabled) { e.preventDefault(); prevBtn.click(); }
        }
      });

      var exploreSwipeStartX = 0;
      var exploreSwipeStartY = 0;
      document.addEventListener("touchstart", function (e) {
        exploreSwipeStartX = e.touches[0].clientX;
        exploreSwipeStartY = e.touches[0].clientY;
      }, { passive: true });
      document.addEventListener("touchend", function (e) {
        var dx = e.changedTouches[0].clientX - exploreSwipeStartX;
        var dy = e.changedTouches[0].clientY - exploreSwipeStartY;
        if (Math.abs(dx) > 80 && Math.abs(dy) < 60) {
          if (dx > 0 && nextBtn) nextBtn.click(); // swipe droite = suivant
          else if (dx < 0 && prevBtn && !prevBtn.disabled) prevBtn.click(); // swipe gauche = précédent
        }
      }, { passive: true });
    }
  })();

})();
