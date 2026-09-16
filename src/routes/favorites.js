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
  getUserById,
  listConnectionLogsForUser,
  updateOwnProfile,
  updateUserPassword,
  getUserCredentials,
  countUserNotes,
  getUserDetail,
} = require("../db");
const { requireUser, requireUserJson } = require("../auth");
const { hashPassword, verifyPassword } = require("../passwords");

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

const VALID_TYPES = ["wiki", "gallery", "bd"];
const SEXE_VALUES = ["", "femme", "homme", "autre"];

function parseBirthYear(raw) {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1900 || n > new Date().getFullYear()) return null;
  return n;
}

// Teinte du volet de navigation profil, selon le rôle du compte (même
// couleurs que l'icône clé du header : admin violet, test orange, sinon bleu).
function roleHue(user) {
  if (user.isAdmin) return 262;
  if (user.isTest) return 32;
  return 217;
}

// Compteurs affichés dans le volet de navigation, en face de Codex/Images/BD
// (voir partials/profil-nav.ejs) — de simples COUNT, pas les listes entières.
function notesCounts(user) {
  return {
    wiki: countUserNotes(user.id, "wiki"),
    gallery: countUserNotes(user.id, "gallery"),
    bd: countUserNotes(user.id, "bd"),
  };
}

// Regroupement par période pour /favoris/historique (voir profil-historique.ejs) :
// fenêtre glissante depuis aujourd'hui, pas calée sur les bornes du calendrier
// (semaine/mois) — plus simple et largement suffisant pour un historique perso.
const HISTORY_WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const HISTORY_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function historyBucketLabel(at) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((startOfDay(new Date()) - startOfDay(new Date(at))) / 86400000);
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) {
    const d = new Date(at);
    return "Hier · " + HISTORY_WEEKDAYS[d.getDay()] + " " + d.getDate() + " " + HISTORY_MONTHS[d.getMonth()];
  }
  if (diffDays <= 7) return "La semaine dernière";
  if (diffDays <= 30) return "Le mois dernier";
  return "Il y a plus longtemps";
}
// Regroupe un flux déjà trié (desc) en buckets, dans l'ordre où ils
// apparaissent (donc chronologiquement décroissant, Aujourd'hui en premier).
function groupHistoryFeed(feed) {
  const buckets = [];
  const byLabel = {};
  feed.forEach((f) => {
    const label = historyBucketLabel(f.at);
    if (!byLabel[label]) {
      byLabel[label] = { label, items: [] };
      buckets.push(byLabel[label]);
    }
    byLabel[label].items.push(f);
  });
  return buckets;
}

// Durée de rétention de /favoris/historique (voir profil-parametres.ejs) :
// ne filtre que ce qui s'affiche sur cette page précise, ne supprime jamais
// les vues elles-mêmes (utilisées ailleurs, notamment par les stats admin).
const HISTORY_RETENTION_DAYS = { "3jours": 3, "1semaine": 7, "1mois": 30, "3mois": 90 };
function historyRetentionDays(user) {
  return HISTORY_RETENTION_DAYS[user.historyRetention] || HISTORY_RETENTION_DAYS["1mois"];
}

