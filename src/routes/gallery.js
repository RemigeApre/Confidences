const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const {
  listGalleryImages,
  getGalleryImage,
  insertGalleryImage,
  updateGalleryImage,
  reactGalleryImage,
  deleteGalleryImage,
  listGalleryAuthors,
  listGalleryParodies,
  updateGalleryImageMeta,
  listWikiPages,
  getWikiPage,
  listFavoriteRows,
  logGalleryView,
  mergeUserReactions,
  getUserReaction,
} = require("../db");
const { requireUser, requireAdmin } = require("../auth");
const { generateThumb, deleteThumb } = require("../thumbs");
const { filterOff } = require("../specialContent");

const CATEGORIES = [
  { key: "position",    label: "Positions",   hue: 270 },
  { key: "lieux",       label: "Lieux",       hue: 140 },
  { key: "partenaires", label: "Partenaires", hue: 210 },
  { key: "jeu_de_role", label: "Scénarios",   hue:  60 },
  { key: "tenues",      label: "Tenues",      hue: 175 },
  { key: "objets",      label: "Objets",      hue:  28 },
  { key: "pratique",    label: "Pratiques",   hue:   5 },
  { key: "fantasmes",   label: "Fantasmes",   hue: 330 },
  { key: "autre",       label: "Autre",       hue: 220 },
];
const CAT_MAP = {};
CATEGORIES.forEach((c) => { CAT_MAP[c.key] = c; });

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "gallery");
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename(req, file, cb) {
      const ext = ALLOWED_EXT[file.mimetype] || "";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, Object.prototype.hasOwnProperty.call(ALLOWED_EXT, file.mimetype));
  },
});

// Trouve l'entrée gallery_images dont image_paths contient une src donnée
function findImageBySrc(src, galleryImages) {
  return galleryImages.find(function(g) {
    return g.imagePaths && g.imagePaths.indexOf(src) !== -1;
  }) || null;
}

