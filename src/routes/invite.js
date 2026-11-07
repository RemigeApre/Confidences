const express = require("express");
const crypto = require("crypto");
const {
  getInviteByToken,
  createInviteUse,
  getUserByUsername,
  getUserByEmail,
  createUser,
  updateOwnProfile,
  logConnection,
  touchLastLogin,
  setUserAccountStatus,
  grantLootbox,
} = require("../db");
const { hashPassword } = require("../passwords");
const { createThrottle } = require("../loginThrottle");

const signupThrottle = createThrottle();

function ensureCsrf(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  return req.session.csrfToken;
}

module.exports = function buildInviteRouter(config) {
  const router = express.Router();

  // GET /rejoindre/:token — page d'inscription via invitation
  router.get("/:token", (req, res) => {
    if (req.user) return res.redirect("/favoris");

    const invite = getInviteByToken(req.params.token);
    if (!invite) return res.status(404).render("rejoindre", {
      csrfToken: ensureCsrf(req),
      error: null,
      invalid: true,
      isFrench: req.isFrenchVisitor,
      token: req.params.token,
    });

    res.render("rejoindre", {
      csrfToken: ensureCsrf(req),
      error: null,
      invalid: false,
      isFrench: req.isFrenchVisitor,
      token: req.params.token,
    });
  });

  // POST /rejoindre/:token — traitement de l'inscription via invitation
  router.post("/:token", (req, res) => {
    if (req.user) return res.redirect("/favoris");

    const invite = getInviteByToken(req.params.token);
    if (!invite) return res.status(404).render("rejoindre", {
      csrfToken: ensureCsrf(req),
      error: null,
      invalid: true,
      isFrench: req.isFrenchVisitor,
      token: req.params.token,
    });

    const sessionToken = req.session && req.session.csrfToken;
    const bodyToken    = req.body._csrf;
    if (!sessionToken || !bodyToken || sessionToken !== bodyToken) {
      return res.status(403).render("rejoindre", {
        csrfToken: ensureCsrf(req),
        error: "Requête invalide.",
        invalid: false,
        isFrench: req.isFrenchVisitor,
        token: req.params.token,
      });
    }

    // Piège à robots
    if (String(req.body.website || "").trim()) {
      return res.status(400).render("rejoindre", {
        csrfToken: ensureCsrf(req),
        error: "Requête invalide.",
        invalid: false,
        isFrench: req.isFrenchVisitor,
        token: req.params.token,
      });
    }

    const key  = req.ip;
    const wait = signupThrottle.secondsToWait(key);
    if (wait > 0) {
      return res.render("rejoindre", {
        csrfToken: ensureCsrf(req),
        error: `Trop de tentatives. Réessayez dans ${wait}s.`,
        invalid: false,
        isFrench: req.isFrenchVisitor,
        token: req.params.token,
      });
    }

    const nom         = String(req.body.nom || "").trim();
    const username    = nom.toLowerCase();
    const displayName = nom;
    const email       = String(req.body.email || "").trim();
    const password    = String(req.body.password || "");
    const password2   = String(req.body.password2 || "");

    function renderErr(error) {
      signupThrottle.recordFailure(key);
      return res.render("rejoindre", {
        csrfToken: ensureCsrf(req),
        error,
        invalid: false,
        isFrench: req.isFrenchVisitor,
        token: req.params.token,
      });
    }

    if (!nom || !email || !password) return renderErr("Pseudo, mail et mot de passe sont obligatoires.");
    if (!email.includes("@"))       return renderErr("Adresse mail invalide.");
    if (password.length < 4)        return renderErr("Mot de passe trop court (4 caractères minimum).");
    if (password !== password2)     return renderErr("Les deux mots de passe ne correspondent pas.");
    if (getUserByUsername(username)) return renderErr("Ce pseudo est déjà utilisé.");
    if (getUserByEmail(email))       return renderErr("Cette adresse mail est déjà utilisée.");

    signupThrottle.recordSuccess(key);

    const isFrench = req.isFrenchVisitor;
    // FR : compte en attente d'approbation par l'inviteur
    // non-FR : compte actif immédiatement
    const newId = createUser({
      username,
      displayName,
      passwordHash: hashPassword(password),
      isAdmin: false,
      isTest: false,
    });
    updateOwnProfile(newId, { displayName, email, sexe: "", birthYear: null });

    if (isFrench) {
      setUserAccountStatus(newId, "pending_invite");
    }

    // Lier l'invité à l'inviteur + récompenser l'inviteur
    const country = isFrench ? "FR" : (String(req.body._country || "")).toUpperCase() || "";
    createInviteUse(invite.userId, newId, country, isFrench ? "pending" : "direct");
    grantLootbox(invite.userId, 5, 'standard');

    if (isFrench) {
      // Ne pas ouvrir de session : l'utilisateur doit attendre l'approbation
      return res.redirect("/invitation-attente");
    }

    req.session.regenerate((err) => {
      if (err) return res.redirect("/ponhgup/85zapnte");
      req.session.userId = newId;
      logConnection(newId, req.ip, req.headers["user-agent"] || "");
      touchLastLogin(newId);
      res.redirect("/favoris");
    });
  });

  return router;
};
