const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

// Vignettes generees a cote de chaque original (jamais a la place) : gain de
// poids reseau considerable pour les grilles/cartes, sans jamais degrader la
// vue "zoom"/detail/lecture, qui continue de pointer vers l'original (voir
// data-src dans les vues, lu par public/wiki.js pour la lightbox).
const THUMB_WIDTH = 720;
const THUMB_SUFFIX = "-thumb.webp";
const DATA_DIR = path.join(__dirname, "..", "data");

function diskPathFor(urlPath) {
  return path.join(DATA_DIR, String(urlPath || "").replace(/^\/+/, ""));
}

function thumbUrlPath(urlPath) {
  return String(urlPath || "").replace(/\.[a-zA-Z0-9]+$/, THUMB_SUFFIX);
}

// Genere la vignette d'un fichier deja uploade. Best-effort : une erreur ici
// (format exotique, fichier corrompu...) ne doit jamais faire echouer
// l'upload lui-meme, l'original reste servi tel quel dans ce cas (voir
// thumbUrl ci-dessous, qui retombe sur l'original si la vignette n'existe
// pas).
async function generateThumb(urlPath) {
  if (!urlPath || urlPath.endsWith(THUMB_SUFFIX)) return;
  const src = diskPathFor(urlPath);
  const dest = diskPathFor(thumbUrlPath(urlPath));
  try {
    await sharp(src)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(dest);
  } catch (err) {
    console.warn(`[thumbs] echec generation vignette pour ${urlPath} :`, err.message || err);
  }
}

// URL a utiliser dans une carte/grille : la vignette si elle a deja ete
// generee, sinon l'original (generation pas encore terminee, ou echouee).
function thumbUrl(urlPath) {
  if (!urlPath) return urlPath;
  const thumb = thumbUrlPath(urlPath);
  try {
    if (fs.existsSync(diskPathFor(thumb))) return thumb;
  } catch (_) {}
  return urlPath;
}

// Rattrapage au demarrage : genere les vignettes manquantes pour les images
// deja uploadees avant l'ajout de cette fonctionnalite. Asynchrone, jamais
// attendu par le demarrage du serveur — tourne en tache de fond ; en
// attendant, thumbUrl() sert simplement l'original (aucune image cassee).
async function backfillThumbs(subdir) {
  const dir = path.join(DATA_DIR, "uploads", subdir);
  let files;
  try { files = fs.readdirSync(dir); } catch (_) { return; }
  for (const f of files) {
    if (f.endsWith(THUMB_SUFFIX) || !/\.(jpe?g|png|gif|webp)$/i.test(f)) continue;
    const urlPath = `/uploads/${subdir}/${f}`;
    if (fs.existsSync(diskPathFor(thumbUrlPath(urlPath)))) continue;
    await generateThumb(urlPath);
  }
}

// A appeler partout ou l'original est supprime du disque, pour ne pas
// laisser une vignette orpheline derriere.
function deleteThumb(urlPath) {
  try { fs.unlinkSync(diskPathFor(thumbUrlPath(urlPath))); } catch (_) {}
}

module.exports = { generateThumb, thumbUrl, backfillThumbs, deleteThumb };
