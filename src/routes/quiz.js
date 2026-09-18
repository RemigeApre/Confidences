const express = require("express");
const { getAttempt } = require("../db");
const { tokenForUser } = require("../auth");

function buildQuizRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.render("home", { config });
  });

  return router;
}

module.exports = buildQuizRouter;
