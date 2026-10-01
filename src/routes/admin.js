const express = require("express");
const path = require("path");
const fs = require("fs");
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
  grantLootbox,
  getLootboxCount,
  listCollections,
  getCollection,
  getCollectionImages,
  listAiProfiles,
  createAiProfile,
  updateAiProfile,
  deleteAiProfile,
  getLootboxConfig,
  setLootboxConfigKey,
  setImageRarity,
  setCharmRarity,
  grantGiftLootbox,
  listCharms,
  listAllSiteTags,
  listProtagonistes,
  listAllParodies,
} = require("../db");
const { verifyLogin, requireAdmin, tokenForUser } = require("../auth");
const { hashPassword } = require("../passwords");
const { createThrottle } = require("../loginThrottle");
const { slugify, computeScores, flattenItemsRaw } = require("../scoring");
const multer = require("multer");
const os = require("os");
const { execFile } = require("child_process");

const zipUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, _file, cb) => cb(null, `game-upload-${Date.now()}.zip`),
  }),
  limits: { fileSize: 600 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/zip" || file.originalname.endsWith(".zip")),
});

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const coversDir = path.join(path.join(__dirname, "..", "..", "games"), "covers");
      fs.mkdirSync(coversDir, { recursive: true });
      cb(null, coversDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `_tmp_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /image\/(jpeg|png|gif|webp)/.test(file.mimetype));
  },
});

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
    const aiProfiles = listAiProfiles().map((p) => {
      let phys = {};
      try { phys = p.physical_desc ? JSON.parse(p.physical_desc) : {}; } catch(_) { phys = { extras: p.physical_desc || '' }; }
      return {
        ...p,
        fantasmes: JSON.parse(p.fantasmes || '[]'),
        physical_desc: phys,
        sex_fantasmes: p.sex_fantasmes || '',
        sex_practiced: p.sex_practiced || '',
        sex_details:   p.sex_details   || '',
      };
    });
    const fantasyWikiPages = listWikiPages()
      .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
    res.render("admin-dashboard", {
      config, userStates, matrixSections, submissions,
      wikiPages, allWikiPagesSorted, galleryImages, connectionLogs,
      wikiKPIs, galleryKPIs,
      aiProfiles, fantasyWikiPages,
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

  // Attribuer des lootboxes à un utilisateur
  // Attribuer des lootboxes à un utilisateur
  router.post("/profils/:id/grant-lootbox", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const count = Math.min(20, Math.max(1, parseInt(req.body.count, 10) || 1));
    if (Number.isInteger(id)) grantLootbox(id, count);
    res.redirect(`/admin/utilisateur/${id}`);
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
    const lootboxCount = getLootboxCount(detail.user.id);
    res.render("admin-user-detail", { config, detail, attempt, liveScores, matrixSections, lootboxCount, roleHue: roleHue(detail.user) });
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

  // ── Récompenses ─────────────────────────────────────────────────────────
  router.get("/recompenses", requireAdmin, (req, res) => {
    const lootboxConfig = getLootboxConfig();
    const charms = listCharms();
    const section = ['images', 'charms', 'config'].includes(req.query.section) ? req.query.section : 'images';
    const images = section === 'images' ? listGalleryImages().map(img => {
      const imagePaths = img.imagePaths || [];
      return { id: img.id, title: img.title || '', rarity: img.rarity || 'common', thumb: imagePaths[0] || null };
    }) : [];
    res.render("admin-recompenses", { config, lootboxConfig, charms, section, images });
  });

  router.post("/recompenses/config", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const tiers = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    for (const tier of tiers) {
      if (req.body[`weight_${tier}`] !== undefined) setLootboxConfigKey(`weight_${tier}`, req.body[`weight_${tier}`]);
      if (req.body[`buy_${tier}`]    !== undefined) setLootboxConfigKey(`buy_${tier}`,    req.body[`buy_${tier}`]);
      if (req.body[`sell_${tier}`]   !== undefined) setLootboxConfigKey(`sell_${tier}`,   req.body[`sell_${tier}`]);
    }
    res.redirect("/admin/recompenses?section=config");
  });

  router.get("/recompenses/images-profil", requireAdmin, (req, res) => {
    const images = listGalleryImages().map(img => {
      const imagePaths = img.imagePaths || [];
      return { id: img.id, title: img.title || '', rarity: img.rarity || 'common', thumb: imagePaths[0] || null, imagePaths };
    });
    res.render("admin-recompenses-images", { config, images });
  });

  router.post("/recompenses/charms/:id/rarity", requireAdmin, express.json(), (req, res) => {
    const id = Number(req.params.id);
    const rarity = String(req.body.rarity || '');
    const ok = setCharmRarity(id, rarity);
    res.json({ ok });
  });

  router.post("/recompenses/images-profil/:id/rarity", requireAdmin, express.json(), (req, res) => {
    const id = Number(req.params.id);
    const rarity = String(req.body.rarity || '');
    const VALID = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    if (!VALID.includes(rarity)) return res.json({ ok: false });
    setImageRarity(id, rarity);
    res.json({ ok: true, rarity });
  });

  // ── Liste utilisateurs pour le sélecteur de cadeau ────────────────────────
  router.get("/users-for-gift", requireAdmin, (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    const users = listUsers().map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username }));
    const filtered = q ? users.filter(u => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)) : users;
    res.json({ users: filtered.slice(0, 30) });
  });

  // ── Offrir un item (image ou charme) à un utilisateur ─────────────────────
  router.post("/recompenses/gift", requireAdmin, express.json(), (req, res) => {
    const targetUserId = parseInt(req.body.targetUserId, 10);
    const itemType = String(req.body.type || '');
    const itemId   = parseInt(itemType === 'image' ? req.body.imageId : req.body.charmId, 10);
    if (!targetUserId || !['charm', 'image'].includes(itemType) || isNaN(itemId)) {
      return res.json({ ok: false, error: 'params_invalides' });
    }
    const targetUser = getUserById(targetUserId);
    if (!targetUser) return res.json({ ok: false, error: 'utilisateur_introuvable' });
    grantGiftLootbox(targetUserId, { type: itemType, ...(itemType === 'charm' ? { charmId: itemId } : { imageId: itemId }) });
    res.json({ ok: true, username: targetUser.username || targetUser.display_name || String(targetUserId) });
  });

  // ── Gestion des jeux ─────────────────────────────────────────────────────
  const GAMES_DIR  = path.join(__dirname, "..", "..", "games");
  const GAMES_JSON = path.join(GAMES_DIR, "games.json");

  function readGames() {
    try { return JSON.parse(fs.readFileSync(GAMES_JSON, "utf8")); } catch { return []; }
  }
  function writeGames(games) {
    fs.mkdirSync(GAMES_DIR, { recursive: true });
    fs.writeFileSync(GAMES_JSON, JSON.stringify(games, null, 2));
  }
  function toSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  // ── Détection du répertoire racine du jeu ───────────────────────────────────
  // Les zips contiennent souvent un dossier préfixe (ex. MonJeu-v1.0/index.html).
  // On collecte TOUS les répertoires contenant l'entrypoint (en ignorant les
  // dossiers parasites : node_modules, .git, __MACOSX…), puis on choisit le
  // meilleur candidat selon un score : profondeur minimale + présence de fichiers
  // typiques d'une racine de jeu (.js, .css, assets/, img/…).
  const SKIP_DIRS = new Set(["node_modules", ".git", "__MACOSX", ".DS_Store", "locales"]);

  function findGameRoot(baseDir, entrypoint) {
    const candidates = [];

    function walk(dir, depth) {
      if (depth > 12) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

      if (fs.existsSync(path.join(dir, entrypoint))) {
        // Score : pénalise la profondeur, récompense la présence de fichiers-clés
        const names = entries.map(e => e.name.toLowerCase());
        let score = -depth * 10;
        if (names.some(n => n.endsWith(".js")))   score += 5;
        if (names.some(n => n.endsWith(".css")))  score += 3;
        if (names.some(n => ["assets","img","images","audio","sounds","js","css","data","www","build"].includes(n))) score += 8;
        candidates.push({ dir, score });
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        walk(path.join(dir, entry.name), depth + 1);
      }
    }

    walk(baseDir, 0);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].dir;
  }

  // ── Scan de compatibilité navigateur ────────────────────────────────────────
  // Lit le HTML d'entrée + les <script src> de premier niveau (max 20 fichiers,
  // 100 Ko par fichier) et cherche des APIs Electron/Node incompatibles avec un
  // iframe navigateur. Renvoie un tableau de { severity, message }.
  function scanGameCompat(gameDir, entrypoint) {
    const PATTERNS = [
      // require() : on cible uniquement les imports de modules Electron/Node dangereux.
      // Les librairies UMD (JSZip, jQuery…) contiennent require() dans un guard
      // "typeof module !== undefined" qui n'est jamais exécuté dans un navigateur —
      // un require() générique est donc un faux positif.
      { re: /require\s*\(\s*['"](?:electron|ipcRenderer|ipcMain|fs|path|os|child_process|net|crypto|shell|app|dialog|clipboard)['"]/,
        msg: "require() d'un module Electron/Node natif" },
      { re: /\bipcRenderer\b/,           msg: "ipcRenderer — API Electron" },
      { re: /\bipcMain\b/,               msg: "ipcMain — API Electron" },
      { re: /process\.versions\.electron/, msg: "process.versions.electron — détection Electron" },
      { re: /app\.getPath\s*\(/,         msg: "app.getPath() — API Electron" },
      { re: /shell\.openExternal/,       msg: "shell.openExternal — API Electron" },
      { re: /\bBrowserWindow\b/,         msg: "BrowserWindow — API Electron" },
      { re: /\bnativeImage\b/,           msg: "nativeImage — API Electron" },
      { re: /\bwebContents\b/,           msg: "webContents — API Electron" },
      { re: /require\s*\(\s*['"]electron['"]/,  msg: "require('electron') — API Electron" },
    ];
    const WARN_PATTERNS = [
      { re: /src=["']\/(?!games\/|static\/)[^"']+["']/,
        msg: "chemin absolu /... dans src= — peut nécessiter une route dédiée (comme /static pour THOG)" },
    ];

    const warnings = [];
    const seen = new Set();

    function checkContent(content, label) {
      const sample = content.slice(0, 100_000);
      PATTERNS.forEach(({ re, msg }) => {
        if (re.test(sample) && !warnings.some(w => w.message === msg))
          warnings.push({ severity: "error", message: msg, source: label });
      });
      WARN_PATTERNS.forEach(({ re, msg }) => {
        if (re.test(sample) && !warnings.some(w => w.message === msg))
          warnings.push({ severity: "warn", message: msg, source: label });
      });
    }

    // Lecture du HTML d'entrée
    const entryFile = path.join(gameDir, entrypoint);
    let html = "";
    try { html = fs.readFileSync(entryFile, "utf8"); }
    catch {
      return [{ severity: "error", message: `Fichier d'entrée introuvable : ${entrypoint}`, source: "—" }];
    }
    checkContent(html, entrypoint);

    // Scripts de premier niveau référencés dans le HTML
    const scriptRe = /<script[^>]+src=["']([^"']+)["']/gi;
    let m;
    const srcs = [];
    while ((m = scriptRe.exec(html)) !== null) srcs.push(m[1]);

    for (const src of srcs.slice(0, 20)) {
      if (/^https?:\/\//.test(src)) continue; // skip CDN
      const rel = src.startsWith("/") ? src.slice(1) : src;
      const jsPath = path.resolve(gameDir, rel);
      // Empêche la traversée en dehors de gameDir
      if (!jsPath.startsWith(gameDir)) continue;
      if (seen.has(jsPath)) continue;
      seen.add(jsPath);
      let content = "";
      try { content = fs.readFileSync(jsPath, "utf8"); } catch { continue; }
      checkContent(content, src);
    }

    return warnings;
  }

  router.get("/jeux", requireAdmin, (req, res) => {
    res.render("admin-jeux", {
      config, games: readGames(),
      allTags: listAllSiteTags(),
      allProtagonistes: listProtagonistes(),
      allParodies: listAllParodies(),
      success: req.query.success, error: req.query.error, compat_warn: req.query.compat_warn,
    });
  });

  // ── Ajouter un nouveau jeu (avec zip) ──────────────────────────────────────
  router.post("/jeux/add", requireAdmin, (req, res) => {
    zipUpload.single("zipfile")(req, res, (uploadErr) => {
      if (uploadErr) {
        const msg = uploadErr.code === "LIMIT_FILE_SIZE"
          ? "Fichier trop volumineux (max 600 Mo)"
          : "Erreur upload : " + uploadErr.message;
        return res.redirect("/admin/jeux?error=" + encodeURIComponent(msg));
      }
    const title       = String(req.body.title       || "").trim();
    const description = String(req.body.description || "").trim();
    const entrypoint  = String(req.body.entrypoint  || "index.html").trim();
    const onlineUrl   = String(req.body.online_url  || "").trim();
    const rawSlug     = String(req.body.slug        || "").trim();
    const slug        = rawSlug ? toSlug(rawSlug) : toSlug(title);

    if (!slug || !title) return res.redirect("/admin/jeux?error=Titre+requis");
    if (!req.file)       return res.redirect("/admin/jeux?error=Aucun+fichier+reçu+ou+format+invalide");

    const gameDir = path.join(GAMES_DIR, slug);
    fs.mkdirSync(gameDir, { recursive: true });

    execFile("unzip", ["-o", req.file.path, "-d", gameDir], (err) => {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      if (err) return res.redirect("/admin/jeux?error=" + encodeURIComponent("Échec extraction : " + err.message));

      const gameRoot = findGameRoot(gameDir, entrypoint);
      if (!gameRoot) return res.redirect("/admin/jeux?error=" + encodeURIComponent(
        `Fichier d'entrée '${entrypoint}' introuvable dans le zip extrait`
      ));

      const relDir   = path.relative(GAMES_DIR, gameRoot).replace(/\\/g, "/");
      const warnings = scanGameCompat(gameRoot, entrypoint);
      const games    = readGames();
      const idx      = games.findIndex(g => g.slug === slug);
      const gameData = { slug, title, description, dir: relDir, entrypoint,
                         ...(onlineUrl ? { online_url: onlineUrl } : {}), warnings };
      if (idx >= 0) games[idx] = { ...games[idx], ...gameData };
      else games.push(gameData);
      writeGames(games);

      const hasErrors = warnings.some(w => w.severity === "error");
      res.redirect("/admin/jeux?success=1" + (hasErrors ? "&compat_warn=" + slug : ""));
    });
    }); // fin zipUpload callback
  });

  // ── Mettre à jour les fichiers d'un jeu existant (zip uniquement) ──────────
  router.post("/jeux/:slug/upload", requireAdmin, (req, res) => {
    zipUpload.single("zipfile")(req, res, (uploadErr) => {
      if (uploadErr) {
        const msg = uploadErr.code === "LIMIT_FILE_SIZE"
          ? "Fichier trop volumineux (max 600 Mo)"
          : "Erreur upload : " + uploadErr.message;
        return res.redirect("/admin/jeux?error=" + encodeURIComponent(msg));
      }
    const slug      = toSlug(req.params.slug);
    const games     = readGames();
    const existing  = games.find(g => g.slug === slug);
    if (!existing) return res.redirect("/admin/jeux?error=Jeu+introuvable");
    if (!req.file)  return res.redirect("/admin/jeux?error=Aucun+fichier+reçu");

    const entrypoint = String(req.body.entrypoint || existing.entrypoint || "index.html").trim();
    const gameDir    = path.join(GAMES_DIR, slug);
    fs.mkdirSync(gameDir, { recursive: true });

    execFile("unzip", ["-o", req.file.path, "-d", gameDir], (err) => {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      if (err) return res.redirect("/admin/jeux?error=" + encodeURIComponent("Échec extraction : " + err.message));

      const gameRoot = findGameRoot(gameDir, entrypoint);
      if (!gameRoot) return res.redirect("/admin/jeux?error=" + encodeURIComponent(
        `Fichier d'entrée '${entrypoint}' introuvable dans le zip extrait`
      ));

      const relDir   = path.relative(GAMES_DIR, gameRoot).replace(/\\/g, "/");
      const warnings = scanGameCompat(gameRoot, entrypoint);
      const idx      = games.findIndex(g => g.slug === slug);
      games[idx]     = { ...existing, dir: relDir, entrypoint, warnings };
      writeGames(games);

      const hasErrors = warnings.some(w => w.severity === "error");
      res.redirect("/admin/jeux?success=1" + (hasErrors ? "&compat_warn=" + slug : ""));
    });
    }); // fin zipUpload callback
  });

  // ── Modifier les métadonnées d'un jeu (sans zip) ───────────────────────────
  router.post("/jeux/:slug/edit", requireAdmin, (req, res) => {
    const slug      = toSlug(req.params.slug);
    const games     = readGames();
    const idx       = games.findIndex(g => g.slug === slug);
    if (idx < 0) return res.redirect("/admin/jeux?error=Jeu+introuvable");

    const title      = String(req.body.title       || "").trim();
    const description= String(req.body.description || "").trim();
    const entrypoint = String(req.body.entrypoint  || "index.html").trim();
    const onlineUrl  = String(req.body.online_url  || "").trim();
    const disabled   = req.body.disabled === "1";
    const parody     = String(req.body.parody      || "").trim();
    const subParody  = String(req.body.sub_parody  || "").trim();
    const tagsRaw    = String(req.body.tags        || "").trim();
    const tags       = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];
    const protRaw    = req.body.protagonist_ids;
    const protagonistIds = (Array.isArray(protRaw) ? protRaw : protRaw ? [protRaw] : [])
      .map(Number).filter(n => !isNaN(n) && n > 0);

    if (!title) return res.redirect("/admin/jeux?error=Titre+requis");

    const updated = { ...games[idx], title, description, entrypoint, disabled, tags, protagonist_ids: protagonistIds };
    if (onlineUrl) updated.online_url = onlineUrl; else delete updated.online_url;
    if (parody)    updated.parody    = parody;    else delete updated.parody;
    if (subParody) updated.sub_parody = subParody; else delete updated.sub_parody;
    games[idx] = updated;
    writeGames(games);
    res.redirect("/admin/jeux?success=1");
  });

  // ── Changer l'illustration d'un jeu ───────────────────────────────────────
  router.post("/jeux/:slug/cover", requireAdmin, (req, res) => {
    const slug = toSlug(req.params.slug);
    const games = readGames();
    const idx = games.findIndex(g => g.slug === slug);
    if (idx < 0) return res.redirect("/admin/jeux?error=Jeu+introuvable");

    coverUpload.single("coverfile")(req, res, (uploadErr) => {
      if (uploadErr) {
        return res.redirect("/admin/jeux?error=" + encodeURIComponent("Erreur image : " + uploadErr.message));
      }
      if (!req.file) return res.redirect("/admin/jeux?error=Aucune+image+reçue");

      const coversDir = path.join(GAMES_DIR, "covers");
      const ext = path.extname(req.file.filename);
      const finalName = slug + ext;
      const finalPath = path.join(coversDir, finalName);

      // Remove old cover files for this slug (any extension)
      try {
        fs.readdirSync(coversDir).filter(f => f.startsWith(slug + ".")).forEach(f => {
          try { fs.unlinkSync(path.join(coversDir, f)); } catch (_) {}
        });
      } catch (_) {}

      fs.renameSync(req.file.path, finalPath);
      games[idx] = { ...games[idx], cover: ext.slice(1) };
      writeGames(games);
      res.redirect("/admin/jeux?success=1");
    });
  });

  // ── Supprimer un jeu de la liste ───────────────────────────────────────────
  router.post("/jeux/:slug/delete", requireAdmin, (req, res) => {
    const slug = toSlug(req.params.slug);
    writeGames(readGames().filter(g => g.slug !== slug));
    res.redirect("/admin/jeux?success=1");
  });

  router.get("/:id", requireAdmin, (req, res) => {
    const submission = getSubmission(Number(req.params.id));
    if (!submission) return res.redirect("/admin");
    res.render("admin-detail", { config, submission, slugify, flattenItemsRaw, isLive: false });
  });

  // ── Profils IA ────────────────────────────────────────────────────────────
  router.post("/ia/create", requireAdmin, (req, res) => {
    const name        = String(req.body.name         || "").trim();
    const description = String(req.body.description  || "").trim();
    const age         = String(req.body.age          || "").trim();
    const sexe        = String(req.body.sexe         || "").trim();
    const physical_desc  = JSON.stringify({
      skin:        String(req.body.phys_skin        || '').trim(),
      hair_color:  String(req.body.phys_hair_color  || '').trim(),
      hair_length: String(req.body.phys_hair_length || '').trim(),
      hair_style:  String(req.body.phys_hair_style  || '').trim(),
      eyes_color:  String(req.body.phys_eyes_color  || '').trim(),
      eyes_style:  String(req.body.phys_eyes_style  || '').trim(),
      height:      String(req.body.phys_height      || '').trim(),
      body:        String(req.body.phys_body        || '').trim(),
      extras:      String(req.body.phys_extras      || '').trim(),
    });
    const relation_type  = String(req.body.relation_type  || "").trim();
    const sex_fantasmes  = String(req.body.sex_fantasmes  || "").trim();
    const sex_practiced  = String(req.body.sex_practiced  || "").trim();
    const sex_details    = String(req.body.sex_details    || "").trim();
    const fantasmes   = [].concat(req.body.fantasmes || []).filter(Boolean);
    if (name) createAiProfile({ name, description, fantasmes, age, sexe, physical_desc, relation_type, sex_fantasmes, sex_practiced, sex_details });
    res.redirect("/admin#tab-ia");
  });

  router.post("/ia/:id/update", requireAdmin, (req, res) => {
    const id          = Number(req.params.id);
    const name        = String(req.body.name         || "").trim();
    const description = String(req.body.description  || "").trim();
    const age         = String(req.body.age          || "").trim();
    const sexe        = String(req.body.sexe         || "").trim();
    const physical_desc  = JSON.stringify({
      skin:        String(req.body.phys_skin        || '').trim(),
      hair_color:  String(req.body.phys_hair_color  || '').trim(),
      hair_length: String(req.body.phys_hair_length || '').trim(),
      hair_style:  String(req.body.phys_hair_style  || '').trim(),
      eyes_color:  String(req.body.phys_eyes_color  || '').trim(),
      eyes_style:  String(req.body.phys_eyes_style  || '').trim(),
      height:      String(req.body.phys_height      || '').trim(),
      body:        String(req.body.phys_body        || '').trim(),
      extras:      String(req.body.phys_extras      || '').trim(),
    });
    const relation_type  = String(req.body.relation_type  || "").trim();
    const sex_fantasmes  = String(req.body.sex_fantasmes  || "").trim();
    const sex_practiced  = String(req.body.sex_practiced  || "").trim();
    const sex_details    = String(req.body.sex_details    || "").trim();
    const fantasmes   = [].concat(req.body.fantasmes || []).filter(Boolean);
    if (name) updateAiProfile(id, { name, description, fantasmes, age, sexe, physical_desc, relation_type, sex_fantasmes, sex_practiced, sex_details });
    res.redirect("/admin#tab-ia");
  });

  router.post("/ia/:id/delete", requireAdmin, (req, res) => {
    deleteAiProfile(Number(req.params.id));
    res.redirect("/admin#tab-ia");
  });

  return router;
}

module.exports = buildAdminRouter;
