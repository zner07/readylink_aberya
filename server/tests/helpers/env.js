'use strict';
/* Shared test setup: temporary folders, a map helper, a database for a chosen driver. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGeo } = require('../../src/services/geo');
const { openDatabase, availableDrivers } = require('../../src/db');
const { loadConfig, SERVER_DIR } = require('../../src/config');

const FRONTEND_DIR = path.resolve(SERVER_DIR, '..');
const geo = createGeo(path.join(FRONTEND_DIR, 'data', 'alangilan.geojson'));
const DRIVERS = availableDrivers(); // for example ['better-sqlite3', 'node-sqlite']; tests run once per driver
const CLIENT_A = 'client-aaaaaaaaaaaaaaaa';
const CLIENT_B = 'client-bbbbbbbbbbbbbbbb';

const tempDir = (prefix = 'readylink-test-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
/* Deletes a temporary folder. On Windows a file can stay locked for a moment (antivirus, search indexer),
   so Node retries a few times. If it STILL cannot be deleted the error is not hidden: it usually means a
   database connection was left open, which is a real bug. */
const removeDir = (dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

/* How many file handles this process still holds on files inside `dir`.
   Works on Linux only (it reads /proc). Returns null on Windows and macOS. */
function openHandlesIn(dir) {
  const fdDir = '/proc/self/fd';
  if (!fs.existsSync(fdDir)) return null;
  let count = 0;
  for (const fd of fs.readdirSync(fdDir)) {
    try {
      if (fs.readlinkSync(path.join(fdDir, fd)).startsWith(dir)) count += 1;
    } catch (err) {
      /* the handle was closed while we were looking */
    }
  }
  return count;
}

/* A fresh in-memory database. */
const memoryDb = (driver) => openDatabase(':memory:', { driver });

/* A settings object for tests that need folders on disk. */
function testConfig(extra = {}) {
  const dir = tempDir();
  const config = loadConfig({ NODE_ENV: 'test', PORT: '0', DB_FILE: path.join(dir, 'test.db'), UPLOADS_DIR: path.join(dir, 'uploads'), ...extra });
  return { dir, config };
}

module.exports = { FRONTEND_DIR, geo, DRIVERS, CLIENT_A, CLIENT_B, tempDir, removeDir, openHandlesIn, memoryDb, testConfig };
