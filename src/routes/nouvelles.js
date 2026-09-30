const express = require("express");
const { requireUser, requireAdmin } = require("../auth");
const db = require("../db");
const { getUserReaction, setUserReaction, normalizeParody } = db;

const CATEGORIES = [
  { key: "romance",    label: "Romance",     hue: 340 },
  { key: "aventure",   label: "Aventure",    hue:  28 },
  { key: "fantaisie",  label: "Fantaisie",   hue: 260 },
  { key: "bdsm",       label: "BDSM",        hue:   5 },
  { key: "jeu_role",   label: "Jeu de rôle", hue:  60 },
  { key: "autre",      label: "Autre",       hue: 220 },
];

const STAGES = [
  { key: "brouillon", label: "Brouillon", adminOnly: true  },
  { key: "stade_1",   label: "Stade 1",   adminOnly: false },
  { key: "stade_2",   label: "Stade 2",   adminOnly: false },
  { key: "stade_3",   label: "Stade 3",   adminOnly: false },
  { key: "stade_4",   label: "Stade 4",   adminOnly: false },
  { key: "stade_5",   label: "Stade 5",   adminOnly: false },
];

function isVisible(n, user) {
  if (user && user.isAdmin) return true;
  if (n.stage === "brouillon") return false;
  if (n.hidden) return false;
  return true;
}

function parseTags(raw) {
  return String(raw || "").split(",").map(t => t.trim()).filter(Boolean);
}

function parseNouvelle(n) {
  try { n.tags = JSON.parse(n.tags); } catch { n.tags = []; }
  try { n.protagoniste_ids = JSON.parse(n.protagoniste_ids || "[]"); } catch { n.protagoniste_ids = []; }
  return n;
}

function renderContent(text) {
  return "<p>" + String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, "</p><p>") + "</p>";
}

function buildNouvellesRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  // Recherche de nouvelles (pour liens depuis la galerie/formulaires)
  router.get("/search", requireUser, (req, res) => {
    const q = String(req.query.q || "").toLowerCase().trim();
    const all = db.listNouvelles();
    const visible = all.filter(n => n.stage === 'publiee' || n.stage === 'publié' || n.stage !== 'brouillon');
    const results = q
      ? visible.filter(n => (n.title || "").toLowerCase().includes(q)).slice(0, 12)
      : visible.slice(0, 12);
    res.json(results.map(n => ({ id: n.id, title: n.title })));
  });

  // ── Index ──────────────────────────────────────────────────────────────────
  router.get("/", (req, res) => {
    const allRaw     = db.listNouvelles().map(parseNouvelle);
    const all        = allRaw.filter(n => isVisible(n, req.user));
    const series     = db.listNouvelleSeries();
    const featured   = all.filter(n => n.featured);
    const standalone = all.filter(n => !n.serie_id);
    // Nouveautés : les 6 plus récentes (par updated_at, déjà triées DESC)
    const recent     = all.slice(0, 6);
    const allTags    = db.listNouvellesTags();
    const allParodies = db.listAllParodies();
    res.render("nouvelles", { config, all, featured, standalone, series, recent, allTags, allParodies, categories: CATEGORIES, stages: STAGES });
  });

  // ── Séries ─────────────────────────────────────────────────────────────────
  router.get("/series/new", requireAdmin, (req, res) => {
    res.render("nouvelle-serie-form", { config, serie: null });
  });
  router.post("/series/new", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const title = String(req.body.title || "").slice(0, 300).trim();
    if (!title) return res.redirect("/nouvelles/series/new");
    const id = db.createNouvelleSerie({ title, description: String(req.body.description || "").slice(0, 1000) });
    res.redirect(`/nouvelles/series/${id}`);
  });

  router.get("/series/:id", (req, res) => {
    const serie = db.getNouvelleSerie(req.params.id);
    if (!serie) return res.redirect("/nouvelles");
    const allChapters = db.listNouvellesBySerie(serie.id).map(parseNouvelle);
    const chapters    = allChapters.filter(c => isVisible(c, req.user));
    const totalWords  = chapters.reduce((s, c) => s + (c.word_count || 0), 0);
    res.render("nouvelle-serie-detail", { config, serie, chapters, totalWords, categories: CATEGORIES, stages: STAGES });
  });

  router.get("/series/:id/edit", requireAdmin, (req, res) => {
    const serie = db.getNouvelleSerie(req.params.id);
    if (!serie) return res.redirect("/nouvelles");
    res.render("nouvelle-serie-form", { config, serie });
  });
  router.post("/series/:id/update", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const serie = db.getNouvelleSerie(req.params.id);
    if (!serie) return res.redirect("/nouvelles");
    db.updateNouvelleSerie(serie.id, {
      title:       String(req.body.title || "").slice(0, 300).trim() || serie.title,
      description: String(req.body.description || "").slice(0, 1000),
    });
    res.redirect(`/nouvelles/series/${serie.id}`);
  });
  router.post("/series/:id/delete", requireAdmin, (req, res) => {
    db.deleteNouvelleSerie(req.params.id);
    res.redirect("/nouvelles");
  });

  // ── Créer nouvelle ─────────────────────────────────────────────────────────
  router.get("/new", requireAdmin, (req, res) => {
    const series       = db.listNouvelleSeries();
    const allTags      = db.listAllSiteTags();
    const protagonistes = db.listProtagonistes();
    const preSerieId   = req.query.serie ? Number(req.query.serie) : null;
    res.render("nouvelles-form", { config, nouvelle: null, series, allTags, protagonistes, preSerieId, allParodies: db.listAllParodies(), categories: CATEGORIES, stages: STAGES });
  });
  router.post("/new", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const title = String(req.body.title || "").slice(0, 300).trim();
    if (!title) return res.redirect("/nouvelles/new");
    const serieId         = req.body.serie_id ? Number(req.body.serie_id) : null;
    const protagonisteIds = [].concat(req.body.protagoniste_ids || []).map(Number).filter(Boolean);
    const id = db.createNouvelle({
      title,
      content:          String(req.body.content  || ""),
      summary:          String(req.body.summary  || "").slice(0, 500),
      tags:             parseTags(req.body.tags),
      category:         String(req.body.category || ""),
      author:           String(req.body.author   || "").slice(0, 200),
      parody:           normalizeParody(String(req.body.parody   || "").slice(0, 200)),
      subParody:        normalizeParody(String(req.body.sub_parody || "").slice(0, 200)),
      featured:         req.body.featured === "1" ? 1 : 0,
      serie_id:         serieId,
      serie_order:      req.body.serie_order ? Number(req.body.serie_order) : 0,
      stage:            String(req.body.stage || "brouillon"),
      hidden:           req.body.hidden === "1" ? 1 : 0,
      protagoniste_ids: protagonisteIds,
    });
    if (serieId) return res.redirect(`/nouvelles/series/${serieId}`);
    res.redirect(`/nouvelles/${id}`);
  });

  // ── Lire ───────────────────────────────────────────────────────────────────
  router.get("/:id", (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    parseNouvelle(nouvelle);
    if (!isVisible(nouvelle, req.user)) return res.redirect("/nouvelles");
    let serie = null, chapters = [], chapterIndex = -1, prev = null, next = null;
    if (nouvelle.serie_id) {
      serie    = db.getNouvelleSerie(nouvelle.serie_id);
      chapters = db.listNouvellesBySerie(nouvelle.serie_id).map(parseNouvelle)
                   .filter(c => isVisible(c, req.user));
      chapterIndex = chapters.findIndex(c => c.id === nouvelle.id);
      prev = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
      next = chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;
    }
    const protagonistes = nouvelle.protagoniste_ids.length
      ? nouvelle.protagoniste_ids.map(id => db.getProtagoniste(id)).filter(Boolean)
      : [];
    const userReaction  = getUserReaction(req.user ? req.user.id : null, "nouvelle", nouvelle.id);
    const contentHtml   = renderContent(nouvelle.content);
    res.render("nouvelles-detail", { config, nouvelle, contentHtml, serie, chapters, chapterIndex, prev, next, protagonistes, userReaction, categories: CATEGORIES, stages: STAGES });
  });

  // ── Réaction (étoiles + J'adore) ──────────────────────────────────────────
  router.post("/:id/react", express.json(), (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.status(404).json({ ok: false });
    parseNouvelle(nouvelle);
    if (!isVisible(nouvelle, req.user)) return res.status(403).json({ ok: false });
    const rating = Math.max(0, Math.min(5, Number(req.body.rating) || 0));
    const flame  = !!req.body.flame;
    setUserReaction(req.user.id, "nouvelle", nouvelle.id, { rating, flame, interested: false, readLater: false, hidden: false, practiced: false });
    res.json({ ok: true });
  });

  // ── Éditer ─────────────────────────────────────────────────────────────────
  router.get("/:id/edit", requireAdmin, (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    parseNouvelle(nouvelle);
    const series        = db.listNouvelleSeries();
    const allTags       = db.listAllSiteTags();
    const protagonistes = db.listProtagonistes();
    res.render("nouvelles-form", { config, nouvelle, series, allTags, protagonistes, preSerieId: null, allParodies: db.listAllParodies(), categories: CATEGORIES, stages: STAGES });
  });
  router.post("/:id/update", requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    if (!nouvelle) return res.redirect("/nouvelles");
    const serieId         = req.body.serie_id ? Number(req.body.serie_id) : null;
    const protagonisteIds = [].concat(req.body.protagoniste_ids || []).map(Number).filter(Boolean);
    const title           = String(req.body.title || "").slice(0, 300).trim();
    db.updateNouvelle(nouvelle.id, {
      title:            title || nouvelle.title,
      content:          String(req.body.content  || ""),
      summary:          String(req.body.summary  || "").slice(0, 500),
      tags:             parseTags(req.body.tags),
      category:         String(req.body.category || ""),
      author:           String(req.body.author   || "").slice(0, 200),
      parody:           normalizeParody(String(req.body.parody   || "").slice(0, 200)),
      subParody:        normalizeParody(String(req.body.sub_parody || "").slice(0, 200)),
      featured:         req.body.featured === "1" ? 1 : 0,
      serie_id:         serieId,
      serie_order:      req.body.serie_order ? Number(req.body.serie_order) : 0,
      stage:            String(req.body.stage || "brouillon"),
      hidden:           req.body.hidden === "1" ? 1 : 0,
      protagoniste_ids: protagonisteIds,
    });
    res.redirect(`/nouvelles/${nouvelle.id}`);
  });

  // ── Supprimer ──────────────────────────────────────────────────────────────
  router.post("/:id/delete", requireAdmin, (req, res) => {
    const nouvelle = db.getNouvelleById(req.params.id);
    const serieId  = nouvelle ? nouvelle.serie_id : null;
    db.deleteNouvelle(req.params.id);
    if (serieId) return res.redirect(`/nouvelles/series/${serieId}`);
    res.redirect("/nouvelles");
  });

  return router;
}

module.exports = buildNouvellesRouter;
