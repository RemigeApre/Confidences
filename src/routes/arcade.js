const express = require('express');
const { requireUserJson } = require('../auth');
const { getMemoryImages, getMemoryTags, grantLootbox, getLootboxCount, updateArcadeStats, getUserById } = require('../db');
const { thumbUrl } = require('../thumbs');

function buildArcadeRouter() {
  const router = express.Router();

  // GET /arcade/memory-images?count=8&tag=xxx
  router.get('/memory-images', requireUserJson, (req, res) => {
    const tag = req.query.tag || null;
    const count = Math.min(Math.max(parseInt(req.query.count) || 10, 4), 10);
    const images = getMemoryImages(req.user.id, { tag, count });
    res.json({
      ok: true,
      images: images.map(img => ({ ...img, thumb: thumbUrl(img.thumb) })),
    });
  });

  // GET /arcade/tags?min=8
  router.get('/tags', requireUserJson, (req, res) => {
    const min = Math.max(parseInt(req.query.min) || 8, 4);
    const tags = getMemoryTags(req.user.id, min);
    res.json({ ok: true, tags });
  });

  // POST /arcade/memory-complete  { level, won, score }
  router.post('/memory-complete', requireUserJson, express.json(), (req, res) => {
    const { level, won, score } = req.body;
    const lvl = Math.max(1, parseInt(level) || 0);
    const pts = Math.max(0, parseInt(score)  || 0);
    if (!won) return res.json({ ok: true, lootboxGranted: false });

    // Lire le meilleur niveau AVANT la mise à jour pour savoir si ce palier est nouveau
    const prevBest = (getUserById(req.user.id) || {}).arcadeMemoryBestLevel || 0;
    updateArcadeStats(req.user.id, lvl, pts);

    // Lootbox uniquement si palier multiple de 5 ET jamais atteint auparavant
    if (lvl % 5 === 0 && lvl > prevBest) {
      grantLootbox(req.user.id, 1, 'standard');
      const newCount = getLootboxCount(req.user.id);
      return res.json({ ok: true, lootboxGranted: true, newCount });
    }
    res.json({ ok: true, lootboxGranted: false });
  });

  return router;
}

module.exports = buildArcadeRouter;
