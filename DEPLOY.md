# Deployer lequizz sur quizz.dhuis.com

Contexte confirme avant d'ecrire ce guide :
- Ton VPS : `51.91.158.21`, utilisateur `debian` (sudo vers root), deja
  utilise pour d'autres sites (bergfrid, intranet, portfolio) donc nginx
  y est deja installe.
- Le DNS (`quizz.dhuis.com` -> ton VPS) est deja fait chez IONOS, donc pas
  besoin d'y revenir dans ce guide.
- Le depot Git existe deja : `git@github.com:RemigeApre/lequizz.git`.

**Point de securite important, a traiter en premier :** ce depot GitHub est
actuellement **public** (verifie via l'API GitHub, sans authentification —
ca repond). Il ne contient encore que le README, mais des que tu pousses le
code, le contenu du quiz (liste detaillee de pratiques sexuelles) sera
visible publiquement, indexable, et lie a ton compte. **Passe le depot en
prive avant de pousser quoi que ce soit d'autre.**

---

## Etape 0 — Rendre le depot GitHub prive

1. Va sur `https://github.com/RemigeApre/lequizz`.
2. Onglet **Settings** (en haut du repo, pas les settings de ton compte).
3. Descends jusqu'a la section **Danger Zone** tout en bas.
4. Clique **Change visibility** -> **Change to private** -> confirme en
   tapant le nom du depot demande.

Une fois fait, dis-le-moi et on continue. Sans ca, je ne pousserai rien.

---

## Etape 1 — Comprendre le principe general

Le flux qu'on va mettre en place :

```
Fedora (ton PC)  --push-->  GitHub (prive)  --clone/pull-->  VPS  --docker-->  quizz.dhuis.com
```

- Ton PC pousse le code sur GitHub, comme d'habitude.
- Le VPS ne recoit jamais le code par copie manuelle : il va chercher
  lui-meme le code sur GitHub (`git clone` puis `git pull` pour les mises
  a jour). Pour ca, le VPS a besoin de sa **propre cle SSH**, differente de
  celle de ton PC, autorisee uniquement en lecture sur ce depot precis
  (une "deploy key"). C'est la methode propre : si cette cle fuite un jour,
  elle ne donne acces qu'a ce seul depot, en lecture seule.
