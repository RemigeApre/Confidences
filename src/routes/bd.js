const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { listBdBooks, getBdBook, insertBdBook, updateBdBook, deleteBdBook, reactBdBook, getBdPageReactionsMap, reactBdPage, mergeUserReactions, mergePartnerReaction, excludeHidden, getUserReaction, isFavorite, logBdView } = require("../db");
const { requireUser, requireUserJson, requireAdmin } = require("../auth");
const { generateThumb, deleteThumb } = require("../thumbs");
const { filterOff, isOffForUser } = require("../specialContent");

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "bd");
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
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, Object.prototype.hasOwnProperty.call(ALLOWED_EXT, file.mimetype));
  },
});

function parseTags(raw) {
  return String(raw || "").split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
}

// Fusionne une case à cocher tag avec les tags libres, sans doublon.
function applyTagCheckbox(tags, tagName, checked) {
  const has = tags.some((t) => t.toLowerCase() === tagName);
  if (checked && !has) return [...tags, tagName];
  if (!checked && has) return tags.filter((t) => t.toLowerCase() !== tagName);
  return tags;
}

function applyUltraCheckbox(tags, checked) {
  return applyTagCheckbox(tags, "ultra", checked);
}

function applyImageOrder(existing, newFiles, orderRaw) {
  if (!orderRaw) return [...existing, ...newFiles];
  const entries = String(orderRaw).split(",").map((s) => s.trim()).filter(Boolean);
  const result = [];
  for (const entry of entries) {
    if (entry.startsWith("__new__:")) {
      const idx = Number(entry.slice(8));
      if (!isNaN(idx) && idx >= 0 && idx < newFiles.length) result.push(newFiles[idx]);
    } else if (existing.includes(entry)) {
      result.push(entry);
    }
  }
  // Append any orphaned new files not referenced in order
  const inResult = new Set(result);
  for (const p of newFiles) { if (!inResult.has(p)) result.push(p); }
  return result;
}

function buildBdRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const userId = req.user ? req.user.id : null;
    const partnerId = req.user ? req.user.partnerId : null;
    const books = filterOff(mergePartnerReaction(excludeHidden(mergeUserReactions(listBdBooks(), userId, "bd")), partnerId, "bd"), req.user);
    const tagSet = new Set();
    books.forEach((b) => b.tags.forEach((t) => tagSet.add(t)));
    const allTags = [...tagSet].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    res.render("bd", { config, books, allTags });
  });

  router.get("/new", requireAdmin, (req, res) => {
    res.render("bd-form", { config, book: null });
  });

  router.post("/", requireAdmin, upload.array("images", 200), (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.redirect("/bd/new");
    const description = String(req.body.description || "").trim();
    let tags = applyUltraCheckbox(parseTags(req.body.tags), req.body.ultra === "on");
    tags = applyTagCheckbox(tags, "en couleur", req.body.couleur === "on");
    const langue = ["francais", "anglais", "japonais", "autre"].includes(req.body.langue) ? req.body.langue : "";
    const newFiles = (req.files || []).map((f) => `/uploads/bd/${f.filename}`);
    newFiles.forEach((p) => generateThumb(p));
    const imagePaths = applyImageOrder([], newFiles, req.body.image_order);
    const id = insertBdBook({ title, description, tags, imagePaths, langue });
    res.redirect(`/bd/${id}`);
  });

  router.get("/:id/edit", requireAdmin, (req, res) => {
    const book = getBdBook(Number(req.params.id));
    if (!book) return res.redirect("/bd");
    res.render("bd-form", { config, book });
  });

  router.post("/:id/delete", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const book = getBdBook(id);
    if (book) {
      for (const src of book.imagePaths) {
        try { fs.unlinkSync(path.join(uploadsDir, path.basename(src))); } catch (_) {}
        deleteThumb(src);
      }
      deleteBdBook(id);
    }
    res.redirect("/bd");
  });

  router.post("/:id", requireAdmin, upload.array("images", 200), (req, res) => {
    const id = Number(req.params.id);
    const book = getBdBook(id);
    if (!book) return res.redirect("/bd");

    const title = String(req.body.title || "").trim() || book.title;
    const description = String(req.body.description || "").trim();
    let tags = applyUltraCheckbox(parseTags(req.body.tags), req.body.ultra === "on");
    tags = applyTagCheckbox(tags, "en couleur", req.body.couleur === "on");
    const langue = ["francais", "anglais", "japonais", "autre"].includes(req.body.langue) ? req.body.langue : "";

    const toRemove = new Set([].concat(req.body.remove_image || []));
    for (const src of toRemove) {
      try { fs.unlinkSync(path.join(uploadsDir, path.basename(src))); } catch (_) {}
      deleteThumb(src);
    }

    const existing = book.imagePaths.filter((p) => !toRemove.has(p));
    const newFiles = (req.files || []).map((f) => `/uploads/bd/${f.filename}`);
    newFiles.forEach((p) => generateThumb(p));
    const imagePaths = applyImageOrder(existing, newFiles, req.body.image_order);

    updateBdBook(id, { title, description, tags, imagePaths, langue });
    res.redirect(`/bd/${id}`);
  });

  // "Ça m'intéresse" reste au niveau du livre entier (contrairement à la
  // note/j'adore/masquer, individuels par page — voir POST /:id/page/:page/react).
  router.post("/:id/react", requireUserJson, express.json(), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json({ ok: false });
    const book = getBdBook(id);
    if (!book) return res.json({ ok: false });
    const current = getUserReaction(req.user.id, "bd", id);
    const interested = req.body.interested !== undefined ? !!req.body.interested : current.interested;
    reactBdBook(id, req.user.id, { interested });
    res.json({ ok: true, interested });
  });

  // Note / j'adore / masquer d'UNE page précise du livre — voir bd-detail.ejs.
  // Le livre entier reçoit automatiquement un agrégat (voir reactBdPage
  // dans db.js), donc /bd, les listes "notes" et l'admin continuent de
  // fonctionner sans changement.
  router.post("/:id/page/:page/react", requireUserJson, express.json(), (req, res) => {
    const id = Number(req.params.id);
    const page = Number(req.params.page);
    if (!Number.isInteger(id) || !Number.isInteger(page) || page < 0) return res.json({ ok: false });
    const book = getBdBook(id);
    if (!book || page >= book.imagePaths.length) return res.json({ ok: false });

    const result = reactBdPage(book, page, req.user.id, {
      rating: req.body.rating,
      flame: req.body.flame,
      hidden: req.body.hidden,
    });
    res.json({ ok: true, page, rating: result.rating, flame: result.flame, hidden: result.hidden });
  });

  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    const book = getBdBook(id);
    if (!book) return res.redirect("/bd");
    if (isOffForUser(book.tags, req.user)) return res.redirect("/bd");
    logBdView(book.id, req.user ? req.user.id : null);
    const userId = req.user ? req.user.id : null;
    Object.assign(book, getUserReaction(userId, "bd", id));
    mergePartnerReaction([book], req.user ? req.user.partnerId : null, "bd");
    const allBooks = listBdBooks();
    const idx = allBooks.findIndex((b) => b.id === book.id);
    const prevBook = idx < allBooks.length - 1 ? allBooks[idx + 1] : null;
    const nextBook = idx > 0 ? allBooks[idx - 1] : null;
    const pageReactions = getBdPageReactionsMap(userId, book);
    const partnerPageReactions = req.user && req.user.partnerId
      ? getBdPageReactionsMap(req.user.partnerId, book)
      : {};
    res.render("bd-detail", {
      config, book, prevBook, nextBook,
      isFavorite: isFavorite(req.user.id, "bd", book.id),
      pageReactions, partnerPageReactions,
    });
  });

  router.use((err, req, res, next) => {
    if (!err) return next();
    console.error(err);
    res.redirect("/bd");
  });

  return router;
}

module.exports = buildBdRouter;
