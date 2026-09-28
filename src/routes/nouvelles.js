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

function parseTags(raw) {
  return String(raw || "").split(",").map(t => t.trim()).filter(Boolean);
}

function parseNouvelle(n) {
  try { n.tags = JSON.parse(n.tags); } catch { n.tags = []; }
  return n;
}

function buildNouvellesRouter(config) {
  const router = express.Router();
  router.use(requireAdmin);

  // ── Index ──────────────────────────────────────────────────────────────────
  router.get("/", (req, res) => {
    const all      = db.listNouvelles().map(parseNouvelle);
    const series   = db.listNouvelleSeries();
    const featured = all.filter(n => n.featured);
    const standalone = all.filter(n => !n.serie_id);
    res.render("nouvelles", { config, all, featured, standalone, series, categories: CATEGORIES });
  });

  // ── Séries ─────────────────────────────────────────────────────────────────
  router.get("/series/new", (req, res) => {
    res.render("nouvelle-serie-form", { config, serie: null, categories: CATEGORIES });
  });
  router.post("/series/new", express.urlencoded({ extended: false }), (req, res) => {
    const title = String(req.body.title || "").slice(0, 300).trim();
    if (!title) return res.redirect("/nouvelles/series/new");
    const id = db.createNouvelleSerie({
      title,
      description: String(req.body.description || "").slice(0, 1000),
    });
    res.redirect(`/nouvelles/series/${id}`);
  });

  router.get("/series/:id", (req, res) => {
    const serie = db.getNouvelleSerie(req.params.id);
    if (!serie) return res.redirect("/nouvelles");
    const chapters = db.listNouvellesBySerie(serie.id).map(parseNouvelle);
    const totalWords = chapters.reduce((s, c) => s + (c.word_count || 0), 0);
    res.render("nouvelle-serie-detail", { config, serie, chapters, totalWords, categories: CATEGORIES });
  });

  router.get("/series/:id/edit", (req, res) => {
    const serie = db.getNouvelleSerie(req.params.id);
    if (!serie) return res.redirect("/nouvelles");
    res.render("nouvelle-serie-form", { config, serie, categories: CATEGORIES });
  });
  router.post("/series/:id/update", express.urlencoded({ extended: false }), (req, res) => {
    const serie = db.getNouvelleSerie(req.params.id);
    if (!serie) return res.redirect("/nouvelles");
    db.updateNouvelleSerie(serie.id, {
      title:       String(req.body.title || "").slice(0, 300).trim() || serie.title,
      description: String(req.body.description || "").slice(0, 1000),
    });
    res.redirect(`/nouvelles/series/${serie.id}`);
  });
  router.post("/series/:id/delete", (req, res) => {
    db.deleteNouvelleSerie(req.params.id);
    res.redirect("/nouvelles");
  });

  // ── Créer nouvelle ─────────────────────────────────────────────────────────
  router.get("/new", (req, res) => {
    const series     = db.listNouvelleSeries();
    const allTags    = db.listAllSiteTags();
    const preSerieId = req.query.serie ? Number(req.query.serie) : null;
    res.render("nouvelles-form", { config, nouvelle: null, series, allTags, preSerieId, categories: CATEGORIES });
  });
  router.post("/new", express.urlencoded({ extended: false }), (req, res) => {
    const title = String(req.body.title || "").slice(0, 300).trim();
    if (!title) return res.redirect("/nouvelles/new");
    const serieId    = req.body.serie_id ? Number(req.body.serie_id) : null;
    const serieOrder = req.body.serie_order ? Number(req.body.serie_order) : 0;
    const id = db.createNouvelle({
      title,
      content:     String(req.body.content  || ""),
      summary:     String(req.body.summary  || "").slice(0, 500),
      tags:        parseTags(req.body.tags),
      category:    String(req.body.category || ""),
      author:      String(req.body.author   || "").slice(0, 200),
      featured:    req.body.featured === "1" ? 1 : 0,
      serie_id:    serieId,
      serie_order: serieOrder,
    });
    // Redirect to serie if part of one, else to detail
    if (serieId) return res.redirect(`/nouvelles/series/${serieId}`);
    res.redirect(`/nouvelles/${id}`);
  });

  // ── Lire ───────────────────────────────────────────────────────────────────
  router.get("/:id", (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    parseNouvelle(nouvelle);
    let serie = null, chapters = [], chapterIndex = -1, prev = null, next = null;
    if (nouvelle.serie_id) {
      serie    = db.getNouvelleSerie(nouvelle.serie_id);
      chapters = db.listNouvellesBySerie(nouvelle.serie_id).map(parseNouvelle);
      chapterIndex = chapters.findIndex(c => c.id === nouvelle.id);
      prev = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
      next = chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;
    }
    res.render("nouvelles-detail", { config, nouvelle, serie, chapters, chapterIndex, prev, next, categories: CATEGORIES });
  });

  // ── Éditer ─────────────────────────────────────────────────────────────────
  router.get("/:id/edit", (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    parseNouvelle(nouvelle);
    const series  = db.listNouvelleSeries();
    const allTags = db.listAllSiteTags();
    res.render("nouvelles-form", { config, nouvelle, series, allTags, preSerieId: null, categories: CATEGORIES });
  });
  router.post("/:id/update", express.urlencoded({ extended: false }), (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    const serieId    = req.body.serie_id ? Number(req.body.serie_id) : null;
    const serieOrder = req.body.serie_order ? Number(req.body.serie_order) : 0;
    const title = String(req.body.title || "").slice(0, 300).trim();
    db.updateNouvelle(nouvelle.id, {
      title:       title || nouvelle.title,
      content:     String(req.body.content  || ""),
      summary:     String(req.body.summary  || "").slice(0, 500),
      tags:        parseTags(req.body.tags),
      category:    String(req.body.category || ""),
      author:      String(req.body.author   || "").slice(0, 200),
      featured:    req.body.featured === "1" ? 1 : 0,
      serie_id:    serieId,
      serie_order: serieOrder,
    });
    res.redirect(`/nouvelles/${nouvelle.id}`);
  });

  // ── Supprimer ──────────────────────────────────────────────────────────────
  router.post("/:id/delete", (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    const serieId = nouvelle ? nouvelle.serie_id : null;
    db.deleteNouvelle(req.params.id);
    if (serieId) return res.redirect(`/nouvelles/series/${serieId}`);
    res.redirect("/nouvelles");
  });

  return router;
}

module.exports = buildNouvellesRouter;
