/* Outils communs aux mini-jeux. */
(function (GS) {
  'use strict';

  /**
   * Un jeu fournit :
   *  id, numero, emoji, couleur, titre(cfg), info(cfg)
   *  etatInitial(cfg) -> état sérialisable (contient `chrono` s'il y a un chrono)
   *  reduire(etatJeu, action, payload, ctx) -> false si rien n'a changé
   *  entrer(etatJeu) / quitter(etatJeu) : appelés par l'autorité au changement de vue
   *  touches : { principal, reveler, suivant } -> [action, payload] | null
   *  monter(racine, contexte) -> { rendre(etatJeu, etatGlobal), afficher(), masquer() }
   *  resynchroniser(etatJeu) : (facultatif) renvoie des données hors état à la télé qui se reconnecte
   */
  GS.enregistrerJeu = function (def) {
    GS.games[def.id] = def;
    GS.gameOrder.push(def.id);
    GS.gameOrder.sort(function (a, b) { return GS.games[a].numero - GS.games[b].numero; });
  };

  /** Vérifie qu'un fichier (audio ou image) se charge ; résultat mis en cache. */
  const cacheSondes = {};
  GS.sonder = function (url, type) {
    if (!url) return Promise.resolve(false);
    const cle = type + ':' + url;
    if (cacheSondes[cle]) return cacheSondes[cle];
    cacheSondes[cle] = new Promise(function (resolve) {
      const noeud = type === 'audio' ? new Audio() : new Image();
      const fin = function (ok) { noeud.onerror = noeud.onloadedmetadata = noeud.onload = null; resolve(ok); };
      noeud.onerror = function () { fin(false); };
      if (type === 'audio') { noeud.preload = 'metadata'; noeud.onloadedmetadata = function () { fin(true); }; }
      else noeud.onload = function () { fin(true); };
      noeud.src = url;
      setTimeout(function () { fin(false); }, 6000);
    });
    return cacheSondes[cle];
  };

  /** Bloc « Manche X / Y » */
  GS.pastilleManche = function () {
    return GS.el('div', { class: 'pastille-manche' }, 'Manche 1 / 1');
  };

  /** Fait défiler les manches : retourne l'index suivant (revient à 0 après la dernière). */
  GS.mancheSuivante = function (index, total) { return index + 1 >= total ? 0 : index + 1; };
})(window.GrandShow);
