/* Espace de noms global : tous les modules s'y accrochent (compatible file://). */
window.GrandShow = window.GrandShow || {};

(function (GS) {
  'use strict';

  GS.games = {};          // jeux enregistrés (clé = id)
  GS.gameOrder = [];      // ordre d'affichage dans l'accueil

  GS.$ = function (sel, racine) { return (racine || document).querySelector(sel); };

  /** Crée un élément : el('div', {class:'x', onclick: fn, 'aria-label': '…'}, enfants…) */
  GS.el = function (tag, props) {
    const noeud = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (cle) {
        const val = props[cle];
        if (val === undefined || val === null || val === false) return;
        if (cle === 'class') noeud.className = val;
        else if (cle === 'text') noeud.textContent = val;
        else if (cle === 'style' && typeof val === 'object') {
          Object.keys(val).forEach(function (k) {
            if (k.indexOf('--') === 0) noeud.style.setProperty(k, val[k]); else noeud.style[k] = val[k];
          });
        }
        else if (cle.indexOf('on') === 0 && typeof val === 'function') noeud.addEventListener(cle.slice(2), val);
        else noeud.setAttribute(cle, val === true ? '' : val);
      });
    }
    for (let i = 2; i < arguments.length; i++) ajouterEnfant(noeud, arguments[i]);
    return noeud;
  };
  function ajouterEnfant(parent, enfant) {
    if (enfant === null || enfant === undefined || enfant === false) return;
    if (Array.isArray(enfant)) enfant.forEach(function (e) { ajouterEnfant(parent, e); });
    else parent.appendChild(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }

  /**
   * Résout un chemin de ressource. Dans la version « fichier unique », les musiques et images sont
   * embarquées dans la page (window.GRAND_SHOW_ASSETS) ; sinon le chemin est utilisé tel quel.
   */
  GS.asset = function (chemin) {
    const emb = window.GRAND_SHOW_ASSETS;
    return (emb && chemin && emb[chemin]) || chemin;
  };

  GS.clamp = function (v, min, max) { return Math.min(max, Math.max(min, v)); };
  GS.lerp = function (a, b, t) { return a + (b - a) * t; };

  /** Horloge monotone partagée entre fenêtres (même machine) : ms depuis l'époque. */
  GS.now = function () { return performance.timeOrigin + performance.now(); };

  /** Générateur pseudo-aléatoire déterministe (même graine => même suite). */
  GS.prng = function (graine) {
    let a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Mélange de Fisher-Yates (copie). */
  GS.melanger = function (tableau, alea) {
    const rnd = alea || Math.random;
    const copie = tableau.slice();
    for (let i = copie.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = copie[i]; copie[i] = copie[j]; copie[j] = tmp;
    }
    return copie;
  };

  GS.idAleatoire = function () { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); };

  /** Clone profond d'un objet JSON. */
  GS.copie = function (o) { return JSON.parse(JSON.stringify(o)); };

  /**
   * Ajuste `boite` à la plus grande taille de ratio `ratio` (largeur/hauteur)
   * contenue dans `conteneur`. Retourne une fonction pour arrêter l'observation.
   */
  GS.ajusterBoite = function (conteneur, boite, ratio, surChangement) {
    function calculer() {
      const l = conteneur.clientWidth, h = conteneur.clientHeight;
      if (!l || !h) return;
      let w = l, hh = l / ratio;
      if (hh > h) { hh = h; w = h * ratio; }
      boite.style.width = Math.floor(w) + 'px';
      boite.style.height = Math.floor(hh) + 'px';
      if (surChangement) surChangement();
    }
    let obs = null;
    if (window.ResizeObserver) { obs = new ResizeObserver(calculer); obs.observe(conteneur); }
    window.addEventListener('resize', calculer);
    calculer();
    return { recalculer: calculer, arreter: function () { if (obs) obs.disconnect(); window.removeEventListener('resize', calculer); } };
  };

  /** Bouton « façon jeu télé ». */
  GS.bouton = function (texte, surClic, opts) {
    opts = opts || {};
    const b = GS.el('button', { type: 'button', class: 'btn ' + (opts.classe || ''), 'aria-label': opts.aria, title: opts.titre });
    b.textContent = texte;
    if (surClic) b.addEventListener('click', surClic);
    return b;
  };
})(window.GrandShow);
