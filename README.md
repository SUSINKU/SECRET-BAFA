# Secret BAFA

Un jeu de devinettes à jouer entre stagiaires pendant une formation BAFA.

Chacun dépose **un secret anonyme**. Chaque jour, chaque stagiaire a **un seul vote** :
il choisit un secret et désigne la personne qui l'a écrit selon lui. Le soir, l'animateur
clôture la journée : tous les votes sont révélés d'un coup, les points tombent, et une
nouvelle journée s'ouvre.

## Règles

| Situation | Points |
|---|---|
| Tu devines le bon auteur d'un secret | **+3** pour toi |
| Quelqu'un se trompe en essayant de deviner ton secret | **+1** pour toi, par personne trompée |

Le barème est modifiable dans l'espace animateur.

- Un secret **démasqué sort du jeu** : son auteur est affiché pour tout le monde, et cette
  personne n'apparaît plus dans la liste des suspects (chacun n'écrit qu'un seul secret).
- Un vote raté **ne révèle jamais** l'auteur du secret visé : il reste en jeu. Seul
  l'animateur voit les auteurs, pour pouvoir animer le reveal à voix haute.
- On ne peut pas voter sur son propre secret, ni s'accuser soi-même.
- Un seul vote par jour et par personne, définitif une fois validé.

## Démarrage

```bash
npm install
npm start          # http://localhost:3000
```

Puis :

1. Ouvre l'onglet **Animateur**, connecte-toi (mot de passe par défaut
   **`bafa2026`**) et **change-le tout de suite** dans les réglages.
2. Les stagiaires vont sur la page d'accueil, créent leur compte et déposent leur secret.
3. Quand tout le monde a déposé, clique sur **« Lancer la partie »** : les secrets sont
   verrouillés et la journée 1 s'ouvre.
4. Le soir, **« Clôturer & révéler »** : les votes deviennent publics et les
   points sont attribués. Le lendemain, **« Ouvrir la journée suivante »**.
5. **« Terminer la partie »** révèle tous les secrets restants et fige le classement.

## Tests

```bash
npm test
```

Le test simule une partie complète de bout en bout (inscriptions, dépôt des secrets,
journées de vote, reveals, barème, fin de partie, remise à zéro) contre une base jetable.

## Mettre le jeu en ligne

La partie est stockée dans une base **libSQL** — c'est-à-dire du SQLite, mais
hébergé. Le serveur n'a donc aucun fichier à conserver, ce qui lui permet de
tourner sur une offre d'hébergement gratuite sans rien perdre au redémarrage.

En local, aucune configuration : sans `DATABASE_URL`, le jeu écrit dans
`data/secret-bafa.db` comme n'importe quel fichier.

### 1. Créer la base (gratuit)

Sur [Turso](https://turso.tech) : crée un compte, crée une base, et récupère
les deux valeurs qu'il te donne — l'URL (`libsql://…`) et un jeton
d'authentification. Vérifie au passage les conditions de l'offre gratuite du
moment ; elle couvre très largement un jeu de cette taille (quelques centaines
de lignes pour une formation entière).

Rien d'autre à faire : le serveur crée ses tables tout seul au premier
démarrage.

### 2. Déployer le serveur (gratuit)

Le dépôt contient un `render.yaml`. Sur [Render](https://render.com) :
*New → Blueprint*, pointe ce dépôt, et renseigne les trois valeurs demandées :

| Variable | Ce que tu mets |
|---|---|
| `DATABASE_URL` | l'URL `libsql://…` de ta base Turso |
| `DATABASE_AUTH_TOKEN` | le jeton fourni par Turso |
| `ADMIN_PASSWORD` | le mot de passe animateur que tu veux |

Contrepartie du plan gratuit : après un quart d'heure sans visite, Render
endort le service, et la personne suivante attend une trentaine de secondes le
temps du réveil. Rien n'est perdu — tout est dans la base. Si ce délai te gêne
le jour J, ouvre l'app quelques minutes avant la séance.

### 3. Autres hébergeurs

Un `Dockerfile` est fourni pour Fly.io, Railway ou un VPS. Avec `DATABASE_URL`,
le conteneur est jetable et n'a besoin d'aucun volume.

### 4. Sans internet, sur un ordinateur de la salle

Le jeu tourne aussi très bien sur ton portable (`npm start`), les stagiaires s'y
connectant par le Wi-Fi de la salle. Le serveur affiche au démarrage les
adresses à donner, du genre `http://192.168.1.42:3000` — c'est celle-là que les
stagiaires tapent, pas `localhost`. Aucune connexion internet n'est nécessaire :
la base est un fichier local et les polices sont dans le dépôt.

### Réglages

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `DATABASE_URL` | `file:./data/secret-bafa.db` | Base libSQL, ou fichier local |
| `DATABASE_AUTH_TOKEN` | — | Jeton, pour une base hébergée |
| `ADMIN_PASSWORD` | `bafa2026` | Mot de passe animateur, **au premier démarrage seulement** |
| `GAME_NAME` | `Secret BAFA` | Nom affiché, idem premier démarrage |
| `SECURE_COOKIES` | — | Mettre à `1` dès que le site est en HTTPS |

## Structure

```
server/
  index.js     routes HTTP (API JSON) et service des fichiers statiques
  db.js        base libSQL (fichier local ou base hébergée), schéma et réglages
  auth.js      hachage des mots de passe (scrypt) et sessions par cookie signé
  game.js      règles du jeu : phases, votes, scores, clôture de journée
public/
  index.html   toute l'interface, en une seule page
  css/app.css  la charte : ciel en dégradé, cartes flottantes, boutons en pilules
  css/fonts.css + fonts/   Poppins hébergée en local, pour tenir sans internet
  js/app.js    affichage et appels à l'API
test/e2e.js    partie complète simulée contre l'API
artifact/      le même jeu en une page publiée sur claude.ai (voir artifact/README.md)
legacy/        le prototype statique d'origine (localStorage), conservé pour mémoire
```

## Vie privée et modération

Les secrets sont stockés en clair dans la base : c'est nécessaire pour le jeu, mais cela
veut dire que **la personne qui héberge le serveur peut tout lire**. L'espace animateur
affiche d'ailleurs chaque secret avec son auteur, pour permettre la modération : un secret
déplacé peut être supprimé, un participant retiré de la partie.

Rappelle la règle du jeu au lancement : on écrit des choses qu'on accepte de voir révélées
devant le groupe, et ce qui se dit en formation reste en formation.

### Deux limites connues

- **Le classement est déductible.** Les points d'un joueur valent `3 × (secrets trouvés) +
  1 × (personnes trompées)`, et les secrets trouvés sont publics : un joueur très motivé
  peut donc calculer combien de personnes se sont trompées sur *ton* secret et recouper
  avec les votes du jour. Sur un groupe de 15-25 stagiaires le recoupement reste très
  flou ; à 4 ou 5 joueurs il devient facile. Si ça te gêne, la parade est de ne créditer
  les points de camouflage qu'en fin de partie.
- **Les mots de passe des stagiaires sont là pour empêcher un camarade de voter à leur
  place**, pas pour protéger un compte sensible. Le message d'inscription le dit&nbsp;: il
  ne faut pas réutiliser un mot de passe personnel.
