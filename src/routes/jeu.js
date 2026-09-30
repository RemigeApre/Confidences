const express = require("express");
const { requireUser } = require("../auth");
const { getUserById } = require("../db");

function buildJeuRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const partner = req.user.partnerId ? getUserById(req.user.partnerId) : null;
    res.render("jeu", { config, partner });
  });

  return router;
}

module.exports = buildJeuRouter;
