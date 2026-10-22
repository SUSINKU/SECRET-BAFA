/*
 * ============================================================================
 *  LE GRAND SHOW — CONFIGURATION
 *  Tout le contenu modifiable de l'animation est ici : vous n'avez pas à toucher
 *  au reste du code. Enregistrez le fichier puis rechargez la page (F5).
 *  Si un champ est manquant ou mal formé, un bandeau ⚠️ s'affiche dans la régie
 *  et le détail est écrit dans la console (F12) ; l'appli continue de fonctionner.
 * ============================================================================
 */
window.GRAND_SHOW_CONFIG = {

  // Titre affiché sur l'accueil.
  titre: 'LE GRAND SHOW',

  // Équipes : de 2 à 4. `nom` = texte du badge, `couleur` = couleur néon (format #rrggbb).
  equipes: [
    { nom: 'Équipe Rouge', couleur: '#ff3b5c' },
    { nom: 'Équipe Bleue', couleur: '#3b9cff' },
    { nom: 'Équipe Verte', couleur: '#2ee872' }
  ],

  // Boutons de points affichés sur chaque badge (valeurs négatives = points retirés).
  // Les raccourcis clavier « + » et « - » utilisent la première valeur positive et la première négative.
  points: [50, 100, -50],

  // false = aucun son d'interface (bips, buzzer, fanfare). La musique du blind test n'est pas concernée.
  sons: true,

  jeux: {

    // ------------------------------------------------------------------ JEU 1
    blindtest: {
      titre: 'Le Blind Test Musical',
      duree: 30,                       // durée du chrono par manche, en secondes
      // Manches de la partie 1. Chaque manche :
      //   fichier : chemin du MP3 (dossier assets/musiques/)
      //   debut   : seconde où démarre l'extrait (pour tomber sur le refrain)
      //   reponse : texte révélé à la télé
      //   indice  : (facultatif) petit indice pour l'animateur, affiché dans la régie
      manches: [
        { fichier: 'assets/musiques/manche1.mp3', debut: 0, reponse: 'Joyeux anniversaire', indice: 'On la chante aux gâteaux avec des bougies' },
        { fichier: 'assets/musiques/manche2.mp3', debut: 0, reponse: 'Vive le vent (Jingle Bells)', indice: 'Chanson de Noël, avec des grelots' },
        { fichier: 'assets/musiques/manche3.mp3', debut: 0, reponse: 'L\'Ode à la joie (Beethoven)', indice: 'Le grand classique de la 9e symphonie' }
      ],
      // Manches de réserve pour une deuxième partie (bouton « Partie 2 » dans la régie).
      reserve: [
        { fichier: 'assets/musiques/reserve1.mp3', debut: 0, reponse: 'Frère Jacques', indice: 'Dormez-vous ?' },
        { fichier: 'assets/musiques/reserve2.mp3', debut: 0, reponse: 'Au clair de la lune', indice: 'Pierrot prête sa plume' },
        { fichier: 'assets/musiques/reserve3.mp3', debut: 0, reponse: 'Pour Élise (Beethoven)', indice: 'Piano classique très célèbre' }
      ]
      // Ajouter vos propres musiques : copiez vos MP3 dans assets/musiques/ puis ajoutez une ligne
      // { fichier: 'assets/musiques/mon-titre.mp3', debut: 45, reponse: 'Titre - Artiste' }
    },

    // ------------------------------------------------------------------ JEU 2
    defloutage: {
      titre: 'Le Défloutage Mystère',
      duree: 20,                       // durée du défloutage, en secondes
      flouMax: 50,                     // flou de départ, en pixels (50 = illisible)
      // Chaque manche :
      //   image         : chemin de l'image (dossier assets/images/), JPG, PNG, SVG ou WebP
      //   emojiSecours  : affiché en géant si l'image est absente
      //   reponse       : nom révélé
      manches: [
        { image: 'assets/images/lion.svg', emojiSecours: '🦁', reponse: 'Le lion' },
        { image: 'assets/images/elephant.svg', emojiSecours: '🐘', reponse: 'L\'éléphant' },
        { image: 'assets/images/licorne.svg', emojiSecours: '🦄', reponse: 'La licorne' }
      ],
      reserve: [
        { image: 'assets/images/pingouin.svg', emojiSecours: '🐧', reponse: 'Le pingouin' },
        { image: 'assets/images/requin.svg', emojiSecours: '🦈', reponse: 'Le requin' },
        { image: 'assets/images/trex.svg', emojiSecours: '🦖', reponse: 'Le T-Rex' },
        { image: 'assets/images/pieuvre.svg', emojiSecours: '🐙', reponse: 'La pieuvre' },
        { image: 'assets/images/dragon.svg', emojiSecours: '🐉', reponse: 'Le dragon' }
      ]
    },

    // ------------------------------------------------------------------ JEU 3
    lynx: {
      titre: 'L\'Œil de Lynx',
      duree: 45,                       // durée du chrono par manche, en secondes
      densite: 250,                    // nombre d'éléments « pièges » dans la scène (200 à 300 conseillé)
      // Chaque manche : 3 cibles { emoji, libelle } à trouver dans la scène.
      // Option : utiliser une vraie image « cherche et trouve » au lieu de la scène générée :
      //   image : 'assets/images/ma-scene.jpg'
      //   zones : position de chaque cible dans l'image, en coordonnées 0 à 1 (x, y = centre, r = rayon
      //           en part de la largeur), dans le même ordre que `cibles`. Exemple : { x: 0.25, y: 0.6, r: 0.03 }
      manches: [
        { cibles: [
          { emoji: '🦄', libelle: 'Une licorne' },
          { emoji: '🍕', libelle: 'Une pizza' },
          { emoji: '🚀', libelle: 'Une fusée' } ] },
        { cibles: [
          { emoji: '🦖', libelle: 'Un T-Rex' },
          { emoji: '⛵', libelle: 'Un voilier' },
          { emoji: '🍩', libelle: 'Un beignet' } ] }
      ]
    },

    // ------------------------------------------------------------------ JEU 4
    dessin: {
      titre: 'Le Dessin Flash',
      duree: 60,                       // durée du chrono par dessin, en secondes
      // Mots à faire deviner, par niveau de difficulté (EN MAJUSCULES). Ajoutez-en autant que voulu.
      mots: {
        facile: [
          'DRAGON', 'LICORNE', 'PIRATE', 'FUSÉE', 'PIZZA', 'ROBOT', 'FANTÔME', 'CHÂTEAU', 'REQUIN', 'VOLCAN',
          'SOLEIL', 'MAISON', 'CHAT', 'POISSON', 'VOITURE', 'FLEUR', 'BATEAU', 'GLACE', 'BONHOMME DE NEIGE', 'AVION'
        ],
        moyen: [
          'SPIDERMAN', 'DINOSAURE', 'SIRÈNE', 'SORCIÈRE', 'ARC-EN-CIEL', 'ASTRONAUTE', 'VAMPIRE', 'CHEVALIER',
          'HÉLICOPTÈRE', 'CROCODILE', 'PERROQUET', 'PÈRE NOËL', 'TRAMPOLINE', 'CAMPING', 'SKATEBOARD', 'TORTUE'
        ],
        difficile: [
          'MONTGOLFIÈRE', 'SOUS-MARIN', 'BIBLIOTHÈQUE', 'ANNIVERSAIRE', 'TREMBLEMENT DE TERRE', 'PARACHUTE',
          'LABYRINTHE', 'MAGICIEN', 'CHASSE AU TRÉSOR', 'FEU D\'ARTIFICE', 'TÉLESCOPE', 'ÉQUILIBRISTE'
        ]
      }
    }
  }
};
