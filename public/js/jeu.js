'use strict';

let state = null;
let currentView = 'secret';
let selectedSecretId = null;
let selectedSuspectId = '';
let pendingResultsDay = null;

/* ------------------------------------------------------------- navigation */

document.getElementById('tabs').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (!button) return;
  showView(button.dataset.view);
});

function showView(view) {
  currentView = view;
  for (const button of document.querySelectorAll('#tabs button')) {
    button.setAttribute('aria-selected', String(button.dataset.view === view));
  }
  for (const section of document.querySelectorAll('.view')) {
    section.classList.toggle('hidden', section.id !== `view-${view}`);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('logout').addEventListener('click', async () => {
  await SB.post('/api/logout');
  window.location.href = 'index.html';
});

/* ------------------------------------------------------------ chargement */

async function refresh() {
  state = await SB.get('/api/state');
  if (!state.me) {
    window.location.href = 'index.html';
    return;
  }
  render();
}

function phaseLabel() {
  const { phase, day, roundStatus } = state.game;
  if (phase === 'lobby') return 'Inscriptions ouvertes — dépôt des secrets';
  if (phase === 'fini') return 'Partie terminée';
  if (roundStatus === 'open') return `Journée ${day} — votes ouverts`;
  return `Journée ${day} — votes révélés, en attente de la suite`;
}

function render() {
  document.getElementById('gameName').textContent = state.game.name;
  document.getElementById('phaseLine').textContent = phaseLabel();
  renderTopBanner();
  renderMySecret();
  renderVote();
  renderSecrets();
  renderResults();
  renderRanking();
}

function renderTopBanner() {
  const container = SB.clear(document.getElementById('topBanner'));
  const { phase, roundStatus, playersCount, secretsCount } = state.game;
  let text = '';
  let kind = 'info';

  if (phase === 'lobby') {
    text = state.me.hasSecret
      ? `Ton secret est déposé. On attend l'animateur pour lancer la partie (${SB.plural(secretsCount, 'secret déposé', 'secrets déposés')} sur ${playersCount} inscrits).`
      : "Dépose vite ton secret : la partie ne peut pas commencer sans toi !";
    kind = state.me.hasSecret ? 'ok' : 'warn';
  } else if (phase === 'fini') {
    const winner = state.leaderboard[0];
    text = winner ? `Partie terminée — ${winner.name} l'emporte avec ${winner.points} points !` : 'Partie terminée.';
    kind = 'ok';
  } else if (roundStatus === 'open') {
    text = state.myVote
      ? 'Ton vote du jour est enregistré. Rendez-vous au reveal de ce soir !'
      : "Tu n'as pas encore voté aujourd'hui. Un seul vote par jour, choisis bien.";
    kind = state.myVote ? 'ok' : 'warn';
  } else {
    text = `Les votes de la journée ${state.game.day} sont révélés. La prochaine journée sera ouverte par l'animateur.`;
  }

  const banner = SB.el('div', `banner ${kind}`, text);
  container.appendChild(banner);
}

/* ------------------------------------------------------------ mon secret */

const secretText = document.getElementById('secretText');
const secretCount = document.getElementById('secretCount');

secretText.addEventListener('input', () => {
  secretCount.textContent = String(secretText.value.trim().length);
});

function renderMySecret() {
  const status = SB.clear(document.getElementById('secretStatus'));
  const form = document.getElementById('secretForm');
  const editable = state.game.phase === 'lobby';

  if (state.me.hasSecret) {
    const line = SB.el('p');
    line.appendChild(SB.el('span', 'pill', `Secret ${state.me.secretCode}`));
    status.appendChild(line);
    if (state.me.secretSolved) {
      status.appendChild(
        SB.el('p', 'muted', `Ton secret a été démasqué à la journée ${state.me.secretSolvedDay}. Tu continues à jouer pour deviner ceux des autres !`)
      );
    }
    if (document.activeElement !== secretText) {
      secretText.value = state.me.secretText;
      secretCount.textContent = String(state.me.secretText.length);
    }
  }

  form.classList.toggle('hidden', !editable);
  if (!editable && !state.me.hasSecret) {
    status.appendChild(
      SB.el('p', 'muted', "La partie a commencé sans ton secret : tu ne peux plus en déposer. Vois avec ton animateur.")
    );
  } else if (!editable) {
    const locked = SB.el('div', 'secret static mine');
    locked.appendChild(SB.el('div', 'text', state.me.secretText));
    status.appendChild(locked);
    status.appendChild(SB.el('p', 'muted', 'Les secrets sont verrouillés depuis le lancement de la partie.'));
  }
}

document.getElementById('secretForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button');
  button.disabled = true;
  SB.message('secretMessage', '');
  try {
    await SB.post('/api/secret', { text: secretText.value });
    SB.message('secretMessage', 'Secret enregistré. Motus et bouche cousue !', 'success');
    await refresh();
  } catch (error) {
    SB.message('secretMessage', error.message);
  } finally {
    button.disabled = false;
  }
});

