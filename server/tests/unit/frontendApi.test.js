'use strict';
/* Tests for the Phase 2 frontend integration.
   They run the REAL frontend files (js/config.js, js/api-server.js, js/api.js and the data files) inside an isolated
   sandbox, with a fake fetch and fake localStorage. No server and no browser are needed.
   They prove what the frontend SENDS, how it reads answers and errors, and that demo mode is unchanged.
   Whether the real Express server accepts those requests is checked in tests/integration/frontendApi.test.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFrontend, fakeStorage, fakeFetch, reply, hang, plain } = require('../helpers/frontend');
const { FRONTEND_DIR } = require('../helpers/env');
const images = require('../helpers/images');

const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const CLIENT_KEY = 'readylink-client-id';
const PHOTO = images.dataUrl('jpeg');

const serverReport = (over = {}) => ({
  id: 'RL-035', type: 'drain', x: 500, y: 300, lat: 13.78, lng: 121.06, ai: 'hi', lv: 'hi', st: 'Pending', date: 'Oct 12',
  createdAt: '2026-10-12T05:00:00.000Z', desc: 'Blocked drain.', brgy: 'Brgy. Alangilan', mine: true, img: null,
  log: [{ t: 'Report submitted', d: 'Oct 12, 1:00 PM', at: '2026-10-12T05:00:00.000Z' }], ...over,
});
const healthy = () => reply(200, { ok: true, service: 'readylink-api', time: '2026-10-12T05:00:00.000Z' });
const draft = (over = {}) => ({ x: 500, y: 300, desc: 'Blocked drain.', img: PHOTO, ...over });
const analysis = (over = {}) => ({ t: 'drain', lv: 'hi', ...over });

/* A frontend in server mode with the given fetch handler. */
const serverFrontend = (handler, extra = {}) => {
  const fetch = fakeFetch(handler);
  const fe = loadFrontend({ config: { API_MODE: 'server', ...(extra.config || {}) }, fetch, localStorage: extra.localStorage });
  return fe.API.init().then(() => fe);
};

/* ============================ files and wiring ============================ */

test('index.html loads config.js and api-server.js before api.js, and every script file exists', () => {
  const html = fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.indexOf('js/config.js') !== -1 && srcs.indexOf('js/api-server.js') !== -1, 'new scripts are listed');
  assert.ok(srcs.indexOf('js/config.js') < srcs.indexOf('js/api.js'), 'config.js before api.js');
  assert.ok(srcs.indexOf('js/api-server.js') < srcs.indexOf('js/api.js'), 'api-server.js before api.js');
  for (const src of srcs) assert.ok(fs.existsSync(path.join(FRONTEND_DIR, src)), `${src} exists`);
});

