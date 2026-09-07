# Secret BAFA

Un jeu de devinettes à jouer entre stagiaires pendant une formation BAFA.

Chacun dépose **un secret anonyme**. Chaque jour, chaque stagiaire a **un seul
vote** : il choisit un secret et désigne la personne qui l'a écrit selon lui. Le
soir, l'animateur clôture la journée : tous les votes sont révélés d'un coup,
les points tombent, et une nouvelle journée s'ouvre.

## Règles

| Situation | Points |
|---|---|
| Tu devines le bon auteur d'un secret | **+3** pour toi |
| Quelqu'un se trompe en essayant de deviner ton secret | **+1** pour toi, par personne trompée |

Le barème est modifiable dans l'espace animateur.

- Un secret **démasqué sort du jeu** : son auteur est affiché pour tout le monde,
  et cette personne n'apparaît plus dans la liste des suspects (chacun n'écrit
  qu'un seul secret).
- Un vote raté **ne révèle jamais** l'auteur du secret visé : il reste en jeu.
  Seul l'animateur voit les auteurs, pour pouvoir animer le reveal à voix haute.
- On ne peut pas voter sur son propre secret, ni s'accuser soi-même.
- Un seul vote par jour et par personne, définitif une fois validé.

## Deux façons de faire tourner le jeu

Le dépôt contient **deux applications complètes**, qui jouent exactement les
mêmes règles.

| | `web/` — en ligne | `server/` + `public/` — hors ligne |
|---|---|---|
| Hébergement | Firebase, gratuit | ton ordinateur, dans la salle |
| Internet | nécessaire | **pas nécessaire** |
| Mise en place | quelques réglages, une fois | `npm start` |
| À utiliser quand | les stagiaires jouent depuis chez eux, sur plusieurs jours | tout le monde est dans la même salle |

La version en ligne est celle décrite ci-dessous. La version hors ligne est
documentée plus bas.

---

## Mettre le jeu en ligne (Firebase)

Rien à installer sur ton ordinateur : tout se fait depuis deux sites web.

### 1. Créer le projet Firebase

