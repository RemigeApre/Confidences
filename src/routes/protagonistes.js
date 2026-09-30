const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { requireUser, requireAdmin } = require("../auth");
const db = require("../db");
const { normalizeParody } = db;

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "personnages");
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename(req, file, cb) {
      const ext = ALLOWED_EXT[file.mimetype] || "";
      cb(null, `prot_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  fileFilter(req, file, cb) { cb(null, !!ALLOWED_EXT[file.mimetype]); },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const VALID_GENDERS = new Set(["femme", "homme", "autre", ""]);
const VALID_NATURES = new Set(["humain", "monstre", "animal", "pokemon", "autre", ""]);

function buildProtagonistesRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const all = db.listProtagonistes();
    const parodies = [...new Set(all.map(p => p.parody).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    res.render("protagonistes", { config, protagonistes: all, parodies });
  });

  router.get("/new", requireAdmin, (req, res) => {
    const allTags = db.listAllSiteTags();
    res.render("protagoniste-form", { config, protagoniste: null, allTags, allParodies: db.listAllParodies() });
  });
  router.post("/new", requireAdmin, upload.single("character_image"), (req, res) => {
    const name = String(req.body.name || "").slice(0, 200).trim();
    if (!name) return res.redirect("/protagonistes/new");
    const tags = String(req.body.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const parody = normalizeParody(String(req.body.parody || "").slice(0, 200));
    const subParody = normalizeParody(String(req.body.sub_parody || "").slice(0, 200));
    const gender = VALID_GENDERS.has(req.body.gender) ? req.body.gender : "";
    const nature = VALID_NATURES.has(req.body.nature) ? req.body.nature : "";
    const imagePath = req.file ? `/uploads/personnages/${req.file.filename}` : "";
    const id = db.createProtagoniste({ name, description: String(req.body.description || ""), tags, parody, subParody, gender, nature, imagePath });
    res.redirect(`/protagonistes/${id}`);
  });

  // API JSON : créer un·e protagoniste à la volée (depuis l'éditeur d'image)
  router.post("/api/create", requireAdmin, express.json(), (req, res) => {
    const name = String(req.body.name || "").slice(0, 200).trim();
    if (!name) return res.json({ ok: false, error: "Nom vide" });
    const existing = db.listProtagonistes().find(function(p) {
      return p.name.toLowerCase() === name.toLowerCase();
    });
    if (existing) return res.json({ ok: true, id: existing.id, name: existing.name });
    const id = db.createProtagoniste({ name, description: "", tags: [], parody: "", subParody: "", gender: "", nature: "", imagePath: "" });
    res.json({ ok: true, id, name });
  });

  router.get("/:id", (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (!protagoniste) return res.redirect("/protagonistes");
    const nouvelles = db.listNouvellesByProtagoniste(protagoniste.id)
      .filter(n => !req.user?.isAdmin ? (n.stage !== "brouillon" && !n.hidden) : true);
    const galleryImages = db.listGalleryImagesByProtagoniste(protagoniste.id);
    const codexPages = protagoniste.name ? db.listWikiPagesByTag(protagoniste.name) : [];
    const tagMeta = db.getAllTagMeta();
    res.render("protagoniste-detail", { config, protagoniste, nouvelles, galleryImages, codexPages, tagMeta });
  });

  router.get("/:id/edit", requireAdmin, (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (!protagoniste) return res.redirect("/protagonistes");
    const allTags = db.listAllSiteTags();
    res.render("protagoniste-form", { config, protagoniste, allTags, allParodies: db.listAllParodies() });
  });
  router.post("/:id/update", requireAdmin, upload.single("character_image"), (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (!protagoniste) return res.redirect("/protagonistes");
    const tags = String(req.body.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const parody = normalizeParody(String(req.body.parody || "").slice(0, 200));
    const subParody = normalizeParody(String(req.body.sub_parody || "").slice(0, 200));
    const gender = VALID_GENDERS.has(req.body.gender) ? req.body.gender : "";
    const nature = VALID_NATURES.has(req.body.nature) ? req.body.nature : "";
    const imagePath = req.file
      ? `/uploads/personnages/${req.file.filename}`
      : (req.body.remove_image === "1" ? "" : undefined);
    // Delete old image if replaced or removed
    if (req.file && protagoniste.image_path) {
      try { fs.unlinkSync(path.join(uploadsDir, path.basename(protagoniste.image_path))); } catch (_) {}
    }
    db.updateProtagoniste(protagoniste.id, {
      name:        String(req.body.name || "").slice(0, 200).trim() || protagoniste.name,
      description: String(req.body.description || ""),
      tags,
      parody,
      subParody,
      gender,
      nature,
      imagePath,
    });
    res.redirect(`/protagonistes/${protagoniste.id}`);
  });
  router.post("/:id/delete", requireAdmin, (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (protagoniste && protagoniste.image_path) {
      try { fs.unlinkSync(path.join(uploadsDir, path.basename(protagoniste.image_path))); } catch (_) {}
    }
    db.deleteProtagoniste(req.params.id);
    res.redirect("/protagonistes");
  });

  return router;
}

module.exports = buildProtagonistesRouter;
