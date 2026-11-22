const express = require("express");
const {
  getUserById,
  mergeUserReactions,
  listWikiPages,
  listGalleryImages,
  listBdBooks,
  getUserWikiStatusList,
  getGalleryImage,
  getAccueilBlocks,
  setAccueilBlocks,
} = require("../db");
const { requireUser } = require("../auth");
const { filterOff } = require("../specialContent");
const { thumbUrl } = require("../thumbs");

const WIKI_CATEGORIES = [
  { key: "objets",      label: "Objets",      hue:  28 },
  { key: "tenues",      label: "Tenues",      hue: 175 },
  { key: "position",    label: "Positions",   hue: 270 },
  { key: "lieux",       label: "Lieux",       hue: 140 },
  { key: "jeu_de_role", label: "Scénarios",   hue:  60 },
  { key: "pratique",    label: "Pratiques",   hue:   5 },
  { key: "partenaires", label: "Partenaires", hue: 210 },
  { key: "fantasmes",   label: "Fantasmes",   hue: 330 },
  { key: "autre",       label: "Autre",       hue: 220 },
];

// Blocs disponibles pour l'accueil configurable
const BLOCK_DEFS = [
  { type: "flame",        label: "J'adore" },
  { type: "interested",   label: "Intéressé(e)" },
  { type: "practiced",    label: "Déjà pratiqué" },
  { type: "rated",        label: "Notes" },
  { type: "objets_wish",  label: "Liste de souhaits" },
  { type: "objets_have",  label: "Je possède" },
];
const VALID_BLOCK_TYPES = new Set(BLOCK_DEFS.map((b) => b.type));
const DEFAULT_BLOCKS = ["flame"];

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
    // Expose via res.locals pour que les partials y accèdent sans passer explicitement
    res.locals.couplePartner = req.partner;
    // Vignette avatar du partenaire (même logique que server.js pour l'utilisateur courant)
    if (req.partner.profileImageId) {
      const img = getGalleryImage(req.partner.profileImageId);
      if (img) {
        const firstPath = (img.imagePaths && img.imagePaths[0]) || img.filename || null;
        res.locals.couplePartnerAvatarThumb = firstPath ? thumbUrl(firstPath) : null;
        res.locals.couplePartnerImageCrop   = req.partner.profileImageCrop || null;
      }
    }
    next();
  });

  function selfObject(user) {
    return {
      id: user.id, displayName: user.displayName, profileColor: user.profileColor,
      profileImageId: user.profileImageId, profileImageCrop: user.profileImageCrop, sexe: user.sexe,
    };
  }

  // ── Construit les blocs d'accueil selon la config utilisateur ──
  function buildBlocks(configTypes, reactedWiki, statusList) {
    const pageMap = new Map(reactedWiki.map((p) => [p.id, p]));
    const types = (configTypes && configTypes.length) ? configTypes : DEFAULT_BLOCKS;

    return types.map((type) => {
      let items;
      if (type === "flame")       items = reactedWiki.filter((p) => p.flame);
      else if (type === "interested") items = reactedWiki.filter((p) => p.interested);
      else if (type === "practiced")  items = reactedWiki.filter((p) => p.practiced);
      else if (type === "rated")      items = reactedWiki.filter((p) => p.rating > 0);
      else if (type === "objets_wish") {
        items = statusList.filter((s) => s.status === "souhaite" && s.category === "objets")
          .map((s) => pageMap.get(s.wikiId)).filter(Boolean);
      } else if (type === "objets_have") {
        items = statusList.filter((s) => s.status === "posséde" && s.category === "objets")
          .map((s) => pageMap.get(s.wikiId)).filter(Boolean);
      } else {
        return null;
      }
      const def = BLOCK_DEFS.find((d) => d.type === type);
      return { type, label: def ? def.label : type, items };
    }).filter((b) => b !== null);
  }

  // ── Données accueil : compteurs catégories + médias + blocs configurés ──
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

    const configTypes = getAccueilBlocks(userId) || DEFAULT_BLOCKS;
    const blocks = buildBlocks(configTypes, reactedWiki, statusList);

    return { catCounts, medias: { images: imgAll.length, bd: bdAll.length }, blocks, configTypes };
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

  // ── Configuration de l'accueil ──
  router.get("/mon-profil/accueil-config", (req, res) => {
    const configTypes = getAccueilBlocks(req.user.id) || DEFAULT_BLOCKS;
    res.render("couple-accueil-config", { config, blockDefs: BLOCK_DEFS, configTypes });
  });

  router.post("/mon-profil/accueil-config", (req, res) => {
    const raw = req.body.blocks;
    const blocks = Array.isArray(raw)
      ? raw.filter((t) => VALID_BLOCK_TYPES.has(t))
      : (typeof raw === "string" && VALID_BLOCK_TYPES.has(raw) ? [raw] : []);
    setAccueilBlocks(req.user.id, blocks.length ? blocks : DEFAULT_BLOCKS);
    res.redirect("/couple/mon-profil");
  });

  return router;
}

module.exports = buildCoupleRouter;
