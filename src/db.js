const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { hashPassword } = require("./passwords");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "quizz.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    answers TEXT NOT NULL,
    scores TEXT NOT NULL
  )
`);
// Multi-profil : chaque soumission appartient a un profil (avant, un seul
// jeu de reponses partage entre tout le monde).
try { db.exec("ALTER TABLE submissions ADD COLUMN user_id INTEGER"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS attempts (
    token TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    next_section INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'site',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'autre',
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    image_path TEXT,
    owned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
// Migrations non destructives
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN image_paths TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN rating INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN flame INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN interested INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN views INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN extra_categories TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN featured INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN maturity INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN maturity_set_at TEXT"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
// Migrations non destructives (même approche que wiki_pages) : catégorie,
// réactions, lien vers une page wiki, et plusieurs images par entrée
// (album) au lieu d'une seule image par ligne.
try { db.exec("ALTER TABLE gallery_images ADD COLUMN category TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN rating INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN flame INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN interested INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN wiki_page_id INTEGER"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN image_paths TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN author TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN parody TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN content_type TEXT NOT NULL DEFAULT 'image'"); } catch(_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN processed INTEGER NOT NULL DEFAULT 0"); } catch(_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN featured INTEGER NOT NULL DEFAULT 0"); } catch(_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS bd_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    image_paths TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
try { db.exec("ALTER TABLE bd_books ADD COLUMN rating INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE bd_books ADD COLUMN flame INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE bd_books ADD COLUMN interested INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE bd_books ADD COLUMN langue TEXT NOT NULL DEFAULT ''"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_page_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    linked_page_id INTEGER NOT NULL,
    UNIQUE(page_id, linked_page_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_question_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wiki_page_id INTEGER NOT NULL,
    section_key TEXT NOT NULL,
    question_id TEXT NOT NULL,
    UNIQUE(wiki_page_id, section_key, question_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_image_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    src TEXT NOT NULL,
    page_id INTEGER NOT NULL,
    UNIQUE(src, page_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`);
