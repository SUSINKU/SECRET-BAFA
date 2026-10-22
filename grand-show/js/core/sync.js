/*
 * Synchronisation télé <-> régie.
 *  - Transport principal : BroadcastChannel.
 *  - Repli : événement « storage » de localStorage (si BroadcastChannel est absent ou ne fonctionne
 *    pas entre les deux fenêtres, par exemple en file://).
 *  Tant qu'aucun message n'est arrivé par BroadcastChannel, on émet sur les deux transports ;
 *  les doublons sont éliminés grâce à l'identifiant unique de chaque message.
 *  Pour tester un transport précis : index.html?transport=storage ou ?transport=bc
 */
(function (GS) {
  'use strict';

  const NOM_CANAL = 'grandshow-v1';
  const CLE_STOCKAGE = GS.STORAGE_PREFIXE + 'msg';
  const moi = GS.idAleatoire();
  const ecouteurs = {};
  const dejaVus = [];
  let canal = null;
  let bcConfirme = false;
  let forcer = null;

  const sync = GS.sync = { transportActif: 'aucun' };

  function mode() {
    if (forcer === 'storage') return { bc: false, ls: true };
    if (forcer === 'bc') return { bc: !!canal, ls: false };
    return { bc: !!canal, ls: !bcConfirme };
  }

  function majTransportActif() {
    const m = mode();
    sync.transportActif = m.bc && m.ls ? 'BroadcastChannel + localStorage (test en cours)'
      : m.bc ? 'BroadcastChannel' : m.ls ? 'localStorage (événement storage)' : 'aucun';
  }

  function recevoir(msg, via) {
    if (!msg || msg.gs !== 1 || msg.de === moi) return;
    if (dejaVus.indexOf(msg.id) !== -1) return;
    dejaVus.push(msg.id);
    if (dejaVus.length > 300) dejaVus.shift();
    if (via === 'bc' && !bcConfirme) { bcConfirme = true; majTransportActif(); }
    (ecouteurs[msg.type] || []).forEach(function (fn) {
      try { fn(msg.data, msg); } catch (e) { console.error('[Grand Show] Erreur dans le traitement du message', msg.type, e); }
    });
  }

  sync.init = function () {
    try { forcer = new URLSearchParams(location.search).get('transport'); } catch (e) { forcer = null; }
    if (typeof BroadcastChannel !== 'undefined' && forcer !== 'storage') {
      try {
        canal = new BroadcastChannel(NOM_CANAL);
        canal.onmessage = function (e) { recevoir(e.data, 'bc'); };
      } catch (e) { canal = null; }
    }
    window.addEventListener('storage', function (e) {
      if (e.key !== CLE_STOCKAGE || !e.newValue) return;
      if (forcer === 'bc') return;
      try { recevoir(JSON.parse(e.newValue), 'ls'); } catch (err) { /* message illisible : ignoré */ }
    });
    majTransportActif();
  };

  sync.envoyer = function (type, data) {
    const msg = { gs: 1, id: GS.idAleatoire(), de: moi, type: type, data: data };
    const m = mode();
    if (m.bc && canal) { try { canal.postMessage(msg); } catch (e) { /* message non clonable */ } }
    if (m.ls) {
      try { window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(msg)); } catch (e) { /* stockage indisponible */ }
    }
  };

  sync.sur = function (type, fn) { (ecouteurs[type] = ecouteurs[type] || []).push(fn); };
})(window.GrandShow);
