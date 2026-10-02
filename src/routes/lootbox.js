const express = require("express");
const db = require("../db");
const { requireUser, requireUserJson, requireAdmin } = require("../auth");
const { thumbUrl } = require("../thumbs");

function buildLootboxRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  // ── Comptage ───────────────────────────────────────────────────────────────
  router.get("/count", (req, res) => {
    const counts = db.getLootboxCountByType(req.user.id);
    res.json({ count: counts.total, byType: counts });
  });

  // ── Statut combiné (lootboxes + pièces) — pour polling léger ───────────────
  router.get("/status", (req, res) => {
    const counts = db.getLootboxCountByType(req.user.id);
    const user = db.getUserById(req.user.id);
    res.json({ lootboxCount: counts.total, coins: user ? (user.coins || 0) : 0 });
  });

  // ── Ouverture ──────────────────────────────────────────────────────────────
  router.post("/open", express.json(), (req, res) => {
    const result = db.openLootbox(req.user.id);
    if (!result) return res.json({ ok: false, error: "no_lootbox" });

    if (result.isChoice) {
      return res.json({
        ok: true, isChoice: true,
        sessionId: result.sessionId,
        options: result.options.map(o => ({
          imageId: o.imageId, title: o.title, rarity: o.rarity,
          thumb: o.thumb ? thumbUrl(o.thumb) : null,
        })),
      });
    }

    // Tableau de 3 récompenses — chaque élément peut être image, charm ou joker
    res.json({
      ok: true,
      isGift: !!result.isGift,
      rewards: result.rewards.map(r => {
        if (r.isJoker) return { isJoker: true, jokerType: r.jokerType, rarity: r.rarity, isDuplicate: !!r.isDuplicate };
        if (r.isCharm) return { isCharm: true, charmKey: r.charmKey || null, label: r.label || null, symbol: r.symbol || null, rarity: r.rarity || 'legendary', isDuplicate: !!r.isDuplicate, coins: r.coins || 0 };
        if (r.isCoins) return { isCoins: true, coins: r.coins || 0, rarity: r.rarity || 'common' };
        if (r.isTheme) return { isTheme: true, themeKey: r.themeKey || null, label: r.label || null, rarity: r.rarity || 'rare', isDuplicate: !!r.isDuplicate, coins: r.coins || 0 };
        return { imageId: r.imageId, title: r.title, rarity: r.rarity, thumb: r.thumb ? thumbUrl(r.thumb) : null, isDuplicate: false };
      }),
    });
  });

  // ── Sélection du choix — l'utilisateur choisit 3 parmi 9 ──────────────────
  router.post("/pick-choice", express.json(), (req, res) => {
    const sessionId = parseInt(req.body.sessionId, 10);
    const optionIdxs = req.body.optionIdxs;
    if (isNaN(sessionId) || !Array.isArray(optionIdxs) || optionIdxs.length !== 3) return res.json({ ok: false });
    const idxs = optionIdxs.map(i => parseInt(i, 10));
    if (idxs.some(isNaN)) return res.json({ ok: false });
    const rewards = db.pickChoiceReward(req.user.id, sessionId, idxs);
    if (!rewards) return res.json({ ok: false, error: "invalid_session" });
    res.json({
      ok: true,
      rewards: rewards.map(r => {
        if (r.isCoins) return { isCoins: true, coins: r.coins || 0, rarity: r.rarity || 'common' };
        return { imageId: r.imageId, title: r.title, rarity: r.rarity, thumb: r.thumb ? thumbUrl(r.thumb) : null, isDuplicate: false };
      }),
    });
  });

  // ── Charmes ────────────────────────────────────────────────────────────────
  router.get("/charms", (req, res) => {
    res.json({
      charms: db.getUserUnlockedCharms(req.user.id),
      activeCharm: req.user.ratingCharm || 'star',
    });
  });

  router.post("/set-charm", express.json(), (req, res) => {
    res.json(db.setUserCharm(req.user.id, String(req.body.charmKey || '')));
  });

  // ── Jokers : picker data ───────────────────────────────────────────────────
  router.get("/joker-picker", (req, res) => {
    const type = req.query.type;
    if (type === 'charm') {
      return res.json({ charms: db.getUserUnlockedCharms(req.user.id) });
    }
    if (type === 'image') {
      const images = db.listUnownedImages(req.user.id, 48).map(r => ({
        ...r, thumb: r.thumb ? thumbUrl(r.thumb) : null,
      }));
      return res.json({ images });
    }
    res.json({ ok: false });
  });

  // ── Jokers : utilisation ──────────────────────────────────────────────────
  router.post("/use-joker", express.json(), (req, res) => {
    const type = String(req.body.type || '');
    if (type === 'image') {
      const imageId = parseInt(req.body.imageId, 10);
      if (isNaN(imageId)) return res.json({ ok: false });
      const result = db.useJokerImage(req.user.id, imageId);
      if (!result.ok) return res.json(result);
      return res.json({ ...result, thumb: result.thumb ? thumbUrl(result.thumb) : null });
    }
    if (type === 'charm') {
      return res.json(db.useJokerCharm(req.user.id, String(req.body.charmKey || '')));
    }
    res.json({ ok: false, error: 'invalid_type' });
  });

  // ── Profil ─────────────────────────────────────────────────────────────────
  router.post("/set-profile-color", express.json(), (req, res) => {
    res.json({ ok: db.setProfileColor(req.user.id, String(req.body.color || "")) });
  });

  router.post("/set-profile-image", express.json(), (req, res) => {
    const raw = req.body.imageId;
    const imageId = raw === null || raw === undefined ? null : parseInt(raw, 10);
    res.json({ ok: db.setProfileImageId(req.user.id, isNaN(imageId) ? null : imageId) });
  });

  // ── Unlocks & boutique ────────────────────────────────────────────────────
  router.get("/unlocks", (req, res) => {
    res.json({
      unlocks: db.getUserUnlocks(req.user.id).map(u => ({ ...u, thumb: u.thumb ? thumbUrl(u.thumb) : null })),
    });
  });

  // ── Paramètres filtres ────────────────────────────────────────────────────
  router.post("/settings", express.json(), (req, res) => {
    const allowUltra      = req.body.allowUltra      !== undefined ? !!req.body.allowUltra      : undefined;
    const allowIrrealiste = req.body.allowIrrealiste !== undefined ? !!req.body.allowIrrealiste : undefined;
    db.setLootboxFilters(req.user.id, { allowUltra, allowIrrealiste });
    res.json({ ok: true });
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  router.post("/admin/grant", requireAdmin, express.json(), (req, res) => {
    const targetUserId = parseInt(req.body.userId, 10);
    const count    = parseInt(req.body.count,    10) || 1;
    const lootType = String(req.body.lootType || 'standard');
    if (!targetUserId) return res.json({ ok: false, error: "userId manquant" });
    db.grantLootbox(targetUserId, count, lootType);
    res.json({ ok: true, count, lootType });
  });

  return router;
}

module.exports = buildLootboxRouter;
