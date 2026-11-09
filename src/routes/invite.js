const express = require("express");
const crypto = require("crypto");
const {
  getInviteByToken,
  createInviteUse,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  getGalleryImage,
  createUser,
  updateOwnProfile,
  logConnection,
  touchLastLogin,
  setUserAccountStatus,
  grantLootbox,
  autoFriend,
  sendFriendRequest,
  getFriendshipBetween,
} = require("../db");
const { thumbUrl } = require("../thumbs");
const { hashPassword } = require("../passwords");
const { createThrottle } = require("../loginThrottle");
const { sendMail, emailHtml } = require("../mailer");

const signupThrottle = createThrottle();

function ensureCsrf(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  return req.session.csrfToken;
}

module.exports = function buildInviteRouter(config) {
  const router = express.Router();

  // GET /rejoindre/:token
  router.get("/:token", (req, res) => {
    const invite = getInviteByToken(req.params.token);

    // Logged-in user: offer to become friends with inviter
    if (req.user) {
      if (!invite) return res.redirect("/favoris");
      const inviter = getUserById(invite.userId);
      if (!inviter) return res.redirect("/favoris");
      const friendship = getFriendshipBetween(req.user.id, invite.userId);
      let inviterThumb = null;
      if (inviter.profileImageId) {
        const img = getGalleryImage(inviter.profileImageId);
        if (img) {
          const fp = (img.imagePaths && img.imagePaths[0]) || img.filename || null;
          if (fp) inviterThumb = thumbUrl(fp);
        }
      }
      return res.render("rejoindre", {
        csrfToken: ensureCsrf(req),
        config,
        inviterThumb,
        error: null,
        invalid: false,
        isFrench: req.isFrenchVisitor,
        token: req.params.token,
        loggedInOffer: true,
        inviter,
        friendship,
      });
    }

    if (!invite) return res.status(404).render("rejoindre", {
      csrfToken: ensureCsrf(req),
      error: null,
      invalid: true,
      isFrench: req.isFrenchVisitor,
      token: req.params.token,
      loggedInOffer: false,
      inviter: null,
      friendship: null,
    });

    res.render("rejoindre", {
      csrfToken: ensureCsrf(req),
      error: null,
      invalid: false,
      isFrench: req.isFrenchVisitor,
      token: req.params.token,
      loggedInOffer: false,
      inviter: null,
      friendship: null,
    });
  });

  // POST /rejoindre/:token/ami — logged-in user becomes friend with inviter
  router.post("/:token/ami", (req, res) => {
    if (!req.user) return res.redirect("/rejoindre/" + req.params.token);
    // CSRF check
    const sessionToken = req.session && req.session.csrfToken;
    const bodyToken    = req.body._csrf;
    if (!sessionToken || !bodyToken || sessionToken !== bodyToken) {
      return res.redirect("/rejoindre/" + req.params.token);
    }
    const invite = getInviteByToken(req.params.token);
    if (!invite || invite.userId === req.user.id) return res.redirect("/favoris");
    sendFriendRequest(req.user.id, invite.userId);
    res.redirect("/favoris/amis");
  });

  // POST /rejoindre/:token — registration
  router.post("/:token", (req, res) => {
    if (req.user) return res.redirect("/favoris");

    const invite = getInviteByToken(req.params.token);
    if (!invite) return res.status(404).render("rejoindre", {
      csrfToken: ensureCsrf(req),
      error: null,
      invalid: true,
      isFrench: req.isFrenchVisitor,
      token: req.params.token,
      loggedInOffer: false,
      inviter: null,
      friendship: null,
    });

    const sessionToken = req.session && req.session.csrfToken;
    const bodyToken    = req.body._csrf;
    if (!sessionToken || !bodyToken || sessionToken !== bodyToken) {
      return res.status(403).render("rejoindre", {
        csrfToken: ensureCsrf(req),
        error: "Requ\u00eate invalide.",
        invalid: false,
        isFrench: req.isFrenchVisitor,
        token: req.params.token,
        loggedInOffer: false,
        inviter: null,
        friendship: null,
      });
    }

    if (String(req.body.website || "").trim()) {
      return res.status(400).render("rejoindre", {
        csrfToken: ensureCsrf(req),
        error: "Requ\u00eate invalide.",
        invalid: false,
        isFrench: req.isFrenchVisitor,
        token: req.params.token,
        loggedInOffer: false,
        inviter: null,
        friendship: null,
      });
    }

    const key  = req.ip;
    const wait = signupThrottle.secondsToWait(key);
    if (wait > 0) {
      return res.render("rejoindre", {
        csrfToken: ensureCsrf(req),
        error: `Trop de tentatives. R\u00e9essayez dans ${wait}s.`,
        invalid: false,
        isFrench: req.isFrenchVisitor,
        token: req.params.token,
        loggedInOffer: false,
        inviter: null,
        friendship: null,
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
        loggedInOffer: false,
        inviter: null,
        friendship: null,
      });
    }

    if (!nom || !email || !password) return renderErr("Pseudo, mail et mot de passe sont obligatoires.");
    if (!email.includes("@"))       return renderErr("Adresse mail invalide.");
    if (password.length < 4)        return renderErr("Mot de passe trop court (4 caract\u00e8res minimum).");
    if (password !== password2)     return renderErr("Les deux mots de passe ne correspondent pas.");
    if (getUserByUsername(username)) return renderErr("Ce pseudo est d\u00e9j\u00e0 utilis\u00e9.");
    if (getUserByEmail(email))       return renderErr("Cette adresse mail est d\u00e9j\u00e0 utilis\u00e9e.");

    signupThrottle.recordSuccess(key);

    const isFrench = req.isFrenchVisitor;
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

    const country = isFrench ? "FR" : (String(req.body._country || "")).toUpperCase() || "";
    createInviteUse(invite.userId, newId, country, isFrench ? "pending" : "direct");
    grantLootbox(invite.userId, 5, 'standard');

    // Auto-ami pour les inscriptions directes (non-FR)
    if (!isFrench) {
      autoFriend(invite.userId, newId);
    }

    // ── Emails ───────────────────────────────────────────────────────────
    const siteUrl = (req.secure ? "https" : "http") + "://" + req.get("host");
    const inviter = getUserById(invite.userId);

    // Candidat : confirmation de réception
    if (email) {
      sendMail({
        to: email,
        subject: "Votre candidature a été reçue — Confidences",
        text: isFrench
          ? `Bonjour ${displayName},\n\nVotre candidature a bien été reçue. L'invitation est en attente de validation par la personne qui vous a invité.\nVous recevrez un mail dès qu'elle aura accepté ou refusé votre demande.\n\n${siteUrl}`
          : `Bonjour ${displayName},\n\nBienvenue sur Confidences ! Votre compte est actif.\nPseudo : ${displayName}\n\n${siteUrl}`,
        html: emailHtml({
          title: isFrench ? "Candidature reçue" : "Bienvenue sur Confidences",
          body: isFrench
            ? `<p>Bonjour <strong>${displayName}</strong>,</p><p>Votre candidature a bien &eacute;t&eacute; re&ccedil;ue. L&rsquo;invitation est en attente de validation par la personne qui vous a invit&eacute;.</p><p style="color:#6b7280">Vous recevrez un mail d&egrave;s qu&rsquo;elle aura accept&eacute; ou refus&eacute; votre demande.</p>`
            : `<p>Bonjour <strong>${displayName}</strong>,</p><p>Bienvenue sur Confidences&nbsp;! Votre compte est actif.</p><p>Pseudo&nbsp;: <strong>${displayName}</strong></p>`,
          cta: "Accéder au site",
          ctaUrl: isFrench ? null : siteUrl,
          siteUrl,
        }),
      });
    }

    // Inviteur : notification qu'une candidature est arrivée (mode FR uniquement)
    if (isFrench && inviter && inviter.email) {
      sendMail({
        to: inviter.email,
        subject: "Nouvelle candidature via votre lien — Confidences",
        text: `Bonjour ${inviter.displayName},\n\n${displayName} vient de s'inscrire via votre lien d'invitation et attend votre validation.\nRendez-vous sur ${siteUrl}/favoris/invitations pour accepter ou refuser.`,
        html: emailHtml({
          title: "Nouvelle candidature",
          body: `<p>Bonjour <strong>${inviter.displayName}</strong>,</p><p><strong>${displayName}</strong> vient de s&rsquo;inscrire via votre lien d&rsquo;invitation et attend votre validation.</p>`,
          cta: "Voir la candidature",
          ctaUrl: siteUrl + "/favoris/invitations",
          siteUrl,
        }),
      });
    }

    if (isFrench) {
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
