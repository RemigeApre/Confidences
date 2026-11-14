// ── Sélecteur de tags par catégorie (Images / BD / Histoires) ────────────────
// Remplit le même <input type="hidden" name="tags"> que l'ancien champ libre
// (.wiki-tags-widget) — aucune route de sauvegarde n'a besoin de changer.
// Un champ compact par catégorie (board à puces + saisie, comme l'ancien
// champ libre), peu importe les sous-catégories.
(function () {

  function makeBoard(fieldEl, cat, available, initialTags, selected, sync) {
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

    function addTag(t) {
      t = String(t || '').toLowerCase().trim();
      if (!t || has(t)) return;
      tags.push(t);
      render();
      selected[t] = true;
      sync();
      if (available.indexOf(t) === -1) {
        available.push(t);
        fetch('/api/tags/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: t, category: cat }),
        }).catch(function () {});
      }
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
    function showAc(q) {
      q = (q || '').trim().toLowerCase();
      if (!q) { closeAc(); return; }
      var matches = available.filter(function (t) {
        return t.toLowerCase().indexOf(q) !== -1 && !has(t);
      }).slice(0, 8);
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
    return { addTag: addTag, hasTag: has };
  }

  document.querySelectorAll('.cat-tags-widget').forEach(function (root) {
    var hidden = root.querySelector('.ctw-hidden');
    var dataEl = root.querySelector('.ctw-data');
    if (!hidden || !dataEl) return;

    var data = { available: {}, current: {} };
    try { data = JSON.parse(dataEl.textContent); } catch (_) {}

    var selected = {};
    (hidden.value || '').split(/[,;]+/).map(function (t) { return t.trim(); }).filter(Boolean).forEach(function (t) {
      selected[t.toLowerCase()] = true;
    });
    function sync() { hidden.value = Object.keys(selected).join(', '); }

    var boards = {};
    root.querySelectorAll('.ctw-field[data-cat]').forEach(function (fieldEl) {
      var cat = fieldEl.dataset.cat;
      boards[cat] = makeBoard(fieldEl, cat, data.available[cat], data.current[cat], selected, sync);
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

    sync();
  });
})();
