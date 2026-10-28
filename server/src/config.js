'use strict';
/* Server configuration.
   - Reads settings from environment variables (optionally filled from server/.env).
   - Contains NO secrets in Phase 1. Later phases read secrets (for example an admin password hash or an AI key)
     from the environment ONLY. They must never be written in code, in the frontend, or in git.
   - Pure Node.js, no extra packages. */
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..');
const NODE_ENVS = ['development', 'test', 'production'];

/* Loads server/.env if it exists. Returns true when a file was loaded, false when there is none.
   Values that are already set in the real environment are NOT overridden. */
function loadEnvFileIfPresent(file = path.join(SERVER_DIR, '.env')) {
  try {
    process.loadEnvFile(file);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

function parsePort(value) {
  if (value === undefined || String(value).trim() === '') return 3000;
  const text = String(value).trim();
  const port = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be a whole number from 0 to 65535.');
  }
  return port;
}

const isLoopbackHost = (host) => host === '127.0.0.1' || host === 'localhost' || host === '::1';

const DB_DRIVERS = ['auto', 'better-sqlite3', 'node-sqlite'];
const MB = 1024 * 1024;

/* Relative paths in .env are relative to the server/ folder, so the result never depends on where you run the command. */
function resolveInServerDir(value, fallback) {
  return path.resolve(SERVER_DIR, value && String(value).trim() ? String(value).trim() : fallback);
}

function parseMaxPhotoBytes(value) {
  if (value === undefined || String(value).trim() === '') return 5 * MB;
  const text = String(value).trim();
  const n = Number(text);
  if (!/^\d+$/.test(text) || n < 1024 || n > 20 * MB) {
    throw new Error('MAX_PHOTO_BYTES must be a whole number of bytes from 1024 to 20971520 (20 MB).');
  }
  return n;
}

function loadConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development').trim();
  if (!NODE_ENVS.includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}.`);
  }
  const host = String(env.HOST || '127.0.0.1').trim();
  const frontendDir = path.resolve(env.FRONTEND_DIR ? String(env.FRONTEND_DIR) : path.join(SERVER_DIR, '..'));

  const dbDriver = String(env.DB_DRIVER || 'auto').trim();
  if (!DB_DRIVERS.includes(dbDriver)) {
    throw new Error(`DB_DRIVER must be one of: ${DB_DRIVERS.join(', ')}.`);
  }
  const dbFileRaw = env.DB_FILE && String(env.DB_FILE).trim();
  const dbFile = dbFileRaw === ':memory:' ? ':memory:' : resolveInServerDir(dbFileRaw, path.join('data', 'readylink.db'));
  const maxPhotoBytes = parseMaxPhotoBytes(env.MAX_PHOTO_BYTES);

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: parsePort(env.PORT),
    host,
    isLoopbackOnly: isLoopbackHost(host),
    frontendDir,
    dbDriver,
    dbFile,
    uploadsDir: resolveInServerDir(env.UPLOADS_DIR, 'uploads'),
    maxPhotoBytes,
    // The photo travels inside a JSON body as base64 text (about 4/3 of the file size), plus the other fields.
    jsonLimitBytes: Math.ceil((maxPhotoBytes * 4) / 3) + 64 * 1024,
  });
}

module.exports = { loadConfig, loadEnvFileIfPresent, SERVER_DIR, DB_DRIVERS };
