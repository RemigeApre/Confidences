const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { requireUser, requireAdmin } = require("../auth");
const db = require("../db");
const { normalizeParody, listRaces, listClansForRace, setProtagonisteRace, listChildProtagonistes } = db;
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
const VALID_ORIENTATIONS = new Set(["hetero", "homo", "bi", "pan", "ace", "autre", ""]);

function buildProtagonistesRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const all = db.listProtagonistes({ includeChildren: true });
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
    const prenom = String(req.body.prenom || "").slice(0, 200).trim();
    const nom    = String(req.body.nom    || "").slice(0, 200).trim();
    if (!prenom && !nom) return res.redirect("/protagonistes/new");
    const tags = String(req.body.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const parody = normalizeParody(String(req.body.parody || "").slice(0, 200));
    const subParody = normalizeParody(String(req.body.sub_parody || "").slice(0, 200));
    const gender = VALID_GENDERS.has(req.body.gender) ? req.body.gender : "";
    const nature = VALID_NATURES.has(req.body.nature) ? req.body.nature : "";
    const orientation = VALID_ORIENTATIONS.has(req.body.orientation) ? req.body.orientation : "";
    const age = Math.max(0, parseInt(req.body.age || "0", 10) || 0);
    const ageVal = age > 0 ? Math.max(18, age) : 0;
    const imagePath = req.file ? `/uploads/personnages/${req.file.filename}` : "";
    const special = req.body.special || "";
    const id = db.createProtagoniste({
      prenom, nom,
      description: String(req.body.description || ""),
      descriptionPhysique: String(req.body.description_physique || ""),
      descriptionOeuvre: String(req.body.description_oeuvre || ""),
      tags, parody, subParody, gender, nature, imagePath, special, age: ageVal, orientation,
    });
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
    const childEvolutions = listChildProtagonistes(protagoniste.id);
    res.render("protagoniste-detail", { config, protagoniste, nouvelles, galleryImages, codexPages, tagMeta, childEvolutions });
  });

  router.get("/:id/edit", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const protagoniste = db.getProtagoniste(id);
    if (!protagoniste) return res.redirect("/protagonistes");
    const allTags = db.listAllSiteTags();
    const races = listRaces();
    const editLang = req.query.editLang === "en" ? "en" : "fr";
    const translations = db.getTranslationsForEntity("protagoniste", id, "en");
    res.render("protagoniste-form", { config, protagoniste, allTags, allParodies: db.listAllParodies(), races, editLang, translations });
  });
  router.post("/:id/update", requireAdmin, upload.single("character_image"), (req, res) => {
    const protagoniste = db.getProtagoniste(req.params.id);
    if (!protagoniste) return res.redirect("/protagonistes");

    // Champs partagés FR/EN — toujours sauvegardés
    const tags = String(req.body.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const parody = normalizeParody(String(req.body.parody || "").slice(0, 200));
    const subParody = normalizeParody(String(req.body.sub_parody || "").slice(0, 200));
    const gender = VALID_GENDERS.has(req.body.gender) ? req.body.gender : "";
    const nature = VALID_NATURES.has(req.body.nature) ? req.body.nature : "";
    const orientation = VALID_ORIENTATIONS.has(req.body.orientation) ? req.body.orientation : "";
    const age = Math.max(0, parseInt(req.body.age || "0", 10) || 0);
    const ageVal = age > 0 ? Math.max(18, age) : 0;
    const imagePath = req.file
      ? `/uploads/personnages/${req.file.filename}`
      : (req.body.remove_image === "1" ? "" : undefined);
    if (req.file && protagoniste.image_path) {
      try { fs.unlinkSync(path.join(uploadsDir, path.basename(protagoniste.image_path))); } catch (_) {}
    }
    let evolutions = [];
    try { evolutions = JSON.parse(req.body.evolutions || "[]"); } catch (_) {}
    if (!Array.isArray(evolutions)) evolutions = [];
    evolutions = evolutions.map(e => {
      if (typeof e === 'string') return { name: e.trim(), linked_id: null };
      return { name: String(e.name || '').trim(), linked_id: e.linked_id ? Number(e.linked_id) : null };
    }).filter(e => e.name || e.linked_id).slice(0, 20);
    const raceId = req.body.race_id ? Number(req.body.race_id) : null;
    const clanId = req.body.clan_id ? Number(req.body.clan_id) : null;

    if (req.body._editLang === "en") {
      const prenomEn = String(req.body.prenom || "").slice(0, 200).trim();
      const nomEn    = String(req.body.nom    || "").slice(0, 200).trim();
      db.setTranslation("protagoniste", protagoniste.id, "prenom", "en", prenomEn);
      db.setTranslation("protagoniste", protagoniste.id, "nom", "en", nomEn);
      const nameEn = [prenomEn, nomEn].filter(Boolean).join(" ") || protagoniste.name;
      db.setTranslation("protagoniste", protagoniste.id, "name", "en", nameEn);
      db.setTranslation("protagoniste", protagoniste.id, "description", "en", String(req.body.description || ""));
      db.setTranslation("protagoniste", protagoniste.id, "description_physique", "en", String(req.body.description_physique || ""));
      db.setTranslation("protagoniste", protagoniste.id, "description_oeuvre", "en", String(req.body.description_oeuvre || ""));
      db.setTranslation("protagoniste", protagoniste.id, "published_en", "en", req.body.published_en === "1" ? "1" : "");
      let evoEnArr = [];
      try { evoEnArr = JSON.parse(req.body.evolutions_en || "[]"); } catch (_) {}
      if (Array.isArray(evoEnArr)) {
        evoEnArr.forEach((name, i) => {
          db.setTranslation("protagoniste", protagoniste.id, `evo_${i}_en`, "en", String(name || "").trim());
        });
      }
      // Sauvegarder aussi les champs partagés
      db.updateProtagoniste(protagoniste.id, {
        prenom: protagoniste.prenom, nom: protagoniste.nom,
        description: protagoniste.description,
        descriptionPhysique: protagoniste.description_physique,
        descriptionOeuvre: protagoniste.description_oeuvre,
        tags, parody, subParody, gender, nature, imagePath, evolutions,
        special: req.body.special || "", age: ageVal, orientation,
      });
      setProtagonisteRace(protagoniste.id, raceId, clanId);
      return res.redirect(`/protagonistes/${protagoniste.id}/edit?editLang=en`);
    }

    const prenom = String(req.body.prenom || "").slice(0, 200).trim();
    const nom    = String(req.body.nom    || "").slice(0, 200).trim();
    db.updateProtagoniste(protagoniste.id, {
      prenom: prenom || protagoniste.prenom,
      nom,
      description: String(req.body.description || ""),
      descriptionPhysique: String(req.body.description_physique || ""),
      descriptionOeuvre: String(req.body.description_oeuvre || ""),
      tags, parody, subParody, gender, nature, imagePath, evolutions,
      special: req.body.special || "", age: ageVal, orientation,
    });
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

  // ── Évolutions : créer une fiche enfant ────────────────────────────────
  router.post("/:id/evo-sheet/create", requireAdmin, express.json(), (req, res) => {
    const parent = db.getProtagoniste(req.params.id);
    if (!parent) return res.json({ ok: false, error: "Parent not found" });
    const name = String(req.body.name || "").slice(0, 200).trim();
    if (!name) return res.json({ ok: false, error: "Nom vide" });
    const childId = db.createProtagoniste({
      prenom: name, nom: '', description: '', descriptionPhysique: '', descriptionOeuvre: '',
      tags: [], parody: parent.parody || '', subParody: parent.sub_parody || '',
      gender: '', nature: '', imagePath: '', evolutions: [], special: '', age: 0, orientation: '',
      parentId: parent.id,
    });
    res.json({ ok: true, id: childId, name });
  });

  // ── Évolutions : charger une fiche enfant (JSON) ───────────────────────
  router.get("/:id/evo-sheet/:childId", requireAdmin, (req, res) => {
    const parent = db.getProtagoniste(req.params.id);
    const child  = db.getProtagoniste(req.params.childId);
    if (!child || !parent || Number(child.parent_id) !== Number(parent.id))
      return res.json({ ok: false, error: "Not found" });
    const translations = db.getTranslationsForEntity("protagoniste", child.id, "en");
    const races = listRaces();
    res.json({ ok: true, child, translations, races });
  });

  // ── Évolutions : sauvegarder une fiche enfant ─────────────────────────
  router.post("/:id/evo-sheet/:childId/save", requireAdmin, upload.single("character_image"), (req, res) => {
    const parent = db.getProtagoniste(req.params.id);
    const child  = db.getProtagoniste(req.params.childId);
    if (!child || !parent || Number(child.parent_id) !== Number(parent.id))
      return res.json({ ok: false, error: "Not found" });

    const prenom = String(req.body.prenom || "").slice(0, 200).trim();
    const nom    = String(req.body.nom    || "").slice(0, 200).trim();
    const gender = VALID_GENDERS.has(req.body.gender) ? req.body.gender : "";
    const nature = VALID_NATURES.has(req.body.nature) ? req.body.nature : "";
    const orientation = VALID_ORIENTATIONS.has(req.body.orientation) ? req.body.orientation : "";
    const age  = Math.max(0, parseInt(req.body.age || "0", 10) || 0);
    const ageVal = age > 0 ? Math.max(18, age) : 0;
    const special = req.body.special || "";
    const imagePath = req.file
      ? `/uploads/personnages/${req.file.filename}`
      : (req.body.remove_image === "1" ? "" : undefined);
    if (req.file && child.image_path) {
      try { fs.unlinkSync(path.join(uploadsDir, path.basename(child.image_path))); } catch (_) {}
    }
    const raceId = req.body.race_id ? Number(req.body.race_id) : null;
    const clanId = req.body.clan_id ? Number(req.body.clan_id) : null;

    if (req.body._editLang === "en") {
      const prenomEn = String(req.body.prenom || "").slice(0, 200).trim();
      const nomEn    = String(req.body.nom    || "").slice(0, 200).trim();
      db.setTranslation("protagoniste", child.id, "prenom", "en", prenomEn);
      db.setTranslation("protagoniste", child.id, "nom", "en", nomEn);
      db.setTranslation("protagoniste", child.id, "name", "en", [prenomEn, nomEn].filter(Boolean).join(" ") || child.name);
      db.setTranslation("protagoniste", child.id, "description", "en", String(req.body.description || ""));
      db.setTranslation("protagoniste", child.id, "description_physique", "en", String(req.body.description_physique || ""));
      db.setTranslation("protagoniste", child.id, "description_oeuvre", "en", String(req.body.description_oeuvre || ""));
      db.setTranslation("protagoniste", child.id, "published_en", "en", req.body.published_en === "1" ? "1" : "");
      db.updateProtagoniste(child.id, {
        prenom: child.prenom, nom: child.nom,
        description: child.description, descriptionPhysique: child.description_physique,
        descriptionOeuvre: child.description_oeuvre,
        tags: child.tags || [], parody: child.parody || '', subParody: child.sub_parody || '',
        gender, nature, imagePath, evolutions: [], special, age: ageVal, orientation,
      });
      setProtagonisteRace(child.id, raceId, clanId);
      return res.json({ ok: true, lang: "en", name: child.name });
    }

    db.updateProtagoniste(child.id, {
      prenom: prenom || child.prenom,
      nom,
      description: String(req.body.description || ""),
      descriptionPhysique: String(req.body.description_physique || ""),
      descriptionOeuvre: String(req.body.description_oeuvre || ""),
      tags: child.tags || [], parody: child.parody || '', subParody: child.sub_parody || '',
      gender, nature, imagePath, evolutions: [], special, age: ageVal, orientation,
    });
    setProtagonisteRace(child.id, raceId, clanId);
    const updated = db.getProtagoniste(child.id);
    res.json({ ok: true, lang: "fr", name: updated ? updated.name : (prenom || child.name) });
  });

  return router;
}

module.exports = buildProtagonistesRouter;
