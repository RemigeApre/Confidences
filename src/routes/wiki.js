const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const {
  insertWikiPage,
  listWikiPages,
  getWikiPage,
  updateWikiPage,
  reactWikiPage,
  deleteWikiPage,
  incrementWikiViews,
  setWikiPageMaturity,
  getWikiPageLinks,
  getWikiBacklinks,
  addWikiPageLink,
  removeWikiPageLink,
  getWikiQuestionLinks,
  addWikiQuestionLink,
  removeWikiQuestionLink,
  getPagesForQuestion,
  getImageLinks,
  addImageLink,
  removeImageLink,
  isFavorite,
  addFavorite,
  removeFavorite,
  getUserNote,
  setUserNote,
  mergeUserReactions,
  mergePartnerReaction,
  excludeHidden,
  getUserReaction,
  createStandaloneTag,
  insertGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  setGalleryImageWikiSynced,
  listGalleryImages,
  listUnexploredWikiPages,
  listBlacklistedTags,
} = require("../db");
const { requireUser, requireUserJson, requireAdmin } = require("../auth");
const { generateThumb } = require("../thumbs");
const { filterOff, isOffForUser, specialTagOf } = require("../specialContent");

const CATEGORIES = [
  { key: "position",   label: "Positions",   desc: "Postures, Kama-sutra et toutes leurs variantes.",                               hue: 270 },
  { key: "lieux",      label: "Lieux",       desc: "Endroits, contextes et ambiances où se déroule l\u2019action.",                hue: 140 },
  { key: "partenaires",label: "Partenaires", desc: "Nature et nombre de partenaires : solo, duo, trio\u2026",                     hue: 210 },
  { key: "jeu_de_role",label: "Scénarios",   desc: "Jeux de rôle, scénarios joués, personnages et ambiances.",                    hue:  60 },
  { key: "tenues",     label: "Tenues",      desc: "Lingerie, costumes et tout ce qui se porte.",                                  hue: 175 },
  { key: "objets",     label: "Objets",      desc: "Sex-toys, godes, liens et accessoires hors tenues.",                          hue:  28 },
  { key: "pratique",   label: "Pratiques",   desc: "Domination, BDSM, Bondage et pratiques sexuelles.",                            hue:   5 },
  { key: "fantasmes",  label: "Fantasmes",   desc: "Tout ce qui ne trouve pas de cat\u00e9gorie sp\u00e9cifique — le reste.",     hue: 330 },
];

// "Fantaisie" est un tag libre. "autre" a été fusionné dans "fantasmes" (migration DB).
// La clé "jeu_de_role" est conservée pour ne pas invalider les données existantes.
const FANTASMES_SUBCATS = [
  { key: "hardcore",   label: "Hardcore" },
  { key: "bdsm",       label: "BDSM" },
  { key: "classique",  label: "Classique" },
];
const OBJETS_SUBCATS = [
  { key: "substance", label: "Substance" },
  { key: "gode",      label: "Gode" },
  { key: "bdsm",      label: "BDSM" },
  { key: "fantaisie", label: "Fantaisie" },
  { key: "tatouage",  label: "Tatouage" },
  { key: "autre",     label: "Autre" },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
const OWNED_CATEGORIES = ["objets", "tenues"];

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "wiki");
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

