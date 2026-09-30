/* Lootbox widget – état, animation, ouverture */
(function () {
  "use strict";

  var widget   = document.getElementById("lootbox-widget");
  var btn      = document.getElementById("lootbox-btn");        // widget flottant (autres pages)
  var countEl  = document.getElementById("lootbox-count");
  var overlay  = document.getElementById("lootbox-overlay");
  var chest    = document.getElementById("lootbox-reveal-chest");
  var card     = document.getElementById("lootbox-reveal-card");
  var rarityEl = document.getElementById("lootbox-reveal-rarity");
  var imgEl    = document.getElementById("lootbox-reveal-img");
  var placeholder = document.getElementById("lootbox-reveal-placeholder");
  var titleEl  = document.getElementById("lootbox-reveal-title");
  var closeBtn = document.getElementById("lootbox-reveal-close");

  // Bouton coffre de la page /jeu (optionnel)
  var jeuBtn       = document.getElementById("jeu-lootbox-btn");
  var jeuCount     = document.getElementById("jeu-lootbox-count");
  var jeuLabel     = document.getElementById("jeu-lootbox-label");

  if (!overlay) return;

  var _count = 0;
  var _opening = false;

  var RARITY_LABELS = {
    common:    "Commun",
    rare:      "Rare",
    epic:      "Épique",
    legendary: "Légendaire",
    mythic:    "Mythique",
  };

  // ── Fetch count ───────────────────────────────────────────────────────────
  function refreshCount() {
    fetch("/lootbox/count")
      .then(function (r) { return r.json(); })
      .then(function (data) { setCount(data.count || 0); })
      .catch(function () {});
  }

  function setCount(n) {
    _count = n;

    // Widget flottant (toutes les pages)
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

  // ── Déclencheurs ─────────────────────────────────────────────────────────
  function onBtnClick() {
    if (_opening || _count <= 0) return;
    openLootbox();
  }

  if (btn)    btn.addEventListener("click", onBtnClick);
  if (jeuBtn) jeuBtn.addEventListener("click", onBtnClick);

  function openLootbox() {
    _opening = true;
    overlay.removeAttribute("hidden");
    card.setAttribute("hidden", "");
    chest.removeAttribute("hidden");
    closeBtn.setAttribute("hidden", "");
    chest.classList.remove("lootbox-chest--opening", "lootbox-chest--done");

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        chest.classList.add("lootbox-chest--opening");
      });
    });

    fetch("/lootbox/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.reward) { closeOverlay(); return; }
        setTimeout(function () { showReward(data.reward); }, 900);
      })
      .catch(function () { setTimeout(closeOverlay, 600); });
  }

  function showReward(reward) {
    chest.classList.add("lootbox-chest--done");
    chest.setAttribute("hidden", "");

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

    card.removeAttribute("hidden");
    card.classList.remove("lootbox-card--in");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { card.classList.add("lootbox-card--in"); });
    });
    closeBtn.removeAttribute("hidden");
    setCount(_count - 1);
  }

  function closeOverlay() {
    overlay.setAttribute("hidden", "");
    card.setAttribute("hidden", "");
    _opening = false;
  }

  closeBtn.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay || e.target.classList.contains("lootbox-overlay-backdrop")) closeOverlay();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hasAttribute("hidden")) closeOverlay();
  });

  refreshCount();
})();
