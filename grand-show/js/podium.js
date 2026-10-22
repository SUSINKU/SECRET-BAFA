/* Écran de résultats : podium + confettis en canvas. */
(function (GS) {
  'use strict';

  const COULEURS_CONFETTIS = ['#ff3b5c', '#3b9cff', '#2ee872', '#ffe03b', '#b45cff', '#ff4fd8', '#22e4ff'];
  const pod = GS.podium = { _confettis: -1, _raf: 0, _parts: [] };

  pod.monter = function (section) {
    pod._canvas = GS.el('canvas', { class: 'confettis', 'aria-hidden': 'true' });
    pod._scene = GS.el('div', { class: 'podium' });
    section.appendChild(GS.el('h2', { class: 'titre-vue' }, '🏆 Résultats 🏆'));
    section.appendChild(pod._scene);
    section.appendChild(GS.el('div', { class: 'hub-pied' },
      GS.bouton('🎉 Relancer les confettis', function () { GS.core.agir('core', 'confettis'); }, { classe: 'btn-rose controle' })));
    section.appendChild(pod._canvas);
    return { rendre: function (_, etat) { pod.rendre(etat); }, afficher: function () { /* le rendu se fait dans rendre() */ }, masquer: function () { pod.arreter(); pod._confettis = -1; } };
  };

  /** Rang « dense » : deux équipes à égalité ont le même rang. */
  function rangs(scores) {
    const tri = GS.core.classement(scores);
    let rang = 0, dernier = null;
    return tri.map(function (t) {
      if (t.score !== dernier) { rang++; dernier = t.score; }
      return { equipe: t.equipe, score: t.score, rang: rang };
    });
  }

  /** Disposition classique : 2e à gauche, 1er au centre, 3e à droite, 4e à l'extrême droite. */
  function ordreAffichage(liste) {
    const l = liste.slice();
    if (l.length === 2) return [l[1], l[0]];
    if (l.length === 3) return [l[1], l[0], l[2]];
    if (l.length >= 4) return [l[1], l[0], l[2], l[3]];
    return l;
  }

  pod.rendre = function (etat) {
    const classement = rangs(etat.scores);
    const premier = classement[0].score > 0 ? classement[0].score : -1;
    pod._scene.textContent = '';
    ordreAffichage(classement).forEach(function (t) {
      const eq = GS.config.equipes[t.equipe];
      const gagnante = t.score === premier;
      pod._scene.appendChild(GS.el('div', { class: 'marche rang-' + Math.min(t.rang, 4), style: { '--c': eq.couleur } },
        gagnante ? GS.el('div', { class: 'couronne podium-couronne', 'aria-hidden': 'true' }, '👑') : null,
        GS.el('div', { class: 'marche-nom' }, eq.nom),
        GS.el('div', { class: 'marche-score' }, String(t.score)),
        GS.el('div', { class: 'marche-bloc' }, GS.el('span', null, t.rang === 1 ? '🥇' : t.rang === 2 ? '🥈' : t.rang === 3 ? '🥉' : String(t.rang)))));
    });
    if (etat.confettis !== pod._confettis) {
      pod._confettis = etat.confettis;
      pod.lancer();
    }
  };

  pod.lancer = function () {
    if (GS.core.role !== 'tv') return;   // les confettis ne concernent que l'écran public
    const c = pod._canvas;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.floor(c.clientWidth * dpr));
    c.height = Math.max(1, Math.floor(c.clientHeight * dpr));
    const ctx = c.getContext('2d');
    pod._parts = [];
    for (let i = 0; i < 220; i++) {
      pod._parts.push({
        x: Math.random() * c.width, y: -Math.random() * c.height * 0.6,
        vx: (Math.random() - 0.5) * 6 * dpr, vy: (2 + Math.random() * 5) * dpr,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        w: (8 + Math.random() * 10) * dpr, h: (5 + Math.random() * 7) * dpr,
        couleur: COULEURS_CONFETTIS[i % COULEURS_CONFETTIS.length]
      });
    }
    pod.arreter();
    const debut = performance.now();
    function pas(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      let vivantes = 0;
      pod._parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05 * dpr; p.r += p.vr;
        if (p.y < c.height + 40) vivantes++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.couleur; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (vivantes && t - debut < 9000) pod._raf = requestAnimationFrame(pas);
      else { pod._raf = 0; ctx.clearRect(0, 0, c.width, c.height); }
    }
    pod._raf = requestAnimationFrame(pas);
  };

  pod.arreter = function () {
    if (pod._raf) cancelAnimationFrame(pod._raf);
    pod._raf = 0;
    if (pod._canvas) pod._canvas.getContext('2d').clearRect(0, 0, pod._canvas.width, pod._canvas.height);
  };
})(window.GrandShow);
