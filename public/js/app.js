'use strict';

/**
 * Secret BAFA — interface unique.
 * Toute la logique de jeu vit sur le serveur ; cette page lit /api/state et
 * affiche ce que le serveur veut bien montrer au joueur. C'est volontaire :
 * l'auteur d'un secret non démasqué n'est jamais envoyé au navigateur.
 */

/* ────────────────────────────────────────────────────────────── aides ── */
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

function say(target, text, kind) {
  const node = typeof target === 'string' ? $(target) : target;
  if (!node) return;
  clear(node);
  if (!text) return;
  node.appendChild(el('div', 'msg ' + (kind || 'error'), text));
}

async function api(method, url, body) {
  const options = { method: method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  let data = {};
  try { data = await response.json(); } catch (e) { /* réponse sans corps */ }
  if (!response.ok) throw new Error(data.error || 'Erreur ' + response.status);
  return data;
}
const GET = (url) => api('GET', url);
const POST = (url, body) => api('POST', url, body);
const DEL = (url) => api('DELETE', url);

/* ────────────────────────────────────────────────────────────── état ── */
const S = {
  state: null,      // réponse de /api/state
  overview: null,   // réponse de /api/admin/overview
  view: 'secret',
  authMode: 'register',
  pick: null,       // id du secret choisi pour le vote
  pickWho: '',      // id du suspect choisi
  resultDay: null,
  offline: false,
};

const TABS = [
  ['secret', 'Mon secret'],
  ['vote', 'Voter'],
  ['secrets', 'Les secrets'],
  ['results', 'Résultats'],
  ['ranking', 'Classement'],
  ['anim', 'Animateur'],
];

const game = () => S.state.game;
const me = () => S.state.me;

/* ─────────────────────────────────────────────────────── chargement ── */
async function refresh(force) {
  try {
    S.state = await GET('/api/state');
    if (S.state.isAdmin) {
      try { S.overview = await GET('/api/admin/overview'); }
      catch (e) { S.overview = null; }
    }
    S.offline = false;
  } catch (e) {
    S.offline = true;
    if (!S.state) {
      clear($('screen')).appendChild(offlineCard());
      return;
    }
  }
  render(force);
}

function offlineCard() {
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Serveur injoignable'));
  card.appendChild(el('p', 'muted',
    "La page n'arrive pas à joindre le serveur du jeu. Vérifie ta connexion au Wi-Fi de la formation, puis recharge."));
  return card;
}

/* ─────────────────────────────────────────────────────────── rendu ── */
let renderPending = false;
function isTyping() {
  const a = document.activeElement;
  return !!a && $('screen').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}
document.addEventListener('focusout', () => {
  if (renderPending) { renderPending = false; setTimeout(() => render(true), 0); }
});

function phaseText() {
  const g = game();
  if (g.phase === 'lobby') return 'Inscriptions ouvertes · dépôt des secrets';
  if (g.phase === 'fini') return 'Partie terminée';
  if (g.roundStatus === 'open') return 'Journée ' + g.day + ' · votes ouverts';
  return 'Journée ' + g.day + ' · votes révélés';
}

function render(force) {
  if (!S.state) return;
  if (!force && isTyping()) { renderPending = true; return; }

  $('gameName').textContent = game().name;
  $('statusLine').textContent = phaseText();
  renderHero();

  if (!me()) {
    renderTabs(false);
    return renderAuth();
  }
  if (S.view === 'login' || !TABS.some((t) => t[0] === S.view)) S.view = 'secret';
  renderTabs(true);

  const screen = clear($('screen'));
  if (S.offline) screen.appendChild(el('div', 'offline', 'Connexion au serveur perdue — les informations affichées datent un peu.'));

  if (S.view === 'secret') renderMySecret(screen);
  else if (S.view === 'vote') renderVote(screen);
  else if (S.view === 'secrets') renderSecrets(screen);
  else if (S.view === 'results') renderResults(screen);
  else if (S.view === 'ranking') renderRanking(screen);
  else if (S.view === 'anim') renderAnim(screen);
}

function renderTabs(show) {
  const tabs = $('tabs');
  tabs.classList.toggle('hidden', !show);
  clear(tabs);
  if (!show) return;
  for (const [id, label] of TABS) {
    const button = el('button', null, label);
    button.type = 'button';
    button.setAttribute('aria-selected', String(S.view === id));
    button.onclick = () => { S.view = id; render(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    tabs.appendChild(button);
  }
}

/* ──────────────────────────────────────────────────────── en-tête ── */
function heroCopy() {
  const g = game();
  if (!me()) return { title: 'Un secret. Un vote par jour.', sub: 'Le jeu des secrets de ta formation.' };
  if (g.phase === 'lobby') {
    return me().hasSecret
      ? { title: 'Ton secret est sous clé', sub: "On attend que l'animateur lance la partie." }
      : { title: 'Dépose ton secret', sub: 'La partie ne peut pas commencer sans toi.' };
  }
  if (g.phase === 'fini') {
    const top = S.state.leaderboard[0];
    return top
      ? { title: top.name + " l'emporte !", sub: top.points + ' points. Tous les secrets sont révélés.' }
      : { title: 'Partie terminée', sub: 'Tous les secrets sont révélés.' };
  }
  if (g.roundStatus === 'open') {
    return S.state.myVote
      ? { title: 'Vote enregistré', sub: 'Rendez-vous au reveal de ce soir.' }
      : { title: 'À toi de jouer', sub: "Un seul vote aujourd'hui, et il est définitif." };
  }
  return { title: 'Les votes sont tombés', sub: 'Journée ' + g.day + ' révélée. La suivante ouvrira bientôt.' };
}

function statChip(value, label) {
  const chip = el('div', 'stat');
  chip.appendChild(el('b', null, String(value)));
  chip.appendChild(el('span', null, label));
  return chip;
}

function renderHero() {
  const g = game();
  const copy = heroCopy();
  $('heroTitle').textContent = copy.title;
  $('heroSub').textContent = copy.sub;

  const stats = clear($('heroStats'));
  if (!me() || g.phase === 'lobby') {
    stats.appendChild(statChip(g.playersCount, g.playersCount > 1 ? 'inscrits' : 'inscrit'));
    stats.appendChild(statChip(g.secretsCount, g.secretsCount > 1 ? 'secrets' : 'secret'));
  } else {
    stats.appendChild(statChip('J' + g.day, 'journée'));
    if (g.roundStatus === 'open') stats.appendChild(statChip(g.votesToday + '/' + g.secretsCount, 'ont voté'));
    stats.appendChild(statChip(g.solvedCount, 'démasqués'));
  }

  const bar = $('heroProgress');
  const show = g.secretsCount > 0 && g.phase !== 'lobby';
  bar.classList.toggle('hidden', !show);
  if (show) {
    $('progressFill').style.width = Math.round((g.solvedCount / g.secretsCount) * 100) + '%';
    const n = g.solvedCount;
    $('progressLabel').textContent =
      n + ' secret' + (n > 1 ? 's' : '') + ' démasqué' + (n > 1 ? 's' : '') + ' sur ' + g.secretsCount;
  }
}

/** Pluie de confettis quand tu as trouvé juste. Une seule fois par journée. */
const celebrated = new Set();
function celebrate(day) {
  if (celebrated.has(day)) return;
  celebrated.add(day);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sky = el('div', 'confetti');
  const colors = ['#EF5A6F', '#F79B4B', '#8B5CF6', '#E8629B', '#FFB884', '#6C5CE7'];
  for (let i = 0; i < 28; i += 1) {
    const bit = document.createElement('i');
    bit.style.left = Math.random() * 100 + '%';
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
    bit.style.animationDuration = (1.9 + Math.random() * 1.1).toFixed(2) + 's';
    sky.appendChild(bit);
  }
  document.body.appendChild(sky);
  setTimeout(() => sky.remove(), 3400);
}

/* ────────────────────────────────────────────── inscription/connexion ── */
function renderAuth() {
  const screen = clear($('screen'));

  const brand = el('div', 'hero__logo');
  const box = el('div', 'brandcard');
  const logo = document.createElement('img');
  logo.src = 'images/logo-secret-bafa.png';
  logo.alt = 'Secret BAFA';
  logo.width = 400; logo.height = 400;
  box.appendChild(logo);
  brand.appendChild(box);
  screen.appendChild(brand);

  const rules = el('div', 'card');
  rules.appendChild(el('h2', null, 'Comment on joue'));
  const list = el('ol', 'muted');
  [
    "Chacun·e s'inscrit et dépose un secret sur soi. Il reste anonyme.",
    'Chaque jour, tu as un seul vote : tu choisis un secret et tu désignes la personne qui l\'a écrit.',
    "Le soir, l'animateur clôture la journée et tous les votes sont révélés d'un coup.",
    '+' + game().pointsCorrect + ' si tu trouves le bon auteur. +' + game().pointsWrong +
      " pour l'auteur d'un secret, à chaque fois que quelqu'un se trompe sur lui.",
  ].forEach((line) => list.appendChild(el('li', null, line)));
  rules.appendChild(list);
  rules.appendChild(el('p', 'muted', 'Un secret démasqué sort du jeu et son auteur est affiché pour tout le monde.'));
  screen.appendChild(rules);

  const card = el('div', 'card');
  const switcher = el('div', 'row');
  const toLogin = el('button', 'btn small', 'Se connecter');
  const toRegister = el('button', 'btn small', 'Créer mon compte');
  toLogin.type = 'button'; toRegister.type = 'button';
  switcher.append(toLogin, toRegister);
  card.appendChild(switcher);

  const form = el('form');
  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.autocomplete = 'username'; nameInput.placeholder = 'Camille';
  nameInput.required = true;
  const passInput = document.createElement('input');
  passInput.type = 'password'; passInput.required = true;
  const hint = el('p', 'muted', '');
  const submit = el('button', 'btn full', '');

  function paint() {
    const reg = S.authMode === 'register';
    toRegister.className = 'btn small' + (reg ? '' : ' ghost');
    toLogin.className = 'btn small' + (reg ? ' ghost' : '');
    submit.textContent = reg ? "Je m'inscris" : 'Entrer dans la partie';
    passInput.autocomplete = reg ? 'new-password' : 'current-password';
    passInput.placeholder = reg ? '4 caractères minimum' : '';
    hint.textContent = reg
      ? "Ce mot de passe sert juste à empêcher un camarade de voter à ta place. N'en réutilise pas un vrai."
      : 'Reprends le prénom exact choisi à l\'inscription.';
    say('authMsg', '');
  }
  toLogin.onclick = () => { S.authMode = 'login'; paint(); };
  toRegister.onclick = () => { S.authMode = 'register'; paint(); };

  form.append(el('label', null, 'Ton prénom'), nameInput,
              el('label', null, 'Ton mot de passe'), passInput, hint, submit);
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    say('authMsg', '');
    try {
      const url = S.authMode === 'register' ? '/api/register' : '/api/login';
      await POST(url, { name: nameInput.value, password: passInput.value });
      S.view = 'secret';
      await refresh(true);
    } catch (error) {
      say('authMsg', error.message);
      submit.disabled = false;
    }
  };
  card.appendChild(form);
  const msg = el('div'); msg.id = 'authMsg';
  card.appendChild(msg);
  screen.appendChild(card);
  paint();
}

/* ─────────────────────────────────────────────────────── mon secret ── */
function renderMySecret(screen) {
  const g = game();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Mon secret'));

  if (me().hasSecret) {
    const line = el('p');
    line.appendChild(el('span', 'pill', 'Secret ' + me().secretCode));
    if (me().secretSolved) line.appendChild(el('span', 'pill grey', ' démasqué journée ' + me().secretSolvedDay + ' '));
    card.appendChild(line);
  }

  if (g.phase === 'lobby') {
    const form = el('form');
    const area = document.createElement('textarea');
    area.maxLength = 500;
    area.placeholder = 'Un truc vrai sur toi, drôle ou surprenant… mais pas trop facile à deviner !';
    area.value = me().secretText || '';
    const count = el('p', 'muted', '');
    const update = () => { count.textContent = area.value.trim().length + '/500 — 10 caractères minimum.'; };
    update();
    area.oninput = update;
    const submit = el('button', 'btn full', me().hasSecret ? 'Modifier mon secret' : 'Déposer mon secret');
    form.append(el('label', null, 'Écris un secret sur toi'), area, count, submit);
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await POST('/api/secret', { text: area.value });
        await refresh(true);
        say('secretMsg', 'Secret enregistré. Motus !', 'ok');
      } catch (error) {
        say('secretMsg', error.message);
      }
      submit.disabled = false;
    };
    card.appendChild(form);
    const msg = el('div'); msg.id = 'secretMsg'; card.appendChild(msg);
    card.appendChild(el('p', 'muted', "Tu peux le modifier tant que la partie n'est pas lancée."));
  } else if (me().hasSecret) {
    const box = el('div', 'secret flat mine');
    box.appendChild(el('span', 'txt', me().secretText));
    card.appendChild(box);
    card.appendChild(el('p', 'muted', 'Les secrets sont verrouillés depuis le lancement de la partie.'));
  } else {
    card.appendChild(el('p', 'muted',
      "La partie a commencé sans ton secret : tu ne peux plus en déposer. Vois avec ton animateur."));
  }

  const out = el('div', 'linkline');
  const logout = el('button', null, 'Se déconnecter');
  logout.type = 'button';
  logout.onclick = async () => { await POST('/api/logout'); S.overview = null; await refresh(true); };
  out.appendChild(logout);
  card.appendChild(out);
  screen.appendChild(card);
}

