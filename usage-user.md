# Guide utilisateur — Confidences

Tout ce qu'un profil (non-admin) peut faire sur le site, espace par espace. Les fonctionnalités réservées à l'admin sont regroupées à part, en fin de document.

---

## Connexion

- Identifiant + mot de passe (icône clé du header, en haut à droite, quand non connecté).
- Le Codex (texte) reste consultable sans être connecté ; Galerie, BD, Liens, Quizz et Profil nécessitent une connexion.

---

## En-tête (présent sur presque toutes les pages)

- **Recherche globale** (loupe) : cherche dans le Codex (titre, contenu, tags), et si connecté, aussi dans Galerie, BD, Liens et Quizz. Résultats en direct, cliquables.
- **Rappel consentement** (bouton "?") : rappelle que le consentement se donne librement et reste révocable à tout moment, avec un avertissement sur les pratiques illégales.
- **Mode discret** (icône œil) : remplace toutes les images du site (grilles, fiches, lightbox) par un pictogramme neutre, pour naviguer sans rien afficher de visible à l'écran. Se désactive de la même façon.
- **Menu Codex / Galerie / Quizz** : accès direct aux catégories de chaque section, plus un lien **Labels** en bas de Codex et Galerie vers la liste de tous les tags.
- **Menu profil** (icône clé, colorée selon le rôle) : accès à Profil, et bouton de déconnexion.

---

## Accueil (`/`)

- Slogan et mise en avant de quelques catégories du Codex.
- Trois raccourcis : **Codex**, **Quizz**, **Galerie**.

---

## Codex (Wiki)

### Accueil Codex (`/wiki`)

- Grille des catégories, avec pages récentes, récemment modifiées et les mieux notées.
- Volet de filtres à gauche (voir ci-dessous).

### Catégories (`/wiki/categorie/:clé`) et vue "Tous" (`/wiki/tous`)

- Liste complète des pages de la catégorie (ou de tout le Codex pour "Tous").

### Filtres (volet gauche, Codex)