/* ------------------------------------------------------------------ vote */

function renderVote() {
  const intro = SB.clear(document.getElementById('voteIntro'));
  const form = document.getElementById('voteForm');
  const { phase, roundStatus, day } = state.game;

  if (phase === 'lobby') {
    intro.appendChild(SB.el('p', 'muted', "Les votes ouvriront quand l'animateur lancera la partie."));
    form.classList.add('hidden');
    return;
  }
  if (phase === 'fini') {
    intro.appendChild(SB.el('p', 'muted', 'La partie est terminée : va voir le classement final.'));
    form.classList.add('hidden');
    return;
  }
  if (roundStatus !== 'open') {
    intro.appendChild(SB.el('p', 'muted', `La journée ${day} est close. Attends l'ouverture de la suivante.`));
    form.classList.add('hidden');
    return;
  }
  if (!state.me.hasSecret) {
    intro.appendChild(SB.el('p', 'muted', "Tu n'as pas déposé de secret : tu ne peux pas voter."));
    form.classList.add('hidden');
    return;
  }
  if (state.myVote) {
    const secret = state.secrets.find((s) => s.id === state.myVote.secretId);
    const suspect = state.players.find((p) => p.id === state.myVote.guessedPlayerId);
    intro.appendChild(SB.el('p', null, `Tu as voté pour la journée ${day} :`));
    const card = SB.el('div', 'secret static');
    card.appendChild(SB.el('span', 'code', `Secret ${secret ? secret.code : '?'}`));
    card.appendChild(SB.el('div', 'text', secret ? secret.text : ''));
    card.appendChild(SB.el('div', 'author', `Ta réponse : ${suspect ? suspect.name : '?'}`));
    intro.appendChild(card);
    intro.appendChild(SB.el('p', 'muted', 'Un seul vote par jour : impossible de le changer. Résultats au reveal.'));
    form.classList.add('hidden');
    return;
  }

  const votable = state.secrets.filter((s) => s.votable);
  if (votable.length === 0 || state.suspects.length === 0) {
    intro.appendChild(SB.el('p', 'muted', 'Aucun secret à deviner pour le moment.'));
    form.classList.add('hidden');
    return;
  }

  intro.appendChild(
    SB.el('p', 'muted', `Journée ${day} — il te reste ${SB.plural(votable.length, 'secret à percer', 'secrets à percer')}. Tu n'as qu'un vote, réfléchis bien.`)
  );

  const list = SB.clear(document.getElementById('voteSecrets'));
  for (const secret of votable) {
    const label = SB.el('label', 'secret');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'secretChoice';
    radio.value = String(secret.id);
    radio.checked = secret.id === selectedSecretId;
    radio.addEventListener('change', () => {
      selectedSecretId = secret.id;
    });
    label.appendChild(radio);
    label.appendChild(SB.el('span', 'code', `Secret ${secret.code}`));
    label.appendChild(SB.el('div', 'text', secret.text));
    list.appendChild(label);
  }

  const select = SB.clear(document.getElementById('voteSuspect'));
  const placeholder = SB.el('option', null, '— Choisir une personne —');
  placeholder.value = '';
  select.appendChild(placeholder);
  for (const suspect of state.suspects) {
    const option = SB.el('option', null, suspect.name);
    option.value = String(suspect.id);
    select.appendChild(option);
  }
  select.value = state.suspects.some((s) => String(s.id) === selectedSuspectId)
    ? selectedSuspectId
    : '';
  select.onchange = () => {
    selectedSuspectId = select.value;
  };

  form.classList.remove('hidden');
}

