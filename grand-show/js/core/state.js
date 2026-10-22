/*
 * État de l'application et répartition des rôles.
 *  - Une seule page fait autorité : la régie, ou la télé en « écran unique ».
 *  - L'autorité applique les actions (dispatch), sauvegarde, puis diffuse l'état complet.
 *  - La télé en « affichage seul » applique l'état reçu et le redemande si elle le perd.
 */
(function (GS) {
  'use strict';

  const TAILLE_HISTORIQUE = 50;
  const core = GS.core = {
    role: 'tv',            // 'tv' ou 'regie' (selon la page)
    mode: 'single',        // 'single' (écran unique), 'display' (télé seule) ou 'regie'
    state: null,
    epoch: GS.idAleatoire(),
    historique: [],
    _rendus: [],
    _cleEtatRecu: ''
  };

  core.estAutorite = function () { return core.mode !== 'display'; };

  core.surRendu = function (fn) { core._rendus.push(fn); };

  core.creerEtat = function () {
    const cfg = GS.config;
    const sauvegarde = GS.store.lire('scores', null);
    const scores = cfg.equipes.map(function (_, i) {
      return sauvegarde && typeof sauvegarde[i] === 'number' && isFinite(sauvegarde[i]) ? Math.max(0, sauvegarde[i]) : 0;
    });
    const etat = {
      seq: 0,
      vue: 'hub',
      scores: scores,
      muet: GS.store.lire('muet', false) === true,
      volume: GS.clamp(Number(GS.store.lire('volume', 0.8)) || 0.8, 0, 1),
      confettis: 0,
      jeux: {}
    };
    GS.gameOrder.forEach(function (id) { etat.jeux[id] = GS.games[id].etatInitial(cfg); });
    return etat;
  };

  core.init = function (role, mode) {
    core.role = role; core.mode = mode;
    GS.sound.actif = role === 'tv';
    if (core.estAutorite()) {
      const h = GS.store.lire('historique', []);
      core.historique = Array.isArray(h) ? h.filter(function (x) { return Array.isArray(x) && x.length === GS.config.equipes.length; }).slice(-TAILLE_HISTORIQUE) : [];
    }
    core.state = core.creerEtat();
    GS.sync.sur('etat', function (d) {
      if (core.estAutorite()) return;
      core.state = d.etat;
      core._cleEtatRecu = d.epoch + ':' + d.etat.seq;
      core.rendre();
    });
    GS.sync.sur('fx', function (d) { GS.sound.jouer(d.nom); });
    GS.sync.sur('besoin-etat', function () {
      if (!core.estAutorite()) return;
      core.diffuser();
      GS.gameOrder.forEach(function (id) {
        const g = GS.games[id];
        if (g.resynchroniser) g.resynchroniser(core.state.jeux[id]);
      });
    });
  };

  /** Applique localement les rendus enregistrés. */
  core.rendre = function () {
    GS.sound.muet = !!core.state.muet;
    core._rendus.forEach(function (fn) {
      try { fn(core.state); } catch (e) { console.error('[Grand Show] Erreur de rendu :', e); }
    });
  };

  core.diffuser = function () {
    GS.sync.envoyer('etat', { epoch: core.epoch, etat: core.state });
  };

  /** Effet sonore : joué ici (si cette page fait la sortie audio) et sur l'autre fenêtre. */
  core.fx = function (nom) {
    GS.sound.jouer(nom);
    GS.sync.envoyer('fx', { nom: nom });
  };

  function sauvegarder() {
    GS.store.ecrire('scores', core.state.scores);
    GS.store.ecrire('muet', core.state.muet);
    GS.store.ecrire('volume', core.state.volume);
    GS.store.ecrire('historique', core.historique);
  }

  function reducteurCommun(etat, action, p) {
    switch (action) {
      case 'score': {
        const i = p.equipe;
        if (typeof i !== 'number' || i < 0 || i >= etat.scores.length) return false;
        const apres = Math.max(0, etat.scores[i] + p.delta);
        if (apres === etat.scores[i]) return false;
        core.historique.push(etat.scores.slice());
        if (core.historique.length > TAILLE_HISTORIQUE) core.historique.shift();
        core.fx(p.delta > 0 ? 'monte' : 'descend');
        etat.scores[i] = apres;
        return true;
      }
      case 'scoreZero':
        if (etat.scores.every(function (s) { return s === 0; })) return false;
        core.historique.push(etat.scores.slice());
        etat.scores = etat.scores.map(function () { return 0; });
        core.fx('descend');
        return true;
      case 'annuler':
        if (!core.historique.length) return false;
        etat.scores = core.historique.pop();
        core.fx('clic');
        return true;
      case 'muet':
        etat.muet = !etat.muet;
        return true;
      case 'volume':
        etat.volume = GS.clamp(Number(p.valeur), 0, 1);
        return true;
      case 'vue': {
        const vers = p.vers;
        if (vers === etat.vue) return false;
        if (vers !== 'hub' && vers !== 'podium' && !GS.games[vers]) return false;
        const ancien = GS.games[etat.vue];
        if (ancien && ancien.quitter) ancien.quitter(etat.jeux[etat.vue]);   // met en pause chronos / musique
        etat.vue = vers;
        const nouveau = GS.games[vers];
        if (nouveau && nouveau.entrer) nouveau.entrer(etat.jeux[vers]);
        if (vers === 'podium') { etat.confettis++; core.fx('fanfare'); }
        return true;
      }
      case 'confettis':
        etat.confettis++; core.fx('fanfare');
        return true;
      default:
        return false;
    }
  }

  /**
   * Point d'entrée unique des actions. cible = 'core' ou l'identifiant d'un jeu.
   * Ne fait rien sur une télé en affichage seul.
   */
  core.agir = function (cible, action, payload) {
    if (!core.estAutorite()) return;
    const p = payload || {};
    let change;
    if (cible === 'core') change = reducteurCommun(core.state, action, p);
    else {
      const jeu = GS.games[cible];
      if (!jeu) return;
      change = jeu.reduire(core.state.jeux[cible], action, p, { fx: core.fx, config: GS.config, etat: core.state });
    }
    if (change === false) return;
    core.state.seq++;
    sauvegarder();
    core.rendre();
    core.diffuser();
  };

  /** Fige les chronos arrivés à zéro (l'affichage, lui, se déduit déjà de l'horloge). */
  core.verifierChronos = function () {
    if (!core.estAutorite()) return;
    let modifie = false;
    GS.gameOrder.forEach(function (id) {
      const m = core.state.jeux[id].chrono;
      if (m && GS.Chrono.normaliser(m)) modifie = true;
    });
    if (modifie) { core.state.seq++; core.rendre(); core.diffuser(); }
  };

  core.classement = function (scores) {
    return scores.map(function (s, i) { return { equipe: i, score: s }; })
      .sort(function (a, b) { return b.score - a.score || a.equipe - b.equipe; });
  };
})(window.GrandShow);
