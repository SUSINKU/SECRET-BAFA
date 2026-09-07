'use strict';

const path = require('path');
const express = require('express');

const db = require('./db');
const auth = require('./auth');
const game = require('./game');

let SESSION_SECRET = null;
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

/* ------------------------------------------------------------ middlewares */

app.use(async (req, res, next) => {
  try {
    const jar = auth.parseCookies(req);
    const playerToken = auth.readToken(jar[auth.PLAYER_COOKIE], SESSION_SECRET);
    req.player = playerToken ? await game.findPlayer(playerToken.id) : null;
    req.isAdmin = Boolean(auth.readToken(jar[auth.ADMIN_COOKIE], SESSION_SECRET));
    next();
  } catch (error) {
    next(error);
  }
});

function requirePlayer(req, res, next) {
  if (!req.player) return res.status(401).json({ error: 'Tu dois être connecté.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) return res.status(401).json({ error: 'Accès animateur requis.' });
  next();
}

/** Enveloppe les handlers pour transformer une GameError en réponse JSON propre. */
function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof game.GameError) {
        res.status(error.status).json({ error: error.message });
      } else {
        console.error(error);
        res.status(500).json({ error: 'Erreur interne du serveur.' });
      }
    }
  };
}

/* ------------------------------------------------------------------ compte */

app.post(
  '/api/register',
  handler(async (req, res) => {
    const { name, password } = req.body || {};
    if (typeof password !== 'string' || password.length < 4) {
      throw new game.GameError('Le mot de passe doit faire au moins 4 caractères.');
    }
    const player = await game.createPlayer(name, auth.hashPassword(password));
    auth.setCookie(
      res,
      auth.PLAYER_COOKIE,
      auth.createToken({ id: player.id, exp: auth.expiry() }, SESSION_SECRET)
    );
    res.json({ player: { id: player.id, name: player.name } });
  })
);

app.post(
  '/api/login',
  handler(async (req, res) => {
    const { name, password } = req.body || {};
    const player = await game.findPlayerByName(name);
    if (!player || !auth.verifyPassword(String(password || ''), player.password_hash)) {
      throw new game.GameError('Prénom ou mot de passe incorrect.', 401);
    }
    auth.setCookie(
      res,
      auth.PLAYER_COOKIE,
      auth.createToken({ id: player.id, exp: auth.expiry() }, SESSION_SECRET)
    );
    res.json({ player: { id: player.id, name: player.name } });
  })
);

app.post('/api/logout', (req, res) => {
  auth.clearCookie(res, auth.PLAYER_COOKIE);
  res.json({ ok: true });
});

/* -------------------------------------------------------------------- jeu */

app.get(
  '/api/state',
  handler(async (req, res) => {
    const state = await game.buildState(req.player ? req.player.id : null);
    state.isAdmin = req.isAdmin;
    res.json(state);
  })
);

app.post(
  '/api/secret',
  requirePlayer,
  handler(async (req, res) => {
    const secret = await game.saveSecret(req.player.id, (req.body || {}).text);
    res.json({ code: secret.code, text: secret.text });
  })
);

app.post(
  '/api/vote',
  requirePlayer,
  handler(async (req, res) => {
    const { secretId, guessedPlayerId } = req.body || {};
    const result = await game.castVote(req.player.id, Number(secretId), Number(guessedPlayerId));
    res.json(result);
  })
);

app.get(
  '/api/results/:day',
  handler(async (req, res) => {
    const results = await game.dayResults(Number(req.params.day));
    if (!results) return res.status(404).json({ error: 'Journée introuvable ou pas encore close.' });
    res.json(results);
  })
);

/* -------------------------------------------------------------- animateur */

app.post(
  '/api/admin/login',
  handler(async (req, res) => {
    const { password } = req.body || {};
    if (!auth.verifyPassword(String(password || ''), await db.getSetting('admin_password_hash'))) {
      throw new game.GameError('Mot de passe animateur incorrect.', 401);
    }
    auth.setCookie(
      res,
      auth.ADMIN_COOKIE,
      auth.createToken({ admin: true, exp: auth.expiry() }, SESSION_SECRET)
    );
    res.json({ ok: true });
  })
);

app.post('/api/admin/logout', (req, res) => {
  auth.clearCookie(res, auth.ADMIN_COOKIE);
  res.json({ ok: true });
});

app.post(
  '/api/admin/start',
  requireAdmin,
  handler(async (req, res) => res.json({ round: await game.startGame() }))
);

app.post(
  '/api/admin/close-day',
  requireAdmin,
  handler(async (req, res) => res.json({ results: await game.closeDay() }))
);

