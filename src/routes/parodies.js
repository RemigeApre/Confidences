const express = require("express");
const { requireUser } = require("../auth");
const { listAllParodiesWithCounts, getContentByParody } = require("../db");

function buildParodiesRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const parodies = listAllParodiesWithCounts();
    res.render("parodies", { config, parodies });
  });

  router.get("/:name", (req, res) => {
    const parody = decodeURIComponent(req.params.name);
    const content = getContentByParody(parody);
    res.render("parody-detail", { config, parody, content });
  });

  return router;
}

module.exports = buildParodiesRouter;
