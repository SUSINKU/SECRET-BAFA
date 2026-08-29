'use strict';

const crypto = require('crypto');

const SCRYPT_KEYLEN = 32;
const PLAYER_COOKIE = 'sb_player';
const ADMIN_COOKIE = 'sb_admin';
const MAX_AGE_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedBuf = Buffer.from(expected, 'hex');
  if (expectedBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

/** Jeton signé "payload.signature" — pas de stockage de session côté serveur. */
function createToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function readToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const jar = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    jar[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

function setCookie(res, name, value) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_DAYS * 24 * 60 * 60}`,
  ];
  if (process.env.SECURE_COOKIES === '1') parts.push('Secure');
  appendSetCookie(res, parts.join('; '));
}

function clearCookie(res, name) {
  appendSetCookie(res, `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', cookie);
  else res.setHeader('Set-Cookie', [].concat(existing, cookie));
}

function expiry() {
  return Date.now() + MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  readToken,
  parseCookies,
  setCookie,
  clearCookie,
  expiry,
  PLAYER_COOKIE,
  ADMIN_COOKIE,
};
