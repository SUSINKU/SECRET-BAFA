#!/usr/bin/env python3
"""
Assemble TOUT le jeu dans un seul fichier : le-grand-show.html
(CSS, JavaScript, polices, images et musiques intégrés ; aucun autre fichier nécessaire).

Usage :  python3 outils/construire-html.py
Nécessite python3 ; ffmpeg est utilisé (s'il est installé) pour alléger les MP3.

Ouvrir le fichier produit :
  - écran unique :  le-grand-show.html
  - double écran :  le bouton « Ouvrir la régie » ouvre le même fichier avec ?regie=1
"""
import base64
import re
import subprocess
import sys
import tempfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "le-grand-show.html"
TYPES = {".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".webp": "image/webp", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
         ".woff2": "font/woff2"}


def data_uri(chemin, octets=None):
    octets = octets if octets is not None else chemin.read_bytes()
    return "data:%s;base64,%s" % (TYPES[chemin.suffix.lower()], base64.b64encode(octets).decode("ascii"))


def alleger_mp3(chemin):
    """MP3 mono 64 kb/s : largement suffisant pour un blind test, 2 fois plus léger."""
    with tempfile.TemporaryDirectory() as tmp:
        cible = Path(tmp) / "a.mp3"
        try:
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(chemin), "-ac", "1",
                            "-codec:a", "libmp3lame", "-b:a", "64k", str(cible)], check=True)
            return cible.read_bytes()
        except (OSError, subprocess.CalledProcessError):
            return chemin.read_bytes()


def css_avec_polices():
    css = (RACINE / "css" / "style.css").read_text(encoding="utf-8")

    def remplacer(m):
        police = (RACINE / "css" / m.group(1)).resolve()
        return 'url("%s")' % data_uri(police)

    return re.sub(r'url\("(\.\./assets/fonts/[^"]+)"\)', remplacer, css)


def scripts_dans_l_ordre():
    html = (RACINE / "index.html").read_text(encoding="utf-8")
    return re.findall(r'<script src="([^"]+)"></script>', html)


def bloc_ressources():
    lignes = []
    for dossier in ("assets/images", "assets/musiques"):
        for f in sorted((RACINE / dossier).glob("*")):
            if f.suffix.lower() not in TYPES:
                continue
            octets = alleger_mp3(f) if f.suffix.lower() == ".mp3" else None
            lignes.append('  "%s": "%s"' % (f.relative_to(RACINE).as_posix(), data_uri(f, octets)))
    return "window.GRAND_SHOW_ASSETS = {\n" + ",\n".join(lignes) + "\n};"


def main():
    scripts = scripts_dans_l_ordre()
    parties = []
    for src in scripts:
        code = (RACINE / src).read_text(encoding="utf-8")
        if "</script" in code.lower():
            sys.exit("Le fichier %s contient '</script' : impossible de l'intégrer tel quel." % src)
        # Les ressources embarquées doivent exister avant le démarrage (app.js est le dernier script)
        if src == "js/app.js":
            parties.append(("Ressources embarquées (musiques, images)", bloc_ressources()))
        parties.append((src, code))

    favicon = ('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E'
               '%3Ctext y=%27.9em%27 font-size=%2790%27%3E%F0%9F%8E%AE%3C/text%3E%3C/svg%3E')
    sortie = ['<!DOCTYPE html>',
              '<html lang="fr">',
              '<head>',
              '<meta charset="utf-8">',
              '<meta name="viewport" content="width=device-width, initial-scale=1">',
              '<title>Le Grand Show</title>',
              '<link rel="icon" href="%s">' % favicon,
              '<style>', css_avec_polices(), '</style>',
              '</head>',
              '<body data-page="unique">',
              '<noscript>Le Grand Show a besoin de JavaScript pour fonctionner.</noscript>']
    for nom, code in parties:
        sortie += ['<script>', '/* ===== %s ===== */' % nom, code, '</script>']
    sortie += ['</body>', '</html>', '']
    SORTIE.write_text("\n".join(sortie), encoding="utf-8")
    print("OK : %s (%.1f Mo)" % (SORTIE.name, SORTIE.stat().st_size / 1e6))


if __name__ == "__main__":
    main()
