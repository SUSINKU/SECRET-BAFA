'use strict';

const crypto = require('crypto');
const db = require('./db');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1
const MIN_SECRET_LENGTH = 10;
const MAX_SECRET_LENGTH = 500;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 30;

class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------------------ état */

const phase = () => db.getSetting('phase', 'lobby');

async function rules() {
  return {
    pointsCorrect: await db.getNumber('points_correct', 3),
    pointsWrong: await db.getNumber('points_wrong', 1),
  };
}

function currentRound() {
  return db.get('SELECT * FROM rounds ORDER BY day DESC LIMIT 1');
}

function listPlayers() {
  return db.all(
    `SELECT p.id, p.name, p.created_at, p.bonus_points,
            s.id AS secret_id, s.code AS secret_code, s.solved_day
       FROM players p
       LEFT JOIN secrets s ON s.player_id = p.id
      ORDER BY p.name COLLATE NOCASE`
  );
}

/** Barème : +pointsCorrect pour qui trouve, +pointsWrong à l'auteur par erreur reçue. */
async function scoreboard() {
  const { pointsCorrect, pointsWrong } = await rules();
  const players = await listPlayers();
  const totals = new Map(
    players.map((p) => [p.id, { id: p.id, name: p.name, found: 0, fooled: 0, points: p.bonus_points }])
  );

  const votes = await db.all(
    `SELECT v.voter_id, v.guessed_player_id, s.player_id AS author_id
       FROM votes v
       JOIN secrets s ON s.id = v.secret_id
       JOIN rounds r ON r.day = v.day
      WHERE r.status = 'closed'`
  );

  for (const vote of votes) {
    if (vote.guessed_player_id === vote.author_id) {
      const voter = totals.get(vote.voter_id);
      if (voter) { voter.found += 1; voter.points += pointsCorrect; }
    } else {
      const author = totals.get(vote.author_id);
      if (author) { author.fooled += 1; author.points += pointsWrong; }
    }
  }

  return [...totals.values()].sort(
    (a, b) => b.points - a.points || b.found - a.found || a.name.localeCompare(b.name, 'fr')
  );
}

/**
 * Résultats d'une journée close : qui a voté quoi, et qui avait raison.
 * L'auteur d'un secret n'est nommé que s'il a été démasqué (ou en fin de partie) :
 * un vote raté ne doit jamais griller un secret encore en jeu.
 * `revealAuthors` n'est utilisé que pour la vue animateur.
 */
async function dayResults(day, { revealAuthors = false } = {}) {
  const round = await db.get('SELECT * FROM rounds WHERE day = ?', [day]);
  if (!round || round.status !== 'closed') return null;

  const votes = await db.all(
    `SELECT v.id, v.voter_id, v.guessed_player_id, v.secret_id,
            voter.name   AS voter_name,
            guessed.name AS guessed_name,
            author.id    AS author_id,
            author.name  AS author_name,
            s.code AS secret_code, s.text AS secret_text, s.solved_day
       FROM votes v
       JOIN players voter   ON voter.id = v.voter_id
       JOIN players guessed ON guessed.id = v.guessed_player_id
       JOIN secrets s       ON s.id = v.secret_id
       JOIN players author  ON author.id = s.player_id
      WHERE v.day = ?
      ORDER BY s.code, voter.name COLLATE NOCASE`,
    [day]
  );

  const over = (await phase()) === 'fini';
  const solved = await db.all(
    `SELECT s.code, s.text, p.name AS author_name
       FROM secrets s JOIN players p ON p.id = s.player_id
      WHERE s.solved_day = ?
      ORDER BY s.code`,
    [day]
  );

  return {
    day,
    closedAt: round.closed_at,
    votes: votes.map((v) => {
      const correct = v.guessed_player_id === v.author_id;
      const known = revealAuthors || correct || v.solved_day !== null || over;
      return {
        voterName: v.voter_name,
        guessedName: v.guessed_name,
        authorName: known ? v.author_name : null,
        secretCode: v.secret_code,
        secretText: v.secret_text,
        secretSolved: v.solved_day !== null,
        correct,
      };
    }),
    solved,
  };
}

