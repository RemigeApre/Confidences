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
// La distinction "bd" dans la Galerie était une tentative abandonnée (le
// vrai suivi BD vit dans bd_books, voir plus bas) : on referme les quelques
// fiches restées marquées "bd" en simples images, idempotent sans garde.
try { db.exec("UPDATE gallery_images SET content_type = 'image' WHERE content_type = 'bd'"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN processed INTEGER NOT NULL DEFAULT 0"); } catch(_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN featured INTEGER NOT NULL DEFAULT 0"); } catch(_) {}
// Distingue une fiche créée automatiquement à partir d'une image de page
// codex (voir syncPageGalleryImages, routes/wiki.js) d'une fiche liée
// manuellement via l'upload direct dans la Galerie (champ "Page codex" du
// formulaire) : seules les premières sont géré/nettoyées par la synchro —
// on ne doit jamais toucher aux images/tags d'une fiche liée à la main.
try { db.exec("ALTER TABLE gallery_images ADD COLUMN wiki_synced INTEGER NOT NULL DEFAULT 0"); } catch(_) {}

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
// Durée de rétention de la page /favoris/historique (voir routes/favorites.js) :
// filtre uniquement ce qui s'affiche sur cette page, ne supprime jamais les
// vues elles-mêmes (utilisées ailleurs par les stats admin).
try { db.exec("ALTER TABLE users ADD COLUMN history_retention TEXT NOT NULL DEFAULT '1mois'"); } catch (_) {}
// Mode couple (lié par l'admin uniquement, voir /admin) : relation
// symétrique 1↔1, stockée en miroir sur les deux comptes pour qu'un simple
// SELECT suffise à retrouver le/la partenaire de n'importe quel profil, sans
// jointure OR coûteuse. setCouplePartners()/clearCouplePartner() ci-dessous
// garantissent qu'un profil n'a jamais plus d'un·e partenaire à la fois.
try { db.exec("ALTER TABLE users ADD COLUMN partner_id INTEGER"); } catch (_) {}
// Visibilité de "Nos objets" (bouton + étoiles "Possédé" sur le Codex) :
// réservée par défaut à l'admin, activable au cas par cas pour un profil
// depuis sa fiche admin — jamais réglable par le profil lui-même.
try { db.exec("ALTER TABLE users ADD COLUMN can_see_owned INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
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
// "À lire plus tard" (Codex uniquement pour l'instant, voir /favoris/a-lire-plus-tard) :
// même table que les autres réactions personnelles, par profil.
try { db.exec("ALTER TABLE content_reactions ADD COLUMN read_later INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
// "Masquer" (Codex/Images/BD, voir /favoris/masques) : contenu retiré des
// listings pour ce seul profil, jamais supprimé ni masqué pour les autres.
try { db.exec("ALTER TABLE content_reactions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
// "Déjà pratiqué" (Codex, voir le carré de 4 boutons sur wiki-detail.ejs) :
// même table que les autres réactions personnelles, par profil.
try { db.exec("ALTER TABLE content_reactions ADD COLUMN practiced INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

// Note/j'adore/masquer BD, individuels PAR PAGE (et non plus pour le livre
// entier, voir reactBdPage ci-dessous) : le livre garde malgré tout un
// agrégat à jour dans content_reactions (item_type='bd') — note = max des
// pages, j'adore = au moins une page — pour que /bd, les listes "notes" et
// "masqués" et l'admin continuent de fonctionner sans changement.
// Clé = chemin de l'image (page_src), jamais l'index de position : un
// réordonnancement ou un retrait de page (formulaire admin, glisser-déposer
// existant) décale les positions et aurait sinon mélangé les notes d'une
// page sur l'autre — le chemin de fichier, lui, ne bouge jamais.
try {
  const bdPageCols = db.prepare("PRAGMA table_info(bd_page_reactions)").all();
  if (bdPageCols.some((c) => c.name === "page_index")) {
    // Ancien schéma (indexé par position) créé plus tôt dans cette même
    // session, jamais exposé à un vrai profil : on repart d'une table vide.
    db.exec("DROP TABLE bd_page_reactions");
  }
} catch (_) {}
db.exec(`
  CREATE TABLE IF NOT EXISTS bd_page_reactions (
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    page_src TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 0,
    flame INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, book_id, page_src)
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
// Tables de logs "append-only" (une ligne par vue/connexion, jamais purgées) :
// grossissent en continu, donc indexées dès le départ plutôt que d'attendre
// qu'un scan complet devienne perceptible. Utilisées par les JOIN/GROUP BY
// des KPI admin (src/db.js ~ligne 1000+) et par les compteurs par page.
db.exec(`CREATE INDEX IF NOT EXISTS idx_wiki_page_views_page ON wiki_page_views (page_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_wiki_page_views_user ON wiki_page_views (user_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gallery_id INTEGER NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_views_gallery ON gallery_views (gallery_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_views_user ON gallery_views (user_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bd_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bd_views_book ON bd_views (book_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS connection_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_connection_logs_user ON connection_logs (user_id)`);

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

// Profils de recherche personnels (voir bouton "Enregistrer le filtre" dans
// les volets Codex/Galerie) : une combinaison de filtres nommée par le
// profil qui l'a créée, strictement privée — même logique de portée que
// tag_blacklist ci-dessus. "state" est un blob JSON opaque pour le serveur
// (whatever public/wiki.js ou public/gallery.js y a mis), jamais interprété
// côté serveur, juste stocké/restitué tel quel.
db.exec(`
  CREATE TABLE IF NOT EXISTS filter_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    section TEXT NOT NULL,
    name TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_filter_profiles_user ON filter_profiles (user_id, section)`);

function listFilterProfiles(userId, section) {
  return db.prepare(
    "SELECT id, name, state FROM filter_profiles WHERE user_id = ? AND section = ? ORDER BY created_at ASC"
  ).all(userId, section).map(function(r) {
    let state = {};
    try { state = JSON.parse(r.state || "{}"); } catch (_) {}
    return { id: r.id, name: r.name, state: state };
  });
}

function createFilterProfile(userId, section, name, state) {
  const info = db.prepare(
    "INSERT INTO filter_profiles (user_id, section, name, state, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, section, name, JSON.stringify(state || {}), new Date().toISOString());
  return info.lastInsertRowid;
}

function deleteFilterProfile(userId, id) {
  db.prepare("DELETE FROM filter_profiles WHERE user_id = ? AND id = ?").run(userId, id);
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
    historyRetention: row.history_retention || "1mois",
    partnerId: row.partner_id || null,
    canSeeOwned: !!row.can_see_owned,
  };
}

// Lie deux profils en couple (relation stockée en miroir, voir la colonne
// partner_id ci-dessus). Casse d'abord toute liaison existante des deux
// côtés : un profil n'a jamais plus d'un·e partenaire à la fois.
function setCouplePartners(userIdA, userIdB) {
  clearCouplePartner(userIdA);
  clearCouplePartner(userIdB);
  db.prepare("UPDATE users SET partner_id = ? WHERE id = ?").run(userIdB, userIdA);
  db.prepare("UPDATE users SET partner_id = ? WHERE id = ?").run(userIdA, userIdB);
}

function clearCouplePartner(userId) {
  const row = db.prepare("SELECT partner_id FROM users WHERE id = ?").get(userId);
  if (row && row.partner_id) db.prepare("UPDATE users SET partner_id = NULL WHERE id = ?").run(row.partner_id);
  db.prepare("UPDATE users SET partner_id = NULL WHERE id = ?").run(userId);
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
function updateUser(id, { username, displayName, isAdmin, isTest, sexe, canSeeOwned }) {
  const current = canSeeOwned === undefined ? getUserById(id) : null;
  const cso = canSeeOwned !== undefined ? (canSeeOwned ? 1 : 0) : (current && current.canSeeOwned ? 1 : 0);
  db.prepare(
    "UPDATE users SET username = ?, display_name = ?, is_admin = ?, is_test = ?, sexe = ?, can_see_owned = ?, updated_at = ? WHERE id = ?"
  ).run(username, displayName, isAdmin ? 1 : 0, isTest ? 1 : 0, sexe || "", cso, new Date().toISOString(), id);
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
const HISTORY_RETENTION_VALUES = ["3jours", "1semaine", "1mois", "3mois"];

// Reglages "Goûts"/"Paramètres" (voir /favoris) : mise a jour partielle,
// chaque champ omis garde sa valeur actuelle (sauvegarde instantanee par
// champ, pas un gros formulaire soumis d'un coup).
function updateUserSettings(id, { orientation, ultraMode, irrealisteMode, shareNotesWithAdmin, historyRetention }) {
  const current = getUserById(id);
  if (!current) return;
  const o  = orientation   !== undefined && ORIENTATION_VALUES.includes(orientation)   ? orientation   : current.orientation;
  const um = ultraMode     !== undefined && SPECIAL_MODE_VALUES.includes(ultraMode)     ? ultraMode     : current.ultraMode;
  const im = irrealisteMode !== undefined && SPECIAL_MODE_VALUES.includes(irrealisteMode) ? irrealisteMode : current.irrealisteMode;
  const snwa = shareNotesWithAdmin !== undefined ? (shareNotesWithAdmin ? 1 : 0) : (current.shareNotesWithAdmin ? 1 : 0);
  const hr = historyRetention !== undefined && HISTORY_RETENTION_VALUES.includes(historyRetention) ? historyRetention : current.historyRetention;
  db.prepare(
    "UPDATE users SET orientation = ?, ultra_mode = ?, irrealiste_mode = ?, share_notes_with_admin = ?, history_retention = ? WHERE id = ?"
  ).run(o, um, im, snwa, hr, id);
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

const REACTION_DEFAULT = { rating: 0, flame: false, interested: false, readLater: false, hidden: false, practiced: false };

function getUserReaction(userId, itemType, itemId) {
  if (!userId) return { ...REACTION_DEFAULT };
  const row = db.prepare(
    "SELECT rating, flame, interested, read_later, hidden, practiced FROM content_reactions WHERE user_id = ? AND item_type = ? AND item_id = ?"
  ).get(userId, itemType, itemId);
  return row ? { rating: row.rating, flame: !!row.flame, interested: !!row.interested, readLater: !!row.read_later, hidden: !!row.hidden, practiced: !!row.practiced } : { ...REACTION_DEFAULT };
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
  db.prepare("SELECT item_id, rating, flame, interested, read_later, hidden, practiced FROM content_reactions WHERE user_id = ? AND item_type = ?")
    .all(userId, itemType)
    .forEach((r) => { map[r.item_id] = { rating: r.rating, flame: !!r.flame, interested: !!r.interested, readLater: !!r.read_later, hidden: !!r.hidden, practiced: !!r.practiced }; });
  return map;
}

// Fusionne la reaction personnelle du visiteur (userId) sur une liste
// d'objets contenu (pages wiki, images galerie...) issus de listXxx().
function mergeUserReactions(items, userId, itemType) {
  const map = getUserReactionsMap(userId, itemType);
  return items.map((item) => Object.assign(item, map[item.id] || { ...REACTION_DEFAULT }));
}

// "Masquer" (voir /favoris/masques) : retire du listing les items que ce
// profil a masqués — s'utilise après mergeUserReactions (qui pose .hidden),
// jamais avant. Sans effet pour un visiteur non connecté (.hidden toujours
// false via REACTION_DEFAULT).
function excludeHidden(items) {
  return items.filter((item) => !item.hidden);
}

// Mode couple (voir setCouplePartners) : fusionne la réaction du/de la
// partenaire sur une liste déjà passée par mergeUserReactions, dans un champ
// à part (partnerReaction) pour ne jamais écraser la réaction personnelle du
// visiteur courant. null si le/la partenaire n'a rien noté sur cet item —
// c'est ce null qui commande l'affichage de la petite fleur (item.
// partnerReaction truthy) et sa révélation détaillée une fois que le
// visiteur a lui-même noté (voir wiki-detail.ejs / gallery.ejs).
function mergePartnerReaction(items, partnerId, itemType) {
  if (!partnerId) return items;
  const map = getUserReactionsMap(partnerId, itemType);
  items.forEach((item) => {
    const r = map[item.id];
    item.partnerReaction = (r && (r.rating > 0 || r.flame || r.interested)) ? r : null;
  });
  return items;
}

function setUserReaction(userId, itemType, itemId, { rating, flame, interested, readLater, hidden, practiced }) {
  const current = getUserReaction(userId, itemType, itemId);
  const r = rating !== undefined ? Math.max(0, Math.min(5, Number(rating) || 0)) : current.rating;
  const f = flame !== undefined ? !!flame : current.flame;
  const it = interested !== undefined ? !!interested : current.interested;
  const rl = readLater !== undefined ? !!readLater : current.readLater;
  const h = hidden !== undefined ? !!hidden : current.hidden;
  const pr = practiced !== undefined ? !!practiced : current.practiced;
  db.prepare(
    `INSERT INTO content_reactions (user_id, item_type, item_id, rating, flame, interested, read_later, hidden, practiced, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET
       rating = excluded.rating, flame = excluded.flame, interested = excluded.interested, read_later = excluded.read_later, hidden = excluded.hidden, practiced = excluded.practiced, updated_at = excluded.updated_at`
  ).run(userId, itemType, itemId, r, f ? 1 : 0, it ? 1 : 0, rl ? 1 : 0, h ? 1 : 0, pr ? 1 : 0, new Date().toISOString());
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

// ── Collections personnelles (Galerie, images uniquement) ───────────────────
// Regroupement privé d'images choisies par un profil, strictement visible de
// lui/elle et de l'admin (jamais des autres profils, même en mode couple —
// pas demandé). Les images elles-mêmes restent visibles normalement partout
// dans la galerie : une collection n'est qu'un rangement en plus, pas un
// masquage. Foreign keys SQLite non activées dans ce projet (pas de PRAGMA
// foreign_keys), donc le nettoyage de collection_items à la suppression
// d'une image ou d'un compte se fait à la main (voir deleteGalleryImage,
// deleteUser).
db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS collection_items (
    collection_id INTEGER NOT NULL,
    gallery_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (collection_id, gallery_id)
  );
  CREATE INDEX IF NOT EXISTS idx_collections_user ON collections (user_id);
  CREATE INDEX IF NOT EXISTS idx_collection_items_gallery ON collection_items (gallery_id);
`);

function rowToCollection(row) {
  let tags = [];
  try { tags = JSON.parse(row.tags || "[]"); } catch (_) {}
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description || "",
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Résout la couverture (première image ajoutée la plus récente) et le
// nombre d'images de chaque collection en une passe, pour la grille "Mes
// collections" — évite une requête par carte.
function listCollections(userId) {
  const rows = db.prepare("SELECT * FROM collections WHERE user_id = ? ORDER BY updated_at DESC").all(userId);
  return rows.map((row) => {
    const c = rowToCollection(row);
    const countRow = db.prepare(
      `SELECT COUNT(*) AS n FROM collection_items ci
       JOIN gallery_images gi ON gi.id = ci.gallery_id
       WHERE ci.collection_id = ?`
    ).get(c.id);
    c.itemCount = countRow ? countRow.n : 0;
    const coverRow = db.prepare(
      `SELECT gi.image_paths, gi.filename FROM collection_items ci
       JOIN gallery_images gi ON gi.id = ci.gallery_id
       WHERE ci.collection_id = ? ORDER BY ci.created_at DESC LIMIT 1`
    ).get(c.id);
    if (coverRow) {
      let paths = [];
      try { paths = JSON.parse(coverRow.image_paths || "[]"); } catch (_) {}
      c.coverImg = paths[0] || coverRow.filename || null;
    } else {
      c.coverImg = null;
    }
    return c;
  });
}

function getCollection(id) {
  const row = db.prepare("SELECT * FROM collections WHERE id = ?").get(id);
  return row ? rowToCollection(row) : null;
}

function createCollection(userId, { title, description, tags }) {
  const now = new Date().toISOString();
  const info = db.prepare(
    "INSERT INTO collections (user_id, title, description, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, String(title || "").trim(), String(description || "").trim(), JSON.stringify(tags || []), now, now);
  return info.lastInsertRowid;
}

function updateCollection(id, { title, description, tags }) {
  db.prepare(
    "UPDATE collections SET title = ?, description = ?, tags = ?, updated_at = ? WHERE id = ?"
  ).run(String(title || "").trim(), String(description || "").trim(), JSON.stringify(tags || []), new Date().toISOString(), id);
}

function deleteCollection(id) {
  db.prepare("DELETE FROM collection_items WHERE collection_id = ?").run(id);
  db.prepare("DELETE FROM collections WHERE id = ?").run(id);
}

function getCollectionImages(collectionId) {
  const rows = db.prepare(
    `SELECT gi.* FROM collection_items ci
     JOIN gallery_images gi ON gi.id = ci.gallery_id
     WHERE ci.collection_id = ?
     ORDER BY ci.created_at DESC`
  ).all(collectionId);
  return rows.map(rowToGalleryImage);
}

function addToCollection(collectionId, galleryId) {
  db.prepare(
    "INSERT OR IGNORE INTO collection_items (collection_id, gallery_id, created_at) VALUES (?, ?, ?)"
  ).run(collectionId, galleryId, new Date().toISOString());
  db.prepare("UPDATE collections SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), collectionId);
}

function removeFromCollection(collectionId, galleryId) {
  db.prepare("DELETE FROM collection_items WHERE collection_id = ? AND gallery_id = ?").run(collectionId, galleryId);
}

// Pour la popup "Ajouter à une collection" : les collections de l'utilisateur
// avec un booléen "contains" pour l'image en cours de consultation.
function listCollectionsForImagePopup(userId, galleryId) {
  return db.prepare(
    `SELECT c.id, c.title,
       EXISTS(SELECT 1 FROM collection_items ci WHERE ci.collection_id = c.id AND ci.gallery_id = ?) AS contains_img
     FROM collections c WHERE c.user_id = ? ORDER BY c.updated_at DESC`
  ).all(galleryId, userId).map((r) => ({ id: r.id, title: r.title, contains: !!r.contains_img }));
}

function deleteUserCollections(userId) {
  const ids = db.prepare("SELECT id FROM collections WHERE user_id = ?").all(userId).map((r) => r.id);
  ids.forEach((id) => deleteCollection(id));
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

// Migration ponctuelle : chaque image du site doit avoir sa propre fiche
// galerie (voir syncExtraGalleryImages dans routes/wiki.js pour l'écriture
// au fil de l'eau côté création/édition). Jusqu'ici, les images de
// variantes/sous-variantes et l'image de scénario d'une page codex
// n'existaient que dans wiki_pages.meta — jamais comme vraie fiche
// gallery_images, donc jamais notables/masquables/collectionnables. On
// crée ici une fiche par image manquante pour tout le stock existant.
(function backfillExtraGalleryImagesOnce() {
  const KEY = "backfill_extra_gallery_images_v1";
  if (db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get(KEY)) return;

  const pages = listWikiPages();
  const existingLinks = new Set(
    db.prepare("SELECT wiki_page_id, image_paths FROM gallery_images WHERE wiki_page_id IS NOT NULL").all()
      .map(function (r) {
        let paths = [];
        try { paths = JSON.parse(r.image_paths || "[]"); } catch (_) {}
        return paths.length === 1 ? (r.wiki_page_id + "::" + paths[0]) : null;
      }).filter(Boolean)
  );

  pages.forEach(function (page) {
    const items = [];
    const variantes = (page.meta && Array.isArray(page.meta.variantes)) ? page.meta.variantes : [];
    variantes.forEach(function (v) {
      (Array.isArray(v.images) ? v.images : []).forEach(function (p) { items.push({ path: p, label: v.nom || "" }); });
      (Array.isArray(v.variantes) ? v.variantes : []).forEach(function (sv) {
        (Array.isArray(sv.images) ? sv.images : []).forEach(function (p) { items.push({ path: p, label: sv.nom || "" }); });
      });
    });
    if (page.meta && page.meta.scenario_image) items.push({ path: page.meta.scenario_image, label: "" });
    if (!items.length) return;

    const titleTag = page.title.trim().toLowerCase();
    const seenPaths = new Set();
    items.forEach(function (it) {
      if (seenPaths.has(it.path)) return; // même image référencée deux fois sur la page
      seenPaths.add(it.path);
      if (existingLinks.has(page.id + "::" + it.path)) return;
      const tags = [titleTag];
      if (it.label) tags.push(it.label.toLowerCase());
      insertGalleryImage({ imagePaths: [it.path], title: page.title, tags, notes: "", category: "", wikiPageId: page.id });
    });
  });

  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(KEY, new Date().toISOString());
})();

// Migration ponctuelle : une fiche galerie par image, y compris les images
// "principales" d'une page codex — jusqu'ici regroupées dans une seule
// fiche "album" multi-images (voir l'ancien syncGalleryRecord). Chaque
// image doit être indépendamment notable/masquable/collectionnable (voir
// syncPageGalleryImages dans routes/wiki.js pour l'écriture au fil de
// l'eau). Marque aussi comme "wiki_synced" les fiches par-image déjà
// présentes (ex. issues de la migration précédente sur les variantes), pour
// que la synchro sache lesquelles elle peut gérer sans jamais toucher à une
// fiche liée à la main depuis l'upload direct de la Galerie.
(function splitGalleryAlbumsToPerImageOnce() {
  const KEY = "gallery_per_image_v1";
  if (db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get(KEY)) return;

  const pages = listWikiPages();
  pages.forEach(function (page) {
    const items = [];
    (page.imagePaths || []).forEach(function (p) { items.push({ path: p, label: "" }); });
    const variantes = (page.meta && Array.isArray(page.meta.variantes)) ? page.meta.variantes : [];
    variantes.forEach(function (v) {
      (Array.isArray(v.images) ? v.images : []).forEach(function (p) { items.push({ path: p, label: v.nom || "" }); });
      (Array.isArray(v.variantes) ? v.variantes : []).forEach(function (sv) {
        (Array.isArray(sv.images) ? sv.images : []).forEach(function (p) { items.push({ path: p, label: sv.nom || "" }); });
      });
    });
    if (page.meta && page.meta.scenario_image) items.push({ path: page.meta.scenario_image, label: "" });
    if (!items.length) return;

    const seenPaths = new Set();
    const dedupedItems = items.filter(function (it) {
      if (seenPaths.has(it.path)) return false;
      seenPaths.add(it.path);
      return true;
    });
    const desiredPaths = new Set(dedupedItems.map(function (it) { return it.path; }));
    const titleTag = page.title.trim().toLowerCase();

    const linked = db.prepare("SELECT * FROM gallery_images WHERE wiki_page_id = ?").all(page.id);
    const existingSinglePaths = new Set();
    linked.forEach(function (row) {
      let paths = [];
      try { paths = JSON.parse(row.image_paths || "[]"); } catch (_) {}
      if (paths.length === 1 && desiredPaths.has(paths[0])) {
        db.prepare("UPDATE gallery_images SET wiki_synced = 1 WHERE id = ?").run(row.id);
        existingSinglePaths.add(paths[0]);
      } else if (paths.length > 1) {
        // Ancienne fiche "album" (toutes ses images vont redevenir des fiches individuelles ci-dessous).
        deleteGalleryImage(row.id);
      }
      // paths.length === 1 mais hors desiredPaths : fiche liée à la main, on n'y touche pas.
    });

    dedupedItems.forEach(function (it) {
      if (existingSinglePaths.has(it.path)) return;
      const tags = [titleTag];
      if (it.label) tags.push(it.label.toLowerCase());
      const newId = insertGalleryImage({ imagePaths: [it.path], title: page.title, tags, notes: "", category: "", wikiPageId: page.id });
      setGalleryImageWikiSynced(newId, true);
    });
  });

  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(KEY, new Date().toISOString());
})();

// Migration ponctuelle : CHAQUE image de la galerie est indépendante, sans
// exception — y compris celles ajoutées en sélectionnant plusieurs fichiers
// d'un coup dans le formulaire d'upload direct (avant cette migration,
// elles étaient regroupées dans une seule fiche multi-images). Le seul
// regroupement reste manuel et explicite, via les Séries — jamais
// automatique. Filet de sécurité universel après le passage ciblé
// ci-dessus (qui ne couvrait que les images liées à une page codex) :
// éclate ici toute fiche gallery_images encore multi-images, quelle que
// soit son origine, en gardant la première image sur la fiche existante
// (conserve ses notes/favoris/collections) et en créant une fiche à part
// pour chacune des suivantes.
(function splitAllGalleryAlbumsToPerImageOnce() {
  const KEY = "gallery_all_per_image_v1";
  if (db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get(KEY)) return;

  const rows = db.prepare("SELECT * FROM gallery_images").all();
  rows.forEach(function (row) {
    let paths = [];
    try { paths = JSON.parse(row.image_paths || "[]"); } catch (_) {}
    if (paths.length <= 1) return;

    const now = new Date().toISOString();
    db.prepare("UPDATE gallery_images SET image_paths = ?, filename = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify([paths[0]]), paths[0], now, row.id);

    paths.slice(1).forEach(function (p) {
      db.prepare(
        `INSERT INTO gallery_images (filename, image_paths, title, tags, notes, category, wiki_page_id, author, parody, content_type, wiki_synced, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(p, JSON.stringify([p]), row.title, row.tags, row.notes, row.category, row.wiki_page_id, row.author, row.parody, row.content_type, row.wiki_synced, now, now);
    });
  });

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

// Pool de pages codex "encore à explorer" pour un profil : jamais notées
// (content_reactions.rating > 0) ni mises en favori. Utilisé par le bouton
// "Explorer l'inconnu" (voir routes/wiki.js) — le filtrage ultra/irréaliste
// (specialTagOf) et blacklist se fait ensuite côté route.
function listUnexploredWikiPages(userId) {
  return db.prepare(
    `SELECT wp.id, wp.tags FROM wiki_pages wp
     WHERE NOT EXISTS (
       SELECT 1 FROM content_reactions cr
       WHERE cr.user_id = ? AND cr.item_type = 'wiki' AND cr.item_id = wp.id AND cr.rating > 0
     )
     AND NOT EXISTS (
       SELECT 1 FROM favorites f
       WHERE f.user_id = ? AND f.item_type = 'wiki' AND f.item_id = wp.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM content_reactions cr2
       WHERE cr2.user_id = ? AND cr2.item_type = 'wiki' AND cr2.item_id = wp.id AND cr2.hidden = 1
     )`
  ).all(userId, userId, userId).map(function(r) {
    let tags = [];
    try { tags = JSON.parse(r.tags || "[]"); } catch (_) {}
    return { id: r.id, tags: tags };
  });
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

function reactWikiPage(id, userId, { rating, flame, interested, readLater, hidden, practiced }) {
  setUserReaction(userId, "wiki", id, { rating, flame, interested, readLater, hidden, practiced });
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
  // Top images par consultation
  const topImages = db.prepare(
    `SELECT gi.id, gi.title, COUNT(*) AS views
     FROM gallery_views gv JOIN gallery_images gi ON gi.id = gv.gallery_id
     GROUP BY gv.gallery_id ORDER BY views DESC LIMIT 20`
  ).all();
  // Si pas encore de consultations enregistrées, fallback par somme des
  // notes (content_reactions, tous profils confondus — vue admin agrégée,
  // contrairement aux listes "mes notes" qui restent propres à chaque profil).
  const topImagesFallback = topImages.length === 0
    ? db.prepare(
        `SELECT gi.id, gi.title, SUM(cr.rating) AS views
         FROM gallery_images gi JOIN content_reactions cr ON cr.item_type = 'gallery' AND cr.item_id = gi.id
         GROUP BY gi.id HAVING SUM(cr.rating) > 0 ORDER BY views DESC LIMIT 20`
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
    topImagesFallback: !!topImagesFallback,
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
    `SELECT gv.created_at, gi.id AS gallery_id, gi.title
     FROM gallery_views gv JOIN gallery_images gi ON gi.id = gv.gallery_id
     WHERE gv.user_id = ? ORDER BY gv.id DESC LIMIT 30`
  ).all(id).map(function(r) {
    return { createdAt: r.created_at, galleryId: r.gallery_id, title: r.title };
  });
  // Top gallery items by view count for this user
  const galViewCounts = db.prepare(
    `SELECT gi.id AS gallery_id, gi.title, COUNT(*) AS view_count
     FROM gallery_views gv JOIN gallery_images gi ON gi.id = gv.gallery_id
     WHERE gv.user_id = ? GROUP BY gv.gallery_id ORDER BY view_count DESC LIMIT 20`
  ).all(id).map(function(r) {
    return { galleryId: r.gallery_id, title: r.title, viewCount: r.view_count };
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
    // rating/flame/interested : desormais propres a chaque profil (comme
    // wiki/galerie), et non plus une valeur unique partagee sur la ligne.
    // Valeurs par defaut ici ; fusionnees avec la reaction du visiteur par
    // les routes via mergeUserReactions()/getUserReaction().
    rating: 0,
    flame: false,
    interested: false,
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
  const newPaths = imagePaths || [];
  // Une page retirée (checkbox "Supprimer cette page", voir bd-form.ejs)
  // n'a plus lieu d'avoir une réaction en base, pour aucun profil — sinon
  // la ligne reste orpheline indéfiniment (page_src ne pointe plus vers
  // rien dans le livre).
  const existing = db.prepare("SELECT image_paths FROM bd_books WHERE id = ?").get(id);
  if (existing) {
    let oldPaths = [];
    try { oldPaths = JSON.parse(existing.image_paths || "[]"); } catch (_) {}
    const newSet = new Set(newPaths);
    oldPaths.filter((p) => !newSet.has(p)).forEach((src) => {
      db.prepare("DELETE FROM bd_page_reactions WHERE book_id = ? AND page_src = ?").run(id, src);
    });
  }
  db.prepare(
    `UPDATE bd_books SET title = ?, description = ?, tags = ?, image_paths = ?, langue = ?, updated_at = ? WHERE id = ?`
  ).run(title, description, JSON.stringify(tags || []), JSON.stringify(newPaths), langue || "", new Date().toISOString(), id);
}

function deleteBdBook(id) {
  db.prepare("DELETE FROM bd_page_reactions WHERE book_id = ?").run(id);
  db.prepare("DELETE FROM bd_books WHERE id = ?").run(id);
}

function reactBdBook(id, userId, { rating, flame, interested, hidden }) {
  setUserReaction(userId, "bd", id, { rating, flame, interested, hidden });
}

// { pageIndex: { rating, flame, hidden } } pour un profil donné, indexé par
// POSITION actuelle dans book.imagePaths (pratique pour le lecteur) mais
// stocké en base par chemin d'image (page_src, stable) — voir le
// commentaire sur la table plus haut.
function getBdPageReactionsMap(userId, book) {
  if (!userId || !book) return {};
  const rows = db.prepare(
    "SELECT page_src, rating, flame, hidden FROM bd_page_reactions WHERE user_id = ? AND book_id = ?"
  ).all(userId, book.id);
  const bySrc = {};
  rows.forEach((r) => { bySrc[r.page_src] = { rating: r.rating, flame: !!r.flame, hidden: !!r.hidden }; });
  const map = {};
  book.imagePaths.forEach((src, i) => { if (bySrc[src]) map[i] = bySrc[src]; });
  return map;
}

function reactBdPage(book, pageIndex, userId, { rating, flame, hidden }) {
  const src = book.imagePaths[pageIndex];
  if (!src) return null;
  const current = db.prepare(
    "SELECT rating, flame, hidden FROM bd_page_reactions WHERE user_id = ? AND book_id = ? AND page_src = ?"
  ).get(userId, book.id, src) || { rating: 0, flame: 0, hidden: 0 };
  const r = rating !== undefined ? Math.max(0, Math.min(5, Number(rating) || 0)) : current.rating;
  const f = flame !== undefined ? !!flame : !!current.flame;
  const h = hidden !== undefined ? !!hidden : !!current.hidden;
  db.prepare(
    `INSERT INTO bd_page_reactions (user_id, book_id, page_src, rating, flame, hidden, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, book_id, page_src) DO UPDATE SET
       rating = excluded.rating, flame = excluded.flame, hidden = excluded.hidden, updated_at = excluded.updated_at`
  ).run(userId, book.id, src, r, f ? 1 : 0, h ? 1 : 0, new Date().toISOString());

  // Agrégat livre entier dérivé des pages (voir commentaire sur la table
  // plus haut) : ne touche jamais "interested" ni le "hidden" livre entier,
  // qui restent gérés indépendamment au niveau du livre. Le favori (🔖,
  // distinct du j'adore par page) suit le même principe : le livre reste
  // en favoris tant qu'au moins une de ses pages est aimée.
  const agg = db.prepare(
    "SELECT MAX(rating) AS maxRating, MAX(flame) AS anyFlame FROM bd_page_reactions WHERE user_id = ? AND book_id = ?"
  ).get(userId, book.id);
  setUserReaction(userId, "bd", book.id, { rating: agg.maxRating || 0, flame: !!agg.anyFlame });
  if (agg.anyFlame) addFavorite(userId, "bd", book.id);
  else removeFavorite(userId, "bd", book.id);

  return { rating: r, flame: f, hidden: h };
}

// Pages masquées individuellement, tous livres confondus, pour /favoris/masques.
// La page a pu être retirée du livre depuis (voir updateBdBook, qui purge
// alors sa réaction) : indexOf renvoie -1 dans ce cas, filtré ci-dessous.
function listHiddenBdPages(userId) {
  if (!userId) return [];
  const rows = db.prepare(
    `SELECT bpr.page_src, bb.id AS book_id, bb.title, bb.image_paths
     FROM bd_page_reactions bpr JOIN bd_books bb ON bb.id = bpr.book_id
     WHERE bpr.user_id = ? AND bpr.hidden = 1
     ORDER BY bpr.updated_at DESC`
  ).all(userId);
  return rows.map((r) => {
    let paths = [];
    try { paths = JSON.parse(r.image_paths || "[]"); } catch (_) {}
    const pageIndex = paths.indexOf(r.page_src);
    return pageIndex === -1 ? null : { bookId: r.book_id, pageIndex, bookTitle: r.title };
  }).filter(Boolean);
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
    wikiSynced: !!row.wiki_synced,
    processed: !!row.processed,
    featured: !!row.featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listGalleryImages() {
  return db.prepare("SELECT * FROM gallery_images ORDER BY created_at DESC").all().map(rowToGalleryImage);
}

// Pool d'images "encore à explorer" pour un profil : jamais notées ni mises
// en favori. Utilisé par le bouton "Explorer l'inconnu" (voir
// routes/gallery.js) — le filtrage ultra/irréaliste (specialTagOf) et
// blacklist se fait ensuite côté route.
function listUnexploredGalleryImages(userId) {
  return db.prepare(
    `SELECT gi.id, gi.tags FROM gallery_images gi
     WHERE NOT EXISTS (
       SELECT 1 FROM content_reactions cr
       WHERE cr.user_id = ? AND cr.item_type = 'gallery' AND cr.item_id = gi.id AND cr.rating > 0
     )
     AND NOT EXISTS (
       SELECT 1 FROM favorites f
       WHERE f.user_id = ? AND f.item_type = 'gallery' AND f.item_id = gi.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM content_reactions cr2
       WHERE cr2.user_id = ? AND cr2.item_type = 'gallery' AND cr2.item_id = gi.id AND cr2.hidden = 1
     )`
  ).all(userId, userId, userId).map(function(r) {
    let tags = [];
    try { tags = JSON.parse(r.tags || "[]"); } catch (_) {}
    return { id: r.id, tags: tags };
  });
}

function getGalleryImage(id) {
  const row = db.prepare("SELECT * FROM gallery_images WHERE id = ?").get(id);
  return row ? rowToGalleryImage(row) : null;
}

function insertGalleryImage({ imagePaths, title, tags, notes, category, wikiPageId, author, parody }) {
  const now = new Date().toISOString();
  const paths = imagePaths || [];
  const info = db.prepare(
    `INSERT INTO gallery_images (filename, image_paths, title, tags, notes, category, wiki_page_id, author, parody, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(paths[0] || "", JSON.stringify(paths), title || "", JSON.stringify(tags || []), notes || "", category || "", wikiPageId || null, author || "", parody || "", now, now);
  return info.lastInsertRowid;
}

// Marque une fiche comme gérée par la synchro codex (voir syncPageGalleryImages) :
// seules ces fiches sont recréées/supprimées automatiquement, jamais une
// fiche liée à la main depuis le formulaire d'upload de la Galerie.
function setGalleryImageWikiSynced(id, synced) {
  db.prepare("UPDATE gallery_images SET wiki_synced = ? WHERE id = ?").run(synced ? 1 : 0, id);
}

function updateGalleryImage(id, { title, category, tags, notes, imagePaths, wikiPageId, author, parody }) {
  const existing = db.prepare("SELECT image_paths, filename FROM gallery_images WHERE id = ?").get(id);
  if (!existing) return false;
  // Si imagePaths n'est pas fourni, conserver les images existantes
  let finalImagePaths = imagePaths;
  if (finalImagePaths === undefined) {
    finalImagePaths = JSON.parse(existing.image_paths || "[]");
    if (!finalImagePaths.length && existing.filename) finalImagePaths = [existing.filename];
  }
  db.prepare(
    `UPDATE gallery_images SET title = ?, category = ?, tags = ?, notes = ?, filename = ?, image_paths = ?, wiki_page_id = ?, author = ?, parody = ?, updated_at = ?
     WHERE id = ?`
  ).run(title || "", category || "", JSON.stringify(tags || []), notes || "", finalImagePaths[0] || "", JSON.stringify(finalImagePaths), wikiPageId || null, author || "", parody || "", new Date().toISOString(), id);
  return true;
}

function reactGalleryImage(id, userId, { rating, flame, interested, hidden }) {
  setUserReaction(userId, "gallery", id, { rating, flame, interested, hidden });
}

function deleteGalleryImage(id) {
  // Foreign keys SQLite non activées (pas de PRAGMA foreign_keys) : nettoyage
  // manuel des tables qui référencent une image par id, sinon lignes orphelines.
  db.prepare("DELETE FROM collection_items WHERE gallery_id = ?").run(id);
  db.prepare("DELETE FROM image_series_members WHERE gallery_id = ?").run(id);
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

// Supprime définitivement un compte et tout ce qui lui appartient — utilisé
// par l'admin (profil tiers, voir routes/admin.js) et en self-service par
// le profil lui-même (voir /favoris/parametres > "Supprimer le compte").
// Casse d'abord une éventuelle liaison mode couple (voir setCouplePartners)
// pour ne pas laisser le/la partenaire avec un partner_id fantôme.
function deleteUser(id) {
  clearCouplePartner(id);
  deleteUserCollections(id);
  db.prepare("DELETE FROM favorites WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM content_reactions WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM bd_page_reactions WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM wiki_page_user_notes WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM tag_blacklist WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM filter_profiles WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM activity_pings WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM connection_logs WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM wiki_page_views WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM gallery_views WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM bd_views WHERE user_id = ?").run(id);
  db.prepare("UPDATE submissions SET user_id = NULL WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM attempts WHERE token = ?").run("user:" + id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

// Réinitialise le contenu personnel d'un profil (notes/étoiles/j'adore/
// intéressé/à lire plus tard/masqué, commentaires texte, favoris) sans
// toucher au compte lui-même (identité, mot de passe, réglages) — voir
// /favoris/parametres > "Réinitialiser le compte".
function resetUserContent(userId) {
  db.prepare("DELETE FROM content_reactions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM bd_page_reactions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM wiki_page_user_notes WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM favorites WHERE user_id = ?").run(userId);
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

// ── Custom Quizzes ───────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    featured INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS custom_quiz_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES custom_quizzes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS custom_quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES custom_quizzes(id) ON DELETE CASCADE,
    part_id INTEGER REFERENCES custom_quiz_parts(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'gradient',
    options TEXT DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS custom_quiz_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    answers TEXT DEFAULT '{}',
    completed INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(quiz_id, user_id)
  );
`);
// Migration : ajouter part_id si la colonne n'existe pas encore
if (!db.prepare("SELECT * FROM pragma_table_info('custom_quiz_questions') WHERE name='part_id'").get()) {
  db.exec("ALTER TABLE custom_quiz_questions ADD COLUMN part_id INTEGER REFERENCES custom_quiz_parts(id) ON DELETE SET NULL");
}
if (!db.prepare("SELECT * FROM pragma_table_info('custom_quizzes') WHERE name='duration'").get()) {
  db.exec("ALTER TABLE custom_quizzes ADD COLUMN duration INTEGER DEFAULT NULL");
}
if (!db.prepare("SELECT * FROM pragma_table_info('custom_quiz_questions') WHERE name='has_sides'").get()) {
  db.exec("ALTER TABLE custom_quiz_questions ADD COLUMN has_sides INTEGER DEFAULT 0");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS nouvelles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    featured INTEGER NOT NULL DEFAULT 0,
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`);

function listCustomQuizzes() {
  return db.prepare(`SELECT q.*,
    (SELECT COUNT(*) FROM custom_quiz_questions WHERE quiz_id = q.id) as question_count,
    (SELECT COUNT(*) FROM custom_quiz_parts WHERE quiz_id = q.id) as parts_count
    FROM custom_quizzes q ORDER BY q.updated_at DESC`).all();
}
function getCustomQuiz(id) {
  return db.prepare(`SELECT * FROM custom_quizzes WHERE id = ?`).get(id);
}
function createCustomQuiz(title, description) {
  const r = db.prepare(`INSERT INTO custom_quizzes (title, description) VALUES (?, ?)`).run(title, description);
  return r.lastInsertRowid;
}
function updateCustomQuiz(id, title, description, featured, duration) {
  db.prepare(`UPDATE custom_quizzes SET title=?, description=?, featured=?, duration=?, updated_at=unixepoch() WHERE id=?`)
    .run(title, description, featured ? 1 : 0, duration != null ? Number(duration) : null, id);
}
function deleteCustomQuiz(id) {
  db.prepare(`DELETE FROM custom_quizzes WHERE id=?`).run(id);
}
function getCustomQuizQuestions(quizId) {
  return db.prepare(`SELECT * FROM custom_quiz_questions WHERE quiz_id=? ORDER BY position`).all(quizId);
}
function addCustomQuizQuestion(quizId, text, type, options, position, partId, hasSides) {
  db.prepare(`INSERT INTO custom_quiz_questions (quiz_id, text, type, options, position, part_id, has_sides) VALUES (?,?,?,?,?,?,?)`)
    .run(quizId, text, type, JSON.stringify(options || []), position || 0, partId || null, hasSides ? 1 : 0);
}
function getQuizParts(quizId) {
  return db.prepare(`SELECT * FROM custom_quiz_parts WHERE quiz_id=? ORDER BY position`).all(quizId);
}
function createQuizPart(quizId, title, position) {
  const r = db.prepare(`INSERT INTO custom_quiz_parts (quiz_id, title, position) VALUES (?,?,?)`).run(quizId, title, position || 0);
  return r.lastInsertRowid;
}
function updateQuizPart(partId, title) {
  db.prepare(`UPDATE custom_quiz_parts SET title=? WHERE id=?`).run(title, partId);
}
function deleteQuizPart(partId) {
  db.prepare(`UPDATE custom_quiz_questions SET part_id=NULL WHERE part_id=?`).run(partId);
  db.prepare(`DELETE FROM custom_quiz_parts WHERE id=?`).run(partId);
}
function reorderAllQuizQuestions(quizId, sections) {
  const stmt = db.prepare(`UPDATE custom_quiz_questions SET part_id=?, position=? WHERE id=? AND quiz_id=?`);
  db.transaction(() => {
    sections.forEach(({ part_id, ids }) => {
      (ids || []).forEach((qid, i) => {
        stmt.run(part_id || null, i, qid, quizId);
      });
    });
  })();
}
function updateCustomQuizQuestion(id, text, type, options, hasSides) {
  db.prepare(`UPDATE custom_quiz_questions SET text=?, type=?, options=?, has_sides=? WHERE id=?`)
    .run(text, type, JSON.stringify(options || []), hasSides ? 1 : 0, id);
}
function deleteCustomQuizQuestion(id) {
  db.prepare(`DELETE FROM custom_quiz_questions WHERE id=?`).run(id);
}
function updateCustomQuizQuestionsOrder(quizId, orderedIds) {
  const stmt = db.prepare(`UPDATE custom_quiz_questions SET position=? WHERE id=? AND quiz_id=?`);
  const tx = db.transaction(() => { orderedIds.forEach((qid, i) => stmt.run(i, qid, quizId)); });
  tx();
}
function getCustomQuizAnswer(quizId, userId) {
  return db.prepare(`SELECT * FROM custom_quiz_answers WHERE quiz_id=? AND user_id=?`).get(quizId, userId);
}
function saveCustomQuizAnswer(quizId, userId, answers, completed) {
  db.prepare(`INSERT INTO custom_quiz_answers (quiz_id, user_id, answers, completed, updated_at)
    VALUES (?,?,?,?,unixepoch())
    ON CONFLICT(quiz_id, user_id) DO UPDATE SET answers=excluded.answers, completed=excluded.completed, updated_at=unixepoch()`)
    .run(quizId, userId, JSON.stringify(answers), completed ? 1 : 0);
}
function saveOneQuizAnswer(quizId, userId, questionId, value) {
  const existing = db.prepare(`SELECT answers, completed FROM custom_quiz_answers WHERE quiz_id=? AND user_id=?`).get(quizId, userId);
  let answers = {};
  try { answers = existing ? JSON.parse(existing.answers || '{}') : {}; } catch {}
  answers[questionId] = value;
  db.prepare(`INSERT INTO custom_quiz_answers (quiz_id, user_id, answers, completed, updated_at)
    VALUES (?,?,?,?,unixepoch())
    ON CONFLICT(quiz_id, user_id) DO UPDATE SET answers=excluded.answers, updated_at=unixepoch()`)
    .run(quizId, userId, JSON.stringify(answers), existing ? existing.completed : 0);
}
function clearCustomQuizAnswer(quizId, userId, questionId) {
  const existing = db.prepare(`SELECT answers, completed FROM custom_quiz_answers WHERE quiz_id=? AND user_id=?`).get(quizId, userId);
  if (!existing) return;
  let answers = {};
  try { answers = JSON.parse(existing.answers || '{}'); } catch {}
  delete answers[questionId];
  db.prepare(`UPDATE custom_quiz_answers SET answers=?, updated_at=unixepoch() WHERE quiz_id=? AND user_id=?`)
    .run(JSON.stringify(answers), quizId, userId);
}
function listQuizzesNotCompleted(userId) {
  return db.prepare(`SELECT q.*,
    (SELECT COUNT(*) FROM custom_quiz_questions WHERE quiz_id = q.id) as question_count
    FROM custom_quizzes q
    WHERE q.id NOT IN (SELECT quiz_id FROM custom_quiz_answers WHERE user_id=? AND completed=1)
    ORDER BY q.updated_at DESC`).all(userId);
}
function getAllQuizAnswers(quizId) {
  return db.prepare(`
    SELECT a.*, u.username
    FROM custom_quiz_answers a
    JOIN users u ON u.id = a.user_id
    WHERE a.quiz_id = ?
    ORDER BY a.updated_at DESC
  `).all(quizId);
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
  setGalleryImageWikiSynced,
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
  getBdPageReactionsMap,
  reactBdPage,
  listHiddenBdPages,
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
  mergePartnerReaction,
  excludeHidden,
  setUserReaction,
  getUserNote,
  setUserNote,
  getAllTagMeta,
  setTagType,
  createStandaloneTag,
  renameTagEverywhere,
  deleteUser,
  resetUserContent,
  getUserFavoritesWithDetails,
  logConnection,
  listConnectionLogs,
  listConnectionLogsForUser,
  recordActivityPing,
  listActivitySessions,
  listBlacklistedTags,
  addBlacklistedTag,
  removeBlacklistedTag,
  listFilterProfiles,
  createFilterProfile,
  deleteFilterProfile,
  setCouplePartners,
  clearCouplePartner,
  listUnexploredWikiPages,
  listUnexploredGalleryImages,
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
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionImages,
  addToCollection,
  removeFromCollection,
  listCollectionsForImagePopup,
  deleteUserCollections,
  listCustomQuizzes,
  getCustomQuiz,
  createCustomQuiz,
  updateCustomQuiz,
  deleteCustomQuiz,
  getCustomQuizQuestions,
  addCustomQuizQuestion,
  updateCustomQuizQuestion,
  deleteCustomQuizQuestion,
  updateCustomQuizQuestionsOrder,
  getCustomQuizAnswer,
  saveCustomQuizAnswer,
  saveOneQuizAnswer,
  clearCustomQuizAnswer,
  listQuizzesNotCompleted,
  getQuizParts,
  createQuizPart,
  updateQuizPart,
  deleteQuizPart,
  reorderAllQuizQuestions,
  getAllQuizAnswers,
  listNouvelles,
  getNouvelleById,
  createNouvelle,
  updateNouvelle,
  deleteNouvelle,
};

// ── Nouvelles ──────────────────────────────────────────────────────────────
function listNouvelles() {
  return db.prepare(`SELECT id, title, summary, tags, category, author, featured, word_count, created_at, updated_at FROM nouvelles ORDER BY updated_at DESC`).all();
}
function getNouvelleById(id) {
  return db.prepare(`SELECT * FROM nouvelles WHERE id=?`).get(id);
}
function createNouvelle({ title, content, summary, tags, category, author, featured }) {
  const wordCount = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  const r = db.prepare(`INSERT INTO nouvelles (title, content, summary, tags, category, author, featured, word_count) VALUES (?,?,?,?,?,?,?,?)`)
    .run(title || '', content || '', summary || '', JSON.stringify(tags || []), category || '', author || '', featured ? 1 : 0, wordCount);
  return r.lastInsertRowid;
}
function updateNouvelle(id, { title, content, summary, tags, category, author, featured }) {
  const wordCount = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  db.prepare(`UPDATE nouvelles SET title=?, content=?, summary=?, tags=?, category=?, author=?, featured=?, word_count=?, updated_at=unixepoch() WHERE id=?`)
    .run(title || '', content || '', summary || '', JSON.stringify(tags || []), category || '', author || '', featured ? 1 : 0, wordCount, id);
}
function deleteNouvelle(id) {
  db.prepare(`DELETE FROM nouvelles WHERE id=?`).run(id);
}