/* ─────────────────────────────────────────────────────────── vote ── */
function renderVote(screen) {
  const g = game();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Mon vote du jour'));

  if (g.phase === 'lobby') {
    card.appendChild(el('p', 'muted', "Les votes ouvriront quand l'animateur lancera la partie."));
    return screen.appendChild(card);
  }
  if (g.phase === 'fini') {
    card.appendChild(el('p', 'muted', 'La partie est terminée : va voir le classement final.'));
    return screen.appendChild(card);
  }
  if (g.roundStatus !== 'open') {
    card.appendChild(el('p', 'muted', 'La journée ' + g.day + " est close. Attends l'ouverture de la suivante."));
    return screen.appendChild(card);
  }
  if (!me().hasSecret) {
    card.appendChild(el('p', 'muted', "Tu n'as pas déposé de secret : tu ne peux pas voter."));
    return screen.appendChild(card);
  }

  if (S.state.myVote) {
    const secret = S.state.secrets.find((s) => s.id === S.state.myVote.secretId);
    const who = S.state.players.find((p) => p.id === S.state.myVote.guessedPlayerId);
    card.appendChild(el('p', null, 'Tu as voté pour la journée ' + g.day + ' :'));
    const box = el('div', 'secret flat');
    box.appendChild(el('span', 'code', 'Secret ' + (secret ? secret.code : '?')));
    box.appendChild(el('span', 'txt', secret ? secret.text : ''));
    box.appendChild(el('span', 'who', 'Ta réponse : ' + (who ? who.name : '?')));
    card.appendChild(box);
    card.appendChild(el('p', 'muted', 'Un seul vote par jour, impossible de le changer.'));
    return screen.appendChild(card);
  }

  const votable = S.state.secrets.filter((s) => s.votable);
  const suspects = S.state.suspects;
  if (!votable.length || !suspects.length) {
    card.appendChild(el('p', 'muted', 'Aucun secret à deviner pour le moment.'));
    return screen.appendChild(card);
  }

  card.appendChild(el('p', 'muted',
    'Journée ' + g.day + ' — ' + plural(votable.length, 'secret à percer', 'secrets à percer') + ". Tu n'as qu'un vote."));

  card.appendChild(el('h3', null, '1. Choisis un secret'));
  for (const secret of votable) {
    const button = el('button', 'secret');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(S.pick === secret.id));
    button.appendChild(el('span', 'code', 'Secret ' + secret.code));
    button.appendChild(el('span', 'txt', secret.text));
    button.onclick = () => { S.pick = secret.id; render(true); };
    card.appendChild(button);
  }

  card.appendChild(el('h3', null, "2. Qui l'a écrit ?"));
  const select = document.createElement('select');
  const none = el('option', null, '— Choisir une personne —'); none.value = '';
  select.appendChild(none);
  for (const person of suspects) {
    const option = el('option', null, person.name);
    option.value = String(person.id);
    select.appendChild(option);
  }
  select.value = suspects.some((p) => String(p.id) === S.pickWho) ? S.pickWho : '';
  select.onchange = () => { S.pickWho = select.value; };
  card.appendChild(select);

  const submit = el('button', 'btn full', 'Valider mon vote (définitif)');
  submit.type = 'button';
  submit.onclick = async () => {
    say('voteMsg', '');
    if (!S.pick) return say('voteMsg', "Choisis d'abord un secret.");
    if (!select.value) return say('voteMsg', 'Choisis la personne que tu accuses.');
    const secret = S.state.secrets.find((s) => s.id === S.pick);
    const person = suspects.find((p) => String(p.id) === select.value);
    const ok = window.confirm('Tu accuses ' + person.name + " d'avoir écrit le secret " + secret.code +
      ".\n\nC'est ton seul vote de la journée et il est définitif. On valide ?");
    if (!ok) return;
    submit.disabled = true;
    try {
      await POST('/api/vote', { secretId: secret.id, guessedPlayerId: person.id });
      S.pick = null; S.pickWho = '';
      await refresh(true);
    } catch (error) {
      say('voteMsg', error.message);
      submit.disabled = false;
    }
  };
  card.appendChild(submit);
  const msg = el('div'); msg.id = 'voteMsg'; card.appendChild(msg);
  screen.appendChild(card);
}