- **Recherche** par titre/contenu, avec tolérance aux fautes de frappe.
- **Tags** : clic pour inclure (vert), reclic pour exclure (rouge), un 3ᵉ clic remet à neutre. Les tags choisis remontent toujours en premier dans la liste (inclus, puis exclus, puis neutres).
- **Catégories** et **catégories liées** : même logique à 3 états.
- **Tri** : alphabétique, note, popularité, date...
- **Filtres avancés** : note minimale, propriétés (favoris, j'adore, intéressé...).
- **Ultra** / **Irréaliste** : bouton pour afficher ou masquer ces contenus dans la session en cours (le réglage par défaut se choisit dans Profil > Paramètres).
- **Nos objets** : filtre sur les pages marquées comme possédées (si applicable).
- **Réinitialiser les filtres**.
- **Explorer l'inconnu** (voir plus bas).

### Une page Codex

- Lecture du contenu, images associées.
- **Note** (étoiles, 1 à 5), **J'adore** (flamme), **Intéressé(e)**, **À lire plus tard** : personnels à chaque profil, indépendants de ceux du partenaire.
- **Possédé** : badge informatif (posé par l'admin à la création de la page), pas une action du profil.
- **Note personnelle** : un champ de texte libre, visible seulement par vous.
- **Tags cliquables** : ouvrent une popup avec les autres pages/images portant ce tag, avec un bouton **Masquer le tag** (voir "Tags", plus bas). Le comportement du clic (popup ou accès direct) se règle dans Profil > Paramètres.
- **Pages liées** et **suggestions** de pages proches.
- **Questions du quizz liées** : les questions associées à cette page (voir "Quizz" plus bas).
- **Précédent / Suivant** : navigation alphabétique dans la liste de pages courante.

### Explorer l'inconnu

- Bouton dans le volet de filtres Codex : ouvre une page **jamais notée ni mise en favori**, piochée au hasard dans tout le Codex (indépendamment des filtres en cours).
- Une fois sur la page, un bandeau **Mode exploration** permet d'aller à la page suivante (nouvelle pioche aléatoire) ou de revenir à la précédente de cette session de découverte.
- Respecte vos réglages Ultra/Irréaliste et vos tags masqués : jamais de contenu que vous avez choisi d'exclure.

### Labels (`/tags`)

- Liste de tous les tags du site, avec leur fréquence d'usage et leur répartition (Codex/Galerie/BD).
- Recherche et filtre par type (Normal / Ultra / Irréaliste).
- Clic sur un tag : même popup que partout ailleurs.

### Tags masqués (`/tags/masques`)

- Liste des tags que vous avez choisi de masquer (voir "Tags" plus bas). Une croix permet de les retirer un par un.

### Mode hors-ligne

- Les pages Codex déjà visitées restent lisibles même sans connexion ou avec un réseau faible : elles s'affichent depuis une version enregistrée sur votre appareil, avec un petit bandeau discret si le contenu n'a pas pu être vérifié à jour. Ne concerne que le Codex (jamais Galerie, Quizz, Liens ou BD).

---

## Galerie (images)

### Grille et filtres

- Recherche, tags (même logique à 3 états que le Codex), catégorie, note minimale, tri.
- Ultra / Irréaliste : bascule identique au Codex.
- **Explorer l'inconnu** : mêmes principes que sur le Codex.

### Visionneuse (clic sur une image)

- Zoom sur l'image, navigation entre les images du même item (si plusieurs) via des points, et entre les images de la grille via les flèches.
- Auteur / parodie affichés si renseignés.
- **Note**, **Favori**.
- Si l'image appartient à une **série**, navigation dédiée dans la série.
- Lien direct vers la page Codex associée, si elle existe.
- En mode exploration : bandeau dédié avec Précédent/Suivant dans la session de découverte, et une croix pour quitter ce mode.

---

## BD

### Grille et aperçu

- Recherche, tags, langue, "en couleur uniquement", Ultra/Irréaliste.
- Clic sur une couverture : aperçu rapide (titre, description, tags, réactions) avec un bouton pour commencer la lecture.

### Page de lecture

- Défilement des planches.
- **Favori** : personnel à chaque profil, comme partout ailleurs.
- **Note**, **J'adore**, **Intéressé(e)** : ⚠️ à la différence du Codex et de la Galerie, ces trois-là sont **partagés entre tous les profils** sur une BD (pas personnels) — historique du site, pas un oubli.

---

## Profil (`/favoris`)

Volet de navigation à gauche, teinté selon le rôle du compte.

### Accueil profil

- Vos pages Codex favorites, vos fantasmes, vos images et BD favorites, regroupés.

### Notes (Codex / Images / BD)

- Tout ce que vous avez noté ou mis en favori dans chaque section, avec les mêmes filtres (recherche, tags, catégorie) que la section d'origine.
- Un compteur par section est visible directement dans le volet de gauche.
- Sur Images et BD, un filtre **Note minimale** (étoiles) s'ajoute aux autres, et le tri met d'abord vos favoris, puis le reste par note décroissante.

### Historique

- Les dernières pages Codex, images et BD que vous avez consultées, toutes confondues, groupées par période (Aujourd'hui, Hier, la semaine dernière, le mois dernier, plus ancien) sous forme de cartes de taille identique mais à la mise en page différente selon le type (Codex en bandeau icône, Images en photo pleine carte, BD en couverture).
- Lien direct vers chacune (sauf les images, sans page dédiée : le lien ramène à la Galerie).
- Durée conservée réglable dans Paramètres (3 jours, 1 semaine, 1 mois ou 3 mois) — ne masque que l'affichage de cette page, ne supprime rien.

### À lire plus tard

- Toutes les pages Codex marquées avec le bouton **À lire plus tard** (voir la section Codex ci-dessus), sous forme des mêmes cartes que partout ailleurs sur le Codex.
- Une croix sur chaque carte retire la page de la liste.
- ⚠️ Strictement personnel : ni les autres profils ni personne d'autre que vous et l'admin ne peut voir cette liste (l'admin la retrouve, en lecture seule, depuis la fiche de votre profil).

### Bouton ULTRA (bas du volet)

- Masque ou affiche les contenus Ultra sur toutes les pages du profil, indépendamment du réglage par défaut.

### Paramètres

- **Ultra** / **Irréaliste** : visible, masqué par défaut (bascule disponible), ou totalement désactivé ("off" — jamais montré, même via la bascule).
- **Filtrage des tags** : ET (toutes les tags sélectionnés) ou OU (au moins un).
- **Clic sur un tag** : aperçu en popup, ou accès direct à la page/galerie du tag.
- **Historique** : durée de conservation de la page Profil > Historique (3 jours, 1 semaine, 1 mois, 3 mois).
- **Partage avec l'admin** : une case à cocher indiquant que vous acceptez que l'admin consulte vos notes et favoris (affiche un badge visible par l'admin — n'affecte pas l'accès réel).

### Identité

- Pseudo, orientation, adresse mail, sexe, année de naissance.

### Mot de passe

- Changement de mot de passe (ancien mot de passe requis).

---

## Quizz

- Sections thématiques avec questions à choix ou grilles.
- Progression sauvegardée automatiquement, modifiable à tout moment.
- Résultats consultables, y compris avant d'avoir terminé.
- **Lier une question à des pages Codex** : chaque question a un bouton "?" permettant de rechercher et d'associer (ou retirer) une ou plusieurs pages Codex en rapport. ⚠️ Ce lien n'est pas personnel : une fois posé, il est visible par tous les profils du site, comme les tags.
- ⚠️ Le Quizz est la partie la plus ancienne du site : moins retravaillée que Codex et Galerie.

---

## Liens

- Page dédiée à une liste de liens utiles, avec tags.
- Existe et fonctionne (`/liens`), mais n'est pas encore mise en avant dans le menu ("Bientôt disponible").

---

## Tags (comportement transversal)

- Cliquer sur n'importe quel badge de tag, où que ce soit sur le site, ouvre la même popup : pages Codex associées, accès à la Galerie/BD filtrée, et un bouton **Masquer le tag**.
- **Masquer le tag** : ajoute le tag à votre liste personnelle de tags masqués. Tout contenu portant ce tag disparaît alors partout sur le site (Codex, Galerie, BD, vos notes), y compris le tag lui-même dans les filtres. Vous pouvez changer d'avis tant que la popup reste ouverte (reclic) ; une fois fermée, le retrait se fait depuis **Tags masqués**.

---

## Espace Admin (aperçu rapide)

Réservé aux comptes administrateur — géré séparément, en dehors de la navigation normale :

- Tableau de bord des profils, création/modification/suppression de comptes.
- Fiche détaillée par profil : quizz, notes et favoris (Codex/Images/BD), liste "à lire plus tard" (lecture seule), avec vue "par nombre de vues", activité récente, connexions et durée de présence sur le site.
- Gestion des tags (création, renommage, changement de type).
- Création et modification de contenu (pages Codex, images, BD, liens).
