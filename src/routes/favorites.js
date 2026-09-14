const express = require("express");
const {
  listFavoriteRows,
  addFavorite,
  removeFavorite,
  getWikiPage,
  getGalleryImage,
  getBdBook,
  listGalleryImages,
  listWikiPages,
  listBdBooks,
  mergeUserReactions,
  updateUserSettings,
} = require("../db");
const { requireUser, requireUserJson } = require("../auth");

// Copie minimale des categories du wiki (memes cles/teintes que
// src/routes/wiki.js) : necessaire pour reutiliser partials/wiki-card.ejs
// dans "Mes favoris" sans dupliquer tout le fichier wiki.js.
const WIKI_CATEGORIES = [
  { key: "fantasmes",   label: "Fantasmes",   hue: 330 },
  { key: "jeu_de_role",  label: "Jeu de rôle", hue:  60 },
  { key: "partenaires", label: "Partenaires", hue: 210 },
  { key: "pratique",    label: "Pratique",    hue:   5 },
  { key: "position",    label: "Position",    hue: 270 },
  { key: "lieux",       label: "Lieux",       hue: 140 },
  { key: "objets",      label: "Objets",      hue:  28 },
  { key: "tenues",      label: "Tenues",      hue: 175 },
  { key: "autre",       label: "Autre",       hue: 220 },
];

const VALID_TYPES = ["wiki", "gallery", "bd"];

function buildFavoritesRouter(config) {
  const router = express.Router();

  router.get("/", requireUser, (req, res) => {
    const rows = listFavoriteRows(req.user.id);
    const wikiPages = [];
    const galleryImages = [];
    const bdBooks = [];
    rows.forEach((row) => {
      if (row.item_type === "wiki") {
        const page = getWikiPage(row.item_id);
        if (page) wikiPages.push(page);
      } else if (row.item_type === "gallery") {
        const img = getGalleryImage(row.item_id);
        if (img) galleryImages.push(img);
      } else if (row.item_type === "bd") {
        const book = getBdBook(row.item_id);
        if (book) bdBooks.push(book);
      }
    });
    // "Mes fantasmes" (Goûts) : sous-ensemble des favoris wiki appartenant
    // à la catégorie (ou catégorie secondaire) "fantasmes". Ajouter/retirer
    // se fait via les mêmes boutons J'adore/favori déjà existants sur une
    // page wiki — pas de mécanisme séparé.
    const fantasyPages = wikiPages.filter((p) =>
      p.category === "fantasmes" || (p.extraCategories || []).includes("fantasmes")
    );
    res.render("favoris", { config, wikiPages, galleryImages, bdBooks, fantasyPages, categories: WIKI_CATEGORIES });
  });

  router.post("/parametres", requireUserJson, (req, res) => {
    const { orientation, ultraMode, irrealisteMode } = req.body;
    updateUserSettings(req.user.id, { orientation, ultraMode, irrealisteMode });
    res.json({ ok: true });
  });

  router.get("/notes/images", requireUser, (req, res) => {
    const all = mergeUserReactions(listGalleryImages(), req.user.id, "gallery")
      .filter((img) => img.rating > 0 || img.flame);
    const tagSet = new Set();
    all.forEach((img) => (img.tags || []).forEach((t) => tagSet.add(t)));
    const allTags = [...tagSet].sort();
    res.render("profil-notes-images", { config, items: all, allTags });
  });

  router.get("/notes/wiki", requireUser, (req, res) => {
    const all = mergeUserReactions(listWikiPages(), req.user.id, "wiki")
      .filter((p) => p.rating > 0 || p.flame);
    const tagSet = new Set();
    all.forEach((p) => (p.tags || []).forEach((t) => tagSet.add(t)));
    const allTags = [...tagSet].sort();
    res.render("profil-notes-wiki", { config, pages: all, allTags, categories: WIKI_CATEGORIES });
  });

  router.get("/notes/bd", requireUser, (req, res) => {
    const all = listBdBooks().filter((b) => b.rating > 0 || b.flame);
    const tagSet = new Set();
    all.forEach((b) => (b.tags || []).forEach((t) => tagSet.add(t)));
    const allTags = [...tagSet].sort();
    res.render("profil-notes-bd", { config, books: all, allTags });
  });

  router.post("/toggle", requireUserJson, (req, res) => {
    const itemType = String(req.body.itemType || "");
    const itemId = Number(req.body.itemId);
    if (!VALID_TYPES.includes(itemType) || !Number.isInteger(itemId)) {
      return res.status(400).json({ ok: false });
    }
    const rows = listFavoriteRows(req.user.id);
    const already = rows.some((r) => r.item_type === itemType && r.item_id === itemId);
    if (already) {
      removeFavorite(req.user.id, itemType, itemId);
    } else {
      addFavorite(req.user.id, itemType, itemId);
    }
    res.json({ ok: true, active: !already });
  });

  return router;
}

module.exports = buildFavoritesRouter;