/* ────────────────────────────────────────────────────── les secrets ── */
function renderSecrets(screen) {
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Tous les secrets'));
  const secrets = S.state.secrets;
  card.appendChild(el('p', 'muted',
    game().solvedCount + ' démasqué(s) sur ' + secrets.length + '.'));

  if (!secrets.length) card.appendChild(el('p', 'muted', 'Aucun secret déposé pour le moment.'));
  for (const secret of secrets) {
    const box = el('div', 'secret flat');
    if (secret.solved) box.classList.add('solved');
    if (secret.isMine) box.classList.add('mine');
    box.appendChild(el('span', 'code', 'Secret ' + secret.code));
    box.appendChild(el('span', 'txt', secret.text));
    if (secret.solved) {
      box.appendChild(el('span', 'who', 'Démasqué journée ' + secret.solvedDay + ' — écrit par ' + secret.authorName));
    } else if (secret.authorName) {
      box.appendChild(el('span', 'who', 'Écrit par ' + secret.authorName));
    } else if (secret.isMine) {
      box.appendChild(el('span', 'who', "C'est le tien — chut."));
    }
    card.appendChild(box);
  }
  screen.appendChild(card);
}

/* ─────────────────────────────────────────────────────── résultats ── */
function renderResults(screen) {
  const g = game();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Résultats'));
  const days = g.closedDays;

  if (!days.length) {
    card.appendChild(el('p', 'muted',
      "Aucune journée révélée pour l'instant. Les votes restent secrets jusqu'au reveal du soir."));
    return screen.appendChild(card);
  }

  const select = document.createElement('select');
  for (const day of days) {
    const option = el('option', null, 'Journée ' + day);
    option.value = String(day);
    select.appendChild(option);
  }
  const chosen = days.indexOf(S.resultDay) >= 0 ? S.resultDay : days[0];
  S.resultDay = chosen;
  select.value = String(chosen);

  const body = el('div');
  select.onchange = () => { S.resultDay = Number(select.value); loadDay(S.resultDay); };
  card.append(el('label', null, 'Journée'), select, body);
  screen.appendChild(card);

  function paintDay(results) {
    clear(body);
    if (results.solved.length) {
      body.appendChild(el('h3', null, 'Secrets démasqués ce jour-là'));
      for (const secret of results.solved) {
        const box = el('div', 'secret flat solved');
        box.appendChild(el('span', 'stamp', 'Démasqué'));
        box.appendChild(el('span', 'code', 'Secret ' + secret.code));
        box.appendChild(el('span', 'txt', secret.text));
        box.appendChild(el('span', 'who', "C'était " + secret.author_name));
        body.appendChild(box);
      }
    }

    if (results.votes.some((v) => v.correct && me() && v.voterName === me().name)) celebrate(results.day);

    body.appendChild(el('h3', null, 'Tous les votes (' + results.votes.length + ')'));
    if (!results.votes.length) body.appendChild(el('p', 'muted', "Personne n'a voté ce jour-là."));

    for (const vote of results.votes) {
      const row = el('div', 'vote' + (vote.correct ? ' hit' : ''));
      row.appendChild(el('p', null,
        vote.voterName + ' a attribué le secret ' + vote.secretCode + ' à ' + vote.guessedName));
      row.appendChild(el('p', 'muted', '« ' + vote.secretText + ' »'));
      let verdict;
      if (vote.correct) {
        verdict = 'Trouvé ! +' + g.pointsCorrect + ' pour ' + vote.voterName;
      } else if (vote.authorName) {
        verdict = "Raté — c'était " + vote.authorName + ' (+' + g.pointsWrong + ' pour ' + vote.authorName + ')';
      } else {
        // Le serveur ne nomme pas l'auteur d'un secret encore en jeu : on ne le grille pas non plus.
        verdict = "Raté — ce n'est pas " + vote.guessedName + '. +' + g.pointsWrong +
          " pour l'auteur, qui reste dans l'ombre.";
      }
      row.appendChild(el('span', 'pill' + (vote.correct ? '' : ' bad'), verdict));
      body.appendChild(row);
    }
  }

  async function loadDay(day) {
    clear(body).appendChild(el('p', 'muted', 'Chargement…'));
    try {
      if (S.state.lastResults && S.state.lastResults.day === day) paintDay(S.state.lastResults);
      else paintDay(await GET('/api/results/' + day));
    } catch (error) {
      clear(body).appendChild(el('p', 'muted', error.message));
    }
  }
  loadDay(chosen);
}

