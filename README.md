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
- On ne peut pas voter sur son propre secret, ni s'accuser soi-même.
- Un seul vote par jour et par personne, définitif une fois validé.

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
modification et affiche l'adresse obtenue.

Retourne ensuite dans Firebase : **Authentication → Settings → Domaines
autorisés** → ajoute le domaine de ta page (`ton-nom.github.io`), sinon la
connexion sera refusée.

### 4. Prendre le rôle d'animateur — avant les autres

Ouvre l'application, crée ton compte, puis **Animateur → Devenir animateur**.

**Fais-le avant de donner le lien aux stagiaires.** Le rôle se prend une seule
fois : le premier qui le réclame le garde, et le verrou se referme
définitivement. C'est lui qui donne le droit de voir les auteurs, de clôturer
les journées et d'attribuer les points.

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

Ces garanties sont vérifiées, pas supposées : voir les tests ci-dessous.

## Tests

```bash
npm install
npm test          # les deux suites
npm run test:rules  # les règles de sécurité, contre l'émulateur Firestore
npm run test:web    # une partie entière jouée dans un navigateur
```

`test:rules` vérifie qu'un stagiaire ne peut ni lire les liens auteur↔secret, ni
les votes, ni voter deux fois, ni antidater son vote, ni s'attribuer le secret
d'un autre, ni publier de faux scores, ni prendre un rôle d'animateur déjà pris.

`test:web` va plus loin : il joue une partie complète à cinq dans un vrai
navigateur et **tente réellement les lectures interdites** depuis la page d'un
joueur, avant de vérifier le barème, le reveal et la sortie du jeu d'un secret
démasqué.

Les tests ont besoin des émulateurs Firebase (téléchargés au premier lancement)
et de Java. Pour jouer en local : `npm run serve`, puis <http://127.0.0.1:5000>.

## Structure

```
web/                 l'application — c'est tout le jeu
  index.html
  js/app.js          affichage, règles, calcul des points au reveal
  js/config.js       le seul fichier à remplir
  js/firebase.js     le SDK Firebase, embarqué (aucun appel à un CDN)
  css/, fonts/       la charte : dégradé, Poppins hébergée en local
firestore.rules      qui a le droit de lire et d'écrire quoi
firebase.json        hébergement et émulateurs
build/               source du bundle Firebase (npm run build)
test/                règles de sécurité, partie complète en navigateur
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
