'use strict';

let overview = null;

const loginCard = document.getElementById('loginCard');
const consoleBox = document.getElementById('console');

/* ------------------------------------------------------------- connexion */

document.getElementById('adminLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  SB.message('loginMessage', '');
  try {
    await SB.post('/api/admin/login', { password: document.getElementById('adminPassword').value });
    document.getElementById('adminPassword').value = '';
    await refresh();
  } catch (error) {
    SB.message('loginMessage', error.message);
  }
});

document.getElementById('adminLogout').addEventListener('click', async () => {
  await SB.post('/api/admin/logout');
  window.location.reload();
});

async function refresh() {
  try {
    overview = await SB.get('/api/admin/overview');
  } catch {
    loginCard.classList.remove('hidden');
    consoleBox.classList.add('hidden');
    return;
  }
  loginCard.classList.add('hidden');
  consoleBox.classList.remove('hidden');
  render();
}

/* ------------------------------------------------------------------ rendu */

function phaseLabel() {
  const { phase, round } = overview;
  if (phase === 'lobby') return 'Inscriptions et dépôt des secrets';
  if (phase === 'fini') return 'Partie terminée';
  if (round && round.status === 'open') return `Journée ${round.day} — votes en cours`;
  return `Journée ${round ? round.day : 0} — révélée`;
}

function render() {
  document.getElementById('phaseLine').textContent = phaseLabel();
  renderPilot();
  renderReveal();
  renderPlayers();
  renderRanking();
  fillSettings();
}

function renderPilot() {
  const { phase, round, players } = overview;
  const open = Boolean(round && round.status === 'open');
  const withSecret = players.filter((p) => p.hasSecret).length;
  const voted = players.filter((p) => p.votedToday).length;

  const banner = SB.clear(document.getElementById('adminBanner'));
  banner.appendChild(
    SB.el('div', 'banner info', open
      ? `Journée ${round.day} en cours — ${voted}/${withSecret} joueurs ont voté.`
      : phaseLabel())
  );

  const box = SB.clear(document.getElementById('pilotState'));
  const table = SB.el('table');
  const rows = [
    ['Inscrits', String(players.length)],
    ['Secrets déposés', `${withSecret} / ${players.length}`],
    ['Secrets démasqués', `${players.filter((p) => p.solved).length} / ${withSecret}`],
    ['Journées jouées', String(overview.days.filter((d) => d.status === 'closed').length)],
    ['Barème', `+${overview.rules.pointsCorrect} trouvé / +${overview.rules.pointsWrong} par erreur`],
  ];
  if (open) rows.splice(2, 0, ['Votes de la journée', `${voted} / ${withSecret}`]);
  for (const [label, value] of rows) {
    const tr = SB.el('tr');
    tr.appendChild(SB.el('th', null, label));
    tr.appendChild(SB.el('td', null, value));
    table.appendChild(tr);
  }
  box.appendChild(table);

  document.getElementById('btnStart').disabled = phase !== 'lobby';
  document.getElementById('btnClose').disabled = !open;
  document.getElementById('btnOpen').disabled = phase !== 'jeu' || open;
  document.getElementById('btnEnd').disabled = phase === 'fini';
}

function renderReveal() {
  const card = document.getElementById('revealCard');
  const results = overview.lastResults;
  if (!results) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  const body = SB.clear(document.getElementById('revealBody'));
  body.appendChild(
    SB.el('p', null, `Journée ${results.day} — ${SB.plural(results.votes.length, 'vote', 'votes')}, ${SB.plural(results.solved.length, 'secret démasqué', 'secrets démasqués')}.`)
  );
  body.appendChild(
    SB.el('p', 'muted', "Toi seul·e vois ici le nom des auteurs non démasqués : les joueurs, eux, ne voient qu'un « raté ».")
  );

  for (const vote of results.votes) {
    const row = SB.el('div', `result${vote.correct ? ' correct' : ''}`);
    row.appendChild(
      SB.el('p', null, `${vote.voterName} → secret ${vote.secretCode} → ${vote.guessedName}`)
    );
    row.appendChild(
      SB.el('span', vote.correct ? 'pill' : 'pill red',
        vote.correct ? 'Trouvé' : `Raté — c'était ${vote.authorName}`)
    );
    body.appendChild(row);
  }
}

