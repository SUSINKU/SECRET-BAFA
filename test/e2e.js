'use strict';

/**
 * Test bout-en-bout : simule une partie complète contre une base jetable.
 * Lancement : npm test
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'secret-bafa-')), 'test.db');
process.env.DB_FILE = DB_FILE;
process.env.ADMIN_PASSWORD = 'testadmin';
process.env.PORT = '0';

const app = require('../server/index.js');

let base = '';
const jars = new Map();

function cookieJar(who) {
  if (!jars.has(who)) jars.set(who, new Map());
  return jars.get(who);
}

async function call(who, method, url, body) {
  const jar = cookieJar(who);
  const headers = {};
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(base + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '') jar.delete(name);
    else jar.set(name, value);
  }

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

const get = (who, url) => call(who, 'GET', url);
const post = (who, url, body) => call(who, 'POST', url, body);

async function expectFail(promise, fragment) {
  const { status, data } = await promise;
  assert.ok(status >= 400, `attendu un échec, reçu ${status}`);
  if (fragment) {
    assert.ok(
      String(data.error).toLowerCase().includes(fragment.toLowerCase()),
      `message inattendu : ${data.error}`
    );
  }
}

const checks = [];
function check(name, fn) {
  checks.push([name, fn]);
}

/* ------------------------------------------------------------------ tests */

const PLAYERS = ['Alice', 'Bruno', 'Chloe', 'Diego'];
const SECRETS = {
  Alice: "J'ai déjà dormi une nuit entière dans une cabane à outils.",
  Bruno: "Je connais tout Le Roi Lion par coeur, dialogues compris.",
  Chloe: "J'ai peur des pigeons depuis mes 8 ans, c'est ridicule.",
  Diego: "Je mange mes pizzas avec une fourchette et un couteau.",
};
const secretByCode = {};

check('inscription des joueurs', async () => {
  for (const name of PLAYERS) {
    const { status, data } = await post(name, '/api/register', { name, password: 'motdepasse' });
    assert.strictEqual(status, 200, JSON.stringify(data));
    assert.strictEqual(data.player.name, name);
  }
});

check('un prénom déjà pris est refusé (insensible à la casse et aux accents)', async () => {
  await expectFail(post('x', '/api/register', { name: 'alice', password: 'motdepasse' }), 'déjà pris');
});

check('mot de passe trop court refusé', async () => {
  await expectFail(post('x', '/api/register', { name: 'Zoe', password: 'ab' }), 'mot de passe');
});

check('connexion avec un mauvais mot de passe refusée', async () => {
  await expectFail(post('x', '/api/login', { name: 'Alice', password: 'nope' }), 'incorrect');
});

check('dépôt des secrets', async () => {
  for (const name of PLAYERS) {
    const { status, data } = await post(name, '/api/secret', { text: SECRETS[name] });
    assert.strictEqual(status, 200, JSON.stringify(data));
    secretByCode[name] = data.code;
  }
  const { data } = await get('Alice', '/api/state');
  assert.strictEqual(data.game.secretsCount, 4);
  assert.strictEqual(data.me.hasSecret, true);
});

check('un secret trop court est refusé', async () => {
  await expectFail(post('Alice', '/api/secret', { text: 'court' }), 'au moins');
});

check('un secret peut être modifié tant que la partie n’a pas démarré', async () => {
  const modifie = SECRETS.Alice + ' Vraiment.';
  await post('Alice', '/api/secret', { text: modifie });
  const { data } = await get('Alice', '/api/state');
  assert.strictEqual(data.me.secretText, modifie);
  assert.strictEqual(data.game.secretsCount, 4, 'pas de doublon de secret');
  SECRETS.Alice = modifie;
});

check('impossible de voter avant le lancement', async () => {
  const { data } = await get('Alice', '/api/state');
  const cible = data.secrets.find((s) => !s.isMine);
  await expectFail(
    post('Alice', '/api/vote', { secretId: cible.id, guessedPlayerId: 999 }),
    'aucune journée'
  );
});

check('les secrets sont anonymes avant tout reveal', async () => {
  const { data } = await get('Alice', '/api/state');
  for (const secret of data.secrets) {
    assert.strictEqual(secret.authorName, null, `secret ${secret.code} ne doit pas être signé`);
  }
  assert.strictEqual(data.secrets.filter((s) => s.isMine).length, 1);
});

