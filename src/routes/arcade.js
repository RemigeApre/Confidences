const express = require('express');
const { requireUserJson } = require('../auth');
const { getMemoryImages, getMemoryTags, grantLootbox, getLootboxCount } = require('../db');
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

  // POST /arcade/memory-complete  { level, won }
  router.post('/memory-complete', requireUserJson, (req, res) => {
    const { level, won } = req.body;
    if (!won) return res.json({ ok: true, lootboxGranted: false });
    const lvl = Math.max(1, parseInt(level) || 0);
    if (lvl % 5 === 0) {
      grantLootbox(req.user.id, 1, 'standard');
      const newCount = getLootboxCount(req.user.id);
      return res.json({ ok: true, lootboxGranted: true, newCount });
    }
    res.json({ ok: true, lootboxGranted: false });
  });

  return router;
}

module.exports = buildArcadeRouter;
