// Détection "visiteur français ?" pour la restriction géographique du
// contenu NSFW (France : compte obligatoire ; hors France : accès direct,
// pendant que l'admin est en discussion avec l'organisme français sur les
// règles d'accès au contenu adulte).
//
// Important : ceci est une porte géographique de bonne foi, pas une
// vérification d'âge/localisation robuste — un VPN la contourne trivialement.
// Ne jamais s'appuyer dessus comme argument de conformité en soi.
//
// Choix produit (validés avec l'utilisateur) :
//   - IP non résolue (VPN inconnu, IP absente de la base, etc.) → traité
//     comme NON français (accès ouvert), pas l'inverse.
//   - DROM-COM (Guadeloupe, Martinique, Guyane, Réunion, Mayotte,
//     Saint-Pierre-et-Miquelon, Saint-Barthélemy, Saint-Martin,
//     Wallis-et-Futuna, Polynésie française, Nouvelle-Calédonie, TAAF) →
//     traités comme la France : territoires de la République française,
//     la loi française s'y applique.
const geoip = require("geoip-lite");

const FRENCH_CODES = new Set([
  "FR", // France métropolitaine
  "GP", "MQ", "GF", "RE", "YT", // Guadeloupe, Martinique, Guyane, Réunion, Mayotte (DROM)
  "PM", "BL", "MF", "WF", // Saint-Pierre-et-Miquelon, Saint-Barthélemy, Saint-Martin, Wallis-et-Futuna
  "PF", "NC", "TF", // Polynésie française, Nouvelle-Calédonie, TAAF
]);

function isFrenchIp(ip) {
  if (!ip) return false;
  const clean = String(ip).replace(/^::ffff:/, "");
  const geo = geoip.lookup(clean);
  if (!geo || !geo.country) return false; // non résolu -> non français (choix produit)
  return FRENCH_CODES.has(geo.country);
}

module.exports = { isFrenchIp, FRENCH_CODES };
