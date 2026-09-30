# Secret BAFA

Un jeu de devinettes à jouer entre stagiaires pendant une formation BAFA.

Chacun dépose **un secret anonyme**. Chaque jour, chaque stagiaire a **un seul
vote** : il choisit un secret et désigne la personne qui l'a écrit selon lui. Le
soir, l'animateur clôture la journée : tous les votes sont révélés d'un coup,
les points tombent, et une nouvelle journée s'ouvre.

C'est une application web, sans serveur à maintenir : une page statique et une
base Firebase. Gratuite, instantanée, et les stagiaires n'ont qu'un lien à
ouvrir sur leur téléphone.

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
- On ne peut pas voter sur son propre secret, ni s'accuser soi-même, ni accuser
  quelqu'un dont le secret est déjà tombé.
- Un seul vote par jour et par personne, définitif une fois validé.

Ces interdits ne sont pas seulement empêchés par les boutons de la page : ils
sont refusés par la base elle-même. Quelqu'un qui bricolerait la page depuis
son téléphone se ferait refouler pareil.

## Installation

Rien à installer sur ton ordinateur : tout se fait depuis deux sites web. Si tu
ouvres la page avant d'avoir fait ces étapes, elle te les rappelle d'elle-même.

### 1. Créer le projet Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) →
   **Créer un projet**. Tu peux refuser Google Analytics.
2. **Authentication** → *Get started* → active **Adresse e-mail/Mot de passe**.
   Les stagiaires ne saisiront qu'un prénom : l'application fabrique une adresse
   technique à partir de celui-ci.
3. **Firestore Database** → *Créer une base de données* → un emplacement en
   Europe, en **mode production**.
4. **Firestore Database → Règles** : remplace tout par le contenu de
   [`firestore.rules`](firestore.rules), puis **Publier**.
   ⚠️ Cette étape n'est pas optionnelle. Sans ces règles, n'importe quel
   stagiaire pourrait lire tous les secrets et tous les votes.
5. **⚙ Paramètres du projet → Vos applications → Web (`</>`)** : enregistre une
   application et copie le bloc `const firebaseConfig = { … }`.

### 2. Renseigner la configuration

Ouvre `web/js/config.js` (le crayon ✏️ sur GitHub suffit) et remplace le bloc
`const firebaseConfig = { … }` par celui que Firebase vient de te donner. C'est
la seule ligne du dépôt à modifier.

Ces valeurs ne sont pas des secrets : elles désignent le projet, elles n'ouvrent
aucun droit. Ce sont les règles de sécurité qui protègent les données.

### 3. Publier la page

*Settings → Pages → Source : **GitHub Actions***. C'est tout : le workflow
[`pages.yml`](.github/workflows/pages.yml) publie le dossier `web/` à chaque
modification de la branche `main`, et affiche l'adresse obtenue.

À chaque publication, il accroche l'empreinte du commit à l'adresse de la
feuille de style et du script (`app.js?v=af8201f2`). Sans ça, GitHub Pages
demande aux navigateurs de garder ces fichiers dix minutes : quelqu'un qui a
la page ouverte continuerait de faire tourner l'ancien code après une mise à
jour, et croirait que rien n'a changé.

Retourne ensuite dans Firebase : **Authentication → Settings → Domaines
autorisés** → ajoute le domaine de ta page (`ton-nom.github.io`), sinon la
connexion sera refusée.

### 4. Créer le compte de pilotage, et le nommer

Le jeu a deux sortes d'entrées, côte à côte sur l'écran d'accueil :

- **Inscription / Connexion** — les stagiaires, avec pour identifiant leur
  prénom et l'initiale de leur nom (`Adrien.M`), ce qui les distingue des
  autres Adrien du groupe, plus un mot de passe simple.
- **Admin** — un compte unique, d'identifiant `Admin`, réservé : personne ne
  peut s'inscrire sous ce nom. Il ne joue pas — pas de secret à déposer, pas de
  place au classement, et personne ne peut l'accuser.

Le rôle d'animateur **ne se réclame pas depuis l'application**. S'il suffisait
de cliquer, le premier stagiaire curieux verrait tous les secrets. Il s'inscrit
une fois dans la console Firebase, qui n'appartient qu'à toi.

**Fais-le avant de donner le lien au groupe.** Tant que le compte `Admin`
n'existe pas, n'importe qui pourrait le créer — il n'en tirerait aucun droit,
puisque les pouvoirs viennent de l'étape ci-dessous, mais il t'aurait pris
l'identifiant.

1. Ouvre l'application, onglet **Admin** → *Première fois ? Créer le compte
   Admin* → choisis son mot de passe. La page affiche alors **ton
   identifiant**, avec un bouton *Copier*.
2. Console Firebase → **Firestore Database → Données** → *Démarrer une
   collection*, nommée exactement **`admins`**.
3. Comme **ID du document**, colle ton identifiant. Ajoute un champ `since`, de
   type `number`, valeur `1`. Enregistre.
4. Reviens sur la page : elle bascule toute seule sur le poste de commande,
   sans rechargement.

Ensuite, tu peux **nommer un second animateur directement depuis la page**
(onglet *Admin → Participants →* fiche de la personne), et lui retirer ce
droit. Tu ne peux pas te le retirer à toi-même : c'est ce qui garantit qu'une
partie ne se retrouve jamais sans personne aux commandes.

Un mot sur le mot de passe du compte `Admin` : il n'est écrit nulle part dans
le dépôt, et il ne doit pas l'être — le code est public. Choisis-en un que tes
stagiaires ne devineront pas. Ce compte lit **tous les secrets, leurs auteurs
et tous les votes avant le reveal** : quelqu'un qui y entrerait ne gagnerait
pas la partie, il la viderait de son intérêt.

