/* Démarrage : construit l'interface selon le rôle (télé / régie), le routeur de vues, le clavier et la liaison télé-régie. */
(function (GS) {
  'use strict';

  const BATTEMENT_MS = 1500;
  const DELAI_PERTE_MS = 4800;

  // Deux façons de choisir la page : fichiers séparés (data-role) ou fichier unique (?regie dans l'adresse)
  const paramsUrl = (function () { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  const fichierUnique = document.body.dataset.page === 'unique';
  const role = (fichierUnique ? paramsUrl.has('regie') : document.body.dataset.role === 'regie') ? 'regie' : 'tv';

  /** Adresse de la page « regie » ou « tele » (le même fichier, avec un paramètre, en version fichier unique). */
  function urlPage(cible) {
    const base = location.href.split('#')[0].split('?')[0];
    if (fichierUnique) return base + (cible === 'regie' ? '?regie=1' : '?affichage=1');
    return cible === 'regie' ? 'regie.html' : 'index.html?affichage=1';
  }
  let mode = 'single';
  const sections = {};
  let dernierBattementTele = 0, dernierBattementRegie = 0, teleSonPret = true, teleMode = '';
  let equipeEnAttente = -1, minuteurEquipe = 0;
  const debutPage = Date.now();

  GS.basculerPleinEcran = function () {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { GS.ui.toast('Plein écran indisponible : utilisez F11'); }
  };

  /** Appelé par le blind test quand Chrome refuse de lancer l'audio sans geste préalable. */
  GS.signalerSonBloque = function (bloque) {
    const b = GS.$('#son-bloque');
    if (b) b.hidden = !bloque && GS.sound.pret();
  };

  function determinerMode() {
    if (role === 'regie') return 'regie';
    if (paramsUrl.get('affichage') === '1') { GS.session.ecrire('mode', 'display'); return 'display'; }
    return GS.session.lire('mode', 'single') === 'display' ? 'display' : 'single';
  }

  function changerModeEtRecharger(nouveau) {
    GS.session.ecrire('mode', nouveau);
    try {
      const url = new URL(location.href);
      url.searchParams.delete('affichage');
      history.replaceState(null, '', url.toString());
    } catch (e) { /* tant pis : le mode est de toute façon mémorisé */ }
    location.reload();
  }

  // ---------------------------------------------------------------- construction
  function construire() {
    document.body.dataset.mode = mode;
    document.title = GS.config.titre + (role === 'regie' ? ' — Régie' : '');

    const tableau = GS.el('header', { id: 'tableau' });
    const scene = GS.el('main', { id: 'scene' });
    const pied = GS.el('footer', { id: 'pied', class: 'controle' });
    document.body.appendChild(GS.el('div', { id: 'fond-grille', 'aria-hidden': 'true' }));
    document.body.appendChild(GS.el('div', { id: 'app' }, tableau, scene, pied));
    document.body.appendChild(GS.el('div', { id: 'toasts', 'aria-live': 'polite' }));
    GS.scoreboard.monter(tableau);

    function creerSection(id, couleur) {
      const s = GS.el('section', { class: 'vue', id: 'vue-' + id, hidden: true, style: couleur ? { '--c': couleur } : null });
      scene.appendChild(s);
      return s;
    }
    const hub = creerSection('hub');
    GS.hub.monter(hub);
    sections.hub = { el: hub, montage: null, actif: false };
    const pod = creerSection('podium', '#ffe03b');
    sections.podium = { el: pod, montage: GS.podium.monter(pod), actif: false };
    GS.gameOrder.forEach(function (id) {
      const jeu = GS.games[id];
      const el = creerSection(id, jeu.couleur);
      el.classList.add('vue-jeu');
      sections[id] = { el: el, montage: jeu.monter(el, { mode: mode }), actif: false };
    });
    GS.core.surRendu(rendreRouteur);

    // Pied de page : retour accueil + liaison télé/régie
    const bAccueil = GS.bouton('🏠 Retour à l\'accueil', function () { GS.core.agir('core', 'vue', { vers: 'hub' }); }, { classe: 'btn-violet', aria: 'Retour à l\'accueil' });
    bAccueil.id = 'bouton-accueil';
    pied.appendChild(bAccueil);
    if (role === 'regie') {
      pied.appendChild(GS.el('div', { id: 'etat-tele', class: 'etat-liaison perdue', role: 'status' }, '🔴 Télé non détectée'));
      pied.appendChild(GS.bouton('📺 Ouvrir la télé', ouvrirTele, { classe: 'btn-cyan btn-petit' }));
    } else {
      pied.appendChild(GS.bouton('🖥️ Ouvrir la régie', ouvrirRegie, { classe: 'btn-cyan btn-petit', aria: 'Ouvrir la régie dans une nouvelle fenêtre' }));
    }

    // Bandeaux
    if (mode !== 'display' && GS.configProblemes.length) {
      const detail = GS.el('ul', { hidden: true }, GS.configProblemes.map(function (p) { return GS.el('li', null, p); }));
      const bandeau = GS.el('div', { id: 'bandeau-config', role: 'alert' },
        GS.el('button', { type: 'button', onclick: function () { detail.hidden = !detail.hidden; } },
          '⚠️ ' + GS.configProblemes.length + ' problème(s) dans config.js — cliquer pour le détail'), detail);
      document.body.appendChild(bandeau);
    }
    if (role === 'tv') {
      document.body.appendChild(GS.el('div', { id: 'son-bloque', role: 'button', tabindex: '0', hidden: true }, '🔊 Cliquez n\'importe où sur cet écran pour activer le son'));
      document.body.appendChild(GS.el('button', { id: 'reprise', type: 'button', hidden: true, onclick: function () { changerModeEtRecharger('single'); } },
        '⚠️ Régie non détectée — cliquer ici pour reprendre les commandes sur cet écran'));
    }
    if (role === 'tv' && mode === 'display') {
      document.body.appendChild(GS.el('div', { id: 'attente-regie', hidden: true }, 'En attente de la régie…'));
    }
  }

  function ouvrirRegie() {
    const fen = window.open(urlPage('regie'), 'grandshow-regie');
    if (!fen) { GS.ui.toast('Fenêtre bloquée : autorisez les fenêtres surgissantes pour ce site.', 5000); return; }
    changerModeEtRecharger('display');
  }
  function ouvrirTele() {
    const fen = window.open(urlPage('tele'), 'grandshow-tv');
    if (!fen) GS.ui.toast('Fenêtre bloquée : autorisez les fenêtres surgissantes pour ce site.', 5000);
  }

  // ---------------------------------------------------------------- routeur
  function rendreRouteur(etat) {
    Object.keys(sections).forEach(function (id) {
      const s = sections[id], actif = etat.vue === id;
      if (actif && !s.actif) {
        s.actif = true;
        s.el.hidden = false;
        s.el.classList.remove('entree'); void s.el.offsetWidth; s.el.classList.add('entree');
        if (s.montage) { s.montage.rendre(etat.jeux[id], etat); s.montage.afficher(); }
      } else if (!actif && s.actif) {
        s.actif = false;
        s.el.hidden = true;
        if (s.montage) s.montage.masquer();   // coupe audio, chronos, boucles d'animation
      } else if (actif && s.montage) {
        s.montage.rendre(etat.jeux[id], etat);
      }
    });
    const accueil = GS.$('#bouton-accueil');
    if (accueil) accueil.hidden = etat.vue === 'hub';
    document.body.dataset.vue = etat.vue;
  }

  // ---------------------------------------------------------------- clavier
  function estChampDeSaisie(cible) {
    if (!cible) return false;
    const t = cible.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || cible.isContentEditable;
  }

  function surTouche(ev) {
    if (ev.defaultPrevented || estChampDeSaisie(ev.target)) return;
    const touche = ev.key;
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (touche === 'f' || touche === 'F')) { ev.preventDefault(); GS.basculerPleinEcran(); return; }
    if (mode === 'display') return;

    if ((ev.ctrlKey || ev.metaKey) && (touche === 'z' || touche === 'Z')) { ev.preventDefault(); GS.core.agir('core', 'annuler'); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const surBouton = ev.target && (ev.target.tagName === 'BUTTON' || ev.target.tagName === 'A');
    const etat = GS.core.state;
    const jeu = GS.games[etat.vue];

    if (touche === '?' || touche === 'h' || touche === 'H') { ev.preventDefault(); GS.ui.basculerAide(); return; }
    if (touche === 'Escape') {
      if (GS.$('.modale-fond')) return;
      if (etat.vue !== 'hub') { ev.preventDefault(); GS.core.agir('core', 'vue', { vers: 'hub' }); }
      return;
    }
    if (touche >= '1' && touche <= '9' && +touche <= GS.config.equipes.length) {
      equipeEnAttente = +touche - 1;
      clearTimeout(minuteurEquipe);
      minuteurEquipe = setTimeout(function () { equipeEnAttente = -1; }, 3000);
      GS.ui.toast(GS.config.equipes[equipeEnAttente].nom + ' : appuyez sur + ou -', 1800);
      return;
    }
    if (equipeEnAttente >= 0 && ['+', '=', '-', '_'].indexOf(touche) !== -1) {
      ev.preventDefault();
      const positif = touche === '+' || touche === '=';
      const pts = GS.config.points.filter(function (p) { return positif ? p > 0 : p < 0; })[0] || (positif ? 50 : -50);
      GS.core.agir('core', 'score', { equipe: equipeEnAttente, delta: pts });
      equipeEnAttente = -1; clearTimeout(minuteurEquipe);
      return;
    }
    if (!jeu || !jeu.touches) return;
    let commande = null;
    if (touche === ' ' || touche === 'Spacebar') { if (surBouton) return; commande = jeu.touches.principal; }
    else if (touche === 'r' || touche === 'R') commande = jeu.touches.reveler;
    else if (touche === 'ArrowRight' || touche === 'n' || touche === 'N') commande = jeu.touches.suivant;
    if (!commande) return;
    ev.preventDefault();
    const r = commande(etat.jeux[etat.vue]);
    if (r) GS.core.agir(etat.vue, r[0], r[1]);
  }

  // ---------------------------------------------------------------- liaison télé / régie
  function mettreAJourLiaison() {
    const maintenant = Date.now();
    if (role === 'regie') {
      const vivante = maintenant - dernierBattementTele < DELAI_PERTE_MS;
      const el = GS.$('#etat-tele');
      if (!el) return;
      el.classList.toggle('perdue', !vivante);
      el.classList.toggle('ok', vivante);
      el.textContent = vivante ? (teleSonPret ? '🟢 Télé connectée' : '🟢 Télé connectée — 🔇 cliquez sur la télé pour activer le son') : '🔴 Télé non détectée';
      el.title = 'Liaison : ' + GS.sync.transportActif;
    } else if (mode === 'display') {
      const depuis = maintenant - debutPage;
      const perdue = maintenant - dernierBattementRegie > 3 * DELAI_PERTE_MS && depuis > 3 * DELAI_PERTE_MS;
      GS.$('#reprise').hidden = !perdue;
      GS.$('#attente-regie').hidden = !(dernierBattementRegie === 0 && depuis > 1500 && !perdue);
    }
  }

  function brancherLiaison() {
    GS.sync.sur('battement', function (d) {
      if (role === 'regie' && d.role === 'tv') {
        dernierBattementTele = Date.now(); teleSonPret = d.audio; teleMode = d.mode;
        if (teleMode === 'single') GS.sync.envoyer('prise-main', {});   // la télé passe en affichage seul
        mettreAJourLiaison();
      } else if (role === 'tv' && mode === 'display' && d.role === 'regie') {
        dernierBattementRegie = Date.now();
        if (d.cle !== GS.core._cleEtatRecu) GS.sync.envoyer('besoin-etat', {});
      }
    });
    GS.sync.sur('prise-main', function () {
      if (role === 'tv' && mode === 'single') changerModeEtRecharger('display');
    });

    function battre() {
      GS.sync.envoyer('battement', {
        role: role, mode: mode, audio: GS.sound.pret(),
        cle: GS.core.epoch + ':' + GS.core.state.seq
      });
      mettreAJourLiaison();
    }
    setInterval(battre, BATTEMENT_MS);
    battre();
    setInterval(mettreAJourLiaison, 1000);
    if (mode === 'display') GS.sync.envoyer('besoin-etat', {});
    if (GS.core.estAutorite()) GS.core.diffuser();
  }

  function brancherSon() {
    if (role !== 'tv') return;
    const banniere = GS.$('#son-bloque');
    const majBanniere = function () { banniere.hidden = GS.sound.pret(); };
    const debloquer = function () {
      GS.sound.debloquer();
      majBanniere();
      GS.core.rendre();   // relance la lecture audio éventuellement refusée
      setTimeout(majBanniere, 300);
    };
    document.addEventListener('pointerdown', debloquer, true);
    document.addEventListener('keydown', debloquer, true);
    banniere.addEventListener('click', debloquer);
    majBanniere();
  }

  // ---------------------------------------------------------------- démarrage
  function demarrer() {
    GS.chargerConfig();
    mode = determinerMode();
    GS.sync.init();
    GS.core.init(role, mode);
    construire();
    document.addEventListener('keydown', surTouche);
    // Un clic souris ne doit pas laisser le focus sur le bouton (sinon Espace le réactiverait)
    document.addEventListener('click', function (ev) {
      const b = ev.target.closest && ev.target.closest('button');
      if (b && ev.detail > 0) b.blur();
    });
    brancherLiaison();
    brancherSon();
    GS.core.rendre();
    setInterval(GS.core.verifierChronos, 250);
  }

  demarrer();
})(window.GrandShow);