test('no secrets or credentials are present in any frontend file', () => {
  const patterns = [/sk-[A-Za-z0-9]{20,}/, /Bearer\s+[A-Za-z0-9._-]{20,}/, /BEGIN [A-Z ]*PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /api[_-]?key\s*[:=]\s*['"][^'"]{8,}/i, /password\s*[:=]\s*['"][^'"]{4,}['"]/i];
  const files = ['index.html', ...fs.readdirSync(path.join(FRONTEND_DIR, 'js')).map((f) => `js/${f}`), ...fs.readdirSync(path.join(FRONTEND_DIR, 'css')).map((f) => `css/${f}`)];
  for (const file of files) {
    const text = fs.readFileSync(path.join(FRONTEND_DIR, file), 'utf8');
    for (const p of patterns) {
      // the demo login form pre-fills a fake password on purpose ("demo-password"); it is not a credential
      assert.ok(!p.test(text.replace(/demo-password/g, '')), `${file} looks like it contains a secret (${p})`);
    }
  }
});

test('the server client never touches the demo storage keys, and demo code never sends the client id', () => {
  const server = fs.readFileSync(path.join(FRONTEND_DIR, 'js', 'api-server.js'), 'utf8');
  assert.doesNotMatch(server, /readylink-demo/);
  assert.match(server, /X-Client-Id/);
});

/* ============================ settings (js/config.js) ============================ */

test('config.js sets safe defaults: auto-detect, same origin', () => {
  const fe = loadFrontend({ fetch: fakeFetch(() => reply(404, '')) });
  assert.deepEqual(plain(fe.run('window.READYLINK_CONFIG')), { API_MODE: 'auto', API_BASE: '', PROBE_TIMEOUT_MS: 2000, REQUEST_TIMEOUT_MS: 20000 });
});

test('config.js keeps values that were already set (tests and special setups)', () => {
  const fe = loadFrontend({ config: { API_MODE: 'demo', API_BASE: 'http://localhost:9999' }, fetch: fakeFetch(() => reply(404, '')) });
  const cfg = plain(fe.run('window.READYLINK_CONFIG'));
  assert.equal(cfg.API_MODE, 'demo');
  assert.equal(cfg.API_BASE, 'http://localhost:9999');
  assert.equal(cfg.PROBE_TIMEOUT_MS, 2000, 'missing values still get defaults');
});

/* ============================ mode selection (API.init) ============================ */

test('before init() the frontend is in demo mode', () => {
  const fe = loadFrontend({ fetch: fakeFetch(() => reply(404, '')) });
  assert.equal(fe.API.mode, 'demo');
});

test("API_MODE 'demo': demo mode and the network is never used", async () => {
  const fetch = fakeFetch(() => healthy());
  const fe = loadFrontend({ config: { API_MODE: 'demo' }, fetch });
  assert.equal(await fe.API.init(), 'demo');
  assert.equal(fetch.calls.length, 0);
});

test("API_MODE 'server': server mode without asking first", async () => {
  const fetch = fakeFetch(() => healthy());
  const fe = loadFrontend({ config: { API_MODE: 'server' }, fetch });
  assert.equal(await fe.API.init(), 'server');
  assert.equal(fetch.calls.length, 0);
});

test("API_MODE 'auto' + a READYLINK server answering /api/health: server mode", async () => {
  const fetch = fakeFetch(() => healthy());
  const fe = loadFrontend({ config: { API_MODE: 'auto' }, fetch });
  assert.equal(await fe.API.init(), 'server');
  assert.deepEqual(fetch.calls.map((c) => c.url), ['/api/health']);
});

test("API_MODE 'auto' falls back to demo when nothing (or something else) answers", async () => {
  const cases = {
    'a 404 page (GitHub Pages)': () => reply(404, '<html>Not found</html>'),
    'a 200 HTML page': () => reply(200, '<html>hello</html>'),
    'a server that is not READYLINK': () => reply(200, { ok: true, service: 'something-else' }),
    'a server that reports a problem': () => reply(503, { ok: false, service: 'readylink-api' }),
    'ok:false in the body': () => reply(200, { ok: false, service: 'readylink-api' }),
    'a network failure (file:// or no server)': () => { throw new TypeError('fetch failed'); },
  };
  for (const [name, handler] of Object.entries(cases)) {
    const fe = loadFrontend({ config: { API_MODE: 'auto' }, fetch: fakeFetch(handler) });
    assert.equal(await fe.API.init(), 'demo', name);
  }
});

test("API_MODE 'auto' gives up waiting after PROBE_TIMEOUT_MS and uses demo mode", async () => {
  const fe = loadFrontend({ config: { API_MODE: 'auto', PROBE_TIMEOUT_MS: 30 }, fetch: fakeFetch(hang) });
  const started = Date.now();
  assert.equal(await fe.API.init(), 'demo');
  assert.ok(Date.now() - started < 1000, 'must not wait for a server that never answers');
});

test('API_BASE is used for the health check and trailing slashes are ignored', async () => {
  const fetch = fakeFetch(() => healthy());
  const fe = loadFrontend({ config: { API_MODE: 'auto', API_BASE: 'http://localhost:3000///' }, fetch });
  assert.equal(await fe.API.init(), 'server');
  assert.equal(fetch.calls[0].url, 'http://localhost:3000/api/health');
});

test('an unknown API_MODE is treated as demo (never silently as server)', async () => {
  const fe = loadFrontend({ config: { API_MODE: 'banana' }, fetch: fakeFetch(() => healthy()) });
  assert.equal(await fe.API.init(), 'demo');
});

/* ============================ anonymous client id ============================ */

test('a valid client id is created once, kept in localStorage, and reused', () => {
  const storage = fakeStorage();
  const fe = loadFrontend({ fetch: fakeFetch(() => reply(404, '')), localStorage: storage });
  const id = fe.ServerAPI.clientId();
  assert.match(id, ID_PATTERN);
  assert.equal(fe.ServerAPI.clientId(), id);
  assert.equal(storage.data.get(CLIENT_KEY), id);
  const again = loadFrontend({ fetch: fakeFetch(() => reply(404, '')), localStorage: storage });
  assert.equal(again.ServerAPI.clientId(), id, 'a new page load in the same browser keeps the same id');
});

test('different browsers get different ids', () => {
  const a = loadFrontend({ fetch: fakeFetch(() => reply(404, '')) }).ServerAPI.clientId();
  const b = loadFrontend({ fetch: fakeFetch(() => reply(404, '')) }).ServerAPI.clientId();
  assert.notEqual(a, b);
});

test('a damaged saved id is replaced by a valid one', () => {
  const storage = fakeStorage();
  storage.setItem(CLIENT_KEY, 'short');
  const id = loadFrontend({ fetch: fakeFetch(() => reply(404, '')), localStorage: storage }).ServerAPI.clientId();
  assert.match(id, ID_PATTERN);
  assert.equal(storage.data.get(CLIENT_KEY), id);
});

test('when localStorage is blocked the app still gets a stable valid id for the session', () => {
  const fe = loadFrontend({ fetch: fakeFetch(() => reply(404, '')), localStorage: fakeStorage({ failing: true }) });
  const id = fe.ServerAPI.clientId();
  assert.match(id, ID_PATTERN);
  assert.equal(fe.ServerAPI.clientId(), id);
});

test('without crypto.randomUUID a valid id is still made', () => {
  for (const crypto of [{ getRandomValues: (a) => { a.fill(171); return a; } }, null]) {
    const fe = loadFrontend({ fetch: fakeFetch(() => reply(404, '')), crypto });
    assert.match(fe.ServerAPI.clientId(), ID_PATTERN);
  }
});

test('the client id has nothing to do with the demo data: "Reset demo data" does not change it', async () => {
  const storage = fakeStorage();
  const fe = loadFrontend({ config: { API_MODE: 'demo' }, fetch: fakeFetch(() => reply(404, '')), localStorage: storage });
  const id = fe.ServerAPI.clientId();
  await fe.API.listReports();
  await fe.API.resetDemo();
  assert.equal(storage.data.get(CLIENT_KEY), id);
});

/* ============================ loading reports (GET /api/reports) ============================ */

test('listReports in server mode: GET /api/reports with the client id, answers become UI reports', async () => {
  const body = { reports: [serverReport({ id: 'RL-036', mine: true }), serverReport({ id: 'RL-023', mine: false, type: 'flood', x: 355, y: 81, st: 'Verified' })] };
  const fe = await serverFrontend(() => reply(200, body));
  const list = plain(await fe.API.listReports());
  const call = fe.fetch.calls[0];
  assert.equal(call.method, 'GET');
  assert.equal(call.url, '/api/reports');
  assert.match(call.headers['X-Client-Id'], ID_PATTERN);
  assert.equal(call.headers['X-Client-Id'], fe.ServerAPI.clientId());
  assert.equal(call.body, undefined);
  assert.deepEqual(list.map((r) => r.id), ['RL-036', 'RL-023']);
  assert.deepEqual(list.map((r) => r.mine), [true, false]);
  // every field the UI reads is there, with the values the UI expects
  for (const key of ['id', 'type', 'x', 'y', 'ai', 'lv', 'st', 'date', 'desc', 'brgy', 'mine', 'img', 'log']) assert.ok(key in list[0], key);
  assert.equal(list[1].st, 'Verified');
  assert.equal(list[1].x, 355);
});

test('the photo URL is made absolute only when the API lives on another address', async () => {
  const body = { reports: [serverReport({ img: '/uploads/3281e664-afc8-4af8-bbda-a7784714bd5d.jpg' })] };
  let fe = await serverFrontend(() => reply(200, body));
  assert.equal(plain(await fe.API.listReports())[0].img, '/uploads/3281e664-afc8-4af8-bbda-a7784714bd5d.jpg');
  fe = await serverFrontend(() => reply(200, body), { config: { API_BASE: 'http://localhost:3000' } });
  assert.equal(plain(await fe.API.listReports())[0].img, 'http://localhost:3000/uploads/3281e664-afc8-4af8-bbda-a7784714bd5d.jpg');
  assert.equal(fe.fetch.calls[0].url, 'http://localhost:3000/api/reports');
});

test('an empty database gives an empty list, not an error', async () => {
  const fe = await serverFrontend(() => reply(200, { reports: [] }));
  assert.deepEqual(plain(await fe.API.listReports()), []);
});

test('listMyReports: GET /api/reports?mine=1 with the SAME client id', async () => {
  const fe = await serverFrontend(() => reply(200, { reports: [serverReport()] }));
  const mine = plain(await fe.API.listMyReports());
  await fe.API.listReports();
  const [mineCall, allCall] = fe.fetch.calls;
  assert.equal(mineCall.url, '/api/reports?mine=1');
  assert.equal(mineCall.headers['X-Client-Id'], allCall.headers['X-Client-Id']);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].mine, true);
});

