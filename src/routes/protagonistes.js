const express = require("express");
const { requireUser, requireAdmin } = require("../auth");
const db = require("../db");
const { normalizeParody } = db;

function buildProtagonistesRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const protagonistes = db.listProtagonistes();
    res.render("protagonistes", { config, protagonistes });
  });

  router.get("/new", requireAdmin, (req, res) => {
    const allTags = db.listAllSiteTags();
    res.render("protagoniste-form", { config, protagoniste: null, allTags, allParodies: db.listAllParodies() });
  });
  router.post("/new", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const name = String(req.body.name || "").slice(0, 200).trim();
    if (!name) return res.redirect("/protagonistes/new");
    const tags = String(req.body.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const parody = normalizeParody(String(req.body.parody || "").slice(0, 200));
    const subParody = normalizeParody(String(req.body.sub_parody || "").slice(0, 200));
    const id = db.createProtagoniste({ name, description: String(req.body.description || ""), tags, parody, subParody });
    res.redirect(`/protagonistes/${id}`);
  });

  router.get("/:id", (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (!protagoniste) return res.redirect("/protagonistes");
    const nouvelles = db.listNouvellesByProtagoniste(protagoniste.id)
      .filter(n => !req.user?.isAdmin ? (n.stage !== "brouillon" && !n.hidden) : true);
    res.render("protagoniste-detail", { config, protagoniste, nouvelles });
  });

  router.get("/:id/edit", requireAdmin, (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (!protagoniste) return res.redirect("/protagonistes");
    const allTags = db.listAllSiteTags();
    res.render("protagoniste-form", { config, protagoniste, allTags, allParodies: db.listAllParodies() });
  });
  router.post("/:id/update", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (!protagoniste) return res.redirect("/protagonistes");
    const tags = String(req.body.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const parody = normalizeParody(String(req.body.parody || "").slice(0, 200));
    const subParody = normalizeParody(String(req.body.sub_parody || "").slice(0, 200));
    db.updateProtagoniste(protagoniste.id, {
      name:        String(req.body.name || "").slice(0, 200).trim() || protagoniste.name,
      description: String(req.body.description || ""),
      tags,
      parody,
      subParody,
    });
    res.redirect(`/protagonistes/${protagoniste.id}`);
  });
  router.post("/:id/delete", requireAdmin, (req, res) => {
    db.deleteProtagoniste(req.params.id);
    res.redirect("/protagonistes");
  });

  return router;
}

module.exports = buildProtagonistesRouter;
