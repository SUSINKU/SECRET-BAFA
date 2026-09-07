'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

/**
 * Couche base de données.
 *
 * libSQL, c'est du SQLite : le même SQL marche sur un fichier local en
 * développement et sur une base hébergée en production. C'est ce qui permet
 * de tourner sans disque persistant — donc sur une offre d'hébergement
 * gratuite — sans réécrire une requête.
 *
 *   DATABASE_URL=file:./data/secret-bafa.db     (défaut, local)
 *   DATABASE_URL=libsql://xxx.turso.io          + DATABASE_AUTH_TOKEN
 */

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.DB_FILE) return 'file:' + process.env.DB_FILE;
  return 'file:' + path.join(DATA_DIR, 'secret-bafa.db');
}

const URL = resolveUrl();
if (URL.startsWith('file:')) {
  fs.mkdirSync(path.dirname(URL.slice('file:'.length)), { recursive: true });
}

const client = createClient({
  url: URL,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  name_key      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  bonus_points  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS secrets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  INTEGER NOT NULL UNIQUE REFERENCES players(id),
  text       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  sort_key   TEXT NOT NULL,
  solved_day INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rounds (
  day       INTEGER PRIMARY KEY,
  status    TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  day               INTEGER NOT NULL,
  voter_id          INTEGER NOT NULL REFERENCES players(id),
  secret_id         INTEGER NOT NULL REFERENCES secrets(id),
  guessed_player_id INTEGER NOT NULL REFERENCES players(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (day, voter_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/* ------------------------------------------------------------- requêtes */

/** Les lignes libSQL sont des objets à clés nommées ; on les aplatit pour
 *  pouvoir les sérialiser et les comparer sans surprise. */
function plain(row) {
  return row === undefined ? undefined : Object.assign({}, row);
}

async function all(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows.map(plain);
}

async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows.length ? rows[0] : undefined;
}

async function run(sql, args = []) {
  return client.execute({ sql, args });
}

/** Plusieurs écritures qui doivent réussir ou échouer ensemble. */
async function batch(statements) {
  const useful = statements.filter(Boolean);
  if (!useful.length) return [];
  return client.batch(useful);
}

/* ------------------------------------------------------------- réglages */

async function getSetting(key, fallback = null) {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  await run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
}

async function getNumber(key, fallback) {
  const value = Number(await getSetting(key));
  return Number.isFinite(value) ? value : fallback;
}

/** Crée le schéma, puis pose les valeurs par défaut au tout premier démarrage. */
async function init(hashPassword) {
  await client.executeMultiple(SCHEMA);

  const defaults = {
    game_name: process.env.GAME_NAME || 'Secret BAFA',
    phase: 'lobby', // lobby -> jeu -> fini
    points_correct: '3',
    points_wrong: '1',
    session_secret: crypto.randomBytes(32).toString('hex'),
    admin_password_hash: hashPassword(process.env.ADMIN_PASSWORD || 'bafa2026'),
  };
  for (const [key, value] of Object.entries(defaults)) {
    if ((await getSetting(key)) === null) await setSetting(key, value);
  }
}

module.exports = { client, all, get, run, batch, getSetting, setSetting, getNumber, init, URL };
