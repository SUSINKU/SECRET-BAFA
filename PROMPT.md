Construis de zéro une application web appelée **Secret BAFA**.

C'est un jeu à faire tourner pendant une formation BAFA : chaque stagiaire
dépose un secret anonyme sur lui-même, puis tout le monde essaie chaque jour de
deviner qui a écrit quoi. Le soir, l'animateur clôture la journée et tous les
votes sont révélés d'un coup.

---

## LE CONTEXTE, ET CE QU'IL IMPOSE

15 à 30 stagiaires de 17 à 25 ans, sur 5 à 8 jours, plus un animateur (le
formateur). Tout le monde joue depuis son téléphone, entre deux ateliers,
souvent en deux minutes volées.

Trois conséquences non négociables :

- **Mobile d'abord.** L'écran de référence fait 390 px de large. Le confort sur
  ordinateur est un bonus, jamais l'inverse.
- **Zéro friction.** On ouvre un lien, on tape un prénom et un mot de passe, on
  joue. Pas d'e-mail, pas de validation par mail, rien à installer.
- **Tout en français**, tutoiement, ton chaleureux et direct. Aucun jargon
  technique visible par un stagiaire. Les messages d'erreur disent quoi faire.

---

## LES RÈGLES DU JEU

**Le dépôt.** Chacun écrit **un seul secret** sur lui-même, entre 10 et 500
caractères, modifiable tant que la partie n'est pas lancée puis verrouillé.
Chaque secret reçoit un **code de trois caractères** (`CJR`, `E9Q`…) pour qu'on
puisse en parler à voix haute sans désigner son auteur.

**Le vote.** Une fois la partie lancée, chaque journée ouvre un tour. Chaque
stagiaire a **un seul vote par jour, définitif** : il choisit un secret et
désigne la personne qui l'a écrit selon lui. Interdit de voter sur son propre
secret, de s'accuser soi-même, ou d'accuser quelqu'un dont le secret est déjà
démasqué.

**Le reveal.** L'animateur clôture la journée quand il veut. Tous les votes
deviennent publics d'un coup : c'est le moment fort, il se vit en groupe.

**Les points**, réglables par l'animateur :

- **+3** quand tu devines le bon auteur d'un secret
- **+1** pour l'auteur d'un secret, à chaque fois que quelqu'un se trompe sur lui

**Deux règles font tout le sel du jeu, ne les rate pas :**

1. Un secret **deviné juste par au moins une personne sort du jeu** : son auteur
   est affiché pour tous et cette personne disparaît de la liste des suspects.
   Le jeu se resserre jour après jour.
2. Un **vote raté ne révèle jamais** l'auteur du secret visé. On apprend
   seulement « ce n'est pas untel ». Le secret reste en lice. Sans cette règle,
   chaque erreur grillerait un secret gratuitement et le jeu s'effondrerait.

---

## CE QUE VOIT UN STAGIAIRE

Une seule page, une barre d'onglets :

- **Mon secret** — écrire, relire, modifier tant que c'est ouvert
- **Voter** — choisir un secret encore en jeu, désigner un suspect, confirmer.
  Une fois voté : son propre vote, et le rappel qu'il est définitif
- **Les secrets** — tous les textes, anonymes ; ceux démasqués portent le nom de
  leur auteur
- **Résultats** — journée par journée, tous les votes révélés, qui a trouvé, qui
  s'est trompé
- **Classement** — les points, avec le détail « secrets trouvés · personnes
  trompées »

En haut, en permanence, un bandeau qui dit **ce qu'il a à faire maintenant** :
« Dépose ton secret », « À toi de jouer », « Vote enregistré », « Les votes sont
tombés ».

---

## L'ESPACE D'ADMINISTRATION — LE POINT LE PLUS IMPORTANT

Je veux un **vrai poste de commande**, pas trois boutons. L'animateur doit tout
voir immédiatement, sans jamais ouvrir une console technique.

**Le rôle d'animateur** est attribué par moi, une fois, et **ne peut être ni
volé ni pris par erreur**. Surtout pas « le premier qui clique ». Je dois
pouvoir nommer un second animateur depuis l'application et lui retirer ce droit.
L'application m'affiche mon identifiant technique avec un bouton « copier »,
pour que la mise en place soit évidente.

**Le tableau de bord** : combien d'inscrits, de secrets déposés, de secrets
démasqués, où en est la journée, et **qui n'a pas encore voté — nommément**,
pour pouvoir relancer les gens de vive voix.

**Les votes en direct, avant le reveal** : qui a voté, sur quel secret, qui il
accuse, et si c'est juste ou faux. C'est ce qui me permet de préparer mon
animation du soir.

**Une fiche par participant** : son prénom, son secret en clair avec son code,
s'il a voté aujourd'hui, ses points, ce qu'il a trouvé, combien de personnes son
secret a trompées, l'historique de ses votes.

**L'historique complet** : toutes les journées, tous les votes, depuis le début.

**Les actions** : lancer la partie, clôturer et révéler, ouvrir la journée
suivante, terminer la partie, modifier le barème et le nom de la partie,
supprimer un secret déplacé, retirer un participant, ajuster les points de
quelqu'un à la main, annuler un vote saisi par erreur, repartir à zéro en
gardant ou non les comptes.

