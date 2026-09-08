# Secret BAFA — ce que je veux exactement

> Document de référence rédigé pour Adrien. Il décrit le jeu, son
> fonctionnement, son style et ses contraintes, assez précisément pour être
> donné tel quel à un développeur ou à une IA. Ce qui est marqué **FAIT** existe
> déjà ; ce qui est marqué **À FAIRE** reste à construire.

---

## 1. Le projet en une phrase

Une application web où les stagiaires d'une formation BAFA déposent chacun un
secret anonyme, puis tentent chaque jour de deviner qui a écrit quoi, avec un
grand reveal collectif le soir.

## 2. Le contexte, et ce qu'il impose

Une formation BAFA, c'est **15 à 30 stagiaires de 17 à 25 ans**, sur **5 à 8
jours**, avec **un animateur** (le formateur). Tout le monde joue **depuis son
téléphone**, entre deux ateliers, souvent en deux minutes volées.

Trois conséquences non négociables :

- **Mobile d'abord.** L'écran de référence fait 390 px de large. Le confort sur
  ordinateur est un bonus, jamais l'inverse.
- **Zéro friction à l'entrée.** On ouvre un lien, on tape un prénom et un mot de
  passe, on joue. Pas d'e-mail, pas de validation, pas d'installation.
- **Tout en français**, tutoiement, ton chaleureux et direct. Jamais de jargon
  technique visible par un stagiaire.

## 3. Les règles du jeu

**Le dépôt.** Chaque personne écrit **un seul secret** sur elle-même (10 à 500
caractères). Il est modifiable tant que la partie n'est pas lancée, verrouillé
ensuite. Chaque secret reçoit un **code à trois caractères** (`CJR`, `E9Q`…)
qui permet d'en parler à voix haute sans le désigner par son auteur.

**Le vote.** Une fois la partie lancée, chaque journée ouvre un tour. Chaque
stagiaire a **un seul vote par jour, définitif** : il choisit un secret et
désigne la personne qui l'a écrit selon lui. On ne peut ni voter sur son propre
secret, ni s'accuser soi-même, ni accuser quelqu'un dont le secret est déjà
démasqué.

**Le reveal.** Le soir, l'animateur clôture la journée. Tous les votes
deviennent publics **d'un coup** — c'est le moment fort, il se vit en groupe.

**Les points.**

| Situation | Points |
|---|---|
| Tu devines le bon auteur | **+3** pour toi |
| Quelqu'un se trompe sur ton secret | **+1** pour toi, par personne trompée |

Le barème doit rester **réglable** par l'animateur.

**Deux règles qui font tout le sel du jeu :**

1. Un secret **deviné juste par au moins une personne sort du jeu** : son auteur
   est affiché pour tous, et cette personne disparaît de la liste des suspects.
   Le jeu se resserre jour après jour.
2. Un **vote raté ne révèle jamais** l'auteur du secret visé. On apprend
   seulement « ce n'est pas untel ». Le secret reste en lice.

## 4. Ce que voit un stagiaire

Une seule page, avec une barre d'onglets :

- **Mon secret** — écrire, relire, modifier tant que c'est ouvert.
- **Voter** — choisir un secret parmi ceux encore en jeu, désigner un suspect,
  confirmer. Une fois voté, l'écran montre son propre vote et rappelle qu'il est
  définitif.
- **Les secrets** — tous les textes, anonymes, sauf ceux déjà démasqués qui
  portent le nom de leur auteur.
- **Résultats** — journée par journée, tous les votes révélés, avec qui a trouvé
  et qui s'est trompé.
- **Classement** — les points, le détail « secrets trouvés · personnes
  trompées ».

En permanence, un bandeau en haut dit **ce qu'il a à faire maintenant** :
« Dépose ton secret », « À toi de jouer », « Vote enregistré », « Les votes sont
tombés ».

## 5. L'espace d'administration — **À FAIRE**

C'est le point le plus important de ce document. Je veux **un vrai poste de
commande**, pas trois boutons. L'animateur doit tout voir, tout de suite, sans
jamais avoir à ouvrir une console technique.

### 5.1 Le rôle d'animateur

- Il est **attribué par moi**, une fois, et **ne peut être ni volé ni pris par
  erreur**. Surtout pas « le premier qui clique ».
- Je dois pouvoir **nommer un second animateur** (un collègue) depuis
  l'application, et lui retirer ce droit.
- L'application doit m'afficher **mon identifiant technique** avec un bouton
  « copier », pour que la mise en place initiale soit évidente.

### 5.2 Le tableau de bord

En un coup d'œil : combien d'inscrits, combien de secrets déposés, combien de
secrets démasqués, où en est la journée, et **qui n'a pas encore voté** —
nommément, pour pouvoir relancer les gens de vive voix.

### 5.3 Les votes en direct

**Avant même le reveal**, je veux voir les votes tomber en temps réel : qui a
voté, sur quel secret, qui il accuse, et **si c'est juste ou faux**. C'est ce
qui me permet de préparer mon animation du soir et de savoir si la journée va
être drôle ou plate.

### 5.4 La fiche de chaque participant