check('les actions animateur sont protégées', async () => {
  await expectFail(post('Alice', '/api/admin/start'), 'animateur');
  await expectFail(get('Alice', '/api/admin/overview'), 'animateur');
  await expectFail(post('admin', '/api/admin/login', { password: 'faux' }), 'incorrect');
});

check("l'animateur lance la partie", async () => {
  const login = await post('admin', '/api/admin/login', { password: 'testadmin' });
  assert.strictEqual(login.status, 200);
  const { status, data } = await post('admin', '/api/admin/start');
  assert.strictEqual(status, 200, JSON.stringify(data));
  assert.strictEqual(data.round.day, 1);
  assert.strictEqual(data.round.status, 'open');
});

check('les secrets sont verrouillés après le lancement', async () => {
  await expectFail(post('Alice', '/api/secret', { text: 'Un tout nouveau secret bien long.' }), 'verrouillés');
});

check('on ne peut pas voter sur son propre secret', async () => {
  const { data } = await get('Alice', '/api/state');
  const mien = data.secrets.find((s) => s.isMine);
  const bruno = data.players.find((p) => p.name === 'Bruno');
  await expectFail(
    post('Alice', '/api/vote', { secretId: mien.id, guessedPlayerId: bruno.id }),
    'ton propre secret'
  );
});

check('on ne peut pas s’accuser soi-même', async () => {
  const { data } = await get('Alice', '/api/state');
  const cible = data.secrets.find((s) => !s.isMine);
  await expectFail(
    post('Alice', '/api/vote', { secretId: cible.id, guessedPlayerId: data.me.id }),
    't’accuser toi-même'
  );
});

/** Retourne l'id du secret dont l'auteur est `authorName`. */
async function secretIdOf(viewer, authorName) {
  const { data } = await get(viewer, '/api/state');
  const code = secretByCode[authorName];
  const secret = data.secrets.find((s) => s.code === code);
  assert.ok(secret, `secret de ${authorName} introuvable`);
  return secret.id;
}

async function playerIdOf(viewer, name) {
  const { data } = await get(viewer, '/api/state');
  const player = data.players.find((p) => p.name === name);
  assert.ok(player, `joueur ${name} introuvable`);
  return player.id;
}

check('journée 1 : chacun vote une seule fois', async () => {
  // Alice trouve Bruno ; Bruno se trompe sur le secret de Chloe (accuse Diego) ;
  // Chloe se trompe sur le secret d'Alice (accuse Bruno) ; Diego ne vote pas.
  const votes = [
    ['Alice', 'Bruno', 'Bruno'],
    ['Bruno', 'Chloe', 'Diego'],
    ['Chloe', 'Alice', 'Bruno'],
  ];
  for (const [voter, secretAuthor, accused] of votes) {
    const { status, data } = await post('' + voter, '/api/vote', {
      secretId: await secretIdOf(voter, secretAuthor),
      guessedPlayerId: await playerIdOf(voter, accused),
    });
    assert.strictEqual(status, 200, JSON.stringify(data));
    assert.strictEqual(data.day, 1);
  }

  await expectFail(
    post('Alice', '/api/vote', {
      secretId: await secretIdOf('Alice', 'Chloe'),
      guessedPlayerId: await playerIdOf('Alice', 'Diego'),
    }),
    'déjà voté'
  );
});

check('les votes restent secrets tant que la journée est ouverte', async () => {
  const { status } = await get('Alice', '/api/results/1');
  assert.strictEqual(status, 404, 'les résultats du jour ne doivent pas fuiter');
  const { data } = await get('Bruno', '/api/state');
  assert.strictEqual(data.lastResults, null);
  assert.ok(data.leaderboard.every((entry) => entry.points === 0), 'aucun point avant le reveal');
});

check('clôture de la journée 1 : reveal et points', async () => {
  const { status, data } = await post('admin', '/api/admin/close-day');
  assert.strictEqual(status, 200, JSON.stringify(data));
  const results = data.results;
  assert.strictEqual(results.day, 1);
  assert.strictEqual(results.votes.length, 3);
  assert.strictEqual(results.votes.filter((v) => v.correct).length, 1);
  assert.strictEqual(results.solved.length, 1);
  assert.strictEqual(results.solved[0].author_name, 'Bruno');
});

