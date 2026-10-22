#!/usr/bin/env python3
"""
Génère les extraits du blind test d'exemple (assets/musiques/*.mp3).

Ce sont des mélodies du DOMAINE PUBLIC, synthétisées ici (aucun enregistrement
tiers, aucun droit à payer). Nécessite : python3, numpy et ffmpeg (libmp3lame).

Usage :  python3 outils/generer-musiques.py
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 32000
DOSSIER = Path(__file__).resolve().parent.parent / "assets" / "musiques"

# Hauteurs en demi-tons au-dessus du La 440 Hz
NOTES = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}


def hauteur(nom):
    """'C4' -> fréquence en Hz ; 'F#4' / 'Bb3' acceptés ; 'R' = silence."""
    if nom == "R":
        return None
    lettre, reste = nom[0], nom[1:]
    alteration = 0
    if reste and reste[0] in "#b":
        alteration = 1 if reste[0] == "#" else -1
        reste = reste[1:]
    octave = int(reste)
    demi = NOTES[lettre] + alteration + 12 * (octave - 4)
    return 440.0 * 2 ** (demi / 12)


def note(freq, duree, volume=0.5, timbre="boite"):
    """Une note : somme d'harmoniques à décroissance rapide (son de boîte à musique)."""
    n = int(SR * duree)
    t = np.arange(n) / SR
    if freq is None:
        return np.zeros(n)
    if timbre == "basse":
        son = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t)
        env = np.minimum(1, t / 0.01) * np.exp(-t * 2.2)
    else:
        son = (np.sin(2 * np.pi * freq * t)
               + 0.45 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 6)
               + 0.25 * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t * 9)
               + 0.12 * np.sin(2 * np.pi * 4.01 * freq * t) * np.exp(-t * 14))
        env = np.minimum(1, t / 0.005) * np.exp(-t * 3.2)
    fin = np.minimum(1, (duree - t) / 0.03)  # évite les clics en fin de note
    return volume * son * env * np.clip(fin, 0, 1)


def charleston(duree):
    """Petit bruit court pour marquer le temps."""
    n = int(SR * duree)
    t = np.arange(n) / SR
    bruit = np.random.default_rng(7).standard_normal(n)
    bruit = np.diff(bruit, prepend=0)  # passe-haut grossier
    return 0.10 * bruit * np.exp(-t * 60)


def rendre(melodie, accords, bpm, duree_cible, temps_par_mesure=4):
    """melodie : liste (note, durée en temps). accords : une basse par mesure."""
    spb = 60.0 / bpm
    total_temps = sum(d for _, d in melodie)
    nb = int(duree_cible / (total_temps * spb)) + 1
    n_total = int(SR * (total_temps * spb * nb + 1.5))
    piste = np.zeros(n_total)
    pos_temps = 0.0
    for _ in range(nb):
        for nom, d in melodie:
            debut = int(pos_temps * spb * SR)
            s = note(hauteur(nom), d * spb * 1.25, 0.5)
            piste[debut:debut + len(s)] += s[:n_total - debut]
            pos_temps += d
    # accompagnement : basse sur le premier temps de chaque mesure + charleston
    nb_mesures = int(pos_temps / temps_par_mesure)
    for m in range(nb_mesures):
        base = accords[m % len(accords)]
        debut = int(m * temps_par_mesure * spb * SR)
        s = note(hauteur(base), temps_par_mesure * spb * 0.95, 0.30, "basse")
        piste[debut:debut + len(s)] += s[:n_total - debut]
        for b in range(temps_par_mesure):
            deb = int((m * temps_par_mesure + b) * spb * SR)
            h = charleston(0.08)
            piste[deb:deb + len(h)] += h[:n_total - deb]
    # coupe proprement à la durée cible avec une petite descente de volume
    n_cible = int(duree_cible * SR)
    piste = piste[:n_cible]
    descente = int(0.6 * SR)
    piste[-descente:] *= np.linspace(1, 0, descente)
    pic = np.max(np.abs(piste))
    return (piste / pic * 0.85) if pic > 0 else piste


