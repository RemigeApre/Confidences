const express = require("express");
const { thumbUrl } = require("../thumbs");
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
  touchIdentityChange,
  getUserByEmail,
  updateUserPassword,
  destroyAllSessionsForUser,
  logSecurityEvent,
  getUserCredentials,
  countUserNotes,
  getUserDetail,
  resetUserContent,
  deleteUser,
  listUsers,
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionImages,
  addToCollection,
  removeFromCollection,
  listCollectionsForImagePopup,
  listHiddenBdPages,
  getUserUnlocks,
  fuseImageIdentique,
  fuseImageRarete,
  setProfileBanner,
  getUserJokers,
  getUserUnlockedCharms,
  getShopItems,
  sellUnlock,
  sellCharmUnlock,
  sellTheme,
  buyItem,
  toggleUnlockFavorite,
  setProfileImageId,
  setProfileImageCrop,
  RARITY_BUY_PRICE,
  RARITY_SELL_PRICE,
  getLootboxConfig,
  getLootboxCount,
  checkAndGrantActionLootbox,
  countUserFavoritesAll,
  getUserThemes,
  setActiveTheme,
  buyTheme,
  THEME_DEFINITIONS,
  getUserCards,
  getUserPersonnageCards,
  listClasseursWithProgress,
  getClasseurWithCards,
  getPublicProfile,
  setPublicProfile,
  listProfilQuizAttempts,
  getProfilQuizType,
  getProfilQuizArchetypes,
  getUserCoffreStats,
  getUserStreak,
  getUserWikiStatusList,
  getTopRatedWikiItems,
  listPendingInvites,
  listAllInviteUses,
  countPendingInvites,
  setInviteUseStatus,
  getUserInviteStats,
  setUserAccountStatus,
  autoFriend,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriends,
  getPendingReceivedRequests,
  getSentPendingRequests,
  findUserByFriendCode,
  assignFriendCode,
  getPendingFriendRequestsCount,
  giftItem,
  countNewGiftedItems,
  markGiftItemSeen,
  listOnMarketplace,
  unlistFromMarketplace,
  buyFromMarketplace,
  getMarketplaceListings,
  getMyMarketplaceListings,
  proposeExchange,
  acceptExchange,
  rejectExchange,
  cancelExchange,
  getExchangesReceived,
  getExchangesSent,
  setOnboardingDone,
  getCodexFeatured,
} = require("../db");
const { requireUser, requireUserJson } = require("../auth");
const { hashPassword, verifyPassword } = require("../passwords");
const { sendMail, emailHtml } = require("../mailer");

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

function parseCollectionTags(raw) {
  return String(raw || "").split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
}
const SEXE_VALUES = ["", "femme", "homme", "autre"];

