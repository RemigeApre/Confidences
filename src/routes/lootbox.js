const express = require("express");
const db = require("../db");
const { requireUser, requireUserJson, requireAdmin } = require("../auth");
const { thumbUrl } = require("../thumbs");

function buildLootboxRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  // ── API JSON ───────────────────────────────────────────────────────────────

  // Nombre de lootboxes non ouvertes de l'utilisateur courant
  router.get("/count", (req, res) => {
    const count = db.getLootboxCount(req.user.id);
    res.json({ count });
  });

  // Ouvre une lootbox et retourne la récompense
  router.post("/open", express.json(), (req, res) => {
    const reward = db.openLootbox(req.user.id);
    if (!reward) return res.json({ ok: false, error: "no_lootbox" });
    res.json({
      ok: true,
      reward: {
        imageId: reward.imageId,
        title: reward.title,
        rarity: reward.rarity,
        thumb: reward.thumb ? thumbUrl(reward.thumb) : null,
      },
    });
  });

  // Change la couleur de l'avatar
  router.post("/set-profile-color", express.json(), (req, res) => {
    const ok = db.setProfileColor(req.user.id, String(req.body.color || ""));
    res.json({ ok });
  });

  // Choisit une image débloquée comme photo de profil (imageId=null pour reset)
  router.post("/set-profile-image", express.json(), (req, res) => {
    const raw = req.body.imageId;
    const imageId = raw === null || raw === undefined ? null : parseInt(raw, 10);
    const ok = db.setProfileImageId(req.user.id, isNaN(imageId) ? null : imageId);
    res.json({ ok });
  });

  // Liste des récompenses débloquées de l'utilisateur courant
  router.get("/unlocks", (req, res) => {
    const unlocks = db.getUserUnlocks(req.user.id).map((u) => ({
      ...u,
      thumb: u.thumb ? thumbUrl(u.thumb) : null,
    }));
    res.json({ unlocks });
  });

  // Sauvegarde les filtres de contenu pour les lootboxes
  router.post("/settings", express.json(), (req, res) => {
    const allowUltra      = req.body.allowUltra      !== undefined ? !!req.body.allowUltra      : undefined;
    const allowIrrealiste = req.body.allowIrrealiste !== undefined ? !!req.body.allowIrrealiste : undefined;
    db.setLootboxFilters(req.user.id, { allowUltra, allowIrrealiste });
    res.json({ ok: true });
  });

  // ── Admin : attribuer des lootboxes ───────────────────────────────────────
  router.post("/admin/grant", requireAdmin, express.json(), (req, res) => {
    const targetUserId = parseInt(req.body.userId, 10);
    const count = parseInt(req.body.count, 10) || 1;
    if (!targetUserId) return res.json({ ok: false, error: "userId manquant" });
    db.grantLootbox(targetUserId, count);
    res.json({ ok: true, count });
  });

  return router;
}

module.exports = buildLootboxRouter;
