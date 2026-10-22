/* Jeu 3 — L'Œil de Lynx : scène « cherche et trouve » et liste de 3 éléments à trouver. */
(function (GS) {
  'use strict';

  const ID = 'lynx';
  const C = GS.Chrono;
  const S = GS.lynxScene;

  function mancheCfg(index) {
    const l = GS.config.jeux.lynx.manches;
    return l[index % l.length];
  }

  function nouvelleGraine() { return 1 + Math.floor(Math.random() * 2000000000); }

  function reinitialiserManche(e) {
    e.graine = nouvelleGraine();
    e.trouves = [false, false, false];
    e.tout = false; e.solutions = false;
    C.reinitialiser(e.chrono);
  }

  GS.enregistrerJeu({
    id: ID, numero: 3, emoji: '👁️', couleur: '#ffe03b',
    titre: function (cfg) { return cfg.jeux.lynx.titre; },
    info: function (cfg) { return cfg.jeux.lynx.manches.length + ' manches · ' + cfg.jeux.lynx.duree + ' s'; },

    etatInitial: function (cfg) {
      return { manche: 0, graine: nouvelleGraine(), trouves: [false, false, false], tout: false, solutions: false, loupe: false, chrono: C.creer(cfg.jeux.lynx.duree) };
    },
    quitter: function (e) { C.pause(e.chrono); },

    reduire: function (e, action, p, ctx) {
      switch (action) {
        case 'basculer':
          if (e.tout || C.termine(e.chrono)) return false;
          if (e.chrono.running) C.pause(e.chrono); else C.demarrer(e.chrono);
          return true;
        case 'trouve': {
          const i = p.i;
          if (i < 0 || i > 2) return false;
          e.trouves[i] = !e.trouves[i];
          if (e.trouves[i]) ctx.fx('trouve');
          const tout = e.trouves.every(Boolean);
          if (tout && !e.tout) { C.pause(e.chrono); ctx.fx('fanfare'); }
          e.tout = tout;
          return true;
        }
        case 'solutions': e.solutions = !e.solutions; return true;
        case 'loupe': e.loupe = !e.loupe; return true;
        case 'nouvelle': reinitialiserManche(e); return true;
        case 'suivant':
          e.manche = GS.mancheSuivante(e.manche, ctx.config.jeux.lynx.manches.length);
          reinitialiserManche(e);
          return true;
        default: return false;
      }
    },

    touches: {
      principal: function () { return ['basculer']; },
      reveler: function () { return ['solutions']; },
      suivant: function () { return ['suivant']; }
    },

    monter: function (racine, contexte) {
      const aTele = contexte.mode !== 'regie';
      const aControles = contexte.mode !== 'display';
      const regie = contexte.mode === 'regie';
      const agir = function (action, payload) { GS.core.agir(ID, action, payload); };
      let dernier = null, scene = null, cleScene = '', loupeActive = false;

      const vue = C.vue({ classe: 'geant', bips: true });
      let boite, canvas, image, anneaux, loupe, pastille, items = [], toutTrouve, erreurImage, regleBoite;

      /** Liste des 3 éléments à trouver (utilisée sur la télé, et dans la régie sous forme de cases à cocher). */
      function construireListe(classe) {
        return [0, 1, 2].map(function (i) {
          const coche = GS.el('span', { class: 'cible-coche', 'aria-hidden': 'true' }, '✅');
          const emoji = GS.el('span', { class: 'cible-emoji', 'aria-hidden': 'true' });
          const libelle = GS.el('span', { class: 'cible-libelle' });
          const bouton = GS.el('button', { type: 'button', class: 'cible ' + (classe || ''), onclick: function () { agir('trouve', { i: i }); } }, emoji, libelle, coche);
          return { el: bouton, emoji: emoji, libelle: libelle };
        });
      }

      // ---------- Écran public ----------
      if (aTele) {
        pastille = GS.pastilleManche();
        canvas = GS.el('canvas', { class: 'lynx-canvas', 'aria-label': 'Scène à explorer : trouvez les 3 éléments' });
        image = GS.el('img', { class: 'lynx-image', alt: 'Scène à explorer', hidden: true, draggable: 'false' });
        anneaux = GS.el('div', { class: 'anneaux', 'aria-hidden': 'true' });
        loupe = GS.el('canvas', { class: 'loupe', hidden: true, 'aria-hidden': 'true' });
        erreurImage = GS.el('div', { class: 'message-erreur', hidden: true });
        boite = GS.el('div', { class: 'lynx-boite' }, canvas, image, anneaux, loupe, erreurImage);
        items = construireListe('geante');
        toutTrouve = GS.el('div', { class: 'tout-trouve', 'aria-hidden': 'true' }, GS.el('span', null, 'TOUT TROUVÉ !'));
        const zoneScene = GS.el('div', { class: 'lynx-scene-zone' }, boite);
        regleBoite = GS.ajusterBoite(zoneScene, boite, S.RATIO, redessiner);
        racine.appendChild(GS.el('div', { class: 'jeu-tv jeu-lynx' },
          zoneScene,
          GS.el('div', { class: 'lynx-cote' },
            pastille,
            GS.el('h3', { class: 'lynx-titre' }, 'À TROUVER !'),
            GS.el('div', { class: 'lynx-liste' }, items.map(function (it) { return it.el; })),
            GS.el('div', { class: 'zone-chrono' }, vue.el)),
          toutTrouve, vue.surimpression));

        boite.addEventListener('mousemove', function (ev) {
          if (!loupeActive || !dernier || !dernier.loupe) return;
          dessinerLoupe(ev);
        });
        boite.addEventListener('mouseleave', function () { loupe.hidden = true; });
      }

      // ---------- Contrôles ----------
      let bLancer, bSolutions, bNouvelle, bSuivant, bLoupe, listeRegie = [], mini = null, miniCibles = [], vueRegie = null;
      if (aControles) {
        bLancer = GS.bouton('▶️ Lancer', function () { agir('basculer'); }, { classe: 'btn-vert' });
        bSolutions = GS.bouton('🎯 Solutions', function () { agir('solutions'); }, { classe: 'btn-jaune' });
        bNouvelle = GS.bouton('🔀 Nouvelle scène', function () { agir('nouvelle'); }, { classe: 'btn-violet' });
        bSuivant = GS.bouton('Suivant ➜', function () { agir('suivant'); }, { classe: 'btn-cyan' });
        bLoupe = GS.bouton('🔍 Loupe', function () { agir('loupe'); }, { classe: 'btn-gris btn-petit' });
        const lignes = [
          GS.el('div', { class: 'rangee' }, bLancer, bSolutions, bNouvelle, bSuivant),
          GS.el('div', { class: 'rangee rangee-secondaire' }, bLoupe)
        ];
        if (regie) {
          vueRegie = C.vue({ classe: 'petit', bips: false });
          listeRegie = construireListe('petite');
          mini = GS.el('div', { class: 'mini-carte', 'aria-label': 'Emplacement des cibles (secret)' });
          miniCibles = [0, 1, 2].map(function (i) {
            const m = GS.el('div', { class: 'mini-cible' });
            mini.appendChild(m);
            return m;
          });
          lignes.unshift(GS.el('div', { class: 'rangee regie-infos' },
            GS.el('div', { class: 'secret-regie' }, GS.el('div', { class: 'secret-titre' }, '🤫 Emplacement des cibles'), mini),
            GS.el('div', { class: 'liste-regie' }, GS.el('div', { class: 'secret-titre' }, 'Cliquer quand trouvé'), listeRegie.map(function (it) { return it.el; })),
            vueRegie.el));
        }
        racine.appendChild(GS.el('div', { class: 'controles' + (regie ? ' controles-regie' : '') }, lignes));
      }

      // ---------- Scène ----------
      function calculerScene(e) {
        const cfgM = mancheCfg(e.manche);
        const cle = e.graine + ':' + e.manche;
        if (cle !== cleScene) {
          cleScene = cle;
          scene = cfgM.image ? { graine: e.graine, pieges: [], cibles: S.cibles(e.graine, e.manche, cfgM) }
            : S.generer(e.graine, e.manche, cfgM, GS.config.jeux.lynx.densite);
          return true;
        }
        return false;
      }

      function redessiner() {
        if (!canvas || !scene || !dernier) return;
        const cfgM = mancheCfg(dernier.manche);
        if (cfgM.image) return;
        const dpr = window.devicePixelRatio || 1;
        const w = boite.clientWidth, h = boite.clientHeight;
        if (!w || !h) return;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        S.dessiner(ctx, w, h, scene);
      }

      function dessinerLoupe(ev) {
        const r = boite.getBoundingClientRect();
        const px = ev.clientX - r.left, py = ev.clientY - r.top;
        const diam = Math.round(r.width * 0.22), zoom = 2.6, dpr = window.devicePixelRatio || 1;
        loupe.style.width = loupe.style.height = diam + 'px';
        loupe.width = loupe.height = Math.round(diam * dpr);
        const source = image.hidden ? canvas : image;
        const k = (image.hidden ? canvas.width : image.naturalWidth) / r.width;
        const cote = diam / zoom;
        const ctx = loupe.getContext('2d');
        try { ctx.drawImage(source, (px - cote / 2) * k, (py - cote / 2) * k, cote * k, cote * k, 0, 0, loupe.width, loupe.height); } catch (err) { return; }
        loupe.style.left = GS.clamp(px - diam / 2, 0, r.width - diam) + 'px';
        loupe.style.top = GS.clamp(py - diam * 1.1, 0, r.height - diam) + 'px';
        loupe.hidden = false;
      }

      function majImage(cfgM) {
        const avecImage = !!cfgM.image;
        canvas.hidden = avecImage; image.hidden = true; erreurImage.hidden = true;
        if (!avecImage) return;
        image.onload = function () { image.hidden = false; erreurImage.hidden = true; };
        image.onerror = function () { image.hidden = true; erreurImage.hidden = false; erreurImage.textContent = '🖼️ Image introuvable : ' + cfgM.image; };
        if (image.getAttribute('src') !== cfgM.image) image.setAttribute('src', cfgM.image);
        else if (image.complete && image.naturalWidth) image.onload();
      }

      function majBoutons() {
        if (!aControles || !dernier) return;
        const e = dernier, phase = C.phase(e.chrono);
        bLancer.textContent = phase === 'marche' ? '⏸️ Pause' : phase === 'pause' ? '▶️ Reprendre' : '▶️ Lancer';
        bLancer.disabled = e.tout || phase === 'fini';
        bSolutions.setAttribute('aria-pressed', e.solutions ? 'true' : 'false');
        bSolutions.classList.toggle('actif', e.solutions);
        bLoupe.classList.toggle('actif', e.loupe);
        bLoupe.setAttribute('aria-pressed', e.loupe ? 'true' : 'false');
        bSuivant.textContent = e.manche + 1 >= GS.config.jeux.lynx.manches.length ? '🔁 Recommencer' : 'Suivant ➜';
      }
      vue.surPhase = majBoutons;
      if (vueRegie) vueRegie.surPhase = majBoutons;

      function majListe(liste, e) {
        const cibles = mancheCfg(e.manche).cibles;
        liste.forEach(function (it, i) {
          it.emoji.textContent = cibles[i].emoji;
          it.libelle.textContent = cibles[i].libelle;
          it.el.classList.toggle('trouve', e.trouves[i]);
          it.el.setAttribute('aria-pressed', e.trouves[i] ? 'true' : 'false');
          it.el.setAttribute('aria-label', cibles[i].libelle + (e.trouves[i] ? ' : trouvé' : ' : à trouver'));
        });
      }

      return {
        rendre: function (e) {
          dernier = e;
          const nouvelle = calculerScene(e);
          const cfgM = mancheCfg(e.manche);
          vue.masquerTempsEcoule = e.tout;
          vue.modele(e.chrono);
          if (vueRegie) { vueRegie.masquerTempsEcoule = true; vueRegie.modele(e.chrono); }
          if (aTele) {
            if (nouvelle) { majImage(cfgM); redessiner(); }
            pastille.textContent = 'Manche ' + (e.manche + 1) + ' / ' + GS.config.jeux.lynx.manches.length;
            majListe(items, e);
            toutTrouve.classList.toggle('visible', e.tout);
            if (!e.loupe) loupe.hidden = true;
            anneaux.textContent = '';
            if (e.solutions) {
              scene.cibles.forEach(function (c) {
                const d = Math.max(c.r * 2.8, 0.085) * 100;
                anneaux.appendChild(GS.el('div', { class: 'anneau', style: { left: (c.x * 100) + '%', top: (c.y * 100) + '%', width: d + '%' } }));
              });
            }
          }
          if (regie) {
            majListe(listeRegie, e);
            scene.cibles.forEach(function (c, i) {
              const m = miniCibles[i];
              m.textContent = c.e;
              m.style.left = (c.x * 100) + '%'; m.style.top = (c.y * 100) + '%';
              m.classList.toggle('trouve', e.trouves[i]);
            });
          }
          majBoutons();
        },
        afficher: function () { loupeActive = true; vue.demarrer(); if (vueRegie) vueRegie.demarrer(); if (regleBoite) regleBoite.recalculer(); },
        masquer: function () { loupeActive = false; vue.arreter(); if (vueRegie) vueRegie.arreter(); if (loupe) loupe.hidden = true; }
      };
    }
  });
})(window.GrandShow);
