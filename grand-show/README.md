# 🎮 Le Grand Show — jeu télé pour centre de loisirs

Application 100 % hors ligne (HTML / CSS / JavaScript pur) pour animer 3 équipes d'enfants sur une grande télé :
tableau des scores, accueil, puis 4 mini-jeux — **Blind Test**, **Défloutage**, **Œil de Lynx**, **Dessin Flash**.

## 1. Lancer le jeu

### Écran unique (le plus simple)
Double-cliquez sur **`index.html`** (ou « Go Live » avec Live Server). Tous les boutons sont sur l'écran, comme dans une version classique. À éviter si les enfants voient le mot à dessiner ou les réponses : voir le double écran.

### Double écran télé + régie (recommandé)
La **télé** n'affiche que ce que les enfants doivent voir ; la **régie** (écran du portable) contient les contrôles *et* les secrets (réponses, mot à dessiner, emplacement des cibles).

1. Branchez la télé en HDMI. Windows : **Win + P → « Étendre »** (pas « Dupliquer »).
2. Ouvrez **`regie.html`** dans Chrome sur l'écran du portable.
3. Dans la régie, cliquez sur **« 📺 Ouvrir la télé »** : une fenêtre s'ouvre. Faites-la glisser sur la télé, cliquez dedans une fois (pour autoriser le son) puis appuyez sur **F** (plein écran).
4. Dans la régie, vérifiez l'indicateur : **🟢 Télé connectée**. S'il est rouge (🔴 Télé non détectée), voir le dépannage.

Variante : ouvrez `index.html`, puis cliquez sur **« 🖥️ Ouvrir la régie »** : la télé passe d'elle-même en « affichage seul ». Ouvrir `regie.html` à la main fonctionne aussi : une télé ouverte en écran unique bascule toute seule en affichage seul.

Si la régie est fermée par erreur, un bouton discret **« Régie non détectée — cliquer ici pour reprendre les commandes »** apparaît sur la télé au bout d'une quinzaine de secondes.

> **Le son sort par la télé.** Les musiques, bips, buzzer et fanfares sont joués par la page « télé ». Chrome n'autorise le son qu'après un clic dans la page : un bandeau jaune « Cliquez n'importe où sur cet écran pour activer le son » le rappelle, et la régie affiche 🔇 tant que ce n'est pas fait.
> Dans Windows, réglez la sortie audio sur la télé (HDMI) si vous voulez le son sur ses haut-parleurs.

## 2. Déroulé d'un jeu (régie ou écran unique)

| Jeu | Boutons principaux |
|---|---|
| 🎵 Blind Test | ▶️ Lancer la musique (puis Pause / Reprendre) · 👁️ Révéler · Suivant ➜ · ⏮️ Rejouer · 🔄 Partie 2 (manches de réserve) · 📁 Charger un MP3 |
| 🔍 Défloutage | 🔍 Lancer (puis Pause / Reprendre : le flou se fige exactement) · 👁️ Révéler · Suivant ➜ |
| 👁️ Œil de Lynx | ▶️ Lancer · clic sur un élément de la liste = trouvé · 🎯 Solutions · 🔀 Nouvelle scène · Suivant ➜ · 🔍 Loupe |
| 🎨 Dessin Flash | 🔑 Mot secret · 🎲 Nouveau mot · ⏱️ Chrono · 🗑️ Effacer · palette, gomme, épaisseurs, ↶ Annuler le trait |

