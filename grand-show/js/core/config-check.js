/*
 * Lecture et validation de config.js.
 * Un champ manquant ou mal formé est remplacé par une valeur par défaut et signalé
 * (console + bandeau dans la régie) : l'application ne plante jamais à cause de la config.
 */
(function (GS) {
  'use strict';

  const PAR_DEFAUT = {
    titre: 'LE GRAND SHOW',
    equipes: [
      { nom: 'Équipe Rouge', couleur: '#ff3b5c' },
      { nom: 'Équipe Bleue', couleur: '#3b9cff' },
      { nom: 'Équipe Verte', couleur: '#2ee872' }
    ],
    points: [50, 100, -50],
    sons: true,
    durees: { blindtest: 30, defloutage: 20, lynx: 45, dessin: 60 },
    flouMax: 50,
    densite: 250
  };

  GS.configProblemes = [];

  function signaler(message) { GS.configProblemes.push(message); }

  function nombre(val, defaut, chemin, min, max) {
    if (val === undefined) return defaut;
    if (typeof val !== 'number' || !isFinite(val) || val < min || val > max) {
      signaler(chemin + ' doit être un nombre entre ' + min + ' et ' + max + ' (reçu : ' + JSON.stringify(val) + '). Valeur par défaut utilisée : ' + defaut + '.');
      return defaut;
    }
    return val;
  }

  function texte(val, defaut, chemin) {
    if (typeof val === 'string' && val.trim()) return val;
    if (val !== undefined) signaler(chemin + ' doit être un texte non vide.');
    return defaut;
  }

  function liste(val, chemin, minimum) {
    if (!Array.isArray(val)) {
      signaler(chemin + ' est manquant ou n\'est pas une liste [ … ].');
      return [];
    }
    if (val.length < minimum) signaler(chemin + ' devrait contenir au moins ' + minimum + ' élément(s).');
    return val;
  }

  function equipes(brut) {
    const l = Array.isArray(brut) ? brut : [];
    if (!Array.isArray(brut)) signaler('equipes est manquant ou n\'est pas une liste. Équipes par défaut utilisées.');
    const ok = [];
    l.forEach(function (e, i) {
      const chemin = 'equipes[' + i + ']';
      if (!e || typeof e !== 'object') { signaler(chemin + ' doit être { nom, couleur }.'); return; }
      const couleur = /^#[0-9a-f]{6}$/i.test(e.couleur || '') ? e.couleur : null;
      if (!couleur) signaler(chemin + '.couleur doit être au format #rrggbb (reçu : ' + JSON.stringify(e.couleur) + ').');
      ok.push({ nom: texte(e.nom, 'Équipe ' + (i + 1), chemin + '.nom'), couleur: couleur || PAR_DEFAUT.equipes[i % 3].couleur });
    });
    if (ok.length < 2 || ok.length > 4) {
      if (l.length) signaler('Il faut entre 2 et 4 équipes (' + ok.length + ' trouvée(s)). Équipes par défaut utilisées.');
      return GS.copie(PAR_DEFAUT.equipes);
    }
    return ok;
  }

  function manchesBlindtest(l, chemin) {
    const ok = [];
    l.forEach(function (m, i) {
      const c = chemin + '[' + i + ']';
      if (!m || typeof m.fichier !== 'string' || !m.fichier) { signaler(c + '.fichier est manquant (chemin du MP3).'); return; }
      ok.push({
        fichier: m.fichier,
        debut: nombre(m.debut, 0, c + '.debut', 0, 36000),
        reponse: texte(m.reponse, '(réponse non renseignée)', c + '.reponse'),
        indice: typeof m.indice === 'string' ? m.indice : ''
      });
    });
    return ok;
  }

  function manchesDefloutage(l, chemin) {
    const ok = [];
    l.forEach(function (m, i) {
      const c = chemin + '[' + i + ']';
      if (!m || typeof m !== 'object') { signaler(c + ' doit être { image, emojiSecours, reponse }.'); return; }
      ok.push({
        image: typeof m.image === 'string' ? m.image : '',
        emojiSecours: texte(m.emojiSecours, '❓', c + '.emojiSecours'),
        reponse: texte(m.reponse, '(réponse non renseignée)', c + '.reponse')
      });
    });
    return ok;
  }

  function manchesLynx(l, chemin) {
    const ok = [];
    l.forEach(function (m, i) {
      const c = chemin + '[' + i + ']';
      if (!m || !Array.isArray(m.cibles) || m.cibles.length !== 3) { signaler(c + '.cibles doit contenir exactement 3 éléments { emoji, libelle }.'); return; }
      const cibles = m.cibles.map(function (cb, k) {
        return { emoji: texte(cb && cb.emoji, '❓', c + '.cibles[' + k + '].emoji'), libelle: texte(cb && cb.libelle, 'Élément ' + (k + 1), c + '.cibles[' + k + '].libelle') };
      });
      let image = typeof m.image === 'string' && m.image ? m.image : '';
      let zones = null;
      if (image) {
        const zonesOk = Array.isArray(m.zones) && m.zones.length === 3 && m.zones.every(function (z) {
          return z && ['x', 'y', 'r'].every(function (k) { return typeof z[k] === 'number' && z[k] >= 0 && z[k] <= 1; });
        });
        if (zonesOk) zones = m.zones;
        else { signaler(c + '.zones doit contenir 3 zones { x, y, r } entre 0 et 1 quand `image` est utilisée. Scène générée utilisée à la place.'); image = ''; }
      }
      ok.push({ cibles: cibles, image: image, zones: zones });
    });
    return ok;
  }

  function mots(brut) {
    const niveaux = { facile: [], moyen: [], difficile: [] };
    if (Array.isArray(brut)) niveaux.moyen = brut.slice();
    else if (brut && typeof brut === 'object') {
      Object.keys(niveaux).forEach(function (k) { if (Array.isArray(brut[k])) niveaux[k] = brut[k].slice(); });
    } else signaler('jeux.dessin.mots est manquant (liste ou { facile, moyen, difficile }).');
    Object.keys(niveaux).forEach(function (k) {
      niveaux[k] = niveaux[k].filter(function (w) { return typeof w === 'string' && w.trim(); }).map(function (w) { return w.trim().toUpperCase(); });
    });
    const total = niveaux.facile.length + niveaux.moyen.length + niveaux.difficile.length;
    if (total === 0) { signaler('Aucun mot pour le dessin : mots d\'exemple utilisés.'); niveaux.facile = ['SOLEIL', 'MAISON', 'CHAT', 'DRAGON']; }
    else if (total < 40) signaler('Le dessin contient seulement ' + total + ' mots (40 conseillés pour éviter les répétitions).');
    return niveaux;
  }

  /** Construit GS.config à partir de window.GRAND_SHOW_CONFIG. */
  GS.chargerConfig = function () {
    GS.configProblemes = [];
    let brut = window.GRAND_SHOW_CONFIG;
    if (!brut || typeof brut !== 'object') {
      signaler('config.js est introuvable ou invalide (window.GRAND_SHOW_CONFIG manquant). Configuration par défaut utilisée.');
      brut = {};
    }
    const jeux = (brut.jeux && typeof brut.jeux === 'object') ? brut.jeux : {};
    if (!brut.jeux) signaler('Le bloc `jeux` est manquant.');
    const bt = jeux.blindtest || {}, df = jeux.defloutage || {}, lx = jeux.lynx || {}, ds = jeux.dessin || {};
    ['blindtest', 'defloutage', 'lynx', 'dessin'].forEach(function (id) { if (!jeux[id]) signaler('jeux.' + id + ' est manquant.'); });

    let points = Array.isArray(brut.points) && brut.points.length && brut.points.every(function (p) { return typeof p === 'number' && isFinite(p) && p !== 0; })
      ? brut.points.slice(0, 5) : null;
    if (!points) { if (brut.points !== undefined) signaler('points doit être une liste de nombres non nuls, ex. [50, 100, -50].'); points = PAR_DEFAUT.points.slice(); }

    const cfg = {
      titre: texte(brut.titre, PAR_DEFAUT.titre, 'titre'),
      equipes: equipes(brut.equipes),
      points: points,
      sons: brut.sons !== false,
      jeux: {
        blindtest: {
          titre: texte(bt.titre, 'Le Blind Test Musical', 'jeux.blindtest.titre'),
          duree: nombre(bt.duree, PAR_DEFAUT.durees.blindtest, 'jeux.blindtest.duree', 5, 600),
          manches: manchesBlindtest(liste(bt.manches, 'jeux.blindtest.manches', 1), 'jeux.blindtest.manches'),
          reserve: manchesBlindtest(Array.isArray(bt.reserve) ? bt.reserve : [], 'jeux.blindtest.reserve')
        },
        defloutage: {
          titre: texte(df.titre, 'Le Défloutage Mystère', 'jeux.defloutage.titre'),
          duree: nombre(df.duree, PAR_DEFAUT.durees.defloutage, 'jeux.defloutage.duree', 5, 600),
          flouMax: nombre(df.flouMax, PAR_DEFAUT.flouMax, 'jeux.defloutage.flouMax', 5, 120),
          manches: manchesDefloutage(liste(df.manches, 'jeux.defloutage.manches', 1), 'jeux.defloutage.manches'),
          reserve: manchesDefloutage(Array.isArray(df.reserve) ? df.reserve : [], 'jeux.defloutage.reserve')
        },
        lynx: {
          titre: texte(lx.titre, 'L\'Œil de Lynx', 'jeux.lynx.titre'),
          duree: nombre(lx.duree, PAR_DEFAUT.durees.lynx, 'jeux.lynx.duree', 5, 600),
          densite: nombre(lx.densite, PAR_DEFAUT.densite, 'jeux.lynx.densite', 20, 600),
          manches: manchesLynx(liste(lx.manches, 'jeux.lynx.manches', 1), 'jeux.lynx.manches')
        },
        dessin: {
          titre: texte(ds.titre, 'Le Dessin Flash', 'jeux.dessin.titre'),
          duree: nombre(ds.duree, PAR_DEFAUT.durees.dessin, 'jeux.dessin.duree', 5, 600),
          niveaux: mots(ds.mots)
        }
      }
    };

    // Filets de sécurité : au moins une manche par jeu pour que l'interface reste utilisable
    if (!cfg.jeux.blindtest.manches.length) cfg.jeux.blindtest.manches.push({ fichier: 'assets/musiques/manche1.mp3', debut: 0, reponse: '(à configurer)', indice: '' });
    if (!cfg.jeux.defloutage.manches.length) cfg.jeux.defloutage.manches.push({ image: '', emojiSecours: '❓', reponse: '(à configurer)' });
    if (!cfg.jeux.lynx.manches.length) cfg.jeux.lynx.manches.push({ cibles: [{ emoji: '🦄', libelle: 'Une licorne' }, { emoji: '🍕', libelle: 'Une pizza' }, { emoji: '🚀', libelle: 'Une fusée' }], image: '', zones: null });

    GS.config = cfg;
    if (GS.configProblemes.length) {
      console.warn('[Grand Show] ' + GS.configProblemes.length + ' problème(s) dans config.js :\n - ' + GS.configProblemes.join('\n - '));
    }
    return cfg;
  };
})(window.GrandShow);
