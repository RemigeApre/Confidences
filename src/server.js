require("dotenv").config();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const express = require("express");
const session = require("express-session");
const compression = require("compression");

const buildQuizRouter = require("./routes/quiz");
const buildAdminRouter = require("./routes/admin");
const buildLinksRouter = require("./routes/links");
const buildWikiRouter = require("./routes/wiki");
const buildGalleryRouter = require("./routes/gallery");
const buildBdRouter = require("./routes/bd");
const buildFavoritesRouter = require("./routes/favorites");
const buildAccountRouter = require("./routes/account");
const { attachUser } = require("./auth");
const {
  db, getAllTagMeta, setTagType, createStandaloneTag, renameTagEverywhere,
  listWikiPages, listGalleryImages, listBdBooks, recordActivityPing,
  listBlacklistedTags, addBlacklistedTag, removeBlacklistedTag,
} = require("./db");
const { thumbUrl, backfillThumbs } = require("./thumbs");
const { buildTagRegistry } = require("./tagRegistry");

// Store de sessions SQLite : survit aux redemarrages contrairement au
// memory store par defaut. Implémenté directement avec better-sqlite3
// sans dépendance supplémentaire.
class SqliteSessionStore extends session.Store {
  constructor(database) {
    super();
    this._db = database;
    this._db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid  TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      exp  INTEGER NOT NULL
    )`);
    // Nettoyage des sessions expirées toutes les heures
    setInterval(() => {
      this._db.prepare("DELETE FROM sessions WHERE exp < ?").run(Date.now());
    }, 60 * 60 * 1000).unref();
  }
  get(sid, cb) {
    const row = this._db.prepare("SELECT sess, exp FROM sessions WHERE sid = ?").get(sid);
    if (!row || row.exp < Date.now()) return cb(null, null);
    try { cb(null, JSON.parse(row.sess)); } catch { cb(null, null); }
  }
  set(sid, sess, cb) {
    const exp = sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + 1000 * 60 * 60 * 24 * 90;
    this._db.prepare(
      "INSERT OR REPLACE INTO sessions (sid, sess, exp) VALUES (?, ?, ?)"
    ).run(sid, JSON.stringify(sess), exp);
    if (cb) cb(null);
  }
  destroy(sid, cb) {
    this._db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
    if (cb) cb(null);
  }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "docs", "questions.json"), "utf8")
);

const app = express();
const port = process.env.PORT || 3000;

// Source unique de verite pour savoir si le site tourne en HTTPS : le
// cookie de session doit etre "secure" si et seulement si le serveur sert
// reellement du HTTPS. Aucun flag manuel a part qui pourrait se
// desynchroniser (c'est exactement ce qui causait la boucle de connexion).
const certPath = process.env.TLS_CERT_PATH;
const keyPath = process.env.TLS_KEY_PATH;
const usingHttps = Boolean(
  certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)
);

if (certPath && keyPath && !usingHttps) {
  console.warn(
    `ATTENTION: TLS_CERT_PATH/TLS_KEY_PATH sont definis dans .env mais les fichiers sont introuvables (${certPath}, ${keyPath}) -> demarrage en HTTP. Si tu comptais servir du HTTPS, regenere les certificats (voir DEPLOY.md).`
  );
}

// Pas de "trust proxy" ici : ce deploiement expose l'app directement
// (IP:port, sans nginx devant). L'activer sans proxy reel permettrait a
// n'importe qui de falsifier son IP via un en-tete et de contourner le
// ralentissement anti-brute-force. A reactiver seulement si un reverse
// proxy (nginx, etc.) est effectivement place devant l'app.
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

// Compression gzip/brotli des reponses texte (HTML/CSS/JS/JSON) : aucune
// compression n'etait active avant (ni ici, ni dans le nginx.example.conf
// fourni), donc tout partait "brut" sur le reseau.
app.use(compression());

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Version des assets = hash du contenu reel de public/, calcule une seule
// fois au demarrage. Avant, c'etait `Date.now()` : ca cassait le cache a
// CHAQUE redemarrage/redeploiement, meme quand style.css/*.js n'avaient pas
// change. Avec un hash de contenu, le cache navigateur (1 an, voir maxAge
// ci-dessous) ne saute que quand un fichier a reellement change.
function computeAssetVersion(dir) {
  try {
    const hash = crypto.createHash("sha1");
    fs.readdirSync(dir).sort().forEach((f) => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isFile()) hash.update(fs.readFileSync(full));
    });
    return hash.digest("hex").slice(0, 10);
  } catch (_) {
    return String(Date.now());
  }
}
const ASSET_VERSION = computeAssetVersion(path.join(__dirname, "..", "public"));
app.use((req, res, next) => {
  res.locals.assetVersion = ASSET_VERSION;
  next();
});

app.use(express.static(path.join(__dirname, "..", "public"), { maxAge: "1y", immutable: true }));

// Le contenu est personnel : jamais d'indexation, meme sur les pages
// publiques (wiki texte). Complete la balise <meta name="robots"> et
// public/robots.txt (ceinture et bretelles).
app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});

app.use(
  session({
    store: new SqliteSessionStore(db),
    secret: process.env.SESSION_SECRET || "change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: usingHttps,
      maxAge: 1000 * 60 * 60 * 24 * 90,
    },
  })
);

app.use(attachUser);

// Ping de présence discret (throttlé, voir recordActivityPing dans db.js) :
// contrairement à connection_logs (uniquement à la saisie du mot de passe),
// permet de savoir quand un profil est simplement en train de naviguer.
app.use((req, res, next) => {
  if (req.user) recordActivityPing(req.user.id);
  next();
});

// Expose le chemin courant pour que le lien "Se connecter" dans la nav
// puisse y revenir après connexion (paramètre ?next=).
// Expose aussi les catégories wiki pour le menu déroulant desktop.
app.use((req, res, next) => {
  res.locals.currentPath = req.originalUrl;
  res.locals.wikiCategories = buildWikiRouter.CATEGORIES || [];
  next();
});

// Le wiki (texte) est desormais public : plus de portail de mot de passe
// unique devant tout le site. Les images, elles, restent un contenu prive
// (wiki/galerie/BD) : jamais servies sans etre connecte a un profil.
const uploadsDir = path.join(__dirname, "..", "data", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
// Chaque fichier uploade a un nom unique (horodatage + aleatoire, voir les
// routes wiki/galerie/BD) et n'est jamais modifie sur place : un cache tres
// long est donc sans risque (une URL donnee sert toujours le meme contenu).
app.use(
  "/uploads",
  (req, res, next) => (req.user ? next() : res.status(403).end()),
  express.static(uploadsDir, { maxAge: "1y", immutable: true })
);

// Genere en tache de fond les vignettes manquantes pour les images deja
// uploadees avant l'ajout de cette fonctionnalite (voir src/thumbs.js).
// Volontairement non attendu : ne doit jamais retarder le demarrage.
backfillThumbs("wiki");
backfillThumbs("gallery");
backfillThumbs("bd");

app.use((req, res, next) => {
  res.locals.thumbUrl = thumbUrl;
  next();
});

// Blacklist personnelle de tags (voir /tags/masques) : exposee au client
// (window.TAG_BLACKLIST, voir partials/head.ejs) pour masquer partout tout
// contenu portant un de ces tags. Toujours calculee (pas de raccourci
// /favoris comme tagRegistry ci-dessous) car les sous-pages notes en ont
// aussi besoin pour filtrer leurs propres cartes.
app.use((req, res, next) => {
  res.locals.tagBlacklist = req.user ? listBlacklistedTags(req.user.id).map((r) => r.tag) : [];
  next();
});

// Classification de chaque tag (couleur/comportement du badge, voir
// src/tagRegistry.js) : calculee une fois par requete, exposee a toutes les
// vues (utilisee par tags.ejs/wiki-detail.ejs) et au client (window.TAG_REGISTRY,
// voir partials/head.ejs) pour colorer les badges construits en JS
// (galerie/BD). Le contenu prive (galerie/BD) n'entre dans le calcul que
// pour un visiteur connecte, coherent avec le reste du site.
app.use((req, res, next) => {
  // Le profil (/favoris et ses sous-pages) n'affiche jamais de badge de tag :
  // pas la peine de scanner wiki/galerie/BD à chaque chargement pour rien.
  // head.ejs retombe déjà sur {} si tagRegistry n'est pas défini.
  if (req.path === "/favoris" || req.path.startsWith("/favoris/")) {
    return next();
  }
  try {
    res.locals.tagRegistry = buildTagRegistry({
      wikiPages: listWikiPages(),
      galleryImages: req.user ? listGalleryImages() : [],
      bdBooks: req.user ? listBdBooks() : [],
      tagMeta: getAllTagMeta(),
    });
  } catch (_) {
    res.locals.tagRegistry = {};
  }
  next();
});

// ── Recherche globale multi-section ─────────────────────────────────────────
app.get("/api/search", function (req, res) {
  var q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ results: {} });
  var ql = q.toLowerCase();
  var pat = "%" + ql + "%";
  var results = {};

  // Wiki — public (texte accessible sans connexion)
  try {
    var wikiRows = db
      .prepare(
        "SELECT id, title FROM wiki_pages WHERE lower(title) LIKE ? OR lower(content) LIKE ? OR lower(tags) LIKE ? OR lower(meta) LIKE ? LIMIT 6"
      )
      .all(pat, pat, pat, pat);
    if (wikiRows.length)
      results.wiki = wikiRows.map(function (r) {
        return { title: r.title, url: "/wiki/" + r.id };
      });
  } catch (_) {}

  // Contenus privés — connexion requise
  if (req.user) {
    try {
      var galRows = db
        .prepare(
          "SELECT id, title FROM gallery_images WHERE lower(title) LIKE ? OR lower(notes) LIKE ? OR lower(tags) LIKE ? LIMIT 5"
        )
        .all(pat, pat, pat);
      if (galRows.length)
        results.galerie = galRows.map(function (r) {
          return { title: r.title || "Image #" + r.id, url: "/galerie" };
        });
    } catch (_) {}

    try {
      var bdRows = db
        .prepare(
          "SELECT id, title FROM bd_books WHERE lower(title) LIKE ? OR lower(description) LIKE ? OR lower(tags) LIKE ? LIMIT 5"
        )
        .all(pat, pat, pat);
      if (bdRows.length)
        results.bd = bdRows.map(function (r) {
          return { title: r.title, url: "/bd" };
        });
    } catch (_) {}

    try {
      var linkRows = db
        .prepare(
          "SELECT id, title FROM links WHERE lower(title) LIKE ? OR lower(description) LIKE ? LIMIT 5"
        )
        .all(pat, pat);
      if (linkRows.length)
        results.liens = linkRows.map(function (r) {
          return { title: r.title, url: "/liens" };
        });
    } catch (_) {}

    try {
      var quizzResults = [];
      (config.sections || []).forEach(function (s, si) {
        (s.questions || []).forEach(function (qq) {
          if (quizzResults.length >= 5) return;
          if ((qq.question || "").toLowerCase().indexOf(ql) !== -1)
            quizzResults.push({ title: qq.question, url: "/section/" + si });
        });
      });
      if (quizzResults.length) results.quizz = quizzResults;
    } catch (_) {}
  }

  res.json({ results: results });
});

// ── Page /tags : tous les tags de tous les contenus ────────────────────────
function parseTags(raw) {
  try { return JSON.parse(raw || "[]"); } catch (_) { return []; }
}

// Détermine le type d'un tag : priorité au tag_meta, puis détection automatique
// par le nom ("ultra" et "irréaliste" sont des types spéciaux).
var AUTO_TYPES = { ultra: "ultra", "irréaliste": "irrealiste", fantaisie: "irrealiste" };
function resolveTagType(tagName, metaMap) {
  if (metaMap && metaMap[tagName]) return metaMap[tagName];
  return AUTO_TYPES[tagName] || "normal";
}

app.get("/tags", function (req, res) {
  var wiki = {}, galerie = {}, bd = {};
  function fill(rows, target) {
    rows.forEach(function (r) {
      parseTags(r.tags).forEach(function (t) {
        var k = String(t).toLowerCase().trim();
        if (k) target[k] = (target[k] || 0) + 1;
      });
    });
  }
  try { fill(db.prepare("SELECT tags FROM wiki_pages").all(), wiki); } catch (_) {}
  if (req.user) {
    try { fill(db.prepare("SELECT tags FROM gallery_images").all(), galerie); } catch (_) {}
    try { fill(db.prepare("SELECT tags FROM bd_books").all(), bd); } catch (_) {}
  }
  var metaMap = {};
  try { metaMap = getAllTagMeta(); } catch (_) {}

  // Tags venant du contenu
  var allKeys = new Set(Object.keys(wiki).concat(Object.keys(galerie)).concat(Object.keys(bd)));
  // Tags standalone (dans tag_meta mais pas dans le contenu)
  Object.keys(metaMap).forEach(function (t) { allKeys.add(t); });

  var tags = Array.from(allKeys).map(function (t) {
    return {
      tag:       t,
      count:     (wiki[t] || 0) + (galerie[t] || 0) + (bd[t] || 0),
      breakdown: { wiki: wiki[t] || 0, galerie: galerie[t] || 0, bd: bd[t] || 0 },
      type:      resolveTagType(t, metaMap),
    };
  }).sort(function (a, b) {
    var d = b.count - a.count;
    return d !== 0 ? d : a.tag.localeCompare(b.tag, "fr");
  });

  // Gradient basé sur le count réel (pas le rang) : même count → même couleur
  var maxCount = tags.length > 0 ? tags[0].count : 1;
  var minCount = tags.length > 0 ? tags[tags.length - 1].count : 0;
  var range = maxCount - minCount;
  tags = tags.map(function (item) {
    var pct = range > 0 ? (maxCount - item.count) / range : 0;
    return Object.assign({}, item, { pct: parseFloat(pct.toFixed(3)) });
  });

  var wikiPageByTitle = {};
  try {
    db.prepare("SELECT id, title FROM wiki_pages").all().forEach(function (p) {
      wikiPageByTitle[p.title.toLowerCase().trim()] = p.id;
    });
  } catch (_) {}

  res.render("tags", { config, tags, wikiPageByTitle, currentUser: req.user || null });
});

// ── API admin : créer un tag standalone ────────────────────────────────────
app.post("/api/tags/create", function (req, res) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ ok: false, error: "Interdit" });
  var tag = String(req.body.tag || "").toLowerCase().trim();
  if (!tag) return res.status(400).json({ ok: false, error: "Tag vide" });
  createStandaloneTag(tag);
  res.json({ ok: true, tag: tag });
});

// ── API admin : renommer un tag partout ────────────────────────────────────
app.put("/api/tags/rename", function (req, res) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ ok: false, error: "Interdit" });
  var oldTag = String(req.body.oldTag || "").toLowerCase().trim();
  var newTag = String(req.body.newTag || "").toLowerCase().trim();
  if (!oldTag || !newTag) return res.status(400).json({ ok: false, error: "Tags invalides" });
  if (oldTag === newTag) return res.json({ ok: true });
  // Vérification de doublon : le nouveau tag ne doit pas déjà exister dans le contenu
  try {
    var exists = false;
    [
      "SELECT tags FROM wiki_pages",
      "SELECT tags FROM gallery_images",
      "SELECT tags FROM bd_books",
    ].forEach(function (q) {
      if (exists) return;
      db.prepare(q).all().forEach(function (r) {
        if (exists) return;
        try {
          if (JSON.parse(r.tags || "[]").some(function (t) {
            return String(t).toLowerCase().trim() === newTag;
          })) exists = true;
        } catch (_) {}
      });
    });
    if (exists) return res.status(409).json({ ok: false, error: "Ce tag existe déjà" });
    renameTagEverywhere(oldTag, newTag);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── API admin : changer le type d'un tag ───────────────────────────────────
app.put("/api/tags/type", function (req, res) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ ok: false, error: "Interdit" });
  var tag  = String(req.body.tag  || "").toLowerCase().trim();
  var type = String(req.body.type || "normal");
  if (!tag) return res.status(400).json({ ok: false, error: "Tag vide" });
  setTagType(tag, type);
  res.json({ ok: true });
});

// ── API : résultats pour un tag donné ──────────────────────────────────────
app.get("/api/tags/results", function (req, res) {
  var tag = String(req.query.tag || "").toLowerCase().trim();
  if (!tag) return res.json({ wiki: [], galerie: [], bd: [], type: "normal" });
  var metaMap = {};
  try { metaMap = getAllTagMeta(); } catch (_) {}
  var type = resolveTagType(tag, metaMap);
  var result = { wiki: [], galerie: [], bd: [], type: type };
  function hasTag(raw) {
    return parseTags(raw).some(function (t) { return String(t).toLowerCase().trim() === tag; });
  }
  try {
    db.prepare("SELECT id, title, tags FROM wiki_pages").all().forEach(function (r) {
      if (hasTag(r.tags)) result.wiki.push({ id: r.id, title: r.title });
    });
  } catch (_) {}
  if (req.user) {
    try {
      db.prepare("SELECT id, title, tags FROM gallery_images").all().forEach(function (r) {
        if (hasTag(r.tags)) result.galerie.push({ id: r.id, title: r.title || "Image #" + r.id });
      });
    } catch (_) {}
    try {
      db.prepare("SELECT id, title, tags FROM bd_books").all().forEach(function (r) {
        if (hasTag(r.tags)) result.bd.push({ id: r.id, title: r.title });
      });
    } catch (_) {}
  }
  res.json(result);
});

// ── Blacklist personnelle de tags ("Masquer le tag" dans la popup tag) ─────
app.post("/api/tags/blacklist", function (req, res) {
  if (!req.user) return res.status(403).json({ ok: false, error: "Interdit" });
  var tag = String(req.body.tag || "").toLowerCase().trim();
  if (!tag) return res.status(400).json({ ok: false, error: "Tag vide" });
  addBlacklistedTag(req.user.id, tag);
  res.json({ ok: true });
});

app.delete("/api/tags/blacklist", function (req, res) {
  if (!req.user) return res.status(403).json({ ok: false, error: "Interdit" });
  var tag = String(req.body.tag || "").toLowerCase().trim();
  removeBlacklistedTag(req.user.id, tag);
  res.json({ ok: true });
});

// ── Sous-page dédiée : gérer la blacklist (retrait uniquement, l'ajout se
// fait depuis la popup tag partagée, voir partials/tag-popup.ejs) ──────────
app.get("/tags/masques", function (req, res) {
  if (!req.user) return res.redirect("/admin/login?next=" + encodeURIComponent("/tags/masques"));
  res.render("tags-masques", { config, blacklist: listBlacklistedTags(req.user.id) });
});

app.use("/", buildQuizRouter(config));
app.use("/admin", buildAdminRouter(config));
app.use("/liens", buildLinksRouter(config));
app.use("/wiki", buildWikiRouter(config));
app.use("/galerie", buildGalleryRouter(config));
app.use("/bd", buildBdRouter(config));
app.use("/favoris", buildFavoritesRouter(config));
app.use("/compte", buildAccountRouter(config));

if (usingHttps) {
  https
    .createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
      app
    )
    .listen(port, () => {
      console.log(`lequizz listening on port ${port} (HTTPS)`);
    });
} else {
  app.listen(port, () => {
    console.log(`lequizz listening on port ${port} (HTTP)`);
  });
}