// Compte "test" : un utilisateur normal en tout point, juste marque a part
// pour le distinguer des vrais profils lors du dev/de la maintenance.
try { db.exec("ALTER TABLE users ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

// Champs d'identite du compte (facultatifs, renseignes par l'utilisateur
// et/ou l'admin selon le champ) et journal technique automatique.
try { db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN sexe TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN birth_year INTEGER"); } catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT"); } catch (_) {}

// Gouts + reglages d'affichage, propres a chaque profil (section "Goûts" /
// "Paramètres" de /favoris). ultra_mode/irrealiste_mode : "hidden" (masque
// par defaut mais reste affichable via le bouton bascule existant),
// "visible" (toujours affiche), "off" (exclu partout, meme via le bouton).
try { db.exec("ALTER TABLE users ADD COLUMN orientation TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN ultra_mode TEXT NOT NULL DEFAULT 'hidden'"); } catch (_) {}
try { db.exec("ALTER TABLE users ADD COLUMN irrealiste_mode TEXT NOT NULL DEFAULT 'visible'"); } catch (_) {}
// Consentement explicite (facultatif, décoché par défaut) : le profil
// choisit lui-même de rendre ses notes/favoris visibles à l'admin. N'affecte
// pas l'accès réel (l'admin voit déjà tout) : sert uniquement de pastille
// indicative sur la carte utilisateur et sa fiche (admin-dashboard/admin-user-*).
try { db.exec("ALTER TABLE users ADD COLUMN share_notes_with_admin INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
// "Ouverture des tags" (ask/wiki/gallery) retire : le clic sur un tag a
// desormais un seul comportement partout (popup unifiee), plus de choix a
// faire. Colonne supprimee si le moteur SQLite le permet (>= 3.35), sinon
// laissee inerte (plus lue nulle part).
try { db.exec("ALTER TABLE users DROP COLUMN tag_nav_pref"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, item_type, item_id)
  )
`);

// Note (etoiles), J'adore et Ça m'interesse : propres a chaque profil (comme
// les favoris ci-dessus), remplace les anciennes colonnes partagees
// wiki_pages.rating/flame/interested et gallery_images.rating/flame/interested
// qui etaient (par erreur de conception) une seule valeur vue et modifiee par
// tout le monde.
db.exec(`
  CREATE TABLE IF NOT EXISTS content_reactions (
    user_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    rating INTEGER NOT NULL DEFAULT 0,
    flame INTEGER NOT NULL DEFAULT 0,
    interested INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_type, item_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gallery_id INTEGER NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bd_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS connection_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )
`);

// Pings de présence discrets (voir recordActivityPing) : contrairement à
// connection_logs (uniquement à la saisie du mot de passe), permet de savoir
// quand un profil est simplement en train de naviguer sur le site.
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_pings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_pings_user ON activity_pings (user_id, id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_page_user_notes (
    page_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (page_id, user_id)
  )
`);

// Métadonnées des tags : type (normal/ultra/irrealiste/fantaisie) et
// possibilité de créer des tags "standalone" sans aucun contenu associé.
db.exec(`
  CREATE TABLE IF NOT EXISTS tag_meta (
    tag  TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'normal'
  )
`);

// Blacklist personnelle de tags (bouton "Masquer le tag" de la popup tag,
// gérée depuis /tags/masques) : tout contenu portant un de ces tags reste
// masqué partout pour ce profil, jusqu'à retrait explicite.
db.exec(`
  CREATE TABLE IF NOT EXISTS tag_blacklist (
    user_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, tag)
  )
`);

function listBlacklistedTags(userId) {
  return db.prepare(
    "SELECT tag, created_at FROM tag_blacklist WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId).map(function(r) { return { tag: r.tag, createdAt: r.created_at }; });
}

function addBlacklistedTag(userId, tag) {
  var t = String(tag || "").toLowerCase().trim();
  if (!t) return;
  db.prepare(
    "INSERT OR IGNORE INTO tag_blacklist (user_id, tag, created_at) VALUES (?, ?, ?)"
  ).run(userId, t, new Date().toISOString());
}

function removeBlacklistedTag(userId, tag) {
  var t = String(tag || "").toLowerCase().trim();
  db.prepare("DELETE FROM tag_blacklist WHERE user_id = ? AND tag = ?").run(userId, t);
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: !!row.is_admin,
    isTest: !!row.is_test,
    email: row.email || "",
    sexe: row.sexe || "",
    birthYear: row.birth_year || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    lastLoginAt: row.last_login_at || null,
    orientation: row.orientation || "",
    ultraMode: row.ultra_mode || "hidden",
    irrealisteMode: row.irrealiste_mode || "visible",
    shareNotesWithAdmin: !!row.share_notes_with_admin,
  };
}

function createUser({ username, displayName, passwordHash, isAdmin, isTest }) {
  const info = db
    .prepare(
      "INSERT INTO users (username, display_name, password_hash, is_admin, is_test, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(username, displayName, passwordHash, isAdmin ? 1 : 0, isTest ? 1 : 0, new Date().toISOString());
  return info.lastInsertRowid;
}

// Modifie un profil existant cote admin (identite, role, sexe). Le pseudo et
// le sexe sont aussi modifiables par l'utilisateur lui-meme, voir
// updateOwnProfile. Le mot de passe se change a part via updateUserPassword.
function updateUser(id, { username, displayName, isAdmin, isTest, sexe }) {
  db.prepare(
    "UPDATE users SET username = ?, display_name = ?, is_admin = ?, is_test = ?, sexe = ?, updated_at = ? WHERE id = ?"
  ).run(username, displayName, isAdmin ? 1 : 0, isTest ? 1 : 0, sexe || "", new Date().toISOString(), id);
}

// Modifie les champs que l'utilisateur peut changer lui-meme sur son propre
// compte : pseudo, email, sexe, annee de naissance (pas le role, pas
// l'identifiant de connexion — reserves a l'admin).
function updateOwnProfile(id, { displayName, email, sexe, birthYear }) {
  db.prepare(
    "UPDATE users SET display_name = ?, email = ?, sexe = ?, birth_year = ?, updated_at = ? WHERE id = ?"
  ).run(displayName, email || "", sexe || "", birthYear || null, new Date().toISOString(), id);
}

function touchLastLogin(id) {
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

const ORIENTATION_VALUES = ["", "hetero", "gay", "bi"];
const SPECIAL_MODE_VALUES = ["hidden", "visible", "off"];

// Reglages "Goûts"/"Paramètres" (voir /favoris) : mise a jour partielle,
// chaque champ omis garde sa valeur actuelle (sauvegarde instantanee par
// champ, pas un gros formulaire soumis d'un coup).
function updateUserSettings(id, { orientation, ultraMode, irrealisteMode, shareNotesWithAdmin }) {
  const current = getUserById(id);
  if (!current) return;
  const o  = orientation   !== undefined && ORIENTATION_VALUES.includes(orientation)   ? orientation   : current.orientation;
  const um = ultraMode     !== undefined && SPECIAL_MODE_VALUES.includes(ultraMode)     ? ultraMode     : current.ultraMode;
  const im = irrealisteMode !== undefined && SPECIAL_MODE_VALUES.includes(irrealisteMode) ? irrealisteMode : current.irrealisteMode;
  const snwa = shareNotesWithAdmin !== undefined ? (shareNotesWithAdmin ? 1 : 0) : (current.shareNotesWithAdmin ? 1 : 0);
  db.prepare(
    "UPDATE users SET orientation = ?, ultra_mode = ?, irrealiste_mode = ?, share_notes_with_admin = ? WHERE id = ?"
  ).run(o, um, im, snwa, id);
}

function getUserByUsername(username) {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  return rowToUser(row);
}

// Renvoie le hash : reserve a la verification de mot de passe au login,
// jamais expose au reste de l'app (rowToUser ne le contient pas).
function getUserCredentials(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) || null;
}

function getUserById(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return rowToUser(row);
}

function listUsers() {
  return db.prepare("SELECT * FROM users ORDER BY id ASC").all().map(rowToUser);
}

function updateUserPassword(id, passwordHash) {
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, new Date().toISOString(), id);
}

function addFavorite(userId, itemType, itemId) {
  db.prepare(
    "INSERT OR IGNORE INTO favorites (user_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId, itemType, itemId, new Date().toISOString());
}

function removeFavorite(userId, itemType, itemId) {
  db.prepare("DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?").run(userId, itemType, itemId);
}

function isFavorite(userId, itemType, itemId) {
  return !!db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?").get(userId, itemType, itemId);
}

function listFavoriteRows(userId) {
  return db.prepare("SELECT item_type, item_id FROM favorites WHERE user_id = ? ORDER BY id DESC").all(userId);
}

function countFavorites() {
  return db.prepare("SELECT COUNT(*) AS c FROM favorites").get().c;
}

const REACTION_DEFAULT = { rating: 0, flame: false, interested: false };

function getUserReaction(userId, itemType, itemId) {
  if (!userId) return { ...REACTION_DEFAULT };
  const row = db.prepare(
    "SELECT rating, flame, interested FROM content_reactions WHERE user_id = ? AND item_type = ? AND item_id = ?"
  ).get(userId, itemType, itemId);
  return row ? { rating: row.rating, flame: !!row.flame, interested: !!row.interested } : { ...REACTION_DEFAULT };
}

// Statistiques agregees des reactions d'un utilisateur (tous types confondus).
// Retourne { ratingCount, flameCount } pour affichage sur la carte admin.
function getUserReactionStats(userId) {
  if (!userId) return { ratingCount: 0, flameCount: 0 };
  const ratingRow = db.prepare(
    "SELECT COUNT(*) AS n FROM content_reactions WHERE user_id = ? AND rating > 0"
  ).get(userId);
  const flameRow = db.prepare(
    "SELECT COUNT(*) AS n FROM content_reactions WHERE user_id = ? AND flame = 1"
  ).get(userId);
  return { ratingCount: ratingRow ? ratingRow.n : 0, flameCount: flameRow ? flameRow.n : 0 };
}

// Compte "noté" (rating > 0 ou flame) d'un utilisateur pour un type de
// contenu donné — même critère que les pages /favoris/notes/*, mais sans
// charger la liste complète : sert au badge de compteur du volet profil,
// affiché sur toutes les pages du profil (pas seulement la page concernée).
function countUserNotes(userId, itemType) {
  if (!userId) return 0;
  const row = db.prepare(
    "SELECT COUNT(*) AS n FROM content_reactions WHERE user_id = ? AND item_type = ? AND (rating > 0 OR flame = 1)"
  ).get(userId, itemType);
  return row ? row.n : 0;
}

// Toutes les reactions d'un utilisateur pour un type de contenu, indexees par
// item_id : evite une requete par ligne quand on affiche une liste entiere
// (sommaire wiki, galerie...).
function getUserReactionsMap(userId, itemType) {
  const map = {};
  if (!userId) return map;
  db.prepare("SELECT item_id, rating, flame, interested FROM content_reactions WHERE user_id = ? AND item_type = ?")
    .all(userId, itemType)
    .forEach((r) => { map[r.item_id] = { rating: r.rating, flame: !!r.flame, interested: !!r.interested }; });
  return map;
}

// Fusionne la reaction personnelle du visiteur (userId) sur une liste
// d'objets contenu (pages wiki, images galerie...) issus de listXxx().
function mergeUserReactions(items, userId, itemType) {
  const map = getUserReactionsMap(userId, itemType);
  return items.map((item) => Object.assign(item, map[item.id] || { ...REACTION_DEFAULT }));
}

function setUserReaction(userId, itemType, itemId, { rating, flame, interested }) {
  const current = getUserReaction(userId, itemType, itemId);
  const r = rating !== undefined ? Math.max(0, Math.min(5, Number(rating) || 0)) : current.rating;
  const f = flame !== undefined ? !!flame : current.flame;
  const it = interested !== undefined ? !!interested : current.interested;
  db.prepare(
    `INSERT INTO content_reactions (user_id, item_type, item_id, rating, flame, interested, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET
       rating = excluded.rating, flame = excluded.flame, interested = excluded.interested, updated_at = excluded.updated_at`
  ).run(userId, itemType, itemId, r, f ? 1 : 0, it ? 1 : 0, new Date().toISOString());
}

function getUserNote(pageId, userId) {
  const row = db.prepare("SELECT content FROM wiki_page_user_notes WHERE page_id = ? AND user_id = ?").get(pageId, userId);
  return row ? row.content : "";
}

function setUserNote(pageId, userId, content) {
  db.prepare(
    `INSERT INTO wiki_page_user_notes (page_id, user_id, content, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(page_id, user_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(pageId, userId, String(content || "").slice(0, 10000), new Date().toISOString());
}

// Cree les profils initiaux au demarrage a partir des variables d'env
// (idempotent : ne fait rien si le profil existe deja). Sans mot de passe
// fourni, avertit et laisse le profil non cree plutot que planter.
function seedInitialUsers() {
  const profiles = [
    {
      username: process.env.ADMIN_USERNAME || "admin",
      displayName: process.env.ADMIN_DISPLAY_NAME || "Admin",
      password: process.env.ADMIN_PASSWORD,
      isAdmin: true,
    },
    {
      username: process.env.MANON_USERNAME || "manon",
      displayName: process.env.MANON_DISPLAY_NAME || "Manon",
      password: process.env.MANON_PASSWORD,
      isAdmin: false,
    },
  ];
  profiles.forEach((p) => {
    if (getUserByUsername(p.username)) return;
    if (!p.password) {
      console.warn(
        `ATTENTION: profil "${p.username}" non cree (mot de passe manquant dans .env) -> connexion impossible pour ce profil tant que ce n'est pas renseigne.`
      );
      return;
    }
    createUser({
      username: p.username,
      displayName: p.displayName,
      passwordHash: hashPassword(p.password),
      isAdmin: p.isAdmin,
    });
  });
}

