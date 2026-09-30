const express = require('express');
const { requireUserJson } = require('../auth');
const {
  getMemoryImages, getMemoryTags, grantLootbox, getLootboxCount,
  updateArcadeStats, getUserById,
  listCharms, adjustCoins, grantCharmDirect,
  getLootboxConfig, RARITY_BUY_PRICE,
} = require('../db');
const { thumbUrl } = require('../thumbs');

const CHARM_SLOTS_COST = 4;
const WIN_PROB = 0.05; // 5 %

function buildArcadeRouter() {
  const router = express.Router();

  // ── Memory ────────────────────────────────────────────────────────────────

  router.get('/memory-images', requireUserJson, (req, res) => {
    const tag = req.query.tag || null;
    const count = Math.min(Math.max(parseInt(req.query.count) || 10, 4), 10);
    const images = getMemoryImages(req.user.id, { tag, count });
    res.json({ ok: true, images: images.map(img => ({ ...img, thumb: thumbUrl(img.thumb) })) });
  });

  router.get('/tags', requireUserJson, (req, res) => {
    const min = Math.max(parseInt(req.query.min) || 8, 4);
    res.json({ ok: true, tags: getMemoryTags(req.user.id, min) });
  });

  router.post('/memory-complete', requireUserJson, express.json(), (req, res) => {
    const { level, won, score } = req.body;
    const lvl = Math.max(1, parseInt(level) || 0);
    const pts = Math.max(0, parseInt(score)  || 0);
    if (!won) return res.json({ ok: true, lootboxGranted: false });

    const prevBest = (getUserById(req.user.id) || {}).arcadeMemoryBestLevel || 0;
    updateArcadeStats(req.user.id, lvl, pts);

    if (lvl % 5 === 0 && lvl > prevBest) {
      grantLootbox(req.user.id, 1, 'standard');
      const newCount = getLootboxCount(req.user.id);
      return res.json({ ok: true, lootboxGranted: true, newCount });
    }
    res.json({ ok: true, lootboxGranted: false });
  });

  // ── Machine à charmes ─────────────────────────────────────────────────────

  // GET /arcade/charm-slots/info — liste des charmes disponibles pour l'animation
  router.get('/charm-slots/info', requireUserJson, (req, res) => {
    const charms = listCharms().map(c => ({ id: c.id, symbol: c.symbol, label: c.label, rarity: c.rarity }));
    res.json({ ok: true, charms });
  });

  // POST /arcade/charm-slots — jouer
  router.post('/charm-slots', requireUserJson, express.json(), (req, res) => {
    const user = getUserById(req.user.id);
    if (!user || user.coins < CHARM_SLOTS_COST) {
      return res.json({ ok: false, error: 'not_enough_coins' });
    }

    const charms = listCharms();
    if (!charms.length) return res.json({ ok: false, error: 'no_charms' });

    // Déduire le coût
    adjustCoins(req.user.id, -CHARM_SLOTS_COST);

    // Tirer le résultat
    const win = Math.random() < WIN_PROB;
    const pick = () => charms[Math.floor(Math.random() * charms.length)];

    let symbols;
    let wonCharm = null;
    if (win) {
      wonCharm = pick();
      symbols = [wonCharm, wonCharm, wonCharm];
    } else {
      symbols = [pick(), pick(), pick()];
      // Garantir qu'ils ne sont pas tous les trois identiques
      while (symbols[0].id === symbols[1].id && symbols[1].id === symbols[2].id) {
        symbols[2] = pick();
      }
    }

    // Récompense si victoire
    let reward = null;
    if (win) {
      const granted = grantCharmDirect(req.user.id, wonCharm.id);
      if (granted.alreadyOwned) {
        const cfg = getLootboxConfig();
        const buyPrice = (cfg.buyPrices || {})[wonCharm.rarity] || RARITY_BUY_PRICE[wonCharm.rarity] || 10;
        const coins = Math.ceil(buyPrice * 0.25);
        adjustCoins(req.user.id, coins);
        reward = { type: 'coins', coins, charm: wonCharm };
      } else {
        reward = { type: 'charm', charm: wonCharm };
      }
    }

    const newCoins = (getUserById(req.user.id) || {}).coins || 0;
    res.json({
      ok: true,
      symbols: symbols.map(c => ({ id: c.id, symbol: c.symbol, label: c.label, rarity: c.rarity })),
      win,
      reward,
      newCoins,
    });
  });

  return router;
}

module.exports = buildArcadeRouter;
