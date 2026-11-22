const express = require("express");
const {
  getUserById,
  mergeUserReactions,
  listWikiPages,
  listGalleryImages,
  listBdBooks,
  getUserWikiStatusList,
} = require("../db");
const { requireUser } = require("../auth");
const { filterOff } = require("../specialContent");

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

// Mode couple (lié par l'admin, voir /admin et src/db.js:setCouplePartners).
// Lecture seule du profil partenaire par catégorie codex + médias (images/BD).
function buildCoupleRouter(config) {
  const router = express.Router();

  router.use(requireUser);
  router.use((req, res, next) => {
    if (!req.user.partnerId) return res.redirect("/favoris");
    const partner = getUserById(req.user.partnerId);
    // Vérification bidirectionnelle : lien doit être mutuel.
    if (!partner || partner.partnerId !== req.user.id) return res.redirect("/favoris");
    req.partner = {
      id:               partner.id,
      displayName:      partner.displayName,
      profileColor:     partner.profileColor,
      profileImageId:   partner.profileImageId,
      profileImageCrop: partner.profileImageCrop,
      sexe:             partner.sexe,
    };
    next();
  });

  function selfObject(user) {
    return {
      id: user.id, displayName: user.displayName, profileColor: user.profileColor,
      profileImageId: user.profileImageId, profileImageCrop: user.profileImageCrop, sexe: user.sexe,
    };
  }

  // ── Données accueil : compteurs par catégorie + médias + strip J'adore ──
  function buildAccueilData(userId, viewer) {
    const statusList = getUserWikiStatusList(userId);
    const statusObjIds = new Set(statusList.map((s) => s.wikiId));

    const allWiki = filterOff(mergeUserReactions(listWikiPages(), userId, "wiki"), viewer);
    const reactedWiki = allWiki.filter((p) =>
      !p.hidden && (p.rating > 0 || p.flame || p.interested || p.practiced || statusObjIds.has(p.id))
    );

    const catCounts = {};
    WIKI_CATEGORIES.forEach((c) => {
      const cat = reactedWiki.filter((p) => p.category === c.key);
      catCounts[c.key] = { total: cat.length, flame: cat.filter((p) => p.flame).length };
    });

    const imgAll = filterOff(mergeUserReactions(listGalleryImages(), userId, "gallery"), viewer)
      .filter((i) => !i.hidden && (i.rating > 0 || i.flame || i.interested));
    const bdAll = filterOff(mergeUserReactions(listBdBooks(), userId, "bd"), viewer)
      .filter((b) => !b.hidden && (b.rating > 0 || b.flame || b.interested));

    const flameWiki = reactedWiki.filter((p) => p.flame).slice(0, 12);

    return { catCounts, medias: { images: imgAll.length, bd: bdAll.length }, flameWiki };
  }

  // ── Données page catégorie ──
  function buildCategorySection(userId, viewerId, categoryKey) {
    const viewer = getUserById(viewerId);
    const statusList = getUserWikiStatusList(userId);
    const statusObjIds = new Set(statusList.map((s) => s.wikiId));

    const allPages = filterOff(mergeUserReactions(listWikiPages(), userId, "wiki"), viewer);
    const pages = allPages.filter((p) =>
      !p.hidden && p.category === categoryKey &&
      (p.rating > 0 || p.flame || p.interested || p.practiced || statusObjIds.has(p.id))
    );

    if (categoryKey === "objets") {
      const pageMap = new Map(pages.map((p) => [p.id, p]));
      const objPossede = statusList.filter((s) => s.status === "posséde" && s.category === "objets")
        .map((s) => pageMap.get(s.wikiId)).filter(Boolean);
      const objSouhaite = statusList.filter((s) => s.status === "souhaite" && s.category === "objets")
        .map((s) => pageMap.get(s.wikiId)).filter(Boolean);
      const shown = new Set([...objPossede, ...objSouhaite].map((p) => p.id));
      const interested = pages.filter((p) => p.interested && !shown.has(p.id));
      interested.forEach((p) => shown.add(p.id));
      const flame = pages.filter((p) => p.flame && !shown.has(p.id));
      flame.forEach((p) => shown.add(p.id));
      const rated = pages.filter((p) => p.rating > 0 && !shown.has(p.id));
      return { isObjets: true, objPossede, objSouhaite, interested, flame, practiced: [], rated };
    }

    const shown = new Set();
    const interested = pages.filter((p) => p.interested);
    interested.forEach((p) => shown.add(p.id));
    const flame = pages.filter((p) => p.flame && !shown.has(p.id));
    flame.forEach((p) => shown.add(p.id));
    const practiced = pages.filter((p) => p.practiced && !shown.has(p.id));
    practiced.forEach((p) => shown.add(p.id));
    const rated = pages.filter((p) => p.rating > 0 && !shown.has(p.id));
    return { isObjets: false, objPossede: [], objSouhaite: [], interested, flame, practiced, rated };
  }

  // ── Données médias ──
  function buildMediasData(userId, viewer) {
    const items = filterOff(mergeUserReactions(listGalleryImages(), userId, "gallery"), viewer)
      .filter((i) => !i.hidden && (i.rating > 0 || i.flame || i.interested));
    const books = filterOff(mergeUserReactions(listBdBooks(), userId, "bd"), viewer)
      .filter((b) => !b.hidden && (b.rating > 0 || b.flame || b.interested));
    return { items, books };
  }

  // ── Routes partenaire ──
  router.get("/", (req, res) => {
    const data = buildAccueilData(req.partner.id, req.user);
    res.render("couple-accueil", { config, partner: req.partner, categories: WIKI_CATEGORIES, ...data });
  });

  router.get("/notes/:category", (req, res) => {
    const cat = WIKI_CATEGORIES.find((c) => c.key === req.params.category);
    if (!cat) return res.redirect("/couple");
    const sections = buildCategorySection(req.partner.id, req.user.id, cat.key);
    res.render("couple-notes-category", { config, partner: req.partner, categories: WIKI_CATEGORIES, category: cat, ...sections });
  });

  router.get("/medias", (req, res) => {
    const { items, books } = buildMediasData(req.partner.id, req.user);
    res.render("couple-medias", { config, partner: req.partner, items, books });
  });

  // ── Routes mon profil ──
  router.get("/mon-profil", (req, res) => {
    const self = selfObject(req.user);
    const data = buildAccueilData(req.user.id, req.user);
    res.render("couple-accueil", { config, partner: self, categories: WIKI_CATEGORIES, selfView: true, ...data });
  });

  router.get("/mon-profil/notes/:category", (req, res) => {
    const cat = WIKI_CATEGORIES.find((c) => c.key === req.params.category);
    if (!cat) return res.redirect("/couple/mon-profil");
    const self = selfObject(req.user);
    const sections = buildCategorySection(req.user.id, req.user.id, cat.key);
    res.render("couple-notes-category", { config, partner: self, categories: WIKI_CATEGORIES, category: cat, selfView: true, ...sections });
  });

  router.get("/mon-profil/medias", (req, res) => {
    const self = selfObject(req.user);
    const { items, books } = buildMediasData(req.user.id, req.user);
    res.render("couple-medias", { config, partner: self, items, books, selfView: true });
  });

  return router;
}

module.exports = buildCoupleRouter;