test('loadMine and loadReports fill the lists the UI reads (MY and R)', async () => {
  const fe = await serverFrontend((call) => reply(200, { reports: call.url.includes('mine=1') ? [serverReport({ id: 'RL-040' })] : [serverReport({ id: 'RL-040' }), serverReport({ id: 'RL-023', mine: false })] }));
  await fe.run('loadReports()');
  await fe.run('loadMine()');
  assert.deepEqual(plain(fe.run('R')).map((r) => r.id), ['RL-040', 'RL-023']);
  assert.deepEqual(plain(fe.run('MY')).map((r) => r.id), ['RL-040']);
});

test('load errors become readable messages (ApiError.userMessage)', async () => {
  const cases = [
    ['server not reachable', () => { throw new TypeError('fetch failed'); }, /Can't reach the READYLINK server/],
    ['server error 500', () => reply(500, { error: { code: 'INTERNAL', message: 'x' } }), /server had a problem/],
    ['bad gateway page', () => reply(502, '<html>Bad gateway</html>'), /server had a problem/],
    ['answer that is not JSON', () => reply(200, 'oops'), /could not read/],
    ['JSON without a reports list', () => reply(200, { hello: 'world' }), /could not read/],
    ['too many requests', () => reply(429, { error: { code: 'RATE', message: 'slow down' } }), /Too many requests/],
  ];
  for (const [name, handler, expected] of cases) {
    const fe = await serverFrontend(handler);
    await assert.rejects(() => fe.API.listReports(), (err) => expected.test(err.userMessage) && !/<html|TypeError|fetch failed/.test(err.userMessage), name);
  }
});

test('a server that takes too long is given up on after REQUEST_TIMEOUT_MS', async () => {
  const fe = await serverFrontend(hang, { config: { REQUEST_TIMEOUT_MS: 30 } });
  await assert.rejects(() => fe.API.listReports(), (err) => /took too long/.test(err.userMessage));
});

/* ============================ sending a report (POST /api/reports) ============================ */

test('submitReport in server mode: POST /api/reports with the photo and the client id', async () => {
  const fe = await serverFrontend(() => reply(201, { report: serverReport({ img: '/uploads/3281e664-afc8-4af8-bbda-a7784714bd5d.jpg' }) }));
  const saved = plain(await fe.API.submitReport(draft(), analysis()));
  assert.equal(fe.fetch.calls.length, 1);
  const call = fe.fetch.calls[0];
  assert.equal(call.method, 'POST');
  assert.equal(call.url, '/api/reports');
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.match(call.headers['X-Client-Id'], ID_PATTERN);
  assert.deepEqual(JSON.parse(call.body), { type: 'drain', x: 500, y: 300, desc: 'Blocked drain.', level: 'hi', photo: PHOTO });
  assert.equal(JSON.parse(call.body).photo, PHOTO, 'the photo is sent exactly as the wizard holds it (a data URL)');
  assert.equal(saved.id, 'RL-035');
  assert.equal(saved.st, 'Pending');
  assert.equal(saved.img, '/uploads/3281e664-afc8-4af8-bbda-a7784714bd5d.jpg');
});

test('submitReport sends only what the server needs: no id, status, owner or private data', async () => {
  const fe = await serverFrontend(() => reply(201, { report: serverReport() }));
  await fe.API.submitReport({ ...draft(), id: 'RL-999', st: 'Resolved', mine: false, client_id: 'x' }, { ...analysis(), id: 'RL-999' });
  assert.deepEqual(Object.keys(JSON.parse(fe.fetch.calls[0].body)).sort(), ['desc', 'level', 'photo', 'type', 'x', 'y']);
});

test('a sample photo (no data URL) is sent without a photo field', async () => {
  const fe = await serverFrontend(() => reply(201, { report: serverReport() }));
  await fe.API.submitReport({ x: 500, y: 300, desc: '', img: null }, analysis({ t: 'tree', lv: 'mod' }));
  const body = JSON.parse(fe.fetch.calls[0].body);
  assert.deepEqual(body, { type: 'tree', x: 500, y: 300, desc: '', level: 'mod' });
});

test('submit errors: the server\'s field messages reach the user in plain words', async () => {
  const fe = await serverFrontend(() => reply(400, { error: { code: 'VALIDATION', message: 'Please check the report and try again.', fields: { location: 'That spot is outside Brgy. Alangilan.', photo: 'The photo is too large. The limit is 5 MB.' } } }));
  await assert.rejects(() => fe.API.submitReport(draft(), analysis()), (err) => {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'VALIDATION');
    assert.deepEqual(plain(err.fields), { location: 'That spot is outside Brgy. Alangilan.', photo: 'The photo is too large. The limit is 5 MB.' });
    assert.match(err.userMessage, /Location: That spot is outside Brgy\. Alangilan\./);
    assert.match(err.userMessage, /Photo: The photo is too large/);
    return true;
  });
});

