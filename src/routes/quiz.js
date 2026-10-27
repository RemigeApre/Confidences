const express = require("express");
const { getAttempt, listWikiPagesLight } = require("../db");
const { tokenForUser } = require("../auth");

function buildQuizRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const aiNavPages = listWikiPagesLight().map((p) => ({ id: p.id, title: p.title }));
    res.render("home", { config, aiNavPages });
  });

  return router;
}

module.exports = buildQuizRouter;