function parseTags(raw) {
  return String(raw || "")
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// Enrichit les tags avec le titre de la page et ses termes dérivés,
// crée les entrées tag_meta correspondantes, et synchronise les images
// de la page dans gallery_images (un enregistrement lié par page).
function autoEnrichTags(tags, title, derivedTerms) {
  const extras = [title, ...derivedTerms.map((t) => (typeof t === "string" ? t : t.term || ""))].map((s) =>
    s.trim().toLowerCase()
  ).filter(Boolean);
  const result = [...tags];
  extras.forEach((t) => {
    if (!result.map((r) => r.toLowerCase()).includes(t)) result.push(t);
    createStandaloneTag(t);
  });
  return result;
}

// Synchronise les fiches galerie d'une page wiki : une fiche par image
// (principales + variantes/sous-variantes + image de scénario), jamais
// regroupées — chaque image du site doit avoir sa propre fiche, notable/
// masquable/collectionnable indépendamment des autres. Recalculé à chaque
// sauvegarde : les fiches dont l'image n'est plus utilisée (retirée/
// remplacée) sont supprimées, les nouvelles sont créées, celles qui
// existent déjà (même chemin) sont conservées telles quelles pour ne pas
// perdre leurs notes/favoris/collections — seul leur tag de titre est
// resynchronisé (utile en cas de renommage de la page).
// Ne touche jamais une fiche liée à la main depuis l'upload direct de la
// Galerie (wikiSynced=false, voir gallery_images.wiki_synced) : celles-ci
// ne sont pas dérivées du contenu de la page, on ne fait que garder leur
// tag de titre à jour.
// oldTitleTag : ancien titre normalisé, fourni lors d'un renommage pour
//              remplacer le tag périmé dans toutes les images concernées.
function syncPageGalleryImages(pageId, title, imagePaths, meta, oldTitleTag) {
  const items = [];
  (imagePaths || []).forEach((p) => items.push({ path: p, label: "" }));
  const variantes = (meta && Array.isArray(meta.variantes)) ? meta.variantes : [];
  variantes.forEach((v) => {
    (Array.isArray(v.images) ? v.images : []).forEach((p) => items.push({ path: p, label: v.nom || "" }));
    (Array.isArray(v.variantes) ? v.variantes : []).forEach((sv) => {
      (Array.isArray(sv.images) ? sv.images : []).forEach((p) => items.push({ path: p, label: sv.nom || "" }));
    });
  });
  if (meta && meta.scenario_image) items.push({ path: meta.scenario_image, label: "" });

  const seenPaths = new Set();
  const dedupedItems = items.filter((it) => {
    if (seenPaths.has(it.path)) return false;
    seenPaths.add(it.path);
    return true;
  });
  const desiredPaths = new Set(dedupedItems.map((it) => it.path));
  const titleTag = title.trim().toLowerCase();

  function withTitleTag(tags) {
    let result = tags.map((t) =>
      (oldTitleTag && oldTitleTag !== titleTag && t.toLowerCase() === oldTitleTag) ? titleTag : t
    );
    if (!result.some((t) => t.toLowerCase() === titleTag)) result.push(titleTag);
    return result;
  }
  function tagsEqual(a, b) {
    return a.length === b.length && a.every((t, i) => t === b[i]);
  }

  const linked = listGalleryImages().filter((g) => g.wikiPageId === pageId);
  const existingByPath = {};
  linked.forEach((g) => {
    if (!g.wikiSynced) {
      // Lien manuel (upload direct Galerie) : on garde juste le tag de
      // titre à jour, jamais ses images ni sa suppression.
      const updatedTags = withTitleTag(g.tags);
      if (!tagsEqual(updatedTags, g.tags)) {
        updateGalleryImage(g.id, {
          title: g.title, category: g.category, tags: updatedTags, notes: g.notes,
          imagePaths: g.imagePaths, wikiPageId: g.wikiPageId, author: g.author,
          parody: g.parody, contentType: g.contentType,
        });
      }
      return;
    }
    if (g.imagePaths.length === 1 && desiredPaths.has(g.imagePaths[0])) {
      existingByPath[g.imagePaths[0]] = g;
    } else {
      // Image retirée/remplacée, ou ancienne fiche "album" multi-images.
      deleteGalleryImage(g.id);
    }
  });

  dedupedItems.forEach((it) => {
    const existing = existingByPath[it.path];
    if (existing) {
      const updatedTags = withTitleTag(existing.tags);
      if (existing.title !== title || !tagsEqual(updatedTags, existing.tags)) {
        updateGalleryImage(existing.id, {
          title, category: existing.category, tags: updatedTags, notes: existing.notes,
          imagePaths: existing.imagePaths, wikiPageId: pageId, author: existing.author,
          parody: existing.parody, contentType: existing.contentType,
        });
      }
      return;
    }
    const tags = [titleTag];
    if (it.label) tags.push(it.label.toLowerCase());
    const newId = insertGalleryImage({ imagePaths: [it.path], title, tags, notes: "", category: "", wikiPageId: pageId });
    setGalleryImageWikiSynced(newId, true);
  });
}

// Chaque synonyme peut être marqué "anglais" individuellement (suffixe
// interne "::en" ajouté par le widget côté client, jamais tapé par
// l'utilisateur) — remplace l'ancien réglage global "Terme anglais"
// qui s'appliquait à tort à tous les synonymes à la fois.
function parseDerivedTerms(raw) {
  return String(raw || "")
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const en = /::en$/.test(t);
      return { term: en ? t.slice(0, -4).trim() : t, en };
    })
    .filter((t) => t.term);
}

function normalizeCategory(value) {
  return CATEGORY_KEYS.includes(value) ? value : "fantasmes";
}

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

