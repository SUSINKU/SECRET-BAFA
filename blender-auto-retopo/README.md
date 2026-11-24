# Auto Retopo Character (Blender 4.2+, testé visé : dernière version)

Add-on de retopologie semi-automatique pour personnages animés.

## Pipeline
1. Copie de travail `<nom>_low` (l'original n'est jamais modifié)
2. Nettoyage : doublons, géométrie libre, normales, trous (+ voxel remesh optionnel)
3. QuadriFlow (intégré à Blender), symétrie X, faces cibles
4. Shrinkwrap + lissage pour recoller à l'original
5. UV (Smart UV Project)
6. Bake de la normal map (tangent space, Cycles) -> PNG dans le dossier de sortie

## Installation
Zipper le dossier `blender-auto-retopo` puis : Edit > Preferences > Get Extensions > Install from Disk.
Panneau : Vue 3D > touche N > onglet **Retopo**.

## Limites
- Pas de vrais edge loops pilotés (yeux, bouche, articulations) : à retoucher à la main.
- Personnage centré sur l'axe X pour la symétrie.
- Maillage très sale : utiliser « Voxel pre-remesh ».
- Code non encore testé dans Blender : signaler toute erreur.