def ecrire_mp3(signal, chemin):
    wav = chemin.with_suffix(".wav")
    with wave.open(str(wav), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((signal * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
                    "-codec:a", "libmp3lame", "-b:a", "96k", str(chemin)], check=True)
    wav.unlink()


def parse(txt):
    """'C4:1 D4:0.5 R:1' -> [('C4', 1.0), ('D4', 0.5), ('R', 1.0)]"""
    sortie = []
    for jeton in txt.split():
        nom, d = jeton.split(":")
        sortie.append((nom, float(d)))
    return sortie


MORCEAUX = {
    # --- Manches principales ---
    "manche1": dict(  # Joyeux anniversaire (3/4)
        bpm=112, tpm=3,
        melodie="G4:.75 G4:.25 A4:1 G4:1 C5:1 B4:2 R:1 "
                "G4:.75 G4:.25 A4:1 G4:1 D5:1 C5:2 R:1 "
                "G4:.75 G4:.25 G5:1 E5:1 C5:1 B4:1 A4:1 "
                "F5:.75 F5:.25 E5:1 C5:1 D5:1 C5:2 R:1",
        basses="C3 C3 G2 C3 C3 C3 C3 F3 C3 G2 C3 C3".split()),
    "manche2": dict(  # Vive le vent (Jingle Bells)
        bpm=132, tpm=4,
        melodie="E4:1 E4:1 E4:2 E4:1 E4:1 E4:2 E4:1 G4:1 C4:1.5 D4:.5 E4:4 "
                "F4:1 F4:1 F4:1.5 F4:.5 F4:1 E4:1 E4:1 E4:.5 E4:.5 E4:1 D4:1 D4:1 E4:1 D4:2 G4:2",
        basses="C3 C3 C3 C3 F3 C3 G2 C3".split()),
    "manche3": dict(  # Ode à la joie
        bpm=120, tpm=4,
        melodie="E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:.5 D4:2 "
                "E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:.5 C4:2",
        basses="C3 C3 G2 C3 C3 C3 G2 C3".split()),
    # --- Manches de réserve ---
    "reserve1": dict(  # Frère Jacques
        bpm=118, tpm=4,
        melodie="C4:1 D4:1 E4:1 C4:1 C4:1 D4:1 E4:1 C4:1 E4:1 F4:1 G4:2 E4:1 F4:1 G4:2 "
                "G4:.5 A4:.5 G4:.5 F4:.5 E4:1 C4:1 G4:.5 A4:.5 G4:.5 F4:.5 E4:1 C4:1 "
                "C4:1 G3:1 C4:2 C4:1 G3:1 C4:2",
        basses="C3 C3 C3 C3 C3 C3 C3 C3 C3 C3".split()),
    "reserve2": dict(  # Au clair de la lune
        bpm=108, tpm=4,
        melodie="C4:1 C4:1 C4:1 D4:1 E4:2 D4:2 C4:1 E4:1 D4:1 D4:1 C4:4 "
                "C4:1 C4:1 C4:1 D4:1 E4:2 D4:2 C4:1 E4:1 D4:1 D4:1 C4:4",
        basses="C3 C3 G2 C3 C3 C3 G2 C3".split()),
    "reserve3": dict(  # Pour Élise (début)
        bpm=132, tpm=3,
        melodie="E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 R:.5 "
                "C4:.5 E4:.5 A4:.5 B4:1.5 R:.5 E4:.5 G#4:.5 B4:.5 C5:1.5 R:.5 "
                "E4:.5 E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 R:.5 "
                "C4:.5 E4:.5 A4:.5 B4:1.5 R:.5 E4:.5 C5:.5 B4:.5 A4:2",
        basses="A2 A2 E3 A2 A2 A2 E3 A2".split()),
}


def main():
    DOSSIER.mkdir(parents=True, exist_ok=True)
    for nom, p in MORCEAUX.items():
        signal = rendre(parse(p["melodie"]), p["basses"], p["bpm"], 42, p["tpm"])
        ecrire_mp3(signal, DOSSIER / f"{nom}.mp3")
        print("OK", nom)


if __name__ == "__main__":
    sys.exit(main())
