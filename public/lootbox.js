/* Lootbox widget — état, animation, ouverture, zoom, navigation */
(function () {
  "use strict";

  // ── Éléments DOM ────────────────────────────────────────────────────────────
  var overlay  = document.getElementById("lootbox-overlay");
  var navBadge       = document.getElementById("nav-jeu-badge");
  var navBadgeMobile = document.getElementById("nav-jeu-badge-mobile");

  // Écran de choix "1 ou tout"
  var choicePanel    = document.getElementById("lootbox-choice");
  var choiceCountLbl = document.getElementById("lootbox-choice-count-label");
  var choiceOneBtn   = document.getElementById("lootbox-choice-one");
  var choiceAllBtn   = document.getElementById("lootbox-choice-all");
  var choiceCancelBtn = document.getElementById("lootbox-choice-cancel");

  // Ouverture normale (image)
  var chest       = document.getElementById("lootbox-reveal-chest");
  var card        = document.getElementById("lootbox-reveal-card");
  var imgWrap     = document.getElementById("lootbox-reveal-img-wrap");
  var imgEl       = document.getElementById("lootbox-reveal-img");
  var placeholder = document.getElementById("lootbox-reveal-placeholder");
  var hintEl      = document.getElementById("lootbox-reveal-hint");
  var closeBtn    = document.getElementById("lootbox-reveal-close");
  var nextBtn     = document.getElementById("lootbox-reveal-next");

  // Résultats batch
  var batchPanel  = document.getElementById("lootbox-batch-results");
  var batchGrid   = document.getElementById("lootbox-batch-grid");

  // Lootbox à choix (pick-choice panel)
  var pickChoicePanel   = document.getElementById("lootbox-pick-choice");
  var pickChoiceGrid    = document.getElementById("lootbox-pick-choice-grid");
  var pickChoiceCounter = document.getElementById("lootbox-pick-choice-counter");
  var pickChoiceConfirm = document.getElementById("lootbox-pick-choice-confirm");

  // Récompense charme
  var charmReveal     = document.getElementById("lootbox-charm-reveal");
  var charmSymbolEl   = document.getElementById("lootbox-charm-symbol");
  var charmLabelEl    = document.getElementById("lootbox-charm-label");
  var charmHintEl     = document.getElementById("lootbox-charm-hint");
  var charmEquipBtn   = document.getElementById("lootbox-charm-equip-btn");
  var charmEquipDone  = document.getElementById("lootbox-charm-equip-done");

  // Récompense joker
  var jokerReveal     = document.getElementById("lootbox-joker-reveal");
  var jokerTitleEl    = document.getElementById("lootbox-joker-title");
  var jokerDescEl     = document.getElementById("lootbox-joker-desc");
  var jokerUseBtn     = document.getElementById("lootbox-joker-use-btn");

  // Zoom
  var zoomOverlay  = document.getElementById("lootbox-zoom-overlay");
  var zoomImg      = document.getElementById("lootbox-zoom-img");
  var zoomClose    = document.getElementById("lootbox-zoom-close");
  var zoomPrev     = document.getElementById("lootbox-zoom-prev");
  var zoomNext     = document.getElementById("lootbox-zoom-next");
  var zoomCounter  = document.getElementById("lootbox-zoom-counter");
  var zoomAvatarBtn = document.getElementById("lootbox-zoom-avatar-btn");
  var zoomImgOuter = document.getElementById("lootbox-zoom-img-outer");

  // Joker pickers
  var jokerImagePicker  = document.getElementById("lootbox-joker-image-picker");
  var jokerImageGrid    = document.getElementById("lootbox-joker-image-grid");
  var jokerImageClose   = document.getElementById("lootbox-joker-image-close");
  var jokerImageStatus  = document.getElementById("lootbox-joker-image-status");
  var jokerCharmPicker  = document.getElementById("lootbox-joker-charm-picker");
  var jokerCharmList    = document.getElementById("lootbox-joker-charm-list");
  var jokerCharmClose   = document.getElementById("lootbox-joker-charm-close");
  var jokerCharmStatus  = document.getElementById("lootbox-joker-charm-status");

  // Coffre page /jeu (optionnel)
  var jeuBtn   = document.getElementById("jeu-lootbox-btn");
  var jeuCount = document.getElementById("jeu-lootbox-count");
  var jeuLabel = document.getElementById("jeu-lootbox-label");

  // Récompense thème
  var themeReveal    = document.getElementById("lootbox-theme-reveal");
  var themeSwatch    = document.getElementById("lootbox-theme-swatch");
  var themeLabelEl   = document.getElementById("lootbox-theme-label");
  var themeRarityEl  = document.getElementById("lootbox-theme-rarity");
  var themeHintEl    = document.getElementById("lootbox-theme-hint");
  var themeApplyBtn  = document.getElementById("lootbox-theme-apply-btn");
  var themeApplyDone = document.getElementById("lootbox-theme-apply-done");

  if (!overlay) return;

  // ── État ─────────────────────────────────────────────────────────────────────
  var _count          = 0;
  var _opening        = false;
  var _sessionRewards = [];
  var _rewardQueue    = []; // file d'attente des récompenses restantes pour la boîte en cours
  var _zoomList       = [];
  var _zoomIdx        = 0;
  var _avatarSetId    = null;
  var _pendingJokerType = null; // 'image' | 'charm'

  // ── Compteur ─────────────────────────────────────────────────────────────────
  function refreshCount() {
    fetch("/lootbox/count")
      .then(function (r) { return r.json(); })
      .then(function (d) { setCount(d.count || 0); })
      .catch(function () {});
  }
  window._lbRefreshCount = refreshCount;

  function setCount(n) {
    _count = n;
    var label = n > 99 ? "99+" : String(n);
    [navBadge, navBadgeMobile].forEach(function (el) {
      if (!el) return;
      if (n > 0) { el.textContent = label; el.removeAttribute("hidden"); }
      else        { el.setAttribute("hidden", ""); }
    });
    if (jeuBtn) {
      if (n > 0) {
        jeuBtn.removeAttribute("disabled");
        jeuBtn.setAttribute("data-has-loot", "1");
        if (jeuCount) { jeuCount.textContent = label; jeuCount.removeAttribute("hidden"); }
        if (jeuLabel) jeuLabel.textContent = n === 1 ? "1 lootbox" : n + " lootboxes";
      } else {
        jeuBtn.setAttribute("disabled", "");
        jeuBtn.removeAttribute("data-has-loot");
        if (jeuCount) jeuCount.setAttribute("hidden", "");
        if (jeuLabel) jeuLabel.textContent = "Aucune lootbox";
      }
    }
  }

  // ── Déclencheurs ─────────────────────────────────────────────────────────────
  function onTrigger() {
    if (_opening || _count <= 0) return;
    _sessionRewards = [];
    _rewardQueue    = [];
    _avatarSetId    = null;
    if (_count >= 2) {
      showChoice();
    } else {
      startOpeningOne();
    }
  }

  if (jeuBtn) jeuBtn.addEventListener("click", onTrigger);

  // ── Écran de choix "1 ou tout" ───────────────────────────────────────────────
  function showChoice() {
    _opening = true;
    overlay.removeAttribute("hidden");
    hideAll();
    if (choiceCountLbl) choiceCountLbl.textContent = _count;
    if (choicePanel) choicePanel.removeAttribute("hidden");
  }

  choiceOneBtn    && choiceOneBtn.addEventListener("click", function () {
    if (choicePanel) choicePanel.setAttribute("hidden", "");
    startOpeningOne();
  });

  choiceAllBtn    && choiceAllBtn.addEventListener("click", function () {
    if (choicePanel) choicePanel.setAttribute("hidden", "");
    startOpeningAll();
  });

  choiceCancelBtn && choiceCancelBtn.addEventListener("click", closeOverlay);

  // ── Ouverture une par une ────────────────────────────────────────────────────
  function startOpeningOne() {
    _opening = true;
    overlay.removeAttribute("hidden");
    showChestAnimation(function (data) {
      if (!data || !data.ok) { closeOverlay(); return; }
      setCount(_count - 1);

      if (data.isChoice) {
        showPickChoicePanel(data.sessionId, data.options);
        return;
      }

      // 3 récompenses en file d'attente
      var rewards = data.rewards || [];
      var isGift = !!data.isGift;
      rewards.forEach(function (r) {
        r._isGift = isGift;
        _sessionRewards.push(r);
        _rewardQueue.push(r);
      });
      showNextQueued();
    });
  }

  // Affiche la prochaine récompense en file, ou ferme si plus rien
  function showNextQueued() {
    var r = _rewardQueue.shift();
    if (!r) { closeOverlay(); return; }
    var hasMore = _rewardQueue.length > 0 || _count > 0;
    if (r.isJoker) { showJokerReveal(r, hasMore); return; }
    if (r.isCharm) { showCharmReveal(r, hasMore); return; }
    if (r.isCoins) { showCoinsCard(r, hasMore); return; }
    if (r.isTheme) { showThemeReveal(r, hasMore); return; }
    showRewardCard(r, hasMore);
  }

  // ── Récompense pièces (doublon ou rareté épuisée) ─────────────────────────
  function showCoinsCard(reward, hasNext) {
    hideAll();
    if (!card) { closeOverlay(); return; }
    var rarity = reward.rarity || 'common';
    var RARITY_COLORS = { common: '#94a3b8', rare: '#60a5fa', epic: '#a78bfa', legendary: '#fbbf24', mythic: '#f87171' };
    var color = RARITY_COLORS[rarity] || '#94a3b8';
    // Réutilise le card slot mais avec contenu pièces
    if (imgWrap) {
      imgWrap.setAttribute('data-rarity', rarity);
      imgWrap.innerHTML = '';
      var coinDiv = document.createElement('div');
      coinDiv.className = 'lootbox-coins-reward';
      coinDiv.style.setProperty('--coin-color', color);
      coinDiv.innerHTML = '<svg viewBox="0 0 60 60" class="lootbox-coins-svg" aria-hidden="true">'
        + '<circle cx="30" cy="30" r="28" fill="hsl(44,95%,55%)" stroke="hsl(44,70%,35%)" stroke-width="2.5"/>'
        + '<text x="30" y="38" text-anchor="middle" font-size="22" font-weight="bold" fill="hsl(44,35%,20%)">P</text>'
        + '</svg>'
        + '<span class="lootbox-coins-amount" style="color:' + color + '">' + (reward.coins || 0) + '</span>'
        + '<span class="lootbox-coins-label">pi\u00e8ces</span>';
      imgWrap.appendChild(coinDiv);
    }
    if (hintEl) hintEl.setAttribute('hidden', '');
    card.removeAttribute('hidden');
    card.classList.remove('lootbox-card--in');
    requestAnimationFrame(function() { requestAnimationFrame(function() { card.classList.add('lootbox-card--in'); }); });
    if (closeBtn) closeBtn.removeAttribute('hidden');
    if (nextBtn) {
      if (hasNext) nextBtn.removeAttribute('hidden');
      else         nextBtn.setAttribute('hidden', '');
    }
  }

  function showChestAnimation(cb) {
    hideAll();
    if (chest) {
      chest.removeAttribute("hidden");
      chest.classList.remove("lootbox-chest--opening", "lootbox-chest--done");
    }
    fetch("/lootbox/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (chest) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { chest.classList.add("lootbox-chest--opening"); });
          });
        }
        setTimeout(function () {
          if (chest) { chest.classList.add("lootbox-chest--done"); chest.setAttribute("hidden", ""); }
          cb(data);
        }, 900);
      })
      .catch(function () { setTimeout(closeOverlay, 600); });
  }

  // ── Lootbox à choix : 9 options, l'utilisateur en choisit 3 ─────────────────
  function showPickChoicePanel(sessionId, options) {
    hideAll();
    if (!pickChoicePanel || !pickChoiceGrid) { closeOverlay(); return; }
    while (pickChoiceGrid.firstChild) pickChoiceGrid.removeChild(pickChoiceGrid.firstChild);

    var selectedIdxs = [];

    function updateFooter() {
      var n = selectedIdxs.length;
      if (pickChoiceCounter) pickChoiceCounter.textContent = n + " / 3";
      if (pickChoiceConfirm) pickChoiceConfirm.disabled = n < 3;
    }

    options.forEach(function (opt, idx) {
      var rarity = opt.rarity || 'common';
      var card = document.createElement("div");
      card.className = "lootbox-pick-card lootbox-pick-card--" + rarity;
      card.setAttribute("data-rarity", rarity);

      var imgDiv = document.createElement("div");
      imgDiv.className = "lootbox-pick-card-img";
      if (opt.thumb) {
        var img = document.createElement("img");
        img.src = opt.thumb;
        img.alt = opt.title || "";
        imgDiv.appendChild(img);
      } else {
        imgDiv.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="4" y="4" width="40" height="40" rx="4"/><circle cx="17" cy="17" r="5"/><path d="M4 34l12-12 8 8 6-6 14 14"/></svg>';
      }
      var badge = document.createElement("span");
      badge.className = "lootbox-pick-card-rarity";
      badge.textContent = rarity;
      card.appendChild(imgDiv);
      card.appendChild(badge);

      card.addEventListener("click", function () {
        var pos = selectedIdxs.indexOf(idx);
        if (pos !== -1) {
          // Désélectionner
          selectedIdxs.splice(pos, 1);
          card.classList.remove("lootbox-pick-card--selected");
        } else if (selectedIdxs.length < 3) {
          // Sélectionner
          selectedIdxs.push(idx);
          card.classList.add("lootbox-pick-card--selected");
        }
        updateFooter();
      });

      pickChoiceGrid.appendChild(card);
    });

    updateFooter();

    if (pickChoiceConfirm) {
      // Remplacer le listener existant en clonant le bouton
      var newConfirm = pickChoiceConfirm.cloneNode(true);
      pickChoiceConfirm.parentNode.replaceChild(newConfirm, pickChoiceConfirm);
      pickChoiceConfirm = newConfirm;
      if (pickChoiceCounter) pickChoiceCounter.textContent = "0 / 3";
      pickChoiceConfirm.disabled = true;

      pickChoiceConfirm.addEventListener("click", function () {
        if (selectedIdxs.length !== 3) return;
        pickChoiceGrid.querySelectorAll(".lootbox-pick-card").forEach(function (c) { c.style.pointerEvents = "none"; });
        pickChoiceConfirm.disabled = true;
        fetch("/lootbox/pick-choice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId, optionIdxs: selectedIdxs }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d.ok) { closeOverlay(); return; }
            pickChoicePanel.setAttribute("hidden", "");
            var rewards = d.rewards || [];
            rewards.forEach(function (r) {
              _sessionRewards.push(r);
              _rewardQueue.push(r);
            });
            showNextQueued();
          })
          .catch(closeOverlay);
      });
    }

    pickChoicePanel.removeAttribute("hidden");
  }

  // ── Récompense image ─────────────────────────────────────────────────────────
  function showRewardCard(reward, hasNext) {
    var rarity = reward.rarity || "common";
    if (imgWrap) imgWrap.setAttribute("data-rarity", rarity);
    if (reward.thumb) {
      if (imgEl)       { imgEl.src = reward.thumb; imgEl.alt = ""; imgEl.removeAttribute("hidden"); }
      if (placeholder) placeholder.setAttribute("hidden", "");
    } else {
      if (imgEl)       imgEl.setAttribute("hidden", "");
      if (placeholder) placeholder.removeAttribute("hidden");
    }
    if (hintEl) {
      if (reward.isDuplicate) hintEl.removeAttribute("hidden");
      else                    hintEl.setAttribute("hidden", "");
    }
    if (card) {
      // Gift banner
      var _gb = card.querySelector('.lootbox-gift-banner');
      if (_gb) _gb.remove();
      if (reward._isGift) {
        var _gb = document.createElement('div');
        _gb.className = 'lootbox-gift-banner';
        _gb.textContent = '\uD83C\uDF81 Cadeau sp\u00e9cial';
        card.insertBefore(_gb, card.firstChild);
      }
      card.removeAttribute("hidden");
      card.classList.remove("lootbox-card--in");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { card.classList.add("lootbox-card--in"); });
      });
    }
    if (closeBtn) closeBtn.removeAttribute("hidden");
    if (nextBtn) {
      if (hasNext) nextBtn.removeAttribute("hidden");
      else         nextBtn.setAttribute("hidden", "");
    }
  }

  nextBtn && nextBtn.addEventListener("click", function () {
    if (card)     card.setAttribute("hidden", "");
    if (closeBtn) closeBtn.setAttribute("hidden", "");
    if (nextBtn)  nextBtn.setAttribute("hidden", "");
    if (_rewardQueue.length > 0) {
      showNextQueued();
    } else {
      startOpeningOne();
    }
  });

  imgWrap && imgWrap.addEventListener("click", function () {
    if (imgEl && !imgEl.hasAttribute("hidden") && imgEl.src) {
      openZoom(_sessionRewards.filter(function(r) { return !r.itemType; }), _sessionRewards.filter(function(r) { return !r.itemType; }).length - 1);
    }
  });

  // ── Récompense thème ─────────────────────────────────────────────────────────
  var THEME_COLORS = { rouge: 'hsl(355,55%,32%)', vert: 'hsl(148,42%,28%)', violet: 'hsl(270,58%,32%)', bleu: 'hsl(212,65%,32%)', rose: 'hsl(330,58%,32%)', blanc: 'hsl(0,0%,90%)', default: 'hsl(240,6%,20%)' };
  var THEME_RARITY_LABEL = { rare: 'Rare', epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique' };

  function showThemeReveal(reward, hasNext) {
    hideAll();
    if (!themeReveal) { closeOverlay(); return; }
    var color = THEME_COLORS[reward.themeKey] || '#333';
    if (themeSwatch)   { themeSwatch.style.background = color; themeSwatch.setAttribute('data-rarity', reward.rarity || 'rare'); }
    if (themeLabelEl)  themeLabelEl.textContent = reward.label || '';
    if (themeRarityEl) themeRarityEl.textContent = THEME_RARITY_LABEL[reward.rarity] || reward.rarity || '';
    if (themeHintEl)   { if (reward.isDuplicate) themeHintEl.removeAttribute('hidden'); else themeHintEl.setAttribute('hidden', ''); }
    if (themeApplyBtn) { themeApplyBtn.removeAttribute('hidden'); themeApplyBtn.disabled = false; themeApplyBtn.dataset.themeKey = reward.themeKey || ''; }
    if (themeApplyDone) themeApplyDone.setAttribute('hidden', '');
    themeReveal.setAttribute('data-rarity', reward.rarity || 'rare');
    themeReveal.removeAttribute('hidden');
    if (closeBtn) closeBtn.removeAttribute('hidden');
    if (nextBtn)  { if (hasNext) nextBtn.removeAttribute('hidden'); else nextBtn.setAttribute('hidden', ''); }
  }

  themeApplyBtn && themeApplyBtn.addEventListener('click', function () {
    var key = themeApplyBtn.dataset.themeKey;
    if (!key) return;
    themeApplyBtn.disabled = true;
    fetch('/favoris/coffre/set-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeKey: key }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          if (themeApplyBtn) themeApplyBtn.setAttribute('hidden', '');
          if (themeApplyDone) themeApplyDone.removeAttribute('hidden');
          // Applique le thème immédiatement sans reload
          if (key === 'default') document.documentElement.removeAttribute('data-theme');
          else document.documentElement.setAttribute('data-theme', key);
        } else {
          themeApplyBtn.disabled = false;
        }
      })
      .catch(function () { themeApplyBtn.disabled = false; });
  });

  // ── Récompense charme ────────────────────────────────────────────────────────
  function showCharmReveal(reward, hasNext) {
    hideAll();
    if (!charmReveal) { closeOverlay(); return; }

    var sym = reward.charmKey ? (window._CHARM_SYM_MAP && window._CHARM_SYM_MAP[reward.charmKey]) || reward.symbol || '★' : '★';
    if (charmSymbolEl)  charmSymbolEl.textContent = sym;
    if (charmLabelEl)   charmLabelEl.textContent  = reward.label || '';
    if (charmHintEl)    { if (reward.isDuplicate) charmHintEl.removeAttribute("hidden"); else charmHintEl.setAttribute("hidden", ""); }
    if (charmEquipBtn)  { charmEquipBtn.removeAttribute("hidden"); charmEquipBtn.disabled = false; charmEquipBtn.dataset.charmKey = reward.charmKey || ''; }
    if (charmEquipDone) charmEquipDone.setAttribute("hidden", "");

    charmReveal.setAttribute("data-rarity", reward.rarity || "legendary");
    // Gift banner
    var _cg = charmReveal.querySelector('.lootbox-gift-banner');
    if (_cg) _cg.remove();
    if (reward._isGift) {
      var _cgb = document.createElement('div');
      _cgb.className = 'lootbox-gift-banner';
      _cgb.textContent = '\uD83C\uDF81 Cadeau sp\u00e9cial';
      charmReveal.insertBefore(_cgb, charmReveal.firstChild);
    }
    charmReveal.removeAttribute("hidden");

    if (closeBtn) closeBtn.removeAttribute("hidden");
    if (nextBtn)  { if (hasNext) nextBtn.removeAttribute("hidden"); else nextBtn.setAttribute("hidden", ""); }
  }

  charmEquipBtn && charmEquipBtn.addEventListener("click", function () {
    var key = charmEquipBtn.dataset.charmKey;
    if (!key) return;
    charmEquipBtn.disabled = true;
    fetch("/lootbox/set-charm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ charmKey: key }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          if (charmEquipBtn)  charmEquipBtn.setAttribute("hidden", "");
          if (charmEquipDone) charmEquipDone.removeAttribute("hidden");
          // Patch les étoiles visibles sur la page
          var sym = charmEquipBtn.textContent; // fallback; better to use stored symbol
          var stored = document.querySelector('#lootbox-charm-symbol');
          if (stored) {
            var s = stored.textContent;
            document.querySelectorAll('.gallery-star,.bd-star,.wiki-star,.wiki-card-star,.bd-card-star').forEach(function(el) { el.textContent = s; });
            window.RATING_CHARM = { key: key, symbol: s };
          }
        } else {
          charmEquipBtn.disabled = false;
        }
      })
      .catch(function () { charmEquipBtn.disabled = false; });
  });

  // ── Récompense joker ─────────────────────────────────────────────────────────
  function showJokerReveal(reward, hasNext) {
    hideAll();
    if (!jokerReveal) { closeOverlay(); return; }

    var isImage = reward.jokerType === 'image';
    if (jokerTitleEl) jokerTitleEl.textContent = isImage ? 'Joker Image' : 'Joker Charme';
    if (jokerDescEl)  jokerDescEl.textContent  = isImage
      ? 'Débloque n\'importe quelle image de profil non possédée.'
      : 'Débloque n\'importe quel charme non possédé.';
    if (jokerUseBtn)  {
      jokerUseBtn.dataset.jokerType = reward.jokerType;
      jokerUseBtn.removeAttribute("hidden");
      jokerUseBtn.disabled = !!reward.isDuplicate;
    }
    jokerReveal.setAttribute("data-rarity", reward.rarity || "legendary");
    if (reward.isDuplicate && jokerDescEl) jokerDescEl.textContent += ' (Doublon — converti en pièces.)';
    jokerReveal.removeAttribute("hidden");

    if (closeBtn) closeBtn.removeAttribute("hidden");
    if (nextBtn)  { if (hasNext) nextBtn.removeAttribute("hidden"); else nextBtn.setAttribute("hidden", ""); }
  }

  jokerUseBtn && jokerUseBtn.addEventListener("click", function () {
    var type = jokerUseBtn.dataset.jokerType;
    _pendingJokerType = type;
    if (type === 'image')  openJokerImagePicker();
    if (type === 'charm')  openJokerCharmPicker();
  });

  // ── Joker Image Picker ───────────────────────────────────────────────────────
  function openJokerImagePicker() {
    if (!jokerImagePicker || !jokerImageGrid) return;
    while (jokerImageGrid.firstChild) jokerImageGrid.removeChild(jokerImageGrid.firstChild);
    if (jokerImageStatus) jokerImageStatus.textContent = 'Chargement…';
    jokerImagePicker.removeAttribute("hidden");

    fetch("/lootbox/joker-picker?type=image")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (jokerImageStatus) jokerImageStatus.textContent = '';
        if (!d.images || !d.images.length) {
          if (jokerImageStatus) jokerImageStatus.textContent = 'Aucune image disponible.';
          return;
        }
        d.images.forEach(function (img) {
          var card = document.createElement("div");
          card.className = "lootbox-joker-image-card";
          card.setAttribute("data-rarity", img.rarity || 'common');
          if (img.thumb) {
            var i = document.createElement("img");
            i.src = img.thumb; i.alt = img.title || '';
            card.appendChild(i);
          }
          card.addEventListener("click", function () {
            if (card.classList.contains("loading")) return;
            card.classList.add("loading");
            if (jokerImageStatus) jokerImageStatus.textContent = 'Déverrouillage…';
            fetch("/lootbox/use-joker", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: 'image', imageId: img.id }),
            })
              .then(function (r) { return r.json(); })
              .then(function (res) {
                if (res.ok) {
                  if (jokerImageStatus) jokerImageStatus.textContent = '✓ Image déverrouillée !';
                  setTimeout(function () { closeJokerPickers(); closeOverlay(); }, 1200);
                } else {
                  card.classList.remove("loading");
                  if (jokerImageStatus) jokerImageStatus.textContent = res.error === 'already_owned' ? 'Déjà possédé.' : 'Erreur.';
                }
              })
              .catch(function () { card.classList.remove("loading"); });
          });
          jokerImageGrid.appendChild(card);
        });
      })
      .catch(function () { if (jokerImageStatus) jokerImageStatus.textContent = 'Erreur réseau.'; });
  }

  jokerImageClose && jokerImageClose.addEventListener("click", closeJokerPickers);
  jokerImagePicker && jokerImagePicker.addEventListener("click", function (e) { if (e.target === jokerImagePicker) closeJokerPickers(); });

  // ── Joker Charm Picker ───────────────────────────────────────────────────────
  function openJokerCharmPicker() {
    if (!jokerCharmPicker || !jokerCharmList) return;
    while (jokerCharmList.firstChild) jokerCharmList.removeChild(jokerCharmList.firstChild);
    if (jokerCharmStatus) jokerCharmStatus.textContent = 'Chargement…';
    jokerCharmPicker.removeAttribute("hidden");

    fetch("/lootbox/joker-picker?type=charm")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (jokerCharmStatus) jokerCharmStatus.textContent = '';
        if (!d.charms || !d.charms.length) {
          if (jokerCharmStatus) jokerCharmStatus.textContent = 'Aucun charme disponible.';
          return;
        }
        d.charms.forEach(function (charm) {
          var row = document.createElement("div");
          row.className = "lootbox-joker-charm-row" + (charm.owned ? " lootbox-joker-charm-row--owned" : "");
          var sym = document.createElement("span");
          sym.className = "lootbox-joker-charm-sym";
          sym.textContent = charm.symbol;
          var lbl = document.createElement("span");
          lbl.className = "lootbox-joker-charm-lbl";
          lbl.textContent = charm.label + (charm.owned ? ' — déjà possédé' : '');
          row.appendChild(sym);
          row.appendChild(lbl);
          if (!charm.owned) {
            row.addEventListener("click", function () {
              if (jokerCharmStatus) jokerCharmStatus.textContent = 'Déverrouillage…';
              fetch("/lootbox/use-joker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: 'charm', charmKey: charm.key }),
              })
                .then(function (r) { return r.json(); })
                .then(function (res) {
                  if (res.ok) {
                    if (jokerCharmStatus) jokerCharmStatus.textContent = '✓ Charme ' + charm.label + ' débloqué !';
                    setTimeout(function () { closeJokerPickers(); closeOverlay(); }, 1200);
                  } else {
                    if (jokerCharmStatus) jokerCharmStatus.textContent = res.error === 'already_owned' ? 'Déjà possédé.' : 'Erreur.';
                  }
                })
                .catch(function () { if (jokerCharmStatus) jokerCharmStatus.textContent = 'Erreur réseau.'; });
            });
          }
          jokerCharmList.appendChild(row);
        });
      })
      .catch(function () { if (jokerCharmStatus) jokerCharmStatus.textContent = 'Erreur réseau.'; });
  }

  jokerCharmClose && jokerCharmClose.addEventListener("click", closeJokerPickers);
  jokerCharmPicker && jokerCharmPicker.addEventListener("click", function (e) { if (e.target === jokerCharmPicker) closeJokerPickers(); });

  function closeJokerPickers() {
    if (jokerImagePicker) jokerImagePicker.setAttribute("hidden", "");
    if (jokerCharmPicker) jokerCharmPicker.setAttribute("hidden", "");
    _pendingJokerType = null;
  }

  // ── Tilt 3D sur la carte récompense ─────────────────────────────────────────
  if (card) {
    card.addEventListener("mousemove", function (e) {
      if (card.hasAttribute("hidden")) return;
      var rect = card.getBoundingClientRect();
      var dx = (e.clientX - rect.left - rect.width  / 2) / (rect.width  / 2);
      var dy = (e.clientY - rect.top  - rect.height / 2) / (rect.height / 2);
      card.style.transition = "none";
      card.style.transform = "perspective(700px) rotateY(" + (dx * 14) + "deg) rotateX(" + (-dy * 10) + "deg) scale(1.02)";
    });
    card.addEventListener("mouseleave", function () {
      card.style.transition = "transform .4s cubic-bezier(.22,1,.36,1)";
      card.style.transform  = "perspective(700px) rotateY(0deg) rotateX(0deg) scale(1)";
      setTimeout(function () { if (card) card.style.transition = ""; }, 420);
    });
  }

  // ── Ouverture de toutes les lootboxes ────────────────────────────────────────
  function startOpeningAll() {
    _opening = true;
    var total = _count;
    var results = [];
    hideAll();
    while (batchGrid.firstChild) batchGrid.removeChild(batchGrid.firstChild);
    if (batchPanel) batchPanel.removeAttribute("hidden");

    function openNext(remaining) {
      if (remaining <= 0) {
        setCount(0);
        results.forEach(function (r) { _sessionRewards.push(r); });
        renderBatchResults(results);
        if (closeBtn) closeBtn.removeAttribute("hidden");
        return;
      }
      fetch("/lootbox/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            if (data.isChoice) {
              // Les choice boxes en mode "tout ouvrir" sont ignorées (grille image uniquement)
            } else if (data.rewards) {
              // Tableau de 3 récompenses — on garde seulement les images pour la grille batch
              data.rewards.forEach(function (r) { results.push(r); });
            }
          }
          openNext(remaining - 1);
        })
        .catch(function () { openNext(remaining - 1); });
    }

    openNext(total);
  }

  function renderBatchResults(rewards) {
    while (batchGrid.firstChild) batchGrid.removeChild(batchGrid.firstChild);
    var RARITY_COLORS = { common: '#94a3b8', rare: '#60a5fa', epic: '#a78bfa', legendary: '#fbbf24', mythic: '#f87171' };
    var imageRewards = rewards.filter(function(r) { return r && r.imageId; });
    rewards.forEach(function (reward, i) {
      var rarity = reward.rarity || "common";
      var item = document.createElement("div");
      item.className = "lootbox-batch-card lootbox-batch-card--" + rarity;
      var imgDiv = document.createElement("div");
      imgDiv.className = "lootbox-batch-card-img";
      imgDiv.setAttribute("data-rarity", rarity);

      if (reward.isCoins) {
        // Carte pièces
        item.classList.add("lootbox-batch-card--coins");
        var coinWrap = document.createElement("div");
        coinWrap.className = "lootbox-coins-reward lootbox-coins-reward--small";
        coinWrap.style.setProperty('--coin-color', RARITY_COLORS[rarity] || '#94a3b8');
        coinWrap.innerHTML = '<svg viewBox="0 0 60 60" class="lootbox-coins-svg" aria-hidden="true">'
          + '<circle cx="30" cy="30" r="28" fill="hsl(44,95%,55%)" stroke="hsl(44,70%,35%)" stroke-width="2.5"/>'
          + '<text x="30" y="38" text-anchor="middle" font-size="22" font-weight="bold" fill="hsl(44,35%,20%)">P</text>'
          + '</svg>'
          + '<span class="lootbox-coins-amount" style="color:' + (RARITY_COLORS[rarity]||'#94a3b8') + '">' + (reward.coins || 0) + '</span>';
        imgDiv.appendChild(coinWrap);
      } else if (reward.imageId) {
        if (reward.thumb) {
          var img = document.createElement("img");
          img.src = reward.thumb; img.alt = ""; img.loading = "lazy";
          imgDiv.appendChild(img);
          imgDiv.style.cursor = "zoom-in";
          (function (imgIdx) {
            var idx = imageRewards.indexOf(reward);
            imgDiv.addEventListener("click", function () { if (idx >= 0) openZoom(imageRewards, idx); });
          }(i));
        }
      }

      item.appendChild(imgDiv);
      batchGrid.appendChild(item);
    });
  }

  // ── Fermeture ────────────────────────────────────────────────────────────────
  function closeOverlay() {
    overlay.setAttribute("hidden", "");
    closeZoom();
    closeJokerPickers();
    hideAll();
    _opening = false;
    refreshCount();
  }

  function hideAll() {
    [choicePanel, chest, card, batchPanel, pickChoicePanel, charmReveal, jokerReveal, themeReveal].forEach(function (el) {
      if (el) el.setAttribute("hidden", "");
    });
    if (closeBtn) closeBtn.setAttribute("hidden", "");
    if (nextBtn)  nextBtn.setAttribute("hidden", "");
    if (card) {
      card.classList.remove("lootbox-card--in");
      card.style.transform = "";
    }
  }

  closeBtn && closeBtn.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay || e.target.classList.contains("lootbox-overlay-backdrop")) closeOverlay();
  });

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  function openZoom(list, idx) {
    if (!zoomOverlay || !zoomImg) return;
    _zoomList = (list || []).filter(function(r) { return r && r.thumb; });
    _zoomIdx  = Math.min(Math.max(0, idx || 0), _zoomList.length - 1);
    renderZoom();
    zoomOverlay.removeAttribute("hidden");
  }

  function renderZoom() {
    var reward = _zoomList[_zoomIdx];
    if (!reward) return;
    zoomImg.src = reward.thumb || "";
    if (zoomImgOuter) zoomImgOuter.setAttribute("data-rarity", reward.rarity || "common");
    if (zoomCounter) {
      if (_zoomList.length > 1) {
        zoomCounter.textContent = (_zoomIdx + 1) + "\u00a0/\u00a0" + _zoomList.length;
        zoomCounter.removeAttribute("hidden");
      } else {
        zoomCounter.setAttribute("hidden", "");
      }
    }
    if (zoomPrev) { if (_zoomIdx > 0) zoomPrev.removeAttribute("hidden"); else zoomPrev.setAttribute("hidden", ""); }
    if (zoomNext) { if (_zoomIdx < _zoomList.length - 1) zoomNext.removeAttribute("hidden"); else zoomNext.setAttribute("hidden", ""); }
    if (zoomAvatarBtn) {
      var imageId = reward.imageId || reward.id || null;
      if (imageId && imageId === _avatarSetId) {
        zoomAvatarBtn.textContent = "Photo de profil définie \u2713";
        zoomAvatarBtn.setAttribute("disabled", "");
      } else {
        zoomAvatarBtn.textContent = "Utiliser comme photo de profil";
        zoomAvatarBtn.removeAttribute("disabled");
      }
    }
  }

  function closeZoom() {
    if (zoomOverlay) zoomOverlay.setAttribute("hidden", "");
    if (zoomImg) zoomImg.src = "";
    _zoomList = []; _zoomIdx = 0;
  }

  function zoomNavigate(delta) {
    var newIdx = _zoomIdx + delta;
    if (newIdx < 0 || newIdx >= _zoomList.length) return;
    _zoomIdx = newIdx;
    renderZoom();
  }

  zoomClose && zoomClose.addEventListener("click", function (e) { e.stopPropagation(); closeZoom(); });
  zoomPrev  && zoomPrev.addEventListener("click",  function (e) { e.stopPropagation(); zoomNavigate(-1); });
  zoomNext  && zoomNext.addEventListener("click",  function (e) { e.stopPropagation(); zoomNavigate(1); });
  zoomOverlay && zoomOverlay.addEventListener("click", function (e) { if (e.target === zoomOverlay) closeZoom(); });

  zoomAvatarBtn && zoomAvatarBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var reward = _zoomList[_zoomIdx];
    if (!reward) return;
    var imageId = reward.imageId || reward.id || null;
    if (!imageId) return;
    zoomAvatarBtn.disabled = true;
    fetch("/lootbox/set-profile-image", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId: imageId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) { _avatarSetId = imageId; zoomAvatarBtn.textContent = "Photo de profil définie \u2713"; zoomAvatarBtn.setAttribute("disabled", ""); }
        else       { zoomAvatarBtn.disabled = false; }
      })
      .catch(function () { zoomAvatarBtn.disabled = false; });
  });

  // ── Clavier global ───────────────────────────────────────────────────────────
  document.addEventListener("keydown", function (e) {
    if (jokerImagePicker && !jokerImagePicker.hasAttribute("hidden") && e.key === "Escape") { closeJokerPickers(); return; }
    if (jokerCharmPicker && !jokerCharmPicker.hasAttribute("hidden") && e.key === "Escape") { closeJokerPickers(); return; }
    if (zoomOverlay && !zoomOverlay.hasAttribute("hidden")) {
      if (e.key === "Escape")     { closeZoom(); return; }
      if (e.key === "ArrowLeft")  { zoomNavigate(-1); return; }
      if (e.key === "ArrowRight") { zoomNavigate(1);  return; }
      if (e.key === "Enter" && zoomAvatarBtn && !zoomAvatarBtn.disabled) { zoomAvatarBtn.click(); return; }
    }
    if (!overlay.hasAttribute("hidden") && e.key === "Escape") closeOverlay();
  });

  // ── Init ─────────────────────────────────────────────────────────────────────
  window._lbTrigger = onTrigger;
  refreshCount();
})();
