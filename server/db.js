'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'secret-bafa.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
  player_id  INTEGER NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
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
  day               INTEGER NOT NULL REFERENCES rounds(day) ON DELETE CASCADE,
  voter_id          INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  secret_id         INTEGER NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  guessed_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (day, voter_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const readSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const writeSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function getSetting(key, fallback = null) {
  const row = readSetting.get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  writeSetting.run(key, String(value));
}

function getNumber(key, fallback) {
  const value = Number(getSetting(key));
  return Number.isFinite(value) ? value : fallback;
}

/** Valeurs par défaut posées au tout premier démarrage uniquement. */
function seedDefaults(hashPassword) {
  const defaults = {
    game_name: process.env.GAME_NAME || 'Secret BAFA',
    phase: 'lobby', // lobby -> jeu -> fini
    points_correct: '3',
    points_wrong: '1',
    session_secret: crypto.randomBytes(32).toString('hex'),
    admin_password_hash: hashPassword(process.env.ADMIN_PASSWORD || 'bafa2026'),
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (getSetting(key) === null) setSetting(key, value);
  }
}

module.exports = { db, getSetting, setSetting, getNumber, seedDefaults, DB_FILE };
