# Pistes de performance non faites

Suite a une session d'optimisation (images en vignettes, compression gzip,
cache HTTP, `loading="lazy"`, CSS admin separe — voir les commits
correspondants). Deux pistes identifiees mais **pas implementees**, a
reprendre plus tard.

## 1. Scinder `public/wiki.js` (lecture vs edition admin)

**Pourquoi** : `public/wiki.js` fait 4528 lignes et est charge en entier sur
`wiki-index.ejs`, `wiki.ejs`, `wiki-detail.ejs` *et* `wiki-form.ejs`. Un
simple visiteur qui lit une page wiki (pas admin, ou admin qui ne fait que
consulter) telecharge et parse tout le code d'edition (upload d'images,
reordonnancement drag-and-drop, gestion des variantes, associations de
tags/questions...) qui ne lui sert jamais.

**Pourquoi ce n'est pas fait** : le fichier entier est un seul IIFE
(`(function () { ... })()`, ligne 1 a 4528) — tout partage la meme portee.
Avant de couper, il faut tracer precisement quelles fonctions sont
partagees entre la partie "lecture" et la partie "edition", par exemple :

- La **lightbox** (ouverture/zoom d'image, navigation clavier/swipe,
  associations image ↔ page) est utilisee a la fois par `wiki-detail.ejs`
  (lecture) et par `wiki-form.ejs` (previsualisation pendant l'edition) —
  candidate a rester dans un bundle "commun", ou a etre dupliquee/partagee
  proprement.
- Le filtrage/tri (`applyFilters`, recherche, tags) n'est utile que sur les
  vues de liste (`wiki-index`, `wiki`), pas sur `wiki-detail` ni
  `wiki-form`.
- L'upload/reordonnancement/variantes n'est utile que sur `wiki-form.ejs`.

**Piste d'implementation suggeree** :
1. Repartir le fichier en 2-3 bundles (`wiki-view.js` commun aux pages de
   lecture, `wiki-form.js` charge uniquement par `wiki-form.ejs`, et
   eventuellement un petit `wiki-shared.js` pour la lightbox si elle est
   vraiment utilisee des deux cotes).
2. Chaque fonction interne du fichier actuel doit etre classee avant de
   bouger quoi que ce soit (lecture seule / edition seule / partagee).
3. Tester manuellement **chaque** action apres la coupe, dans un
   navigateur reel (upload d'image, reordonnancement, ajout/suppression de
   variante, lightbox depuis le wiki *et* depuis le formulaire, recherche,
   filtres par tag/note, reactions/favoris) — un decoupage rate peut casser
   l'edition des pages sans erreur visible immediatement.

**Non fait parce que** : aucun navigateur/environnement de test disponible
pendant la session ou ça a ete identifie — risque de casser l'edition wiki
(fonctionnalite reellement utilisee, pas juste cosmetique) sans moyen de le
detecter avant un vrai test manuel post-deploiement.

## 2. Pagination des grandes listes (wiki "toutes les pages", galerie)

**Etat au moment de l'audit** : < 200 pages wiki, > 200 images galerie —
pas encore un vrai probleme de performance (quelques centaines de cartes
DOM, avec images maintenant en vignettes + lazy-loading, reste geerable).
A revisiter si la bibliotheque continue de grossir nettement (disons
> 500-1000 elements sur une meme vue).

**Pourquoi ce n'est pas trivial** : le filtrage/tri de ces listes est
aujourd'hui 100% cote client — `public/wiki.js` (`applyFilters`) et
`public/gallery.js` operent directement sur les cartes deja presentes dans
le DOM (`wikiList.querySelectorAll(".wiki-card")`, etc.), pas sur une
recherche serveur. Paginer naivement cote serveur casserait le filtre
(il ne pourrait plus chercher que dans la page actuellement chargee, pas
dans toute la bibliotheque).

**Pistes possibles le jour ou c'est necessaire** :
- Passer le filtrage cote serveur (requete a chaque changement de filtre,
  comme une recherche) — plus gros changement mais le plus propre a grande
  echelle.
- Ou : charger toutes les *donnees* des cartes (JSON leger : titre, tags,
  note, image) des le depart pour permettre le filtre instantane, mais ne
  **rendre** dans le DOM que les cartes visibles/proches du scroll
  (pagination progressive cote client, sans aller-retour serveur a chaque
  filtre).
