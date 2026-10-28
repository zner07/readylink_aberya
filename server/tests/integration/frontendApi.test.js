'use strict';
/* Phase 2 integration tests: the REAL frontend API client (js/api.js + js/api-server.js, run in a sandbox with the
   real fetch) talking to the REAL Express server and a temporary SQLite database.
   They prove the frontend and the backend agree on URLs, headers, the photo format, "my reports" and error messages.
   Needs the dependencies installed first:   cd server   then   npm.cmd install   */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

try {
  require('express');
} catch (err) {
  throw new Error('Express is not installed. Open a terminal in the "server" folder and run:  npm.cmd install');
}

const { createApp } = require('../../src/app');
const { openDatabase } = require('../../src/db');
const { seedSamples } = require('../../src/services/seedService');
const { loadFrontend, fakeStorage, plain } = require('../helpers/frontend');
const images = require('../helpers/images');
const { geo, FRONTEND_DIR, testConfig, removeDir } = require('../helpers/env');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const PHOTO = images.dataUrl('jpeg');

async function startServer(env = {}, { seed = true, existing } = {}) {
  const { dir, config } = existing || testConfig(env);
  let db;
  let server;
  try {
    db = openDatabase(config.dbFile, { driver: config.dbDriver });
    if (seed) seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    server = createApp(config, { db, geo }).listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  } catch (err) {
    if (server) server.close();
    if (db) db.close();
    if (!existing) removeDir(dir);
    throw err;
  }
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const close = async ({ keepFiles = false } = {}) => {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    if (!keepFiles) removeDir(dir);
  };
  return { baseUrl, close, config, dir };
}

/* A "browser": the real frontend scripts with the real fetch, pointed at the server. Same storage = same browser. */
const browser = (baseUrl, storage = fakeStorage(), config = {}) =>
  loadFrontend({ config: { API_MODE: 'auto', API_BASE: baseUrl, PROBE_TIMEOUT_MS: 3000, ...config }, fetch: globalThis.fetch, localStorage: storage });
const sample = (over = {}) => ({ draft: { x: 500, y: 300, desc: 'Blocked drain near the school.', img: PHOTO, ...(over.draft || {}) }, analysis: { t: 'drain', lv: 'hi', ...(over.analysis || {}) } });

test('the server hands out the new frontend files, and auto mode recognizes the real server', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const html = await (await fetch(`${server.baseUrl}/`)).text();
  assert.match(html, /<script src="js\/config\.js"><\/script>/);
  assert.match(html, /<script src="js\/api-server\.js"><\/script>/);
  for (const file of ['js/config.js', 'js/api-server.js', 'js/api.js']) {
    const res = await fetch(`${server.baseUrl}/${file}`);
    assert.equal(res.status, 200, file);
    assert.equal(sha256(Buffer.from(await res.arrayBuffer())), sha256(fs.readFileSync(path.join(FRONTEND_DIR, file))), `${file} is served unchanged`);
  }
  const fe = browser(server.baseUrl);
  assert.equal(await fe.API.init(), 'server');
});

test('loading: the 12 sample reports come from the database in the format the UI expects', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const fe = browser(server.baseUrl);
  await fe.API.init();
  const list = plain(await fe.API.listReports());
  assert.equal(list.length, 12);
  assert.equal(list[0].id, 'RL-034');
  assert.equal(list[11].id, 'RL-023');
  assert.ok(list.every((r) => r.mine === false && r.img === null && r.brgy === 'Brgy. Alangilan'));
  const flood = list.find((r) => r.id === 'RL-023');
  assert.deepEqual([flood.type, flood.x, flood.y, flood.st, flood.lv], ['flood', 355, 81, 'Verified', 'hi'], 'same type and SVG map coordinates as js/seed-data.js');
});

test('sending: reports with and without a photo are saved, and the photo is the same file', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const fe = browser(server.baseUrl);
  await fe.API.init();

  const withPhoto = plain(await fe.API.submitReport(sample().draft, sample().analysis));
  assert.equal(withPhoto.id, 'RL-035');
  assert.equal(withPhoto.st, 'Pending');
  assert.equal(withPhoto.mine, true);
  assert.match(withPhoto.img, new RegExp(`^${server.baseUrl}/uploads/[0-9a-f-]{36}\\.jpg$`));
  const photo = await fetch(withPhoto.img);
  assert.equal(photo.status, 200);
  assert.equal(sha256(Buffer.from(await photo.arrayBuffer())), sha256(images.buffer('jpeg')), 'the stored photo is the one that was sent');

  const noPhoto = plain(await fe.API.submitReport({ x: 545, y: 373, desc: '', img: null }, { t: 'tree', lv: 'mod' }));
  assert.equal(noPhoto.id, 'RL-036');
  assert.equal(noPhoto.img, null);
  assert.equal(noPhoto.desc, 'No description provided.');
  assert.deepEqual([noPhoto.x, noPhoto.y], [545, 373], 'x and y come back as the SVG map coordinates that were sent');
});