/**
 * Vue du jeu pour un joueur donné (ou pour un spectateur si playerId est null).
 * Les secrets non résolus restent anonymes ; les secrets trouvés sont signés.
 */
async function buildState(playerId) {
  const [round, players, currentPhase, currentRules] = await Promise.all([
    currentRound(), listPlayers(), phase(), rules(),
  ]);
  const me = playerId ? players.find((p) => p.id === playerId) || null : null;

  const secrets = await db.all(
    `SELECT s.id, s.code, s.text, s.solved_day, s.player_id, p.name AS author_name
       FROM secrets s JOIN players p ON p.id = s.player_id
      ORDER BY s.sort_key`
  );

  const gameOver = currentPhase === 'fini';
  const myVote = round && playerId
    ? await db.get('SELECT * FROM votes WHERE day = ? AND voter_id = ?', [round.day, playerId])
    : undefined;

  const closedDays = (await db.all("SELECT day FROM rounds WHERE status = 'closed' ORDER BY day DESC"))
    .map((r) => r.day);

  const votesToday = round && round.status === 'open'
    ? (await db.get('SELECT COUNT(*) AS n FROM votes WHERE day = ?', [round.day])).n
    : 0;

  const mySecret = me && me.secret_id
    ? await db.get('SELECT text FROM secrets WHERE player_id = ?', [me.id])
    : null;

  return {
    game: {
      name: await db.getSetting('game_name', 'Secret BAFA'),
      phase: currentPhase,
      ...currentRules,
      day: round ? round.day : 0,
      roundStatus: round ? round.status : null,
      playersCount: players.length,
      secretsCount: secrets.length,
      solvedCount: secrets.filter((s) => s.solved_day !== null).length,
      votesToday,
      closedDays,
    },
    me: me
      ? {
          id: me.id,
          name: me.name,
          hasSecret: me.secret_id !== null,
          secretCode: me.secret_code,
          secretSolved: me.solved_day !== null,
          secretSolvedDay: me.solved_day,
          secretText: mySecret ? mySecret.text : '',
        }
      : null,
    myVote: myVote ? { secretId: myVote.secret_id, guessedPlayerId: myVote.guessed_player_id } : null,
    canVote: Boolean(me && round && round.status === 'open' && !myVote && me.secret_id !== null),
    secrets: secrets.map((s) => {
      const revealed = s.solved_day !== null || gameOver;
      return {
        id: s.id,
        code: s.code,
        text: s.text,
        solved: s.solved_day !== null,
        solvedDay: s.solved_day,
        isMine: me ? s.player_id === me.id : false,
        authorName: revealed ? s.author_name : null,
        votable: Boolean(me) && s.solved_day === null && (!me || s.player_id !== me.id),
      };
    }),
    // Auteurs encore possibles : un joueur dont le secret est trouvé est hors-jeu comme réponse.
    suspects: players
      .filter((p) => p.secret_id !== null && p.solved_day === null && (!me || p.id !== me.id))
      .map((p) => ({ id: p.id, name: p.name })),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      hasSecret: p.secret_id !== null,
      solved: p.solved_day !== null,
    })),
    leaderboard: await scoreboard(),
    lastResults: closedDays.length ? await dayResults(closedDays[0]) : null,
  };
}

/* ------------------------------------------------------------- inscription */

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function nameKey(name) {
  return normalizeName(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function assertValidName(name) {
  const clean = normalizeName(name);
  if (clean.length < MIN_NAME_LENGTH || clean.length > MAX_NAME_LENGTH) {
    throw new GameError(
      `Le prénom doit faire entre ${MIN_NAME_LENGTH} et ${MAX_NAME_LENGTH} caractères.`
    );
  }
  return clean;
}

async function createPlayer(name, passwordHash) {
  const clean = assertValidName(name);
  const key = nameKey(clean);
  if (await db.get('SELECT 1 AS x FROM players WHERE name_key = ?', [key])) {
    throw new GameError('Ce prénom est déjà pris. Ajoute une initiale, par exemple.', 409);
  }
  const info = await db.run(
    'INSERT INTO players (name, name_key, password_hash) VALUES (?, ?, ?)',
    [clean, key, passwordHash]
  );
  return findPlayer(Number(info.lastInsertRowid));
}

async function findPlayerByName(name) {
  return (await db.get('SELECT * FROM players WHERE name_key = ?', [nameKey(name)])) || null;
}

async function findPlayer(id) {
  return (await db.get('SELECT * FROM players WHERE id = ?', [id])) || null;
}

/* ----------------------------------------------------------------- secrets */

async function newSecretCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = Array.from(
      { length: 3 },
      () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
    ).join('');
    if (!(await db.get('SELECT 1 AS x FROM secrets WHERE code = ?', [code]))) return code;
  }
  throw new GameError('Impossible de générer un code de secret.', 500);
}

