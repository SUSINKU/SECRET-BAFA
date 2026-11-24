# Auto Retopo Character (Blender 4.2+, testé visé : dernière version)

Add-on de retopologie semi-automatique pour personnages animés.

## Pipeline
1. Copie de travail `<nom>_low` (l'original n'est jamais modifié)
2. Nettoyage : doublons, géométrie libre, normales, trous (+ voxel remesh optionnel)
3. QuadriFlow (intégré à Blender), symétrie X, faces cibles
4. Shrinkwrap + lissage pour recoller à l'original
5. UV (Smart UV Project)
6. Bake de la normal map (tangent space, Cycles) -> PNG dans le dossier de sortie

## Densité variable par pièces (v0.2)
Section « Pièces et densité » du panneau :
- **Pièces séparées** : chaque îlot déconnecté est remeshé à part.
- **Groupes de sommets** : en Edit Mode, sélectionne une zone (tête, corps, bras, jambes, cheveux...) et crée un groupe (Ctrl+G). Ajoute-le à la liste avec un multiplicateur de densité (ex. tête x3).
  Les faces cibles sont réparties selon surface x densité. Un sommet n'appartient qu'au premier groupe de la liste qui le contient.
- Les pièces sont ensuite fusionnées en un seul objet, mais **les jonctions ne sont pas soudées** : à raccorder à la main.
- Si QuadriFlow échoue sur une pièce, elle est simplifiée en triangles (avertissement affiché).

## Vers une vraie topologie de visage (v0.4, 100 % gratuit)
QuadriFlow ne sait pas où sont les yeux ou la bouche. Trois outils pour contrôler le flux des arêtes :
1. **Instant Meshes** (gratuit, externe, optionnel) : exporte l'objet en OBJ. Si le chemin de l'exécutable est renseigné dans les préférences de l'add-on, il est lancé et le résultat importé. Sinon, ouvre l'OBJ dans Instant Meshes, trace les guides (outil Orientation), exporte, et réimporte dans Blender.
2. **Retopo manuelle** : crée un objet collé sur le modèle (symétrie X, Shrinkwrap, accrochage aux faces, Poly Build). Place d'abord le curseur 3D sur le modèle.
3. **Gabarit de visage** : tête 100 % quads (cube-sphère) avec boucles autour des yeux, de la bouche et des oreilles, symétrique, ouverte au cou. Elle est placée en haut de l'objet actif. **Repères** : place le curseur 3D (Shift+clic droit) sur chaque œil puis sur la bouche, clique le bouton correspondant (un repère est créé), puis « Ajuster le gabarit aux repères » : position, rotation et échelle sont calculées pour que les yeux et la bouche du gabarit tombent dessus. Ensuite « Appliquer l'ajustement » (Shrinkwrap), et affine en Edit Mode avec l'édition proportionnelle. Le visage regarde vers -Y (réglable via Rotation Z).
   Le gabarit est une base de travail : les boucles sont des anneaux rectangulaires insérés dans une grille, pas une topologie de visage « de production ».

## Installation
Zipper le dossier `blender-auto-retopo` puis : Edit > Preferences > Get Extensions > Install from Disk.
Panneau : Vue 3D > touche N > onglet **Retopo**.

## Limites
- Pas de vrais edge loops pilotés (yeux, bouche, articulations) : à retoucher à la main.
- Personnage centré sur l'axe X pour la symétrie.
- Maillage très sale : utiliser « Voxel pre-remesh ».
- Code non encore testé dans Blender : signaler toute erreur.
