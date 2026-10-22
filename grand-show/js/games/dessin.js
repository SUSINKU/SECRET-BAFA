/*
 * Jeu 4 — Le Dessin Flash.
 * Le dessin vit hors de l'état partagé : liste de traits en coordonnées normalisées (0 à 1),
 * diffusés par lots depuis la régie vers la télé pendant que l'enfant dessine.
 */
(function (GS) {
  'use strict';

  const ID = 'dessin';
  const C = GS.Chrono;
  const RATIO = 1.6;                                    // largeur / hauteur du canvas (identique télé et régie)
  const COULEURS = ['#111111', '#ff3b5c', '#ff9f1c', '#ffe03b', '#2ee872', '#22e4ff', '#3b9cff', '#b45cff', '#8b5a2b'];
  const NOMS_COULEURS = ['noir', 'rouge', 'orange', 'jaune', 'vert', 'cyan', 'bleu', 'violet', 'marron'];
  const EPAISSEURS = [{ nom: 'Fin', v: 0.003 }, { nom: 'Moyen', v: 0.007 }, { nom: 'Gros', v: 0.016 }];  // part de la largeur
  const MULTIPLICATEUR_GOMME = 3;
  const DELAI_LOT_MS = 30;

  // ---------- Modèle du dessin (propre à chaque page) ----------
  let traits = [];                 // { id, couleur, taille, pts:[x0,y0,x1,y1,…] }
  let sauvegardeEffacement = [];   // permet d'annuler un « Effacer le dessin » accidentel
  const toiles = [];               // canvas montés sur cette page

  function toutRedessiner() { toiles.forEach(function (t) { t.redessiner(); }); }

  /** Trace les points `depuis`… d'un trait. Coordonnées en pixels CSS, le contexte est déjà mis à l'échelle. */
  function tracer(ctx, w, h, trait, depuis) {
    const p = trait.pts;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = trait.couleur; ctx.fillStyle = trait.couleur;
    ctx.lineWidth = Math.max(1, trait.taille * w);
    if (p.length === 2) {   // simple point
      ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const debut = Math.max(0, depuis - 2);
    ctx.beginPath();
    ctx.moveTo(p[debut] * w, p[debut + 1] * h);
    for (let i = debut + 2; i < p.length; i += 2) ctx.lineTo(p[i] * w, p[i + 1] * h);
    ctx.stroke();
  }

  function creerToile(interactive, aEnvoyer) {
    const canvas = GS.el('canvas', { class: 'dessin-canvas', 'aria-label': 'Zone de dessin' });
    const boite = GS.el('div', { class: 'dessin-boite' }, canvas);
    const zone = GS.el('div', { class: 'dessin-zone' }, boite);
    const ctx = canvas.getContext('2d');
    let dpr = 1;

    function preparer() {
      dpr = window.devicePixelRatio || 1;
      const w = boite.clientWidth, h = boite.clientHeight;
      if (!w || !h) return false;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }
    const toile = {
      zone: zone, boite: boite, canvas: canvas,
      redessiner: function () {
        if (!preparer()) return;
        const w = boite.clientWidth, h = boite.clientHeight;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        traits.forEach(function (t) { tracer(ctx, w, h, t, 0); });
      },
      /** Dessine seulement la fin d'un trait (tracé en direct). */
      prolonger: function (trait, depuis) {
        if (!boite.clientWidth) return;
        tracer(ctx, boite.clientWidth, boite.clientHeight, trait, depuis);
      }
    };
    GS.ajusterBoite(zone, boite, RATIO, toile.redessiner);
    toiles.push(toile);

    if (interactive) {
      let actif = null, idPointeur = null, lot = [], minuteur = 0;
      const envoyerLot = function () {
        minuteur = 0;
        if (actif && lot.length) { aEnvoyer({ op: 'pts', id: actif.id, pts: lot }); lot = []; }
      };
      const normaliser = function (ev) {
        const r = canvas.getBoundingClientRect();
        return [GS.clamp((ev.clientX - r.left) / r.width, 0, 1), GS.clamp((ev.clientY - r.top) / r.height, 0, 1)];
      };
      canvas.addEventListener('pointerdown', function (ev) {
        if (actif || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
        ev.preventDefault();
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* capture indisponible : on continue */ }
        idPointeur = ev.pointerId;
        const outil = toile.outil();
        const pt = normaliser(ev);
        actif = { id: GS.idAleatoire(), couleur: outil.couleur, taille: outil.taille, pts: pt };
        traits.push(actif);
        toile.prolonger(actif, 0);
        aEnvoyer({ op: 'debut', id: actif.id, couleur: actif.couleur, taille: actif.taille, pts: pt.slice() });
      });
      canvas.addEventListener('pointermove', function (ev) {
        if (!actif || ev.pointerId !== idPointeur) return;
        ev.preventDefault();
        const evts = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [];
        const sources = evts.length ? evts : [ev];
        const avant = actif.pts.length;
        sources.forEach(function (s) {
          const pt = normaliser(s);
          actif.pts.push(pt[0], pt[1]); lot.push(pt[0], pt[1]);
        });
        toile.prolonger(actif, avant);
        if (!minuteur) minuteur = setTimeout(envoyerLot, DELAI_LOT_MS);
      });
      const fin = function (ev) {
        if (!actif || ev.pointerId !== idPointeur) return;
        clearTimeout(minuteur); envoyerLot();
        aEnvoyer({ op: 'fin', id: actif.id });
        actif = null; idPointeur = null;
        try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* déjà relâché */ }
      };
      canvas.addEventListener('pointerup', fin);
      canvas.addEventListener('pointercancel', fin);
    }
    toile.outil = function () { return { couleur: '#111111', taille: 0.007 }; };
    return toile;
  }

  // ---------- Messages de dessin reçus (côté télé) ----------
  GS.sync.sur('dessin', function (m) {
    switch (m.op) {
      case 'debut': {
        const t = { id: m.id, couleur: m.couleur, taille: m.taille, pts: m.pts.slice() };
        traits.push(t);
        toiles.forEach(function (x) { x.prolonger(t, 0); });
        break;
      }
      case 'pts': {
        const t = traits.find(function (x) { return x.id === m.id; });
        if (!t) break;
        const avant = t.pts.length;
        Array.prototype.push.apply(t.pts, m.pts);
        toiles.forEach(function (x) { x.prolonger(t, avant); });
        break;
      }
      case 'annuler': traits.pop(); toutRedessiner(); break;
      case 'vider': traits = []; toutRedessiner(); break;
      case 'tout': traits = m.traits; toutRedessiner(); break;
      default: break;   // 'fin' : rien à faire
    }
  });

  // ---------- Mots ----------
  function motsDuNiveau(cfg, niveau) {
    const n = cfg.jeux.dessin.niveaux;
    const noms = niveau === 'tous' ? ['facile', 'moyen', 'difficile'] : [niveau];
    let mots = [];
    noms.forEach(function (k) { mots = mots.concat(n[k] || []); });
    return mots.length ? mots : [].concat(n.facile, n.moyen, n.difficile);
  }
  /** Pioche mélangée ; le mot en cours ne revient pas en tête après un réassort. */
  function nouvellePioche(cfg, niveau, exclu) {
    let p = GS.melanger(motsDuNiveau(cfg, niveau));
    if (exclu && p.length > 1 && p[p.length - 1] === exclu) p.unshift(p.pop());
    return p;
  }
  function tirerMot(e, cfg) {
    if (!e.pioche.length) e.pioche = nouvellePioche(cfg, e.niveau, e.mot);
    e.mot = e.pioche.pop();
    e.motId++;
  }

  GS.enregistrerJeu({
    id: ID, numero: 4, emoji: '🎨', couleur: '#2ee872',
    titre: function (cfg) { return cfg.jeux.dessin.titre; },
    info: function (cfg) { return 'Mots variés · ' + cfg.jeux.dessin.duree + ' s'; },

    etatInitial: function (cfg) {
      const e = { niveau: 'tous', pioche: nouvellePioche(cfg, 'tous'), mot: '', motId: 0, chrono: C.creer(cfg.jeux.dessin.duree) };
      tirerMot(e, cfg);
      return e;
    },
    quitter: function (e) { C.pause(e.chrono); },

    reduire: function (e, action, p, ctx) {
      switch (action) {
        case 'basculer':
          if (C.termine(e.chrono)) return false;
          if (e.chrono.running) C.pause(e.chrono); else C.demarrer(e.chrono);
          return true;
        case 'nouveauMot':
          tirerMot(e, ctx.config); C.reinitialiser(e.chrono);
          return true;
        case 'reinit':
          C.reinitialiser(e.chrono);
          return true;
        case 'niveau':
          if (['tous', 'facile', 'moyen', 'difficile'].indexOf(p.niveau) === -1) return false;
          e.niveau = p.niveau; e.pioche = nouvellePioche(ctx.config, e.niveau, e.mot);
          return true;
        default: return false;
      }
    },

    touches: {
      principal: function () { return ['basculer']; },
      reveler: function () { document.dispatchEvent(new CustomEvent('grandshow:mot')); return null; },
      suivant: function () { return ['nouveauMot']; }
    },

    /** Envoie le dessin complet à une télé qui vient de se (re)connecter. */
    resynchroniser: function () { GS.sync.envoyer('dessin', { op: 'tout', traits: traits }); },

    monter: function (racine, contexte) {
      const aControles = contexte.mode !== 'display';
      const regie = contexte.mode === 'regie';
      const agir = function (action, payload) { GS.core.agir(ID, action, payload); };
      let dernier = null, motVisible = false, motIdAffiche = -1;

      const toile = creerToile(aControles, function (msg) { GS.sync.envoyer('dessin', msg); });
      const vue = C.vue({ classe: regie ? 'petit' : 'bandeau', bips: !regie });

      let outilCouleur = COULEURS[0], outilEpaisseur = 1, gomme = false;
      toile.outil = function () {
        return gomme ? { couleur: '#ffffff', taille: EPAISSEURS[outilEpaisseur].v * MULTIPLICATEUR_GOMME }
          : { couleur: outilCouleur, taille: EPAISSEURS[outilEpaisseur].v };
      };

      let bChrono, motConteneur, motTexte, bMot, selecteur;
      if (aControles) {
        // Palette et outils
        const pastilles = COULEURS.map(function (c, i) {
          const b = GS.el('button', { type: 'button', class: 'pastille-couleur', style: { background: c }, 'aria-label': 'Couleur ' + NOMS_COULEURS[i], title: NOMS_COULEURS[i] });
          b.addEventListener('click', function () { outilCouleur = c; gomme = false; majOutils(); });
          return b;
        });
        const bGomme = GS.bouton('🧽', function () { gomme = !gomme; majOutils(); }, { classe: 'btn-outil', aria: 'Gomme', titre: 'Gomme' });
        const bEpaisseurs = EPAISSEURS.map(function (ep, i) {
          const b = GS.el('button', { type: 'button', class: 'btn-epaisseur', 'aria-label': 'Épaisseur ' + ep.nom.toLowerCase(), title: ep.nom },
            GS.el('span', { style: { width: (6 + i * 7) + 'px', height: (6 + i * 7) + 'px' } }));
          b.addEventListener('click', function () { outilEpaisseur = i; majOutils(); });
          return b;
        });
        const bAnnuler = GS.bouton('↶ Annuler le dernier trait', function () {
          if (!traits.length && sauvegardeEffacement.length) { traits = sauvegardeEffacement; sauvegardeEffacement = []; toutRedessiner(); GS.sync.envoyer('dessin', { op: 'tout', traits: traits }); return; }
          if (!traits.length) return;
          traits.pop(); toutRedessiner(); GS.sync.envoyer('dessin', { op: 'annuler' });
        }, { classe: 'btn-gris btn-petit' });
        function majOutils() {
          pastilles.forEach(function (b, i) { b.classList.toggle('actif', !gomme && COULEURS[i] === outilCouleur); b.setAttribute('aria-pressed', (!gomme && COULEURS[i] === outilCouleur) ? 'true' : 'false'); });
          bGomme.classList.toggle('actif', gomme); bGomme.setAttribute('aria-pressed', gomme ? 'true' : 'false');
          bEpaisseurs.forEach(function (b, i) { b.classList.toggle('actif', i === outilEpaisseur); });
        }
        majOutils();

        // Actions du jeu
        bMot = GS.bouton('🔑 Afficher le mot secret', function () { basculerMot(); }, { classe: 'btn-jaune' });
        const bNouveau = GS.bouton('🎲 Nouveau mot', function () { agir('nouveauMot'); }, { classe: 'btn-violet' });
        bChrono = GS.bouton('⏱️ Chrono', function () { agir('basculer'); }, { classe: 'btn-vert' });
        const bRaz = GS.bouton('⏮️', function () { agir('reinit'); }, { classe: 'btn-gris btn-petit', aria: 'Remettre le chrono à zéro', titre: 'Chrono à zéro' });
        selecteur = GS.el('select', { 'aria-label': 'Difficulté des mots', class: 'selecteur' },
          [['tous', 'Tous les mots'], ['facile', 'Facile'], ['moyen', 'Moyen'], ['difficile', 'Difficile']].map(function (o) { return GS.el('option', { value: o[0] }, o[1]); }));
        selecteur.addEventListener('change', function () { agir('niveau', { niveau: selecteur.value }); selecteur.blur(); });
        const bEffacer = GS.bouton('🗑️ Effacer le dessin', function () {
          if (traits.length) sauvegardeEffacement = traits;
          traits = []; toutRedessiner(); GS.sync.envoyer('dessin', { op: 'vider' });
        }, { classe: 'btn-rouge btn-geant' });

        motTexte = GS.el('div', { class: 'mot-texte' });
        motConteneur = GS.el('div', { class: 'mot-secret', hidden: true, 'aria-live': 'polite' }, GS.el('span', { class: 'secret-titre' }, '🤫 Mot à dessiner'), motTexte);

        function basculerMot() {
          motVisible = !motVisible; majMot();
        }
        document.addEventListener('grandshow:mot', function () { if (GS.core.state && GS.core.state.vue === ID) basculerMot(); });
        racine.appendChild(GS.el('div', { class: 'controles dessin-barre' + (regie ? ' controles-regie' : '') },
          GS.el('div', { class: 'rangee outils-dessin' },
            GS.el('div', { class: 'palette' }, pastilles, bGomme), GS.el('div', { class: 'epaisseurs' }, bEpaisseurs), bAnnuler, selecteur),
          GS.el('div', { class: 'rangee' }, bMot, bNouveau, bChrono, bRaz, regie ? vue.el : null, bEffacer),
          motConteneur));
      }

      function majMot() {
        if (!aControles || !dernier) return;
        motConteneur.hidden = !motVisible;
        bMot.textContent = motVisible ? '🙈 Masquer le mot secret' : '🔑 Afficher le mot secret';
        motTexte.textContent = dernier.mot;
      }

      function majBoutons() {
        if (!aControles || !dernier) return;
        const phase = C.phase(dernier.chrono);
        bChrono.textContent = phase === 'marche' ? '⏸️ Pause' : phase === 'pause' ? '⏱️ Reprendre' : '⏱️ Chrono';
        bChrono.disabled = phase === 'fini';
      }
      vue.surPhase = majBoutons;

      // Sur la télé (ou en écran unique), le chrono est un bandeau au-dessus de la toile
      const tvChrono = regie ? null : GS.el('div', { class: 'dessin-chrono' }, vue.el);
      const piece = GS.el('div', { class: 'jeu-tv jeu-dessin' }, tvChrono, toile.zone, regie ? null : vue.surimpression);
      racine.appendChild(piece);

      return {
        rendre: function (e) {
          dernier = e;
          vue.masquerTempsEcoule = false;
          vue.modele(e.chrono);
          if (aControles) {
            if (e.motId !== motIdAffiche) { motIdAffiche = e.motId; motVisible = false; }   // nouveau mot : masqué par défaut
            selecteur.value = e.niveau;
            majMot(); majBoutons();
          }
        },
        afficher: function () { vue.demarrer(); toile.redessiner(); },
        masquer: function () { vue.arreter(); }
      };
    }
  });
})(window.GrandShow);
