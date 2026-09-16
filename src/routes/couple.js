const express = require("express");
const {
  getUserById,
  mergeUserReactions,
  listWikiPages,
  listGalleryImages,
  listBdBooks,
} = require("../db");
const { requireUser } = require("../auth");

const WIKI_CATEGORIES = [
  { key: "position",    label: "Positions",   hue: 270 },
  { key: "lieux",       label: "Lieux",       hue: 140 },
  { key: "partenaires", label: "Partenaires", hue: 210 },
  { key: "jeu_de_role", label: "Scénarios",   hue:  60 },
  { key: "tenues",      label: "Tenues",      hue: 175 },
  { key: "objets",      label: "Objets",      hue:  28 },
  { key: "pratique",    label: "Pratiques",   hue:   5 },
  { key: "fantasmes",   label: "Fantasmes",   hue: 330 },
  { key: "autre",       label: "Autre",       hue: 220 },
];

// Mode couple (lié par l'admin, voir /admin et src/db.js:setCouplePartners) :
// consultation en lecture seule du profil du/de la partenaire — notes
// Codex/Images/BD, j'adore/intéressé, à lire plus tard. Pas de paramètres,
// pas de journal.
function buildCoupleRouter(config) {
  const router = express.Router();

  router.use(requireUser);
  router.use((req, res, next) => {
    const partner = req.user.partnerId ? getUserById(req.user.partnerId) : null;
    if (!partner) return res.redirect("/favoris");
    req.partner = partner;
    next();
  });

  router.get("/", (req, res) => res.redirect("/couple/notes/wiki"));

  router.get("/notes/wiki", (req, res) => {
    const pages = mergeUserReactions(listWikiPages(), req.partner.id, "wiki")
      .filter((p) => p.rating > 0 || p.flame || p.interested);
    res.render("couple-notes-wiki", { config, partner: req.partner, pages, categories: WIKI_CATEGORIES });
  });

  router.get("/notes/images", (req, res) => {
    const items = mergeUserReactions(listGalleryImages(), req.partner.id, "gallery")
      .filter((img) => img.rating > 0 || img.flame || img.interested);
    res.render("couple-notes-images", { config, partner: req.partner, items });
  });

  router.get("/notes/bd", (req, res) => {
    const books = mergeUserReactions(listBdBooks(), req.partner.id, "bd")
      .filter((b) => b.rating > 0 || b.flame || b.interested);
    res.render("couple-notes-bd", { config, partner: req.partner, books });
  });

  router.get("/a-lire-plus-tard", (req, res) => {
    const pages = mergeUserReactions(listWikiPages(), req.partner.id, "wiki")
      .filter((p) => p.readLater);
    res.render("couple-a-lire-plus-tard", { config, partner: req.partner, pages, categories: WIKI_CATEGORIES });
  });

  return router;
}

module.exports = buildCoupleRouter;
