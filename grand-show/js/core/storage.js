/* Stockage local sécurisé : l'appli fonctionne même si localStorage est indisponible. */
(function (GS) {
  'use strict';
  const PREFIXE = 'grandshow:';

  function fabrique(getStockage) {
    return {
      lire: function (cle, defaut) {
        try {
          const brut = getStockage().getItem(PREFIXE + cle);
          return brut === null ? defaut : JSON.parse(brut);
        } catch (e) { return defaut; }
      },
      ecrire: function (cle, valeur) {
        try { getStockage().setItem(PREFIXE + cle, JSON.stringify(valeur)); return true; } catch (e) { return false; }
      },
      supprimer: function (cle) {
        try { getStockage().removeItem(PREFIXE + cle); } catch (e) { /* stockage indisponible */ }
      }
    };
  }

  GS.store = fabrique(function () { return window.localStorage; });     // persistant (scores, réglages)
  GS.session = fabrique(function () { return window.sessionStorage; }); // propre à l'onglet (mode télé)
  GS.STORAGE_PREFIXE = PREFIXE;
})(window.GrandShow);
