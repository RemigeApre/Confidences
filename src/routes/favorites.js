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
    });
  }

  function renderIdentite(res, req, extra) {
    const user = getUserById(req.user.id);
    const connectionLogs = listConnectionLogsForUser(req.user.id, 20);
    res.render("profil-identite", {
      config,
      user,
      connectionLogs,
      roleHue: roleHue(req.user),
      error: null,
      notice: null,
      ...extra,
    });
  }

  router.get("/", requireUser, (req, res) => {
    renderFavoris(res, req);
  });

  router.get("/parametres", requireUser, (req, res) => {
    res.render("profil-parametres", { config, roleHue: roleHue(req.user) });
  });

  router.get("/identite", requireUser, (req, res) => {
    const notice = req.query.ok ? "Modifications enregistrées." : null;
    const error = req.query.err ? decodeURIComponent(req.query.err) : null;
    renderIdentite(res, req, { notice, error });
  });

  router.post("/parametres", requireUserJson, (req, res) => {
    const { orientation, ultraMode, irrealisteMode } = req.body;
    updateUserSettings(req.user.id, { orientation, ultraMode, irrealisteMode });
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
      return renderIdentite(res, req, { error: "Mot de passe actuel incorrect." });
    }
    if (next.length < 4) {
      return renderIdentite(res, req, { error: "Nouveau mot de passe trop court." });
    }
    updateUserPassword(req.user.id, hashPassword(next));
    res.redirect("/favoris/identite?ok=1");
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