function parseMeta(category, body) {
  // Champs transversaux (toutes catégories)
  const base = {
    termes_derives: parseDerivedTerms(body.meta_termes_derives || ""),
    orce_name:    String(body.meta_orce_name    || "").slice(0, 200).trim(),
    orce_content: String(body.meta_orce_content || "").slice(0, 10000).trim(),
  };

  let specific = {};
  if (category === "position") {
    const validCats    = ["penetration","fellation_cunnilingus","anilingus","stimulation_manuelle","double_penetration","position_69","autre"];
    const validDessus  = ["femme","homme","variable","aucun"];
    const validCanal   = ["vagin","anus","bouche","mains","autre"];
    const validOri     = ["face_a_face","face_contre_dos","cote_a_cote","acrobatique","autre"];
    const validNbPart  = ["2","3","4plus","variable"];
    const validActif   = ["femme","homme","les_deux","variable"];
    const validSupport = ["lit","sol","chaise","canape","mur","table","bain","autre"];
    const oneof = (v, list) => list.includes(String(v || "")) ? String(v) : "";
    const manyof = (v, list) => arr(v).filter(x => list.includes(x));
    specific = {
      categorie:        oneof(body.meta_categorie,        validCats),
      qui_dessus:       oneof(body.meta_qui_dessus,       validDessus),
      canal:            manyof(body.meta_canal,           validCanal),
      orientation:      manyof(body.meta_orientation,     validOri),
      nb_partenaires:   oneof(body.meta_nb_partenaires,   validNbPart),
      partenaire_actif: oneof(body.meta_partenaire_actif, validActif),
      supports:         manyof(body.meta_supports,        validSupport),
    };

    // Sections textuelles spécifiques aux positions
    let variantes = [];
    try { variantes = JSON.parse(body.meta_variantes || "[]"); } catch (_) {}
    function sanitizeVar(v) {
      return {
        id: String(v.id || ""),
        nom: String(v.nom || "").slice(0, 200).trim(),
        description: String(v.description || "").slice(0, 5000),
        images: Array.isArray(v.images) ? v.images.filter((s) => typeof s === "string" && s.startsWith("/uploads/")) : [],
        variantes: Array.isArray(v.variantes) ? v.variantes.map(function (sv) {
          return {
            id: String(sv.id || ""),
            nom: String(sv.nom || "").slice(0, 200).trim(),
            description: String(sv.description || "").slice(0, 5000),
            images: Array.isArray(sv.images) ? sv.images.filter((s) => typeof s === "string" && s.startsWith("/uploads/")) : [],
          };
        }) : [],
      };
    }
    specific.variantes     = Array.isArray(variantes) ? variantes.map(sanitizeVar) : [];
    specific.infos_utiles  = String(body.meta_infos_utiles || "").slice(0, 10000);
    specific.nouvelles     = String(body.meta_nouvelles || "").slice(0, 5000);
  } else if (category === "fantasmes") {
    const sub = body.meta_sous_cat;
    const validSubs = FANTASMES_SUBCATS.map((s) => s.key);
    specific = { sous_cat: validSubs.includes(sub) ? sub : "" };
  } else if (category === "partenaires") {
    const oneof  = (v, list) => list.includes(String(v || "")) ? String(v) : "";
    const manyof = (v, list) => arr(v).filter(x => list.includes(x));
    const str    = (v, max)  => String(v || "").slice(0, max).trim();
    const num    = (v)       => { const n = parseFloat(v); return (isNaN(n) || n < 0) ? "" : String(n); };
    specific = {
      sous_cat:            oneof(body.meta_sous_cat, ["nombre","monstre","animaux","fetichisme","autre"]),
      // Communs à tous les types
      nature_acte:         oneof(body.meta_nature_acte,     ["possible","improbable","impossible","fictif","inconnu"]),
      cadre_legal:         oneof(body.meta_cadre_legal,     ["legal","flou","illegal","inconnu"]),
      risque_physique:     oneof(body.meta_risque_physique, ["inconnu","nul","faible","modere","eleve","extreme"]),
      risque_mst:          oneof(body.meta_risque_mst,      ["inconnu","nul","faible","modere","eleve","extreme"]),
      accessibilite:       oneof(body.meta_accessibilite,   ["tres_rare","rare","occasionnel","frequent","inconnu"]),
      scenario:            str(body.meta_scenario, 5000),
      scenario_image:      String(body.meta_scenario_image || "").startsWith("/uploads/") ? String(body.meta_scenario_image).slice(0, 500) : "",
      scenario_human:      body.meta_scenario_human === "on",
      // Nombre
      nb_total:            oneof(body.meta_nb_total,   ["2","3","4","5plus"]),
      nb_feminin:          oneof(body.meta_nb_feminin,  ["0","1","2","3plus"]),
      nb_masculin:         oneof(body.meta_nb_masculin, ["0","1","2","3plus"]),
      // Monstre
      type_creature:        oneof(body.meta_type_creature,        ["machine","sang_froid","mammifere","insectoide","amorphe","elementaire","autre"]),
      type_acte_sexuel:     manyof(body.meta_type_acte_sexuel,    ["penetration","absorption","constriction","pondaison","investation","possession","fusion","parasitage","transformation","insemination","aucun_variable","autre"]),
      niveau_intelligence:  oneof(body.meta_niveau_intelligence,  ["bestiale","faible","correcte","forte","inconnu"]),
      capacite_parole:      oneof(body.meta_capacite_parole,      ["impossible","possible","oui","frequente","inconnu"]),
      compat_anatomique:    oneof(body.meta_compat_anatomique,    ["oui","non","partielle","inconnu"]),
      origine_conceptuelle: oneof(body.meta_origine_conceptuelle, ["fantaisie","science_fiction","imaginaire","autre"]),
      // Animal
      famille_zoologique: oneof(body.meta_famille_zoologique, ["canide","equide","felin","bovin","reptile","aviaire","cetace","autre"]),
      taille_animal:      oneof(body.meta_taille_animal,      ["petit","egal","grand","tres_grand"]),
      // Communs Monstre + Animal
      nature_espece:     oneof(body.meta_nature_espece,      ["domestique","sauvage","inconnu"]),
      taille_penis_qual: oneof(body.meta_taille_penis_qual, ["faible","modere","grand","tres_grand"]),
      taille_penis_min:  body.meta_taille_penis_qual ? "" : num(body.meta_taille_penis_min),
      taille_penis_max:  body.meta_taille_penis_qual ? "" : num(body.meta_taille_penis_max),
      circ_penis_qual:   oneof(body.meta_circ_penis_qual,   ["faible","modere","grand","tres_grand"]),
      circ_penis_min:    body.meta_circ_penis_qual   ? "" : num(body.meta_circ_penis_min),
      circ_penis_max:    body.meta_circ_penis_qual   ? "" : num(body.meta_circ_penis_max),
      vol_ejac_qual:     oneof(body.meta_vol_ejac_qual,     ["faible","modere","grand","tres_grand"]),
      vol_ejac_min:      body.meta_vol_ejac_qual     ? "" : num(body.meta_vol_ejac_min),
      vol_ejac_max:      body.meta_vol_ejac_qual     ? "" : num(body.meta_vol_ejac_max),
      sperme_texture:    str(body.meta_sperme_texture, 200),
      sperme_odeur:      str(body.meta_sperme_odeur,   200),
      sperme_gout:       str(body.meta_sperme_gout,    200),
      type_verrouillage: oneof(body.meta_type_verrouillage, ["aucun","noeud","epines","ventouses","partiel","autre","inconnu"]),
      sensations:        manyof(body.meta_sensations, ["pression","remplissage","frottement","elongation","vibration","chaleur","secousse","autre"]),
      milieu_vie:        oneof(body.meta_milieu_vie,       ["terrestre","aerien","aquatique_mer","dulcaquicole","semi_aquatique","souterrain","inconnu"]),
      structure_sociale: oneof(body.meta_structure_sociale,["monogame","polygame","polyandrie","promiscuite","sans_lien","harem","coloniale","saisonniere","variable","inconnu"]),
    };
  } else if (category === "lieux") {
    const t = body.meta_type_lieu;
    specific = { type_lieu: ["prive","public","cache"].includes(t) ? t : "" };
  } else if (category === "objets") {
    const validSubs = OBJETS_SUBCATS.map((s) => s.key);
    const sub = body.meta_sous_cat;
    specific = { sous_cat: validSubs.includes(sub) ? sub : "" };
  }

  return { ...base, ...specific };
}

