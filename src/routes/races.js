const express = require("express");
const { requireAdmin } = require("../auth");
const db = require("../db");

function buildRacesRouter(config) {
  const router = express.Router();

  router.get("/", requireAdmin, (req, res) => {
    const races = db.listRaces();
    res.render("races", { config, races });
  });

  return router;
}

module.exports = buildRacesRouter;
