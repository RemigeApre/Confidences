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
  syncFlameFavoritesForUser,
} = require("../db");
const { verifyLogin, requireAdmin, tokenForUser } = require("../auth");
const { hashPassword } = require("../passwords");
const { createThrottle } = require("../loginThrottle");
const { slugify, computeScores, flattenItemsRaw } = require("../scoring");

const loginThrottle = createThrottle();

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
      return { user: u, attempt, liveScores, livePercentage, favorites };
    });
    const wikiPages = listWikiPages().sort((a, b) => b.views - a.views);
    const allWikiPagesSorted = listWikiPages().sort((a, b) =>
      a.title.localeCompare(b.title, "fr", { sensitivity: "base" })
    );
    const galleryImages = listGalleryImages().sort((a, b) => (b.rating - a.rating) || b.id - a.id);
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
    const username = String(req.body.username || "").trim().toLowerCase();
    const displayName = String(req.body.display_name || "").trim();
    const password = String(req.body.password || "");
    const isAdmin = req.body.is_admin === "on";
    const isTest = req.body.is_test === "on";

    if (!username || !displayName || !password) {
      return renderAdmin(req, res, "Tous les champs sont obligatoires.");
    }
    if (getUserByUsername(username)) {
      return renderAdmin(req, res, "Ce nom d'utilisateur existe déjà.");
    }

    createUser({ username, displayName, passwordHash: hashPassword(password), isAdmin, isTest });
    res.redirect("/admin#tab-utilisateurs");
  });

  // Modifie l'identite et les roles (admin/test) d'un profil existant.
  // Un admin ne peut pas se retirer lui-meme le role admin (meme risque de
  // verrouillage que pour la suppression, deja empechee plus bas).
  router.post("/profils/:id/edit", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? getUserById(id) : null;
    if (!existing) return res.redirect("/admin#tab-utilisateurs");

    const username = String(req.body.username || "").trim().toLowerCase();
    const displayName = String(req.body.display_name || "").trim();
    if (!username || !displayName) {
      return renderAdmin(req, res, "Tous les champs sont obligatoires.");
    }
    const dupe = getUserByUsername(username);
    if (dupe && dupe.id !== id) {
      return renderAdmin(req, res, "Ce nom d'utilisateur existe déjà.");
    }

    const isAdmin = id === req.session.userId ? true : req.body.is_admin === "on";
    const isTest = req.body.is_test === "on";
    updateUser(id, { username, displayName, isAdmin, isTest });
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

  router.get("/utilisateur/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const detail = Number.isInteger(id) ? getUserDetail(id) : null;
    if (!detail) return res.redirect("/admin#tab-utilisateurs");
    const attempt = getAttempt(tokenForUser(detail.user));
    const liveScores = attempt ? computeScores(config, attempt.data) : null;
    const matrixSections = config.sections.filter((s) => s.type === "matrix");
    res.render("admin-user-detail", { config, detail, attempt, liveScores, matrixSections });
  });

  router.post("/sync-flames-all", requireAdmin, (req, res) => {
    const users = listUsers();
    for (const u of users) syncFlameFavoritesForUser(u.id);
    res.redirect("/admin#tab-utilisateurs");
  });

  router.post("/utilisateur/:id/sync-flames", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) syncFlameFavoritesForUser(id);
    res.redirect("/admin/utilisateur/" + id);
  });

  router.get("/:id", requireAdmin, (req, res) => {
    const submission = getSubmission(Number(req.params.id));
    if (!submission) return res.redirect("/admin");
    res.render("admin-detail", { config, submission, slugify, flattenItemsRaw, isLive: false });
  });

  return router;
}

module.exports = buildAdminRouter;