## L'espace admin

Quatre volets, tous pensés pour être lus d'un téléphone, debout, entre deux
ateliers. L'onglet s'appelle **Admin** — c'est le lieu ; « animateur » désigne
la personne qui en a les clés.

- **Pilotage** — l'état de la partie, les actions (lancer, clôturer, ouvrir la
  journée suivante, terminer), **qui n'a pas encore voté, nommément**, et **les
  votes de la journée en direct** avec la vérité en face. C'est ce qui permet
  de préparer le reveal du soir.
- **Participants** — une fiche par personne : son secret en clair avec son code,
  ses points et leur détail, l'historique de ses votes. On y annule un vote
  saisi par erreur, on ajuste des points à la main, on supprime un secret
  déplacé, on retire quelqu'un de la partie, on nomme un animateur.
- **Historique** — toutes les journées, tous les votes, depuis le début.
- **Réglages** — le nom de la partie, le barème, la liste des animateurs, et la
  zone rouge (repartir à zéro en gardant ou non les comptes).

## Déroulé d'une partie

1. Les stagiaires ouvrent le lien, créent leur compte et déposent leur secret.
2. Quand tout le monde a déposé : **Lancer la partie**. Les secrets sont
   verrouillés, la journée 1 s'ouvre.
3. Le soir : **Clôturer & révéler**. Les votes deviennent publics, les points
   tombent. Ton navigateur doit être ouvert : c'est lui qui calcule et publie.
4. Le lendemain : **Ouvrir la journée suivante**.
5. À la fin : **Terminer la partie** révèle tous les secrets restants.

## Comment les secrets restent secrets

Il n'y a pas de serveur : le navigateur parle directement à la base. Ce sont
donc les règles de sécurité, et elles seules, qui gardent l'information cachée.

- Un document de secret **ne contient aucun champ auteur**. Il n'y a rien à y
  lire, même pour quelqu'un qui inspecte les données depuis son navigateur.
- Trois collections ne sont lisibles que par l'animateur : le lien
  secret ↔ auteur, les votes, et le secret attribué à chacun.
- Au reveal, c'est le navigateur de l'animateur qui calcule les points et publie
  ce qui doit devenir public — en n'y mettant jamais l'auteur d'un secret encore
  en lice.
- Le rôle d'animateur ne peut être ni réclamé, ni volé : il n'existe qu'un seul
  chemin pour l'obtenir la première fois, et il passe par la console Firebase.

Ces garanties sont vérifiées, pas supposées : voir les tests ci-dessous.

## Tests

```bash
npm install
npm test            # les deux suites
npm run test:rules  # les règles de sécurité, contre l'émulateur Firestore
npm run test:web    # une partie entière jouée dans un navigateur
```

`test:rules` (32 vérifications) couvre le fait qu'un stagiaire ne peut ni lire
les liens auteur↔secret, ni les votes, ni voter deux fois, ni antidater son
vote, ni voter sans avoir déposé de secret, ni voter sur un secret déjà tombé,
ni accuser quelqu'un déjà démasqué, ni s'attribuer le secret d'un autre, ni
publier de faux scores, ni se nommer animateur — pas même quand la partie n'en
a encore aucun.

`test:web` va plus loin : il joue une partie complète à cinq dans un vrai
navigateur et **tente réellement les lectures interdites** depuis la page d'un
joueur. Il vérifie aussi que le premier animateur ne peut être nommé que depuis
la console, que la page le voit sans recharger, que l'animateur voit en direct
les votes et les absents, que l'ajustement manuel des points fonctionne, et
qu'un second animateur nommé puis révoqué gagne et reperd bien l'accès aux
données cachées.

Les tests ont besoin des émulateurs Firebase (téléchargés au premier lancement)
et de Java. `test:web` a en plus besoin de Playwright, qui ne fait pas partie
des dépendances du projet à cause de son poids :

```bash
npm install -g playwright && npx playwright install chromium
```

Pour jouer en local : `npm run serve`, puis <http://127.0.0.1:5000>. Sur une
adresse locale, l'application se branche d'elle-même sur les émulateurs — la
base de ta vraie formation n'est jamais touchée par un essai. Ajoute `?prod` à
l'adresse pour viser tout de même le vrai projet.

## Structure

```
web/                 l'application — c'est tout le jeu
  index.html
  js/app.js          affichage, règles, calcul des points au reveal
  js/config.js       le seul fichier à remplir
  js/firebase.js     le SDK Firebase, embarqué (aucun appel à un CDN)
  css/, fonts/       la charte : dégradé, Poppins hébergée en local
  images/            le logo détouré et les icônes d'application
firestore.rules      qui a le droit de lire et d'écrire quoi
firebase.json        hébergement et émulateurs
netlify.toml         de quoi publier sur Netlify si tu changes d'avis
build/               source du bundle Firebase (npm run build)
test/                règles de sécurité, partie complète en navigateur
PROMPT.md            le cahier des charges d'origine
```

## Vie privée et modération

Les secrets sont stockés en clair : c'est nécessaire au jeu. **L'animateur peut
tout lire** — c'est ce qui lui permet de modérer et d'animer le reveal à voix
haute. Personne d'autre ne le peut.

Rappelle la règle au lancement : on écrit des choses qu'on accepte de voir
révélées devant le groupe, et ce qui se dit en formation reste en formation.

Enfin, les mots de passe des stagiaires servent à empêcher un camarade de voter
à leur place, pas à protéger un compte sensible. L'application le dit à
l'inscription : il ne faut pas y réutiliser un mot de passe personnel.