app.post(
  '/api/admin/open-day',
  requireAdmin,
  handler(async (req, res) => res.json({ round: await game.openNextDay() }))
);

app.post(
  '/api/admin/end',
  requireAdmin,
  handler(async (req, res) => {
    await game.endGame();
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/settings',
  requireAdmin,
  handler(async (req, res) => {
    const { gameName, pointsCorrect, pointsWrong, adminPassword } = req.body || {};
    if (typeof gameName === 'string' && gameName.trim()) {
      await db.setSetting('game_name', gameName.trim().slice(0, 60));
    }
    for (const [key, value] of [
      ['points_correct', pointsCorrect],
      ['points_wrong', pointsWrong],
    ]) {
      if (value === undefined || value === null || value === '') continue;
      const points = Number(value);
      if (!Number.isInteger(points) || points < 0 || points > 100) {
        throw new game.GameError('Les points doivent être un entier entre 0 et 100.');
      }
      await db.setSetting(key, points);
    }
    if (typeof adminPassword === 'string' && adminPassword.length > 0) {
      if (adminPassword.length < 4) {
        throw new game.GameError('Le mot de passe animateur doit faire au moins 4 caractères.');
      }
      await db.setSetting('admin_password_hash', auth.hashPassword(adminPassword));
    }
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/overview',
  requireAdmin,
  handler(async (req, res) => {
    const [round, players, leaderboard, days, gameName, rules, phase] = await Promise.all([
      game.currentRound(),
      game.listPlayers(),
      game.scoreboard(),
      db.all('SELECT * FROM rounds ORDER BY day DESC'),
      db.getSetting('game_name'),
      game.rules(),
      game.phase(),
    ]);

    const open = Boolean(round && round.status === 'open');
    const secretTexts = new Map(
      (await db.all('SELECT player_id, text FROM secrets')).map((s) => [s.player_id, s.text])
    );
    const votedToday = new Set(
      open ? (await db.all('SELECT voter_id FROM votes WHERE day = ?', [round.day]))
               .map((v) => v.voter_id)
           : []
    );
    const lastClosed = days.find((d) => d.status === 'closed');

    res.json({
      phase,
      round,
      rules,
      gameName,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        hasSecret: p.secret_id !== null,
        secretId: p.secret_id,
        secretCode: p.secret_code,
        solved: p.solved_day !== null,
        bonusPoints: p.bonus_points,
        secretText: secretTexts.has(p.id) ? secretTexts.get(p.id) : null,
        votedToday: votedToday.has(p.id),
      })),
      leaderboard,
      days,
      lastResults: lastClosed ? await game.dayResults(lastClosed.day, { revealAuthors: true }) : null,
    });
  })
);

app.post(
  '/api/admin/player/:id/bonus',
  requireAdmin,
  handler(async (req, res) => {
    const points = Number((req.body || {}).bonusPoints);
    if (!Number.isInteger(points) || points < -500 || points > 500) {
      throw new game.GameError('Ajustement invalide.');
    }
    const player = await game.findPlayer(Number(req.params.id));
    if (!player) throw new game.GameError('Joueur introuvable.', 404);
    await db.run('UPDATE players SET bonus_points = ? WHERE id = ?', [points, player.id]);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/player/:id',
  requireAdmin,
  handler(async (req, res) => {
    const player = await game.findPlayer(Number(req.params.id));
    if (!player) throw new game.GameError('Joueur introuvable.', 404);
    await game.removePlayer(player.id);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/secret/:id',
  requireAdmin,
  handler(async (req, res) => {
    if (!(await game.removeSecret(Number(req.params.id)))) {
      throw new game.GameError('Secret introuvable.', 404);
    }
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/reset',
  requireAdmin,
  handler(async (req, res) => {
    await game.resetGame(Boolean((req.body || {}).keepPlayers));
    res.json({ ok: true });
  })
);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

/** Schéma et secret de session : une seule fois, avant de servir quoi que ce soit. */
const ready = (async () => {
  await db.init(auth.hashPassword);
  SESSION_SECRET = await db.getSetting('session_secret');
})();

async function start() {
  await ready;
  app.listen(PORT, () => {
    console.log(`Secret BAFA écoute sur le port ${PORT}`);
    for (const url of localUrls(PORT)) console.log(`  ${url}`);
  });
}

/** Les adresses à donner aux stagiaires quand le jeu tourne sur un poste de la salle. */
function localUrls(port) {
  const urls = [`http://localhost:${port}`];
  const interfaces = require('os').networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Démarrage impossible :', error.message);
    process.exit(1);
  });
}

module.exports = app;
module.exports.ready = ready;
module.exports.start = start;