// Migration ponctuelle : les reponses de quizz existantes (avant les
// profils) etaient un seul jeu partage sous le token "shared". On les
// rattache au profil de Manon des que celui-ci existe. Idempotent : une
// fois migre, il n'y a plus de ligne "shared" / user_id NULL a traiter.
function migrateSharedDataToManon() {
  const manon = getUserByUsername(process.env.MANON_USERNAME || "manon");
  if (!manon) return;
  const newToken = "user:" + manon.id;
  db.prepare("UPDATE attempts SET token = ? WHERE token = 'shared'").run(newToken);
  db.prepare("UPDATE submissions SET user_id = ? WHERE user_id IS NULL").run(manon.id);
}

seedInitialUsers();
migrateSharedDataToManon();

// Remise a zero ponctuelle, suite a la decouverte que les notes (etoiles),
// J'adore, Ça m'interesse et les favoris etaient corrompus : une reaction
// d'un profil (ex. "Test") pouvait apparaitre comme celle de tout le monde
// (colonnes partagees wiki_pages/gallery_images.rating|flame|interested, et
// un bouton "Sync" qui recopiait ça dans les favoris de tous). Passage au
// ── Séries d'images ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS image_series (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS image_series_members (
    series_id  INTEGER NOT NULL REFERENCES image_series(id)  ON DELETE CASCADE,
    gallery_id INTEGER NOT NULL REFERENCES gallery_images(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (series_id, gallery_id)
  );
  CREATE INDEX IF NOT EXISTS idx_series_members_gallery ON image_series_members(gallery_id);
`);

function createSeries(title) {
  const now = new Date().toISOString();
  return db.prepare("INSERT INTO image_series (title, created_at) VALUES (?, ?)").run(String(title || "").trim(), now).lastInsertRowid;
}
function deleteSeries(id) {
  db.prepare("DELETE FROM image_series WHERE id = ?").run(id);
}
function updateSeriesTitle(id, title) {
  db.prepare("UPDATE image_series SET title = ? WHERE id = ?").run(String(title || "").trim(), id);
}
function listSeries() {
  return db.prepare("SELECT id, title, created_at FROM image_series ORDER BY id DESC").all();
}
function getSeries(id) {
  return db.prepare("SELECT id, title FROM image_series WHERE id = ?").get(id) || null;
}
function getSeriesImages(seriesId) {
  return db.prepare(
    `SELECT gi.id, gi.image_paths, gi.title, gi.category, ism.position
     FROM image_series_members ism
     JOIN gallery_images gi ON gi.id = ism.gallery_id
     WHERE ism.series_id = ?
     ORDER BY ism.position ASC, gi.id ASC`
  ).all(seriesId).map((r) => ({
    id: r.id,
    imagePaths: (() => { try { return JSON.parse(r.image_paths || "[]"); } catch(_) { return []; } })(),
    title: r.title,
    category: r.category,
    position: r.position,
  }));
}
function getImageSeries(galleryId) {
  return db.prepare(
    `SELECT is2.id, is2.title, ism.position,
            (SELECT COUNT(*) FROM image_series_members WHERE series_id = is2.id) AS total
     FROM image_series_members ism
     JOIN image_series is2 ON is2.id = ism.series_id
     WHERE ism.gallery_id = ?
     ORDER BY is2.id ASC`
  ).all(galleryId);
}
// Retourne { seriesId, seriesTitle, position, total, prevId, nextId }
function getSeriesNav(galleryId, seriesId) {
  const members = db.prepare(
    `SELECT gallery_id FROM image_series_members WHERE series_id = ? ORDER BY position ASC, gallery_id ASC`
  ).all(seriesId);
  const idx = members.findIndex((m) => m.gallery_id === galleryId);
  if (idx === -1) return null;
  const series = getSeries(seriesId);
  return {
    seriesId,
    seriesTitle: series ? series.title : "",
    position: idx + 1,
    total: members.length,
    prevId: idx > 0 ? members[idx - 1].gallery_id : null,
    nextId: idx < members.length - 1 ? members[idx + 1].gallery_id : null,
  };
}
function addToSeries(seriesId, galleryId, position) {
  db.prepare("INSERT OR REPLACE INTO image_series_members (series_id, gallery_id, position) VALUES (?, ?, ?)").run(seriesId, galleryId, position ?? 0);
}
function removeFromSeries(seriesId, galleryId) {
  db.prepare("DELETE FROM image_series_members WHERE series_id = ? AND gallery_id = ?").run(seriesId, galleryId);
}
function reorderSeries(seriesId, orderedGalleryIds) {
  const stmt = db.prepare("UPDATE image_series_members SET position = ? WHERE series_id = ? AND gallery_id = ?");
  orderedGalleryIds.forEach((gid, i) => stmt.run(i, seriesId, gid));
}
// Retourne { galleryId: [{ seriesId, position }] } pour un ensemble d'IDs
function getSeriesMapForIds(galleryIds) {
  if (!galleryIds.length) return {};
  const placeholders = galleryIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT gallery_id, series_id, is2.title AS series_title, ism.position
     FROM image_series_members ism
     JOIN image_series is2 ON is2.id = ism.series_id
     WHERE gallery_id IN (${placeholders})`
  ).all(...galleryIds);
  const map = {};
  rows.forEach((r) => {
    if (!map[r.gallery_id]) map[r.gallery_id] = [];
    map[r.gallery_id].push({ seriesId: r.series_id, title: r.series_title, position: r.position });
  });
  return map;
}

// nouveau modele "un profil = ses propres reactions" (table
// content_reactions) : les vieilles colonnes partagees ne sont plus lues
// (voir rowToWikiPage/rowToGalleryImage), donc deja neutres. Ici on vide en
// plus les favoris et les notes perso existants, qui datent d'avant la
// correction et ne sont plus fiables. Marqueur pour ne s'executer qu'une
// seule fois (jamais au redemarrage suivant).
db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);
(function resetReactionsAndFavoritesOnce() {
  const KEY = "reset_favorites_reactions_notes_v1";
  if (db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get(KEY)) return;
  // Perimetre demande : wiki + galerie uniquement (le BD n'est pas concerne
  // par cette refonte, ses favoris existants restent intacts).
  db.exec("DELETE FROM favorites WHERE item_type IN ('wiki', 'gallery')");
  db.exec("DELETE FROM wiki_page_user_notes");
  db.exec("UPDATE wiki_pages SET rating = 0, flame = 0, interested = 0");
  db.exec("UPDATE gallery_images SET rating = 0, flame = 0, interested = 0");
  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(KEY, new Date().toISOString());
})();

