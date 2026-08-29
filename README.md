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

1. Va sur `/animateur.html`, connecte-toi (mot de passe par défaut **`bafa2026`**) et
   **change-le tout de suite** dans les réglages.
2. Les stagiaires vont sur la page d'accueil, créent leur compte et déposent leur secret.
3. Quand tout le monde a déposé, clique sur **« Lancer la partie »** : les secrets sont
   verrouillés et la journée 1 s'ouvre.
4. Le soir, **« Clôturer la journée & révéler »** : les votes deviennent publics et les
   points sont attribués. Le lendemain, **« Ouvrir la journée suivante »**.
5. **« Terminer la partie »** révèle tous les secrets restants et fige le classement.

### Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `ADMIN_PASSWORD` | `bafa2026` | Mot de passe animateur, **au tout premier démarrage seulement** (ensuite il se change dans les réglages) |
| `GAME_NAME` | `Secret BAFA` | Nom affiché, idem premier démarrage |
| `DATA_DIR` | `./data` | Dossier de la base SQLite |
| `DB_FILE` | `$DATA_DIR/secret-bafa.db` | Chemin complet de la base |
| `SECURE_COOKIES` | — | Mettre à `1` derrière HTTPS |

## Tests

```bash
npm test
```

Le test simule une partie complète de bout en bout (inscriptions, dépôt des secrets,
journées de vote, reveals, barème, fin de partie, remise à zéro) contre une base jetable.

## Déploiement

L'app est un serveur Node classique, elle tourne telle quelle sur Render, Railway, Fly.io
ou un petit VPS :

- commande de build : `npm install`
- commande de démarrage : `npm start`
- `SECURE_COOKIES=1` et un `ADMIN_PASSWORD` à toi

⚠️ La base est un fichier SQLite. Sur un hébergeur au système de fichiers éphémère
(Render free, Heroku…), **monte un disque persistant** et pointe `DATA_DIR` dessus, sinon
la partie repart de zéro à chaque redéploiement.

Pour un usage en salle de formation, le plus simple reste de lancer le serveur sur un
ordinateur connecté au même réseau Wi-Fi que les stagiaires et de leur donner l'adresse
`http://<ip-du-poste>:3000`.

## Structure

```
server/
  index.js     routes HTTP (API JSON) et service des fichiers statiques
  db.js        schéma SQLite et réglages
  auth.js      hachage des mots de passe (scrypt) et sessions par cookie signé
  game.js      règles du jeu : phases, votes, scores, clôture de journée
public/
  index.html   accueil, inscription et connexion
  jeu.html     l'app des stagiaires (mon secret, voter, secrets, résultats, classement)
  animateur.html   pilotage de la partie, modération, réglages
test/e2e.js    partie complète simulée contre l'API
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