function parseTags(raw) {
  return String(raw || "").split(/[,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
}

// La catégorie est optionnelle pour une image de galerie (contrairement au
// wiki) : une chaîne vide veut dire "pas de catégorie", pas "autre".
function normalizeCategory(value) {
  return CATEGORIES.some((c) => c.key === value) ? value : "";
}

// Fusionne la case a cocher "Marquer Ultra" du formulaire avec les tags
// tapes a la main, sans jamais faire de doublon.
function applyUltraCheckbox(tags, checked) {
  const has = tags.some((t) => t.toLowerCase() === "ultra");
  if (checked && !has) return [...tags, "ultra"];
  if (!checked && has) return tags.filter((t) => t.toLowerCase() !== "ultra");
  return tags;
}

function unlinkFiles(paths) {
  (paths || []).forEach((p) => {
    try { fs.unlinkSync(path.join(uploadsDir, path.basename(p))); } catch (_) {}
    deleteThumb(p);
  });
}

// Une page wiki avec plusieurs photos ne fait plus qu'une seule entrée
// (album) dans la galerie, au lieu d'une carte par image.
function buildItems(galleryImages, wikiPages) {
  // Pages déjà couvertes par un enregistrement gallery lié → pas de doublon
  const linkedPageIds = new Set(galleryImages.filter((g) => g.wikiPageId).map((g) => g.wikiPageId));

  const wikiItems = [];
  wikiPages.forEach((page) => {
    // Images principales : une carte par image (destackées)
    if (page.imagePaths && page.imagePaths.length && !linkedPageIds.has(page.id)) {
      page.imagePaths.forEach((imgPath) => {
        wikiItems.push({
          type: "wiki",
          id: null,
          wikiPageId: page.id,
          imagePaths: [imgPath],
          title: page.title,
          category: page.category,
          tags: page.tags,
          notes: "",
          rating: page.rating || 0,
          flame: !!page.flame,
          interested: !!page.interested,
          contentType: "image",
          date: page.updatedAt,
        });
      });
    }
    // Images des variantes : une carte par image
    const variantes = (page.meta && Array.isArray(page.meta.variantes)) ? page.meta.variantes : [];
    variantes.forEach((v) => {
      const allSubs = Array.isArray(v.variantes) ? v.variantes : [];
      const varianteSources = [v, ...allSubs];
      varianteSources.forEach((vv) => {
        if (!Array.isArray(vv.images) || !vv.images.length) return;
        const extraTag = vv.nom ? [vv.nom.toLowerCase()] : [];
        vv.images.forEach((imgPath) => {
          wikiItems.push({
            type: "wiki",
            id: null,
            wikiPageId: page.id,
            imagePaths: [imgPath],
            title: page.title,
            category: page.category,
            tags: [...page.tags, ...extraTag],
            notes: "",
            rating: page.rating || 0,
            flame: !!page.flame,
            interested: !!page.interested,
            contentType: "image",
            date: page.updatedAt,
          });
        });
      });
    });
  });

  const galleryItems = galleryImages.map((img) => ({
    type: "gallery",
    id: img.id,
    wikiPageId: img.wikiPageId,
    imagePaths: img.imagePaths,
    title: img.title,
    category: img.category,
    tags: img.tags,
    notes: img.notes,
    rating: img.rating,
    flame: img.flame,
    interested: img.interested,
    contentType: img.contentType || "image",
    processed: !!img.processed,
    date: img.createdAt,
  }));

  return [...galleryItems, ...wikiItems].sort((a, b) => b.date.localeCompare(a.date));
}

function getCtx(user) {
  const userId = user ? user.id : null;
  const wikiPages = mergeUserReactions(listWikiPages(), userId, "wiki");
  const galleryImages = mergeUserReactions(listGalleryImages(), userId, "gallery");
  const items = filterOff(buildItems(galleryImages, wikiPages), user);
  const tagTotalCounts = {};
  items.forEach((item) => {
    item.tags.forEach((t) => { tagTotalCounts[t] = (tagTotalCounts[t] || 0) + 1; });
  });
  const allTags = Array.from(new Set(items.flatMap((i) => i.tags)))
    .sort((a, b) => {
      const diff = (tagTotalCounts[b] || 0) - (tagTotalCounts[a] || 0);
      return diff !== 0 ? diff : a.localeCompare(b, "fr");
    });
  return { items, allTags };
}

function buildGalleryRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const { items, allTags } = getCtx(req.user);
    const tagImageCounts = {};
    const tagBdCounts = {};
    items.forEach((item) => {
      const isBd = item.contentType === "bd";
      item.tags.forEach((t) => {
        if (isBd) tagBdCounts[t] = (tagBdCounts[t] || 0) + 1;
        else tagImageCounts[t] = (tagImageCounts[t] || 0) + 1;
      });
    });
    const favoriteGalleryIds = listFavoriteRows(req.user.id)
      .filter((r) => r.item_type === "gallery")
      .map((r) => r.item_id);
    const topTags = allTags.slice(0, 20);
    res.render("gallery", { config, items, allTags, topTags, categories: CATEGORIES, favoriteGalleryIds, tagImageCounts, tagBdCounts });
  });

  router.post("/", requireAdmin, upload.array("images", 30), (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.redirect("/galerie");
    const title = String(req.body.title || "").trim();
    const category = normalizeCategory(req.body.category);
    const tags = parseTags(req.body.tags);
    const notes = String(req.body.notes || "").trim();
    const author = String(req.body.author || "").trim();
    const parody = String(req.body.parody || "").trim();
    const contentType = req.body.content_type === "bd" ? "bd" : "image";
    const imagePaths = files.map((f) => `/uploads/gallery/${f.filename}`);
    imagePaths.forEach((p) => generateThumb(p));
    insertGalleryImage({ imagePaths, title, tags, notes, category, author, parody, contentType });
    res.redirect("/galerie");
  });

  // ── Actions groupées : sélectionner plusieurs cartes de galerie
  // (jamais les images issues du wiki) pour les taguer/supprimer d'un coup.
  // Placé avant "/:id" pour ne pas être confondu avec un identifiant.
  router.post("/bulk", requireAdmin, (req, res) => {
    const ids = [].concat(req.body.ids || []).map(Number).filter(Number.isInteger);
    const action = String(req.body.action || "");
    if (!ids.length) return res.json({ ok: false });

    if (action === "delete") {
      ids.forEach((id) => {
        const image = getGalleryImage(id);
        if (!image) return;
        unlinkFiles(image.imagePaths);
        deleteGalleryImage(id);
      });
    } else if (action === "ultra-on" || action === "ultra-off") {
      ids.forEach((id) => {
        const image = getGalleryImage(id);
        if (!image) return;
        const tags = applyUltraCheckbox(image.tags, action === "ultra-on");
        updateGalleryImage(id, {
          title: image.title,
          category: image.category,
          tags,
          notes: image.notes,
          imagePaths: image.imagePaths,
          wikiPageId: image.wikiPageId,
        });
      });
    } else {
      return res.json({ ok: false });
    }
    res.json({ ok: true });
  });

  // Métadonnées d'une image galerie par son src (pour le lightbox)
  router.get("/image-meta", function(req, res) {
    var src = String(req.query.src || "");
    if (!src) return res.json(null);
    var img = findImageBySrc(src, listGalleryImages());
    if (!img) return res.json(null);
    res.json({ id: img.id, tags: img.tags, author: img.author, parody: img.parody });
  });

  router.post("/image-meta", requireAdmin, express.json(), function(req, res) {
    var id = Number(req.body.id);
    if (!id) return res.json({ ok: false });
    var tags   = [].concat(req.body.tags || []).filter(Boolean);
    var author = String(req.body.author || "").trim();
    var parody = String(req.body.parody || "").trim();
    var title  = req.body.title !== undefined ? String(req.body.title).trim() : undefined;
    var notes  = req.body.notes !== undefined ? String(req.body.notes).trim() : undefined;
    updateGalleryImageMeta(id, { tags, author, parody, title, notes });
    res.json({ ok: true });
  });

  // Autocomplete auteurs
  router.get("/autocomplete/authors", function(req, res) {
    var q = String(req.query.q || "").toLowerCase();
    var all = listGalleryAuthors();
    res.json(q ? all.filter(function(a) { return a.toLowerCase().indexOf(q) !== -1; }) : all);
  });

  // Autocomplete parodies
  router.get("/autocomplete/parodies", function(req, res) {
    var q = String(req.query.q || "").toLowerCase();
    var all = listGalleryParodies();
    res.json(q ? all.filter(function(a) { return a.toLowerCase().indexOf(q) !== -1; }) : all);
  });

  // ── Import groupé ─────────────────────────────────
  router.get("/batch", requireAdmin, (req, res) => {
    const { allTags } = getCtx(req.user);
    const authors  = listGalleryAuthors();
    const parodies = listGalleryParodies();
    res.render("gallery-batch", { config, allTags, authors, parodies, categories: CATEGORIES });
  });

  router.post("/batch", requireAdmin, upload.any(), (req, res) => {
    const imgFiles = (req.files || []).filter((f) => f.fieldname === "images");
    if (!imgFiles.length) return res.redirect("/galerie/batch");

    const commonTags     = parseTags(req.body.common_tags);
    const commonCategory = normalizeCategory(req.body.common_category);
    const commonAuthor   = String(req.body.common_author  || "").trim();
    const commonParody   = String(req.body.common_parody  || "").trim();
    const commonType     = req.body.common_content_type === "bd" ? "bd" : "image";

    let batchMeta = {};
    try { batchMeta = JSON.parse(req.body.batch_meta || "{}"); } catch {}
    const groups   = Array.isArray(batchMeta.groups)     ? batchMeta.groups     : [];
    const fileGrps = Array.isArray(batchMeta.fileGroups) ? batchMeta.fileGroups : [];

    imgFiles.forEach((file, idx) => {
      const p = `/uploads/gallery/${file.filename}`;
      generateThumb(p);

      const assignedIds = Array.isArray(fileGrps[idx]) ? fileGrps[idx] : [];
      let finalTags     = [...commonTags];
      let finalCategory = commonCategory;
      let finalAuthor   = commonAuthor;

      assignedIds.forEach((gid) => {
        const g = groups.find((gr) => gr.id === gid);
        if (!g) return;
        finalTags     = [...new Set([...finalTags, ...parseTags(g.extraTags || "")])];
        if (g.category) finalCategory = normalizeCategory(g.category);
        if (g.author)   finalAuthor   = String(g.author).trim();
      });

      insertGalleryImage({
        imagePaths: [p],
        title:       "",
        tags:        finalTags,
        notes:       "",
        category:    finalCategory,
        wikiPageId:  null,
        author:      finalAuthor,
        parody:      commonParody,
        contentType: commonType,
      });
    });

    res.redirect("/galerie");
  });

  router.get("/:id/edit", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const image = Number.isInteger(id) ? getGalleryImage(id) : null;
    if (!image) return res.redirect("/galerie");
    Object.assign(image, getUserReaction(req.user.id, "gallery", id));
    const { allTags } = getCtx(req.user);
    const linkedPage = image.wikiPageId ? getWikiPage(image.wikiPageId) : null;
    res.render("gallery-form", { config, image, allTags, categories: CATEGORIES, linkedPage });
  });

  router.post("/:id/view", (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id) && id > 0) {
      logGalleryView(id, req.user ? req.user.id : null);
    }
    res.json({ ok: true });
  });

  router.post("/:id/processed", requireAdmin, express.json(), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json({ ok: false });
    const image = getGalleryImage(id);
    if (!image) return res.json({ ok: false });
    const processed = image.processed ? 0 : 1;
    updateGalleryImageMeta(id, { processed });
    res.json({ ok: true, processed });
  });

  router.post("/:id", requireAdmin, upload.array("images", 30), (req, res) => {
    const id = Number(req.params.id);
    const image = Number.isInteger(id) ? getGalleryImage(id) : null;
    if (!image) return res.redirect("/galerie");

    // Images : on part des existantes, on retire celles cochées, on ajoute
    // les nouvelles, puis on remet la couverture choisie en tête.
    const toRemove = [].concat(req.body.remove_image || []);
    const kept = image.imagePaths.filter((p) => !toRemove.includes(p));
    const added = (req.files || []).map((f) => `/uploads/gallery/${f.filename}`);
    added.forEach((p) => generateThumb(p));
    let imagePaths = [...kept, ...added];
    const cover = req.body.cover_image;
    if (cover && imagePaths.includes(cover) && imagePaths[0] !== cover) {
      imagePaths = [cover, ...imagePaths.filter((p) => p !== cover)];
    }
    unlinkFiles(toRemove);

    const tags = applyUltraCheckbox(parseTags(req.body.tags), req.body.ultra === "on");
    const category = normalizeCategory(req.body.category);
    const wikiPageIdRaw = Number(req.body.wiki_page_id);
    const wikiPageId = Number.isInteger(wikiPageIdRaw) && wikiPageIdRaw > 0 ? wikiPageIdRaw : null;
    const contentType = req.body.content_type === "bd" ? "bd" : "image";

    updateGalleryImage(id, {
      title: String(req.body.title || "").trim(),
      category,
      tags,
      notes: String(req.body.notes || "").trim(),
      imagePaths,
      wikiPageId,
      author: String(req.body.author || "").trim(),
      parody: String(req.body.parody || "").trim(),
      contentType,
    });

    const rating = Math.max(0, Math.min(5, Number(req.body.rating) || 0));
    reactGalleryImage(id, req.user.id, {
      rating,
      flame: req.body.flame === "on",
      interested: req.body.interested === "on",
    });

    res.redirect("/galerie");
  });

  router.post("/:id/react", express.json(), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json({ ok: false });
    if (!getGalleryImage(id)) return res.json({ ok: false });
    const rating = Math.max(0, Math.min(5, Number(req.body.rating) || 0));
    reactGalleryImage(id, req.user.id, { rating });
    res.json({ ok: true });
  });

  router.post("/:id/delete", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) {
      const image = getGalleryImage(id);
      if (image) {
        unlinkFiles(image.imagePaths);
        deleteGalleryImage(id);
      }
    }
    res.redirect("/galerie");
  });

  router.use((err, req, res, next) => {
    if (!err) return next();
    res.redirect("/galerie");
  });

  return router;
}

module.exports = buildGalleryRouter;
