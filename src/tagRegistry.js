// Classification partagee de chaque tag (couleur/comportement du badge de
// tag, voir public/nav.js openTagPopup) : type ultra/irrealiste/normal,
// page wiki associee (titre exact ou terme derive), frequence. Calculee une
// fois par requete cote serveur (voir middleware dans src/server.js) et
// exposee telle quelle au client via window.TAG_REGISTRY (partials/head.ejs)
// pour que gallery.js/bd.js puissent colorer un badge sans requete reseau.
const AUTO_TYPES = { ultra: "ultra", "irréaliste": "irrealiste", fantaisie: "irrealiste" };

function resolveTagType(tagName, metaMap) {
  if (metaMap && metaMap[tagName]) return metaMap[tagName];
  return AUTO_TYPES[tagName] || "normal";
}

function buildTagRegistry({ wikiPages, galleryImages, bdBooks, tagMeta }) {
  const metaMap = tagMeta || {};
  const counts = {};
  function countTags(items) {
    (items || []).forEach((item) => (item.tags || []).forEach((t) => {
      const k = String(t).toLowerCase().trim();
      if (k) counts[k] = (counts[k] || 0) + 1;
    }));
  }
  countTags(wikiPages);
  countTags(galleryImages);
  countTags(bdBooks);

  // Pages associees par tag : titre exact (page principale) ou terme derive
  // (ex. tag "chevaux" derive de la page "Cheval"). La page prend priorite
  // sur un terme derive en cas de collision improbable.
  const pageByTag = {};
  (wikiPages || []).forEach((p) => {
    const titleKey = String(p.title || "").toLowerCase().trim();
    if (titleKey) pageByTag[titleKey] = { wikiPageId: p.id, derived: false };
  });
  (wikiPages || []).forEach((p) => {
    const derived = (p.meta && p.meta.termes_derives) || [];
    derived.forEach((d) => {
      const term = String(typeof d === "string" ? d : d.term || "").toLowerCase().trim();
      if (term && !pageByTag[term]) pageByTag[term] = { wikiPageId: p.id, derived: true };
    });
  });

  // Plage de frequence pour le degrade des tags "normaux" (ni special, ni
  // associes a une page) : sinon leur couleur est deja fixee par une autre regle.
  let maxNormalCount = 0;
  Object.keys(counts).forEach((tag) => {
    if (resolveTagType(tag, metaMap) === "normal" && !pageByTag[tag] && counts[tag] > maxNormalCount) {
      maxNormalCount = counts[tag];
    }
  });

  function classify(tag) {
    const type = resolveTagType(tag, metaMap);
    const page = pageByTag[tag] || null;
    let tier;
    if (type === "ultra") tier = "ultra";
    else if (type === "irrealiste") tier = "irrealiste";
    else if (page && !page.derived) tier = "page";
    else if (page && page.derived) tier = "derived";
    else tier = "normal";
    const count = counts[tag] || 0;
    const pct = tier === "normal" && maxNormalCount > 0 ? Math.min(1, count / maxNormalCount) : 0;
    return { tier, wikiPageId: page ? page.wikiPageId : null, count, pct: Math.round(pct * 100) / 100 };
  }

  const registry = {};
  Object.keys(counts).forEach((tag) => { registry[tag] = classify(tag); });
  // Tags "standalone" (dans tag_meta mais sans contenu associe pour l'instant).
  Object.keys(metaMap).forEach((tag) => { if (!registry[tag]) registry[tag] = classify(tag); });

  return registry;
}

module.exports = { buildTagRegistry, resolveTagType };
