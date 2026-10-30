// Detection du "tag special" (ultra / irrealiste) d'un contenu (page wiki,
// image galerie, livre BD) et filtrage "desactive" (ultra_mode/irrealiste_mode
// = "off" sur le profil) : partage entre wiki/galerie/BD pour que "off"
// veuille dire la meme chose partout. Les etats "hidden"/"visible" restent
// geres cote client (boutons bascule deja existants) : seul "off" doit etre
// une exclusion reelle, cote serveur.
const IRREALISTE_TAGS = ["irréaliste", "fantaisie"];

function specialTagOf(tags) {
  const lower = (tags || []).map((t) => String(t).toLowerCase());
  if (lower.includes("ultra")) return "ultra";
  if (lower.some((t) => IRREALISTE_TAGS.includes(t))) return "irrealiste";
  return null;
}

// user peut etre null (invite) : dans ce cas rien n'est jamais "off", ce
// reglage n'existe que pour un profil connecte.
function isOffForUser(tags, user) {
  if (!user) return false;
  const special = specialTagOf(tags);
  if (!special) return false;
  const mode = special === "ultra" ? user.ultraMode : user.irrealisteMode;
  return mode === "off";
}

function filterOff(items, user) {
  if (!user) return items;
  return items.filter((item) => !isOffForUser(item.tags, user));
}

// Un invité (pas de compte) n'a pas de profil pour porter ultra_mode/irrealiste_mode,
// mais peut avoir répondu à la feuille d'accueil (voir /set-special-modes) : ce
// choix est alors porté par la session. Retourne un objet {ultraMode, irrealisteMode}
// compatible avec isOffForUser/filterOff, ou null si rien n'a jamais été choisi.
function effectiveSpecialUser(req) {
  if (req.user) return req.user;
  const s = req.session;
  if (!s || (!s.ultraMode && !s.irrealisteMode)) return null;
  return { ultraMode: s.ultraMode || "hidden", irrealisteMode: s.irrealisteMode || "visible" };
}

module.exports = { specialTagOf, isOffForUser, filterOff, effectiveSpecialUser };