async function saveSecret(playerId, text) {
  const clean = String(text || '').trim();
  if (clean.length < MIN_SECRET_LENGTH) {
    throw new GameError(`Ton secret doit faire au moins ${MIN_SECRET_LENGTH} caractères.`);
  }
  if (clean.length > MAX_SECRET_LENGTH) {
    throw new GameError(`Ton secret ne doit pas dépasser ${MAX_SECRET_LENGTH} caractères.`);
  }
  if ((await phase()) !== 'lobby') {
    throw new GameError(
      'La partie a commencé : les secrets sont verrouillés. Vois avec ton animateur.',
      409
    );
  }

  const existing = await db.get('SELECT * FROM secrets WHERE player_id = ?', [playerId]);
  if (existing) {
    await db.run("UPDATE secrets SET text = ?, updated_at = datetime('now') WHERE id = ?",
      [clean, existing.id]);
    return db.get('SELECT * FROM secrets WHERE id = ?', [existing.id]);
  }

  const info = await db.run(
    'INSERT INTO secrets (player_id, text, code, sort_key) VALUES (?, ?, ?, ?)',
    [playerId, clean, await newSecretCode(), crypto.randomBytes(8).toString('hex')]
  );
  return db.get('SELECT * FROM secrets WHERE id = ?', [Number(info.lastInsertRowid)]);
}

/* -------------------------------------------------------------------- vote */

async function castVote(playerId, secretId, guessedPlayerId) {
  const round = await currentRound();
  if ((await phase()) !== 'jeu' || !round || round.status !== 'open') {
    throw new GameError("Aucune journée de vote n'est ouverte pour le moment.", 409);
  }
  if (!(await db.get('SELECT 1 AS x FROM secrets WHERE player_id = ?', [playerId]))) {
    throw new GameError('Tu dois avoir déposé ton propre secret pour pouvoir voter.', 409);
  }
  if (await db.get('SELECT 1 AS x FROM votes WHERE day = ? AND voter_id = ?', [round.day, playerId])) {
    throw new GameError('Tu as déjà voté aujourd’hui. Une seule tentative par jour !', 409);
  }

  const secret = await db.get('SELECT * FROM secrets WHERE id = ?', [secretId]);
  if (!secret) throw new GameError('Ce secret n’existe pas.', 404);
  if (secret.player_id === playerId) throw new GameError('Tu ne peux pas voter sur ton propre secret.');
  if (secret.solved_day !== null) throw new GameError('Ce secret a déjà été démasqué.', 409);

  const guessed = await findPlayer(guessedPlayerId);
  if (!guessed) throw new GameError('Ce joueur n’existe pas.', 404);
  if (guessed.id === playerId) throw new GameError('Tu ne peux pas t’accuser toi-même.');

  const guessedSecret = await db.get('SELECT * FROM secrets WHERE player_id = ?', [guessed.id]);
  if (!guessedSecret) throw new GameError('Ce joueur n’a pas déposé de secret.', 409);
  if (guessedSecret.solved_day !== null) {
    throw new GameError('Le secret de ce joueur a déjà été trouvé : il n’est plus suspect.', 409);
  }

  await db.run(
    'INSERT INTO votes (day, voter_id, secret_id, guessed_player_id) VALUES (?, ?, ?, ?)',
    [round.day, playerId, secret.id, guessed.id]
  );
  return { day: round.day };
}

/* ------------------------------------------------------------- animateur */

