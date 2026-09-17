const express = require("express");
const {
  listSubmissions,
  getSubmission,
  getAttempt,
  listWikiPages,
  setWikiPageFeatured,
  getWikiPage,
  listUsers,
  getUserByUsername,
  getUserById,
  createUser,
  updateUser,
  updateOwnProfile,
  updateUserSettings,
  updateUserPassword,
  listGalleryImages,
  getGalleryImage,
  setGalleryImageFeatured,
  deleteUser,
  getUserFavoritesWithDetails,
  logConnection,
  listConnectionLogs,
  getWikiKPIs,
  getGalleryKPIs,
  getUserDetail,
  mergeUserReactions,
  touchLastLogin,
  getUserReactionStats,
  listBdBooks,
  listFavoriteRows,
  listConnectionLogsForUser,
  listActivitySessions,
  setCouplePartners,
  clearCouplePartner,
  listCollections,
  getCollection,
  getCollectionImages,
} = require("../db");
const { verifyLogin, requireAdmin, tokenForUser } = require("../auth");
const { hashPassword } = require("../passwords");
const { createThrottle } = require("../loginThrottle");
const { slugify, computeScores, flattenItemsRaw } = require("../scoring");

const loginThrottle = createThrottle();
const SEXE_VALUES = ["", "femme", "homme", "autre"];

