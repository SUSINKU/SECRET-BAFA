/*
 * Chrono générique.
 * - Modèle : objet JSON { dur, elapsed, running, at } (secondes, `at` = GS.now() au dernier changement).
 *   Le temps restant se déduit du modèle et de l'horloge : aucune dérive, et le même modèle
 *   donne le même résultat sur la télé et sur la régie.
 * - Vue : barre qui se vide + nombre géant, animée par requestAnimationFrame.
 */
(function (GS) {
  'use strict';

  const Chrono = GS.Chrono = {};

  Chrono.creer = function (dur) { return { dur: dur, elapsed: 0, running: false, at: 0 }; };

  Chrono.ecoule = function (m) {
    const brut = m.elapsed + (m.running ? (GS.now() - m.at) / 1000 : 0);
    return GS.clamp(brut, 0, m.dur);
  };
  Chrono.restant = function (m) { return Math.max(0, m.dur - Chrono.ecoule(m)); };
  Chrono.termine = function (m) { return m.dur > 0 && Chrono.restant(m) <= 0.0005; };
  /** 'attente' (jamais lancé), 'marche', 'pause' ou 'fini'. */
  Chrono.phase = function (m) {
    if (Chrono.termine(m)) return 'fini';
    if (m.running) return 'marche';
    return m.elapsed > 0 ? 'pause' : 'attente';
  };

  Chrono.demarrer = function (m) {
    if (m.running || Chrono.termine(m)) return;
    m.running = true; m.at = GS.now();
  };
  Chrono.pause = function (m) {
    if (!m.running) return;
    m.elapsed = Chrono.ecoule(m); m.running = false; m.at = GS.now();
  };
  Chrono.reinitialiser = function (m, dur) {
    if (dur !== undefined) m.dur = dur;
    m.elapsed = 0; m.running = false; m.at = GS.now();
  };
  /** Fige un chrono arrivé à zéro (appelé par l'autorité). */
  Chrono.normaliser = function (m) {
    if (m.running && Chrono.termine(m)) { m.elapsed = m.dur; m.running = false; m.at = GS.now(); return true; }
    return false;
  };

  /** Couleur de la barre : vert -> jaune -> rouge selon la part restante. */
  function couleur(part) { return 'hsl(' + Math.round(GS.clamp(part, 0, 1) * 125) + ' 95% 55%)'; }

  /**
   * Vue du chrono.
   *  opts.geant : taille du nombre (classe CSS), opts.bips : bips des 5 dernières secondes.
   *  vue.modele(m) : fournit le modèle ; vue.demarrer()/arreter() : boucle d'animation.
   *  vue.surFin / vue.surPhase : rappels ; vue.masquerTempsEcoule : cache le grand texte.
   */
  Chrono.vue = function (opts) {
    opts = opts || {};
    const nombre = GS.el('div', { class: 'chrono-nombre', 'aria-live': 'off' }, '0');
    const remplissage = GS.el('div', { class: 'chrono-remplissage' });
    const barre = GS.el('div', { class: 'chrono-barre', role: 'progressbar', 'aria-label': 'Temps restant' }, remplissage);
    const racine = GS.el('div', { class: 'chrono ' + (opts.classe || '') }, nombre, barre);
    const surimpression = GS.el('div', { class: 'temps-ecoule', 'aria-hidden': 'true' }, GS.el('span', null, 'TEMPS ÉCOULÉ !'));

    const vue = {
      el: racine, surimpression: surimpression,
      masquerTempsEcoule: false, surPhase: null, surFin: null,
      _m: null, _raf: 0, _dernierTexte: '', _dernierePhase: '', _derniereSeconde: -1
    };

    vue.modele = function (m) { vue._m = m; vue._maj(); };

    vue._maj = function () {
      const m = vue._m; if (!m) return;
      const restant = Chrono.restant(m);
      const phase = Chrono.phase(m);
      const texte = String(Math.ceil(restant - 0.0005));
      if (texte !== vue._dernierTexte) { nombre.textContent = texte; vue._dernierTexte = texte; }
      const part = m.dur > 0 ? restant / m.dur : 0;
      remplissage.style.transform = 'scaleX(' + part.toFixed(4) + ')';
      remplissage.style.background = couleur(part);
      barre.setAttribute('aria-valuenow', texte);
      const urgent = (phase === 'marche' || phase === 'fini') && restant <= 5;
      racine.classList.toggle('urgent', urgent && phase === 'marche');
      racine.classList.toggle('fini', phase === 'fini');
      racine.dataset.phase = phase;
      surimpression.classList.toggle('visible', phase === 'fini' && !vue.masquerTempsEcoule);

      // Bips : un par seconde dans les 5 dernières, uniquement quand le chrono tourne
      if (phase === 'marche' && opts.bips !== false) {
        const sec = Math.ceil(restant);
        if (sec <= 5 && sec >= 1 && sec !== vue._derniereSeconde) GS.sound.jouer('tic');
        vue._derniereSeconde = sec;
      } else if (phase !== 'marche') { vue._derniereSeconde = -1; }

      if (phase !== vue._dernierePhase) {
        const avant = vue._dernierePhase;
        vue._dernierePhase = phase;
        if (phase === 'fini' && avant === 'marche') {
          GS.sound.jouer('buzzer');
          if (vue.surFin) vue.surFin();
        }
        if (vue.surPhase) vue.surPhase(phase, avant);
      }
    };

    vue._boucle = function () { vue._maj(); vue._raf = requestAnimationFrame(vue._boucle); };
    vue.demarrer = function () { if (!vue._raf) vue._raf = requestAnimationFrame(vue._boucle); };
    vue.arreter = function () { if (vue._raf) cancelAnimationFrame(vue._raf); vue._raf = 0; };
    return vue;
  };
})(window.GrandShow);