- Une fois le code sur le VPS, Docker construit et lance l'application.
- Nginx, deja installe sur le VPS, sert de "reception" publique : il ecoute
  sur le port 80/443 (ceux qu'internet utilise) et redirige en interne vers
  l'application Docker qui, elle, n'ecoute que sur `127.0.0.1:3000` (pas
  accessible depuis l'exterieur directement — plus sur).

Il y a donc deux connexions SSH distinctes a mettre en place :
1. **Toi -> VPS** (pour administrer le serveur).
2. **VPS -> GitHub** (pour que le serveur recupere le code).

---

## Etape 2 — Se connecter au VPS depuis Fedora

### 2.1 Generer une cle SSH dediee a ce VPS

Une cle SSH va par paire : une partie **privee** (jamais partagee, reste
sur ton PC) et une partie **publique** (que tu donnes au serveur, qui
l'autorise). On en cree une nouvelle, dediee a ce VPS (ne reutilise pas la
cle qui te sert deja pour GitHub — une cle par usage, c'est la bonne
pratique) :

```bash
ssh-keygen -t ed25519 -C "fedora-vers-vps" -f ~/.ssh/id_ed25519_vps
```

Ca cree deux fichiers : `~/.ssh/id_ed25519_vps` (privee) et
`~/.ssh/id_ed25519_vps.pub` (publique). Appuie sur Entree a la question de
passphrase si tu ne veux pas en taper une a chaque connexion.

### 2.2 Autoriser cette cle sur le VPS

Il faut maintenant dire au VPS "cette cle publique a le droit d'entrer".
Comment tu fais ca depend de comment tu te connectais avant depuis Windows :

- **Si le mot de passe SSH fonctionne encore** (le plus simple) :
  ```bash
  ssh-copy-id -i ~/.ssh/id_ed25519_vps.pub debian@51.91.158.21
  ```
  Ca te demande le mot de passe une fois, et ajoute automatiquement la cle
  au bon endroit sur le serveur (`~/.ssh/authorized_keys`).

- **Si seule l'authentification par cle est acceptee** (pas de mot de
  passe) : il faut passer par ta session Windows qui, elle, a deja acces.
  Affiche la cle publique sur Fedora :
  ```bash
  cat ~/.ssh/id_ed25519_vps.pub
  ```
  Copie la ligne affichee (elle commence par `ssh-ed25519`), connecte-toi
  au VPS depuis Windows comme d'habitude, puis colle-la a la fin de son
  fichier d'autorisations :
  ```bash
  echo "colle_la_cle_ici" >> ~/.ssh/authorized_keys
  ```

Dis-moi laquelle des deux situations tu as si tu bloques ici.

### 2.3 Simplifier la connexion avec un alias

Plutot que de retaper l'adresse IP et le nom d'utilisateur a chaque fois,
on cree un raccourci dans `~/.ssh/config` :

```bash
cat >> ~/.ssh/config << 'EOF'

Host vps
    HostName 51.91.158.21
    User debian
    IdentityFile ~/.ssh/id_ed25519_vps
EOF
```

Maintenant, se connecter au VPS se fait juste avec :

```bash
ssh vps
```

Et pour repasser root (comme le faisait ton ancien `connexion.ps1`) :

```bash
ssh -t vps "sudo -H bash -l"
```

---

## Etape 3 — Donner au VPS l'acces au depot GitHub prive

Maintenant qu'on est root sur le VPS (`ssh -t vps "sudo -H bash -l"`), on
genere une cle SSH **sur le VPS lui-meme**, dediee a GitHub :

```bash
ssh-keygen -t ed25519 -C "vps-lequizz-deploy" -f ~/.ssh/id_ed25519_github -N ""
cat ~/.ssh/id_ed25519_github.pub
```

Copie la ligne affichee (commence par `ssh-ed25519`). Puis, sur GitHub :

1. Va sur `https://github.com/RemigeApre/lequizz/settings/keys`.
2. Clique **Add deploy key**.
3. Titre : `vps-quizz`. Colle la cle publique. **Ne coche pas** "Allow
   write access" (le VPS n'a besoin que de lire le code, jamais d'y
   ecrire).
4. Valide.

Toujours sur le VPS, dis a SSH d'utiliser cette cle specifiquement pour
GitHub (sinon il utiliserait la cle par defaut, qui n'existe pas ici) :

```bash
cat >> ~/.ssh/config << 'EOF'

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
EOF
```

Teste la connexion :

```bash
ssh -T git@github.com
```

Tu dois voir `Hi RemigeApre/lequizz! You've successfully authenticated...`

---

## Etape 4 — Verifier les prerequis sur le VPS

Toujours sur le VPS :

```bash
docker --version
docker compose version
nginx -v
certbot --version
git --version
```

Si un de ces outils manque (peu probable vu que d'autres sites tournent
deja dessus, mais on ne sait jamais) :

```bash
sudo apt update
# si docker manque :
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
# si certbot manque :
sudo apt install -y certbot python3-certbot-nginx
```

---

## Etape 5 — Cloner le code sur le VPS

```bash
sudo git clone git@github.com:RemigeApre/lequizz.git /home/quizz
```

(`/home/quizz` pour rester coherent avec `/home/portfolio` deja utilise
sur ce serveur pour un site du meme genre.)

---

## Etape 6 — Pousser le code depuis Fedora (une fois le depot passe en prive)

Retour sur ta machine Fedora, a la racine du projet :

```bash
git add -A
git commit -m "Ajout du quiz complet, du moteur multi-etapes et du deploiement"
git push origin main
```

Puis, sur le VPS, on recupere ce qui vient d'etre pousse :

```bash
cd /home/quizz && sudo git pull
```

---

## Etape 7 — Configurer les secrets (`.env`)

Le `.env` contient des mots de passe : il n'est **jamais** dans Git (il est
dans `.gitignore`), donc il faut le creer a la main, une seule fois, sur le
VPS :

