/* Sons d'interface générés en Web Audio (aucun fichier). Seule la page « télé » en joue. */
(function (GS) {
  'use strict';

  const son = GS.sound = {
    actif: false,   // true uniquement sur la page qui sort le son (télé)
    muet: false,
    ctx: null
  };

  function contexte() {
    if (!son.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try { son.ctx = new Ctx(); } catch (e) { return null; }
    }
    return son.ctx;
  }

  /** À appeler dans un geste utilisateur : débloque l'audio (politique autoplay de Chrome). */
  son.debloquer = function () {
    const c = contexte();
    if (c && c.state === 'suspended') c.resume().catch(function () { /* sera retenté */ });
    return !!c && c.state === 'running';
  };
  son.pret = function () { return !!son.ctx && son.ctx.state === 'running'; };

  function peutJouer() { return son.actif && !son.muet && GS.config.sons !== false; }

  function ton(c, opts) {
    const t0 = c.currentTime + (opts.delai || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqFin) osc.frequency.exponentialRampToValueAtTime(opts.freqFin, t0 + opts.duree);
    const vol = (opts.vol === undefined ? 0.25 : opts.vol);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duree);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0 + opts.duree + 0.03);
  }

  function bruit(c, delai, duree, vol, filtre) {
    const t0 = c.currentTime + delai;
    const n = Math.floor(c.sampleRate * duree);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filtre || 1200;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t0);
  }

  const catalogue = {
    clic: function (c) { ton(c, { freq: 620, freqFin: 420, duree: 0.06, type: 'triangle', vol: 0.12 }); },
    tic: function (c) { ton(c, { freq: 880, duree: 0.09, type: 'square', vol: 0.12 }); },
    buzzer: function (c) {
      ton(c, { freq: 150, freqFin: 120, duree: 0.9, type: 'sawtooth', vol: 0.35 });
      ton(c, { freq: 155, freqFin: 118, duree: 0.9, type: 'square', vol: 0.18 });
    },
    fanfare: function (c) {
      const seq = [[523, 0], [659, 0.13], [784, 0.26], [1047, 0.42]];
      seq.forEach(function (n) { ton(c, { freq: n[0], delai: n[1], duree: 0.22, type: 'sawtooth', vol: 0.2 }); });
      [523, 659, 784, 1047].forEach(function (f) { ton(c, { freq: f, delai: 0.62, duree: 0.8, type: 'square', vol: 0.1 }); });
    },
    monte: function (c) {
      [523, 659, 784].forEach(function (f, i) { ton(c, { freq: f, delai: i * 0.07, duree: 0.14, type: 'triangle', vol: 0.22 }); });
    },
    descend: function (c) {
      [523, 392, 294].forEach(function (f, i) { ton(c, { freq: f, delai: i * 0.09, duree: 0.16, type: 'triangle', vol: 0.22 }); });
    },
    trouve: function (c) {
      ton(c, { freq: 988, duree: 0.12, type: 'sine', vol: 0.25 });
      ton(c, { freq: 1319, delai: 0.1, duree: 0.3, type: 'sine', vol: 0.25 });
    },
    roulement: function (c) {
      for (let i = 0; i < 14; i++) bruit(c, i * (0.09 - i * 0.002), 0.07, 0.35, 900);
    }
  };

  /** Joue un son par nom. Ne fait rien si la page n'est pas la sortie audio ou si le son est coupé. */
  son.jouer = function (nom) {
    if (!peutJouer() || !catalogue[nom]) return;
    const c = contexte();
    if (!c) return;
    if (c.state === 'suspended') { c.resume().catch(function () { /* en attente d'un geste */ }); }
    if (c.state !== 'running') return;
    try { catalogue[nom](c); } catch (e) { console.warn('[Grand Show] Son impossible :', e); }
  };
})(window.GrandShow);
