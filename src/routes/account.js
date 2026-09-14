const express = require("express");
const {
  getUserById,
  getUserCredentials,
  updateOwnProfile,
  updateUserPassword,
  listConnectionLogsForUser,
} = require("../db");
const { requireUser } = require("../auth");
const { hashPassword, verifyPassword } = require("../passwords");

const SEXE_VALUES = ["", "femme", "homme", "autre"];
const CURRENT_YEAR = new Date().getFullYear();

function parseBirthYear(raw) {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1900 || n > CURRENT_YEAR) return null;
  return n;
}

function buildAccountRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  function render(res, req, error, notice) {
    const user = getUserById(req.user.id);
    const connectionLogs = listConnectionLogsForUser(req.user.id, 20);
    res.render("mon-compte", { config, user, connectionLogs, error: error || null, notice: notice || null });
  }

  router.get("/", (req, res) => render(res, req, null, null));

  router.post("/identite", (req, res) => {
    const displayName = String(req.body.display_name || "").trim();
    if (!displayName) return render(res, req, "Le pseudo est obligatoire.");

    const email = String(req.body.email || "").trim().slice(0, 254);
    if (email && !email.includes("@")) return render(res, req, "Adresse mail invalide.");

    const sexeRaw = String(req.body.sexe || "");
    const sexe = SEXE_VALUES.includes(sexeRaw) ? sexeRaw : "";
    const birthYear = parseBirthYear(req.body.birth_year);

    updateOwnProfile(req.user.id, { displayName, email, sexe, birthYear });
    render(res, req, null, "Profil mis à jour.");
  });

  router.post("/mot-de-passe", (req, res) => {
    const current = String(req.body.current_password || "");
    const next = String(req.body.new_password || "");
    const creds = getUserCredentials(req.user.username);
    if (!creds || !verifyPassword(current, creds.password_hash)) {
      return render(res, req, "Mot de passe actuel incorrect.");
    }
    if (next.length < 4) {
      return render(res, req, "Le nouveau mot de passe est trop court.");
    }
    updateUserPassword(req.user.id, hashPassword(next));
    render(res, req, null, "Mot de passe changé.");
  });

  return router;
}

module.exports = buildAccountRouter;
