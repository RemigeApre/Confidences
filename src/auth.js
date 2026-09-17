const { getUserCredentials, getUserById } = require("./db");
const { verifyPassword } = require("./passwords");

function verifyLogin(username, password) {
  const row = getUserCredentials(username);
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return getUserById(row.id);
}

// Charge le profil connecte (s'il y en a un) sur chaque requete, pour que
// toutes les vues EJS aient acces a `currentUser` sans que chaque route
// n'ait besoin de le passer explicitement (meme mecanisme que
// `res.locals.assetVersion` deja en place dans server.js).
function attachUser(req, res, next) {
  const userId = req.session && req.session.userId;
  const user = userId ? getUserById(userId) : null;
  req.user = user;
  res.locals.currentUser = user;
  // Accord du libellé de la réaction "Intéressé(e)" : masculin par défaut,
  // féminin uniquement si le profil a explicitement déclaré "femme".
  res.locals.interestedLabel = user && user.sexe === "femme" ? "Intéressée" : "Intéressé";
  next();
}

function requireUser(req, res, next) {
  if (req.user) return next();
  res.redirect("/admin/login?next=" + encodeURIComponent(req.originalUrl));
}

// Variante pour les endpoints JSON/fetch (widgets AJAX) : une redirection
// HTML casserait le JSON.parse() cote client, on renvoie donc un simple 401.
function requireUserJson(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ ok: false, error: "unauthenticated" });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.isAdmin) return next();
  if (req.user) return res.redirect("/favoris");
  res.redirect("/admin/login");
}

function tokenForUser(user) {
  return "user:" + user.id;
}

module.exports = { verifyLogin, attachUser, requireUser, requireUserJson, requireAdmin, tokenForUser };