// Gestion unifiée des images : lit le champ images_meta (JSON) pour
// produire imagePaths, secondary_image_paths et positional_images.
// images_meta = { cover, secondary[], sections{}, remove[] }
// Les nouvelles images sont uploadées sous fieldname "images".
function parseImagesMeta(body, existingPaths, newFiles) {
  let meta = {};
  try { meta = JSON.parse(body.images_meta || "{}"); } catch { /* ignoré */ }

  const toRemove  = Array.isArray(meta.remove)   ? meta.remove   : [];
  const secondary = Array.isArray(meta.secondary) ? meta.secondary : [];
  const sections  = (meta.sections && typeof meta.sections === "object") ? meta.sections : {};
  const coverVal  = meta.cover || "";

  // Résolution chemin d'un token (path existant ou "__new__:N")
  function resolve(token) {
    if (!token) return null;
    if (token.startsWith("__new__:")) {
      const f = newFiles[Number(token.slice(8))];
      return f ? `/uploads/wiki/${f.filename}` : null;
    }
    return existingPaths.includes(token) && !toRemove.includes(token) ? token : null;
  }

  // imagePaths : existantes gardées + nouvelles (ordre stable)
  const kept  = existingPaths.filter((p) => !toRemove.includes(p));
  const added = newFiles.map((f) => `/uploads/wiki/${f.filename}`);
  let imagePaths = [...kept, ...added];

  // Couverture en tête
  const cover = resolve(coverVal);
  if (cover && imagePaths.includes(cover)) {
    imagePaths = [cover, ...imagePaths.filter((p) => p !== cover)];
  }

  // Images secondaires (max 16, hors couverture)
  const coverPath = imagePaths[0] || "";
  const secondary_image_paths = secondary
    .map(resolve)
    .filter((p) => p && imagePaths.includes(p) && p !== coverPath)
    .slice(0, 16);

  // Images positionnelles
  const positional_images = Object.entries(sections)
    .map(([token, section]) => {
      const p = resolve(token);
      return p && section ? { path: p, section } : null;
    })
    .filter(Boolean);

  return { imagePaths, secondary_image_paths, positional_images };
}

function injectVarianteImages(body, files) {
  if (!body.meta_variantes) return body;
  let variantes;
  try { variantes = JSON.parse(body.meta_variantes); } catch { return body; }
  if (!Array.isArray(variantes)) return body;

  // Index des fichiers par variante ID
  const byVar = {};
  const bySub = {};
  files.forEach((f) => {
    const mv = f.fieldname.match(/^variante_img_(.+)$/);
    if (mv) { (byVar[mv[1]] = byVar[mv[1]] || []).push(`/uploads/wiki/${f.filename}`); }
    const ms = f.fieldname.match(/^variante_sub_img_(.+)$/);
    if (ms) { (bySub[ms[1]] = bySub[ms[1]] || []).push(`/uploads/wiki/${f.filename}`); }
  });

  variantes = variantes.map((v) => {
    const existing = Array.isArray(v.images) ? v.images : [];
    const newImgs  = byVar[v.id] || [];
    const subs = Array.isArray(v.variantes) ? v.variantes.map((sv) => {
      const exSub  = Array.isArray(sv.images) ? sv.images : [];
      const newSub = bySub[sv.id] || [];
      return { ...sv, images: [...exSub, ...newSub] };
    }) : [];
    return { ...v, images: [...existing, ...newImgs], variantes: subs };
  });

  return { ...body, meta_variantes: JSON.stringify(variantes) };
}

const PRESET_TAGS = ["fantaisie", "irréaliste", "ultra"];
const SPECIAL_TAGS = new Set(["ultra", "irréaliste"]);

function getAllTags(pages) {
  const counts = new Map();
  pages.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  PRESET_TAGS.forEach((t) => { if (!counts.has(t)) counts.set(t, 0); });
  return Array.from(counts.keys()).sort((a, b) => {
    const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
    return diff !== 0 ? diff : a.localeCompare(b, "fr");
  });
}

