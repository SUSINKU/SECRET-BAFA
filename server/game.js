'use strict';

const crypto = require('crypto');
const { db, getSetting, setSetting, getNumber } = require('./db');

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

function phase() {
  return getSetting('phase', 'lobby');
}

function rules() {
  return {
    pointsCorrect: getNumber('points_correct', 3),
    pointsWrong: getNumber('points_wrong', 1),
  };
}

function currentRound() {
  return db.prepare('SELECT * FROM rounds ORDER BY day DESC LIMIT 1').get() || null;
}

function listPlayers() {
  return db
    .prepare(
      `SELECT p.id, p.name, p.created_at, p.bonus_points,
              s.id AS secret_id, s.code AS secret_code, s.solved_day
         FROM players p
         LEFT JOIN secrets s ON s.player_id = p.id
        ORDER BY p.name COLLATE NOCASE`
    )
    .all();
}

/** Barème : +pointsCorrect pour qui trouve, +pointsWrong à l'auteur pour chaque erreur reçue. */
function scoreboard() {
  const { pointsCorrect, pointsWrong } = rules();
  const players = listPlayers();
  const totals = new Map(
    players.map((p) => [p.id, { id: p.id, name: p.name, found: 0, fooled: 0, points: 0 }])
  );

  const votes = db
    .prepare(
      `SELECT v.voter_id, v.guessed_player_id, s.player_id AS author_id
         FROM votes v
         JOIN secrets s ON s.id = v.secret_id
         JOIN rounds r ON r.day = v.day
        WHERE r.status = 'closed'`
    )
    .all();

  for (const vote of votes) {
    if (vote.guessed_player_id === vote.author_id) {
      const voter = totals.get(vote.voter_id);
      if (voter) {
        voter.found += 1;
        voter.points += pointsCorrect;
      }
    } else {
      const author = totals.get(vote.author_id);
      if (author) {
        author.fooled += 1;
        author.points += pointsWrong;
      }
    }
  }

  for (const player of players) {
    totals.get(player.id).points += player.bonus_points;
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
function dayResults(day, { revealAuthors = false } = {}) {
  const round = db.prepare('SELECT * FROM rounds WHERE day = ?').get(day);
  if (!round || round.status !== 'closed') return null;

  const votes = db
    .prepare(
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
        ORDER BY s.code, voter.name COLLATE NOCASE`
    )
    .all(day);

  return {
    day,
    closedAt: round.closed_at,
    votes: votes.map((v) => {
      const correct = v.guessed_player_id === v.author_id;
      const known = revealAuthors || correct || v.solved_day !== null || phase() === 'fini';
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
    solved: db
      .prepare(
        `SELECT s.code, s.text, p.name AS author_name
           FROM secrets s JOIN players p ON p.id = s.player_id
          WHERE s.solved_day = ?
          ORDER BY s.code`
      )
      .all(day),
  };
}

/**
 * Vue du jeu pour un joueur donné (ou pour un spectateur si playerId est null).
 * Les secrets non résolus restent anonymes ; les secrets trouvés sont signés.
 */
function buildState(playerId) {
  const round = currentRound();
  const players = listPlayers();
  const me = playerId ? players.find((p) => p.id === playerId) || null : null;

  const secrets = db
    .prepare(
      `SELECT s.id, s.code, s.text, s.solved_day, s.player_id, p.name AS author_name
         FROM secrets s JOIN players p ON p.id = s.player_id
        ORDER BY s.sort_key`
    )
    .all();

  const gameOver = phase() === 'fini';
  const myVote = round
    ? db.prepare('SELECT * FROM votes WHERE day = ? AND voter_id = ?').get(round.day, playerId || 0)
    : null;

  const closedDays = db
    .prepare("SELECT day FROM rounds WHERE status = 'closed' ORDER BY day DESC")
    .all()
    .map((r) => r.day);

  return {
    game: {
      name: getSetting('game_name', 'Secret BAFA'),
      phase: phase(),
      ...rules(),
      day: round ? round.day : 0,
      roundStatus: round ? round.status : null,
      playersCount: players.length,
      secretsCount: secrets.length,
      solvedCount: secrets.filter((s) => s.solved_day !== null).length,
      votesToday: round && round.status === 'open'
        ? db.prepare('SELECT COUNT(*) AS n FROM votes WHERE day = ?').get(round.day).n
        : 0,
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
          secretText: me.secret_id
            ? db.prepare('SELECT text FROM secrets WHERE player_id = ?').get(me.id).text
            : '',
        }
      : null,
    myVote: myVote
      ? { secretId: myVote.secret_id, guessedPlayerId: myVote.guessed_player_id }
      : null,
    canVote: Boolean(
      me && round && round.status === 'open' && !myVote && me.secret_id !== null
    ),
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
    // Auteurs encore possibles : un joueur dont le secret est déjà trouvé est hors-jeu comme réponse.
    suspects: players
      .filter((p) => p.secret_id !== null && p.solved_day === null && (!me || p.id !== me.id))
      .map((p) => ({ id: p.id, name: p.name })),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      hasSecret: p.secret_id !== null,
      solved: p.solved_day !== null,
    })),
    leaderboard: scoreboard(),
    lastResults: closedDays.length ? dayResults(closedDays[0]) : null,
  };
}

/* ------------------------------------------------------------- inscription */

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function nameKey(name) {
  return normalizeName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

function createPlayer(name, passwordHash) {
  const clean = assertValidName(name);
  const key = nameKey(clean);
  if (db.prepare('SELECT 1 FROM players WHERE name_key = ?').get(key)) {
    throw new GameError('Ce prénom est déjà pris. Ajoute une initiale, par exemple.', 409);
  }
  const info = db
    .prepare('INSERT INTO players (name, name_key, password_hash) VALUES (?, ?, ?)')
    .run(clean, key, passwordHash);
  return db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
}

function findPlayerByName(name) {
  return db.prepare('SELECT * FROM players WHERE name_key = ?').get(nameKey(name)) || null;
}

function findPlayer(id) {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id) || null;
}

/* ----------------------------------------------------------------- secrets */

function newSecretCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = Array.from(
      { length: 3 },
      () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
    ).join('');
    if (!db.prepare('SELECT 1 FROM secrets WHERE code = ?').get(code)) return code;
  }
  throw new GameError('Impossible de générer un code de secret.', 500);
}

function saveSecret(playerId, text) {
  const clean = String(text || '').trim();
  if (clean.length < MIN_SECRET_LENGTH) {
    throw new GameError(`Ton secret doit faire au moins ${MIN_SECRET_LENGTH} caractères.`);
  }
  if (clean.length > MAX_SECRET_LENGTH) {
    throw new GameError(`Ton secret ne doit pas dépasser ${MAX_SECRET_LENGTH} caractères.`);
  }
  if (phase() !== 'lobby') {
    throw new GameError(
      'La partie a commencé : les secrets sont verrouillés. Vois avec ton animateur.',
      409
    );
  }

  const existing = db.prepare('SELECT * FROM secrets WHERE player_id = ?').get(playerId);
  if (existing) {
    db.prepare("UPDATE secrets SET text = ?, updated_at = datetime('now') WHERE id = ?").run(
      clean,
      existing.id
    );
    return db.prepare('SELECT * FROM secrets WHERE id = ?').get(existing.id);
  }

  const info = db
    .prepare('INSERT INTO secrets (player_id, text, code, sort_key) VALUES (?, ?, ?, ?)')
    .run(playerId, clean, newSecretCode(), crypto.randomBytes(8).toString('hex'));
  return db.prepare('SELECT * FROM secrets WHERE id = ?').get(info.lastInsertRowid);
}

/* -------------------------------------------------------------------- vote */

function castVote(playerId, secretId, guessedPlayerId) {
  const round = currentRound();
  if (phase() !== 'jeu' || !round || round.status !== 'open') {
    throw new GameError("Aucune journée de vote n'est ouverte pour le moment.", 409);
  }
  if (!db.prepare('SELECT 1 FROM secrets WHERE player_id = ?').get(playerId)) {
    throw new GameError('Tu dois avoir déposé ton propre secret pour pouvoir voter.', 409);
  }
  if (db.prepare('SELECT 1 FROM votes WHERE day = ? AND voter_id = ?').get(round.day, playerId)) {
    throw new GameError('Tu as déjà voté aujourd’hui. Une seule tentative par jour !', 409);
  }

  const secret = db.prepare('SELECT * FROM secrets WHERE id = ?').get(secretId);
  if (!secret) throw new GameError('Ce secret n’existe pas.', 404);
  if (secret.player_id === playerId) throw new GameError('Tu ne peux pas voter sur ton propre secret.');
  if (secret.solved_day !== null) throw new GameError('Ce secret a déjà été démasqué.', 409);

  const guessed = findPlayer(guessedPlayerId);
  if (!guessed) throw new GameError('Ce joueur n’existe pas.', 404);
  if (guessed.id === playerId) throw new GameError('Tu ne peux pas t’accuser toi-même.');

  const guessedSecret = db.prepare('SELECT * FROM secrets WHERE player_id = ?').get(guessed.id);
  if (!guessedSecret) throw new GameError('Ce joueur n’a pas déposé de secret.', 409);
  if (guessedSecret.solved_day !== null) {
    throw new GameError('Le secret de ce joueur a déjà été trouvé : il n’est plus suspect.', 409);
  }

  db.prepare(
    'INSERT INTO votes (day, voter_id, secret_id, guessed_player_id) VALUES (?, ?, ?, ?)'
  ).run(round.day, playerId, secret.id, guessed.id);

  return { day: round.day };
}

/* ------------------------------------------------------------- animateur */

const startGame = db.transaction(() => {
  if (phase() !== 'lobby') throw new GameError('La partie est déjà lancée.', 409);
  const withSecret = db.prepare('SELECT COUNT(*) AS n FROM secrets').get().n;
  if (withSecret < 3) {
    throw new GameError('Il faut au moins 3 secrets déposés pour lancer la partie.', 409);
  }
  setSetting('phase', 'jeu');
  db.prepare("INSERT INTO rounds (day, status) VALUES (1, 'open')").run();
  return currentRound();
});

/** Clôture la journée : les votes deviennent publics et les secrets trouvés sont signés. */
const closeDay = db.transaction(() => {
  const round = currentRound();
  if (!round || round.status !== 'open') throw new GameError('Aucune journée ouverte.', 409);

  db.prepare(
    `UPDATE secrets SET solved_day = ?
      WHERE solved_day IS NULL
        AND id IN (
          SELECT v.secret_id FROM votes v
            JOIN secrets s ON s.id = v.secret_id
           WHERE v.day = ? AND v.guessed_player_id = s.player_id
        )`
  ).run(round.day, round.day);

  db.prepare("UPDATE rounds SET status = 'closed', closed_at = datetime('now') WHERE day = ?").run(
    round.day
  );

  const remaining = db.prepare('SELECT COUNT(*) AS n FROM secrets WHERE solved_day IS NULL').get().n;
  if (remaining === 0) setSetting('phase', 'fini');

  return dayResults(round.day);
});

const openNextDay = db.transaction(() => {
  if (phase() === 'fini') throw new GameError('La partie est terminée.', 409);
  if (phase() !== 'jeu') throw new GameError("La partie n'est pas lancée.", 409);
  const round = currentRound();
  if (round && round.status === 'open') throw new GameError('Une journée est déjà ouverte.', 409);
  const day = round ? round.day + 1 : 1;
  db.prepare("INSERT INTO rounds (day, status) VALUES (?, 'open')").run(day);
  return currentRound();
});

const endGame = db.transaction(() => {
  const round = currentRound();
  if (round && round.status === 'open') closeDay();
  setSetting('phase', 'fini');
});

const resetGame = db.transaction((keepPlayers) => {
  db.prepare('DELETE FROM votes').run();
  db.prepare('DELETE FROM rounds').run();
  if (keepPlayers) {
    db.prepare('UPDATE secrets SET solved_day = NULL').run();
    db.prepare('UPDATE players SET bonus_points = 0').run();
  } else {
    db.prepare('DELETE FROM secrets').run();
    db.prepare('DELETE FROM players').run();
  }
  setSetting('phase', 'lobby');
});

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
  resetGame,
  rules,
  saveSecret,
  scoreboard,
  startGame,
};
