/* Accueil : grille 2x2 des mini-jeux + accès aux résultats. */
(function (GS) {
  'use strict';

  GS.hub = {
    monter: function (section) {
      const cartes = GS.gameOrder.map(function (id) {
        const jeu = GS.games[id];
        const carte = GS.el('button', {
          type: 'button', class: 'carte-jeu', style: { '--c': jeu.couleur }, 'data-jeu': id,
          'aria-label': 'Jeu ' + jeu.numero + ' : ' + jeu.titre(GS.config),
          onclick: function () { GS.core.agir('core', 'vue', { vers: id }); }
        },
        GS.el('span', { class: 'carte-emoji', 'aria-hidden': 'true' }, jeu.emoji),
        GS.el('span', { class: 'carte-numero' }, 'JEU ' + jeu.numero),
        GS.el('span', { class: 'carte-titre' }, jeu.titre(GS.config)),
        GS.el('span', { class: 'carte-info' }, jeu.info(GS.config)));
        return carte;
      });
      const resultats = GS.bouton('🏆 Résultats', function () { GS.core.agir('core', 'vue', { vers: 'podium' }); },
        { classe: 'btn-jaune btn-resultats controle', aria: 'Afficher les résultats' });
      section.appendChild(GS.el('div', { class: 'grille-jeux' }, cartes));
      section.appendChild(GS.el('div', { class: 'hub-pied' }, resultats));
    }
  };
})(window.GrandShow);