Pour chaque stagiaire : son prénom, son secret en clair avec son code, s'il a
voté aujourd'hui, ses points, ce qu'il a trouvé, combien de personnes son secret
a trompées, et l'historique de ses votes.

### 5.5 L'historique complet

Toutes les journées, tous les votes, depuis le début. Consultable à tout moment.

### 5.6 Les actions

- Lancer la partie · Clôturer et révéler · Ouvrir la journée suivante ·
  Terminer la partie
- Modifier le barème et le nom de la partie
- **Modérer** : supprimer un secret déplacé, retirer un participant
- **Corriger** : ajuster les points de quelqu'un à la main, annuler un vote
  saisi par erreur
- Repartir à zéro, en gardant ou non les comptes

## 6. Ce qui doit rester caché — non négociable

Le jeu ne vaut rien si l'information fuit. **Trois choses doivent être
illisibles pour un stagiaire, y compris s'il ouvre les outils de développement
de son navigateur** :

1. **Le lien entre un secret et son auteur.**
2. **Les votes des autres**, avant le reveal.
3. **Quel secret appartient à qui.**

L'animateur, lui, voit tout — c'est ce qui lui permet de modérer et d'animer.

Cette exigence doit être **vérifiée par des tests automatiques**, pas seulement
affirmée. Une partie complète doit être rejouable dans un vrai navigateur, avec
une tentative réelle de lecture interdite depuis la page d'un joueur.

## 7. La direction artistique

Référence assumée : **utips.fr**. Moderne, coloré, joyeux, un peu « appli
mobile grand public ». Rien d'austère, rien d'institutionnel.

**Couleurs**

| Rôle | Valeur |
|---|---|
| Ciel (en-tête) | dégradé `#8B5CF6` → `#B15AD0` → `#E8629B` → `#FFB884` |
| Boutons | dégradé corail → ambre `#EF5A6F` → `#F79B4B` |
| Accent secondaire | indigo `#6C5CE7` |
| Encre | `#2C1B47` |
| Fond | `#F7F4FB` |
| Trouvé / raté | vert `#0F9E75` / rouge `#E0455C` |

**Typographie** — **Poppins** partout : 800 pour les titres (très gras, ronde,
interlignage serré), 600 pour l'interface, 400 pour le texte courant. Hébergée
dans le projet, jamais chargée depuis un service extérieur : la salle de
formation n'a pas toujours internet.

**Composants**

- En-tête en dégradé à coins arrondis, avec deux halos flous, qui porte toujours
  l'état du jeu.
- **Cartes blanches flottantes** posées dessus : grandes ombres douces, coins
  très arrondis (20 px), léger flottement animé.
- **Boutons en pilules** pleines, qui se soulèvent au survol.
- **Secrets en cartes légèrement inclinées** (±0,6°) qui se redressent et se
  soulèvent quand on les sélectionne, avec un halo violet.
- Une **barre de progression** « X secrets démasqués sur Y » : le jeu doit se
  sentir comme un jeu, avec des paliers.

**Animations** — le moment fort est le reveal :

- un tampon **« Démasqué »** qui atterrit en tournant avec un rebond sur le
  secret percé ;
- une **pluie de confettis** aux couleurs de la charte si c'est *moi* qui ai
  trouvé, une seule fois par journée ;
- les cartes entrent en douceur, jamais brutalement.

Tout doit se désactiver si le téléphone est réglé sur « animations réduites ».

**Logo** — le logo 3D « SECRET BAFA » (lettres blanches et roses en volume sur
fond violet, avec les éclats orange et violets autour). Il est **horizontal**,
la mise en page doit lui laisser de la place.

## 8. Les contraintes techniques

- **Aucun serveur à maintenir.** Page statique + Firebase (Firestore pour les
  données, Authentication pour les comptes). Hébergement gratuit.
- **Comptes simples** : prénom + mot de passe. Pas d'e-mail demandé.
- **Temps réel** : quand l'animateur clôture, les écrans des stagiaires suivent
  sans avoir à recharger.
- **Adresse courte et dictable** à voix haute devant un groupe.
- Le SDK est embarqué dans le projet, pas chargé depuis un CDN.
- Un vote doit être confirmé par le serveur avant d'être annoncé comme
  enregistré : sur un téléphone en Wi-Fi capricieux, un vote perdu silencieusement
  serait le pire des bugs.

## 9. Où on en est

**FAIT** — le jeu complet et jouable : comptes, dépôt et verrouillage des
secrets, un vote par jour définitif, reveal groupé, barème réglable, secrets
démasqués qui sortent du jeu, classement, temps réel, la charte graphique
ci-dessus, les animations, et l'espace animateur de base (pilotage, liste des
participants avec leurs secrets, réglages, remise à zéro).

**FAIT** — la protection de l'information cachée, vérifiée par 24 tests de
règles de sécurité et une partie complète rejouée dans un navigateur.

**À FAIRE** — l'espace d'administration décrit au point 5 : rôle d'animateur
attribué et non volable, votes en direct, fiche par participant, historique
complet, corrections manuelles.

**À FAIRE** — remplacer le logo par le bon, et adapter la mise en page à son
format horizontal.

**À FAIRE** — l'adresse courte.
