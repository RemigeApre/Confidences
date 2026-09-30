/* Lootbox widget – état, animation, ouverture */
(function () {
  "use strict";

  var widget   = document.getElementById("lootbox-widget");
  var btn      = document.getElementById("lootbox-btn");
  var countEl  = document.getElementById("lootbox-count");
  var overlay  = document.getElementById("lootbox-overlay");
  var chest    = document.getElementById("lootbox-reveal-chest");
  var card     = document.getElementById("lootbox-reveal-card");
  var rarityEl = document.getElementById("lootbox-reveal-rarity");
  var imgEl    = document.getElementById("lootbox-reveal-img");
  var placeholder = document.getElementById("lootbox-reveal-placeholder");
  var titleEl  = document.getElementById("lootbox-reveal-title");
  var closeBtn = document.getElementById("lootbox-reveal-close");

  if (!widget || !btn) return;

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
      .then(function (data) {
        setCount(data.count || 0);
      })
      .catch(function () {});
  }

  function setCount(n) {
    _count = n;
    if (n > 0) {
      widget.removeAttribute("hidden");
      countEl.textContent = n > 99 ? "99+" : String(n);
      countEl.removeAttribute("hidden");
      btn.setAttribute("data-has-loot", "1");
    } else {
      // On masque complètement le widget si rien à ouvrir
      widget.setAttribute("hidden", "");
      btn.removeAttribute("data-has-loot");
    }
  }

  // ── Click sur le bouton ───────────────────────────────────────────────────
  btn.addEventListener("click", function () {
    if (_opening || _count <= 0) return;
    openLootbox();
  });

  function openLootbox() {
    _opening = true;
    // Afficher l'overlay
    overlay.removeAttribute("hidden");
    card.setAttribute("hidden", "");
    chest.removeAttribute("hidden");
    closeBtn.setAttribute("hidden", "");
    chest.classList.remove("lootbox-chest--opening", "lootbox-chest--done");

    // Animation d'ouverture du coffre (0.8s)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        chest.classList.add("lootbox-chest--opening");
      });
    });

    // Appel API pendant l'animation
    fetch("/lootbox/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.reward) {
          closeOverlay();
          return;
        }
        // Attendre la fin de l'animation du coffre (800ms)
        setTimeout(function () {
          showReward(data.reward);
        }, 900);
      })
      .catch(function () {
        setTimeout(closeOverlay, 600);
      });
  }

  function showReward(reward) {
    chest.classList.add("lootbox-chest--done");
    chest.setAttribute("hidden", "");

    // Renseigner la carte
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
      requestAnimationFrame(function () {
        card.classList.add("lootbox-card--in");
      });
    });
    closeBtn.removeAttribute("hidden");
    setCount(_count - 1);
  }

  function closeOverlay() {
    overlay.setAttribute("hidden", "");
    card.setAttribute("hidden", "");
    _opening = false;
  }

  // ── Fermeture ─────────────────────────────────────────────────────────────
  closeBtn.addEventListener("click", closeOverlay);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay || e.target.classList.contains("lootbox-overlay-backdrop")) {
      closeOverlay();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hasAttribute("hidden")) closeOverlay();
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  refreshCount();
})();
