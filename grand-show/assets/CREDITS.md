# Crédits des contenus (assets/)

Tous les fichiers livrés avec « Le Grand Show » sont libres de droits ou sous licence ouverte,
et fonctionnent hors ligne. Les noms de fichiers sont ceux utilisés dans `config.js`.

## Musiques — `assets/musiques/`

| Fichier | Contenu | Source | Auteur | Licence |
|---|---|---|---|---|
| `manche1.mp3` | « Joyeux anniversaire » (« Happy Birthday to You », mélodie de 1893) | Synthétisé par `outils/generer-musiques.py` | Mélodie : Patty & Mildred Hill — domaine public ; enregistrement : généré par ce projet | Domaine public (mélodie) / CC0 (rendu) |
| `manche2.mp3` | « Vive le vent » (« Jingle Bells », 1857) | idem | James Lord Pierpont — domaine public | Domaine public / CC0 |
| `manche3.mp3` | « Ode à la joie » (9ᵉ symphonie, 1824) | idem | Ludwig van Beethoven — domaine public | Domaine public / CC0 |
| `reserve1.mp3` | « Frère Jacques » (chanson traditionnelle) | idem | Traditionnel — domaine public | Domaine public / CC0 |
| `reserve2.mp3` | « Au clair de la lune » (chanson traditionnelle) | idem | Traditionnel — domaine public | Domaine public / CC0 |
| `reserve3.mp3` | « Pour Élise » (début, vers 1810) | idem | Ludwig van Beethoven — domaine public | Domaine public / CC0 |

Ces extraits (42 s, boîte à musique + basse + charleston) sont **générés par le script**
`outils/generer-musiques.py` : aucun enregistrement tiers n'est utilisé. Pour en refaire :
`python3 outils/generer-musiques.py` (nécessite `numpy` et `ffmpeg`).

## Images — `assets/images/`

Illustrations « Twemoji » (lion, éléphant, licorne, pingouin, requin, T-Rex, pieuvre, dragon).

- Source : https://github.com/jdecked/twemoji — distribuées via le paquet npm `@twemoji/svg` (v15.0.0)
- Auteur : Twitter, Inc. et contributeurs
- Licence : **CC-BY 4.0** — https://creativecommons.org/licenses/by/4.0/ (attribution obligatoire : cette page en tient lieu)

| Fichier | Emoji d'origine |
|---|---|
| `lion.svg` | 🦁 (1f981) |
| `elephant.svg` | 🐘 (1f418) |
| `licorne.svg` | 🦄 (1f984) |
| `pingouin.svg` | 🐧 (1f427) |
| `requin.svg` | 🦈 (1f988) |
| `trex.svg` | 🦖 (1f996) |
| `pieuvre.svg` | 🐙 (1f419) |
| `dragon.svg` | 🐉 (1f409) |

## Polices — `assets/fonts/`

| Fichier | Police | Auteur | Licence | Source |
|---|---|---|---|---|
| `LuckiestGuy-latin.woff2` | Luckiest Guy | Astigmatic | Apache 2.0 | https://fonts.google.com/specimen/Luckiest+Guy (via `@fontsource/luckiest-guy`) |
| `Nunito-latin-variable.woff2` | Nunito (variable) | Vernon Adams, Jacques Le Bailly, Manvel Shmavonyan, Alexei Vanyashin | SIL OFL 1.1 | https://fonts.google.com/specimen/Nunito (via `@fontsource-variable/nunito`) |

## Sons d'interface

Aucun fichier : bips, buzzer, fanfare, etc. sont générés par Web Audio (`js/core/sound.js`).
