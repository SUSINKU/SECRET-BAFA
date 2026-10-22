/* Tableau des scores : badges d'équipe, compteur animé, couronne, boutons de points. */
(function (GS) {
  'use strict';

  const sb = GS.scoreboard = { _badges: [], _affiche: [], _precedent: null, _raf: 0 };

  function formatPoints(n) { return (n > 0 ? '+' : '') + n; }

  sb.monter = function (parent) {
    const cfg = GS.config;
    const zone = GS.el('div', { class: 'badges' });
    sb._badges = cfg.equipes.map(function (eq, i) {
      const boutons = cfg.points.map(function (pts) {
        return GS.bouton(formatPoints(pts), function () { GS.core.agir('core', 'score', { equipe: i, delta: pts }); },
          { classe: 'btn-points ' + (pts < 0 ? 'neg' : 'pos'), aria: (pts > 0 ? 'Ajouter ' : 'Retirer ') + Math.abs(pts) + ' points à ' + eq.nom });
      });
      const couronne = GS.el('div', { class: 'couronne', 'aria-hidden': 'true' }, '👑');
      const nom = GS.el('div', { class: 'badge-nom' }, eq.nom);
      const score = GS.el('div', { class: 'badge-score', 'aria-live': 'polite' }, '0');
      const badge = GS.el('div', { class: 'badge', style: { '--c': eq.couleur }, 'data-equipe': i },
        couronne, nom, score, GS.el('div', { class: 'badge-boutons controle' }, boutons));
      zone.appendChild(badge);
      return { el: badge, score: score, couronne: couronne };
    });
    zone.style.setProperty('--nb-equipes', String(cfg.equipes.length));

    const outils = GS.el('div', { class: 'outils-score' },
      GS.bouton('↶', function () { GS.core.agir('core', 'annuler'); }, { classe: 'btn-outil controle', aria: 'Annuler le dernier changement de score', titre: 'Annuler (Ctrl+Z)' }),
      GS.bouton('↺', function () {
        GS.ui.confirmer('Remettre tous les scores à zéro ?', 'Oui, tout remettre à zéro').then(function (ok) { if (ok) GS.core.agir('core', 'scoreZero'); });
      }, { classe: 'btn-outil controle', aria: 'Remettre les scores à zéro', titre: 'Remise à zéro' }),
      GS.bouton('⛶', function () { GS.basculerPleinEcran(); }, { classe: 'btn-outil', aria: 'Plein écran', titre: 'Plein écran (F)' }),
      GS.bouton('🔊', function () { GS.core.agir('core', 'muet'); }, { classe: 'btn-outil controle bouton-son', aria: 'Couper le son', titre: 'Son' }),
      GS.bouton('?', function () { GS.ui.basculerAide(); }, { classe: 'btn-outil controle', aria: 'Aide : raccourcis clavier', titre: 'Aide (?)' }));
    parent.appendChild(GS.el('h1', { class: 'titre-show' }, GS.config.titre));
    parent.appendChild(zone);
    parent.appendChild(outils);
    sb._boutonSon = GS.$('.bouton-son', outils);
    sb._boutonAnnuler = GS.$('[aria-label^="Annuler"]', outils);
    GS.core.surRendu(sb.rendre);
  };

  function lancerAnimation() {
    if (sb._raf) return;
    const debut = performance.now();
    const depart = sb._affiche.slice();
    function pas(t) {
      const k = GS.clamp((t - debut) / 700, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      let fini = true;
      sb._badges.forEach(function (b, i) {
        const cible = sb._cible[i];
        const v = k >= 1 ? cible : Math.round(GS.lerp(depart[i], cible, e));
        sb._affiche[i] = v;
        b.score.textContent = String(v);
        if (v !== cible) fini = false;
      });
      sb._raf = fini ? 0 : requestAnimationFrame(pas);
    }
    sb._raf = requestAnimationFrame(pas);
  }

  function envol(badge, delta) {
    const f = GS.el('div', { class: 'envol ' + (delta > 0 ? 'pos' : 'neg'), 'aria-hidden': 'true' }, formatPoints(delta));
    badge.el.appendChild(f);
    setTimeout(function () { f.remove(); }, 1500);
    badge.el.classList.remove('rebond');
    void badge.el.offsetWidth;   // relance l'animation CSS
    badge.el.classList.add('rebond');
  }

  sb.rendre = function (etat) {
    const scores = etat.scores;
    sb._cible = scores.slice();
    const max = Math.max.apply(null, scores);
    sb._badges.forEach(function (b, i) {
      if (sb._precedent && sb._precedent[i] !== scores[i]) {
        envol(b, scores[i] - sb._precedent[i]);
        if (sb._raf) { cancelAnimationFrame(sb._raf); sb._raf = 0; }
      }
      b.el.classList.toggle('en-tete', max > 0 && scores[i] === max);
      b.couronne.hidden = !(max > 0 && scores[i] === max);
    });
    if (!sb._precedent) {
      sb._badges.forEach(function (b, i) { sb._affiche[i] = scores[i]; b.score.textContent = String(scores[i]); });
    } else if (sb._affiche.some(function (v, i) { return v !== scores[i]; })) {
      lancerAnimation();
    }
    sb._precedent = scores.slice();
    sb._boutonSon.textContent = etat.muet ? '🔇' : '🔊';
    sb._boutonSon.setAttribute('aria-label', etat.muet ? 'Réactiver le son' : 'Couper le son');
    sb._boutonSon.setAttribute('aria-pressed', etat.muet ? 'true' : 'false');
  };
})(window.GrandShow);