```bash
cd /home/quizz
sudo cp .env.example .env
```

Genere une clef de session aleatoire :

```bash
openssl rand -hex 32
```

Edite le fichier :

```bash
sudo nano .env
```

Et remplis :

```
PORT=3000
NODE_ENV=production
SESSION_SECRET=<la sortie de openssl rand -hex 32>
ADMIN_USERNAME=admin
ADMIN_DISPLAY_NAME=Admin
ADMIN_PASSWORD=<le mot de passe du profil admin, choisi par toi>
MANON_USERNAME=manon
MANON_DISPLAY_NAME=Manon
MANON_PASSWORD=<le mot de passe du profil de Manon, choisi par toi>
```

Il n'y a plus de mot de passe unique pour tout le site : le wiki (texte)
est desormais public, et chaque profil (Admin, Manon, puis d'autres
crees depuis "Gerer les profils" dans le panneau admin) a son propre
identifiant + mot de passe, entres via l'icone cle en haut du site. Ces
deux mots de passe initiaux ne sont crees qu'au premier demarrage ou
`MANON_PASSWORD`/`ADMIN_PASSWORD` sont renseignes — choisis-les differents
l'un de l'autre et que tu n'as tapes nulle part d'autre (ex. jamais dans
une conversation en clair). D'autres profils peuvent ensuite etre crees
directement depuis l'interface (pas besoin de repasser par `.env`).

---

## Etape 8 — Construire et lancer l'application

```bash
cd /home/quizz
sudo docker compose up -d --build
```

`-d` = en arriere-plan, `--build` = reconstruit l'image a partir du
`Dockerfile`. Verifie que ca tourne :

```bash
sudo docker compose ps
sudo docker compose logs -f
```

(`Ctrl+C` pour sortir des logs sans arreter le conteneur.) L'app n'ecoute
que sur `127.0.0.1:3000`, donc pas accessible depuis l'exterieur pour
l'instant — normal, c'est nginx qui va faire le pont :

```bash
curl -I http://127.0.0.1:3000
```

Tu dois voir une reponse HTTP (redirection vers `/section/0`).

---

## Etape 9 — Brancher Nginx

On copie la config prete a l'emploi du repo (elle a deja
`server_name quizz.dhuis.com;`) :

```bash
sudo cp /home/quizz/nginx.example.conf /etc/nginx/sites-available/quizz.dhuis.com
sudo ln -s /etc/nginx/sites-available/quizz.dhuis.com /etc/nginx/sites-enabled/
sudo nginx -t
```

`nginx -t` verifie que la config est valide sans rien casser. Si "syntax is
ok" et "test is successful" s'affichent, recharge nginx :

```bash
sudo systemctl reload nginx
```

Teste (le DNS IONOS etant deja en place) :

```bash
curl -I http://quizz.dhuis.com
```

---

## Etape 10 — Activer le HTTPS

```bash
sudo certbot --nginx -d quizz.dhuis.com
```