test('submit errors: too large, server problem, not reachable', async () => {
  const cases = [
    [() => reply(413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } }), /too large to send/],
    [() => reply(500, { error: { code: 'INTERNAL', message: 'x' } }), /server had a problem/],
    [() => { throw new TypeError('fetch failed'); }, /Can't reach the READYLINK server/],
    [() => reply(400, { error: { code: 'CLIENT_ID_REQUIRED', message: 'Send your anonymous device id in the X-Client-Id header.' } }), /X-Client-Id/],
  ];
  for (const [handler, expected] of cases) {
    const fe = await serverFrontend(handler);
    await assert.rejects(() => fe.API.submitReport(draft(), analysis()), (err) => expected.test(err.userMessage));
  }
});

test('an answer without a report after a 201 is reported as unreadable (not as success)', async () => {
  const fe = await serverFrontend(() => reply(201, {}));
  await assert.rejects(() => fe.API.submitReport(draft(), analysis()), (err) => /could not read/.test(err.userMessage));
});

/* ============================ offline queue and sending later ============================ */

test('offline in server mode: the report goes to the device queue and nothing is sent', async () => {
  const fe = await serverFrontend(() => reply(201, { report: serverReport() }));
  const queued = plain(await fe.API.submitReport(draft(), analysis(), { offline: true }));
  assert.equal(fe.fetch.calls.length, 0);
  assert.match(queued.id, /^LOCAL-\d{3}$/);
  assert.equal(queued.sync, 'local');
  assert.equal(plain(await fe.API.listPending()).length, 1);
});