/* ─────────────────────────────────────────────────────── classement ── */
function renderRanking(screen) {
  const g = game();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Classement'));
  card.appendChild(el('p', 'muted',
    '+' + g.pointsCorrect + ' par bonne réponse, +' + g.pointsWrong + ' par personne trompée par ton secret.'));

  const rows = S.state.leaderboard;
  if (!rows.length) card.appendChild(el('p', 'muted', 'Personne dans la partie.'));
  rows.forEach((entry, index) => {
    const row = el('div', 'rank' + (index < 3 ? ' p' + (index + 1) : '') +
                             (me() && entry.id === me().id ? ' me' : ''));
    row.appendChild(el('div', 'pos', String(index + 1)));
    const who = el('div', 'who', entry.name);
    who.appendChild(el('small', null,
      plural(entry.found, 'secret trouvé', 'secrets trouvés') + ' · ' +
      plural(entry.fooled, 'personne trompée', 'personnes trompées')));
    row.appendChild(who);
    row.appendChild(el('div', 'pts', entry.points + (Math.abs(entry.points) > 1 ? ' pts' : ' pt')));
    card.appendChild(row);
  });
  screen.appendChild(card);
}

/* ──────────────────────────────────────────────────────── animateur ── */
function renderAnim(screen) {
  if (!S.state.isAdmin || !S.overview) {
    const card = el('div', 'card');
    card.appendChild(el('h2', null, 'Espace animateur'));
    card.appendChild(el('p', 'muted', 'Réservé au formateur : entre le mot de passe animateur pour piloter les journées.'));
    const form = el('form');
    const pass = document.createElement('input');
    pass.type = 'password'; pass.autocomplete = 'current-password'; pass.required = true;
    const submit = el('button', 'btn full', 'Entrer');
    form.append(el('label', null, 'Mot de passe animateur'), pass, submit);
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try { await POST('/api/admin/login', { password: pass.value }); await refresh(true); }
      catch (error) { say('animMsg', error.message); submit.disabled = false; }
    };
    card.appendChild(form);
    const msg = el('div'); msg.id = 'animMsg'; card.appendChild(msg);
    return screen.appendChild(card);
  }

  const over = S.overview;
  const round = over.round;
  const open = !!round && round.status === 'open';
  const withSecret = over.players.filter((p) => p.hasSecret).length;

  const pilot = el('div', 'card');
  pilot.appendChild(el('h2', null, 'Pilotage de la partie'));
  const table = el('table');
  const lines = [
    ['Inscrits', String(over.players.length)],
    ['Secrets déposés', withSecret + ' / ' + over.players.length],
    ['Secrets démasqués', over.players.filter((p) => p.solved).length + ' / ' + withSecret],
    ['Barème', '+' + over.rules.pointsCorrect + ' trouvé / +' + over.rules.pointsWrong + ' par erreur'],
  ];
  if (open) lines.splice(2, 0, ['Votes de la journée ' + round.day,
    over.players.filter((p) => p.votedToday).length + ' / ' + withSecret]);
  for (const [label, value] of lines) {
    const tr = el('tr');
    tr.append(el('th', null, label), el('td', null, value));
    table.appendChild(tr);
  }
  pilot.appendChild(table);

  const actions = el('div', 'row');
  function action(label, cls, enabled, url, confirmText) {
    const button = el('button', 'btn small ' + cls, label);
    button.type = 'button';
    button.disabled = !enabled;
    button.onclick = async () => {
      if (confirmText && !window.confirm(confirmText)) return;
      button.disabled = true;
      say('pilotMsg', '');
      try { await POST(url); await refresh(true); say('pilotMsg', label + " : c'est fait.", 'ok'); }
      catch (error) { say('pilotMsg', error.message); button.disabled = false; }
    };
    actions.appendChild(button);
  }
  action('Lancer la partie', '', over.phase === 'lobby', '/api/admin/start',
    'Lancer la partie ? Les secrets seront verrouillés et la journée 1 ouverte.');
  action('Clôturer & révéler', '', open, '/api/admin/close-day',
    'Clôturer la journée ? Tous les votes du jour deviennent publics et les points sont attribués.');
  action('Ouvrir la journée suivante', 'ghost', over.phase === 'jeu' && !open, '/api/admin/open-day');
  action('Terminer la partie', 'ghost', over.phase !== 'fini', '/api/admin/end',
    'Terminer la partie ? Tous les secrets restants seront révélés.');
  pilot.appendChild(actions);
  const pmsg = el('div'); pmsg.id = 'pilotMsg'; pilot.appendChild(pmsg);
  screen.appendChild(pilot);

  const people = el('div', 'card');
  people.appendChild(el('h2', null, 'Participants'));
  people.appendChild(el('p', 'muted',
    'Tu vois les secrets avec leur auteur, pour pouvoir modérer et animer le reveal à voix haute.'));
  for (const player of over.players) {
    const box = el('div', 'secret flat');
    const head = el('p');
    head.appendChild(el('strong', null, player.name));
    head.appendChild(document.createTextNode(' '));
    head.appendChild(el('span', player.hasSecret ? 'pill' : 'pill bad',
      player.hasSecret ? 'Secret ' + player.secretCode : 'Pas de secret'));
    if (player.solved) head.appendChild(el('span', 'pill grey', ' démasqué '));
    if (player.votedToday) head.appendChild(el('span', 'pill', ' a voté '));
    box.appendChild(head);
    if (player.secretText) box.appendChild(el('span', 'txt', player.secretText));

    const remove = el('button', 'btn small bad', 'Retirer');
    remove.type = 'button';
    remove.onclick = async () => {
      if (!window.confirm('Retirer ' + player.name + ' ? Son secret et ses votes seront effacés.')) return;
      try { await DEL('/api/admin/player/' + player.id); await refresh(true); }
      catch (error) { window.alert(error.message); }
    };
    box.appendChild(remove);
    people.appendChild(box);
  }
  screen.appendChild(people);

  const settings = el('div', 'card');
  settings.appendChild(el('h2', null, 'Réglages'));
  const form = el('form');
  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.maxLength = 60; nameInput.value = over.gameName;
  const okInput = document.createElement('input');
  okInput.type = 'number'; okInput.min = '0'; okInput.max = '100'; okInput.value = String(over.rules.pointsCorrect);
  const koInput = document.createElement('input');
  koInput.type = 'number'; koInput.min = '0'; koInput.max = '100'; koInput.value = String(over.rules.pointsWrong);
  const passInput = document.createElement('input');
  passInput.type = 'password'; passInput.autocomplete = 'new-password';
  const save = el('button', 'btn full', 'Enregistrer les réglages');
  form.append(el('label', null, 'Nom de la partie'), nameInput,
              el('label', null, 'Points pour une bonne réponse'), okInput,
              el('label', null, "Points pour l'auteur, par personne trompée"), koInput,
              el('label', null, 'Nouveau mot de passe animateur (vide = inchangé)'), passInput, save);
  form.onsubmit = async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await POST('/api/admin/settings', {
        gameName: nameInput.value,
        pointsCorrect: okInput.value,
        pointsWrong: koInput.value,
        adminPassword: passInput.value,
      });
      passInput.value = '';
      await refresh(true);
      say('setMsg', 'Réglages enregistrés.', 'ok');
    } catch (error) { say('setMsg', error.message); }
    save.disabled = false;
  };
  settings.appendChild(form);
  const smsg = el('div'); smsg.id = 'setMsg'; settings.appendChild(smsg);

  settings.appendChild(el('h3', null, 'Zone rouge'));
  const danger = el('div', 'row');
  const soft = el('button', 'btn small ghost', 'Nouvelle partie (garder les comptes)');
  soft.type = 'button';
  soft.onclick = async () => {
    if (!window.confirm('Les votes, journées et points sont effacés. Comptes et secrets conservés. Continuer ?')) return;
    try { await POST('/api/admin/reset', { keepPlayers: true }); await refresh(true); say('setMsg', 'Nouvelle partie prête.', 'ok'); }
    catch (error) { say('setMsg', error.message); }
  };
  const hard = el('button', 'btn small bad', 'Tout effacer');
  hard.type = 'button';
  hard.onclick = async () => {
    if (!window.confirm('TOUT effacer : comptes, secrets, votes et points. Irréversible.')) return;
    if (!window.confirm("Dernière confirmation : on efface vraiment tout ?")) return;
    try { await POST('/api/admin/reset', { keepPlayers: false }); await refresh(true); say('setMsg', 'Tout a été effacé.', 'ok'); }
    catch (error) { say('setMsg', error.message); }
  };
  danger.append(soft, hard);
  settings.appendChild(danger);

  const out = el('div', 'linkline');
  const leave = el('button', null, "Quitter l'espace animateur");
  leave.type = 'button';
  leave.onclick = async () => { await POST('/api/admin/logout'); S.overview = null; await refresh(true); };
  out.appendChild(leave);
  settings.appendChild(out);
  screen.appendChild(settings);
}

/* ────────────────────────────────────────────────────── démarrage ── */
refresh(true);
setInterval(() => {
  if (document.visibilityState === 'visible') refresh(false);
}, 8000);