function safeNext(next) {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function buildAdminRouter(config) {
  const router = express.Router();

  router.get("/login", (req, res) => {
    res.render("admin-login", { error: null, next: safeNext(req.query.next) || "" });
  });

  router.post("/login", (req, res) => {
    const key = req.ip;
    const wait = loginThrottle.secondsToWait(key);
    const next = safeNext(req.body.next);
    if (wait > 0) {
      return res.render("admin-login", { error: `Trop de tentatives. Reessaie dans ${wait}s.`, next: next || "" });
    }

    const user = verifyLogin(req.body.username, req.body.password);
    if (user) {
      loginThrottle.recordSuccess(key);
      req.session.userId = user.id;
      logConnection(user.id, req.ip, req.headers["user-agent"] || "");
      touchLastLogin(user.id);
      return res.redirect(next || (user.isAdmin ? "/admin" : "/favoris"));
    }

    loginThrottle.recordFailure(key);
    res.render("admin-login", { error: "Identifiants incorrects", next: next || "" });
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
  });

  router.get("/", requireAdmin, (req, res) => renderAdmin(req, res, null));

  router.get("/live/:userId", requireAdmin, (req, res) => {
    const user = listUsers().find((u) => u.id === Number(req.params.userId));
    if (!user) return res.redirect("/admin");
    const attempt = getAttempt(tokenForUser(user));
    const scores = attempt ? computeScores(config, attempt.data) : computeScores(config, {});
    const submission = {
      id: "live",
      createdAt: attempt ? attempt.updatedAt : new Date().toISOString(),
      answers: attempt ? attempt.data : {},
      scores,
    };
    res.render("admin-detail", { config, submission, slugify, flattenItemsRaw, isLive: true, liveUser: user });
  });

  router.post("/wiki-featured/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const page = getWikiPage(id);
    if (!page) return res.status(404).json({ ok: false });
    const newVal = !page.featured;
    setWikiPageFeatured(id, newVal);
    res.json({ ok: true, featured: newVal });
  });

  router.post("/gallery-featured/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const img = getGalleryImage(id);
    if (!img) return res.status(404).json({ ok: false });
    const newVal = !img.featured;
    setGalleryImageFeatured(id, newVal);
    res.json({ ok: true, featured: newVal });
  });

  function renderAdmin(req, res, adminError) {
    const users = listUsers();
    const matrixSections = config.sections.filter((s) => s.type === "matrix");
    const userStates = users.map((u) => {
      const attempt = getAttempt(tokenForUser(u));
      const liveScores = attempt ? computeScores(config, attempt.data) : null;
      let liveRaw = 0, liveMax = 0;
      if (liveScores) {
        for (const key of Object.keys(liveScores.sections)) {
          const s = liveScores.sections[key];
          if (s.type === "matrix") { liveRaw += s.raw; liveMax += s.max; }
        }
      }
      const livePercentage = liveMax ? Math.round((liveRaw / liveMax) * 1000) / 10 : 0;
      const favorites = getUserFavoritesWithDetails(u.id);
      const reactionStats = getUserReactionStats(u.id);
      return { user: u, attempt, liveScores, livePercentage, favorites, reactionStats };
    });
    const wikiPages = listWikiPages().sort((a, b) => b.views - a.views);
    const allWikiPagesSorted = listWikiPages().sort((a, b) =>
      a.title.localeCompare(b.title, "fr", { sensitivity: "base" })
    );
    const galleryImages = mergeUserReactions(listGalleryImages(), req.session.userId, "gallery")
      .sort((a, b) => (b.rating - a.rating) || b.id - a.id);
    const connectionLogs = listConnectionLogs(200);
    const submissions = listSubmissions();
    const wikiKPIs = getWikiKPIs();
    const galleryKPIs = getGalleryKPIs();
    res.render("admin-dashboard", {
      config, userStates, matrixSections, submissions,
      wikiPages, allWikiPagesSorted, galleryImages, connectionLogs,
      wikiKPIs, galleryKPIs,
      adminError: adminError || null,
    });
  }

  // ── Gestion des profils ──────────────────────────────
  router.post("/profils", requireAdmin, (req, res) => {
    const nom = String(req.body.nom || "").trim();
    const username = nom.toLowerCase();
    const displayName = nom;
    const password = String(req.body.password || "");
    const role = String(req.body.role || "normal");
    const isAdmin = role === "admin";
    const isTest = role === "test";

    if (!nom || !password) {
      return renderAdmin(req, res, "Le nom et le mot de passe sont obligatoires.");
    }
    if (getUserByUsername(username)) {
      return renderAdmin(req, res, "Ce nom d'utilisateur existe déjà.");
    }

    const newId = createUser({ username, displayName, passwordHash: hashPassword(password), isAdmin, isTest });

    const email = String(req.body.email || "").trim();
    const sexeRaw = String(req.body.sexe || "");
    const sexe = SEXE_VALUES.includes(sexeRaw) ? sexeRaw : "";
    const birthYear = req.body.birth_year ? Number(req.body.birth_year) || null : null;
    const orientation = String(req.body.orientation || "");
    if (email || sexe || birthYear || orientation) {
      updateOwnProfile(newId, { displayName, email, sexe, birthYear });
      if (orientation) updateUserSettings(newId, { orientation });
    }

    res.redirect("/admin#tab-utilisateurs");
  });

  // Modifie l'identite et les roles (admin/test) d'un profil existant.
  // Un admin ne peut pas se retirer lui-meme le role admin (meme risque de
  // verrouillage que pour la suppression, deja empechee plus bas).
  router.post("/profils/:id/edit", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? getUserById(id) : null;
    if (!existing) return res.redirect("/admin#tab-utilisateurs");

    const nom = String(req.body.nom || "").trim();
    const username = nom.toLowerCase();
    const displayName = nom;
    if (!nom) return renderAdmin(req, res, "Le nom est obligatoire.");

    const dupe = getUserByUsername(username);
    if (dupe && dupe.id !== id) {
      return renderAdmin(req, res, "Ce nom d'utilisateur existe déjà.");
    }

    const role = String(req.body.role || "normal");
    const isAdmin = id === req.session.userId ? true : role === "admin";
    const isTest = id !== req.session.userId && role === "test";
    const sexeRaw = String(req.body.sexe || "");
    const sexe = SEXE_VALUES.includes(sexeRaw) ? sexeRaw : "";
    const canSeeOwned = req.body.can_see_owned === "on";
    updateUser(id, { username, displayName, isAdmin, isTest, sexe, canSeeOwned });

    const email = String(req.body.email || "").trim();
    const birthYear = req.body.birth_year ? Number(req.body.birth_year) || null : null;
    const orientation = String(req.body.orientation || "");
    updateOwnProfile(id, { displayName, email, sexe, birthYear });
    if (orientation !== undefined) updateUserSettings(id, { orientation });

    // Mode couple : "Aucun" (champ vide) délie, sinon lie aux deux profils
    // en miroir (voir setCouplePartners, remplace toute liaison existante).
    const partnerIdRaw = String(req.body.partner_id || "");
    const partnerId = partnerIdRaw ? Number(partnerIdRaw) : null;
    if (partnerId && Number.isInteger(partnerId) && partnerId !== id) {
      setCouplePartners(id, partnerId);
    } else if (!partnerIdRaw) {
      clearCouplePartner(id);
    }

    res.redirect("/admin#tab-utilisateurs");
  });

  router.post("/profils/:id/password", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const password = String(req.body.password || "");
    if (password && Number.isInteger(id)) {
      updateUserPassword(id, hashPassword(password));
    }
    res.redirect("/admin#tab-utilisateurs");
  });

  router.post("/profils/:id/delete", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id) && id !== req.session.userId) {
      deleteUser(id);
    }
    res.redirect("/admin#tab-utilisateurs");
  });

  // Teinte du volet, même logique que src/routes/favorites.js pour le profil
  // du visiteur (admin violet, test orange, sinon bleu) — ici appliquée au
  // rôle du profil CONSULTÉ, pas de l'admin qui regarde.
  function roleHue(user) {
    if (user.isAdmin) return 262;
    if (user.isTest) return 32;
    return 217;
  }

  // Volet gauche "Activité utilisateur" (admin uniquement, voir requireAdmin
  // sur chacune de ces routes) : items notés (rating/flame) ou mis en favori
  // par ce profil, pour un type de contenu donné.
  function ratedOrFavorited(userId, itemType, listFn) {
    const withReactions = mergeUserReactions(listFn(), userId, itemType);
    const favIds = new Set(
      listFavoriteRows(userId).filter((r) => r.item_type === itemType).map((r) => r.item_id)
    );
    return withReactions.filter((it) => it.rating > 0 || it.flame || favIds.has(it.id));
  }

  // Rattache le nombre de vues (déjà calculé par getUserDetail) aux objets
  // contenu complets (image, note...), pour affichage en carte.
  function withViewCounts(viewCounts, idKey, userId, itemType, listFn) {
    const withReactions = mergeUserReactions(listFn(), userId, itemType);
    const byId = {};
    withReactions.forEach((it) => { byId[it.id] = it; });
    return viewCounts
      .map((v) => {
        const item = byId[v[idKey]];
        return item ? Object.assign({}, item, { viewCount: v.viewCount }) : null;
      })
      .filter(Boolean);
  }

  router.get("/utilisateur/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const attempt = getAttempt(tokenForUser(detail.user));
    const liveScores = attempt ? computeScores(config, attempt.data) : null;
    const matrixSections = config.sections.filter((s) => s.type === "matrix");
    res.render("admin-user-detail", { config, detail, attempt, liveScores, matrixSections, roleHue: roleHue(detail.user) });
  });

  router.get("/utilisateur/:id/codex", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const items = ratedOrFavorited(id, "wiki", listWikiPages);
    const topViews = withViewCounts(detail.wikiViewCounts, "pageId", id, "wiki", listWikiPages);
    res.render("admin-user-codex", { config, detail, items, topViews, roleHue: roleHue(detail.user) });
  });

  router.get("/utilisateur/:id/images", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const items = ratedOrFavorited(id, "gallery", listGalleryImages);
    const topViews = withViewCounts(detail.galViewCounts, "galleryId", id, "gallery", listGalleryImages);
    res.render("admin-user-images", { config, detail, items, topViews, roleHue: roleHue(detail.user) });
  });

  router.get("/utilisateur/:id/bd", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const items = ratedOrFavorited(id, "bd", listBdBooks);
    const topViews = withViewCounts(detail.bdViewCounts, "bookId", id, "bd", listBdBooks);
    res.render("admin-user-bd", { config, detail, items, topViews, roleHue: roleHue(detail.user) });
  });

  router.get("/utilisateur/:id/activite", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const feed = [];
    detail.recentWikiViews.forEach((v) => feed.push({ type: "wiki", title: v.title, id: v.pageId, at: v.createdAt }));
    detail.recentGalViews.forEach((v) => feed.push({ type: "gallery", title: v.title, id: v.galleryId, at: v.createdAt }));
    detail.recentBdViews.forEach((v) => feed.push({ type: "bd", title: v.title, id: v.bookId, at: v.createdAt }));
    feed.sort((a, b) => new Date(b.at) - new Date(a.at));
    res.render("admin-user-activite", { config, detail, feed, roleHue: roleHue(detail.user) });
  });

  router.get("/utilisateur/:id/connexions", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const connectionLogs = listConnectionLogsForUser(id, 30);
    const sessions = listActivitySessions(id, 30);
    res.render("admin-user-connexions", { config, detail, connectionLogs, sessions, roleHue: roleHue(detail.user) });
  });

  // ── "À lire plus tard" (Codex) d'un profil, réservé à l'admin — lecture
  // seule, même liste que /favoris/a-lire-plus-tard côté profil lui-même.
  router.get("/utilisateur/:id/a-lire-plus-tard", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const items = mergeUserReactions(listWikiPages(), id, "wiki").filter((p) => p.readLater);
    res.render("admin-user-lire-plus-tard", { config, detail, items, roleHue: roleHue(detail.user) });
  });

  // ── Collections (Galerie) d'un profil, réservé à l'admin — lecture seule,
  // même donnée que /favoris/collections côté profil lui-même (voir
  // listCollections/getCollection/getCollectionImages dans src/db.js).
  router.get("/utilisateur/:id/collections", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const collections = listCollections(id);
    res.render("admin-user-collections", { config, detail, collections, roleHue: roleHue(detail.user) });
  });

  router.get("/utilisateur/:id/collections/:cid", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const cid = Number(req.params.cid);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    const collection = Number.isInteger(cid) ? getCollection(cid) : null;
    if (!detail || !collection || collection.userId !== id) return res.redirect("/admin/utilisateur/" + id + "/collections");
    const items = getCollectionImages(cid);
    res.render("admin-user-collection-detail", { config, detail, collection, items, roleHue: roleHue(detail.user) });
  });

  router.get("/:id", requireAdmin, (req, res) => {
    const submission = getSubmission(Number(req.params.id));
    if (!submission) return res.redirect("/admin");
    res.render("admin-detail", { config, submission, slugify, flattenItemsRaw, isLive: false });
  });

  return router;
}

module.exports = buildAdminRouter;