// Migration : catégorie "autre" fusionnée dans "fantasmes" (suppression du chapitre).
// Idempotent : après le premier passage il n'y a plus de lignes "autre".
db.prepare("UPDATE wiki_pages SET category = 'fantasmes' WHERE category = 'autre'").run();
// Nettoie aussi extra_categories qui pourraient contenir "autre".
db.prepare("SELECT id, extra_categories FROM wiki_pages WHERE extra_categories LIKE '%autre%'").all().forEach(function (row) {
  try {
    const cats = JSON.parse(row.extra_categories || "[]").filter(function (c) { return c !== "autre"; });
    db.prepare("UPDATE wiki_pages SET extra_categories = ? WHERE id = ?").run(JSON.stringify(cats), row.id);
  } catch (_) {}
});

function insertSubmission(userId, answers, scores) {
  const stmt = db.prepare(
    "INSERT INTO submissions (created_at, answers, scores, user_id) VALUES (?, ?, ?, ?)"
  );
  const info = stmt.run(
    new Date().toISOString(),
    JSON.stringify(answers),
    JSON.stringify(scores),
    userId || null
  );
  return info.lastInsertRowid;
}

function listSubmissions() {
  const rows = db
    .prepare(
      `SELECT s.id, s.created_at, s.scores, s.user_id, u.display_name
       FROM submissions s LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.id DESC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    scores: JSON.parse(row.scores),
    userId: row.user_id,
    userDisplayName: row.display_name || null,
  }));
}

function getSubmission(id) {
  const row = db
    .prepare(
      `SELECT s.id, s.created_at, s.answers, s.scores, s.user_id, u.display_name
       FROM submissions s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    answers: JSON.parse(row.answers),
    scores: JSON.parse(row.scores),
    userId: row.user_id,
    userDisplayName: row.display_name || null,
  };
}

function getAttempt(token) {
  const row = db.prepare("SELECT data, next_section, updated_at FROM attempts WHERE token = ?").get(token);
  if (!row) return null;
  return { data: JSON.parse(row.data), nextSection: row.next_section, updatedAt: row.updated_at };
}

function saveAttempt(token, data, nextSection) {
  db.prepare(
    `INSERT INTO attempts (token, data, next_section, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET data = excluded.data, next_section = excluded.next_section, updated_at = excluded.updated_at`
  ).run(token, JSON.stringify(data), nextSection, new Date().toISOString());
}

function deleteAttempt(token) {
  db.prepare("DELETE FROM attempts WHERE token = ?").run(token);
}

function insertLink({ url, title, description, type, tags }) {
  const info = db
    .prepare(
      "INSERT INTO links (url, title, description, type, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(url, title, description, type, JSON.stringify(tags), new Date().toISOString());
  return info.lastInsertRowid;
}

function listLinks() {
  const rows = db.prepare("SELECT * FROM links ORDER BY id DESC").all();
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    type: row.type,
    tags: JSON.parse(row.tags),
    createdAt: row.created_at,
  }));
}

function deleteLink(id) {
  db.prepare("DELETE FROM links WHERE id = ?").run(id);
}

function rowToWikiPage(row) {
  // Decay level 5 → 4 after 3 months (lazy, on read)
  if (row.maturity === 5 && row.maturity_set_at) {
    const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(row.maturity_set_at).getTime() > THREE_MONTHS_MS) {
      db.prepare("UPDATE wiki_pages SET maturity = 4, maturity_set_at = NULL WHERE id = ?").run(row.id);
      row = Object.assign({}, row, { maturity: 4, maturity_set_at: null });
    }
  }
  let imagePaths = JSON.parse(row.image_paths || "[]");
  if (!imagePaths.length && row.image_path) imagePaths = [row.image_path];
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    content: row.content,
    tags: JSON.parse(row.tags),
    imagePaths,
    owned: !!row.owned,
    meta: JSON.parse(row.meta || "{}"),
    // rating/flame/interested : propres a chaque profil, voir content_reactions.
    // Valeurs par defaut ici ; fusionnees avec la reaction du visiteur par les
    // routes via mergeUserReactions()/getUserReaction().
    rating: 0,
    flame: false,
    interested: false,
    views: row.views || 0,
    featured: !!row.featured,
    maturity: row.maturity || 0,
    maturitySetAt: row.maturity_set_at || null,
    extraCategories: (() => { try { return JSON.parse(row.extra_categories || "[]"); } catch (_) { return []; } })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function setWikiPageFeatured(id, featured) {
  db.prepare("UPDATE wiki_pages SET featured = ? WHERE id = ?").run(featured ? 1 : 0, id);
}

function setWikiPageMaturity(id, level) {
  const now = new Date().toISOString();
  const setAt = level === 5 ? now : null;
  db.prepare("UPDATE wiki_pages SET maturity = ?, maturity_set_at = ? WHERE id = ?").run(level, setAt, id);
}

function listFeaturedWikiPages() {
  return db.prepare("SELECT * FROM wiki_pages WHERE featured = 1").all().map(rowToWikiPage);
}

function insertWikiPage({ title, category, content, tags, imagePaths, owned, meta, extraCategories }) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO wiki_pages (title, category, content, tags, image_paths, owned, meta, extra_categories, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, category, content, JSON.stringify(tags), JSON.stringify(imagePaths || []), owned ? 1 : 0, JSON.stringify(meta || {}), JSON.stringify(extraCategories || []), now, now);
  return info.lastInsertRowid;
}

function listWikiPages() {
  const rows = db.prepare("SELECT * FROM wiki_pages ORDER BY id DESC").all();
  return rows.map(rowToWikiPage);
}

function getWikiPage(id) {
  const row = db.prepare("SELECT * FROM wiki_pages WHERE id = ?").get(id);
  if (!row) return null;
  return rowToWikiPage(row);
}

function updateWikiPage(id, { title, category, content, tags, imagePaths, owned, meta, extraCategories }) {
  const existing = db.prepare("SELECT image_paths, image_path FROM wiki_pages WHERE id = ?").get(id);
  if (!existing) return false;
  // Si imagePaths n'est pas fourni, conserver les images existantes
  let finalImagePaths = imagePaths;
  if (finalImagePaths === undefined) {
    finalImagePaths = JSON.parse(existing.image_paths || "[]");
    if (!finalImagePaths.length && existing.image_path) finalImagePaths = [existing.image_path];
  }
  db.prepare(
    `UPDATE wiki_pages SET title = ?, category = ?, content = ?, tags = ?, image_paths = ?, owned = ?, meta = ?, extra_categories = ?, updated_at = ?
     WHERE id = ?`
  ).run(title, category, content, JSON.stringify(tags), JSON.stringify(finalImagePaths), owned ? 1 : 0, JSON.stringify(meta || {}), JSON.stringify(extraCategories || []), new Date().toISOString(), id);
  return true;
}

function reactWikiPage(id, userId, { rating, flame, interested }) {
  setUserReaction(userId, "wiki", id, { rating, flame, interested });
}

function deleteWikiPage(id) {
  db.prepare("DELETE FROM wiki_pages WHERE id = ?").run(id);
}

function getWikiPageLinks(pageId) {
  return db.prepare(
    `SELECT w.id, w.title, w.category FROM wiki_page_links pl
     JOIN wiki_pages w ON w.id = pl.linked_page_id
     WHERE pl.page_id = ? ORDER BY w.title`
  ).all(pageId).map(rowToPageLink);
}

function getWikiBacklinks(pageId) {
  return db.prepare(
    `SELECT w.id, w.title, w.category FROM wiki_page_links pl
     JOIN wiki_pages w ON w.id = pl.page_id
     WHERE pl.linked_page_id = ? ORDER BY w.title`
  ).all(pageId).map(rowToPageLink);
}

function rowToPageLink(row) {
  return { id: row.id, title: row.title, category: row.category };
}

