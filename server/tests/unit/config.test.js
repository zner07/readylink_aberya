'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig, loadEnvFileIfPresent, SERVER_DIR } = require('../../src/config');

test('defaults: local-only, port 3000, development, frontend = repository root', () => {
  const c = loadConfig({});
  assert.equal(c.port, 3000);
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.isLoopbackOnly, true);
  assert.equal(c.nodeEnv, 'development');
  assert.equal(c.isProduction, false);
  assert.equal(c.frontendDir, path.resolve(SERVER_DIR, '..'));
});

test('PORT: accepts 0 to 65535, rejects everything else', () => {
  assert.equal(loadConfig({ PORT: '4000' }).port, 4000);
  assert.equal(loadConfig({ PORT: '0' }).port, 0);
  assert.equal(loadConfig({ PORT: '65535' }).port, 65535);
  assert.equal(loadConfig({ PORT: '' }).port, 3000);
  for (const bad of ['abc', '70000', '-1', '3000.5', '30 00', '1e3']) {
    assert.throws(() => loadConfig({ PORT: bad }), /PORT must be a whole number/, `PORT=${bad}`);
  }
});

test('NODE_ENV: only development, test or production', () => {
  assert.equal(loadConfig({ NODE_ENV: 'production' }).isProduction, true);
  assert.equal(loadConfig({ NODE_ENV: 'test' }).nodeEnv, 'test');
  assert.throws(() => loadConfig({ NODE_ENV: 'staging' }), /NODE_ENV must be one of/);
});

test('HOST: non-loopback hosts are flagged, loopback ones are not', () => {
  assert.equal(loadConfig({ HOST: '0.0.0.0' }).isLoopbackOnly, false);
  assert.equal(loadConfig({ HOST: 'localhost' }).isLoopbackOnly, true);
  assert.equal(loadConfig({ HOST: '::1' }).isLoopbackOnly, true);
});

test('FRONTEND_DIR: resolved to an absolute path', () => {
  const c = loadConfig({ FRONTEND_DIR: 'some/relative/dir' });
  assert.ok(path.isAbsolute(c.frontendDir));
  assert.ok(c.frontendDir.endsWith(path.join('some', 'relative', 'dir')));
});

test('config object is frozen (cannot be changed by accident)', () => {
  const c = loadConfig({});
  assert.throws(() => { 'use strict'; c.port = 1; }, TypeError);
});

test('loadEnvFileIfPresent: returns false when there is no .env file', () => {
  assert.equal(loadEnvFileIfPresent(path.join(os.tmpdir(), 'readylink-no-such-dir', '.env')), false);
});

test('loadEnvFileIfPresent: loads a file but never overrides variables that are already set', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readylink-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'READYLINK_TEST_NEW=from-file\nREADYLINK_TEST_EXISTING=from-file\n');
  process.env.READYLINK_TEST_EXISTING = 'from-real-environment';
  try {
    assert.equal(loadEnvFileIfPresent(file), true);
    assert.equal(process.env.READYLINK_TEST_NEW, 'from-file');
    assert.equal(process.env.READYLINK_TEST_EXISTING, 'from-real-environment');
  } finally {
    delete process.env.READYLINK_TEST_NEW;
    delete process.env.READYLINK_TEST_EXISTING;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('database and upload settings: defaults live inside the server folder', () => {
  const c = loadConfig({});
  assert.equal(c.dbDriver, 'auto');
  assert.equal(c.dbFile, path.join(SERVER_DIR, 'data', 'readylink.db'));
  assert.equal(c.uploadsDir, path.join(SERVER_DIR, 'uploads'));
  assert.equal(c.maxPhotoBytes, 5 * 1024 * 1024);
  assert.ok(c.jsonLimitBytes > (c.maxPhotoBytes * 4) / 3, 'the JSON limit must have room for a base64 photo');
});

test('DB_DRIVER: auto, better-sqlite3 or node-sqlite', () => {
  for (const ok of ['auto', 'better-sqlite3', 'node-sqlite']) assert.equal(loadConfig({ DB_DRIVER: ok }).dbDriver, ok);
  assert.throws(() => loadConfig({ DB_DRIVER: 'mysql' }), /DB_DRIVER must be one of/);
});

test('DB_FILE and UPLOADS_DIR: relative paths are relative to the server folder, absolute paths are kept', () => {
  assert.equal(loadConfig({ DB_FILE: ':memory:' }).dbFile, ':memory:');
  assert.equal(loadConfig({ DB_FILE: 'data/other.db' }).dbFile, path.join(SERVER_DIR, 'data', 'other.db'));
  assert.equal(loadConfig({ UPLOADS_DIR: 'photos' }).uploadsDir, path.join(SERVER_DIR, 'photos'));
  const absolute = path.resolve(os.tmpdir(), 'readylink-abs.db');
  assert.equal(loadConfig({ DB_FILE: absolute }).dbFile, absolute);
});

test('MAX_PHOTO_BYTES: whole number from 1024 to 20 MB', () => {
  assert.equal(loadConfig({ MAX_PHOTO_BYTES: '1024' }).maxPhotoBytes, 1024);
  assert.equal(loadConfig({ MAX_PHOTO_BYTES: '20971520' }).maxPhotoBytes, 20971520);
  for (const bad of ['1023', '20971521', 'abc', '5.5', '-5', '1e6', '0']) {
    assert.throws(() => loadConfig({ MAX_PHOTO_BYTES: bad }), /MAX_PHOTO_BYTES must be/, bad);
  }
});
