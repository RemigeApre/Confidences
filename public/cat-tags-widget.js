// ── Sélecteur de tags guidé par catégorie (Images / BD / Histoires) ──────────
// Remplit le même <input type="hidden" name="tags"> que l'ancien champ libre
// (.wiki-tags-widget) — aucune route de sauvegarde n'a besoin de changer.
(function () {
  document.querySelectorAll('.cat-tags-widget').forEach(function (root) {
    var hidden = root.querySelector('.ctw-hidden');
    if (!hidden) return;

    var selected = {};
    (hidden.value || '').split(/[,;]+/).map(function (t) { return t.trim(); }).filter(Boolean).forEach(function (t) {
      selected[t.toLowerCase()] = true;
    });

    function sync() { hidden.value = Object.keys(selected).join(', '); }

    function setTag(tag, on) {
      tag = String(tag || '').toLowerCase().trim();
      if (!tag) return;
      if (on) selected[tag] = true; else delete selected[tag];
      sync();
    }

    function wireChip(chip, tag) {
      chip.addEventListener('click', function () {
        var on = !chip.classList.contains('active');
        chip.classList.toggle('active', on);
        setTag(tag, on);
      });
    }

    root.querySelectorAll('.ctw-chip').forEach(function (chip) { wireChip(chip, chip.dataset.tag); });

    // Bascules Oui/Non (toutes les sections sauf Vêtement)
    root.querySelectorAll('.ctw-yn-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var section = btn.closest('.ctw-section');
        var body = section.querySelector('.ctw-section-body');
        var on = btn.dataset.state !== '1';
        btn.dataset.state = on ? '1' : '0';
        btn.classList.toggle('active', on);
        var label = btn.querySelector('.ctw-yn-label');
        if (label) label.textContent = on ? 'Oui' : 'Non';
        body.hidden = !on;
        if (!on) {
          // Repasser à "Non" décoche tout ce qui avait été choisi ici.
          section.querySelectorAll('.ctw-chip.active').forEach(function (chip) {
            chip.classList.remove('active');
            setTag(chip.dataset.tag, false);
          });
        }
      });
    });

    // Vêtement : "Personne n'est habillé·e" masque et vide le sélecteur.
    root.querySelectorAll('.ctw-nude-check').forEach(function (cb) {
      var section = cb.closest('.ctw-section');
      var body = section.querySelector('.ctw-section-body');
      function apply() {
        body.hidden = cb.checked;
        if (cb.checked) {
          section.querySelectorAll('.ctw-chip.active').forEach(function (chip) {
            chip.classList.remove('active');
            setTag(chip.dataset.tag, false);
          });
        }
      }
      cb.addEventListener('change', apply);
      apply();
    });

    // Ajout d'un nouveau tag, directement rattaché à sa catégorie (et
    // sous-catégorie si applicable) via l'API admin déjà existante.
    root.querySelectorAll('.ctw-add-row').forEach(function (row) {
      var input = row.querySelector('.ctw-add-input');
      if (!input) return;
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ',') return;
        e.preventDefault();
        var tag = input.value.toLowerCase().trim().replace(/[,;]+$/, '');
        if (!tag) return;
        input.value = '';
        if (selected[tag]) return;

        var cat = row.dataset.cat;
        var sub = row.dataset.sub || '';
        setTag(tag, true);

        var chipRow = row.previousElementSibling;
        if (chipRow && chipRow.classList.contains('ctw-chip-row')) {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'ctw-chip active';
          chip.dataset.tag = tag;
          chip.textContent = tag;
          wireChip(chip, tag);
          chipRow.appendChild(chip);
        }

        fetch('/api/tags/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: tag, category: cat }),
        }).then(function () {
          if (sub) {
            fetch('/api/tags/subcategory', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tag: tag, subcategory: sub, category: cat }),
            }).catch(function () {});
          }
        }).catch(function () {});
      });
    });

    // Hooks exposés pour du code externe (ex. détection de tags dans le
    // texte d'une histoire, voir nouvelles-form.ejs) qui doit pouvoir lire
    // et ajouter des tags sans dupliquer la logique du widget.
    root.ctwHasTag = function (tag) { return !!selected[String(tag || '').toLowerCase().trim()]; };
    root.ctwAddTag = function (tag) {
      tag = String(tag || '').toLowerCase().trim();
      if (!tag || selected[tag]) return;
      setTag(tag, true);
      var chip = root.querySelector('.ctw-chip[data-tag="' + tag + '"]');
      if (chip) chip.classList.add('active');
    };

    sync();
  });
})();