test('syncReport in server mode really sends the queued report, then removes it from the queue', async () => {
  const fe = await serverFrontend(() => reply(201, { report: serverReport({ id: 'RL-041' }) }));
  const queued = plain(await fe.API.submitReport(draft({ desc: 'Saved offline' }), analysis({ t: 'pole', lv: 'hi' }), { offline: true }));
  const saved = plain(await fe.API.syncReport(queued.id));
  assert.equal(saved.id, 'RL-041');
  assert.equal(fe.fetch.calls.length, 1);
  assert.deepEqual(JSON.parse(fe.fetch.calls[0].body), { type: 'pole', x: 500, y: 300, desc: 'Saved offline', level: 'hi', photo: PHOTO });
  assert.deepEqual(plain(await fe.API.listPending()), [], 'the queue is empty only after the server accepted it');
});

test('if sending a queued report fails, it stays in the queue (nothing is lost)', async () => {
  let calls = 0;
  const fe = await serverFrontend(() => (++calls === 1 ? reply(500, { error: { code: 'INTERNAL', message: 'x' } }) : reply(201, { report: serverReport({ id: 'RL-042' }) })));
  const queued = plain(await fe.API.submitReport(draft(), analysis(), { offline: true }));
  await assert.rejects(() => fe.API.syncReport(queued.id), (err) => /server had a problem/.test(err.userMessage));
  assert.equal(plain(await fe.API.listPending()).length, 1, 'still queued');
  assert.equal((await fe.API.syncReport(queued.id)).id, 'RL-042', 'a retry works');
  assert.equal(plain(await fe.API.listPending()).length, 0);
});

