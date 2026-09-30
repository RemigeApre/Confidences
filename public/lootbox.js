/* Lootbox widget — état, animation, ouverture, zoom, 3D tilt */
(function () {
  "use strict";

  // ── Éléments DOM ────────────────────────────────────────────────────────────
  var widget   = document.getElementById("lootbox-widget");
  var btn      = document.getElementById("lootbox-btn");
  var countEl  = document.getElementById("lootbox-count");
  var overlay  = document.getElementById("lootbox-overlay");

  // Écran de choix
  var choicePanel    = document.getElementById("lootbox-choice");
  var choiceMsg      = document.getElementById("lootbox-choice-msg");
  var choiceCountLbl = document.getElementById("lootbox-choice-count-label");
  var choiceOneBtn   = document.getElementById("lootbox-choice-one");
  var choiceAllBtn   = document.getElementById("lootbox-choice-all");
  var choiceCancelBtn = document.getElementById("lootbox-choice-cancel");

  // Ouverture normale
  var chest       = document.getElementById("lootbox-reveal-chest");
  var card        = document.getElementById("lootbox-reveal-card");
  var rarityEl    = document.getElementById("lootbox-reveal-rarity");
  var imgWrap     = document.getElementById("lootbox-reveal-img-wrap");
  var imgEl       = document.getElementById("lootbox-reveal-img");
  var placeholder = document.getElementById("lootbox-reveal-placeholder");
  var titleEl     = document.getElementById("lootbox-reveal-title");
  var hintEl      = document.getElementById("lootbox-reveal-hint");
  var closeBtn    = document.getElementById("lootbox-reveal-close");
  var nextBtn     = document.getElementById("lootbox-reveal-next");

  // Résultats batch
  var batchPanel  = document.getElementById("lootbox-batch-results");
  var batchTitle  = document.getElementById("lootbox-batch-title");
  var batchGrid   = document.getElementById("lootbox-batch-grid");

  // Zoom
  var zoomOverlay = document.getElementById("lootbox-zoom-overlay");
  var zoomImg     = document.getElementById("lootbox-zoom-img");

  // Bouton coffre de la page /jeu (optionnel)
  var jeuBtn   = document.getElementById("jeu-lootbox-btn");
  var jeuCount = document.getElementById("jeu-lootbox-count");
  var jeuLabel = document.getElementById("jeu-lootbox-label");

  if (!overlay) return;

  // ── État ────────────────────────────────────────────────────────────────────
  var _count   = 0;
  var _opening = false;  // empêche les doubles clics

  var RARITY_LABELS = {
    common:    "Commun",
    rare:      "Rare",
    epic:      "Épique",
    legendary: "Légendaire",
    mythic:    "Mythique",
  };

  // ── Compteur ────────────────────────────────────────────────────────────────
  function refreshCount() {
    fetch("/lootbox/count")
      .then(function (r) { return r.json(); })
      .then(function (d) { setCount(d.count || 0); })
      .catch(function () {});
  }

  function setCount(n) {
    _count = n;

    // Widget flottant
    if (widget && btn && countEl) {
      if (n > 0) {
        widget.removeAttribute("hidden");
        countEl.textContent = n > 99 ? "99+" : String(n);
        countEl.removeAttribute("hidden");
        btn.setAttribute("data-has-loot", "1");
      } else {
        widget.setAttribute("hidden", "");
        btn.removeAttribute("data-has-loot");
      }
    }

    // Coffre de la page /jeu
    if (jeuBtn) {
      if (n > 0) {
        jeuBtn.removeAttribute("disabled");
        jeuBtn.setAttribute("data-has-loot", "1");
        if (jeuCount) { jeuCount.textContent = n > 99 ? "99+" : String(n); jeuCount.removeAttribute("hidden"); }
        if (jeuLabel) jeuLabel.textContent = n === 1 ? "1 lootbox" : n + " lootboxes";
      } else {
        jeuBtn.setAttribute("disabled", "");
        jeuBtn.removeAttribute("data-has-loot");
        if (jeuCount) jeuCount.setAttribute("hidden", "");
        if (jeuLabel) jeuLabel.textContent = "Aucune lootbox";
      }
    }
  }

  // ── Déclencheurs ────────────────────────────────────────────────────────────
  function onTrigger() {
    if (_opening || _count <= 0) return;
    if (_count >= 2) {
      showChoice();
    } else {
      startOpeningOne();
    }
  }

  if (btn)    btn.addEventListener("click", onTrigger);
  if (jeuBtn) jeuBtn.addEventListener("click", onTrigger);

  // ── Écran de choix ──────────────────────────────────────────────────────────
  function showChoice() {
    _opening = true;
    overlay.removeAttribute("hidden");
    hideAll();
    choiceMsg.textContent = "Vous avez " + _count + " lootbox" + (_count > 1 ? "es" : "") + " !";
    if (choiceCountLbl) choiceCountLbl.textContent = _count;
    choicePanel.removeAttribute("hidden");
  }

  choiceOneBtn  && choiceOneBtn.addEventListener("click", function () {
    choicePanel.setAttribute("hidden", "");
    startOpeningOne();
  });

  choiceAllBtn  && choiceAllBtn.addEventListener("click", function () {
    choicePanel.setAttribute("hidden", "");
    startOpeningAll();
  });

  choiceCancelBtn && choiceCancelBtn.addEventListener("click", function () {
    closeOverlay();
  });

  // ── Ouverture une par une ───────────────────────────────────────────────────
  function startOpeningOne() {
    _opening = true;
    showChestAnimation(function (reward) {
      if (!reward) { closeOverlay(); return; }
      setCount(_count - 1);
      showRewardCard(reward, _count > 0);
    });
  }

  function showChestAnimation(cb) {
    hideAll();
    chest.removeAttribute("hidden");
    chest.classList.remove("lootbox-chest--opening", "lootbox-chest--done");

    fetch("/lootbox/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            chest.classList.add("lootbox-chest--opening");
          });
        });
        setTimeout(function () {
          chest.classList.add("lootbox-chest--done");
          chest.setAttribute("hidden", "");
          if (!data.ok || !data.reward) { cb(null); return; }
          cb(data.reward);
        }, 900);
      })
      .catch(function () { setTimeout(closeOverlay, 600); });
  }

  function showRewardCard(reward, hasNext) {
    var rarity = reward.rarity || "common";
    rarityEl.textContent = RARITY_LABELS[rarity] || rarity;
    rarityEl.className = "lootbox-reveal-rarity lootbox-reveal-rarity--" + rarity;
    titleEl.textContent = reward.title || "Image débloquée";

    if (reward.thumb) {
      imgEl.src = reward.thumb;
      imgEl.removeAttribute("hidden");
      placeholder.setAttribute("hidden", "");
    } else {
      imgEl.setAttribute("hidden", "");
      placeholder.removeAttribute("hidden");
    }

    if (reward.isDuplicate) {
      hintEl.textContent = "Déjà possédé — converti en pièces.";
    } else {
      hintEl.textContent = "Cette image est maintenant disponible comme photo de profil.";
    }

    card.removeAttribute("hidden");
    card.classList.remove("lootbox-card--in");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { card.classList.add("lootbox-card--in"); });
    });

    closeBtn.removeAttribute("hidden");
    if (hasNext) {
      nextBtn.removeAttribute("hidden");
    } else {
      nextBtn.setAttribute("hidden", "");
    }
  }

  nextBtn && nextBtn.addEventListener("click", function () {
    card.setAttribute("hidden", "");
    closeBtn.setAttribute("hidden", "");
    nextBtn.setAttribute("hidden", "");
    startOpeningOne();
  });

  // ── Ouverture de toutes les lootboxes ───────────────────────────────────────
  function startOpeningAll() {
    _opening = true;
    var total = _count;
    var results = [];
    hideAll();

    // Afficher un état "chargement" pendant les appels
    if (batchTitle) {
      batchTitle.textContent = "Ouverture en cours…";
    }
    batchGrid.innerHTML = "";
    batchPanel.removeAttribute("hidden");

    // Ouvrir séquentiellement (SQLite synchrone côté serveur → pas de race condition)
    function openNext(remaining) {
      if (remaining <= 0) {
        // Tout ouvert : afficher les résultats
        setCount(0);
        renderBatchResults(results);
        closeBtn.removeAttribute("hidden");
        return;
      }
      fetch("/lootbox/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok && data.reward) {
            results.push(data.reward);
          }
          openNext(remaining - 1);
        })
        .catch(function () { openNext(remaining - 1); });
    }

    openNext(total);
  }

  function renderBatchResults(rewards) {
    var dupes = rewards.filter(function (r) { return r.isDuplicate; }).length;
    batchTitle.textContent = rewards.length + " récompense" + (rewards.length > 1 ? "s" : "") + " obtenues"
      + (dupes > 0 ? " · " + dupes + " doublon" + (dupes > 1 ? "s" : "") + " → pièces" : "");

    while (batchGrid.firstChild) batchGrid.removeChild(batchGrid.firstChild);
    rewards.forEach(function (reward) {
      var rarity = reward.rarity || "common";
      var item = document.createElement("div");
      item.className = "lootbox-batch-card lootbox-batch-card--" + rarity
        + (reward.isDuplicate ? " lootbox-batch-card--dupe" : "");

      var imgDiv = document.createElement("div");
      imgDiv.className = "lootbox-batch-card-img";
      if (reward.thumb) {
        var img = document.createElement("img");
        img.src = reward.thumb;
        img.alt = reward.title || "";
        img.loading = "lazy";
        imgDiv.appendChild(img);
        // Clic pour zoom
        imgDiv.addEventListener("click", function () { openZoom(reward.thumb); });
        imgDiv.style.cursor = "zoom-in";
      }

      var badge = document.createElement("span");
      badge.className = "lootbox-batch-card-rarity lootbox-batch-card-rarity--" + rarity;
      badge.textContent = RARITY_LABELS[rarity] || rarity;
      imgDiv.appendChild(badge);

      if (reward.isDuplicate) {
        var dupeTag = document.createElement("span");
        dupeTag.className = "lootbox-batch-card-dupe-tag";
        dupeTag.textContent = "Doublon";
        imgDiv.appendChild(dupeTag);
      }

      var titleDiv = document.createElement("p");
      titleDiv.className = "lootbox-batch-card-title";
      titleDiv.textContent = reward.title || "Sans titre";

      item.appendChild(imgDiv);
      item.appendChild(titleDiv);
      batchGrid.appendChild(item);
    });
  }

  // ── Fermeture ────────────────────────────────────────────────────────────────
  function closeOverlay() {
    overlay.setAttribute("hidden", "");
    hideAll();
    _opening = false;
    // Rafraîchir si jamais le serveur avait plus de boîtes
    refreshCount();
  }

  function hideAll() {
    [choicePanel, chest, card, batchPanel].forEach(function (el) {
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

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (zoomOverlay && !zoomOverlay.hasAttribute("hidden")) {
        closeZoom();
      } else if (!overlay.hasAttribute("hidden")) {
        closeOverlay();
      }
    }
  });

  // ── 3D tilt sur la carte récompense ─────────────────────────────────────────
  if (card) {
    card.addEventListener("mousemove", function (e) {
      if (card.hasAttribute("hidden")) return;
      var rect = card.getBoundingClientRect();
      var cx = rect.left + rect.width  / 2;
      var cy = rect.top  + rect.height / 2;
      var dx = (e.clientX - cx) / (rect.width  / 2);  // -1 … 1
      var dy = (e.clientY - cy) / (rect.height / 2);  // -1 … 1
      card.style.transition = "none";
      card.style.transform = "perspective(700px) rotateY(" + (dx * 14) + "deg) rotateX(" + (-dy * 10) + "deg) scale(1.02)";
    });

    card.addEventListener("mouseleave", function () {
      card.style.transition = "transform .4s cubic-bezier(.22,1,.36,1)";
      card.style.transform  = "perspective(700px) rotateY(0deg) rotateX(0deg) scale(1)";
      setTimeout(function () { if (card) card.style.transition = ""; }, 420);
    });
  }

  // ── Zoom image ───────────────────────────────────────────────────────────────
  function openZoom(src) {
    if (!zoomOverlay || !zoomImg || !src) return;
    zoomImg.src = src;
    zoomOverlay.removeAttribute("hidden");
  }

  function closeZoom() {
    if (zoomOverlay) zoomOverlay.setAttribute("hidden", "");
    if (zoomImg) zoomImg.src = "";
  }

  // Clic sur l'image de la carte individuelle → zoom
  imgWrap && imgWrap.addEventListener("click", function () {
    if (imgEl && !imgEl.hasAttribute("hidden") && imgEl.src) openZoom(imgEl.src);
  });

  zoomOverlay && zoomOverlay.addEventListener("click", closeZoom);

  // ── Init ─────────────────────────────────────────────────────────────────────
  refreshCount();
})();
