'use strict';

const path = require('path');
const express = require('express');

const { db, getSetting, setSetting, seedDefaults } = require('./db');
const auth = require('./auth');
const game = require('./game');

seedDefaults(auth.hashPassword);

const SESSION_SECRET = getSetting('session_secret');
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

/* ------------------------------------------------------------ middlewares */

app.use((req, res, next) => {
  const jar = auth.parseCookies(req);
  const playerToken = auth.readToken(jar[auth.PLAYER_COOKIE], SESSION_SECRET);
  req.player = playerToken ? game.findPlayer(playerToken.id) : null;
  req.isAdmin = Boolean(auth.readToken(jar[auth.ADMIN_COOKIE], SESSION_SECRET));
  next();
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
  return (req, res) => {
    try {
      fn(req, res);
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
  handler((req, res) => {
    const { name, password } = req.body || {};
    if (typeof password !== 'string' || password.length < 4) {
      throw new game.GameError('Le mot de passe doit faire au moins 4 caractères.');
    }
    const player = game.createPlayer(name, auth.hashPassword(password));
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
  handler((req, res) => {
    const { name, password } = req.body || {};
    const player = game.findPlayerByName(name);
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
  handler((req, res) => {
    const state = game.buildState(req.player ? req.player.id : null);
    state.isAdmin = req.isAdmin;
    res.json(state);
  })
);

app.post(
  '/api/secret',
  requirePlayer,
  handler((req, res) => {
    const secret = game.saveSecret(req.player.id, (req.body || {}).text);
    res.json({ code: secret.code, text: secret.text });
  })
);

app.post(
  '/api/vote',
  requirePlayer,
  handler((req, res) => {
    const { secretId, guessedPlayerId } = req.body || {};
    const result = game.castVote(req.player.id, Number(secretId), Number(guessedPlayerId));
    res.json(result);
  })
);

app.get(
  '/api/results/:day',
  handler((req, res) => {
    const results = game.dayResults(Number(req.params.day));
    if (!results) return res.status(404).json({ error: 'Journée introuvable ou pas encore close.' });
    res.json(results);
  })
);

/* -------------------------------------------------------------- animateur */

app.post(
  '/api/admin/login',
  handler((req, res) => {
    const { password } = req.body || {};
    if (!auth.verifyPassword(String(password || ''), getSetting('admin_password_hash'))) {
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
  handler((req, res) => res.json({ round: game.startGame() }))
);

app.post(
  '/api/admin/close-day',
  requireAdmin,
  handler((req, res) => res.json({ results: game.closeDay() }))
);

app.post(
  '/api/admin/open-day',
  requireAdmin,
  handler((req, res) => res.json({ round: game.openNextDay() }))
);

app.post(
  '/api/admin/end',
  requireAdmin,
  handler((req, res) => {
    game.endGame();
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/settings',
  requireAdmin,
  handler((req, res) => {
    const { gameName, pointsCorrect, pointsWrong, adminPassword } = req.body || {};
    if (typeof gameName === 'string' && gameName.trim()) {
      setSetting('game_name', gameName.trim().slice(0, 60));
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
      setSetting(key, points);
    }
    if (typeof adminPassword === 'string' && adminPassword.length > 0) {
      if (adminPassword.length < 4) {
        throw new game.GameError('Le mot de passe animateur doit faire au moins 4 caractères.');
      }
      setSetting('admin_password_hash', auth.hashPassword(adminPassword));
    }
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/overview',
  requireAdmin,
  handler((req, res) => {
    const round = game.currentRound();
    res.json({
      phase: game.phase(),
      round,
      rules: game.rules(),
      gameName: getSetting('game_name'),
      players: game.listPlayers().map((p) => ({
        id: p.id,
        name: p.name,
        hasSecret: p.secret_id !== null,
        secretId: p.secret_id,
        secretCode: p.secret_code,
        solved: p.solved_day !== null,
        bonusPoints: p.bonus_points,
        secretText: p.secret_id
          ? db.prepare('SELECT text FROM secrets WHERE player_id = ?').get(p.id).text
          : null,
        votedToday: Boolean(
          round &&
            round.status === 'open' &&
            db.prepare('SELECT 1 FROM votes WHERE day = ? AND voter_id = ?').get(round.day, p.id)
        ),
      })),
      leaderboard: game.scoreboard(),
      days: db.prepare('SELECT * FROM rounds ORDER BY day DESC').all(),
      lastResults: (() => {
        const last = db
          .prepare("SELECT day FROM rounds WHERE status = 'closed' ORDER BY day DESC LIMIT 1")
          .get();
        return last ? game.dayResults(last.day, { revealAuthors: true }) : null;
      })(),
    });
  })
);

app.post(
  '/api/admin/player/:id/bonus',
  requireAdmin,
  handler((req, res) => {
    const points = Number((req.body || {}).bonusPoints);
    if (!Number.isInteger(points) || points < -500 || points > 500) {
      throw new game.GameError('Ajustement invalide.');
    }
    const player = game.findPlayer(Number(req.params.id));
    if (!player) throw new game.GameError('Joueur introuvable.', 404);
    db.prepare('UPDATE players SET bonus_points = ? WHERE id = ?').run(points, player.id);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/player/:id',
  requireAdmin,
  handler((req, res) => {
    const player = game.findPlayer(Number(req.params.id));
    if (!player) throw new game.GameError('Joueur introuvable.', 404);
    db.prepare('DELETE FROM players WHERE id = ?').run(player.id);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/secret/:id',
  requireAdmin,
  handler((req, res) => {
    const info = db.prepare('DELETE FROM secrets WHERE id = ?').run(Number(req.params.id));
    if (info.changes === 0) throw new game.GameError('Secret introuvable.', 404);
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/reset',
  requireAdmin,
  handler((req, res) => {
    game.resetGame(Boolean((req.body || {}).keepPlayers));
    res.json({ ok: true });
  })
);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

if (require.main === module) {
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

module.exports = app;