function addWikiPageLink(pageId, linkedPageId) {
  if (pageId === linkedPageId) return;
  db.prepare("INSERT OR IGNORE INTO wiki_page_links (page_id, linked_page_id) VALUES (?, ?)").run(pageId, linkedPageId);
}

function removeWikiPageLink(pageId, linkedPageId) {
  db.prepare("DELETE FROM wiki_page_links WHERE page_id = ? AND linked_page_id = ?").run(pageId, linkedPageId);
}

function getWikiQuestionLinks(wikiPageId) {
  return db.prepare("SELECT section_key, question_id FROM wiki_question_links WHERE wiki_page_id = ? ORDER BY id").all(wikiPageId);
}

function addWikiQuestionLink(wikiPageId, sectionKey, questionId) {
  db.prepare("INSERT OR IGNORE INTO wiki_question_links (wiki_page_id, section_key, question_id) VALUES (?, ?, ?)").run(wikiPageId, sectionKey, questionId);
}

function removeWikiQuestionLink(wikiPageId, sectionKey, questionId) {
  db.prepare("DELETE FROM wiki_question_links WHERE wiki_page_id = ? AND section_key = ? AND question_id = ?").run(wikiPageId, sectionKey, questionId);
}

// Sens inverse : depuis une question du quizz, quelles pages wiki y sont liées.
function getPagesForQuestion(sectionKey, questionId) {
  return db.prepare(`
    SELECT wp.id, wp.title, wp.category
    FROM wiki_question_links wql
    JOIN wiki_pages wp ON wp.id = wql.wiki_page_id
    WHERE wql.section_key = ? AND wql.question_id = ?
    ORDER BY wp.title COLLATE NOCASE
  `).all(sectionKey, questionId);
}

// Pour une section entière : quelles questions ont au moins un lien, afin
// d'afficher le bouton "?" différemment sans faire un aller-retour par
// question au chargement de la page.
function getLinkedQuestionIds(sectionKey) {
  return db.prepare("SELECT DISTINCT question_id FROM wiki_question_links WHERE section_key = ?")
    .all(sectionKey)
    .map((r) => r.question_id);
}

function incrementWikiViews(id, userId) {
  db.prepare("UPDATE wiki_pages SET views = views + 1 WHERE id = ?").run(id);
  db.prepare("INSERT INTO wiki_page_views (page_id, user_id, created_at) VALUES (?, ?, ?)").run(id, userId || null, new Date().toISOString());
}

function logGalleryView(galleryId, userId) {
  db.prepare("INSERT INTO gallery_views (gallery_id, user_id, created_at) VALUES (?, ?, ?)").run(galleryId, userId || null, new Date().toISOString());
}

function logBdView(bookId, userId) {
  db.prepare("INSERT INTO bd_views (book_id, user_id, created_at) VALUES (?, ?, ?)").run(bookId, userId || null, new Date().toISOString());
}

function getWikiKPIs() {
  const totalViews = db.prepare("SELECT COALESCE(SUM(views), 0) AS v FROM wiki_pages").get().v;
  const monthViews = db.prepare(
    "SELECT COUNT(*) AS v FROM wiki_page_views WHERE created_at >= strftime('%Y-%m-01T00:00:00', 'now')"
  ).get().v;
  const weekViews = db.prepare(
    "SELECT COUNT(*) AS v FROM wiki_page_views WHERE created_at >= datetime('now', '-7 days')"
  ).get().v;
  // Top pages all-time via compteur historique (toujours disponible)
  const topPages = db.prepare(
    "SELECT id, title, category, views FROM wiki_pages ORDER BY views DESC LIMIT 20"
  ).all();
  // Top pages par utilisateur (depuis le suivi)
  const topRows = db.prepare(
    `SELECT wpv.user_id, wp.title, wp.id AS page_id, COUNT(*) AS cnt
     FROM wiki_page_views wpv JOIN wiki_pages wp ON wp.id = wpv.page_id
     GROUP BY wpv.user_id, wpv.page_id ORDER BY cnt DESC`
  ).all();
  const topByUser = {};
  topRows.forEach(function(r) {
    const k = String(r.user_id);
    if (!topByUser[k]) topByUser[k] = [];
    if (topByUser[k].length < 5) topByUser[k].push({ title: r.title, pageId: r.page_id, views: r.cnt });
  });
  // Tous les utilisateurs connus + vues depuis le suivi (LEFT JOIN = 0 si aucune vue)
  const knownRows = db.prepare(
    `SELECT u.id, u.display_name, COUNT(wpv.id) AS views
     FROM users u LEFT JOIN wiki_page_views wpv ON wpv.user_id = u.id
     GROUP BY u.id ORDER BY views DESC`
  ).all();
  const anonViews = db.prepare("SELECT COUNT(*) AS c FROM wiki_page_views WHERE user_id IS NULL").get().c;
  const perUser = knownRows.map(function(r) {
    return { userId: r.id, displayName: r.display_name, views: r.views, topPages: topByUser[String(r.id)] || [] };
  });
  if (anonViews > 0) perUser.push({ userId: null, displayName: "Anonyme", views: anonViews, topPages: topByUser["null"] || [] });
  return { totalViews, monthViews, weekViews, topPages, perUser };
}

function getGalleryKPIs() {
  const totalViews = db.prepare("SELECT COUNT(*) AS v FROM gallery_views").get().v;
  const monthViews = db.prepare(
    "SELECT COUNT(*) AS v FROM gallery_views WHERE created_at >= strftime('%Y-%m-01T00:00:00', 'now')"
  ).get().v;
  const weekViews = db.prepare(
    "SELECT COUNT(*) AS v FROM gallery_views WHERE created_at >= datetime('now', '-7 days')"
  ).get().v;
  // Top images et BD séparés par consultation
  const topAllRows = db.prepare(
    `SELECT gi.id, gi.title, gi.content_type, COUNT(*) AS views
     FROM gallery_views gv JOIN gallery_images gi ON gi.id = gv.gallery_id
     GROUP BY gv.gallery_id ORDER BY views DESC LIMIT 60`
  ).all();
  const topImages = topAllRows.filter(function(r) { return r.content_type !== "bd"; }).slice(0, 20);
  const topBd     = topAllRows.filter(function(r) { return r.content_type === "bd"; }).slice(0, 20);
  // Si pas encore de consultations enregistrées, fallback par somme des
  // notes (content_reactions, tous profils confondus — vue admin agrégée,
  // contrairement aux listes "mes notes" qui restent propres à chaque profil).
  const topImagesFallback = topImages.length === 0
    ? db.prepare(
        `SELECT gi.id, gi.title, gi.content_type, SUM(cr.rating) AS views
         FROM gallery_images gi JOIN content_reactions cr ON cr.item_type = 'gallery' AND cr.item_id = gi.id
         WHERE gi.content_type != 'bd' GROUP BY gi.id HAVING SUM(cr.rating) > 0 ORDER BY views DESC LIMIT 20`
      ).all()
    : null;
  const topBdFallback = topBd.length === 0
    ? db.prepare(
        `SELECT gi.id, gi.title, gi.content_type, SUM(cr.rating) AS views
         FROM gallery_images gi JOIN content_reactions cr ON cr.item_type = 'gallery' AND cr.item_id = gi.id
         WHERE gi.content_type = 'bd' GROUP BY gi.id HAVING SUM(cr.rating) > 0 ORDER BY views DESC LIMIT 20`
      ).all()
    : null;
  // Top images par utilisateur
  const topRows = db.prepare(
    `SELECT gv.user_id, gi.title, gi.id AS gallery_id, COUNT(*) AS cnt
     FROM gallery_views gv JOIN gallery_images gi ON gi.id = gv.gallery_id
     GROUP BY gv.user_id, gv.gallery_id ORDER BY cnt DESC`
  ).all();
  const topByUser = {};
  topRows.forEach(function(r) {
    const k = String(r.user_id);
    if (!topByUser[k]) topByUser[k] = [];
    if (topByUser[k].length < 5) topByUser[k].push({ title: r.title, galleryId: r.gallery_id, views: r.cnt });
  });
  // Tous les utilisateurs connus + consultations depuis le suivi
  const knownRows = db.prepare(
    `SELECT u.id, u.display_name, COUNT(gv.id) AS views
     FROM users u LEFT JOIN gallery_views gv ON gv.user_id = u.id
     GROUP BY u.id ORDER BY views DESC`
  ).all();
  const anonViews = db.prepare("SELECT COUNT(*) AS c FROM gallery_views WHERE user_id IS NULL").get().c;
  const perUser = knownRows.map(function(r) {
    return { userId: r.id, displayName: r.display_name, views: r.views, topImages: topByUser[String(r.id)] || [] };
  });
  if (anonViews > 0) perUser.push({ userId: null, displayName: "Anonyme", views: anonViews, topImages: topByUser["null"] || [] });
  return {
    totalViews, monthViews, weekViews,
    topImages: topImages.length ? topImages : (topImagesFallback || []),
    topBd:     topBd.length     ? topBd     : (topBdFallback     || []),
    topImagesFallback: !!topImagesFallback,
    topBdFallback:     !!topBdFallback,
    perUser,
  };
}

