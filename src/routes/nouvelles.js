const express = require("express");
const { requireAdmin } = require("../auth");
const db = require("../db");

const CATEGORIES = [
  { key: "romance",    label: "Romance",     hue: 340 },
  { key: "aventure",   label: "Aventure",    hue:  28 },
  { key: "fantaisie",  label: "Fantaisie",   hue: 260 },
  { key: "bdsm",       label: "BDSM",        hue:   5 },
  { key: "jeu_role",   label: "Jeu de rôle", hue:  60 },
  { key: "rencontre",  label: "Rencontre",   hue: 140 },
  { key: "couple",     label: "Couple",      hue: 200 },
  { key: "autre",      label: "Autre",       hue: 220 },
];

function buildNouvellesRouter(config) {
  const router = express.Router();
  router.use(requireAdmin);

  // ── Index ──────────────────────────────────────────────────────────────────
  router.get("/", (req, res) => {
    const all = db.listNouvelles().map(n => {
      try { n.tags = JSON.parse(n.tags); } catch { n.tags = []; }
      return n;
    });
    const featured = all.filter(n => n.featured);
    const recent   = all.filter(n => !n.featured).slice(0, 30);
    res.render("nouvelles", { config, all, featured, recent, categories: CATEGORIES });
  });

  // ── Créer ──────────────────────────────────────────────────────────────────
  router.get("/new", (req, res) => {
    res.render("nouvelles-form", { config, nouvelle: null, categories: CATEGORIES });
  });
  router.post("/new", express.urlencoded({ extended: false }), (req, res) => {
    const title = String(req.body.title || "").slice(0, 300).trim();
    if (!title) return res.redirect("/nouvelles/new");
    const tags = String(req.body.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const id = db.createNouvelle({
      title,
      content:  String(req.body.content  || ""),
      summary:  String(req.body.summary  || "").slice(0, 500),
      tags,
      category: String(req.body.category || ""),
      author:   String(req.body.author   || "").slice(0, 200),
      featured: req.body.featured === "1" ? 1 : 0,
    });
    res.redirect(`/nouvelles/${id}`);
  });

  // ── Lire ───────────────────────────────────────────────────────────────────
  router.get("/:id", (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    try { nouvelle.tags = JSON.parse(nouvelle.tags); } catch { nouvelle.tags = []; }
    res.render("nouvelles-detail", { config, nouvelle, categories: CATEGORIES });
  });

  // ── Éditer ─────────────────────────────────────────────────────────────────
  router.get("/:id/edit", (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    try { nouvelle.tags = JSON.parse(nouvelle.tags); } catch { nouvelle.tags = []; }
    res.render("nouvelles-form", { config, nouvelle, categories: CATEGORIES });
  });
  router.post("/:id/update", express.urlencoded({ extended: false }), (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    const title = String(req.body.title || "").slice(0, 300).trim();
    const tags = String(req.body.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    db.updateNouvelle(nouvelle.id, {
      title:    title || nouvelle.title,
      content:  String(req.body.content  || ""),
      summary:  String(req.body.summary  || "").slice(0, 500),
      tags,
      category: String(req.body.category || ""),
      author:   String(req.body.author   || "").slice(0, 200),
      featured: req.body.featured === "1" ? 1 : 0,
    });
    res.redirect(`/nouvelles/${nouvelle.id}`);
  });

  // ── Supprimer ──────────────────────────────────────────────────────────────
  router.post("/:id/delete", (req, res) => {
    db.deleteNouvelle(req.params.id);
    res.redirect("/nouvelles");
  });

  return router;
}

module.exports = buildNouvellesRouter;
