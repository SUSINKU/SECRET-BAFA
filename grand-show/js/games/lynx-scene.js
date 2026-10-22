/*
 * Scène « cherche et trouve » générée en canvas.
 * Tout est déterministe (graine) et stocké en coordonnées normalisées :
 * x, y dans [0,1] (part de la largeur / de la hauteur), s = taille en part de la largeur.
 * La télé et la régie obtiennent donc exactement la même scène, à n'importe quelle résolution.
 */
(function (GS) {
  'use strict';

  const RATIO = 1.6;            // largeur / hauteur de la scène
  const H = 1 / RATIO;          // hauteur exprimée en unités de largeur
  const POLICE = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

  const PIEGES = [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦉', '🐺',
    '🐗', '🐴', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢', '🐍', '🦀', '🐠', '🐬', '🐳', '🦒', '🦓', '🐘', '🦁', '🐑', '🦔', '🦜',
    '⚽', '🏀', '🎾', '🎈', '🎁', '🎸', '🎺', '🥁', '🧸', '🪁', '🚲', '🚗', '🚌', '🚁', '✈️', '🚂', '⏰', '📚', '✏️', '🔑',
    '🎩', '👑', '🧢', '👟', '🎒', '🌂', '🔔', '💡', '🔭', '🧩', '🎲', '🎨', '🍎', '🍌', '🍓', '🍇', '🍉', '🍒', '🍋', '🥕',
    '🌽', '🍔', '🍟', '🍦', '🍪', '🍰', '🍭', '🍬', '🧁', '🥐', '🍞', '🧀', '🌸', '🌻', '🌷', '🍄', '🌵', '🍀', '⭐', '🌈',
    '🐉', '🦈', '🐙', '🦂', '🦎', '🐊', '🛶', '🚤', '🍕', '🦄', '🚀', '🦖', '⛵', '🍩'
  ];

  function distance(a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) * H); }

  /** Positions des 3 cibles (indépendantes de la densité). */
  function placerCibles(graine, manche, cibles) {
    const alea = GS.prng(graine * 7919 + manche * 104729 + 17);
    const posees = [];
    cibles.forEach(function (c) {
      let essais = 0, meilleur = null, distMin = 0.30;
      for (; ;) {
        const p = { x: 0.07 + alea() * 0.86, y: 0.12 + alea() * 0.76, s: 0.046, e: c.emoji, r: 0.034 };
        if (posees.every(function (q) { return distance(p, q) >= distMin; })) { meilleur = p; break; }
        essais++;
        if (essais % 60 === 0) distMin *= 0.85;   // assouplit si la zone est trop petite
        if (essais > 400) { meilleur = p; break; }
      }
      posees.push(meilleur);
    });
    return posees;
  }

  /** Positions des cibles à partir des zones d'une image fournie dans config.js. */
  function ciblesImage(cibles, zones) {
    return cibles.map(function (c, i) { return { x: zones[i].x, y: zones[i].y, s: 0.046, e: c.emoji, r: zones[i].r }; });
  }

  GS.lynxScene = {
    RATIO: RATIO,

    cibles: function (graine, manche, mancheCfg) {
      if (mancheCfg.image && mancheCfg.zones) return ciblesImage(mancheCfg.cibles, mancheCfg.zones);
      return placerCibles(graine, manche, mancheCfg.cibles);
    },

    generer: function (graine, manche, mancheCfg, densite) {
      const cibles = this.cibles(graine, manche, mancheCfg);
      const interdits = mancheCfg.cibles.map(function (c) { return c.emoji; });
      const pool = PIEGES.filter(function (e) { return interdits.indexOf(e) === -1; });
      const alea = GS.prng(graine * 31 + manche * 977 + 5);
      const pieges = [];
      const maxEssais = densite * 40;
      for (let essais = 0; pieges.length < densite && essais < maxEssais; essais++) {
        const s = 0.026 + alea() * 0.03;
        const p = { x: 0.015 + alea() * 0.97, y: 0.02 + alea() * 0.96, s: s, e: pool[Math.floor(alea() * pool.length)], rot: (alea() - 0.5) * 1.2 };
        // jamais de piège qui touche une cible ; entre eux, un léger chevauchement est toléré (scène dense)
        const gene = cibles.some(function (c) { return distance(p, c) < c.r + s * 0.6 + 0.012; });
        if (gene) continue;
        const trop = pieges.some(function (q) { return distance(p, q) < (p.s + q.s) * 0.42; });
        if (trop) continue;
        pieges.push(p);
      }
      cibles.forEach(function (c, i) { c.rot = i === 1 ? 0.12 : i === 2 ? -0.15 : -0.08; });
      return { graine: graine, pieges: pieges, cibles: cibles };
    },

    /** Dessine le décor puis les éléments. (w, h) en pixels CSS ; le contexte est déjà mis à l'échelle. */
    dessiner: function (ctx, w, h, scene) {
      const dec = GS.prng(scene.graine * 13 + 101);
      // Herbe
      const herbe = ctx.createLinearGradient(0, 0, w, h);
      herbe.addColorStop(0, '#5fbf5a'); herbe.addColorStop(1, '#3f9c45');
      ctx.fillStyle = herbe; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = Math.max(1, w / 900);
      for (let i = 0; i < 900; i++) {
        const x = dec() * w, y = dec() * h, l = (4 + dec() * 8) * (w / 1280);
        ctx.strokeStyle = dec() > 0.5 ? 'rgba(20,90,30,0.28)' : 'rgba(190,240,140,0.28)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (dec() - 0.5) * 4, y - l); ctx.stroke();
      }
      // Allées courbes
      [[0.0, 0.25 + dec() * 0.2, 0.3, dec() * 0.5, 0.65, 0.5 + dec() * 0.5, 1.0, 0.55 + dec() * 0.2],
        [0.15 + dec() * 0.2, 0.0, 0.1 + dec() * 0.5, 0.45, 0.6 + dec() * 0.3, 0.6, 0.8 + dec() * 0.15, 1.0]].forEach(function (c) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#b79a5b'; ctx.lineWidth = w * 0.062;
        ctx.beginPath(); ctx.moveTo(c[0] * w, c[1] * h); ctx.bezierCurveTo(c[2] * w, c[3] * h, c[4] * w, c[5] * h, c[6] * w, c[7] * h); ctx.stroke();
        ctx.strokeStyle = '#e9d9a6'; ctx.lineWidth = w * 0.05;
        ctx.beginPath(); ctx.moveTo(c[0] * w, c[1] * h); ctx.bezierCurveTo(c[2] * w, c[3] * h, c[4] * w, c[5] * h, c[6] * w, c[7] * h); ctx.stroke();
      });
      // Mare
      const mx = (0.12 + dec() * 0.25) * w, my = (0.55 + dec() * 0.25) * h;
      const mare = ctx.createRadialGradient(mx, my, 5, mx, my, w * 0.12);
      mare.addColorStop(0, '#7fd6ff'); mare.addColorStop(1, '#2f86c9');
      ctx.fillStyle = '#2a6a99'; ctx.beginPath(); ctx.ellipse(mx, my, w * 0.126, h * 0.126, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mare; ctx.beginPath(); ctx.ellipse(mx, my, w * 0.118, h * 0.118, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = w * 0.003;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(mx - w * 0.02, my - h * 0.02, w * (0.03 + i * 0.026), h * (0.02 + i * 0.022), 0.2, 3.6, 5.2); ctx.stroke(); }
      // Bac à sable
      const bx = (0.62 + dec() * 0.25) * w, by = (0.1 + dec() * 0.2) * h, bw = w * 0.15, bh = h * 0.2;
      ctx.fillStyle = '#9a6b2f'; ctx.beginPath(); ctx.roundRect(bx - 6, by - 6, bw + 12, bh + 12, 14); ctx.fill();
      ctx.fillStyle = '#f2d68f'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
      ctx.fillStyle = 'rgba(160,110,40,0.35)';
      for (let i = 0; i < 70; i++) ctx.fillRect(bx + dec() * bw, by + dec() * bh, 2, 2);
      // Arbres et bancs
      for (let i = 0; i < 7; i++) {
        const tx = dec() * w, ty = dec() * h, r = w * (0.03 + dec() * 0.025);
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(tx + r * 0.2, ty + r * 0.35, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1f7a35'; ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2e9a46'; ctx.beginPath(); ctx.arc(tx - r * 0.25, ty - r * 0.25, r * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        const kx = dec() * w, ky = dec() * h;
        ctx.fillStyle = '#7a4a22'; ctx.fillRect(kx, ky, w * 0.04, h * 0.018);
        ctx.fillStyle = '#4e2e12'; ctx.fillRect(kx + w * 0.004, ky + h * 0.018, w * 0.004, h * 0.02); ctx.fillRect(kx + w * 0.032, ky + h * 0.018, w * 0.004, h * 0.02);
      }
      // Éléments : pièges d'abord, cibles par-dessus (jamais recouvertes)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      function emoji(p) {
        ctx.save(); ctx.translate(p.x * w, p.y * h); ctx.rotate(p.rot || 0);
        ctx.font = Math.round(p.s * w) + 'px ' + POLICE;
        ctx.fillText(p.e, 0, 0); ctx.restore();
      }
      scene.pieges.forEach(emoji);
      scene.cibles.forEach(emoji);
    }
  };
})(window.GrandShow);