1. Va sur [console.firebase.google.com](https://console.firebase.google.com),
   **Créer un projet**. Tu peux refuser Google Analytics.
2. **Authentication** → *Get started* → active **Adresse e-mail/Mot de passe**.
   (Les stagiaires ne saisiront qu'un prénom : l'application fabrique une
   adresse technique à partir de celui-ci.)
3. **Firestore Database** → *Créer une base de données* → choisis un
   emplacement en Europe, et démarre en **mode production**.
4. **Firestore Database → Règles** : remplace tout par le contenu du fichier
   [`firestore.rules`](firestore.rules) de ce dépôt, puis **Publier**.
   ⚠️ Cette étape n'est pas optionnelle : sans ces règles, n'importe quel
   stagiaire pourrait lire tous les secrets.
5. **⚙ Paramètres du projet → Vos applications → Web (`</>`)** : enregistre une
   application, et copie les six valeurs de configuration.

### 2. Renseigner la configuration

Dans ce dépôt, ouvre `web/js/config.js` (le crayon ✏️ sur GitHub suffit) et
remplace les `À_REMPLIR` par les valeurs copiées à l'étape précédente. Ces
valeurs ne sont pas des secrets : elles identifient le projet, ce sont les
règles qui protègent les données.

### 3. Publier la page

Le plus simple, sans rien installer : **GitHub Pages**.

1. Dans le dépôt : *Settings → Pages → Source : **GitHub Actions***.
2. C'est tout. Le fichier `.github/workflows/pages.yml` publie le dossier `web/`
   à chaque modification, et t'affiche l'adresse obtenue.
3. Retourne dans Firebase : **Authentication → Settings → Domaines autorisés** →
   ajoute le domaine de ta page (`ton-nom.github.io`), sinon la connexion sera
   refusée.

Si tu préfères l'hébergement de Firebase et que le terminal ne te fait pas peur :
`npm install -g firebase-tools`, `firebase login`, `firebase use --add`, puis
`firebase deploy`.

### 4. Prendre le rôle d'animateur — avant les autres

Ouvre l'application, crée ton compte, puis onglet **Animateur → Devenir
animateur**.

**Fais-le avant de donner le lien aux stagiaires.** Le rôle se prend une seule
fois : le premier qui le réclame le garde, et le verrou se referme
définitivement. C'est ce rôle qui donne le droit de voir les auteurs, de
clôturer les journées et d'attribuer les points.

### 5. Jouer

1. Les stagiaires ouvrent le lien, créent leur compte et déposent leur secret.
2. Quand tout le monde a déposé : **Lancer la partie**. Les secrets sont
   verrouillés, la journée 1 s'ouvre.
3. Le soir : **Clôturer & révéler**. Les votes deviennent publics, les points
   tombent. Ton navigateur doit être ouvert : c'est lui qui calcule et publie.
4. Le lendemain : **Ouvrir la journée suivante**.
5. À la fin : **Terminer la partie** révèle tous les secrets restants.

---

## Faire tourner le jeu sans internet

Le dossier `server/` contient la même application, en version serveur. Pratique
si la salle n'a pas de connexion, ou si tu préfères que rien ne sorte de ton
ordinateur.

```bash
npm install
npm start
```

Le serveur affiche au démarrage les adresses à donner, du genre
`http://192.168.1.42:3000` — c'est celle-là que les stagiaires tapent, pas
`localhost`. Il faut que leurs téléphones soient sur le même réseau Wi-Fi et que
ton ordinateur reste allumé. Les polices sont dans le dépôt : aucune connexion
n'est nécessaire.

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `DATABASE_URL` | `file:./data/secret-bafa.db` | Base libSQL, ou fichier local |
| `DATABASE_AUTH_TOKEN` | — | Jeton, pour une base hébergée |
| `ADMIN_PASSWORD` | `bafa2026` | Mot de passe animateur, **au premier démarrage seulement** |
| `GAME_NAME` | `Secret BAFA` | Nom affiché, idem premier démarrage |
| `SECURE_COOKIES` | — | Mettre à `1` dès que le site est en HTTPS |

Cette version se déploie aussi en ligne (`render.yaml`, `Dockerfile`), mais la
version Firebase est plus simple et ne s'endort jamais.

---

## Tests

```bash
npm run test:rules   # les règles de sécurité Firestore, contre l'émulateur
npm run test:web     # une partie entière jouée dans un navigateur
npm run test:api     # l'API du serveur hors ligne, de bout en bout
```

`test:rules` est le plus important de la version en ligne : il vérifie qu'un
stagiaire ne peut ni lire les liens auteur↔secret, ni les votes, ni voter deux
fois, ni se déclarer animateur quand le rôle est pris. `test:web` va plus loin
et tente réellement ces lectures interdites depuis le navigateur d'un joueur.

Les tests ont besoin des émulateurs Firebase (téléchargés automatiquement au
premier lancement) et de Java.

---

## Structure

```
web/                 l'application en ligne (Firebase)
  index.html
  js/app.js          le jeu : affichage, règles, calcul des points au reveal
  js/config.js       à remplir avec les identifiants du projet Firebase
  js/firebase.js     le SDK Firebase, embarqué (aucun appel à un CDN)
  css/, fonts/       la charte : dégradé, Poppins hébergée en local
firestore.rules      qui a le droit de lire et d'écrire quoi — le cœur du jeu
firebase.json        hébergement et émulateurs

server/              l'application hors ligne (Node + libSQL)
public/              son interface
test/                règles, partie en navigateur, API du serveur
artifact/            la même chose en une page publiée sur claude.ai
legacy/              le tout premier prototype (localStorage), pour mémoire
```

## Vie privée et modération

Les secrets sont stockés en clair : c'est nécessaire au jeu. **L'animateur peut
tout lire** — c'est justement ce qui lui permet de modérer et d'animer le
reveal. Personne d'autre ne le peut : les règles de sécurité l'interdisent, et
les tests le vérifient.

Rappelle la règle au lancement : on écrit des choses qu'on accepte de voir
révélées devant le groupe, et ce qui se dit en formation reste en formation.

Un dernier point d'honnêteté : les mots de passe des stagiaires servent à
empêcher un camarade de voter à leur place, pas à protéger un compte sensible.
L'application le dit à l'inscription — il ne faut pas réutiliser un mot de passe
personnel.