test('"my reports" returns only reports sent from this browser; everyone sees all reports on the map', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const storage = fakeStorage();
  const mine = browser(server.baseUrl, storage);
  await mine.API.init();
  await mine.API.submitReport(sample().draft, sample().analysis);
  await mine.API.submitReport({ x: 545, y: 373, desc: 'Second', img: null }, { t: 'tree', lv: 'mod' });

  assert.deepEqual(plain(await mine.API.listMyReports()).map((r) => r.id), ['RL-036', 'RL-035']);
  const all = plain(await mine.API.listReports());
  assert.equal(all.length, 14);
  assert.deepEqual(all.filter((r) => r.mine).map((r) => r.id), ['RL-036', 'RL-035']);

  const stranger = browser(server.baseUrl); // a different browser: new storage, new client id
  await stranger.API.init();
  assert.notEqual(stranger.ServerAPI.clientId(), mine.ServerAPI.clientId());
  assert.deepEqual(plain(await stranger.API.listMyReports()), [], 'a stranger has no reports of their own');
  const strangerAll = plain(await stranger.API.listReports());
  assert.equal(strangerAll.length, 14, 'but the public map shows everything');
  assert.ok(strangerAll.every((r) => r.mine === false));
});

test('persistence: after the server restarts, the same browser still has its reports and photos', async (t) => {
  const first = await startServer();
  const storage = fakeStorage();
  const fe = browser(first.baseUrl, storage);
  await fe.API.init();
  const saved = plain(await fe.API.submitReport(sample().draft, sample().analysis));
  const kept = { dir: first.dir, config: first.config };
  await first.close({ keepFiles: true });

  const second = await startServer({}, { seed: false, existing: kept });
  t.after(() => second.close());
  const again = browser(second.baseUrl, storage); // same storage = same browser = same client id
  await again.API.init();
  const mine = plain(await again.API.listMyReports());
  assert.deepEqual(mine.map((r) => r.id), [saved.id]);
  assert.equal(mine[0].desc, 'Blocked drain near the school.');
  const photo = await fetch(mine[0].img);
  assert.equal(sha256(Buffer.from(await photo.arrayBuffer())), sha256(images.buffer('jpeg')));
  assert.equal(plain(await again.API.listReports()).length, 13, 'no duplicates after restarting');
});

test('errors from the real server arrive as readable messages, and nothing is saved', async (t) => {
  const server = await startServer({ MAX_PHOTO_BYTES: '1024' });
  t.after(() => server.close());
  const fe = browser(server.baseUrl);
  await fe.API.init();

  await assert.rejects(() => fe.API.submitReport(sample({ draft: { x: 5, y: 5 } }).draft, sample().analysis), (err) => {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'VALIDATION');
    assert.match(err.userMessage, /Location: That spot is outside Brgy\. Alangilan\./);
    return true;
  });
  await assert.rejects(() => fe.API.submitReport(sample().draft, sample({ analysis: { t: 'bridge' } }).analysis), (err) => /Hazard type:/.test(err.userMessage));
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7), Buffer.from([0xff, 0xd9])]);
  await assert.rejects(() => fe.API.submitReport(sample({ draft: { img: images.dataUrlFromBuffer(big, 'image/jpeg') } }).draft, sample().analysis), (err) => /Photo: The photo is too large/.test(err.userMessage));
  await assert.rejects(() => fe.API.submitReport(sample({ draft: { img: 'data:image/jpeg;base64,AAAA' } }).draft, sample().analysis), (err) => /Photo:/.test(err.userMessage));

  assert.equal(plain(await fe.API.listReports()).length, 12, 'every failed attempt left the database unchanged');
  assert.equal(fs.existsSync(server.config.uploadsDir) ? fs.readdirSync(server.config.uploadsDir).length : 0, 0, 'and no stray photo files');
});

test('when the server is not running: auto mode uses demo data, forced server mode shows a clear error', async (t) => {
  const server = await startServer();
  const baseUrl = server.baseUrl;
  await server.close();

  const auto = browser(baseUrl, fakeStorage(), { PROBE_TIMEOUT_MS: 1000 });
  assert.equal(await auto.API.init(), 'demo', 'a missing server never breaks the demo');

  const forced = browser(baseUrl, fakeStorage(), { API_MODE: 'server' });
  await forced.API.init();
  await assert.rejects(() => forced.API.listReports(), (err) => /Can't reach the READYLINK server/.test(err.userMessage));
  await assert.rejects(() => forced.API.submitReport(sample().draft, sample().analysis), (err) => /Can't reach the READYLINK server/.test(err.userMessage));
  t.after(() => {});
});

test('offline queue: a report saved offline is really sent when synced, then leaves the queue', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const fe = browser(server.baseUrl);
  await fe.API.init();
  const queued = plain(await fe.API.submitReport(sample().draft, sample().analysis, { offline: true }));
  assert.match(queued.id, /^LOCAL-/);
  assert.equal(plain(await fe.API.listReports()).length, 12, 'nothing reached the server yet');

  const saved = plain(await fe.API.syncReport(queued.id));
  assert.equal(saved.id, 'RL-035');
  assert.equal(plain(await fe.API.listPending()).length, 0);
  const mine = plain(await fe.API.listMyReports());
  assert.deepEqual(mine.map((r) => r.id), ['RL-035']);
  assert.equal(sha256(Buffer.from(await (await fetch(mine[0].img)).arrayBuffer())), sha256(images.buffer('jpeg')), 'the queued photo arrived intact');
});

test('admin changes are not connected: the frontend refuses and the server data stays as it was', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const fe = browser(server.baseUrl);
  await fe.API.init();
  await assert.rejects(() => fe.API.updateReport('RL-023', { status: 'Resolved' }), (err) => /Phase 3/.test(err.userMessage));
  const report = (await (await fetch(`${server.baseUrl}/api/reports/RL-023`)).json()).report;
  assert.equal(report.st, 'Verified');
});
