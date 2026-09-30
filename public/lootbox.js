/* Lootbox widget — état, animation, ouverture, zoom, navigation */
(function () {
  "use strict";

  // ── Éléments DOM ────────────────────────────────────────────────────────────
  var overlay  = document.getElementById("lootbox-overlay");
  // Badges nav (desktop + mobile)
  var navBadge       = document.getElementById("nav-jeu-badge");
  var navBadgeMobile = document.getElementById("nav-jeu-badge-mobile");

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
  var imgWrap     = document.getElementById("lootbox-reveal-img-wrap");
  var imgEl       = document.getElementById("lootbox-reveal-img");
  var placeholder = document.getElementById("lootbox-reveal-placeholder");
  var hintEl      = document.getElementById("lootbox-reveal-hint");
  var closeBtn    = document.getElementById("lootbox-reveal-close");
  var nextBtn     = document.getElementById("lootbox-reveal-next");

  // Résultats batch
  var batchPanel  = document.getElementById("lootbox-batch-results");
  var batchGrid   = document.getElementById("lootbox-batch-grid");

  // Zoom
  var zoomOverlay  = document.getElementById("lootbox-zoom-overlay");
  var zoomImg      = document.getElementById("lootbox-zoom-img");
  var zoomClose    = document.getElementById("lootbox-zoom-close");
  var zoomPrev     = document.getElementById("lootbox-zoom-prev");
  var zoomNext     = document.getElementById("lootbox-zoom-next");
  var zoomCounter  = document.getElementById("lootbox-zoom-counter");
  var zoomAvatarBtn = document.getElementById("lootbox-zoom-avatar-btn");
  var zoomImgOuter = document.getElementById("lootbox-zoom-img-outer");

  // Coffre page /jeu (optionnel)
  var jeuBtn   = document.getElementById("jeu-lootbox-btn");
  var jeuCount = document.getElementById("jeu-lootbox-count");
  var jeuLabel = document.getElementById("jeu-lootbox-label");

  if (!overlay) return;

  // ── État ─────────────────────────────────────────────────────────────────────
  var _count          = 0;
  var _opening        = false;
  var _sessionRewards = [];   // toutes les récompenses ouvertes depuis l'overlay
  var _zoomList       = [];   // liste courante dans le zoom (batch ou single)
  var _zoomIdx        = 0;    // position courante dans _zoomList
  var _avatarSetId    = null; // imageId déjà défini comme avatar cette session

  // ── Compteur ─────────────────────────────────────────────────────────────────
  function refreshCount() {
    fetch("/lootbox/count")
      .then(function (r) { return r.json(); })
      .then(function (d) { setCount(d.count || 0); })
      .catch(function () {});
  }

  function setCount(n) {
    _count = n;
    // Badge rouge sur le lien "Jeu" dans le header
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

  // ── Déclencheurs ─────────────────────────────────────────────────────────────
  function onTrigger() {
    if (_opening || _count <= 0) return;
    _sessionRewards = [];
    _avatarSetId = null;
    if (_count >= 2) {
      showChoice();
    } else {
      startOpeningOne();
    }
  }

  if (jeuBtn) jeuBtn.addEventListener("click", onTrigger);

  // ── Écran de choix ───────────────────────────────────────────────────────────
  function showChoice() {
    _opening = true;
    overlay.removeAttribute("hidden");
    hideAll();
    if (choiceMsg) choiceMsg.textContent = "Vous avez " + _count + " lootbox" + (_count > 1 ? "es" : "") + "\u00a0!";
    if (choiceCountLbl) choiceCountLbl.textContent = _count;
    choicePanel.removeAttribute("hidden");
  }

  choiceOneBtn    && choiceOneBtn.addEventListener("click", function () {
    choicePanel.setAttribute("hidden", "");
    startOpeningOne();
  });

  choiceAllBtn    && choiceAllBtn.addEventListener("click", function () {
    choicePanel.setAttribute("hidden", "");
    startOpeningAll();
  });

  choiceCancelBtn && choiceCancelBtn.addEventListener("click", closeOverlay);

  // ── Ouverture une par une ────────────────────────────────────────────────────
  function startOpeningOne() {
    _opening = true;
    overlay.removeAttribute("hidden");
    showChestAnimation(function (reward) {
      if (!reward) { closeOverlay(); return; }
      _sessionRewards.push(reward);
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
          requestAnimationFrame(function () { chest.classList.add("lootbox-chest--opening"); });
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

    // Halo rareté via data-rarity
    imgWrap.setAttribute("data-rarity", rarity);

    if (reward.thumb) {
      imgEl.src = reward.thumb;
      imgEl.alt = "";
      imgEl.removeAttribute("hidden");
      placeholder.setAttribute("hidden", "");
    } else {
      imgEl.setAttribute("hidden", "");
      placeholder.removeAttribute("hidden");
    }

    if (reward.isDuplicate) {
      hintEl.removeAttribute("hidden");
    } else {
      hintEl.setAttribute("hidden", "");
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

  // Clic sur la carte individuelle → zoom dans la session entière
  imgWrap && imgWrap.addEventListener("click", function () {
    if (imgEl && !imgEl.hasAttribute("hidden") && imgEl.src) {
      var idx = _sessionRewards.length - 1;
      openZoom(_sessionRewards, idx);
    }
  });

  // ── 3D tilt sur la carte récompense ─────────────────────────────────────────
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

    // Indicateur de chargement : grille vide visible
    while (batchGrid.firstChild) batchGrid.removeChild(batchGrid.firstChild);
    batchPanel.removeAttribute("hidden");

    function openNext(remaining) {
      if (remaining <= 0) {
        setCount(0);
        results.forEach(function (r) { _sessionRewards.push(r); });
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
          if (data.ok && data.reward) results.push(data.reward);
          openNext(remaining - 1);
        })
        .catch(function () { openNext(remaining - 1); });
    }

    openNext(total);
  }

  function renderBatchResults(rewards) {
    while (batchGrid.firstChild) batchGrid.removeChild(batchGrid.firstChild);

    rewards.forEach(function (reward, i) {
      var rarity = reward.rarity || "common";
      var item = document.createElement("div");
      item.className = "lootbox-batch-card lootbox-batch-card--" + rarity
        + (reward.isDuplicate ? " lootbox-batch-card--dupe" : "");

      var imgDiv = document.createElement("div");
      imgDiv.className = "lootbox-batch-card-img";
      imgDiv.setAttribute("data-rarity", rarity);

      if (reward.thumb) {
        var img = document.createElement("img");
        img.src = reward.thumb;
        img.alt = "";
        img.loading = "lazy";
        imgDiv.appendChild(img);
        imgDiv.style.cursor = "zoom-in";
        // Fermeture pour capturer l'index correct
        (function (idx) {
          imgDiv.addEventListener("click", function () {
            openZoom(rewards, idx);
          });
        }(i));
      }

      if (reward.isDuplicate) {
        var dupeTag = document.createElement("span");
        dupeTag.className = "lootbox-batch-card-dupe-tag";
        dupeTag.textContent = "Doublon";
        imgDiv.appendChild(dupeTag);
      }

      item.appendChild(imgDiv);
      batchGrid.appendChild(item);
    });
  }

  // ── Fermeture ────────────────────────────────────────────────────────────────
  function closeOverlay() {
    overlay.setAttribute("hidden", "");
    closeZoom();
    hideAll();
    _opening = false;
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

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  function openZoom(list, idx) {
    if (!zoomOverlay || !zoomImg) return;
    _zoomList = list || [];
    _zoomIdx  = idx  || 0;
    renderZoom();
    zoomOverlay.removeAttribute("hidden");
  }

  function renderZoom() {
    var reward = _zoomList[_zoomIdx];
    if (!reward) return;

    // Image
    zoomImg.src = reward.thumb || "";
    zoomImg.alt = "";

    // Halo rareté sur le conteneur
    if (zoomImgOuter) zoomImgOuter.setAttribute("data-rarity", reward.rarity || "common");

    // Compteur
    if (zoomCounter) {
      if (_zoomList.length > 1) {
        zoomCounter.textContent = (_zoomIdx + 1) + "\u00a0/\u00a0" + _zoomList.length;
        zoomCounter.removeAttribute("hidden");
      } else {
        zoomCounter.setAttribute("hidden", "");
      }
    }

    // Boutons nav
    if (zoomPrev) {
      if (_zoomIdx > 0) zoomPrev.removeAttribute("hidden");
      else zoomPrev.setAttribute("hidden", "");
    }
    if (zoomNext) {
      if (_zoomIdx < _zoomList.length - 1) zoomNext.removeAttribute("hidden");
      else zoomNext.setAttribute("hidden", "");
    }

    // Bouton avatar
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
    _zoomList = [];
    _zoomIdx  = 0;
  }

  function zoomNavigate(delta) {
    var newIdx = _zoomIdx + delta;
    if (newIdx < 0 || newIdx >= _zoomList.length) return;
    _zoomIdx = newIdx;
    renderZoom();
  }

  zoomClose && zoomClose.addEventListener("click", function (e) {
    e.stopPropagation();
    closeZoom();
  });

  zoomPrev && zoomPrev.addEventListener("click", function (e) {
    e.stopPropagation();
    zoomNavigate(-1);
  });

  zoomNext && zoomNext.addEventListener("click", function (e) {
    e.stopPropagation();
    zoomNavigate(1);
  });

  // Clic sur le fond de l'overlay ferme (mais pas sur les contrôles)
  zoomOverlay && zoomOverlay.addEventListener("click", function (e) {
    if (e.target === zoomOverlay) closeZoom();
  });

  // Bouton "utiliser comme avatar"
  zoomAvatarBtn && zoomAvatarBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var reward = _zoomList[_zoomIdx];
    if (!reward) return;
    var imageId = reward.imageId || reward.id || null;
    if (!imageId) return;
    zoomAvatarBtn.disabled = true;
    fetch("/lootbox/set-profile-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId: imageId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          _avatarSetId = imageId;
          zoomAvatarBtn.textContent = "Photo de profil définie \u2713";
          zoomAvatarBtn.setAttribute("disabled", "");
        } else {
          zoomAvatarBtn.disabled = false;
        }
      })
      .catch(function () { zoomAvatarBtn.disabled = false; });
  });

  // ── Clavier global ───────────────────────────────────────────────────────────
  document.addEventListener("keydown", function (e) {
    if (zoomOverlay && !zoomOverlay.hasAttribute("hidden")) {
      if (e.key === "Escape") {
        closeZoom();
      } else if (e.key === "ArrowLeft") {
        zoomNavigate(-1);
      } else if (e.key === "ArrowRight") {
        zoomNavigate(1);
      } else if (e.key === "Enter" && zoomAvatarBtn && !zoomAvatarBtn.disabled) {
        zoomAvatarBtn.click();
      }
      return;
    }
    if (!overlay.hasAttribute("hidden") && e.key === "Escape") {
      closeOverlay();
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────────
  refreshCount();
})();
