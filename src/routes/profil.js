const express = require("express");
const { requireUserJson } = require("../auth");
const {
  getUserByUsername,
  getPublicProfile,
  getUserUnlocks,
  listFavoriteRows,
  getWikiPage,
  getGalleryImage,
  listProfilQuizAttempts,
  getProfilQuizType,
  getProfilQuizArchetypes,
  THEME_DEFINITIONS,
  getUserCoffreStats,
  getUserStreak,
  getUserWikiStatusList,
  getTopRatedWikiItems,
  toggleProfileLike,
  countProfileLikes,
  hasProfileLike,
} = require("../db");

const WORLD_META = {
  DL: { name: 'Eau',   tagline: 'Douceur et lien',        hue: 210 },
  DP: { name: 'Air',   tagline: 'Douceur et sensation',   hue: 160 },
  BL: { name: 'Terre', tagline: 'Intensité et lien',      hue: 35  },
  BP: { name: 'Feu',   tagline: 'Intensité et sensation', hue: 15  },
};

module.exports = function buildProfilRouter(config) {
  const router = express.Router();

  // GET /profil/:username — public profile page (no auth required)
  router.get("/:username", (req, res) => {
    try {
      const user = getUserByUsername(req.params.username);
      if (!user || user.accountStatus === "suspended") {
        return res.status(404).end();
      }

      const pub = getPublicProfile(user.id);

      // Avatar
      let avatarThumb = null;
      let avatarCrop = null;
      if (user.profileImageId) {
        const img = getGalleryImage(user.profileImageId);
        if (img) avatarThumb = img.imagePaths[0] || null;
        avatarCrop = user.profileImageCrop || null;
      }

      // Featured images (validate ownership)
      const unlocks = getUserUnlocks(user.id);
      const unlockRefIds = new Set(unlocks.map(u => u.refId));
      const featuredImages = [];
      for (const id of pub.featuredImageIds) {
        if (!unlockRefIds.has(id)) continue;
        const img = getGalleryImage(id);
        if (img) featuredImages.push(img);
        if (featuredImages.length >= 5) break;
      }

      // Wiki favorites — toujours affichés
      const _allWikiFavs = listFavoriteRows(user.id).filter(r => r.item_type === "wiki");
      const wikiFavTotal = _allWikiFavs.length;
      const wikiFavorites = [];
      for (const row of _allWikiFavs.slice(0, 12)) {
        const page = getWikiPage(row.item_id);
        if (page && !page.hidden) wikiFavorites.push(page);
      }

      // Notes 4 et 5 (option)
      const topRatedWiki = pub.showTopRatings ? getTopRatedWikiItems(user.id) : [];

      // Coffre stats + streak
      const coffreStats = getUserCoffreStats(user.id);
      const streak = getUserStreak(user.id);
      const wikiStatusItems = pub.showWikiStatus ? getUserWikiStatusList(user.id) : [];

      // Theme color
      const themeDef = THEME_DEFINITIONS.find(t => t.key === (user.activeTheme || 'default')) || THEME_DEFINITIONS[0];

      // Profil quiz archetype (latest completed attempt)
      let quizResult = null;
      try {
        const quizType = getProfilQuizType('principal');
        if (quizType) {
          const attempts = listProfilQuizAttempts(quizType.id, user.id);
          const done = attempts.find(a => a.completed);
          if (done) {
            const archetypes = getProfilQuizArchetypes(quizType.id);
            const archetype = archetypes.find(a => a.code === done.result_code) || null;
            const worldKey = (done.result_code || '').slice(0, 2);
            quizResult = {
              code: done.result_code,
              position: done.result_position,
              archetypeName: done.result_archetype || (archetype && archetype.name) || done.result_code,
              archetypeDesc: archetype ? archetype.description : '',
              world: (WORLD_META[worldKey] && WORLD_META[worldKey].name) || '',
              worldHue: (WORLD_META[worldKey] && WORLD_META[worldKey].hue) || 220,
              worldTagline: (WORLD_META[worldKey] && WORLD_META[worldKey].tagline) || '',
            };
          }
        }
      } catch (_) {}

      const likeCount = countProfileLikes(user.id);
      const isLiked = req.user ? hasProfileLike(req.user.id, user.id) : false;

      res.render("public-profile", {
        config,
        currentUser: req.user || null,
        profileUser: user,
        pub,
        avatarThumb,
        avatarCrop,
        featuredImages,
        wikiFavorites,
        wikiFavTotal,
        topRatedWiki,
        coffreStats,
        streak,
        wikiStatusItems,
        themeDef,
        quizResult,
        likeCount,
        isLiked,
      });
    } catch (err) {
      console.error("[profil]", err);
      res.status(500).end();
    }
  });

  // POST /profil/:username/like — toggle heart (JSON, auth required)
  router.post("/:username/like", requireUserJson, (req, res) => {
    try {
      const user = getUserByUsername(req.params.username);
      if (!user) return res.status(404).json({ error: 'not found' });
      if (user.id === req.user.id) return res.status(400).json({ error: 'cannot like yourself' });
      const liked = toggleProfileLike(req.user.id, user.id);
      const count = countProfileLikes(user.id);
      res.json({ liked, count });
    } catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