document.getElementById('voteForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  SB.message('voteMessage', '');
  const suspectId = document.getElementById('voteSuspect').value;
  const chosen = document.querySelector('input[name="secretChoice"]:checked');

  if (!chosen) return SB.message('voteMessage', 'Choisis d’abord un secret.');
  if (!suspectId) return SB.message('voteMessage', 'Choisis la personne que tu accuses.');

  const secret = state.secrets.find((s) => s.id === Number(chosen.value));
  const suspect = state.suspects.find((p) => p.id === Number(suspectId));
  const ok = window.confirm(
    `Tu accuses ${suspect.name} d'avoir écrit le secret ${secret.code}.\n\nC'est ton seul vote de la journée et il est définitif. On valide ?`
  );
  if (!ok) return;

  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await SB.post('/api/vote', { secretId: secret.id, guessedPlayerId: suspect.id });
    selectedSecretId = null;
    selectedSuspectId = '';
    await refresh();
    SB.message('voteMessage', 'Vote enregistré ! Rendez-vous au reveal.', 'success');
  } catch (error) {
    SB.message('voteMessage', error.message);
  } finally {
    button.disabled = false;
  }
});

/* --------------------------------------------------------- tous secrets */

function renderSecrets() {
  const list = SB.clear(document.getElementById('secretsList'));
  const { secretsCount, solvedCount } = state.game;
  document.getElementById('secretsSummary').textContent =
    `${solvedCount} secret(s) démasqué(s) sur ${secretsCount}.`;

  if (state.secrets.length === 0) {
    list.appendChild(SB.el('p', 'muted', 'Aucun secret déposé pour le moment.'));
    return;
  }

  for (const secret of state.secrets) {
    const card = SB.el('div', 'secret static');
    if (secret.solved) card.classList.add('solved');
    if (secret.isMine) card.classList.add('mine');
    card.appendChild(SB.el('span', 'code', `Secret ${secret.code}`));
    card.appendChild(SB.el('div', 'text', secret.text));
    if (secret.authorName) {
      card.appendChild(
        SB.el('div', 'author', secret.solved
          ? `Démasqué journée ${secret.solvedDay} — écrit par ${secret.authorName}`
          : `Écrit par ${secret.authorName}`)
      );
    } else if (secret.isMine) {
      card.appendChild(SB.el('div', 'author', "C'est le tien — chut."));
    }
    list.appendChild(card);
  }
}

/* ------------------------------------------------------------- résultats */

const daySelect = document.getElementById('daySelect');
daySelect.addEventListener('change', () => {
  pendingResultsDay = Number(daySelect.value);
  loadResults(pendingResultsDay);
});

function renderResults() {
  const days = state.game.closedDays;
  const body = document.getElementById('resultsBody');
  const hasDays = days.length > 0;

  daySelect.classList.toggle('hidden', !hasDays);
  document.getElementById('daySelectLabel').classList.toggle('hidden', !hasDays);

  if (!hasDays) {
    SB.clear(body).appendChild(
      SB.el('p', 'muted', "Aucune journée n'a encore été révélée. Les votes restent secrets jusqu'au reveal du soir.")
    );
    return;
  }

  const selected = days.includes(pendingResultsDay) ? pendingResultsDay : days[0];
  pendingResultsDay = selected;

  SB.clear(daySelect);
  for (const day of days) {
    const option = SB.el('option', null, `Journée ${day}`);
    option.value = String(day);
    if (day === selected) option.selected = true;
    daySelect.appendChild(option);
  }

  if (state.lastResults && state.lastResults.day === selected) renderDayResults(state.lastResults);
  else loadResults(selected);
}

