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
const buildCoupleRouter = require("./routes/couple");
const buildNouvellesRouter = require("./routes/nouvelles");
const buildProtagonistesRouter = require("./routes/protagonistes");
const { attachUser } = require("./auth");
const {
  db, getAllTagMeta, getAllTagCategories, getAllTagParents, getAllTagSubcategories, setTagType, setTagCategory, setTagParent, setTagSubcategory, createStandaloneTag, renameTagEverywhere,
  listWikiPages, listGalleryImages, getGalleryImage, listBdBooks, recordActivityPing, recordAnonVisit,
  listBlacklistedTags, addBlacklistedTag, removeBlacklistedTag,
  listFilterProfiles, createFilterProfile, deleteFilterProfile,
  getUserById,
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

// Le service worker (mode hors-ligne du Codex, voir public/codex-sw.js) ne
// doit jamais être mis en cache longtemps par le navigateur, sinon ses
// futures mises à jour ne seraient jamais prises en compte — contrairement
// au reste de /public (1 an, immuable, invalidé via ?v=assetVersion).
// Route dédiée déclarée avant le static générique pour l'emporter sur lui.
app.get("/codex-sw.js", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "..", "public", "codex-sw.js"));
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
      // Ne jamais figer le flag "secure" au démarrage : si les fichiers cert
      // existent mais que Node sert finalement en HTTP (redémarrage PM2 après
      // erreur TLS, changement de config, etc.), le cookie secure:true n'est
      // jamais envoyé par le navigateur HTTP → boucle de redirection infinie.
      // On laisse false ici et on l'ajuste par requête ci-dessous via req.secure.
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 90,
    },
  })
);

// Ajustement dynamique du flag "secure" : true uniquement si la connexion
// courante est réellement TLS (req.secure). Évite toute désynchronisation
// entre la détection au démarrage (usingHttps) et le protocole réel.
app.use((req, res, next) => {
  if (req.session) req.session.cookie.secure = req.secure;
  next();
});

app.use(attachUser);

// Ping de présence discret (throttlé, voir recordActivityPing dans db.js) :
// contrairement à connection_logs (uniquement à la saisie du mot de passe),
// permet de savoir quand un profil est simplement en train de naviguer.
app.use((req, res, next) => {
  if (req.user) recordActivityPing(req.user.id, req.path);
  next();
});

// Suivi des visites anonymes (non connectés) — throttlé à 1/IP/path/10min
const ANON_SKIP = ['/uploads', '/css', '/js', '/favicon', '/api', '/admin', '/login', '/logout'];
app.use((req, res, next) => {
  if (!req.user && req.method === 'GET') {
    const skip = ANON_SKIP.some(p => req.path.startsWith(p));
    if (!skip && req.path !== '/') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      recordAnonVisit(req.path, ip.split(',')[0].trim(), req.headers['user-agent'] || '');
    }
  }
  next();
});