Certbot verifie que le DNS pointe bien vers ce serveur, obtient un
certificat gratuit (Let's Encrypt), modifie automatiquement la config
nginx pour ajouter le HTTPS et rediriger le HTTP dessus, et programme le
renouvellement automatique tous les ~90 jours.

Teste :

```bash
curl -I https://quizz.dhuis.com
```

### Verifier que HTTP/2 est actif

HTTP/2 permet au navigateur de charger plusieurs images en parallele sur
une seule connexion — utile surtout sur les pages avec beaucoup d'images
(galerie). Certbot l'active generalement tout seul sur les nginx recents,
mais ça vaut le coup de verifier :

```bash
curl -I --http2 https://quizz.dhuis.com 2>&1 | head -1
# doit afficher "HTTP/2 200" (pas "HTTP/1.1 200")
```

Si ce n'est pas le cas, edite le bloc HTTPS que certbot a ajoute dans
`/etc/nginx/sites-available/quizz.dhuis.com` :

```bash
sudo nginx -v   # verifie la version
```

- nginx **≥ 1.25.1** : ajoute `http2 on;` dans le bloc `server { listen 443 ssl; ... }`.
- nginx plus ancien : remplace `listen 443 ssl;` par `listen 443 ssl http2;`.

Puis `sudo nginx -t && sudo systemctl reload nginx`.

---

## Etape 11 — Verification finale

- [ ] `https://quizz.dhuis.com` affiche la premiere section du quiz.
- [ ] `https://quizz.dhuis.com/admin/login` fonctionne avec le mot de passe
      choisi a l'etape 7.
- [ ] Remplir une section, fermer l'onglet, revenir : la progression est
      conservee.
- [ ] Terminer le quiz : le resultat s'affiche et la reponse apparait dans
      `/admin`.

---

## Etape 12 — Mettre a jour le site plus tard

A chaque fois que tu modifies le code en local :

```bash
# sur Fedora
git add -A
git commit -m "..."
git push origin main

# sur le VPS
ssh vps
sudo bash -c "cd /home/quizz && git pull && docker compose up -d --build"
```

`.env` et `data/quizz.db` restent intacts : ils ne sont pas dans Git, donc
`git pull` ne les touche jamais.

---

## Acces, continuite entre appareils et sauvegarde en temps reel

Cette version serveur (pas la version GitHub Pages statique) gere ca :

- **Profils personnels** (icone cle en haut du site, `/admin/login`) : le
  wiki (texte) est public, sans connexion. Tout le reste (galerie, BD,
  quizz, images, favoris) demande d'etre connecte a un profil (identifiant
  + mot de passe, voir Etape 7). Chaque profil a sa propre progression de
  quizz (table `attempts`, cle `"user:<id>"`) — contrairement a l'ancienne
  version a mot de passe unique, deux profils ne partagent plus les memes
  reponses. Une fois connecte, l'acces est memorise ~90 jours via un
  cookie de session.
- **Continuite entre appareils** : la progression est stockee cote serveur
  (pas dans le navigateur) et rattachee au profil, pas a l'appareil : se
  connecter avec le meme profil depuis n'importe quel appareil (PC,
  telephone) donne acces exactement aux memes reponses.
- **CSV en temps reel** : en plus de la base SQLite (`data/quizz.db`), chaque
  section validee est immediatement ajoutee a `data/log.csv` (colonnes :
  `timestamp,event,code,section_key,section_index,payload_json` — `code`
  vaut `user:<id>`, un profil par ligne). C'est un filet de securite en
  texte brut, lisible avec n'importe quel tableur, independant de la base.
- Terminer le quiz jusqu'au bout n'efface plus rien : un instantane du
  score est range dans `submissions` (consultable via `/admin`, avec le
  profil concerne), mais la progression reste modifiable a volonte ensuite
  (page d'accueil -> n'importe quelle section).
- `data/log.csv` n'est jamais commite dans Git (`.gitignore`), comme
  `data/quizz.db` — pense a inclure `data/` dans tes propres sauvegardes
  manuelles du VPS si tu en fais.
- Les images (wiki, galerie, BD) sont stockees dans `data/uploads/`
  (servies sous `/uploads/...`, jamais accessibles sans etre connecte a un
  profil, meme si le texte du wiki est public) — meme regle que le reste
  de `data/` : jamais commitees dans Git, a inclure dans tes sauvegardes
  manuelles si tu en fais.

---

## HTTPS sur IP directe (sans nom de domaine), certificat auto-signe

Le deploiement reel utilise l'IP directe (`http://51.91.158.21:8082`), pas
`quizz.dhuis.com` + nginx (etapes 9-10 ci-dessus). Sans nom de domaine,
Let's Encrypt ne peut pas emettre de certificat — la seule option est un
certificat **auto-signe** : ca chiffre bien la connexion, mais le
navigateur affiche un avertissement "connexion non securisee" a accepter
une fois (normal, il ne peut pas verifier ton identite sans autorite de
certification). Le HTTPS est gere directement par l'appli Node, pas par
nginx.

