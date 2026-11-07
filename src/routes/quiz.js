const express = require("express");
const { getAttempt, listWikiPagesLight, listChangelogs, listRoadmap, getUserRoadmapVotes, toggleRoadmapVote } = require("../db");
const { tokenForUser, requireUserJson } = require("../auth");

function buildQuizRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const aiNavPages = listWikiPagesLight().map((p) => ({ id: p.id, title: p.title }));
    const changelogs = listChangelogs().slice(0, 10);
    const roadmapItems = listRoadmap();
    const userRoadmapVotes = getUserRoadmapVotes(req.user && req.user.id);
    res.render("home", { config, aiNavPages, changelogs, roadmapItems, userRoadmapVotes });
  });

  router.post("/roadmap/:id/vote", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalide' });
    const result = toggleRoadmapVote(req.user.id, id);
    res.json(result);
  });

  return router;
}

module.exports = buildQuizRouter;