// Enforcement du statut de compte.
// bloqué  → page de blocage sur toutes les routes (sauf /admin et login)
// restreint → bloque galerie, BD, nouvelles, et uploads (contenu adulte/privé)
// inactif est informatif uniquement (calculé, jamais stocké).
const RESTRICTED_PREFIXES = ['/galerie', '/bd', '/nouvelles', '/lootbox'];
app.use((req, res, next) => {
  if (!req.user) return next();
  const status = req.user.accountStatus || 'actif';
  if (status === 'bloque') {
    // Les admins ne peuvent pas se bloquer eux-mêmes
    if (req.user.isAdmin) return next();
    if (req.path.startsWith('/admin') || req.path === '/login' || req.path === '/logout') return next();
    return res.status(403).render('blocked', { user: req.user });
  }
  if (status === 'restreint') {
    const blocked = RESTRICTED_PREFIXES.some(p => req.path.startsWith(p));
    if (blocked) return res.status(403).render('blocked-restricted', { user: req.user });
  }
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
const RESTRICTED_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <rect width="48" height="48" rx="4" fill="#1a1208"/>
  <polygon points="24,10 6,38 42,38" fill="none" stroke="#c8880a" stroke-width="2.5" stroke-linejoin="round"/>
  <line x1="24" y1="20" x2="24" y2="30" stroke="#c8880a" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="24" cy="34.5" r="1.4" fill="#c8880a"/>
</svg>`;

app.use(
  "/uploads",
  (req, res, next) => {
    if (!req.user) return res.status(403).end();
    const status = req.user.accountStatus || 'actif';
    if (status === 'restreint' && !req.user.isAdmin) {
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'no-store');
      return res.send(RESTRICTED_IMAGE_SVG);
    }
    next();
  },
  express.static(uploadsDir, { maxAge: "1y", immutable: true })
);

// Jeux statiques (HTML5) : servis dynamiquement selon games/games.json.
// Chaque jeu a un slug (ex. "thog") et un répertoire relatif dans games/.
// maxAge court (1j) car les assets peuvent changer entre updates.
const GAMES_DIR = path.join(__dirname, "..", "games");
const GAMES_JSON = path.join(GAMES_DIR, "games.json");

function readGamesJson() {
  try { return JSON.parse(fs.readFileSync(GAMES_JSON, "utf8")); } catch { return []; }
}

// ── Injection dans les pages HTML des jeux ───────────────────────────────────
// Toutes les pages .html d'un jeu (entry + pages internes comme gloryhole.html)
// sont servies dynamiquement avec deux scripts injectés :
//   1. Wrapper localStorage → isole les saves par utilisateur (préfixe u<id>_)
//   2. Shim Electron → remplace ipcRenderer / fs par des équivalents navigateur
//      (openOffline/openOnline, saveGame/getSavedGame, saveGallery/getGallerySave)

function buildGameInject(userId, game) {
  const prefix = "u" + userId + "_";
  const slug   = game.slug;
  const onlineUrl = game.online_url ? JSON.stringify(game.online_url) : "null";

  return (
    `<script>(function(){` +
    // ── 1. Wrapper localStorage ──────────────────────────────────────────────
    `var p=${JSON.stringify(prefix)},_s=window.localStorage;` +
    `function NS(){` +
      `this.getItem=function(k){return _s.getItem(p+k)};` +
      `this.setItem=function(k,v){return _s.setItem(p+k,v)};` +
      `this.removeItem=function(k){return _s.removeItem(p+k)};` +
      `this.clear=function(){var r=[];for(var i=0;i<_s.length;i++){var k=_s.key(i);if(k&&k.indexOf(p)===0)r.push(k);}r.forEach(function(k){_s.removeItem(k)})};` +
      `this.key=function(n){var c=0;for(var i=0;i<_s.length;i++){var k=_s.key(i);if(k&&k.indexOf(p)===0){if(c===n)return k.slice(p.length);c++;}}return null};` +
      `Object.defineProperty(this,"length",{get:function(){var c=0;for(var i=0;i<_s.length;i++){var k=_s.key(i);if(k&&k.indexOf(p)===0)c++;}return c}});` +
    `}` +
    `var _ns=new NS();` +
    `try{Object.defineProperty(window,"localStorage",{get:function(){return _ns}})}catch(e){}` +
    // ── 2. Shim Electron ────────────────────────────────────────────────────
    // Navigation entre pages du jeu
    `window.openOffline=window.openOffline||function(){location.href="gloryhole.html"};` +
    `window.openOnline=window.openOnline||function(){var u=${onlineUrl};if(u)window.open(u,"_blank")};` +
    // Saves via localStorage (remplace fs.writeFileSync du preload Electron)
    `window.saveGame=window.saveGame||function(c){try{localStorage.setItem("save",c)}catch(e){}};` +
    `window.getSavedGame=window.getSavedGame||function(){` +
      `var d=localStorage.getItem("save");if(!d)throw new Error("No save");return JSON.parse(d)};` +
    `window.saveGallery=window.saveGallery||function(c){try{localStorage.setItem("gallery",c)}catch(e){}};` +
    `window.getGallerySave=window.getGallerySave||function(){` +
      `var d=localStorage.getItem("gallery");if(!d)throw new Error("No gallery");return JSON.parse(d)};` +
    // getContent lit un fichier JSON via XHR synchrone (héritage Electron/fs)
    `window.getContent=window.getContent||function(){` +
      `var x=new XMLHttpRequest();x.open("GET","static/json/v5_1.json",false);x.send();` +
      `return JSON.parse(x.responseText)};` +
    // Contrôle volume depuis le parent via postMessage
    `window.addEventListener("message",function(e){` +
      `if(!e.data||e.data.type!=="gh_setVolume")return;` +
      `var v=Math.max(0,Math.min(1,Number(e.data.volume)||0));` +
      `document.querySelectorAll("audio,video").forEach(function(a){a.volume=v;a.muted=v===0;});` +
    `});` +
    `}());</script>`
  );
}

function serveGameHtml(req, res, next, game, filePath) {
  let html;
  try { html = fs.readFileSync(filePath, "utf8"); }
  catch { return next(); }
  const inject = buildGameInject(req.user.id, game);
  if (html.includes("<head>")) html = html.replace("<head>", "<head>" + inject);
  else if (/<html/i.test(html)) html = html.replace(/(<html[^>]*>)/i, "$1" + inject);
  else html = inject + html;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
}

// /play → page d'entrée du jeu (URL propre exposée aux utilisateurs)
app.get("/games/:slug/play", (req, res, next) => {
  if (!req.user) return res.status(403).end();
  const game = readGamesJson().find(g => g.slug === req.params.slug);
  if (!game) return res.status(404).end();
  if (game.disabled) return res.status(403).send("Ce jeu est temporairement indisponible.");
  serveGameHtml(req, res, next, game, path.join(GAMES_DIR, game.dir, game.entrypoint));
});

// *.html internes → permet la navigation entre pages du jeu (ex. onlineoffline → gloryhole)
app.get("/games/:slug/*.html", (req, res, next) => {
  if (!req.user) return res.status(403).end();
  const game = readGamesJson().find(g => g.slug === req.params.slug);
  if (!game) return res.status(404).end();
  if (game.disabled) return res.status(403).send("Ce jeu est temporairement indisponible.");
  const gameDir  = path.resolve(GAMES_DIR, game.dir);
  const filePath = path.resolve(gameDir, req.params[0] + ".html");
  if (!filePath.startsWith(gameDir + path.sep) && filePath !== gameDir) return res.status(403).end();
  serveGameHtml(req, res, next, game, filePath);
});

// Illustrations des jeux (pas d'auth requise — images publiques)
app.use("/game-covers", express.static(path.join(GAMES_DIR, "covers"), { maxAge: "7d" }));

// Assets statiques des jeux (JS, CSS, images…)
// Godot exige Content-Type: application/wasm pour les .wasm, sinon le navigateur refuse
app.use("/games/:slug", (req, res, next) => {
  if (!req.user) return res.status(403).end();
  const game = readGamesJson().find(g => g.slug === req.params.slug);
  if (!game) return res.status(404).end();
  if (req.path.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
  express.static(path.join(GAMES_DIR, game.dir), { maxAge: "1d" })(req, res, next);
});

// THOG référence ses assets avec des chemins absolus /static/... (héritage Electron).
app.use(
  "/static",
  (req, res, next) => (req.user ? next() : res.status(403).end()),
  express.static(path.join(GAMES_DIR, "mjlc", "resources", "app", "static"), { maxAge: "1d" })
);

// Genere en tache de fond les vignettes manquantes pour les images deja
// uploadees avant l'ajout de cette fonctionnalite (voir src/thumbs.js).
// Volontairement non attendu : ne doit jamais retarder le demarrage.
backfillThumbs("wiki");
backfillThumbs("gallery");
backfillThumbs("bd");

app.use((req, res, next) => {
  res.locals.thumbUrl = thumbUrl;
  // Vignette de l'avatar de profil : pré-calculée ici pour que la nav
  // l'ait sans requête supplémentaire dans le partial profile-avatar.
  if (req.user && req.user.profileImageId) {
    const img = getGalleryImage(req.user.profileImageId);
    if (img) {
      const firstPath = (img.imagePaths && img.imagePaths[0]) || img.filename || null;
      res.locals.profileAvatarThumb = firstPath ? thumbUrl(firstPath) : null;
      res.locals.profileImageCrop = req.user.profileImageCrop || null;
    }
  }
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

// Mode couple (lié par l'admin, voir /admin) : expose le/la partenaire pour
// le lien dans le menu profil (voir partials/top-nav.ejs). Toujours
// calculé (une seule lecture par PK, négligeable) plutôt que scopé à
// certaines pages, pour que le lien apparaisse dans le header partout.
app.use((req, res, next) => {
  res.locals.partnerUser = (req.user && req.user.partnerId) ? getUserById(req.user.partnerId) : null;
  next();
});

// Profils de recherche personnels (voir "Enregistrer le filtre" dans les
// volets Codex/Galerie) : calculés seulement sur les pages où le bloc
// "Profils de recherche" peut apparaître, pour ne pas ajouter une requête
// inutile ailleurs. Strictement privés (filtrés par user_id), jamais
// visibles par un autre profil — même portée que tagBlacklist ci-dessus.
app.use((req, res, next) => {
  res.locals.wikiFilterProfiles = (req.user && req.path.indexOf("/wiki") === 0)
    ? listFilterProfiles(req.user.id, "wiki") : [];
  res.locals.galleryFilterProfiles = (req.user && req.path.indexOf("/galerie") === 0)
    ? listFilterProfiles(req.user.id, "gallery") : [];
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
      tagParents: getAllTagParents(),
      tagCategories: getAllTagCategories(),
      tagSubcategories: getAllTagSubcategories(),
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
  // Sentinelle : ne correspond à aucun user_id réel, évite de brancher la
  // requête selon connecté/non connecté pour exclure le contenu masqué
  // (voir bouton "Masquer" et content_reactions.hidden).
  var uid = req.user ? req.user.id : -1;

  // Wiki — public (texte accessible sans connexion)
  try {
    var wikiRows = db
      .prepare(
        "SELECT id, title FROM wiki_pages WHERE (lower(title) LIKE ? OR lower(content) LIKE ? OR lower(tags) LIKE ? OR lower(meta) LIKE ?) " +
        "AND id NOT IN (SELECT item_id FROM content_reactions WHERE user_id = ? AND item_type = 'wiki' AND hidden = 1) LIMIT 6"
      )
      .all(pat, pat, pat, pat, uid);
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
          "SELECT id, title FROM gallery_images WHERE (lower(title) LIKE ? OR lower(notes) LIKE ? OR lower(tags) LIKE ?) " +
          "AND id NOT IN (SELECT item_id FROM content_reactions WHERE user_id = ? AND item_type = 'gallery' AND hidden = 1) LIMIT 5"
        )
        .all(pat, pat, pat, uid);
      if (galRows.length)
        results.galerie = galRows.map(function (r) {
          return { title: r.title || "Image #" + r.id, url: "/galerie" };
        });
    } catch (_) {}

    try {
      var bdRows = db
        .prepare(
          "SELECT id, title FROM bd_books WHERE (lower(title) LIKE ? OR lower(description) LIKE ? OR lower(tags) LIKE ?) " +
          "AND id NOT IN (SELECT item_id FROM content_reactions WHERE user_id = ? AND item_type = 'bd' AND hidden = 1) LIMIT 5"
        )
        .all(pat, pat, pat, uid);
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
  var categoryMap = {};
  try { categoryMap = getAllTagCategories(); } catch (_) {}

  // Tags venant du contenu
  var allKeys = new Set(Object.keys(wiki).concat(Object.keys(galerie)).concat(Object.keys(bd)));
  // Tags standalone (dans tag_meta mais pas dans le contenu)
  Object.keys(metaMap).forEach(function (t) { allKeys.add(t); });
  // Tags masqués (voir /tags/masques) : invisibles sur cette page, comme
  // partout ailleurs sur le site pour ce profil.
  if (req.user) {
    try { listBlacklistedTags(req.user.id).forEach(function (r) { allKeys.delete(r.tag); }); } catch (_) {}
  }

  var parentMap = {};
  try { parentMap = getAllTagParents(); } catch (_) {}
  var subcategoryMap = {};
  try { subcategoryMap = getAllTagSubcategories(); } catch (_) {}

  var tags = Array.from(allKeys).map(function (t) {
    return {
      tag:         t,
      count:       (wiki[t] || 0) + (galerie[t] || 0) + (bd[t] || 0),
      breakdown:   { wiki: wiki[t] || 0, galerie: galerie[t] || 0, bd: bd[t] || 0 },
      type:        resolveTagType(t, metaMap),
      category:    categoryMap[t] || "autre",
      parent:      parentMap[t] || "",
      subcategory: subcategoryMap[t] || "",
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
  var tag      = String(req.body.tag      || "").toLowerCase().trim();
  var category = String(req.body.category || "autre").toLowerCase().trim();
  if (!tag) return res.status(400).json({ ok: false, error: "Tag vide" });
  createStandaloneTag(tag, category);
  if (category && category !== "autre") setTagCategory(tag, category);
  res.json({ ok: true, tag, category });
});

// ── API admin : changer la catégorie d'un tag ──────────────────────────────
app.put("/api/tags/category", function (req, res) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ ok: false, error: "Interdit" });
  var tag      = String(req.body.tag      || "").toLowerCase().trim();
  var category = String(req.body.category || "autre").toLowerCase().trim();
  if (!tag) return res.status(400).json({ ok: false, error: "Tag vide" });
  setTagCategory(tag, category);
  res.json({ ok: true });
});

// ── API admin : définir le tag principal (agrégation) ─────────────────────
app.put("/api/tags/parent", function (req, res) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ ok: false, error: "Interdit" });
  var tag    = String(req.body.tag    || "").toLowerCase().trim();
  var parent = String(req.body.parent || "").toLowerCase().trim();
  if (!tag) return res.status(400).json({ ok: false, error: "Tag vide" });
  // Un tag ne peut pas être sa propre déclinaison
  if (tag === parent) return res.json({ ok: false, error: "Circulaire" });
  setTagParent(tag, parent);
  res.json({ ok: true });
});

// ── API admin : définir la sous-catégorie d'un tag ────────────────────────
app.put("/api/tags/subcategory", function (req, res) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ ok: false, error: "Interdit" });
  var tag         = String(req.body.tag         || "").toLowerCase().trim();
  var subcategory = String(req.body.subcategory || "").toLowerCase().trim();
  if (!tag) return res.status(400).json({ ok: false, error: "Tag vide" });
  setTagSubcategory(tag, subcategory);
  res.json({ ok: true });
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

// ── Profils de recherche personnels (Codex/Galerie) ─────────────────────────
// "state" est un blob opaque construit par public/wiki.js ou
// public/gallery.js (jamais interprété ici) : voir listFilterProfiles/
// createFilterProfile dans db.js.
var FILTER_PROFILE_SECTIONS = ["wiki", "gallery"];
app.post("/api/filter-profils", function (req, res) {
  if (!req.user) return res.status(403).json({ ok: false, error: "Interdit" });
  var section = String(req.body.section || "");
  var name = String(req.body.name || "").trim().slice(0, 60);
  if (FILTER_PROFILE_SECTIONS.indexOf(section) === -1) return res.status(400).json({ ok: false, error: "Section invalide" });
  if (!name) return res.status(400).json({ ok: false, error: "Nom vide" });
  var id = createFilterProfile(req.user.id, section, name, req.body.state || {});
  res.json({ ok: true, id: id });
});

app.delete("/api/filter-profils/:id", function (req, res) {
  if (!req.user) return res.status(403).json({ ok: false, error: "Interdit" });
  var id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
  deleteFilterProfile(req.user.id, id);
  res.json({ ok: true });
});

// Page menu mobile (accessible uniquement via la tabbar, mais pas de restriction
// technique : fonctionne aussi sur desktop pour ne pas bloquer un lien partagé)
app.get("/mobile-menu", (req, res) => {
  res.render("mobile-menu", { config, currentUser: req.user || null });
});

const buildCustomQuizRouter = require("./routes/custom-quiz");
const buildParodiesRouter = require("./routes/parodies");
const buildLootboxRouter = require("./routes/lootbox");
const buildJeuRouter = require("./routes/jeu");
const buildArcadeRouter = require("./routes/arcade");
app.use("/quizz", buildCustomQuizRouter(config));
app.use("/", buildQuizRouter(config));
app.use("/admin", buildAdminRouter(config));
app.use("/liens", buildLinksRouter(config));
app.use("/wiki", buildWikiRouter(config));
app.use("/galerie", buildGalleryRouter(config));
app.use("/bd", buildBdRouter(config));
app.use("/favoris", buildFavoritesRouter(config));
app.use("/compte", buildAccountRouter(config));
app.use("/couple", buildCoupleRouter(config));
app.use("/nouvelles", buildNouvellesRouter(config));
app.use("/protagonistes", buildProtagonistesRouter(config));
app.use("/parodies", buildParodiesRouter(config));
app.use("/lootbox", buildLootboxRouter(config));
app.use("/jeu", buildJeuRouter(config));
app.use("/arcade", buildArcadeRouter(config));

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
