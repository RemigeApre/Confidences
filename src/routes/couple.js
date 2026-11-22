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

// Mode couple (lié par l'admin, voir /admin et src/db.js:setCouplePartners) :
// consultation en lecture seule du profil du/de la partenaire — notes
// Codex/Images/BD, j'adore/intéressé, à lire plus tard. Pas de paramètres,
// pas de journal.
function buildCoupleRouter(config) {
  const router = express.Router();

  router.use(requireUser);
  router.use((req, res, next) => {
    if (!req.user.partnerId) return res.redirect("/favoris");
    const partner = getUserById(req.user.partnerId);
    // Vérification bidirectionnelle : le lien doit être mutuel.
    // Empêche qu'un utilisateur accède aux données d'un autre si un admin
    // a créé une liaison asymétrique (ou l'a partiellement supprimée).
    if (!partner || partner.partnerId !== req.user.id) return res.redirect("/favoris");
    // N'exposer que les champs nécessaires aux vues couple
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

  router.get("/", (req, res) => {
    const wikiAll = filterOff(mergeUserReactions(listWikiPages(), req.partner.id, "wiki"), req.user)
      .filter((p) => !p.hidden && (p.rating > 0 || p.flame || p.interested));
    const imgAll = filterOff(mergeUserReactions(listGalleryImages(), req.partner.id, "gallery"), req.user)
      .filter((i) => !i.hidden && (i.rating > 0 || i.flame || i.interested));
    const bdAll = filterOff(mergeUserReactions(listBdBooks(), req.partner.id, "bd"), req.user)
      .filter((b) => !b.hidden && (b.rating > 0 || b.flame || b.interested));
    const readLaterCount = filterOff(mergeUserReactions(listWikiPages(), req.partner.id, "wiki"), req.user)
      .filter((p) => !p.hidden && p.readLater).length;

    const stats = {
      wiki:      { total: wikiAll.length,  flame: wikiAll.filter((p) => p.flame).length },
      images:    { total: imgAll.length,   flame: imgAll.filter((i) => i.flame).length },
      bd:        { total: bdAll.length,    flame: bdAll.filter((b) => b.flame).length },
      readLater: readLaterCount,
    };
    const flameWiki = wikiAll.filter((p) => p.flame).slice(0, 12);

    res.render("couple-accueil", { config, partner: req.partner, stats, flameWiki, categories: WIKI_CATEGORIES });
  });

  // Helper : construit les sections codex depuis les données d'un userId
  function buildWikiSections(userId, viewerId) {
    const viewer = getUserById(viewerId);

    // Statuts objets : indépendants des réactions (une page peut avoir un statut sans note)
    const statusList = getUserWikiStatusList(userId);
    const statusObjIds = new Set(statusList.map((s) => s.wikiId));

    const allPages = filterOff(mergeUserReactions(listWikiPages(), userId, "wiki"), viewer);
    const pages = allPages.filter((p) =>
      !p.hidden && (p.rating > 0 || p.flame || p.interested || p.practiced || statusObjIds.has(p.id))
    );
    const pageMap = new Map(pages.map((p) => [p.id, p]));

    // Objets via user_wiki_status
    const objPossede  = statusList.filter((s) => s.status === 'posséde'  && s.category === 'objets').map((s) => pageMap.get(s.wikiId)).filter(Boolean);
    const objSouhaite = statusList.filter((s) => s.status === 'souhaite' && s.category === 'objets').map((s) => pageMap.get(s.wikiId)).filter(Boolean);

    const shown = new Set([...objPossede, ...objSouhaite].map((p) => p.id));
    const nonObjects = pages.filter((p) => p.category !== "objets");

    const interested = nonObjects.filter((p) => p.interested);
    interested.forEach((p) => shown.add(p.id));
    const flame = nonObjects.filter((p) => p.flame && !shown.has(p.id));
    flame.forEach((p) => shown.add(p.id));
    const practiced = nonObjects.filter((p) => p.practiced && !shown.has(p.id));
    practiced.forEach((p) => shown.add(p.id));
    const rated = pages.filter((p) => p.rating > 0 && !shown.has(p.id));

    return { objPossede, objSouhaite, interested, flame, practiced, rated };
  }

  // ── Vue "mon profil tel que mon partenaire le voit" ──
  router.get("/mon-profil/wiki", (req, res) => {
    const self = { id: req.user.id, displayName: req.user.displayName, profileColor: req.user.profileColor, sexe: req.user.sexe };
    const sections = buildWikiSections(req.user.id, req.user.id);
    res.render("couple-notes-wiki", { config, partner: self, categories: WIKI_CATEGORIES, selfView: true, ...sections });
  });

  router.get("/notes/wiki", (req, res) => {
    const sections = buildWikiSections(req.partner.id, req.user.id);
    res.render("couple-notes-wiki", { config, partner: req.partner, categories: WIKI_CATEGORIES, ...sections });
  });

  router.get("/notes/images", (req, res) => {
    const items = filterOff(mergeUserReactions(listGalleryImages(), req.partner.id, "gallery"), req.user)
      .filter((img) => !img.hidden && (img.rating > 0 || img.flame || img.interested));
    res.render("couple-notes-images", { config, partner: req.partner, items });
  });

  router.get("/notes/bd", (req, res) => {
    const books = filterOff(mergeUserReactions(listBdBooks(), req.partner.id, "bd"), req.user)
      .filter((b) => !b.hidden && (b.rating > 0 || b.flame || b.interested));
    res.render("couple-notes-bd", { config, partner: req.partner, books });
  });

  router.get("/a-lire-plus-tard", (req, res) => {
    const pages = filterOff(mergeUserReactions(listWikiPages(), req.partner.id, "wiki"), req.user)
      .filter((p) => !p.hidden && p.readLater);
    res.render("couple-a-lire-plus-tard", { config, partner: req.partner, pages, categories: WIKI_CATEGORIES });
  });

  return router;
}

module.exports = buildCoupleRouter;
