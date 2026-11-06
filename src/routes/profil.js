const express = require("express");
const {
  getUserByUsername,
  getUserById,
  getPublicProfile,
  getUserUnlocks,
  listFavoriteRows,
  getWikiPage,
  getGalleryImage,
} = require("../db");

module.exports = function buildProfilRouter(config) {
  const router = express.Router();

  // GET /profil/:username — public profile page (no auth required)
  router.get("/:username", async (req, res) => {
    try {
      const user = getUserByUsername(req.params.username);
      if (!user || user.accountStatus === "suspended") {
        return res.status(404).render("404", { config, currentUser: req.user || null });
      }

      const pub = getPublicProfile(user.id);

      // Avatar image
      let avatarThumb = null;
      let avatarCrop = null;
      if (user.profileImageId) {
        const img = getGalleryImage(user.profileImageId);
        if (img) avatarThumb = img.imagePaths[0] || null;
        avatarCrop = user.profileImageCrop || null;
      }

      // Featured images from coffre (validate ownership)
      const unlocks = getUserUnlocks(user.id);
      const unlockRefIds = new Set(unlocks.map(u => u.refId));
      const featuredImages = [];
      for (const id of pub.featuredImageIds) {
        if (!unlockRefIds.has(id)) continue;
        const img = getGalleryImage(id);
        if (img) featuredImages.push(img);
        if (featuredImages.length >= 5) break;
      }

      // Wiki favorites
      let wikiFavorites = [];
      if (pub.showWikiFavorites) {
        const favRows = listFavoriteRows(user.id).filter(r => r.item_type === "wiki");
        for (const row of favRows.slice(0, 12)) {
          const page = getWikiPage(row.item_id);
          if (page && !page.hidden) wikiFavorites.push(page);
        }
      }

      res.render("public-profile", {
        config,
        currentUser: req.user || null,
        profileUser: user,
        pub,
        avatarThumb,
        avatarCrop,
        featuredImages,
        wikiFavorites,
      });
    } catch (err) {
      console.error("[profil]", err);
      res.status(500).render("500", { config, currentUser: req.user || null });
    }
  });

  return router;
};