function renderPlayers() {
  const list = SB.clear(document.getElementById('playersList'));
  document.getElementById('playersSummary').textContent =
    `${overview.players.length} inscrit(s). Le texte des secrets est visible ici pour la modération.`;

  if (overview.players.length === 0) {
    list.appendChild(SB.el('p', 'muted', 'Personne inscrit pour le moment.'));
    return;
  }

  for (const player of overview.players) {
    const card = SB.el('div', 'secret static');
    const head = SB.el('p');
    head.appendChild(SB.el('b', null, player.name));
    head.appendChild(document.createTextNode(' '));
    if (player.hasSecret) head.appendChild(SB.el('span', 'pill', `Secret ${player.secretCode}`));
    else head.appendChild(SB.el('span', 'pill red', 'Pas de secret'));
    if (player.solved) head.appendChild(SB.el('span', 'pill grey', ' démasqué '));
    if (player.votedToday) head.appendChild(SB.el('span', 'pill', ' a voté '));
    card.appendChild(head);

    if (player.secretText) card.appendChild(SB.el('div', 'text', player.secretText));

    const actions = SB.el('div', 'row');
    actions.style.marginTop = '10px';

    const bonus = document.createElement('input');
    bonus.type = 'number';
    bonus.value = String(player.bonusPoints);
    bonus.step = '1';
    bonus.style.maxWidth = '90px';
    actions.appendChild(bonus);

    const saveBonus = SB.el('button', 'btn small ghost', 'Points bonus');
    saveBonus.addEventListener('click', () => runAdmin(
      () => SB.post(`/api/admin/player/${player.id}/bonus`, { bonusPoints: Number(bonus.value) }),
      `Bonus de ${player.name} mis à jour.`
    ));
    actions.appendChild(saveBonus);

    if (player.hasSecret) {
      const removeSecret = SB.el('button', 'btn small ghost', 'Supprimer le secret');
      removeSecret.addEventListener('click', () => {
        if (!window.confirm(`Supprimer le secret de ${player.name} ?`)) return;
        runAdmin(
          () => SB.del(`/api/admin/secret/${player.secretId || ''}`),
          'Secret supprimé.'
        );
      });
      actions.appendChild(removeSecret);
    }

    const removePlayer = SB.el('button', 'btn small danger', 'Retirer');
    removePlayer.addEventListener('click', () => {
      if (!window.confirm(`Retirer ${player.name} de la partie ? Son secret et ses votes seront effacés.`)) return;
      runAdmin(() => SB.del(`/api/admin/player/${player.id}`), `${player.name} a été retiré.`);
    });
    actions.appendChild(removePlayer);

    card.appendChild(actions);
    list.appendChild(card);
  }
}

function renderRanking() {
  const list = SB.clear(document.getElementById('adminRanking'));
  if (overview.leaderboard.length === 0) {
    list.appendChild(SB.el('p', 'muted', 'Pas encore de participants.'));
    return;
  }
  overview.leaderboard.forEach((entry, index) => {
    const row = SB.el('div', `rank p${index + 1}`);
    row.appendChild(SB.el('div', 'pos', String(index + 1)));
    const who = SB.el('div', 'who', entry.name);
    who.appendChild(SB.el('small', null, `${entry.found} trouvé(s) · ${entry.fooled} trompé(s)`));
    row.appendChild(who);
    row.appendChild(SB.el('div', 'pts', `${entry.points} pts`));
    list.appendChild(row);
  });
}

function fillSettings() {
  if (document.activeElement && document.activeElement.closest('#settingsForm')) return;
  document.getElementById('setName').value = overview.gameName;
  document.getElementById('setCorrect').value = String(overview.rules.pointsCorrect);
  document.getElementById('setWrong').value = String(overview.rules.pointsWrong);
}

/* ---------------------------------------------------------------- actions */

async function runAdmin(action, successText, messageBox = 'pilotMessage') {
  SB.message(messageBox, '');
  try {
    await action();
    await refresh();
    SB.message(messageBox, successText, 'success');
  } catch (error) {
    SB.message(messageBox, error.message);
  }
}

document.getElementById('btnStart').addEventListener('click', () => {
  if (!window.confirm('Lancer la partie ? Les secrets seront verrouillés et la journée 1 ouverte.')) return;
  runAdmin(() => SB.post('/api/admin/start'), 'Partie lancée, journée 1 ouverte !');
});

document.getElementById('btnClose').addEventListener('click', () => {
  if (!window.confirm('Clôturer la journée ? Tous les votes du jour deviennent publics et les points sont attribués.')) return;
  runAdmin(() => SB.post('/api/admin/close-day'), 'Journée clôturée : les résultats sont visibles par tous.');
});

document.getElementById('btnOpen').addEventListener('click', () => {
  runAdmin(() => SB.post('/api/admin/open-day'), 'Nouvelle journée ouverte, les votes sont possibles.');
});

document.getElementById('btnEnd').addEventListener('click', () => {
  if (!window.confirm('Terminer la partie ? Tous les secrets restants seront révélés.')) return;
  runAdmin(() => SB.post('/api/admin/end'), 'Partie terminée, tous les secrets sont révélés.');
});

document.getElementById('settingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const password = document.getElementById('setPassword');
  runAdmin(
    () => SB.post('/api/admin/settings', {
      gameName: document.getElementById('setName').value,
      pointsCorrect: document.getElementById('setCorrect').value,
      pointsWrong: document.getElementById('setWrong').value,
      adminPassword: password.value,
    }).then(() => {
      password.value = '';
    }),
    'Réglages enregistrés.',
    'settingsMessage'
  );
});

document.getElementById('btnResetKeep').addEventListener('click', () => {
  if (!window.confirm('Nouvelle partie : les votes, journées et points sont effacés. Les comptes et les secrets sont conservés. Continuer ?')) return;
  runAdmin(() => SB.post('/api/admin/reset', { keepPlayers: true }), 'Nouvelle partie prête.', 'settingsMessage');
});

document.getElementById('btnResetAll').addEventListener('click', () => {
  if (!window.confirm('TOUT effacer : comptes, secrets, votes et points. Cette action est irréversible. Continuer ?')) return;
  if (!window.confirm('Dernière confirmation : on efface vraiment tout ?')) return;
  runAdmin(() => SB.post('/api/admin/reset', { keepPlayers: false }), 'Tout a été effacé.', 'settingsMessage');
});

refresh();
setInterval(() => {
  if (document.visibilityState === 'visible' && overview) refresh().catch(() => {});
}, 20000);
