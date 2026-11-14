// ── Sélecteur de tags par catégorie (Images / BD / Histoires) ────────────────
// Remplit le même <input type="hidden" name="tags"> que l'ancien champ libre
// (.wiki-tags-widget) — aucune route de sauvegarde n'a besoin de changer.
// Un champ compact par catégorie (board à puces + saisie, comme l'ancien
// champ libre), peu importe les sous-catégories.
(function () {

  function makeBoard(fieldEl, cat, available, initialTags, selected, sync, categoryOf, getBoard, trackFetch) {
    var board = fieldEl.querySelector('.ctw-board');
    var chipsArea = fieldEl.querySelector('.wiki-tags-chips');
    var typer = fieldEl.querySelector('.wiki-tags-typing');
    if (!board || !chipsArea || !typer) return null;

    available = (available || []).slice();
    var tags = (initialTags || []).slice();

    function has(t) { return tags.indexOf(t) !== -1; }

    function render() {
      while (chipsArea.firstChild) chipsArea.removeChild(chipsArea.firstChild);
      tags.forEach(function (t) {
        var chip = document.createElement('span');
        chip.className = 'wiki-chip';
        chip.appendChild(document.createTextNode(t));
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'wiki-chip-remove';
        rm.setAttribute('aria-label', 'Retirer');
        rm.textContent = '×';
        rm.addEventListener('click', function (e) { e.stopPropagation(); removeTag(t); });
        chip.appendChild(rm);
        chipsArea.appendChild(chip);
      });
    }

    // Ajoute réellement le tag à CE champ (pas de redirection ici).
    function addHere(t) {
      if (has(t)) return;
      tags.push(t);
      render();
      selected[t] = true;
      sync();
      if (available.indexOf(t) === -1) {
        available.push(t);
        // Un nouveau tag doit être créé ET affecté à sa catégorie avant que
        // le formulaire ne parte — voir le blocage de soumission ci-dessous,
        // sinon il pourrait finir sans catégorie en cas de coupure réseau.
        trackFetch(fetch('/api/tags/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: t, category: cat }),
        }).catch(function () {}));
      }
    }

    // Un tag déjà rattaché à une vraie catégorie (différente d'ici) part
    // dans le bon champ, même s'il a été tapé dans "Tags généraux" ou
    // ailleurs par erreur.
    function addTag(t) {
      t = String(t || '').toLowerCase().trim();
      if (!t || has(t)) return;
      var realCat = categoryOf[t];
      if (realCat && realCat !== cat && realCat !== 'autre') {
        var target = getBoard(realCat);
        if (target) { target.addTag(t); return; }
      }
      addHere(t);
    }
    function removeTag(t) {
      tags = tags.filter(function (x) { return x !== t; });
      render();
      delete selected[t];
      sync();
    }

    // Autocomplete (même principe que l'ancien champ libre)
    var acDrop = document.createElement('ul');
    acDrop.className = 'wiki-tag-autocomplete';
    acDrop.hidden = true;
    board.style.position = 'relative';
    board.parentNode.insertBefore(acDrop, board.nextSibling);
    var acSel = -1;

    function clearAc() { while (acDrop.firstChild) acDrop.removeChild(acDrop.firstChild); }
    function closeAc() { acDrop.hidden = true; clearAc(); acSel = -1; }
    // q vide → suggestions actives dès le focus (parcourir sans avoir à taper).
    function showAc(q) {
      q = (q || '').trim().toLowerCase();
      var pool = available.filter(function (t) { return !has(t); });
      var matches = (q ? pool.filter(function (t) { return t.toLowerCase().indexOf(q) !== -1; }) : pool).slice(0, 8);
      if (!matches.length) { closeAc(); return; }
      clearAc(); acSel = -1;
      matches.forEach(function (t) {
        var li = document.createElement('li');
        li.className = 'wiki-tag-ac-item';
        li.textContent = t;
        li.addEventListener('mousedown', function (e) {
          e.preventDefault(); addTag(t); typer.value = ''; closeAc(); typer.focus();
        });
        acDrop.appendChild(li);
      });
      acDrop.hidden = false;
    }

    typer.addEventListener('focus', function () { showAc(typer.value); });
    typer.addEventListener('input', function () { showAc(typer.value); });
    typer.addEventListener('blur', function () {
      if (typer.value.trim()) { addTag(typer.value.trim()); typer.value = ''; }
      setTimeout(closeAc, 160);
    });
    board.addEventListener('click', function (e) {
      if (e.target === board || e.target === chipsArea) typer.focus();
    });
    typer.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
        e.preventDefault();
        var val = typer.value.trim();
        if (val) { addTag(val); typer.value = ''; closeAc(); }
        return;
      }
      if (e.key === 'Backspace' && !typer.value && tags.length) {
        removeTag(tags[tags.length - 1]); return;
      }
      if (acDrop.hidden) return;
      var items = acDrop.querySelectorAll('.wiki-tag-ac-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); acSel = Math.min(acSel + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); acSel = Math.max(acSel - 1, 0); }
      else if ((e.key === 'Enter' || e.key === 'Tab') && acSel >= 0 && items[acSel]) {
        e.preventDefault(); e.stopImmediatePropagation();
        addTag(items[acSel].textContent); typer.value = ''; closeAc(); return;
      } else if (e.key === 'Escape') { closeAc(); return; }
      items.forEach(function (li, i) { li.classList.toggle('selected', i === acSel); });
    }, true);

    render();
    return { addTag: addTag, hasTag: has, getTags: function () { return tags.slice(); } };
  }

  document.querySelectorAll('.cat-tags-widget').forEach(function (root) {
    var hidden = root.querySelector('.ctw-hidden');
    var dataEl = root.querySelector('.ctw-data');
    if (!hidden || !dataEl) return;

    var data = { available: {}, current: {}, categoryOf: {} };
    try { data = JSON.parse(dataEl.textContent); } catch (_) {}

    var selected = {};
    (hidden.value || '').split(/[,;]+/).map(function (t) { return t.trim(); }).filter(Boolean).forEach(function (t) {
      selected[t.toLowerCase()] = true;
    });
    function sync() { hidden.value = Object.keys(selected).join(', '); }

    // Tags en cours de création (appels /api/tags/create pas encore
    // terminés) — voir le blocage de soumission plus bas : un nouveau tag
    // ne doit jamais finir sauvegardé sur le contenu sans catégorie assignée.
    var pending = [];
    function trackFetch(p) {
      pending.push(p);
      p.then(function () { pending.splice(pending.indexOf(p), 1); }, function () { pending.splice(pending.indexOf(p), 1); });
    }

    var boards = {};
    function getBoard(cat) { return boards[cat]; }
    root.querySelectorAll('.ctw-field[data-cat]').forEach(function (fieldEl) {
      var cat = fieldEl.dataset.cat;
      boards[cat] = makeBoard(fieldEl, cat, data.available[cat], data.current[cat], selected, sync, data.categoryOf || {}, getBoard, trackFetch);
    });

    // Hooks exposés pour du code externe (ex. détection de tags dans le
    // texte d'une histoire, voir nouvelles-form.ejs).
    root.ctwHasTag = function (tag) { return !!selected[String(tag || '').toLowerCase().trim()]; };
    root.ctwAddTag = function (tag) {
      tag = String(tag || '').toLowerCase().trim();
      if (!tag || selected[tag]) return;
      var board = boards.autre;
      if (board) board.addTag(tag); else { selected[tag] = true; sync(); }
    };

    // ── Copier / importer au format "label{tag1, tag2} label2{tag3}" ──────
    function fieldLabel(fieldEl) {
      var el = fieldEl.querySelector('.ctw-field-label');
      return el ? el.textContent.trim() : fieldEl.dataset.cat;
    }
    function serialize() {
      var parts = [];
      root.querySelectorAll('.ctw-field[data-cat]').forEach(function (fieldEl) {
        var board = boards[fieldEl.dataset.cat];
        if (!board) return;
        var tags = board.getTags();
        if (tags.length) parts.push(fieldLabel(fieldEl) + '{' + tags.join(', ') + '}');
      });
      return parts.join(' ');
    }

    var copyBtn = root.querySelector('.ctw-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = serialize();
        var flash = function () {
          var old = copyBtn.textContent;
          copyBtn.textContent = 'Copié !';
          setTimeout(function () { copyBtn.textContent = old; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(flash).catch(function () { window.prompt('Copiez ce texte :', text); });
        } else {
          window.prompt('Copiez ce texte :', text);
        }
      });
    }

    var importBtn = root.querySelector('.ctw-import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        var text = window.prompt('Collez le texte au format cat{tag1, tag2} cat2{tag3}…');
        if (!text) return;
        var re = /([^{}]+)\{([^{}]*)\}/g;
        var m;
        var unmatched = [];
        while ((m = re.exec(text))) {
          var label = m[1].trim().toLowerCase();
          var list = m[2].split(',').map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
          if (!list.length) continue;
          var targetCat = null;
          root.querySelectorAll('.ctw-field[data-cat]').forEach(function (fieldEl) {
            if (targetCat) return;
            if (fieldLabel(fieldEl).toLowerCase() === label) targetCat = fieldEl.dataset.cat;
          });
          var board = (targetCat && boards[targetCat]) || boards.autre;
          if (board) list.forEach(function (t) { board.addTag(t); });
          if (!targetCat) unmatched.push(m[1].trim());
        }
        if (unmatched.length) {
          alert('Catégorie(s) non reconnue(s) : "' + unmatched.join('", "') + '" — placées dans "Tags généraux".');
        }
      });
    }

    // Le formulaire attend que les créations de tags en cours soient
    // confirmées (catégorie bien enregistrée) avant de partir réellement —
    // sinon un tag tapé juste avant "Enregistrer" pourrait finir sans
    // catégorie si la requête n'a pas eu le temps d'aboutir.
    var formEl = root.closest('form');
    if (formEl) {
      formEl.addEventListener('submit', function (e) {
        if (!pending.length) return;
        e.preventDefault();
        var settle = Promise.all(pending.map(function (p) { return p; }));
        var timeout = new Promise(function (resolve) { setTimeout(resolve, 4000); });
        Promise.race([settle, timeout]).then(function () { formEl.submit(); });
      });
    }

    sync();
  });
})();
