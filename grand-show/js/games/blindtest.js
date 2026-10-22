/* Jeu 1 — Le Blind Test Musical : l'audio est joué par la télé, piloté par l'état partagé. */
(function (GS) {
  'use strict';

  const ID = 'blindtest';
  const C = GS.Chrono;
  const blobs = {};   // MP3 chargés à la volée : clé "partie:manche" -> URL d'objet

  function liste(cfg, partie) {
    const bt = cfg.jeux.blindtest;
    return partie === 1 && bt.reserve.length ? bt.reserve : bt.manches;
  }
  function cle(e) { return e.partie + ':' + e.manche; }
  function mancheCourante(e) { return liste(GS.config, e.partie)[e.manche] || liste(GS.config, 0)[0]; }
  function reponseDe(e) { const s = e.surcharges[cle(e)]; return s ? s : mancheCourante(e).reponse; }
  function urlDe(e) { return blobs[cle(e)] || GS.asset(mancheCourante(e).fichier); }
  function debutDe(e) { return blobs[cle(e)] ? 0 : mancheCourante(e).debut; }

  GS.sync.sur('bt-mp3', function (d) {
    if (d && d.blob instanceof Blob) { blobs[d.cle] = URL.createObjectURL(d.blob); if (GS.core.state) GS.core.rendre(); }
  });

  GS.enregistrerJeu({
    id: ID, numero: 1, emoji: '🎵', couleur: '#ff4fd8',
    titre: function (cfg) { return cfg.jeux.blindtest.titre; },
    info: function (cfg) { return cfg.jeux.blindtest.manches.length + ' manches · ' + cfg.jeux.blindtest.duree + ' s'; },

    etatInitial: function (cfg) {
      return { manche: 0, partie: 0, revele: false, surcharges: {}, chrono: C.creer(cfg.jeux.blindtest.duree) };
    },
    quitter: function (e) { C.pause(e.chrono); },

    reduire: function (e, action, p, ctx) {
      const total = liste(ctx.config, e.partie).length;
      switch (action) {
        case 'basculer':
          if (e.revele || C.termine(e.chrono)) return false;
          if (e.chrono.running) C.pause(e.chrono); else C.demarrer(e.chrono);
          return true;
        case 'reveler':
          if (e.revele) return false;
          C.pause(e.chrono); e.revele = true; ctx.fx('fanfare');
          return true;
        case 'suivant':
          e.manche = GS.mancheSuivante(e.manche, total);
          e.revele = false; C.reinitialiser(e.chrono);
          return true;
        case 'rejouer':
          e.revele = false; C.reinitialiser(e.chrono);
          return true;
        case 'partie':
          if (!ctx.config.jeux.blindtest.reserve.length) return false;
          e.partie = e.partie === 1 ? 0 : 1; e.manche = 0; e.revele = false; C.reinitialiser(e.chrono);
          return true;
        case 'surcharge':
          e.surcharges[p.cle] = String(p.reponse || '').slice(0, 120);
          return true;
        default: return false;
      }
    },

    touches: {
      principal: function () { return ['basculer']; },
      reveler: function () { return ['reveler']; },
      suivant: function () { return ['suivant']; }
    },

    monter: function (racine, contexte) {
      const aTele = contexte.mode !== 'regie';
      const aControles = contexte.mode !== 'display';
      const regie = contexte.mode === 'regie';
      const agir = function (action, payload) { GS.core.agir(ID, action, payload); };
      let dernier = null, dernierGlobal = null, actif = false, bloque = false, manque = false;
      const audio = new Audio();
      audio.preload = 'auto';

      // ---------- Écran public ----------
      const vue = C.vue({ classe: 'geant', bips: true });
      let pastille = null, vinyle = null, boiteReponse = null, texteReponse = null, messageErreur = null;
      if (aTele) {
        pastille = GS.pastilleManche();
        const notes = [];
        for (let i = 0; i < 9; i++) {
          notes.push(GS.el('span', { class: 'note', 'aria-hidden': 'true', style: { '--dx': (i * 11 - 44) + '%', '--delai': (i * 0.45) + 's', '--taille': (3 + (i % 3)) + 'vh' } }, i % 2 ? '♫' : '♪'));
        }
        vinyle = GS.el('div', { class: 'vinyle' },
          GS.el('div', { class: 'vinyle-sillons' }),
          GS.el('div', { class: 'vinyle-reflet' }),
          GS.el('div', { class: 'vinyle-etiquette' }, GS.el('span', null, '♪')));
        texteReponse = GS.el('div', { class: 'reponse-texte' });
        boiteReponse = GS.el('div', { class: 'boite-reponse', 'aria-live': 'polite' }, GS.el('div', { class: 'reponse-titre' }, 'La réponse était'), texteReponse);
        messageErreur = GS.el('div', { class: 'message-erreur', hidden: true });
        const tele = GS.el('div', { class: 'jeu-tv jeu-bt' },
          pastille,
          GS.el('div', { class: 'scene-bt' }, vinyle, GS.el('div', { class: 'notes' }, notes)),
          boiteReponse, messageErreur,
          GS.el('div', { class: 'zone-chrono' }, vue.el),
          vue.surimpression);
        racine.appendChild(tele);
      }

      // ---------- Contrôles ----------
      let bLecture, bReveler, bSuivant, bPartie, infoSecrete, volume, etatFichier, vueRegie = null;
      if (aControles) {
        bLecture = GS.bouton('▶️ Lancer la musique', function () { agir('basculer'); }, { classe: 'btn-vert' });
        bReveler = GS.bouton('👁️ Révéler la réponse', function () { agir('reveler'); }, { classe: 'btn-jaune' });
        bSuivant = GS.bouton('Suivant ➜', function () { agir('suivant'); }, { classe: 'btn-cyan' });
        const bRejouer = GS.bouton('⏮️ Rejouer l\'extrait', function () { agir('rejouer'); }, { classe: 'btn-gris btn-petit' });
        bPartie = GS.bouton('🔄 Partie 2', function () { agir('partie'); }, { classe: 'btn-gris btn-petit' });
        const entree = GS.el('input', { type: 'file', accept: 'audio/*', hidden: true, 'aria-label': 'Choisir un fichier MP3' });
        const bMp3 = GS.bouton('📁 Charger un MP3', function () { entree.click(); }, { classe: 'btn-gris btn-petit' });
        entree.addEventListener('change', function () {
          const f = entree.files && entree.files[0];
          entree.value = '';
          if (!f || !dernier) return;
          const reponse = window.prompt('Quelle est la réponse pour ce morceau ?', '');
          if (reponse === null) return;
          const k = cle(dernier);
          blobs[k] = URL.createObjectURL(f);
          if (regie) GS.sync.envoyer('bt-mp3', { cle: k, blob: f });
          agir('surcharge', { cle: k, reponse: reponse.trim() || '(sans titre)' });
          agir('rejouer');
        });
        volume = GS.el('input', { type: 'range', min: 0, max: 100, step: 5, 'aria-label': 'Volume de la musique', class: 'curseur-volume' });
        volume.addEventListener('input', function () { GS.core.agir('core', 'volume', { valeur: volume.value / 100 }); });
        etatFichier = GS.el('div', { class: 'etat-fichier' });
        infoSecrete = GS.el('div', { class: 'secret-regie' });
        const lignes = [
          GS.el('div', { class: 'rangee' }, bLecture, bReveler, bSuivant),
          GS.el('div', { class: 'rangee rangee-secondaire' }, bRejouer, bPartie, bMp3, entree,
            GS.el('label', { class: 'volume' }, '🔈', volume))
        ];
        if (regie) {
          vueRegie = C.vue({ classe: 'petit', bips: false });
          lignes.unshift(GS.el('div', { class: 'rangee regie-infos' }, infoSecrete, vueRegie.el));
          lignes.push(etatFichier);
        }
        racine.appendChild(GS.el('div', { class: 'controles' + (regie ? ' controles-regie' : '') }, lignes));
      }

      function labelLecture(phase) {
        return phase === 'marche' ? '⏸️ Pause' : phase === 'pause' ? '▶️ Reprendre' : '▶️ Lancer la musique';
      }

      // ---------- Audio (télé uniquement) ----------
      audio.addEventListener('error', function () {
        if (!audio.getAttribute('src')) return;
        manque = true; majErreur();
      });
      audio.addEventListener('loadedmetadata', function () { manque = false; majErreur(); });
      function majErreur() {
        if (!messageErreur) return;
        messageErreur.hidden = !(manque && actif);
        if (manque && dernier) messageErreur.textContent = '🎵 Fichier introuvable : ' + urlDe(dernier).replace(/^(blob|data):.*/, 'MP3 chargé (rechargez-le)');
      }
      function synchroniserAudio() {
        if (!aTele || !dernier) return;
        const e = dernier;
        const url = urlDe(e);
        if (audio.getAttribute('src') !== url) { audio.setAttribute('src', url); manque = false; majErreur(); }
        audio.volume = GS.clamp(dernierGlobal ? dernierGlobal.volume : 0.8, 0, 1);
        const veut = actif && e.chrono.running && !C.termine(e.chrono) && !e.revele;
        if (veut) {
          const cible = debutDe(e) + C.ecoule(e.chrono);
          if (audio.paused || Math.abs(audio.currentTime - cible) > 0.7) { try { audio.currentTime = cible; } catch (err) { /* métadonnées pas encore prêtes */ } }
          if (audio.paused) {
            const promesse = audio.play();
            if (promesse && promesse.catch) promesse.catch(function (err) {
              if (err && err.name === 'NotAllowedError') { bloque = true; if (GS.signalerSonBloque) GS.signalerSonBloque(true); }
              else if (err && err.name !== 'AbortError') { manque = true; majErreur(); }
            });
          } else if (bloque) { bloque = false; if (GS.signalerSonBloque) GS.signalerSonBloque(false); }
        } else if (!audio.paused) audio.pause();
      }

      function majBoutons() {
        if (!aControles || !dernier) return;
        const e = dernier, phase = C.phase(e.chrono);
        bLecture.textContent = labelLecture(phase);
        bLecture.disabled = e.revele || phase === 'fini';
        bReveler.disabled = e.revele;
        const total = liste(GS.config, e.partie).length;
        bSuivant.textContent = e.manche + 1 >= total ? '🔁 Recommencer' : 'Suivant ➜';
        bPartie.hidden = !GS.config.jeux.blindtest.reserve.length;
        bPartie.textContent = e.partie === 1 ? '🔄 Partie 1' : '🔄 Partie 2';
      }

      vue.surPhase = function () { synchroniserAudio(); majBoutons(); };
      if (vueRegie) vueRegie.surPhase = majBoutons;

      let urlSondee = '';
      function majRegie(e) {
        const m = mancheCourante(e);
        infoSecrete.textContent = '';
        infoSecrete.appendChild(GS.el('div', { class: 'secret-titre' }, '🤫 Réponse (secret)'));
        infoSecrete.appendChild(GS.el('div', { class: 'secret-valeur' }, reponseDe(e)));
        if (m.indice) infoSecrete.appendChild(GS.el('div', { class: 'secret-indice' }, 'Indice : ' + m.indice));
        const url = urlDe(e);
        if (url !== urlSondee) {
          urlSondee = url;
          etatFichier.textContent = '… vérification du fichier';
          GS.sonder(url, 'audio').then(function (ok) {
            if (url !== urlSondee) return;
            etatFichier.textContent = ok ? '✅ Fichier audio trouvé' : '⚠️ Fichier audio introuvable : ' + url;
            etatFichier.classList.toggle('erreur', !ok);
          });
        }
      }

      return {
        rendre: function (e, global) {
          dernier = e; dernierGlobal = global;
          const total = liste(GS.config, e.partie).length;
          vue.masquerTempsEcoule = e.revele;
          vue.modele(e.chrono);
          if (vueRegie) { vueRegie.masquerTempsEcoule = true; vueRegie.modele(e.chrono); }
          if (aTele) {
            pastille.textContent = 'Manche ' + (e.manche + 1) + ' / ' + total;
            const joue = actif && e.chrono.running && !C.termine(e.chrono) && !e.revele;
            vinyle.classList.toggle('tourne', joue);
            vinyle.parentNode.classList.toggle('joue', joue);
            texteReponse.textContent = e.revele ? reponseDe(e) : '';   // jamais dans le DOM public avant la révélation
            boiteReponse.classList.toggle('visible', e.revele);
            vinyle.parentNode.classList.toggle('recule', e.revele);
          }
          if (aControles) { if (regie) majRegie(e); volume.value = Math.round(global.volume * 100); majBoutons(); }
          synchroniserAudio();
        },
        afficher: function () { actif = true; vue.demarrer(); if (vueRegie) vueRegie.demarrer(); synchroniserAudio(); majErreur(); },
        masquer: function () {
          actif = false; vue.arreter(); if (vueRegie) vueRegie.arreter();
          audio.pause();
          if (vinyle) { vinyle.classList.remove('tourne'); vinyle.parentNode.classList.remove('joue'); }
          if (bloque) { bloque = false; if (GS.signalerSonBloque) GS.signalerSonBloque(false); }
        }
      };
    }
  });
})(window.GrandShow);