### 1. Generer le certificat sur le VPS

```bash
cd /home/quizz
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=51.91.158.21" \
  -addext "subjectAltName=IP:51.91.158.21"
```

### 2. Activer dans `.env`

```bash
sudo nano .env
```

Ajoute/modifie :
```
TLS_CERT_PATH=/app/certs/cert.pem
TLS_KEY_PATH=/app/certs/key.pem
```

(Rien d'autre a regler : des que ces deux fichiers existent, l'app bascule
seule en HTTPS et le cookie de session passe "secure" avec, au meme
endroit du code — plus jamais de desynchronisation possible entre "le
site sert du HTTPS" et "le cookie l'exige".)

### 3. Relancer

```bash
sudo docker compose up -d --build
```

Ouvre **https://51.91.158.21:8082** (bien `https`, pas `http`). Le
navigateur affiche un avertissement la premiere fois ("Avance" /
"Continuer vers le site") — normal pour un certificat auto-signe, a
accepter une fois par navigateur/appareil.

---

## Depannage : boucle de connexion sur `/admin/login`

Symptome : le mot de passe correct ne debloque jamais l'acces, retour
permanent sur la page de connexion.

Depuis la correction de `src/server.js`, `usingHttps` est calcule **une
seule fois** au demarrage (presence reelle des fichiers de certificat) et
sert a la fois a choisir HTTP/HTTPS **et** a regler `cookie.secure` — les
deux ne peuvent donc plus se desynchroniser au niveau du code. Le serveur
affiche aussi desormais un avertissement au demarrage
(`sudo docker compose logs lequizz`) si `ADMIN_PASSWORD`/`MANON_PASSWORD`
manquent (le profil correspondant n'est alors pas cree) ou si des chemins
de certificat sont configures sans fichiers presents. Si ca bloque quand
meme, verifie dans cet ordre (sur le VPS, dans `/home/quizz`) :

```bash
# 1. Le serveur tourne dans quel mode ?
sudo docker compose logs --tail=30 lequizz | grep -iE "listening|attention"

# 2. .env a-t-il bien les mots de passe des profils ? (doivent repondre 1, pas 0)
grep -c ADMIN_PASSWORD .env
grep -c MANON_PASSWORD .env

# 3. certs/ contient-il vraiment les fichiers attendus par .env ?
ls -la certs/
grep -c TLS_CERT_PATH .env
```

- Log `(HTTP)` -> utilise `http://51.91.158.21:8082` dans le navigateur
  (pas `https`). Log `(HTTPS)` -> l'inverse. Se tromper de prefixe est la
  cause la plus frequente de blocage.
- `.env` contient `TLS_CERT_PATH`/`TLS_KEY_PATH` mais `certs/` est vide :
  normal juste apres un clone frais, `certs/` n'est jamais commite dans
  Git. Regenere le certificat (memes commandes qu'a l'etape 1 ci-dessus)
  puis `sudo docker compose up -d --build`.
- `grep -c ADMIN_PASSWORD .env` (ou `MANON_PASSWORD`) repond `0` : aucun mot de passe ne sera
  jamais accepte tant que la ligne n'existe pas dans `.env`.

Test direct sans navigateur, pour isoler si le probleme vient du serveur
ou du navigateur (cookies bloques/perimes) — remplace `REMPLACE_PAR_LE_VRAI`
par le vrai mot de passe du profil admin juste avant de lancer :

```bash
cd /tmp && rm -f cookies.txt
curl -s -o /dev/null -w "GET /admin/login -> %{http_code}\n" -c cookies.txt http://localhost:3000/admin/login
curl -s -o /dev/null -w "POST mauvais mdp -> %{http_code}\n" -b cookies.txt -c cookies.txt --data-urlencode "username=admin" --data-urlencode "password=test-faux" http://localhost:3000/admin/login
curl -s -o /dev/null -w "POST bon mdp -> %{http_code}\n" -b cookies.txt -c cookies.txt --data-urlencode "username=admin" --data-urlencode "password=REMPLACE_PAR_LE_VRAI" http://localhost:3000/admin/login
curl -s -o /dev/null -w "GET /admin apres connexion -> %{http_code}\n" -b cookies.txt http://localhost:3000/admin
```

Attendu : `200`, `200`, `302`, `200` (dans cet ordre). Si le `302`
apparait mais que le dernier `GET /admin` renvoie quand meme vers
`/admin/login`, le souci est cote navigateur (vide les cookies du site et
reessaie) — pas cote serveur.

### Si une commande SSH "fige" le terminal, ou si le site se bloque en reseau mobile

Cause reelle identifiee : partage de connexion / tethering mobile. Ce mode
de connexion ajoute une couche d'encapsulation supplementaire qui reduit
le MTU reellement utilisable sur le chemin, sans que personne ne le
signale proprement (le "trou noir PMTU" : les paquets trop gros sont
silencieusement jetes au lieu de declencher une reponse ICMP "fragmentation
needed"). Resultat cote client : SSH qui se fige d'un coup (Ctrl+C ne
repond plus), ou une page HTTPS qui ne charge jamais — ce n'est ni le VPS,
ni l'app, ni le cookie de session qui sont en cause. Ca ne se produit que
sur reseau mobile ; en Wi-Fi, aucun probleme.

**Fix cote client** (sur l'appareil qui partage sa connexion) : abaisser
la taille de paquet/MTU utilisee, par exemple a 1400 (au lieu de 1500 par
defaut) pour laisser de la marge a l'encapsulation ajoutee par le
tethering. Une fois applique, SSH et le site fonctionnent normalement,
meme en deplacement.

Si malgre tout une commande SSH se fige un jour sans lien avec ca : ferme
completement l'onglet/fenetre du terminal et reconnecte-toi (`ssh vps`)
plutot que d'essayer de forcer la commande — ca repart instantanement,
sans rien casser cote serveur.

---

## Modifier les questions sans perdre les reponses deja enregistrees

Chaque item (pratique), chaque groupe, et chaque classement/echelle/choix
multiple a un `"id"` stable dans `docs/questions.json`, distinct du texte
affiche. Les reponses sont enregistrees en base sous cet `id`, jamais sous
le texte ni sous la position dans le fichier. Consequence concrete :

- **Reformuler le texte d'un item ou d'un groupe ne perd aucune donnee** —
  change uniquement `"text"` (ou `"title"` pour un groupe), laisse `"id"`
  intact.
- **Reordonner les items, les groupes, ou les sections ne perd aucune
  donnee non plus** — l'ordre dans le fichier n'a plus d'impact sur le
  stockage.
- **Ne jamais changer un `"id"` deja existant** : c'est la seule action qui
  ferait perdre la reponse associee (le serveur ne saurait plus la
  retrouver). Si un item change vraiment de sens (pas juste de formulation),
  mieux vaut lui laisser son ancien `id` que d'en inventer un nouveau, sauf
  si l'ancienne reponse n'a plus de sens et que perdre cette reponse precise
  est voulu.
- **Ajouter un nouvel item** : donne-lui un `"id"` unique dans la section
  (kebab-case, ex. `"nouvelle-pratique"`) — aucune reponse existante n'est
  affectee.
- **Supprimer un item** : sa reponse reste orpheline en base (invisible,
  inoffensive) mais n'est plus jamais lue.

Portee actuelle de cette protection : items de type matrice (pratiques
notees) et groupes. Les listes d'options internes aux classements
(`rankings.items`), echelles (`spectrums.scaleLabels`) et choix multiples
(`multiselects.options`) restent, elles, reperees par leur position dans
leur propre petite liste — evite de reordonner ou modifier ces options-la
une fois des reponses enregistrees (le classement/l'echelle/le choix
multiple dans son ensemble a bien un `id` stable, ce sont uniquement ses
options internes qui restent positionnelles).
