/* Petits composants d'interface partagés : confirmation, message flottant, aide. */
(function (GS) {
  'use strict';

  const ui = GS.ui = {};

  ui.toast = function (texte, duree) {
    const zone = GS.$('#toasts');
    if (!zone) return;
    const t = GS.el('div', { class: 'toast', role: 'status' }, texte);
    zone.appendChild(t);
    setTimeout(function () { t.classList.add('sortie'); setTimeout(function () { t.remove(); }, 400); }, duree || 2600);
  };

  /** Boîte de confirmation propre à la télé (pas de confirm() natif, trop discret à 5 mètres). */
  ui.confirmer = function (message, texteOui) {
    return new Promise(function (resolve) {
      const precedent = document.activeElement;
      const fermer = function (rep) { fond.remove(); document.removeEventListener('keydown', clavier, true); if (precedent && precedent.focus) precedent.focus(); resolve(rep); };
      const non = GS.bouton('Non, annuler', function () { fermer(false); }, { classe: 'btn-gris' });
      const oui = GS.bouton(texteOui || 'Oui', function () { fermer(true); }, { classe: 'btn-rouge' });
      const fond = GS.el('div', { class: 'modale-fond', role: 'dialog', 'aria-modal': 'true', 'aria-label': message },
        GS.el('div', { class: 'modale' }, GS.el('p', null, message), GS.el('div', { class: 'modale-actions' }, non, oui)));
      function clavier(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(false); }
        if (e.key === 'Enter' && document.activeElement === oui) { e.stopPropagation(); }
      }
      document.addEventListener('keydown', clavier, true);
      document.body.appendChild(fond);
      non.focus();
    });
  };

  const RACCOURCIS = [
    ['Espace', 'Lancer / mettre en pause l\'action principale du jeu'],
    ['R', 'Révéler la réponse'],
    ['→  ou  N', 'Manche suivante'],
    ['Échap', 'Retour à l\'accueil'],
    ['F', 'Plein écran'],
    ['1, 2, 3, 4 puis +', 'Points rapides (+) pour l\'équipe 1, 2, 3 ou 4'],
    ['1, 2, 3, 4 puis -', 'Retirer des points à l\'équipe'],
    ['Ctrl + Z', 'Annuler le dernier changement de score'],
    ['?  ou  H', 'Afficher / masquer cette aide']
  ];

  ui.basculerAide = function () {
    const existante = GS.$('#aide');
    if (existante) { existante.remove(); return; }
    const lignes = RACCOURCIS.map(function (r) {
      return GS.el('tr', null, GS.el('th', null, GS.el('kbd', null, r[0])), GS.el('td', null, r[1]));
    });
    const fond = GS.el('div', { id: 'aide', class: 'modale-fond', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Aide : raccourcis clavier', onclick: function (e) { if (e.target === fond) fond.remove(); } },
      GS.el('div', { class: 'modale modale-large' },
        GS.el('h2', null, 'Raccourcis clavier'),
        GS.el('table', null, GS.el('tbody', null, lignes)),
        GS.el('p', { class: 'aide-note' }, 'Les raccourcis sont désactivés quand on tape dans un champ.'),
        GS.bouton('Fermer', function () { fond.remove(); }, { classe: 'btn-cyan' })));
    document.body.appendChild(fond);
    GS.$('.btn', fond).focus();
  };
})(window.GrandShow);