async function startGame() {
  if ((await phase()) !== 'lobby') throw new GameError('La partie est déjà lancée.', 409);
  const { n } = await db.get('SELECT COUNT(*) AS n FROM secrets');
  if (n < 3) throw new GameError('Il faut au moins 3 secrets déposés pour lancer la partie.', 409);

  await db.batch([
    { sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ' +
           'ON CONFLICT(key) DO UPDATE SET value = excluded.value', args: ['phase', 'jeu'] },
    { sql: "INSERT INTO rounds (day, status) VALUES (1, 'open')", args: [] },
  ]);
  return currentRound();
}

/** Clôture la journée : les votes deviennent publics et les secrets trouvés sont signés. */
async function closeDay() {
  const round = await currentRound();
  if (!round || round.status !== 'open') throw new GameError('Aucune journée ouverte.', 409);

  await db.batch([
    {
      sql: `UPDATE secrets SET solved_day = ?
             WHERE solved_day IS NULL
               AND id IN (
                 SELECT v.secret_id FROM votes v
                   JOIN secrets s ON s.id = v.secret_id
                  WHERE v.day = ? AND v.guessed_player_id = s.player_id
               )`,
      args: [round.day, round.day],
    },
    {
      sql: "UPDATE rounds SET status = 'closed', closed_at = datetime('now') WHERE day = ?",
      args: [round.day],
    },
  ]);

  const { n } = await db.get('SELECT COUNT(*) AS n FROM secrets WHERE solved_day IS NULL');
  if (n === 0) await db.setSetting('phase', 'fini');

  return dayResults(round.day);
}

async function openNextDay() {
  const current = await phase();
  if (current === 'fini') throw new GameError('La partie est terminée.', 409);
  if (current !== 'jeu') throw new GameError("La partie n'est pas lancée.", 409);
  const round = await currentRound();
  if (round && round.status === 'open') throw new GameError('Une journée est déjà ouverte.', 409);
  const day = round ? round.day + 1 : 1;
  await db.run("INSERT INTO rounds (day, status) VALUES (?, 'open')", [day]);
  return currentRound();
}

async function endGame() {
  const round = await currentRound();
  if (round && round.status === 'open') await closeDay();
  await db.setSetting('phase', 'fini');
}

/** Suppression explicite : on ne compte pas sur ON DELETE CASCADE, dont
 *  l'activation dépend d'un PRAGMA qui ne s'applique pas partout. */
async function removePlayer(id) {
  const secret = await db.get('SELECT id FROM secrets WHERE player_id = ?', [id]);
  await db.batch([
    { sql: 'DELETE FROM votes WHERE voter_id = ? OR guessed_player_id = ?', args: [id, id] },
    secret ? { sql: 'DELETE FROM votes WHERE secret_id = ?', args: [secret.id] } : null,
    { sql: 'DELETE FROM secrets WHERE player_id = ?', args: [id] },
    { sql: 'DELETE FROM players WHERE id = ?', args: [id] },
  ]);
}

async function removeSecret(id) {
  const result = await db.batch([
    { sql: 'DELETE FROM votes WHERE secret_id = ?', args: [id] },
    { sql: 'DELETE FROM secrets WHERE id = ?', args: [id] },
  ]);
  return result[result.length - 1].rowsAffected > 0;
}

async function resetGame(keepPlayers) {
  const statements = [
    { sql: 'DELETE FROM votes', args: [] },
    { sql: 'DELETE FROM rounds', args: [] },
  ];
  if (keepPlayers) {
    statements.push({ sql: 'UPDATE secrets SET solved_day = NULL', args: [] });
    statements.push({ sql: 'UPDATE players SET bonus_points = 0', args: [] });
  } else {
    statements.push({ sql: 'DELETE FROM secrets', args: [] });
    statements.push({ sql: 'DELETE FROM players', args: [] });
  }
  await db.batch(statements);
  await db.setSetting('phase', 'lobby');
}

module.exports = {
  GameError,
  MIN_SECRET_LENGTH,
  MAX_SECRET_LENGTH,
  buildState,
  castVote,
  closeDay,
  createPlayer,
  currentRound,
  dayResults,
  endGame,
  findPlayer,
  findPlayerByName,
  listPlayers,
  openNextDay,
  phase,
  removePlayer,
  removeSecret,
  resetGame,
  rules,
  saveSecret,
  scoreboard,
  startGame,
};