/* ============================ not connected yet: stays honest ============================ */

test('admin changes are NOT connected: updateReport refuses with a clear message and sends nothing', async () => {
  const fe = await serverFrontend(() => reply(200, {}));
  await assert.rejects(() => fe.API.updateReport('RL-023', { status: 'Verified' }), (err) => /Phase 3/.test(err.userMessage));
  assert.equal(fe.fetch.calls.length, 0);
});

test('AI analysis, priority list and sign-in stay demo in server mode and never use the network', async () => {
  const fe = await serverFrontend(() => reply(200, {}));
  const result = plain(await fe.API.analyzeReport({ type: 'drain', desc: '' }));
  assert.equal(result.t, 'drain');
  assert.equal(result.demo, true);
  const priority = plain(await fe.API.getPriorityQueue());
  assert.ok(priority.length >= 1 && priority.every((p) => p.demo === true));
  assert.equal((await fe.API.signIn('a@b.c', 'x')).ok, true);
  assert.equal(fe.fetch.calls.length, 0);
});

test('resetDemo in server mode never contacts or changes the server', async () => {
  const fe = await serverFrontend(() => reply(200, {}));
  await fe.API.submitReport(draft(), analysis(), { offline: true });
  await fe.API.resetDemo();
  assert.equal(fe.fetch.calls.length, 0);
  assert.deepEqual(plain(await fe.API.listPending()), []);
});

/* ============================ demo mode is unchanged ============================ */

const demoFrontend = (storage = fakeStorage()) => {
  const fe = loadFrontend({ config: { API_MODE: 'demo' }, fetch: fakeFetch(() => { throw new Error('demo mode must not use the network'); }), localStorage: storage });
  return fe.API.init().then(() => fe);
};

test('demo mode: the 12 sample reports are listed exactly as before, with no network use', async () => {
  const fe = await demoFrontend();
  const list = plain(await fe.API.listReports());
  assert.equal(list.length, 12);
  assert.deepEqual(list.map((r) => r.id), ['RL-023', 'RL-024', 'RL-025', 'RL-026', 'RL-027', 'RL-028', 'RL-029', 'RL-030', 'RL-031', 'RL-032', 'RL-033', 'RL-034']);
  assert.equal(fe.fetch.calls.length, 0);
  const byId = Object.fromEntries(list.map((r) => [r.id, r]));
  assert.equal(byId['RL-023'].x, 355);
  assert.equal(byId['RL-023'].y, 81);
  assert.equal(byId['RL-029'].type, 'river');
  assert.equal(byId['RL-026'].st, 'Pending');
});

test('demo mode: "my reports" are the three sample reports marked as mine', async () => {
  const fe = await demoFrontend();
  assert.deepEqual(plain(await fe.API.listMyReports()).map((r) => r.id), ['RL-027', 'RL-031', 'RL-033']);
});

test('demo mode: submitting saves in this browser (RL-035), and it is still there after "reloading"', async () => {
  const storage = fakeStorage();
  let fe = await demoFrontend(storage);
  const saved = plain(await fe.API.submitReport({ x: 500, y: 300, desc: 'Demo report', img: null }, { t: 'drain', lv: 'mod' }));
  assert.equal(saved.id, 'RL-035');
  assert.equal(saved.mine, true);
  fe = await demoFrontend(storage);
  const list = plain(await fe.API.listReports());
  assert.equal(list.length, 13);
  assert.equal(list[0].id, 'RL-035');
  assert.ok(plain(await fe.API.listMyReports()).some((r) => r.id === 'RL-035'));
});

test('demo mode: admin status changes still work', async () => {
  const fe = await demoFrontend();
  const updated = plain(await fe.API.updateReport('RL-026', { status: 'Verified' }));
  assert.equal(updated.st, 'Verified');
});

test('demo mode: the offline queue still moves a report into the demo store when synced', async () => {
  const fe = await demoFrontend();
  const queued = plain(await fe.API.submitReport({ x: 500, y: 300, desc: 'Queued', img: null }, { t: 'tree', lv: 'mod' }, { offline: true }));
  assert.match(queued.id, /^LOCAL-/);
  const synced = plain(await fe.API.syncReport(queued.id));
  assert.equal(synced.id, 'RL-035');
  assert.equal(plain(await fe.API.listPending()).length, 0);
});