// Pseudo/sexe/orientation : un seul changement par semaine (voir
// /favoris/identite). L'année de naissance n'est, elle, plus modifiable par
// le profil lui-même du tout (réservée à l'admin, voir routes/admin.js).
const IDENTITY_CHANGE_COOLDOWN_DAYS = 7;
function identityChangeLockedUntil(user) {
  if (!user.identityChangedAt) return null;
  const next = new Date(user.identityChangedAt).getTime() + IDENTITY_CHANGE_COOLDOWN_DAYS * 86400000;
  return next > Date.now() ? new Date(next) : null;
}
function formatFrDate(d) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
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
    const unlocks = getUserUnlocks(req.user.id);
    const lootboxCount = getLootboxCount(req.user.id);
    const partner = req.user.partnerId ? getUserById(req.user.partnerId) : null;
    res.render("favoris", {
      config,
      wikiPages,
      galleryImages,
      bdBooks,
      fantasyPages,
      categories: WIKI_CATEGORIES,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
      unlocks,
      lootboxCount,
      partner,
    });
  }

  function renderIdentite(res, req, extra) {
    const user = getUserById(req.user.id);
    const lockedUntil = identityChangeLockedUntil(user);
    res.render("profil-identite", {
      config,
      user,
      identityLockedUntilLabel: lockedUntil ? formatFrDate(lockedUntil) : null,
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

  // ── Coffre ────────────────────────────────────────────────────────────────
  router.get("/coffre", requireUser, (req, res) => {
    const view = ['images', 'charms', 'themes', 'cartes', 'personnages'].includes(req.query.view) ? req.query.view : null;
    const unlocks   = getUserUnlocks(req.user.id);
    const charms    = getUserUnlockedCharms(req.user.id);
    const userThemes = getUserThemes(req.user.id);
    const shopItems = view === 'images' ? getShopItems(req.user.id) : [];
    const cfg       = getLootboxConfig();
    const cfgBuy    = cfg.buyPrices;
    const userCards = getUserCards(req.user.id);
    const userPersonnageCards = getUserPersonnageCards(req.user.id);
    const coffreUnlocks = unlocks.length;
    const coffreCharms  = charms.filter(c => c.owned).length;
    const coffreThemes  = userThemes.filter(t => t.owned).length;
    res.render("profil-coffre", {
      config,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
      unlocks,
      userJokers: getUserJokers(req.user.id),
      charms,
      shopItems,
      view,
      RARITY_BUY_PRICE,
      RARITY_SELL_PRICE: cfg.sellPrices,
      CHARM_BUY_PRICE: cfgBuy,
      THEME_BUY_PRICE: cfgBuy,
      userThemes,
      userCards,
      userPersonnageCards,
      coffreUnlocks,
      coffreCharms,
      coffreThemes,
      coffreTotal: coffreUnlocks + coffreCharms + coffreThemes,
      friends: getFriends(req.user.id),
      exchangesReceived: getExchangesReceived(req.user.id),
      exchangesSent: getExchangesSent(req.user.id),
      myListings: getMyMarketplaceListings(req.user.id),
      newGiftCount: countNewGiftedItems(req.user.id),
    });
  });

  // ── Classeurs ────────────────────────────────────────────────────────────
  router.get("/classeurs", requireUser, (req, res) => {
    res.render("profil-classeurs", {
      config,
      roleHue: roleHue(req.user),
      classeurs: listClasseursWithProgress(req.user.id),
    });
  });

  router.get("/classeurs/:id", requireUser, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const classeur = id ? getClasseurWithCards(id, req.user.id) : null;
    if (!classeur || !classeur.is_published) return res.redirect("/favoris/classeurs");
    res.render("profil-classeur-detail", { config, roleHue: roleHue(req.user), classeur });
  });

  // Marquer un item reçu en cadeau comme vu (appelé au clic dans le coffre)
  router.post("/coffre/seen/:id", requireUserJson, (req, res) => {
    markGiftItemSeen(req.user.id, Number(req.params.id));
    res.json({ ok: true });
  });

  // Revente d'un ou plusieurs items débloqués
  router.post("/coffre/sell", requireUserJson, express.json(), (req, res) => {
    const { getUserById } = require("../db");
    // Batch : { unlockIds: [1,2,3] }  ou legacy : { unlockId: 1 }
    const ids = Array.isArray(req.body.unlockIds)
      ? req.body.unlockIds.map(n => parseInt(n, 10)).filter(n => !isNaN(n))
      : [parseInt(req.body.unlockId, 10)].filter(n => !isNaN(n));
    if (!ids.length) return res.json({ ok: false, error: 'invalid' });
    let totalCoins = 0;
    for (const unlockId of ids) {
      const result = sellUnlock(req.user.id, unlockId);
      if (result.ok) totalCoins += result.coins;
    }
    const user = getUserById(req.user.id);
    res.json({ ok: true, soldIds: ids, coinsEarned: totalCoins, newBalance: user.coins });
  });

  // Revente d'un ou plusieurs charmes
  router.post("/coffre/sell-charm", requireUserJson, express.json(), (req, res) => {
    const ids = Array.isArray(req.body.unlockIds)
      ? req.body.unlockIds.map(n => parseInt(n, 10)).filter(n => !isNaN(n))
      : [parseInt(req.body.unlockId, 10)].filter(n => !isNaN(n));
    if (!ids.length) return res.json({ ok: false, error: 'invalid' });
    let totalCoins = 0;
    for (const unlockId of ids) {
      const result = sellCharmUnlock(req.user.id, unlockId);
      if (result.ok) totalCoins += result.coins;
    }
    const user = require("../db").getUserById(req.user.id);
    res.json({ ok: true, soldIds: ids, coinsEarned: totalCoins, newBalance: user.coins });
  });

  // Revente d'un ou plusieurs thèmes
  router.post("/coffre/sell-theme", requireUserJson, express.json(), (req, res) => {
    const keys = Array.isArray(req.body.themeKeys)
      ? req.body.themeKeys.map(k => String(k)).filter(Boolean)
      : [String(req.body.themeKey || '')].filter(Boolean);
    if (!keys.length) return res.json({ ok: false, error: 'invalid' });
    let totalCoins = 0;
    for (const key of keys) {
      const result = sellTheme(req.user.id, key);
      if (result.ok) totalCoins += result.coins;
    }
    const user = require("../db").getUserById(req.user.id);
    res.json({ ok: true, soldKeys: keys, coinsEarned: totalCoins, newBalance: user.coins });
  });

  // Achat d'un item depuis la boutique
  router.post("/coffre/buy", requireUserJson, express.json(), (req, res) => {
    const result = buyItem(req.user.id, String(req.body.itemType || 'profile_image'), req.body.refId);
    if (!result.ok) return res.json(result);
    const { getUserById } = require("../db");
    const user = getUserById(req.user.id);
    res.json({ ok: true, rarity: result.rarity, coinsSpent: result.coinsSpent, newBalance: user.coins });
  });

  // Fusion voie A : 3 exemplaires identiques → monte la rareté d'un cran
  router.post("/coffre/fusion/identique", requireUserJson, express.json(), (req, res) => {
    const unlockId = parseInt(req.body.unlockId, 10);
    if (isNaN(unlockId)) return res.json({ ok: false, error: 'invalid_id' });
    const result = fuseImageIdentique(req.user.id, unlockId);
    if (!result.ok) return res.json(result);
    const user = getUserById(req.user.id);
    res.json({ ...result, newCoins: user ? user.coins : null });
  });

  // Fusion voie B : 10 images de même rareté → monte la cible d'un cran
  router.post("/coffre/fusion/rarete", requireUserJson, express.json(), (req, res) => {
    const targetId = parseInt(req.body.targetId, 10);
    const sacrificeIds = Array.isArray(req.body.sacrificeIds)
      ? req.body.sacrificeIds.map(n => parseInt(n, 10)).filter(n => !isNaN(n))
      : [];
    if (isNaN(targetId) || sacrificeIds.length !== 10) return res.json({ ok: false, error: 'invalid_params' });
    res.json(fuseImageRarete(req.user.id, sacrificeIds, targetId));
  });

  // Toggle favori sur un item du coffre
  router.post("/coffre/favorite", requireUserJson, express.json(), (req, res) => {
    const unlockId = parseInt(req.body.unlockId, 10);
    if (isNaN(unlockId)) return res.json({ ok: false });
    res.json(toggleUnlockFavorite(req.user.id, unlockId));
  });

  // Acheter un charme directement
  router.post("/coffre/buy-charm", requireUserJson, express.json(), (req, res) => {
    const result = buyItem(req.user.id, 'charm', req.body.charmId);
    if (!result.ok) return res.json(result);
    const { getUserById } = require("../db");
    const user = getUserById(req.user.id);
    res.json({ ok: true, rarity: result.rarity, coinsSpent: result.coinsSpent, newBalance: user.coins });
  });

  // Acheter un thème directement
  router.post("/coffre/buy-theme", requireUserJson, express.json(), (req, res) => {
    const key = String(req.body.themeKey || '');
    const result = buyTheme(req.user.id, key);
    res.json(result);
  });

  // Choisir une image débloquée comme photo de profil
  router.post("/coffre/set-avatar", requireUserJson, express.json(), (req, res) => {
    const raw = req.body.imageId;
    const imageId = raw === null || raw === undefined ? null : parseInt(raw, 10);
    const ok = setProfileImageId(req.user.id, isNaN(imageId) ? null : imageId);
    res.json({ ok });
  });

  // Choisir le bandeau vertical du profil public (image epic+ uniquement)
  router.post("/coffre/set-banner", requireUserJson, express.json(), (req, res) => {
    const raw = req.body.refId;
    const refId = raw === null || raw === undefined ? null : parseInt(raw, 10);
    res.json(setProfileBanner(req.user.id, isNaN(refId) ? null : refId));
  });

  // Sauvegarde le recadrage de la photo de profil
  router.post("/coffre/set-avatar-crop", requireUserJson, express.json(), (req, res) => {
    const crop = req.body;
    if (!crop || typeof crop !== 'object') return res.json({ ok: false });
    setProfileImageCrop(req.user.id, crop);
    res.json({ ok: true });
  });

  // Applique un thème de couleur
  router.post("/coffre/set-theme", requireUserJson, express.json(), (req, res) => {
    const ok = setActiveTheme(req.user.id, String(req.body.themeKey || ''));
    res.json({ ok });
  });

  // ── Profil public : aperçu + réglages ────────────────────────────────────────
  const WORLD_META_FAV = {
    DL: { name: 'Eau',   tagline: 'Douceur et lien',        hue: 210 },
    DP: { name: 'Air',   tagline: 'Douceur et sensation',   hue: 160 },
    BL: { name: 'Terre', tagline: 'Intensité et lien',      hue: 35  },
    BP: { name: 'Feu',   tagline: 'Intensité et sensation', hue: 15  },
  };
  router.get("/profil-public", requireUser, (req, res) => {
    const notice = req.query.ok ? "Profil public mis à jour." : null;
    const error = req.query.err ? decodeURIComponent(req.query.err) : null;
    const pub = getPublicProfile(req.user.id);
    const coffre = getUserUnlocks(req.user.id);
    // Resolve selected featured images for the preview
    const unlockRefIds = new Set(coffre.map(u => u.refId));
    const featuredImages = pub.featuredImageIds
      .filter(id => unlockRefIds.has(id))
      .map(id => getGalleryImage(id))
      .filter(Boolean)
      .slice(0, 5);
    // Wiki favorites
    const _allWikiFavs = listFavoriteRows(req.user.id).filter(r => r.item_type === 'wiki');
    const wikiFavTotal = _allWikiFavs.length;
    const wikiFavPages = _allWikiFavs.slice(0, 12)
      .map(r => getWikiPage(r.item_id))
      .filter(p => p && !p.hidden);
    const coffreStats = getUserCoffreStats(req.user.id);
    const streak = getUserStreak(req.user.id);
    const wikiStatusItems = getUserWikiStatusList(req.user.id);
    // Theme
    const themeDef = THEME_DEFINITIONS.find(t => t.key === (req.user.activeTheme || 'default')) || THEME_DEFINITIONS[0];
    // Quiz archetype
    let quizResult = null;
    try {
      const quizType = getProfilQuizType('principal');
      if (quizType) {
        const attempts = listProfilQuizAttempts(quizType.id, req.user.id);
        const done = attempts.find(a => a.completed);
        if (done) {
          const archetypes = getProfilQuizArchetypes(quizType.id);
          const archetype = archetypes.find(a => a.code === done.result_code) || null;
          const worldKey = (done.result_code || '').slice(0, 2);
          const wm = WORLD_META_FAV[worldKey] || {};
          quizResult = {
            code: done.result_code,
            position: done.result_position,
            archetypeName: done.result_archetype || (archetype && archetype.name) || done.result_code,
            archetypeDesc: archetype ? archetype.description : '',
            world: wm.name || '',
            worldHue: wm.hue || 220,
            worldTagline: wm.tagline || '',
          };
        }
      }
    } catch (_) {}
    const topRatedWiki = pub.showTopRatings ? getTopRatedWikiItems(req.user.id) : [];
    res.render("profil-public", {
      config,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
      notice,
      error,
      pub,
      coffre,
      featuredImages,
      wikiFavPages,
      wikiFavTotal,
      topRatedWiki,
      coffreStats,
      streak,
      wikiStatusItems,
      themeDef,
      quizResult,
      currentUser: req.user,
    });
  });

  router.post("/profil-public", requireUser, (req, res) => {
    try {
      const showSexe = req.body.show_sexe === "1";
      const showWikiFavorites = req.body.show_wiki_favorites === "1";
      const showArchetype = req.body.show_archetype === "1";
      const showStreak = req.body.show_streak === "1";
      const showCoffre = req.body.show_coffre === "1";
      const showWikiStatus = req.body.show_wiki_status === "1";
      const showTopRatings = req.body.show_top_ratings === "1";
      // featured_image_ids comes as comma-separated ref IDs
      const rawIds = String(req.body.featured_image_ids || "")
        .split(",")
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
      // Validate: each ID must be an unlock the user actually owns
      const coffre = getUserUnlocks(req.user.id);
      const ownedRefIds = new Set(coffre.map(u => u.refId));
      const featuredImageIds = rawIds.filter(id => ownedRefIds.has(id)).slice(0, 3);
      setPublicProfile(req.user.id, { showSexe, showWikiFavorites, showArchetype, showStreak, showCoffre, showWikiStatus, showTopRatings, featuredImageIds });
      res.redirect("/favoris/profil-public?ok=1");
    } catch (err) {
      console.error("[profil-public POST]", err);
      res.redirect("/favoris/profil-public?err=" + encodeURIComponent("Erreur lors de la sauvegarde."));
    }
  });

  router.get("/parametres", requireUser, (req, res) => {
    const notice = req.query.reset ? "Contenu réinitialisé : notes, commentaires et favoris supprimés." : null;
    const error = req.query.err ? decodeURIComponent(req.query.err) : null;
    res.render("profil-parametres", { config, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user), notice, error });
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
    const { orientation, ultraMode, irrealisteMode, shareNotesWithAdmin, historyRetention, hideInviteCta, newsletter, profilePublic, notifyRecapEmail } = req.body;
    updateUserSettings(req.user.id, { orientation, ultraMode, irrealisteMode, shareNotesWithAdmin, historyRetention, hideInviteCta, newsletter, profilePublic, notifyRecapEmail });
    res.json({ ok: true });
  });

  // ── Popup de bienvenue (première connexion) ──────────────────────────────
  router.post("/bienvenue", requireUserJson, (req, res) => {
    const { ultraMode, shareNotesWithAdmin, profilePublic } = req.body;
    updateUserSettings(req.user.id, { ultraMode, shareNotesWithAdmin, profilePublic });
    setOnboardingDone(req.user.id);
    res.json({ ok: true });
  });

  // ── Réinitialiser le compte : vide le contenu personnel (notes/étoiles/
  // j'adore/intéressé/à lire plus tard/masqué, commentaires, favoris) sans
  // toucher à l'identité ni au mot de passe. Voir resetUserContent. ──
  router.post("/parametres/reinitialiser", requireUser, (req, res) => {
    resetUserContent(req.user.id);
    if (req.user.email) {
      sendMail({
        to: req.user.email,
        subject: "Contenu réinitialisé — Confidences",
        text: "Bonjour " + req.user.displayName + ",\n\nLe contenu personnel de votre profil (notes, étoiles, j'adore, contenus masqués, commentaires et favoris) vient d'être réinitialisé.\nSi ce n'est pas vous, contactez la personne qui gère le site.",
        html: emailHtml({
          title: "Contenu réinitialisé",
          body: "<p>Bonjour <strong>" + req.user.displayName + "</strong>,</p><p>Le contenu personnel de votre profil (notes, &eacute;toiles, j&rsquo;adore, contenus masqu&eacute;s, commentaires et favoris) vient d&rsquo;&ecirc;tre r&eacute;initialis&eacute;.</p><p style=\"color:#6b7280\">Si ce n&rsquo;est pas vous, contactez la personne qui g&egrave;re le site au plus vite.</p>",
        }),
      });
    }
    res.redirect("/favoris/parametres?reset=1");
  });

  // ── Supprimer le compte : self-service, voir deleteUser (aussi utilisé
  // par l'admin sur un profil tiers). Bloqué si c'est le dernier compte
  // admin, pour ne jamais se retrouver sans accès à /admin. ──
  router.post("/parametres/supprimer", requireUser, (req, res) => {
    if (req.user.isAdmin) {
      const adminCount = listUsers().filter((u) => u.isAdmin).length;
      if (adminCount <= 1) {
        return res.redirect("/favoris/parametres?err=" + encodeURIComponent("Vous êtes le seul compte admin : suppression impossible."));
      }
    }
    const userId = req.user.id;
    const email = req.user.email;
    const displayName = req.user.displayName;
    deleteUser(userId);
    if (email) {
      sendMail({
        to: email,
        subject: "Compte supprimé — Confidences",
        text: "Bonjour " + displayName + ",\n\nVotre compte a été définitivement supprimé à votre demande.",
        html: emailHtml({
          title: "Compte supprimé",
          body: "<p>Bonjour <strong>" + displayName + "</strong>,</p><p>Votre compte a &eacute;t&eacute; d&eacute;finitivement supprim&eacute; &agrave; votre demande.</p>",
        }),
      });
    }
    req.session.destroy(() => res.redirect("/"));
  });

  router.post("/identite", requireUser, (req, res) => {
    const user = getUserById(req.user.id);
    const displayName = String(req.body.display_name || "").trim();
    if (!displayName) return renderIdentite(res, req, { error: "Le pseudo est obligatoire." });

    const sexeRaw = String(req.body.sexe || "");
    const sexe = SEXE_VALUES.includes(sexeRaw) ? sexeRaw : "";
    const orientation = String(req.body.orientation || "");

    // Pseudo / sexe / orientation : un seul changement par semaine. Si le
    // quota est pris, on ignore ces trois champs (on garde les valeurs
    // actuelles) plutôt que de bloquer tout le formulaire — le mail, lui,
    // reste modifiable à tout moment.
    const identityChanged = displayName !== user.displayName || sexe !== user.sexe || orientation !== (user.orientation || "");
    const lockedUntil = identityChangeLockedUntil(user);
    if (identityChanged && lockedUntil) {
      return renderIdentite(res, req, {
        error: "Pseudo, sexe et orientation : un seul changement par semaine. Prochain changement possible le " + formatFrDate(lockedUntil) + ".",
      });
    }

    const email = String(req.body.email || "").trim().slice(0, 254);
    if (email && !email.includes("@")) return renderIdentite(res, req, { error: "Adresse mail invalide." });
    const emailChanged = email !== (user.email || "");
    if (emailChanged) {
      const emailPassword = String(req.body.email_password || "");
      const creds = getUserCredentials(req.user.username);
      if (!emailPassword || !creds || !verifyPassword(emailPassword, creds.password_hash)) {
        return renderIdentite(res, req, { error: "Mot de passe incorrect : requis pour changer d'adresse mail." });
      }
      if (email && getUserByEmail(email, req.user.id)) {
        return renderIdentite(res, req, { error: "Cette adresse mail est déjà utilisée par un autre profil." });
      }
    }

    // Année de naissance : modifiable une seule fois si pas encore renseignée.
    // Une fois définie, seul l'admin peut la changer.
    let birthYear = user.birthYear;
    if (!birthYear && req.body.birth_year) {
      const parsed = Number(req.body.birth_year);
      if (Number.isInteger(parsed) && parsed >= 1930 && parsed <= new Date().getFullYear() - 16) {
        birthYear = parsed;
      }
    }
    const nom = String(req.body.nom || "").trim().slice(0, 100);
    updateOwnProfile(req.user.id, { displayName, email, sexe, birthYear, nom });
    updateUserSettings(req.user.id, { orientation });
    if (identityChanged) touchIdentityChange(req.user.id);
    if (emailChanged && user.email) {
      sendMail({
        to: user.email,
        subject: "Adresse mail modifiée — Confidences",
        text: "Bonjour " + user.displayName + ",\n\nL'adresse mail de votre profil vient d'être changée.\nSi ce n'est pas vous, contactez la personne qui gère le site au plus vite.",
        html: emailHtml({
          title: "Adresse mail modifiée",
          body: "<p>Bonjour <strong>" + user.displayName + "</strong>,</p><p>L&rsquo;adresse mail de votre profil vient d&rsquo;&ecirc;tre modifi&eacute;e.</p><p style=\"color:#6b7280\">Si ce n&rsquo;est pas vous, contactez la personne qui g&egrave;re le site au plus vite.</p>",
        }),
      });
    }
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
    // Déconnecte les autres sessions restées ouvertes ailleurs avec
    // l'ancien mot de passe (jamais la session en cours), et prévient par
    // mail si une adresse est renseignée.
    destroyAllSessionsForUser(req.user.id, req.sessionID);
    logSecurityEvent(req.user.id, "password_changed", req.ip, req.headers["user-agent"] || "");
    if (req.user.email) {
      sendMail({
        to: req.user.email,
        subject: "Mot de passe modifié — Confidences",
        text: "Bonjour " + req.user.displayName + ",\n\nVotre mot de passe a été modifié.\nSi ce n'est pas vous, contactez la personne qui gère le site au plus vite.",
        html: emailHtml({
          title: "Mot de passe modifié",
          body: "<p>Bonjour <strong>" + req.user.displayName + "</strong>,</p><p>Votre mot de passe vient d&rsquo;&ecirc;tre modifi&eacute;.</p><p style=\"color:#6b7280\">Si ce n&rsquo;est pas vous, contactez la personne qui g&egrave;re le site au plus vite.</p>",
        }),
      });
    }
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
    // J'adore d'abord (mis en avant comme sur les pages Images/BD — pour le
    // codex, flame et favori sont la même chose, voir /wiki/:id/react), puis
    // par note décroissante.
    all.sort((a, b) => {
      if (a.flame !== b.flame) return a.flame ? -1 : 1;
      return b.rating - a.rating;
    });
    const tagSet = new Set();
    all.forEach((p) => (p.tags || []).forEach((t) => tagSet.add(t)));
    const allTags = [...tagSet].sort();
    const featuredPageIds = getCodexFeatured(req.user.id);
    const allPages = featuredPageIds.length
      ? mergeUserReactions(listWikiPages(), req.user.id, "wiki").filter(p => featuredPageIds.includes(p.id))
      : [];
    res.render("profil-notes-wiki", { config, pages: all, allTags, categories: WIKI_CATEGORIES, featuredPages: allPages, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
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
    const bdPages = listHiddenBdPages(req.user.id);
    res.render("profil-masques", {
      config, wikiPages, galleryImages, bdBooks, bdPages,
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

  // ── Collections personnelles (Galerie, images uniquement) — strictement
  // privées (voir listCollections/getCollection). Le bouton "Ajouter à une
  // collection" vit dans la lightbox galerie (voir public/gallery.js), ces
  // routes sont son backend + la sous-page "Mes collections" du profil.
  router.get("/collections", requireUser, (req, res) => {
    const collections = listCollections(req.user.id);
    res.render("profil-collections", { config, collections, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
  });

  router.get("/collections/for-image/:galleryId", requireUserJson, (req, res) => {
    const galleryId = Number(req.params.galleryId);
    if (!Number.isInteger(galleryId)) return res.status(400).json({ ok: false });
    res.json({ ok: true, collections: listCollectionsForImagePopup(req.user.id, galleryId) });
  });

  router.get("/collections/:id", requireUser, (req, res) => {
    const id = Number(req.params.id);
    const collection = Number.isInteger(id) ? getCollection(id) : null;
    if (!collection || collection.userId !== req.user.id) return res.redirect("/favoris/collections");
    const items = getCollectionImages(id);
    res.render("profil-collection-detail", { config, collection, items, roleHue: roleHue(req.user), notesCounts: notesCounts(req.user) });
  });

  router.post("/collections", requireUserJson, (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ ok: false, error: "Titre requis." });
    const description = String(req.body.description || "").trim();
    const tags = parseCollectionTags(req.body.tags);
    const id = createCollection(req.user.id, { title, description, tags });
    const galleryId = Number(req.body.galleryId);
    if (Number.isInteger(galleryId) && galleryId > 0) addToCollection(id, galleryId);
    res.json({ ok: true, id });
  });

  router.post("/collections/:id/items", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    const collection = Number.isInteger(id) ? getCollection(id) : null;
    if (!collection || collection.userId !== req.user.id) return res.status(403).json({ ok: false });
    const galleryId = Number(req.body.galleryId);
    if (!Number.isInteger(galleryId)) return res.status(400).json({ ok: false });
    if (req.body.action === "remove") removeFromCollection(id, galleryId);
    else addToCollection(id, galleryId);
    res.json({ ok: true });
  });

  router.post("/collections/:id", requireUser, (req, res) => {
    const id = Number(req.params.id);
    const collection = Number.isInteger(id) ? getCollection(id) : null;
    if (!collection || collection.userId !== req.user.id) return res.redirect("/favoris/collections");
    const title = String(req.body.title || "").trim() || collection.title;
    const description = String(req.body.description || "").trim();
    const tags = parseCollectionTags(req.body.tags);
    updateCollection(id, { title, description, tags });
    res.redirect("/favoris/collections/" + id);
  });

  router.post("/collections/:id/delete", requireUser, (req, res) => {
    const id = Number(req.params.id);
    const collection = Number.isInteger(id) ? getCollection(id) : null;
    if (collection && collection.userId === req.user.id) deleteCollection(id);
    res.redirect("/favoris/collections");
  });

  // ── Invitations (redirige vers /amis fusionné) ──────────────────────────────
  router.get("/invitations", requireUser, (req, res) => res.redirect("/favoris/amis"));

  function buildAmisThumb(user) {
    if (!user.profile_image_id) return null;
    const img = getGalleryImage(user.profile_image_id);
    if (!img) return null;
    const fp = (img.imagePaths && img.imagePaths[0]) || img.filename || null;
    return fp ? thumbUrl(fp) : null;
  }

  function renderAmis(req, res, extra = {}) {
    const friends  = getFriends(req.user.id).map(f => {
      const thumb = buildAmisThumb(f);
      const td = THEME_DEFINITIONS.find(t => t.key === (f.active_theme || 'default'));
      const th = td && td.hue;
      const ts = (td && td.sat) || 55;
      const isBlanc = td && td.key === 'blanc';
      return { ...f, thumb,
        themeBg:     th ? `hsl(${th},${ts}%,16%)` : isBlanc ? 'hsl(220,8%,89%)' : null,
        themeBorder: th ? `hsl(${th},${ts}%,34%)` : isBlanc ? 'hsl(220,8%,72%)' : null,
        themeLight:  isBlanc,
      };
    });
    const received = getPendingReceivedRequests(req.user.id).map(r => ({ ...r, thumb: buildAmisThumb(r) }));
    const sent     = getSentPendingRequests(req.user.id).map(s => ({ ...s, thumb: buildAmisThumb(s) }));
    const pendingInvites = listPendingInvites(req.user.id);
    const inviteStats    = getUserInviteStats(req.user.id);
    let { friendCode } = req.user;
    if (!friendCode) friendCode = assignFriendCode(req.user.id);
    res.render("favoris-amis", {
      config,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
      currentPath: "/favoris/amis",
      friends, received, sent, friendCode,
      pendingInvites, inviteStats,
      searchResult: null, searchQuery: null, searchError: null,
      ...extra,
    });
  }

  router.get("/amis", requireUser, (req, res) => renderAmis(req, res));

  router.post("/amis/demande", requireUser, (req, res) => {
    const query = String(req.body.code || "").trim();
    let searchResult = null, searchError = null;

    const target = findUserByFriendCode(query);
    if (!target) {
      searchError = "Utilisateur introuvable. V\u00e9rifiez le code.";
    } else if (target.id === req.user.id) {
      searchError = "C'est vous.";
    } else {
      const result = sendFriendRequest(req.user.id, target.id);
      if (result.error === 'already_friends') searchError = "Vous \u00eates d\u00e9j\u00e0 amis.";
      else if (result.error === 'already_sent') searchError = "Demande d\u00e9j\u00e0 envoy\u00e9e.";
      else {
        searchResult = { target, autoAccepted: !!result.autoAccepted };
        // Email à la cible si pas d'auto-accept
        if (!result.autoAccepted && target.email) {
          const siteUrl = (req.secure ? "https" : "http") + "://" + req.get("host");
          sendMail({
            to: target.email,
            subject: req.user.displayName + " vous a envoyé une demande d'ami — Confidences",
            text: `Bonjour ${target.displayName},\n\n${req.user.displayName} vous a envoyé une demande d'ami sur Confidences.\nRendez-vous sur ${siteUrl}/favoris/amis pour accepter ou refuser.`,
            html: emailHtml({
              title: "Demande d\u2019ami",
              body: `<p>Bonjour <strong>${target.displayName}</strong>,</p><p><strong>${req.user.displayName}</strong> vous a envoy&eacute; une demande d&rsquo;ami.</p>`,
              cta: "Voir la demande",
              ctaUrl: siteUrl + "/favoris/amis",
              siteUrl,
            }),
          });
        }
      }
    }
    renderAmis(req, res, { searchResult, searchQuery: query, searchError });
  });

  router.post("/amis/:friendId/accepter", requireUser, (req, res) => {
    const friendId = parseInt(req.params.friendId, 10);
    if (Number.isInteger(friendId)) {
      acceptFriendRequest(req.user.id, friendId);
      // Email à celui qui avait envoyé la demande
      const requester = getUserById(friendId);
      if (requester && requester.email) {
        const siteUrl = (req.secure ? "https" : "http") + "://" + req.get("host");
        sendMail({
          to: requester.email,
          subject: req.user.displayName + " a accept\u00e9 votre demande d\u2019ami \u2014 Confidences",
          text: `Bonjour ${requester.displayName},\n\n${req.user.displayName} a accepté votre demande d'ami. Vous êtes maintenant amis.\n${siteUrl}/favoris/amis`,
          html: emailHtml({
            title: "Demande accept\u00e9e",
            body: `<p>Bonjour <strong>${requester.displayName}</strong>,</p><p><strong>${req.user.displayName}</strong> a accept&eacute; votre demande d&rsquo;ami. Vous &ecirc;tes maintenant amis.</p>`,
            cta: "Voir mes amis",
            ctaUrl: siteUrl + "/favoris/amis",
            siteUrl,
          }),
        });
      }
    }
    res.redirect("/favoris/amis");
  });

  router.post("/amis/:friendId/refuser", requireUser, (req, res) => {
    const friendId = parseInt(req.params.friendId, 10);
    if (Number.isInteger(friendId)) rejectFriendRequest(req.user.id, friendId);
    res.redirect("/favoris/amis");
  });

  router.post("/amis/:friendId/supprimer", requireUser, (req, res) => {
    const friendId = parseInt(req.params.friendId, 10);
    if (Number.isInteger(friendId)) removeFriend(req.user.id, friendId);
    res.redirect("/favoris/amis");
  });

  router.post("/invitations/:id/approve", requireUser, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.redirect("/favoris/invitations");
    const rows = listPendingInvites(req.user.id);
    const inv = rows.find(r => r.id === id);
    if (inv) {
      setInviteUseStatus(id, "approved");
      setUserAccountStatus(inv.invitee_id, "actif");
      autoFriend(req.user.id, inv.invitee_id);
      // Email au candidat accepté
      const invitee = getUserById(inv.invitee_id);
      if (invitee && invitee.email) {
        const siteUrl = (req.secure ? "https" : "http") + "://" + req.get("host");
        sendMail({
          to: invitee.email,
          subject: "Votre accès est confirmé — Confidences",
          text: `Bonjour ${invitee.displayName},\n\nVotre candidature a été acceptée. Votre compte est maintenant actif.\nPseudo : ${invitee.displayName}\n\n${siteUrl}`,
          html: emailHtml({
            title: "Accès confirmé",
            body: `<p>Bonjour <strong>${invitee.displayName}</strong>,</p><p>Votre candidature a &eacute;t&eacute; accept&eacute;e. Votre compte est maintenant actif.</p><p>Pseudo&nbsp;: <strong>${invitee.displayName}</strong></p>`,
            cta: "Accéder au site",
            ctaUrl: siteUrl,
            siteUrl,
          }),
        });
      }
    }
    res.redirect("/favoris/invitations");
  });

  router.post("/invitations/:id/refuse", requireUser, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.redirect("/favoris/invitations");
    const rows = listPendingInvites(req.user.id);
    const inv = rows.find(r => r.id === id);
    if (inv) {
      setInviteUseStatus(id, "refused");
      setUserAccountStatus(inv.invitee_id, "bloque");
      // Email au candidat refusé
      const invitee = getUserById(inv.invitee_id);
      if (invitee && invitee.email) {
        const siteUrl = (req.secure ? "https" : "http") + "://" + req.get("host");
        sendMail({
          to: invitee.email,
          subject: "Candidature non retenue — Confidences",
          text: `Bonjour ${invitee.displayName},\n\nVotre candidature n'a pas été retenue. Si vous pensez qu'il s'agit d'une erreur, prenez contact directement avec la personne qui vous a invité.`,
          html: emailHtml({
            title: "Candidature non retenue",
            body: `<p>Bonjour <strong>${invitee.displayName}</strong>,</p><p>Votre candidature n&rsquo;a pas &eacute;t&eacute; retenue.</p><p style="color:#6b7280">Si vous pensez qu&rsquo;il s&rsquo;agit d&rsquo;une erreur, prenez contact directement avec la personne qui vous a invit&eacute;.</p>`,
            siteUrl,
          }),
        });
      }
    }
    res.redirect("/favoris/invitations");
  });

  // ── Cadeau ──────────────────────────────────────────────────────────────
  router.post("/coffre/gift", requireUserJson, (req, res) => {
    const unlockId = parseInt(req.body.unlockId, 10);
    const friendId = parseInt(req.body.friendId, 10);
    if (!unlockId || !friendId) return res.json({ ok: false, error: 'invalid' });
    if (friendId === req.user.id) return res.json({ ok: false, error: 'self' });
    const result = giftItem(req.user.id, unlockId, friendId);
    res.json(result);
  });

  // ── Place du marché ─────────────────────────────────────────────────────
  router.post("/coffre/marche/list", requireUserJson, (req, res) => {
    const unlockId = parseInt(req.body.unlockId, 10);
    if (!unlockId) return res.json({ ok: false, error: 'invalid' });
    const result = listOnMarketplace(req.user.id, unlockId);
    res.json(result);
  });

  router.post("/coffre/marche/unlist/:listingId", requireUserJson, (req, res) => {
    const listingId = parseInt(req.params.listingId, 10);
    if (!listingId) return res.json({ ok: false, error: 'invalid' });
    const result = unlistFromMarketplace(req.user.id, listingId);
    res.json(result);
  });

  router.get("/marche", requireUser, (req, res) => {
    const rarity = ['common','rare','epic','legendary','mythic'].includes(req.query.rarity) ? req.query.rarity : null;
    const listings = getMarketplaceListings({ excludeUserId: req.user.id, rarity });
    const myListings = getMyMarketplaceListings(req.user.id);
    res.render("marche", {
      config,
      roleHue: roleHue(req.user),
      notesCounts: notesCounts(req.user),
      currentPath: '/favoris/marche',
      listings,
      myListings,
      rarity,
      RARITY_SELL_PRICE,
    });
  });

  router.post("/marche/:listingId/buy", requireUserJson, (req, res) => {
    const listingId = parseInt(req.params.listingId, 10);
    if (!listingId) return res.json({ ok: false, error: 'invalid' });
    const result = buyFromMarketplace(req.user.id, listingId);
    const { getUserById } = require('../db');
    const newBalance = result.ok ? (getUserById(req.user.id) || {}).coins || 0 : 0;
    res.json({ ...result, newBalance });
  });

  // ── Échanges ────────────────────────────────────────────────────────────
  router.post("/coffre/exchange/propose", requireUserJson, (req, res) => {
    const unlockId  = parseInt(req.body.unlockId, 10);
    const toUserId  = parseInt(req.body.toUserId, 10);
    const wantType  = req.body.wantType === 'item' ? 'item' : 'coins';
    const wantCoins = parseInt(req.body.wantCoins, 10) || 0;
    if (!unlockId || !toUserId) return res.json({ ok: false, error: 'invalid' });
    const result = proposeExchange(req.user.id, unlockId, toUserId, wantType, wantCoins);
    res.json(result);
  });

  router.post("/coffre/exchange/:id/accept", requireUserJson, (req, res) => {
    const proposalId    = parseInt(req.params.id, 10);
    const offerUnlockId = req.body.offerUnlockId ? parseInt(req.body.offerUnlockId, 10) : null;
    if (!proposalId) return res.json({ ok: false, error: 'invalid' });
    const result = acceptExchange(req.user.id, proposalId, offerUnlockId);
    res.json(result);
  });

  router.post("/coffre/exchange/:id/reject", requireUserJson, (req, res) => {
    const proposalId = parseInt(req.params.id, 10);
    if (!proposalId) return res.json({ ok: false, error: 'invalid' });
    res.json(rejectExchange(req.user.id, proposalId));
  });

  router.post("/coffre/exchange/:id/cancel", requireUserJson, (req, res) => {
    const proposalId = parseInt(req.params.id, 10);
    if (!proposalId) return res.json({ ok: false, error: 'invalid' });
    res.json(cancelExchange(req.user.id, proposalId));
  });

  return router;
}

module.exports = buildFavoritesRouter;
