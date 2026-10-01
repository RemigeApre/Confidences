const express = require("express");
const path    = require("path");
const fs      = require("fs");
const { requireUser } = require("../auth");
const { getUserById } = require("../db");

const GAMES_JSON = path.join(__dirname, "..", "..", "games", "games.json");
function readGames() {
  try { return JSON.parse(fs.readFileSync(GAMES_JSON, "utf8")); } catch { return []; }
}

function buildJeuRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const partner = req.user.partnerId ? getUserById(req.user.partnerId) : null;
    res.render("jeu", { config, partner, games: readGames() });
  });

  return router;
}

module.exports = buildJeuRouter;