- **Points** : boutons +50 / +100 / −50 sur chaque badge. Un score ne descend jamais sous 0. **↶** annule les 50 derniers changements (y compris une remise à zéro), **↺** remet tout à zéro après confirmation.
- **Dessin** : l'enfant dessine sur la **régie** ; le trait apparaît en direct sur la télé. L'annulation après un « Effacer » restaure le dessin.
- 🏆 **Résultats** (depuis l'accueil) : podium, couronne et confettis.

## 3. Raccourcis clavier (aussi dans l'aide « ? »)

| Touche | Action |
|---|---|
| `Espace` | Lancer / pause de l'action principale du jeu |
| `R` | Révéler (Dessin : afficher/masquer le mot secret ; Lynx : afficher/masquer les solutions) |
| `→` ou `N` | Manche suivante (Dessin : nouveau mot) |
| `Échap` | Retour à l'accueil |
| `F` | Plein écran |
| `1` `2` `3` (`4`) puis `+` ou `-` | Points rapides pour l'équipe (premier bouton positif / négatif de `config.js`) |
| `Ctrl + Z` | Annuler le dernier changement de score |
| `?` ou `H` | Aide |

Les raccourcis sont désactivés quand on tape dans un champ (liste déroulante, saisie…). Sur la télé en « affichage seul », seule la touche `F` est active.

## 4. Préparer l'animation : tout est dans `config.js`

Ouvrez `config.js` dans VS Code : chaque champ est commenté en français. Enregistrez puis rechargez les pages (F5).

- **Équipes** (2 à 4), noms et couleurs ; **valeurs des boutons de points** ; **sons** on/off ; durées de chaque jeu.
- **Blind test** : `{ fichier, debut, reponse, indice? }`. Copiez vos MP3 dans `assets/musiques/`. `debut` = seconde de départ de l'extrait (le refrain). `reserve` = manches de la « Partie 2 ».
- **Défloutage** : `{ image, emojiSecours, reponse }`, images dans `assets/images/` (JPG, PNG, SVG, WebP ; 1600 px de large suffisent). Si l'image est absente, l'emoji de secours est flouté à la place. `flouMax` règle le flou de départ.
- **Œil de Lynx** : 3 cibles `{ emoji, libelle }` par manche ; `densite` = nombre de pièges (200 à 300). Pour utiliser votre propre image « cherche et trouve » : ajoutez `image` et `zones` (3 positions `{x, y, r}` entre 0 et 1, voir le commentaire dans le fichier).
- **Dessin** : mots classés `facile` / `moyen` / `difficile`, EN MAJUSCULES, ajoutez-en autant que voulu (48 fournis). Un menu « Difficulté » dans la barre d'outils choisit le niveau.

**Validation** : au chargement, `config.js` est vérifié. En cas d'erreur (champ manquant, mauvaise couleur, fichier vide…), un bandeau ⚠️ discret apparaît en haut de la régie, le détail s'écrit dans la console (F12) et une valeur par défaut est utilisée : l'appli ne plante pas.

### Contenus fournis (libres de droits) — voir `assets/CREDITS.md`
- **6 musiques** : mélodies du domaine public (Joyeux anniversaire, Vive le vent, Ode à la joie, Frère Jacques, Au clair de la lune, Pour Élise) **synthétisées par le script `outils/generer-musiques.py`** — aucun enregistrement tiers. Elles servent d'exemples fonctionnels : remplacez-les par vos propres extraits.
- **8 images** Twemoji (CC-BY 4.0) pour le défloutage.
- Polices **Luckiest Guy** et **Nunito** embarquées (`assets/fonts/`, déclarées en `@font-face`, avec repli sur Impact / Segoe UI).

### Idées de musiques « sous droits » à ajouter vous-même
Je ne les télécharge pas (droits d'auteur). Copiez vos propres fichiers dans `assets/musiques/` ; **repérez avec votre lecteur la seconde du début du 1er refrain** et reportez-la dans `debut` (les repères ci-dessous sont des indications de passage à chercher, pas des secondes garanties — elles varient selon la version).

| Réponse à afficher | Extrait à chercher |
|---|---|
| Libérée, délivrée — La Reine des neiges | Début du refrain « Libérée, délivrée… » |
| Hakuna Matata — Le Roi Lion | Début du refrain « Hakuna Matata, ça veut dire… » |
| Le Bleu lumière (Vaiana) — Vaiana | Début du refrain |
| On ne parle pas de Bruno — Encanto | Début du refrain « On ne parle pas de Bruno… » |
| Ce rêve bleu — Aladdin | Début du refrain « Un monde à moi… » |
| Je veux y croire / Il en faut peu pour être heureux — Le Livre de la jungle | Premières mesures |
| Générique de Pokémon (« Attrapez-les tous ») | Début du refrain |
| Générique de Dragon Ball Z (« Cha-la Head-cha-la ») | Début du refrain |
| Générique de Naruto | Début de l'ouverture |
| Thème de Super Mario Bros. | Premières notes |
| Thème principal de Star Wars | Fanfare d'ouverture |
| Thème de Harry Potter (« Hedwig's Theme ») | Début de la célesta |
| Pirates des Caraïbes — « He's a Pirate » | Début du thème |
| La Panthère rose | Premières notes |
| Happy — Pharrell Williams | Début du refrain |
| Can't Stop the Feeling — Justin Timberlake | Début du refrain |
| Les Minions — Banana | Début du refrain |
| Tetris (Korobeiniki, domaine public) | Premières mesures |

Exemple de ligne à ajouter dans `config.js` :
```js
{ fichier: 'assets/musiques/liberee-delivree.mp3', debut: 95, reponse: 'Libérée, délivrée — La Reine des neiges' },
```
Bonus : le bouton **📁 Charger un MP3** (blind test) remplace la musique d'une manche à la volée et demande la réponse ; il ne survit pas à un rechargement de page.

## 5. Checklist « avant l'animation »

- [ ] Win + P → **Étendre** ; télé en plein écran (`F`) ; régie sur le portable.
- [ ] Indicateur régie : **🟢 Télé connectée**, sans mention 🔇 (sinon : cliquer une fois sur la télé).
- [ ] **Son de la télé** : sortie audio Windows = HDMI, volume réglé ; lancer une manche du blind test pour entendre la musique, régler le volume dans la régie.
- [ ] **Polices présentes** : les titres sont en lettres « bulles » (Luckiest Guy). Sinon, vérifier `assets/fonts/`.
- [ ] **Fichiers en place** : la régie affiche ✅ « Fichier audio trouvé » pour chaque manche du blind test ; passer en revue les images du défloutage (le bouton Suivant fait défiler).
- [ ] Aucun bandeau ⚠️ (config.js valide).
- [ ] **Tester un chrono** (lancer, laisser passer les 5 dernières secondes : bips, buzzer, « TEMPS ÉCOULÉ ! »).
- [ ] Tester un trait de dessin : il apparaît sur la télé, et le mot secret n'apparaît **pas** sur la télé.
- [ ] **Scores remis à zéro** : ↺ puis confirmer.
- [ ] Mise à l'échelle Windows : les écrans sont gérés ; en cas de doute, Chrome → `Ctrl + 0`.

## 6. Dépannage

| Problème | Solution |
|---|---|
| 🔴 Télé non détectée | Les deux fenêtres doivent être dans **le même Chrome** (pas un profil ou une fenêtre de navigation privée différente) et ouvertes depuis le même dossier. Rechargez la télé (F5) : elle se resynchronise. |
| « Fenêtre bloquée » en cliquant sur Ouvrir la régie / télé | Autorisez les fenêtres surgissantes pour la page (icône dans la barre d'adresse) ou ouvrez la page à la main. |
| Pas de son sur la télé | Cliquez une fois dans la fenêtre télé ; vérifiez la sortie audio Windows ; vérifiez que 🔇 n'est pas actif. |
| Musique : « Fichier introuvable » | Vérifiez le nom exact (majuscules comprises) et le dossier `assets/musiques/` ; Chrome lit les MP3, OGG et WAV. |
| Rien ne se passe en double-cliquant | Chrome doit être le navigateur ouvrant les `.html`. |

## 7. Choix techniques

- **Scripts classiques + espace de noms `window.GrandShow`** plutôt que des modules ES : Chrome refuse de charger les `<script type="module">` en `file://` (CORS), alors que les scripts classiques chargés dans l'ordre fonctionnent en double-clic et en Live Server. L'ordre de chargement est dans le bas de `index.html` / `regie.html`.
- **Une seule autorité d'état.** La régie (ou la télé en écran unique) applique les actions, sauvegarde, puis diffuse l'état complet ; la télé en affichage seul l'applique. Si la télé est rechargée, elle redemande l'état (et le dessin) : rien n'est perdu. Chrono et flou se déduisent d'une horloge partagée (`performance.timeOrigin + performance.now()`), pas de messages à chaque seconde.
- **Synchronisation** : `BroadcastChannel` (même navigateur). Repli automatique sur l'événement `storage` de `localStorage` s'il est indisponible ou muet. Tant qu'aucun message ne circule par `BroadcastChannel`, les deux transports sont utilisés simultanément (doublons éliminés). Le survol de l'indicateur 🟢 de la régie indique le transport actif. Pour forcer un transport lors d'un test : `index.html?affichage=1&transport=storage` (idem `regie.html?transport=storage`), ou `transport=bc`.
- **Mode de la page télé** mémorisé dans l'onglet (`sessionStorage`) : un rechargement la laisse en « affichage seul ». Le passage entre modes recharge la page (les scores sont conservés).
- **Dessin** : Pointer Events + `setPointerCapture` + `getCoalescedEvents()` ; coordonnées normalisées (0 à 1) calculées avec `getBoundingClientRect()`, canvas au `devicePixelRatio`, proportion fixe 16:10 sur la télé et la régie ; points envoyés par lots de 30 ms.
- **Œil de Lynx** : scène générée à partir d'une graine, positions stockées en coordonnées normalisées (même scène sur la télé, la régie et après redimensionnement).
- Les scores, le volume, la sourdine et l'historique d'annulation sont dans `localStorage` (protégé par `try/catch`) ; sans stockage l'appli fonctionne quand même.

## 8. Arborescence

```
grand-show/
├── index.html · regie.html          pages télé et régie
├── config.js                        tout le contenu modifiable
├── css/style.css
├── js/core/      util, storage, config-check, sound, chrono, sync, state
├── js/           ui, scoreboard, hub, podium, app
├── js/games/     commun, blindtest, defloutage, lynx-scene, lynx, dessin
├── assets/       fonts/ musiques/ images/ CREDITS.md
└── outils/generer-musiques.py       régénère les musiques d'exemple
```
