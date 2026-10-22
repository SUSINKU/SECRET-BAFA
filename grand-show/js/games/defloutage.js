/* Jeu 2 — Le Défloutage Mystère : le flou se déduit du temps restant du chrono. */
(function (GS) {
  'use strict';

  const ID = 'defloutage';
  const C = GS.Chrono;
  const PALIER = 0.5;   // le flou est recalculé toutes les 500 ms, avec une transition linéaire de 500 ms

  function liste(cfg, partie) {
    const d = cfg.jeux.defloutage;
    return partie === 1 && d.reserve.length ? d.reserve : d.manches;
  }
  function mancheCourante(e) { return liste(GS.config, e.partie)[e.manche] || liste(GS.config, 0)[0]; }

  /** Flou (px) correspondant à un temps écoulé : linéaire de flouMax à 0. */
  function flouA(ecoule, dur) {
    return GS.config.jeux.defloutage.flouMax * (1 - GS.clamp(ecoule / dur, 0, 1));
  }

  /** Image + secours emoji, floutés ensemble. `idle` = image nette (aperçu régie). */
  function construireImage(classe) {
    const img = GS.el('img', { class: 'img-perso', alt: '', hidden: true, draggable: 'false' });
    const emoji = GS.el('div', { class: 'emoji-secours', 'aria-hidden': 'true', hidden: true });
    const interne = GS.el('div', { class: 'carte-interne ' + (classe || '') }, img, emoji);
    function charger(manche) {
      img.hidden = true; emoji.hidden = true;
      emoji.textContent = manche.emojiSecours;
      img.onload = function () { img.hidden = false; emoji.hidden = true; };
      img.onerror = function () { img.hidden = true; emoji.hidden = false; };
      if (manche.image) { if (img.getAttribute('src') !== manche.image) img.setAttribute('src', manche.image); else if (img.complete && img.naturalWidth) img.onload(); else if (img.complete) img.onerror(); }
      else { img.removeAttribute('src'); emoji.hidden = false; }
    }
    return { interne: interne, charger: charger };
  }

  GS.enregistrerJeu({
    id: ID, numero: 2, emoji: '🔍', couleur: '#22e4ff',
    titre: function (cfg) { return cfg.jeux.defloutage.titre; },
    info: function (cfg) { return cfg.jeux.defloutage.manches.length + ' manches · ' + cfg.jeux.defloutage.duree + ' s'; },

    etatInitial: function (cfg) {
      return { manche: 0, partie: 0, revele: false, chrono: C.creer(cfg.jeux.defloutage.duree) };
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
          if (!ctx.config.jeux.defloutage.reserve.length) return false;
          e.partie = e.partie === 1 ? 0 : 1; e.manche = 0; e.revele = false; C.reinitialiser(e.chrono);
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
      let dernier = null, cleAppliquee = '', cleManche = '', prochainPalier = 0, filtreEl = null;

      // ---------- Écran public ----------
      const vue = C.vue({ classe: 'geant', bips: true });
      let pastille, interro, boiteReponse, texteReponse, imageTele;
      if (aTele) {
        pastille = GS.pastilleManche();
        imageTele = construireImage('flou');
        filtreEl = imageTele.interne;
        interro = GS.el('div', { class: 'grand-interro', 'aria-hidden': 'true' }, '?');
        texteReponse = GS.el('div', { class: 'reponse-texte' });
        boiteReponse = GS.el('div', { class: 'boite-reponse', 'aria-live': 'polite' }, GS.el('div', { class: 'reponse-titre' }, 'C\'est…'), texteReponse);
        racine.appendChild(GS.el('div', { class: 'jeu-tv jeu-flou' },
          pastille,
          GS.el('div', { class: 'carte-mystere' }, GS.el('div', { class: 'carte-cadre' }, imageTele.interne), interro, boiteReponse),
          GS.el('div', { class: 'zone-chrono' }, vue.el),
          vue.surimpression));
      }

      // ---------- Contrôles ----------
      let bLancer, bReveler, bSuivant, bPartie, secret, apercu = null, vueRegie = null;
      if (aControles) {
        bLancer = GS.bouton('🔍 Lancer le défloutage', function () { agir('basculer'); }, { classe: 'btn-vert' });
        bReveler = GS.bouton('👁️ Révéler', function () { agir('reveler'); }, { classe: 'btn-jaune' });
        bSuivant = GS.bouton('Suivant ➜', function () { agir('suivant'); }, { classe: 'btn-cyan' });
        const bRejouer = GS.bouton('⏮️ Recommencer la manche', function () { agir('rejouer'); }, { classe: 'btn-gris btn-petit' });
        bPartie = GS.bouton('🔄 Partie 2', function () { agir('partie'); }, { classe: 'btn-gris btn-petit' });
        const lignes = [
          GS.el('div', { class: 'rangee' }, bLancer, bReveler, bSuivant),
          GS.el('div', { class: 'rangee rangee-secondaire' }, bRejouer, bPartie)
        ];
        if (regie) {
          apercu = construireImage('');
          secret = GS.el('div', { class: 'secret-regie' });
          vueRegie = C.vue({ classe: 'petit', bips: false });
          lignes.unshift(GS.el('div', { class: 'rangee regie-infos' },
            GS.el('div', { class: 'apercu-net' }, apercu.interne), secret, vueRegie.el));
        }
        racine.appendChild(GS.el('div', { class: 'controles' + (regie ? ' controles-regie' : '') }, lignes));
      }

      // ---------- Flou ----------
      function fixerFlou(px) {
        filtreEl.style.transition = 'none';
        filtreEl.style.filter = 'blur(' + px.toFixed(3) + 'px)';
        void filtreEl.offsetWidth;                // valide le saut avant de réactiver la transition
      }
      /** Chrono en marche : saute au flou exact puis glisse linéairement jusqu'au prochain palier. */
      function planifier(m) {
        const el = C.ecoule(m);
        prochainPalier = Math.min(m.dur, (Math.floor(el / PALIER + 1e-6) + 1) * PALIER);
        fixerFlou(flouA(el, m.dur));
        filtreEl.style.transition = 'filter ' + Math.round((prochainPalier - el) * 1000) + 'ms linear';
        filtreEl.style.filter = 'blur(' + flouA(prochainPalier, m.dur).toFixed(3) + 'px)';
      }
      function majInterro(px) {
        const max = GS.config.jeux.defloutage.flouMax;
        interro.classList.toggle('visible', px > max * 0.5);
      }
      function appliquerFlou(e) {
        const m = e.chrono;
        const cle = [e.manche, e.partie, e.revele, m.running, m.elapsed, m.at].join('|');
        if (cle === cleAppliquee) return;
        cleAppliquee = cle;
        if (e.revele) { fixerFlou(0); majInterro(0); return; }
        if (m.running && !C.termine(m)) { planifier(m); return; }
        const px = flouA(C.ecoule(m), m.dur);   // pause / attente / fin : valeur exacte, sans transition
        fixerFlou(px);
        majInterro(px);
      }

      let rafFlou = 0;
      function boucleFlou() {
        if (dernier && dernier.chrono.running && !dernier.revele) {
          const m = dernier.chrono, el = C.ecoule(m);
          if (el >= prochainPalier - 0.004 && el < m.dur) planifier(m);
          else if (C.termine(m)) { fixerFlou(0); }
          majInterro(flouA(el, m.dur));
        }
        rafFlou = requestAnimationFrame(boucleFlou);
      }

      function majBoutons() {
        if (!aControles || !dernier) return;
        const e = dernier, phase = C.phase(e.chrono);
        bLancer.textContent = phase === 'marche' ? '⏸️ Pause' : phase === 'pause' ? '🔍 Reprendre' : '🔍 Lancer le défloutage';
        bLancer.disabled = e.revele || phase === 'fini';
        bReveler.disabled = e.revele;
        bSuivant.textContent = e.manche + 1 >= liste(GS.config, e.partie).length ? '🔁 Recommencer' : 'Suivant ➜';
        bPartie.hidden = !GS.config.jeux.defloutage.reserve.length;
        bPartie.textContent = e.partie === 1 ? '🔄 Partie 1' : '🔄 Partie 2';
      }
      vue.surPhase = majBoutons;
      if (vueRegie) vueRegie.surPhase = majBoutons;

      return {
        rendre: function (e) {
          // l'état est modifié en place par l'autorité : on compare des valeurs, pas l'objet précédent
          const nouvelleCle = e.partie + ':' + e.manche;
          const nouvelleManche = nouvelleCle !== cleManche;
          cleManche = nouvelleCle;
          dernier = e;
          const m = mancheCourante(e);
          vue.masquerTempsEcoule = e.revele;
          vue.modele(e.chrono);
          if (vueRegie) { vueRegie.masquerTempsEcoule = true; vueRegie.modele(e.chrono); }
          if (aTele) {
            if (nouvelleManche) { imageTele.charger(m); cleAppliquee = ''; }
            pastille.textContent = 'Manche ' + (e.manche + 1) + ' / ' + liste(GS.config, e.partie).length;
            texteReponse.textContent = e.revele ? m.reponse : '';   // jamais dans le DOM public avant la révélation
            boiteReponse.classList.toggle('visible', e.revele);
            appliquerFlou(e);
          }
          if (regie) {
            if (nouvelleManche) apercu.charger(m);
            secret.textContent = '';
            secret.appendChild(GS.el('div', { class: 'secret-titre' }, '🤫 Réponse (secret)'));
            secret.appendChild(GS.el('div', { class: 'secret-valeur' }, m.reponse));
          }
          majBoutons();
        },
        afficher: function () {
          vue.demarrer(); if (vueRegie) vueRegie.demarrer();
          if (aTele && !rafFlou) { cleAppliquee = ''; rafFlou = requestAnimationFrame(boucleFlou); if (dernier) appliquerFlou(dernier); }
        },
        masquer: function () {
          vue.arreter(); if (vueRegie) vueRegie.arreter();
          if (rafFlou) { cancelAnimationFrame(rafFlou); rafFlou = 0; }
        }
      };
    }
  });
})(window.GrandShow);