async function loadResults(day) {
  const body = SB.clear(document.getElementById('resultsBody'));
  body.appendChild(SB.el('p', 'muted', 'Chargement…'));
  try {
    renderDayResults(await SB.get(`/api/results/${day}`));
  } catch (error) {
    SB.clear(body).appendChild(SB.el('p', 'muted', error.message));
  }
}

function renderDayResults(results) {
  const body = SB.clear(document.getElementById('resultsBody'));

  if (results.solved.length > 0) {
    body.appendChild(SB.el('h3', null, 'Secrets démasqués ce jour-là'));
    for (const secret of results.solved) {
      const card = SB.el('div', 'secret static solved');
      card.appendChild(SB.el('span', 'code', `Secret ${secret.code}`));
      card.appendChild(SB.el('div', 'text', secret.text));
      card.appendChild(SB.el('div', 'author', `C'était ${secret.author_name}`));
      body.appendChild(card);
    }
  }

  body.appendChild(SB.el('h3', null, `Tous les votes (${results.votes.length})`));
  if (results.votes.length === 0) {
    body.appendChild(SB.el('p', 'muted', 'Personne n’a voté ce jour-là.'));
    return;
  }

  for (const vote of results.votes) {
    const row = SB.el('div', `result${vote.correct ? ' correct' : ''}`);
    const line = SB.el('p');
    line.appendChild(SB.el('b', null, vote.voterName));
    line.appendChild(document.createTextNode(` a attribué le secret ${vote.secretCode} à `));
    line.appendChild(SB.el('b', null, vote.guessedName));
    row.appendChild(line);
    row.appendChild(
      SB.el('p', 'muted', `« ${vote.secretText} »`)
    );
    let verdict;
    if (vote.correct) {
      verdict = `Trouvé ! +${state.game.pointsCorrect} pour ${vote.voterName}`;
    } else if (vote.authorName) {
      verdict = `Raté — c'était ${vote.authorName} (+${state.game.pointsWrong} pour ${vote.authorName})`;
    } else {
      verdict = `Raté — ce n'est pas ${vote.guessedName}. +${state.game.pointsWrong} pour l'auteur·rice, qui reste dans l'ombre.`;
    }
    row.appendChild(SB.el('span', vote.correct ? 'pill' : 'pill red', verdict));
    body.appendChild(row);
  }
}

/* ------------------------------------------------------------ classement */

function renderRanking() {
  document.getElementById('rankingRules').textContent =
    `+${state.game.pointsCorrect} par bonne réponse, +${state.game.pointsWrong} par personne trompée par ton secret.`;
  const list = SB.clear(document.getElementById('rankingList'));

  if (state.leaderboard.length === 0) {
    list.appendChild(SB.el('p', 'muted', 'Personne dans la partie pour le moment.'));
    return;
  }

  state.leaderboard.forEach((entry, index) => {
    const row = SB.el('div', `rank p${index + 1}`);
    if (entry.id === state.me.id) row.classList.add('me');
    row.appendChild(SB.el('div', 'pos', String(index + 1)));
    const who = SB.el('div', 'who', entry.name);
    who.appendChild(
      SB.el('small', null, `${SB.plural(entry.found, 'secret trouvé', 'secrets trouvés')} · ${SB.plural(entry.fooled, 'personne trompée', 'personnes trompées')}`)
    );
    row.appendChild(who);
    row.appendChild(SB.el('div', 'pts', `${entry.points} pts`));
    list.appendChild(row);
  });
}

/* ------------------------------------------------------------ démarrage */

refresh().catch(() => {
  document.getElementById('phaseLine').textContent = 'Serveur injoignable…';
});

// Rafraîchissement discret pour suivre l'ouverture/clôture des journées.
setInterval(() => {
  if (document.visibilityState === 'visible') refresh().catch(() => {});
}, 20000);
