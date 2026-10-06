const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { requireUser, requireAdmin } = require("../auth");
const db = require("../db");
const { normalizeParody, listRaces, listClansForRace, setProtagonisteRace } = db;
const { insertGalleryImage } = db;
const { generateThumb } = require("../thumbs");

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "personnages");
fs.mkdirSync(uploadsDir, { recursive: true });

const galleryUploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "gallery");
fs.mkdirSync(galleryUploadsDir, { recursive: true });

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

const galleryUpload = multer({
  storage: multer.diskStorage({
    destination: galleryUploadsDir,
    filename(req, file, cb) {
      const ext = ALLOWED_EXT[file.mimetype] || "";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter(req, file, cb) { cb(null, !!ALLOWED_EXT[file.mimetype]); },
  limits: { fileSize: 20 * 1024 * 1024 },
});

const VALID_GENDERS = new Set(["femme", "homme", "autre", ""]);
const VALID_NATURES = new Set(["humain", "monstre", "animal", "pokemon", "autre", ""]);

function buildProtagonistesRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const all = db.listProtagonistes();
    const parodies = [...new Set(all.map(p => p.parody).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    const races = listRaces();
    res.render("protagonistes", { config, protagonistes: all, parodies, races });
  });

  // API : clans d'une race (pour le formulaire dynamique)
  router.get("/api/races/:raceId/clans", requireAdmin, (req, res) => {
    const clans = listClansForRace(Number(req.params.raceId));
    res.json({ ok: true, clans });
  });

  router.get("/new", requireAdmin, (req, res) => {
    const allTags = db.listAllSiteTags();
    const races = listRaces();
    res.render("protagoniste-form", { config, protagoniste: null, allTags, allParodies: db.listAllParodies(), races });
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
    const special = req.body.special || "";
    const id = db.createProtagoniste({ name, description: String(req.body.description || ""), tags, parody, subParody, gender, nature, imagePath, special });
    const raceId = req.body.race_id ? Number(req.body.race_id) : null;
    const clanId = req.body.clan_id ? Number(req.body.clan_id) : null;
    if (raceId) setProtagonisteRace(id, raceId, clanId);
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
    const races = listRaces();
    res.render("protagoniste-form", { config, protagoniste, allTags, allParodies: db.listAllParodies(), races });
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
    let evolutions = [];
    try { evolutions = JSON.parse(req.body.evolutions || "[]"); } catch (_) {}
    if (!Array.isArray(evolutions)) evolutions = [];
    evolutions = evolutions.map(e => String(e).trim()).filter(Boolean).slice(0, 20);
    db.updateProtagoniste(protagoniste.id, {
      name:        String(req.body.name || "").slice(0, 200).trim() || protagoniste.name,
      description: String(req.body.description || ""),
      tags,
      parody,
      subParody,
      gender,
      nature,
      imagePath,
      evolutions,
      special: req.body.special || "",
    });
    const raceId = req.body.race_id ? Number(req.body.race_id) : null;
    const clanId = req.body.clan_id ? Number(req.body.clan_id) : null;
    setProtagonisteRace(protagoniste.id, raceId, clanId);
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

  router.post("/:id/gallery-upload", requireAdmin, galleryUpload.array("images", 50), (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (!protagoniste) return res.redirect("/protagonistes");
    const files = req.files || [];
    const parody    = normalizeParody(String(req.body.parody    || protagoniste.parody    || ""));
    const subParody = normalizeParody(String(req.body.sub_parody || protagoniste.sub_parody || ""));
    files.forEach((f) => {
      const p = `/uploads/gallery/${f.filename}`;
      generateThumb(p);
      insertGalleryImage({
        imagePaths:     [p],
        title:          "",
        tags:           [],
        notes:          "",
        category:       "",
        author:         "",
        parody,
        subParody,
        protagonistIds: [protagoniste.id],
      });
    });
    res.redirect(`/protagonistes/${protagoniste.id}`);
  });

  return router;
}

module.exports = buildProtagonistesRouter;
