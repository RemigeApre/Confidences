const express = require("express");
const { getAttempt, listWikiPagesLight, listChangelogs } = require("../db");
const { tokenForUser } = require("../auth");

function buildQuizRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const aiNavPages = listWikiPagesLight().map((p) => ({ id: p.id, title: p.title }));
    const changelogs = listChangelogs().slice(0, 10);
    res.render("home", { config, aiNavPages, changelogs });
  });

  return router;
}

module.exports = buildQuizRouter;