check('barème : +3 pour Alice, +1 pour Chloe et pour Alice (secrets mal attribués)', async () => {
  const { data } = await get('Alice', '/api/state');
  const points = Object.fromEntries(data.leaderboard.map((e) => [e.name, e.points]));
  assert.deepStrictEqual(points, { Alice: 4, Chloe: 1, Bruno: 0, Diego: 0 });

  const alice = data.leaderboard.find((e) => e.name === 'Alice');
  assert.strictEqual(alice.found, 1, 'Alice a trouvé 1 secret');
  assert.strictEqual(alice.fooled, 1, 'une personne s’est trompée sur le secret d’Alice');
  assert.strictEqual(data.leaderboard[0].name, 'Alice', 'Alice est en tête');
});

check('l’animateur, lui, voit tous les auteurs pour animer le reveal', async () => {
  const { data } = await get('admin', '/api/admin/overview');
  assert.strictEqual(data.lastResults.day, 1);
  assert.ok(
    data.lastResults.votes.every((v) => v.authorName),
    'la vue animateur nomme l’auteur de chaque secret voté'
  );
  const rate = data.lastResults.votes.find((v) => v.voterName === 'Bruno');
  assert.strictEqual(rate.authorName, 'Chloe');
});

check('le secret démasqué est signé et sort du jeu', async () => {
  const { data } = await get('Diego', '/api/state');
  const secretBruno = data.secrets.find((s) => s.code === secretByCode.Bruno);
  assert.strictEqual(secretBruno.solved, true);
  assert.strictEqual(secretBruno.authorName, 'Bruno');
  assert.strictEqual(secretBruno.votable, false);
  assert.ok(!data.suspects.some((s) => s.name === 'Bruno'), 'Bruno n’est plus un suspect');

  const secretChloe = data.secrets.find((s) => s.code === secretByCode.Chloe);
  assert.strictEqual(secretChloe.authorName, null, 'les autres secrets restent anonymes');
});

check('pas de vote entre deux journées', async () => {
  await expectFail(
    post('Diego', '/api/vote', {
      secretId: await secretIdOf('Diego', 'Alice'),
      guessedPlayerId: await playerIdOf('Diego', 'Chloe'),
    }),
    'aucune journée'
  );
});

check('journée 2 : nouveau vote autorisé pour tout le monde', async () => {
  const { status, data } = await post('admin', '/api/admin/open-day');
  assert.strictEqual(status, 200, JSON.stringify(data));
  assert.strictEqual(data.round.day, 2);

  const vote = await post('Alice', '/api/vote', {
    secretId: await secretIdOf('Alice', 'Chloe'),
    guessedPlayerId: await playerIdOf('Alice', 'Chloe'),
  });
  assert.strictEqual(vote.status, 200, JSON.stringify(vote.data));
});

check('un secret déjà démasqué ne peut plus être voté', async () => {
  await expectFail(
    post('Diego', '/api/vote', {
      secretId: await secretIdOf('Diego', 'Bruno'),
      guessedPlayerId: await playerIdOf('Diego', 'Chloe'),
    }),
    'déjà été démasqué'
  );
});

check('accuser une personne déjà démasquée est refusé', async () => {
  await expectFail(
    post('Diego', '/api/vote', {
      secretId: await secretIdOf('Diego', 'Alice'),
      guessedPlayerId: await playerIdOf('Diego', 'Bruno'),
    }),
    'plus suspect'
  );
});

check('clôture de la journée 2 : le cumul des points est correct', async () => {
  await post('admin', '/api/admin/close-day');
  const { data } = await get('Alice', '/api/state');
  const points = Object.fromEntries(data.leaderboard.map((e) => [e.name, e.points]));
  assert.deepStrictEqual(points, { Alice: 7, Chloe: 1, Bruno: 0, Diego: 0 });
  assert.deepStrictEqual(data.game.closedDays, [2, 1]);
});