function getTagCounts(pages) {
  const counts = {};
  pages.forEach(p => p.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  return counts;
}

// Liste plate de toutes les questions du quiz (construite une seule fois)
function buildQuestionIndex(config) {
  const list = [];
  (config.sections || []).forEach((s) => {
    const add = (id, text) => list.push({ section_key: s.key, section_title: s.title, question_id: id, question_text: text });
    if (s.groups) s.groups.forEach((g) => g.items.forEach((it) => add(it.id, it.text)));
    if (s.fields) s.fields.forEach((f) => add(f.id, f.label));
    if (s.spectrums) s.spectrums.forEach((f) => add("spectrum:" + f.id, f.label));
    if (s.rankings) s.rankings.forEach((f) => add("ranking:" + f.id, f.label));
    if (s.multiselects) s.multiselects.forEach((f) => add("multiselect:" + f.id, f.label));
  });
  return list;
}

function computeSuggestions(page, allPages) {
  const pageTagSet = new Set(page.tags.map((t) => t.toLowerCase()));
  const pageDerived = new Set((page.meta.termes_derives || []).map((t) => (typeof t === "string" ? t : t.term || "").toLowerCase()));
  const pageTitleWords = new Set(
    page.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  return allPages
    .filter((p) => p.id !== page.id)
    .map((p) => {
      let score = 0;
      // Tags communs
      p.tags.forEach((t) => { if (pageTagSet.has(t.toLowerCase())) score += 3; });
      // Même catégorie
      if (p.category === page.category) score += 2;
      // Termes dérivés communs
      (p.meta.termes_derives || []).forEach((t) => { if (pageDerived.has((typeof t === "string" ? t : t.term || "").toLowerCase())) score += 2; });
      // Mots du titre communs (> 3 lettres)
      p.title.toLowerCase().split(/\s+/).forEach((w) => { if (w.length > 3 && pageTitleWords.has(w)) score += 1; });
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ p }) => p);
}

function buildWikiRouter(config) {
  const router = express.Router();
  const ALL_QUESTIONS = buildQuestionIndex(config);

  const CTX = { categories: CATEGORIES, fantasmesSubs: FANTASMES_SUBCATS, objetsSubs: OBJETS_SUBCATS };

  function sortedPages() {
    return listWikiPages().sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
  }

  // Une page appartient a une categorie si c'est sa categorie principale
  // OU une de ses categories supplementaires : une carte "aussi dans..."
  // doit apparaitre dans chaque chapitre concerne, pas seulement le sien.
  function pagesForCategory(pages, key) {
    return pages.filter((p) => p.category === key || (p.extraCategories || []).includes(key));
  }

  // Une page "ULTRA" porte un simple tag libre "ultra" (insensible a la casse).
  function isUltra(page) {
    return (page.tags || []).some((t) => SPECIAL_TAGS.has(String(t).toLowerCase()));
  }

  // Valide qu'une URL de retour est interne (chemin relatif ou même origine).
  function safeReturnTo(url, fallback) {
    if (!url) return fallback;
    try {
      const parsed = new URL(url, "http://localhost");
      if (parsed.pathname.startsWith("/")) return parsed.pathname + parsed.search;
    } catch (_) {}
    return fallback;
  }

  // Le bouton "retour" d'une page doit ramener a l'endroit precis d'ou l'on
  // vient (sommaire, vue globale ou chapitre d'une categorie), pas toujours
  // au sommaire general.
  function wikiBackTarget(req) {
    const fallback = { href: "/wiki", label: "Sommaire" };
    const ref = req.get("referer");
    if (!ref) return fallback;
    try {
      const url = new URL(ref);
      if (url.pathname === "/wiki") return fallback;
      if (url.pathname === "/wiki/tous") return { href: "/wiki/tous" + url.search, label: "Toutes les pages" };
      const m = url.pathname.match(/^\/wiki\/categorie\/([^/]+)$/);
      if (m) {
        const cat = CATEGORIES.find((c) => c.key === m[1]);
        if (cat) return { href: url.pathname, label: cat.label };
      }
    } catch (_) {}
    return fallback;
  }

  // ── Sommaire : une "etagere" par categorie, comme les chapitres d'un livre ──
  // Vue d'accueil/decouverte : les pages ULTRA restent masquees ici par defaut
  // (elles restent consultables via /wiki/categorie/:key et /wiki/tous).
  router.get("/", (req, res) => {
    const userId = req.user ? req.user.id : null;
    const partnerId = req.user ? req.user.partnerId : null;
    const pages = mergePartnerReaction(filterOff(excludeHidden(mergeUserReactions(sortedPages(), userId, "wiki")), req.user), partnerId, "wiki");
    const visiblePages = pages.filter((p) => !isUltra(p));
    const chapters = CATEGORIES.map((cat) => {
      const allCatPages = pagesForCategory(visiblePages, cat.key);
      // count global (ultra + irréaliste inclus) pour la carte de catégorie
      const primaryCount = pages.filter((p) => p.category === cat.key).length;
      return { ...cat, pages: allCatPages, count: primaryCount, preview: allCatPages.slice(0, 6) };
    });
    const allPages = mergePartnerReaction(filterOff(excludeHidden(mergeUserReactions(listWikiPages(), userId, "wiki")), req.user), partnerId, "wiki");
    const recentAdded = [...allPages]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 30);
    const recentUpdated = [...allPages]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 30);
    const popular = allPages
      .filter((p) => p.rating > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 30);
    res.render("wiki-index", {
      config, chapters, pages,
      allTags: getAllTags(pages),
      tagCounts: getTagCounts(pages),
      totalCount: pages.length,
      recentAdded, recentUpdated, popular,
      hasOwnedItems: pages.some((p) => p.owned),
      ...CTX
    });
  });

  // ── Vue "tout" : toutes les pages, toutes categories melangees ──
  router.get("/tous", (req, res) => {
    const pages = mergePartnerReaction(filterOff(excludeHidden(mergeUserReactions(sortedPages(), req.user ? req.user.id : null, "wiki")), req.user), req.user ? req.user.partnerId : null, "wiki");
    res.render("wiki", { config, pages, allTags: getAllTags(pages), tagCounts: getTagCounts(pages), lockedCategory: null, ...CTX });
  });

  // ── Vue par categorie : un "chapitre" du livre ──
  router.get("/categorie/:key", (req, res) => {
    const cat = CATEGORIES.find((c) => c.key === req.params.key);
    if (!cat) return res.redirect("/wiki");
    const all = sortedPages();
    const pages = mergePartnerReaction(pagesForCategory(filterOff(excludeHidden(mergeUserReactions(all, req.user ? req.user.id : null, "wiki")), req.user), cat.key), req.user ? req.user.partnerId : null, "wiki");
    const allPagesMin = all.map((p) => ({ id: p.id, title: p.title }));
    res.render("wiki", { config, pages, allPagesMin, allTags: getAllTags(pages), tagCounts: getTagCounts(pages), lockedCategory: cat, ...CTX });
  });

  // ── Extraction "Mes goûts" : synthèse .txt des pages notées par le
  // visiteur, groupées par degré d'appréciation (J'adore d'abord, puis 5
  // étoiles, 4, 3, 2, 1, puis "Ça m'intéresse" si le seuil choisi va jusque
  // là). Chaque page n'apparaît que dans son degré le plus haut ; le seuil
  // "min" fixe jusqu'où descendre, Ultra/Irréaliste s'excluent au choix. ──
  const GOUTS_ORDER = ["adore", "5", "4", "3", "2", "1", "interesse"];
  const GOUTS_LABELS = {
    adore: "J'adore",
    "5": "Note 5/5",
    "4": "Note 4/5",
    "3": "Note 3/5",
    "2": "Note 2/5",
    "1": "Note 1/5",
    interesse: "Ça m'intéresse",
  };
  const GOUTS_MIN_INDEX = { flame: 0, "5": 1, "4": 2, "3": 3, "2": 4, "1": 5, all: 6 };

  router.get("/export-gouts", requireUser, (req, res) => {
    const includeUltra = req.query.ultra !== "0";
    const includeIrrealiste = req.query.irrealiste !== "0";
    const minKey = Object.prototype.hasOwnProperty.call(GOUTS_MIN_INDEX, req.query.min) ? req.query.min : "all";
    const maxIndex = GOUTS_MIN_INDEX[minKey];

    const pages = excludeHidden(mergeUserReactions(listWikiPages(), req.user.id, "wiki"));
    const buckets = {};
    GOUTS_ORDER.forEach((k) => { buckets[k] = []; });

    pages.forEach((p) => {
      const isUltraTag = p.tags.indexOf("ultra") !== -1;
      const isIrrealisteTag = p.tags.indexOf("irréaliste") !== -1 || p.tags.indexOf("fantaisie") !== -1;
      if (!includeUltra && isUltraTag) return;
      if (!includeIrrealiste && isIrrealisteTag) return;

      let bucket = null;
      if (p.flame) bucket = "adore";
      else if (p.rating >= 5) bucket = "5";
      else if (p.rating >= 4) bucket = "4";
      else if (p.rating >= 3) bucket = "3";
      else if (p.rating >= 2) bucket = "2";
      else if (p.rating >= 1) bucket = "1";
      else if (p.interested) bucket = "interesse";
      if (!bucket || GOUTS_ORDER.indexOf(bucket) > maxIndex) return;

      buckets[bucket].push(p);
    });

    const catLabelOf = (key) => {
      const c = CATEGORIES.find((cat) => cat.key === key);
      return c ? c.label : key;
    };

    let out = "Mes goûts — " + config.title + "\n";
    out += "Généré le " + new Date().toLocaleDateString("fr-FR") + "\n";
    out += "=".repeat(40) + "\n";

    let hasAny = false;
    GOUTS_ORDER.forEach((key) => {
      const items = buckets[key];
      if (!items.length) return;
      hasAny = true;
      const heading = GOUTS_LABELS[key].toUpperCase() + " (" + items.length + ")";
      out += "\n" + heading + "\n" + "-".repeat(heading.length) + "\n";
      items
        .sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" }))
        .forEach((p) => { out += "- " + p.title + " (" + catLabelOf(p.category) + ")\n"; });
    });
    if (!hasAny) out += "\nAucun contenu ne correspond à ces critères.\n";

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"mes-gouts.txt\"");
    res.send(out);
  });

  router.post("/", requireAdmin, upload.any(), (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.redirect("/wiki");

    const category        = normalizeCategory(req.body.category);
    const content         = String(req.body.content || "").trim();
    let tags              = parseTags(req.body.tags);
    const owned           = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";
    const extraCategories = arr(req.body.extra_categories).filter((k) => CATEGORY_KEYS.includes(k) && k !== category);

    const files = req.files || [];
    files.forEach((f) => generateThumb(`/uploads/wiki/${f.filename}`));
    const newImgFiles = files.filter((f) => f.fieldname === "images");
    const bodyWithVarianteImgs = injectVarianteImages(req.body, files);
    const meta = parseMeta(category, bodyWithVarianteImgs);
    const { imagePaths, secondary_image_paths, positional_images } = parseImagesMeta(req.body, [], newImgFiles);
    meta.secondary_image_paths = secondary_image_paths;
    meta.positional_images     = positional_images;
    meta.secondary_configured  = true;
    const scenImgFile = files.find((f) => f.fieldname === "scenario_image");
    if (scenImgFile) meta.scenario_image = `/uploads/wiki/${scenImgFile.filename}`;
    if (meta.orce_name) tags = [...new Set([...tags, meta.orce_name])];
    const enrichedTags = autoEnrichTags(tags, title, meta.termes_derives || []);

    const newId = insertWikiPage({ title, category, content, tags: enrichedTags, imagePaths, owned, meta, extraCategories });
    syncPageGalleryImages(newId, title, imagePaths, meta);
    res.redirect(`/wiki/${newId}`);
  });

  // ── Associations image ─────────────────────────────
  router.get("/image-links", requireUserJson, (req, res) => {
    const src = req.query.src;
    if (!src) return res.json([]);
    res.json(getImageLinks(src));
  });

  router.post("/image-links", requireUserJson, (req, res) => {
    const { src, page_id } = req.body;
    if (!src || !page_id) return res.status(400).json({ ok: false });
    addImageLink(src, Number(page_id));
    res.json({ ok: true });
  });

  router.delete("/image-links", requireUserJson, (req, res) => {
    const { src, page_id } = req.body;
    if (!src || !page_id) return res.status(400).json({ ok: false });
    removeImageLink(src, Number(page_id));
    res.json({ ok: true });
  });

  // ── Recherche de questions du quiz ─────────────────
  router.get("/question-search", (req, res) => {
    const q = String(req.query.q || "").toLowerCase().trim();
    const results = q
      ? ALL_QUESTIONS.filter((x) => x.question_text.toLowerCase().includes(q) || x.section_title.toLowerCase().includes(q)).slice(0, 15)
      : ALL_QUESTIONS.slice(0, 15);
    res.json(results);
  });

  // ── Compteurs X|Y par tag ───────────────────────────
  router.get("/tag-counts", (req, res) => {
    const pages = {};
    listWikiPages().forEach((p) => p.tags.forEach((t) => { pages[t] = (pages[t] || 0) + 1; }));
    const images = {};
    listGalleryImages().forEach((img) => img.tags.forEach((t) => { images[t] = (images[t] || 0) + 1; }));
    res.json({ pages, images });
  });

  // ── Recherche de pages (pour associer) ─────────────
  router.get("/search", (req, res) => {
    const q = String(req.query.q || "").toLowerCase().trim();
    const pages = listWikiPages();
    const results = q
      ? pages.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 12)
      : pages.slice(0, 12);
    res.json(results.map((p) => ({ id: p.id, title: p.title, category: p.category })));
  });

  // ── "Explorer l'inconnu" : pioche une page jamais notée ni en favori ────
  // (voir wiki-index.ejs/wiki.ejs, le bouton, et wiki-detail.ejs, le bandeau
  // Précédent/Suivant). L'historique de navigation entre pioches successives
  // vit côté client (sessionStorage) : ici on ne fait que piocher, en
  // excluant les ids déjà vus (exclude) pour ne pas repasser deux fois par
  // la même page dans une session d'exploration.
  router.get("/explorer/aleatoire", requireUser, (req, res) => {
    const excludeIds = new Set(
      String(req.query.exclude || "").split(",").map(Number).filter(Number.isInteger)
    );
    const hideUltra = req.query.hideUltra === "1";
    const hideIrrealiste = req.query.hideIrrealiste === "1";
    const blacklist = new Set(listBlacklistedTags(req.user.id).map((r) => r.tag));
    const candidates = listUnexploredWikiPages(req.user.id).filter((p) => {
      if (excludeIds.has(p.id)) return false;
      if (isOffForUser(p.tags, req.user)) return false; // exclusion "off" : plus forte que la simple bascule, jamais proposée
      if (p.tags.some((t) => blacklist.has(String(t).toLowerCase()))) return false;
      const special = specialTagOf(p.tags);
      if (special === "ultra" && hideUltra) return false;
      if (special === "irrealiste" && hideIrrealiste) return false;
      return true;
    });
    if (!candidates.length) return res.json({ id: null });
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    res.json({ id: pick.id });
  });

  router.get("/ajouter", requireUser, (req, res) => {
    const preCategory = String(req.query.category || "");
    const preTitle    = String(req.query.title    || "");
    const pages = sortedPages();
    const blankPage = {
      id: null, title: preTitle, category: preCategory || (CATEGORIES[0] && CATEGORIES[0].key) || "",
      content: "", tags: [], imagePaths: [], owned: false, meta: {},
      extraCategories: [], rating: 0, flame: false, interested: false,
      updatedAt: new Date().toISOString()
    };
    const returnTo = safeReturnTo(req.get("referer"), "/wiki");
    res.render("wiki-form", { config, page: blankPage, pages, allTags: getAllTags(pages), returnTo, ...CTX });
  });

  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    if (isOffForUser(page.tags, req.user)) return res.redirect("/wiki");
    incrementWikiViews(id, req.user ? req.user.id : null);
    const userId = req.user ? req.user.id : null;
    Object.assign(page, getUserReaction(userId, "wiki", id));
    mergePartnerReaction([page], req.user ? req.user.partnerId : null, "wiki");
    const allPages = filterOff(mergeUserReactions(
      listWikiPages().sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" })),
      userId, "wiki"
    ), req.user);
    const idx = allPages.findIndex((p) => p.id === id);
    const prevPage = idx > 0 ? { id: allPages[idx - 1].id, title: allPages[idx - 1].title } : null;
    const nextPage = idx < allPages.length - 1 ? { id: allPages[idx + 1].id, title: allPages[idx + 1].title } : null;
    const suggestions = computeSuggestions(page, allPages);
    const back = wikiBackTarget(req);
    const pageIsFavorite = req.user ? isFavorite(req.user.id, "wiki", id) : false;
    let userNote = "";
    try { userNote = req.user ? getUserNote(id, req.user.id) : ""; } catch (_) {}
    // Compteurs X|Y par tag (pages wiki | images galerie)
    const tagPageCounts = {};
    allPages.forEach((p) => p.tags.forEach((t) => { tagPageCounts[t] = (tagPageCounts[t] || 0) + 1; }));
    const tagImageCounts = {};
    listGalleryImages().forEach((img) => img.tags.forEach((t) => { tagImageCounts[t] = (tagImageCounts[t] || 0) + 1; }));
    // Precharge l'image principale (meme condition que le hero cote vue) :
    // demarre son telechargement des le <head>, avant meme que le CSS/JS
    // n'aient fini de charger, au lieu d'attendre que le navigateur
    // decouvre le <img> en parsant le corps de la page.
    const heroImg = (page.imagePaths && page.imagePaths.length && req.user)
      ? res.locals.thumbUrl(page.imagePaths[0]) : null;
    const exploreMode = req.query.explore === "1";
    res.render("wiki-detail", { config, page, pages: allPages, suggestions, prevPage, nextPage, backHref: back.href, backLabel: back.label, isFavorite: pageIsFavorite, userNote, tagPageCounts, tagImageCounts, preloadImage: heroImg, exploreMode, ...CTX });
  });

  router.get("/:id/edit", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    const pages = sortedPages();
    const allTags = getAllTags(pages);
    const returnTo = safeReturnTo(req.get("referer"), `/wiki/${id}`);
    res.render("wiki-form", { config, page, pages, allTags, returnTo, ...CTX });
  });

  router.post("/:id", requireAdmin, upload.any(), (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!existing) return res.redirect("/wiki");

    const title    = String(req.body.title || "").trim() || existing.title;
    const category = normalizeCategory(req.body.category);
    const content  = String(req.body.content || "").trim();
    let tags       = parseTags(req.body.tags);
    const owned    = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";

    const files = req.files || [];
    files.forEach((f) => generateThumb(`/uploads/wiki/${f.filename}`));
    const newImgFiles = files.filter((f) => f.fieldname === "images");
    const bodyWithVarianteImgs = injectVarianteImages(req.body, files);
    const meta = parseMeta(category, bodyWithVarianteImgs);
    const { imagePaths, secondary_image_paths, positional_images } =
      parseImagesMeta(req.body, existing.imagePaths, newImgFiles);
    meta.secondary_image_paths = secondary_image_paths;
    meta.positional_images     = positional_images;
    meta.secondary_configured  = true;
    const scenImgFile = files.find((f) => f.fieldname === "scenario_image");
    if (scenImgFile) meta.scenario_image = `/uploads/wiki/${scenImgFile.filename}`;
    if (meta.orce_name) tags = [...new Set([...tags, meta.orce_name])];
    const extraCategories = arr(req.body.extra_categories).filter((k) => CATEGORY_KEYS.includes(k) && k !== category);
    const enrichedTags = autoEnrichTags(tags, title, meta.termes_derives || []);
    updateWikiPage(id, { title, category, content, tags: enrichedTags, imagePaths, owned, meta, extraCategories });
    syncPageGalleryImages(id, title, imagePaths, meta, existing.title.trim().toLowerCase());
    res.redirect(safeReturnTo(req.body._returnTo, `/wiki/${id}`));
  });

  // ── Liens entre pages wiki ─────────────────────────
  router.get("/:id/page-links", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json({ links: [], backlinks: [] });
    res.json({ links: getWikiPageLinks(id), backlinks: getWikiBacklinks(id) });
  });

  router.post("/:id/page-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    const linked = Number(req.body.linked_page_id);
    if (!Number.isInteger(id) || !Number.isInteger(linked)) return res.status(400).json({ ok: false });
    addWikiPageLink(id, linked);
    res.json({ ok: true });
  });

  router.delete("/:id/page-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    const linked = Number(req.body.linked_page_id);
    if (!Number.isInteger(id) || !Number.isInteger(linked)) return res.status(400).json({ ok: false });
    removeWikiPageLink(id, linked);
    res.json({ ok: true });
  });

  // ── Associations questions ──────────────────────────
  // Sens inverse : depuis une question du quizz, quelles pages wiki y sont
  // déjà liées (utilisé par le bouton "?" sur les questions).
  router.get("/question-links/lookup", requireUserJson, (req, res) => {
    const sectionKey = String(req.query.section_key || "");
    const questionId = String(req.query.question_id || "");
    if (!sectionKey || !questionId) return res.json([]);
    const pages = getPagesForQuestion(sectionKey, questionId);
    res.json(pages.map((p) => ({ id: p.id, title: p.title, category: p.category })));
  });

  router.get("/:id/question-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json([]);
    const links = getWikiQuestionLinks(id);
    const enriched = links.map((l) => {
      const found = ALL_QUESTIONS.find((x) => x.section_key === l.section_key && x.question_id === l.question_id);
      return {
        section_key:    l.section_key,
        section_index:  config.sections.findIndex((s) => s.key === l.section_key),
        section_title:  found ? found.section_title  : l.section_key,
        question_id:    l.question_id,
        question_text:  found ? found.question_text  : l.question_id,
      };
    });
    res.json(enriched);
  });

  router.post("/:id/question-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { section_key, question_id } = req.body;
    if (!section_key || !question_id) return res.status(400).json({ ok: false });
    addWikiQuestionLink(id, section_key, question_id);
    res.json({ ok: true });
  });

  router.delete("/:id/question-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { section_key, question_id } = req.body;
    if (!section_key || !question_id) return res.status(400).json({ ok: false });
    removeWikiQuestionLink(id, section_key, question_id);
    res.json({ ok: true });
  });

  router.post("/:id/react", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { rating, flame, interested, readLater, hidden, practiced } = req.body;
    reactWikiPage(id, req.user.id, { rating, flame, interested, readLater, hidden, practiced });
    // J'adore = favori : synchro avec la table favorites
    if (flame) addFavorite(req.user.id, "wiki", id);
    else removeFavorite(req.user.id, "wiki", id);
    res.json({ ok: true });
  });

  router.post("/:id/maturity", requireAdmin, express.json(), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const level = Math.max(0, Math.min(5, Math.round(Number(req.body.level))));
    setWikiPageMaturity(id, level);
    res.json({ ok: true, maturity: level });
  });

  router.post("/:id/note", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    setUserNote(id, req.user.id, req.body.content || "");
    res.json({ ok: true });
  });

  router.post("/:id/delete", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    let cat = "";
    if (Number.isInteger(id)) {
      const page = getWikiPage(id);
      cat = page ? page.category : "";
      deleteWikiPage(id);
    }
    res.redirect(cat ? `/wiki/categorie/${cat}` : "/wiki");
  });

  router.use((err, req, res, next) => {
    if (!err) return next();
    console.error("[wiki] erreur route", req.method, req.originalUrl, err.message || err);
    res.redirect("/wiki");
  });

  return router;
}

buildWikiRouter.CATEGORIES = CATEGORIES;
module.exports = buildWikiRouter;