function getUserDetail(id) {
  const user = getUserById(id);
  if (!user) return null;
  const favorites = db.prepare(
    `SELECT f.item_type, f.item_id, f.created_at,
       COALESCE(wp.title, gi.title, bb.title, '') AS title,
       wp.image_paths AS wiki_img, wp.category AS wiki_category,
       gi.image_paths AS gal_img,
       bb.image_paths AS bd_img
     FROM favorites f
     LEFT JOIN wiki_pages wp ON f.item_type = 'wiki' AND f.item_id = wp.id
     LEFT JOIN gallery_images gi ON f.item_type = 'gallery' AND f.item_id = gi.id
     LEFT JOIN bd_books bb ON f.item_type = 'bd' AND f.item_id = bb.id
     WHERE f.user_id = ? ORDER BY f.id DESC`
  ).all(id).map(function(r) {
    const wikiImgs = r.wiki_img ? (function(){ try { return JSON.parse(r.wiki_img); } catch(_){ return []; } })() : [];
    const galImgs  = r.gal_img  ? (function(){ try { return JSON.parse(r.gal_img);  } catch(_){ return []; } })() : [];
    const bdImgs   = r.bd_img   ? (function(){ try { return JSON.parse(r.bd_img);   } catch(_){ return []; } })() : [];
    const coverImg = r.item_type === "wiki" ? wikiImgs[0] : r.item_type === "gallery" ? galImgs[0] : bdImgs[0];
    return {
      itemType: r.item_type,
      itemId:   r.item_id,
      createdAt: r.created_at,
      title:    r.title || "",
      coverImg: coverImg || null,
      category: r.wiki_category || null,
    };
  });
  const notes = db.prepare(
    `SELECT wpun.page_id, wpun.content, wpun.updated_at, wp.title
     FROM wiki_page_user_notes wpun JOIN wiki_pages wp ON wp.id = wpun.page_id
     WHERE wpun.user_id = ? AND wpun.content != ''
     ORDER BY wpun.updated_at DESC`
  ).all(id).map(function(r) {
    return { pageId: r.page_id, title: r.title, content: r.content, updatedAt: r.updated_at };
  });
  const recentWikiViews = db.prepare(
    `SELECT wpv.created_at, wp.id AS page_id, wp.title
     FROM wiki_page_views wpv JOIN wiki_pages wp ON wp.id = wpv.page_id
     WHERE wpv.user_id = ? ORDER BY wpv.id DESC LIMIT 30`
  ).all(id).map(function(r) {
    return { createdAt: r.created_at, pageId: r.page_id, title: r.title };
  });
  // Top wiki pages by view count for this user
  const wikiViewCounts = db.prepare(
    `SELECT wp.id AS page_id, wp.title, COUNT(*) AS view_count
     FROM wiki_page_views wpv JOIN wiki_pages wp ON wp.id = wpv.page_id
     WHERE wpv.user_id = ? GROUP BY wpv.page_id ORDER BY view_count DESC LIMIT 20`
  ).all(id).map(function(r) {
    return { pageId: r.page_id, title: r.title, viewCount: r.view_count };
  });
  const recentGalViews = db.prepare(
    `SELECT gv.created_at, gi.id AS gallery_id, gi.title, gi.content_type
     FROM gallery_views gv JOIN gallery_images gi ON gi.id = gv.gallery_id
     WHERE gv.user_id = ? ORDER BY gv.id DESC LIMIT 30`
  ).all(id).map(function(r) {
    return { createdAt: r.created_at, galleryId: r.gallery_id, title: r.title, contentType: r.content_type };
  });
  // Top gallery items by view count for this user
  const galViewCounts = db.prepare(
    `SELECT gi.id AS gallery_id, gi.title, gi.content_type, COUNT(*) AS view_count
     FROM gallery_views gv JOIN gallery_images gi ON gi.id = gv.gallery_id
     WHERE gv.user_id = ? GROUP BY gv.gallery_id ORDER BY view_count DESC LIMIT 20`
  ).all(id).map(function(r) {
    return { galleryId: r.gallery_id, title: r.title, contentType: r.content_type, viewCount: r.view_count };
  });
  const recentBdViews = db.prepare(
    `SELECT bv.created_at, bb.id AS book_id, bb.title
     FROM bd_views bv JOIN bd_books bb ON bb.id = bv.book_id
     WHERE bv.user_id = ? ORDER BY bv.id DESC LIMIT 30`
  ).all(id).map(function(r) {
    return { createdAt: r.created_at, bookId: r.book_id, title: r.title };
  });
  const bdViewCounts = db.prepare(
    `SELECT bb.id AS book_id, bb.title, COUNT(*) AS view_count
     FROM bd_views bv JOIN bd_books bb ON bb.id = bv.book_id
     WHERE bv.user_id = ? GROUP BY bv.book_id ORDER BY view_count DESC LIMIT 20`
  ).all(id).map(function(r) {
    return { bookId: r.book_id, title: r.title, viewCount: r.view_count };
  });
  return { user, favorites, notes, recentWikiViews, wikiViewCounts, recentGalViews, galViewCounts, recentBdViews, bdViewCounts };
}

function getImageLinks(src) {
  return db.prepare(
    `SELECT w.id, w.title, w.category FROM wiki_image_links il
     JOIN wiki_pages w ON w.id = il.page_id
     WHERE il.src = ? ORDER BY w.title`
  ).all(src);
}

function addImageLink(src, pageId) {
  db.prepare("INSERT OR IGNORE INTO wiki_image_links (src, page_id) VALUES (?, ?)").run(src, pageId);
}

function removeImageLink(src, pageId) {
  db.prepare("DELETE FROM wiki_image_links WHERE src = ? AND page_id = ?").run(src, pageId);
}