check('un vote raté ne révèle pas l’auteur d’un secret encore en jeu', async () => {
  const { data } = await get('Diego', '/api/results/1');

  // Chloe s'est trompée sur le secret d'Alice, qui n'a jamais été démasqué.
  const rate = data.votes.find((v) => v.voterName === 'Chloe');
  assert.strictEqual(rate.correct, false);
  assert.strictEqual(rate.secretSolved, false);
  assert.strictEqual(rate.authorName, null, 'l’auteur d’un secret non démasqué doit rester caché');

  // Alice a trouvé le secret de Bruno : celui-là est signé.
  const trouve = data.votes.find((v) => v.correct);
  assert.strictEqual(trouve.authorName, 'Bruno', 'un secret démasqué est bien signé');

  // Bruno s'est trompé sur le secret de Chloe, démasqué depuis à la journée 2 :
  // il est signé lui aussi, puisqu'il est déjà sorti du jeu.
  const depuis = data.votes.find((v) => v.voterName === 'Bruno');
  assert.strictEqual(depuis.correct, false);
  assert.strictEqual(depuis.authorName, 'Chloe');
});

check('les résultats des journées closes sont consultables par tous', async () => {
  const { status, data } = await get('Diego', '/api/results/1');
  assert.strictEqual(status, 200);
  assert.strictEqual(data.votes.length, 3);
  const vote = data.votes.find((v) => v.voterName === 'Chloe');
  assert.strictEqual(vote.correct, false);
  assert.strictEqual(vote.guessedName, 'Bruno');
});

check('les points bonus de l’animateur sont pris en compte', async () => {
  const diegoId = await playerIdOf('Diego', 'Diego');
  const { status } = await post('admin', `/api/admin/player/${diegoId}/bonus`, { bonusPoints: 5 });
  assert.strictEqual(status, 200);
  const { data } = await get('Diego', '/api/state');
  assert.strictEqual(data.leaderboard.find((e) => e.name === 'Diego').points, 5);
  await post('admin', `/api/admin/player/${diegoId}/bonus`, { bonusPoints: 0 });
});

check('le barème est configurable', async () => {
  await post('admin', '/api/admin/settings', { pointsCorrect: 10, pointsWrong: 2 });
  const { data } = await get('Alice', '/api/state');
  // Alice : 2 bonnes réponses (20) + 1 personne trompée (2) = 22
  assert.strictEqual(data.leaderboard.find((e) => e.name === 'Alice').points, 22);
  await post('admin', '/api/admin/settings', { pointsCorrect: 3, pointsWrong: 1 });
});

check('en fin de partie, les auteurs apparaissent dans les résultats passés', async () => {
  await post('admin', '/api/admin/end');
  const { data } = await get('Diego', '/api/results/1');
  assert.ok(data.votes.every((v) => v.authorName), 'tout est révélé une fois la partie finie');
});

check('fin de partie : tous les secrets sont révélés', async () => {
  await post('admin', '/api/admin/open-day');
  const { status } = await post('admin', '/api/admin/end');
  assert.strictEqual(status, 200);
  const { data } = await get('Diego', '/api/state');
  assert.strictEqual(data.game.phase, 'fini');
  for (const secret of data.secrets) {
    assert.ok(secret.authorName, `le secret ${secret.code} doit être signé en fin de partie`);
  }
});

check('déconnexion', async () => {
  await post('Alice', '/api/logout');
  const { data } = await get('Alice', '/api/state');
  assert.strictEqual(data.me, null);
});

check('remise à zéro en gardant les comptes', async () => {
  const { status } = await post('admin', '/api/admin/reset', { keepPlayers: true });
  assert.strictEqual(status, 200);
  const { data } = await get('Bruno', '/api/state');
  assert.strictEqual(data.game.phase, 'lobby');
  assert.strictEqual(data.game.day, 0);
  assert.strictEqual(data.game.secretsCount, 4);
  assert.strictEqual(data.game.solvedCount, 0);
  assert.ok(data.leaderboard.every((e) => e.points === 0));
});

check('remise à zéro complète', async () => {
  await post('admin', '/api/admin/reset', { keepPlayers: false });
  const { data } = await get('Bruno', '/api/state');
  assert.strictEqual(data.game.playersCount, 0);
  assert.strictEqual(data.me, null);
});

/* ------------------------------------------------------------------- run */

(async () => {
  await app.ready;                      // schéma créé avant le premier appel
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${name}\n    ${error.message}`);
    }
  }

  server.close();
  console.log(
    failed === 0
      ? `\n${checks.length} tests passés.`
      : `\n${failed} test(s) en échec sur ${checks.length}.`
  );
  process.exit(failed === 0 ? 0 : 1);
})();