---

## CE QUI DOIT RESTER CACHÉ — NON NÉGOCIABLE

Le jeu ne vaut rien si l'information fuit. **Trois choses doivent être
illisibles pour un stagiaire, y compris s'il ouvre les outils de développement
de son navigateur :**

1. le lien entre un secret et son auteur ;
2. les votes des autres, avant le reveal ;
3. quel secret appartient à qui.

L'animateur, lui, voit tout — c'est ce qui lui permet de modérer et d'animer.

**Vérifie-le, ne te contente pas de l'affirmer.** Écris des tests automatiques
des règles de sécurité, et un test qui rejoue une partie complète dans un vrai
navigateur en **tentant réellement** ces lectures interdites depuis la page d'un
joueur. Si tu ne peux pas le prouver, dis-le-moi au lieu de me rassurer.

---

## LA DIRECTION ARTISTIQUE

Référence assumée : **utips.fr**. Moderne, coloré, joyeux, « appli mobile grand
public ». Rien d'austère, rien d'institutionnel.

**Couleurs**

| Rôle | Valeur |
|---|---|
| Ciel (en-tête) | dégradé `#8B5CF6` → `#B15AD0` → `#E8629B` → `#FFB884` |
| Boutons | dégradé corail → ambre `#EF5A6F` → `#F79B4B` |
| Accent secondaire | indigo `#6C5CE7` |
| Encre | `#2C1B47` |
| Fond | `#F7F4FB` |
| Trouvé / raté | vert `#0F9E75` / rouge `#E0455C` |

**Typographie** : **Poppins** partout — 800 pour les titres (très gras, rond,
interlignage serré), 600 pour l'interface, 400 pour le texte courant. Hébergée
dans le projet, jamais chargée depuis un service extérieur : la salle de
formation n'a pas toujours internet.

**Composants**

- En-tête en dégradé à coins arrondis, deux halos flous, qui porte toujours
  l'état du jeu
- **Cartes blanches flottantes** posées dessus : ombres douces et larges, coins
  très arrondis (20 px), léger flottement animé
- **Boutons en pilules** pleines, qui se soulèvent au survol
- **Secrets en cartes légèrement inclinées** (±0,6°) qui se redressent et se
  soulèvent à la sélection, avec un halo violet
- Une **barre de progression** « X secrets démasqués sur Y » : ça doit se sentir
  comme un jeu, avec des paliers

**Animations** — le moment fort est le reveal :

- un tampon **« Démasqué »** qui atterrit en tournant avec un rebond sur le
  secret percé
- une **pluie de confettis** aux couleurs de la charte si c'est *moi* qui ai
  trouvé, une seule fois par journée
- les cartes entrent en douceur, jamais brutalement
- tout se désactive si le téléphone est réglé sur « animations réduites »

**Logo** : je te fournirai un PNG « SECRET BAFA » en 3D, lettres blanches et
roses en volume sur fond violet, avec des éclats orange autour. Il est
**horizontal** (environ 2,2:1) : prévois-lui de la place, ne le déforme pas.

---

## LES CONTRAINTES TECHNIQUES

- **Aucun serveur à maintenir.** Page statique + Firebase : Firestore pour les
  données, Authentication pour les comptes. Hébergement gratuit.
- **Comptes simples** : prénom + mot de passe, sans e-mail. Fabrique une adresse
  technique à partir du prénom si Firebase en réclame une.
- **Temps réel** : quand l'animateur clôture, les écrans des stagiaires suivent
  sans recharger.
- Le SDK est **embarqué dans le projet**, pas chargé depuis un CDN.
- **Un vote n'est annoncé comme enregistré qu'une fois confirmé par le serveur.**
  Sur un téléphone en Wi-Fi capricieux, un vote perdu silencieusement serait le
  pire des bugs : distingue « envoi en cours » et « enregistré ».
- **Adresse courte et dictable** à voix haute devant un groupe.

Mon projet Firebase existe déjà, tu peux t'y brancher directement :

```js
const firebaseConfig = {
  apiKey: "AIzaSyBs3uMkDmhPGOtTDP-scxWRw6B_EQ5P87Y",
  authDomain: "secret-bafa-7ba35.firebaseapp.com",
  projectId: "secret-bafa-7ba35",
  storageBucket: "secret-bafa-7ba35.firebasestorage.app",
  messagingSenderId: "129771006978",
  appId: "1:129771006978:web:7684e9ce1ed4969b180b1b"
};
```

Ces valeurs ne sont pas des secrets : elles désignent publiquement le projet.
Ce sont les règles de sécurité qui protègent les données.

---

## COMMENT JE VEUX QU'ON TRAVAILLE

- **Montre-moi le résultat, ne me le raconte pas.** Publie, envoie-moi un lien
  ou une capture. Je ne peux rien juger sur une description.
- **Dis-moi franchement ce que tu ne peux pas faire.** Je préfère un obstacle
  annoncé à une promesse tenue à moitié.
- **Guide-moi pas à pas** quand une manipulation m'incombe : un seul geste à la
  fois, avec le lien direct, et attends que je confirme avant la suite.
- Je ne suis pas développeur. Explique les choix qui me concernent, épargne-moi
  le reste.