function rowToBdBook(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    tags: JSON.parse(row.tags || "[]"),
    imagePaths: JSON.parse(row.image_paths || "[]"),
    rating: row.rating || 0,
    flame: !!row.flame,
    interested: !!row.interested,
    langue: row.langue || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listBdBooks() {
  return db.prepare("SELECT * FROM bd_books ORDER BY updated_at DESC").all().map(rowToBdBook);
}

function getBdBook(id) {
  const row = db.prepare("SELECT * FROM bd_books WHERE id = ?").get(id);
  return row ? rowToBdBook(row) : null;
}

function insertBdBook({ title, description, tags, imagePaths, langue }) {
  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO bd_books (title, description, tags, image_paths, langue, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(title, description, JSON.stringify(tags || []), JSON.stringify(imagePaths || []), langue || "", now, now);
  return info.lastInsertRowid;
}

function updateBdBook(id, { title, description, tags, imagePaths, langue }) {
  db.prepare(
    `UPDATE bd_books SET title = ?, description = ?, tags = ?, image_paths = ?, langue = ?, updated_at = ? WHERE id = ?`
  ).run(title, description, JSON.stringify(tags || []), JSON.stringify(imagePaths || []), langue || "", new Date().toISOString(), id);
}

function deleteBdBook(id) {
  db.prepare("DELETE FROM bd_books WHERE id = ?").run(id);
}

function reactBdBook(id, { rating, flame, interested }) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  db.prepare("UPDATE bd_books SET rating = ?, flame = ?, interested = ? WHERE id = ?")
    .run(r, flame ? 1 : 0, interested ? 1 : 0, id);
}

function rowToGalleryImage(row) {
  let imagePaths = [];
  try { imagePaths = JSON.parse(row.image_paths || "[]"); } catch (_) {}
  if (!imagePaths.length && row.filename) imagePaths = [row.filename];
  return {
    id: row.id,
    filename: imagePaths[0] || row.filename,
    imagePaths,
    title: row.title || "",
    category: row.category || "",
    tags: (() => { try { return JSON.parse(row.tags || "[]"); } catch(_) { return []; } })(),
    notes: row.notes || "",
    author: row.author || "",
    parody: row.parody || "",
    // rating/flame/interested : propres a chaque profil, voir content_reactions
    // (memes remarques que rowToWikiPage ci-dessus).
    rating: 0,
    flame: false,
    interested: false,
    wikiPageId: row.wiki_page_id || null,
    contentType: row.content_type || "image",
    processed: !!row.processed,
    featured: !!row.featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listGalleryImages() {
  return db.prepare("SELECT * FROM gallery_images ORDER BY created_at DESC").all().map(rowToGalleryImage);
}

function getGalleryImage(id) {
  const row = db.prepare("SELECT * FROM gallery_images WHERE id = ?").get(id);
  return row ? rowToGalleryImage(row) : null;
}

function insertGalleryImage({ imagePaths, title, tags, notes, category, wikiPageId, author, parody, contentType }) {
  const now = new Date().toISOString();
  const paths = imagePaths || [];
  const info = db.prepare(
    `INSERT INTO gallery_images (filename, image_paths, title, tags, notes, category, wiki_page_id, author, parody, content_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(paths[0] || "", JSON.stringify(paths), title || "", JSON.stringify(tags || []), notes || "", category || "", wikiPageId || null, author || "", parody || "", contentType === "bd" ? "bd" : "image", now, now);
  return info.lastInsertRowid;
}

function updateGalleryImage(id, { title, category, tags, notes, imagePaths, wikiPageId, author, parody, contentType }) {
  const existing = db.prepare("SELECT image_paths, filename, content_type FROM gallery_images WHERE id = ?").get(id);
  if (!existing) return false;
  // Si imagePaths n'est pas fourni, conserver les images existantes
  let finalImagePaths = imagePaths;
  if (finalImagePaths === undefined) {
    finalImagePaths = JSON.parse(existing.image_paths || "[]");
    if (!finalImagePaths.length && existing.filename) finalImagePaths = [existing.filename];
  }
  const finalContentType = contentType !== undefined ? (contentType === "bd" ? "bd" : "image") : (existing.content_type || "image");
  db.prepare(
    `UPDATE gallery_images SET title = ?, category = ?, tags = ?, notes = ?, filename = ?, image_paths = ?, wiki_page_id = ?, author = ?, parody = ?, content_type = ?, updated_at = ?
     WHERE id = ?`
  ).run(title || "", category || "", JSON.stringify(tags || []), notes || "", finalImagePaths[0] || "", JSON.stringify(finalImagePaths), wikiPageId || null, author || "", parody || "", finalContentType, new Date().toISOString(), id);
  return true;
}

function reactGalleryImage(id, userId, { rating, flame, interested }) {
  setUserReaction(userId, "gallery", id, { rating, flame, interested });
}

function deleteGalleryImage(id) {
  db.prepare("DELETE FROM gallery_images WHERE id = ?").run(id);
}

function listGalleryAuthors() {
  return db.prepare("SELECT DISTINCT author FROM gallery_images WHERE author != '' ORDER BY author COLLATE NOCASE").all().map(r => r.author);
}
function listGalleryParodies() {
  return db.prepare("SELECT DISTINCT parody FROM gallery_images WHERE parody != '' ORDER BY parody COLLATE NOCASE").all().map(r => r.parody);
}

function updateGalleryImageMeta(id, { tags, author, parody, title, notes, processed } = {}) {
  const sets = ["tags = ?", "author = ?", "parody = ?", "updated_at = ?"];
  const params = [JSON.stringify(tags || []), author || "", parody || "", new Date().toISOString()];
  if (title !== undefined) { sets.splice(sets.length - 1, 0, "title = ?"); params.splice(params.length - 1, 0, title); }
  if (notes !== undefined) { sets.splice(sets.length - 1, 0, "notes = ?"); params.splice(params.length - 1, 0, notes); }
  if (typeof processed === "number") { sets.splice(sets.length - 1, 0, "processed = ?"); params.splice(params.length - 1, 0, processed); }
  params.push(id);
  db.prepare(`UPDATE gallery_images SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return true;
}

// ── Tag metadata ──────────────────────────────────────────────────────────
const VALID_TAG_TYPES = new Set(["normal", "ultra", "irrealiste"]);
// Migration : les tags en type "fantaisie" rejoignent "irrealiste"
try { db.exec("UPDATE tag_meta SET type='irrealiste' WHERE type='fantaisie'"); } catch (_) {}

function getAllTagMeta() {
  const rows = db.prepare("SELECT tag, type FROM tag_meta").all();
  const result = {};
  rows.forEach((r) => { result[r.tag] = r.type; });
  return result;
}

function setTagType(tag, type) {
  if (!VALID_TAG_TYPES.has(type)) type = "normal";
  db.prepare("INSERT OR REPLACE INTO tag_meta (tag, type) VALUES (?, ?)").run(tag, type);
}

function createStandaloneTag(tag) {
  const t = String(tag || "").trim();
  if (!t) return false;
  db.prepare("INSERT OR IGNORE INTO tag_meta (tag, type) VALUES (?, 'normal')").run(t);
  return true;
}

function deleteUser(id) {
  db.prepare("DELETE FROM favorites WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM wiki_page_user_notes WHERE user_id = ?").run(id);
  db.prepare("UPDATE submissions SET user_id = NULL WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM attempts WHERE token = ?").run("user:" + id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

function getUserFavoritesWithDetails(userId) {
  return db.prepare(
    `SELECT f.item_type, f.item_id, f.created_at,
       COALESCE(wp.title, gi.title, '') AS title
     FROM favorites f
     LEFT JOIN wiki_pages wp ON f.item_type = 'wiki' AND f.item_id = wp.id
     LEFT JOIN gallery_images gi ON f.item_type = 'gallery' AND f.item_id = gi.id
     WHERE f.user_id = ?
     ORDER BY f.id DESC`
  ).all(userId).map(function(r) {
    return { itemType: r.item_type, itemId: r.item_id, createdAt: r.created_at, title: r.title || "" };
  });
}

function logConnection(userId, ip, userAgent) {
  db.prepare(
    "INSERT INTO connection_logs (user_id, ip, user_agent, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId || null, ip || "", userAgent || "", new Date().toISOString());
}

function listConnectionLogs(limit) {
  return db.prepare(
    `SELECT cl.id, cl.user_id, cl.ip, cl.user_agent, cl.created_at, u.display_name
     FROM connection_logs cl
     LEFT JOIN users u ON u.id = cl.user_id
     ORDER BY cl.id DESC LIMIT ?`
  ).all(limit || 200).map(function(r) {
    return { id: r.id, userId: r.user_id, ip: r.ip, userAgent: r.user_agent, createdAt: r.created_at, userDisplayName: r.display_name || null };
  });
}

function listConnectionLogsForUser(userId, limit) {
  return db.prepare(
    "SELECT id, ip, user_agent, created_at FROM connection_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?"
  ).all(userId, limit || 20).map(function(r) {
    return { id: r.id, ip: r.ip, userAgent: r.user_agent, createdAt: r.created_at };
  });
}

// connection_logs ne trace que les connexions explicites (saisie du mot de
// passe). Pour savoir aussi quand un profil est "juste sur le site", on
// enregistre un ping discret à chaque requête dynamique (voir server.js),
// throttlé pour ne pas remplir la table à chaque clic.
const ACTIVITY_PING_THROTTLE_MS = 3 * 60 * 1000; // 1 ping max toutes les 3 min / profil
const ACTIVITY_SESSION_GAP_MS = 30 * 60 * 1000; // > 30 min sans ping = nouvelle session

function recordActivityPing(userId) {
  if (!userId) return;
  const last = db
    .prepare("SELECT created_at FROM activity_pings WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .get(userId);
  const now = Date.now();
  if (last && now - new Date(last.created_at).getTime() < ACTIVITY_PING_THROTTLE_MS) return;
  db.prepare("INSERT INTO activity_pings (user_id, created_at) VALUES (?, ?)").run(userId, new Date(now).toISOString());
}

// Regroupe les pings bruts en "sessions" de présence : deux pings séparés de
// plus de ACTIVITY_SESSION_GAP_MS appartiennent à deux passages distincts sur
// le site. La durée d'une session est l'écart entre son premier et son
// dernier ping (sous-estimée pour une session à un seul ping, faute de mieux).
function listActivitySessions(userId, limit) {
  const pings = db
    .prepare("SELECT created_at FROM activity_pings WHERE user_id = ? ORDER BY id DESC LIMIT 1000")
    .all(userId)
    .map(function(r) { return new Date(r.created_at).getTime(); })
    .sort(function(a, b) { return a - b; });

  const sessions = [];
  pings.forEach(function(t) {
    const current = sessions[sessions.length - 1];
    if (current && t - current.end <= ACTIVITY_SESSION_GAP_MS) {
      current.end = t;
      current.pings += 1;
    } else {
      sessions.push({ start: t, end: t, pings: 1 });
    }
  });

  return sessions.reverse().slice(0, limit || 30).map(function(s) {
    return {
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      durationMinutes: Math.max(1, Math.round((s.end - s.start) / 60000)),
      pings: s.pings,
    };
  });
}

function setGalleryImageFeatured(id, featured) {
  db.prepare("UPDATE gallery_images SET featured = ? WHERE id = ?").run(featured ? 1 : 0, id);
}

function renameTagEverywhere(oldTag, newTag) {
  const now = new Date().toISOString();
  const tables = [
    { name: "wiki_pages",      hasUpdatedAt: true  },
    { name: "gallery_images",  hasUpdatedAt: true  },
    { name: "bd_books",        hasUpdatedAt: true  },
    { name: "links",           hasUpdatedAt: false },
  ];
  for (const { name, hasUpdatedAt } of tables) {
    const rows = db.prepare(`SELECT id, tags FROM ${name}`).all();
    for (const row of rows) {
      try {
        const tags = JSON.parse(row.tags || "[]");
        const idx = tags.findIndex((t) => String(t).toLowerCase().trim() === oldTag.toLowerCase());
        if (idx === -1) continue;
        tags[idx] = newTag;
        if (hasUpdatedAt) {
          db.prepare(`UPDATE ${name} SET tags = ?, updated_at = ? WHERE id = ?`)
            .run(JSON.stringify(tags), now, row.id);
        } else {
          db.prepare(`UPDATE ${name} SET tags = ? WHERE id = ?`)
            .run(JSON.stringify(tags), row.id);
        }
      } catch (_) {}
    }
  }
  // Déplace les métadonnées vers le nouveau nom
  const meta = db.prepare("SELECT type FROM tag_meta WHERE tag = ?").get(oldTag);
  if (meta) {
    db.prepare("DELETE FROM tag_meta WHERE tag = ?").run(oldTag);
    db.prepare("INSERT OR IGNORE INTO tag_meta (tag, type) VALUES (?, ?)").run(newTag, meta.type);
  }
}

module.exports = {
  db,
  insertSubmission,
  listSubmissions,
  getSubmission,
  getAttempt,
  saveAttempt,
  deleteAttempt,
  insertLink,
  listLinks,
  deleteLink,
  insertWikiPage,
  listWikiPages,
  reactWikiPage,
  getWikiPage,
  updateWikiPage,
  deleteWikiPage,
  getWikiPageLinks,
  getWikiBacklinks,
  addWikiPageLink,
  removeWikiPageLink,
  getWikiQuestionLinks,
  addWikiQuestionLink,
  removeWikiQuestionLink,
  getPagesForQuestion,
  getLinkedQuestionIds,
  incrementWikiViews,
  getImageLinks,
  addImageLink,
  removeImageLink,
  listGalleryImages,
  getGalleryImage,
  insertGalleryImage,
  updateGalleryImage,
  reactGalleryImage,
  deleteGalleryImage,
  listGalleryAuthors,
  listGalleryParodies,
  updateGalleryImageMeta,
  setWikiPageFeatured,
  setWikiPageMaturity,
  listFeaturedWikiPages,
  listBdBooks,
  getBdBook,
  insertBdBook,
  updateBdBook,
  deleteBdBook,
  reactBdBook,
  getUserByUsername,
  getUserCredentials,
  getUserById,
  listUsers,
  createUser,
  updateUser,
  updateOwnProfile,
  updateUserSettings,
  updateUserPassword,
  touchLastLogin,
  addFavorite,
  removeFavorite,
  isFavorite,
  listFavoriteRows,
  countFavorites,
  getUserReaction,
  getUserReactionStats,
  countUserNotes,
  getUserReactionsMap,
  mergeUserReactions,
  setUserReaction,
  getUserNote,
  setUserNote,
  getAllTagMeta,
  setTagType,
  createStandaloneTag,
  renameTagEverywhere,
  deleteUser,
  getUserFavoritesWithDetails,
  logConnection,
  listConnectionLogs,
  listConnectionLogsForUser,
  recordActivityPing,
  listActivitySessions,
  listBlacklistedTags,
  addBlacklistedTag,
  removeBlacklistedTag,
  setGalleryImageFeatured,
  logGalleryView,
  logBdView,
  getWikiKPIs,
  getGalleryKPIs,
  getUserDetail,
  createSeries,
  deleteSeries,
  updateSeriesTitle,
  listSeries,
  getSeries,
  getSeriesImages,
  getImageSeries,
  getSeriesNav,
  addToSeries,
  removeFromSeries,
  reorderSeries,
  getSeriesMapForIds,
};