function buildFavoritesRouter(config) {
  const router = express.Router();

  function renderFavoris(res, req) {
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
    const fantasyPages = wikiPages.filter((p) =>
      p.category === "fantasmes" || (p.extraCategories || []).includes("fantasmes")
    );
    res.render("favoris", {
      config,
      wikiPages,
      galleryImages,
      bdBooks,
      fantasyPages,
      categories: WIKI_CATEGORIES,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
    });
  }

  function renderIdentite(res, req, extra) {
    const user = getUserById(req.user.id);
    res.render("profil-identite", {
      config,
      user,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
      error: null,
      notice: null,
      ...extra,
    });
  }

  function renderMotDePasse(res, req, extra) {
    res.render("profil-mot-de-passe", {
      config,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
      error: null,
      notice: null,
      ...extra,
    });
  }

  function renderJournal(res, req) {
    const user = getUserById(req.user.id);
    const connectionLogs = listConnectionLogsForUser(req.user.id, 20);
    res.render("profil-journal", {
      config,
      user,
      connectionLogs,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
    });
  }

  router.get("/", requireUser, (req, res) => {
    renderFavoris(res, req);
  });

  router.get("/parametres", requireUser, (req, res) => {
    res.render("profil-parametres", { config, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
  });

  router.get("/identite", requireUser, (req, res) => {
    const notice = req.query.ok ? "Modifications enregistrées." : null;
    const error = req.query.err ? decodeURIComponent(req.query.err) : null;
    renderIdentite(res, req, { notice, error });
  });

  router.get("/mot-de-passe", requireUser, (req, res) => {
    const notice = req.query.ok ? "Mot de passe modifié." : null;
    renderMotDePasse(res, req, { notice });
  });

  router.get("/journal", requireUser, (req, res) => {
    if (!req.user.isAdmin) return res.redirect("/favoris/identite");
    renderJournal(res, req);
  });

  // ── Historique de consultation (Codex/Images/BD confondus) ──────────────
  // Réutilise getUserDetail (déjà utilisé côté admin pour la même chose sur
  // un profil tiers) : ici appliqué à req.user lui-même, en libre accès à
  // tout profil, pas seulement l'admin.
  router.get("/historique", requireUser, (req, res) => {
    const detail = getUserDetail(req.user.id);
    const feed = [];
    detail.recentWikiViews.forEach((v) => {
      const page = getWikiPage(v.pageId);
      feed.push({ type: "wiki", title: v.title, id: v.pageId, at: v.createdAt, coverImg: page && page.imagePaths && page.imagePaths[0], category: page && page.category });
    });
    detail.recentGalViews.forEach((v) => {
      const img = getGalleryImage(v.galleryId);
      feed.push({ type: "gallery", title: v.title, id: v.galleryId, at: v.createdAt, coverImg: img && ((img.imagePaths && img.imagePaths[0]) || img.filename) });
    });
    detail.recentBdViews.forEach((v) => {
      const book = getBdBook(v.bookId);
      feed.push({ type: "bd", title: v.title, id: v.bookId, at: v.createdAt, coverImg: book && book.imagePaths && book.imagePaths[0] });
    });
    const cutoff = Date.now() - historyRetentionDays(req.user) * 86400000;
    const filteredFeed = feed
      .filter((f) => new Date(f.at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    const buckets = groupHistoryFeed(filteredFeed);
    res.render("profil-historique", { config, buckets, categories: WIKI_CATEGORIES, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
  });

  router.post("/parametres", requireUserJson, (req, res) => {
    const { orientation, ultraMode, irrealisteMode, shareNotesWithAdmin, historyRetention } = req.body;
    updateUserSettings(req.user.id, { orientation, ultraMode, irrealisteMode, shareNotesWithAdmin, historyRetention });
    res.json({ ok: true });
  });

  router.post("/identite", requireUser, (req, res) => {
    const displayName = String(req.body.display_name || "").trim();
    if (!displayName) return renderIdentite(res, req, { error: "Le pseudo est obligatoire." });

    const email = String(req.body.email || "").trim().slice(0, 254);
    if (email && !email.includes("@")) return renderIdentite(res, req, { error: "Adresse mail invalide." });

    const sexeRaw = String(req.body.sexe || "");
    const sexe = SEXE_VALUES.includes(sexeRaw) ? sexeRaw : "";
    const birthYear = parseBirthYear(req.body.birth_year);
    const orientation = String(req.body.orientation || "");

    updateOwnProfile(req.user.id, { displayName, email, sexe, birthYear });
    updateUserSettings(req.user.id, { orientation });
    res.redirect("/favoris/identite?ok=1");
  });

  router.post("/mot-de-passe", requireUser, (req, res) => {
    const current = String(req.body.current_password || "");
    const next = String(req.body.new_password || "");
    const creds = getUserCredentials(req.user.username);
    if (!creds || !verifyPassword(current, creds.password_hash)) {
      return renderMotDePasse(res, req, { error: "Mot de passe actuel incorrect." });
    }
    if (next.length < 4) {
      return renderMotDePasse(res, req, { error: "Nouveau mot de passe trop court." });
    }
    updateUserPassword(req.user.id, hashPassword(next));
    res.redirect("/favoris/mot-de-passe?ok=1");
  });

  router.get("/notes/images", requireUser, (req, res) => {
    const favIds = new Set(
      listFavoriteRows(req.user.id).filter((r) => r.item_type === "gallery").map((r) => r.item_id)
    );
    const all = mergeUserReactions(listGalleryImages(), req.user.id, "gallery")
      .filter((img) => img.rating > 0 || img.flame)
      .map((img) => Object.assign(img, { isFavorite: favIds.has(img.id) }));
    // Favoris d'abord, puis par note décroissante.
    all.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return b.rating - a.rating;
    });
    const tagSet = new Set();
    all.forEach((img) => (img.tags || []).forEach((t) => tagSet.add(t)));
    const allTags = [...tagSet].sort();
    res.render("profil-notes-images", { config, items: all, allTags, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
  });

  router.get("/notes/wiki", requireUser, (req, res) => {
    const all = mergeUserReactions(listWikiPages(), req.user.id, "wiki")
      .filter((p) => p.rating > 0 || p.flame);
    const tagSet = new Set();
    all.forEach((p) => (p.tags || []).forEach((t) => tagSet.add(t)));
    const allTags = [...tagSet].sort();
    res.render("profil-notes-wiki", { config, pages: all, allTags, categories: WIKI_CATEGORIES, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
  });

  // ── "À lire plus tard" (Codex uniquement) — strictement personnel : voir
  // routes/admin.js pour l'équivalent réservé à l'admin sur un profil tiers.
  router.get("/a-lire-plus-tard", requireUser, (req, res) => {
    const pages = mergeUserReactions(listWikiPages(), req.user.id, "wiki")
      .filter((p) => p.readLater);
    res.render("profil-a-lire-plus-tard", { config, pages, categories: WIKI_CATEGORIES, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
  });

  // ── Contenus masqués (Codex/Images/BD) — strictement personnel : voir
  // le bouton "Masquer" sur chaque page/image/BD, qui les retire des
  // listings pour ce seul profil. Seul endroit pour les rendre visibles à
  // nouveau (le bouton lui-même y redevient inactif une fois republié).
  router.get("/masques", requireUser, (req, res) => {
    const wikiPages = mergeUserReactions(listWikiPages(), req.user.id, "wiki").filter((p) => p.hidden);
    const galleryImages = mergeUserReactions(listGalleryImages(), req.user.id, "gallery").filter((img) => img.hidden);
    const bdBooks = mergeUserReactions(listBdBooks(), req.user.id, "bd").filter((b) => b.hidden);
    res.render("profil-masques", {
      config, wikiPages, galleryImages, bdBooks,
      categories: WIKI_CATEGORIES, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user),
    });
  });

  router.get("/notes/bd", requireUser, (req, res) => {
    const favIds = new Set(
      listFavoriteRows(req.user.id).filter((r) => r.item_type === "bd").map((r) => r.item_id)
    );
    const all = mergeUserReactions(listBdBooks(), req.user.id, "bd")
      .filter((b) => b.rating > 0 || b.flame)
      .map((b) => Object.assign(b, { isFavorite: favIds.has(b.id) }));
    // Favoris d'abord, puis par note décroissante.
    all.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return b.rating - a.rating;
    });
    const tagSet = new Set();
    all.forEach((b) => (b.tags || []).forEach((t) => tagSet.add(t)));
    const allTags = [...tagSet].sort();
    res.render("profil-notes-bd", { config, books: all, allTags, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
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
