'use strict';
/* Phase 1 integration tests: the reports API over real HTTP.
   Each test group starts the real Express app on a random local port, with a temporary database and
   a temporary uploads folder. Nothing in your real server/data or server/uploads folders is touched.
   Needs the dependencies installed first:   cd server   then   npm.cmd install   */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

try {
  require('express');
} catch (err) {
  throw new Error('Express is not installed. Open a terminal in the "server" folder and run:  npm.cmd install');
}

const { createApp } = require('../../src/app');
const { openDatabase } = require('../../src/db');
const { seedSamples } = require('../../src/services/seedService');
const images = require('../helpers/images');
const { geo, FRONTEND_DIR, CLIENT_A, CLIENT_B, testConfig, removeDir } = require('../helpers/env');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* Starts the app on a random port. Returns helpers and a close() function. */
async function startApp(env = {}, { seed = true, existing } = {}) {
  const { dir, config } = existing || testConfig(env);
  let db;
  let server;
  let port;
  try {
    db = openDatabase(config.dbFile, { driver: config.dbDriver });
    if (seed) seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    server = createApp(config, { db, geo }).listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    port = server.address().port;
  } catch (err) {
    // Start-up failed halfway: release the database and the folder so the real error is not hidden by a cleanup error.
    if (server) server.close();
    if (db) db.close();
    if (!existing) removeDir(dir);
    throw err;
  }

  /* Sends exactly what we give it (fetch() would "clean up" odd paths and headers). */
  const request = (method, rawPath, { headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const h = { ...headers };
      if (payload) h['content-length'] = payload.length;
      const req = http.request({ host: '127.0.0.1', port, method, path: rawPath, headers: h, agent: false }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const bytes = Buffer.concat(chunks);
          let json;
          if (/application\/json/.test(res.headers['content-type'] || '')) json = JSON.parse(bytes.toString());
          resolve({ status: res.statusCode, headers: res.headers, bytes, text: bytes.toString(), json });
        });
      });
      req.on('error', reject);
      req.end(payload);
    });

  const post = (body, headers = {}) => request('POST', '/api/reports', { headers: { 'content-type': 'application/json', 'x-client-id': CLIENT_A, ...headers }, body });
  const close = async ({ keepFiles = false } = {}) => {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    if (!keepFiles) removeDir(dir);
  };
  return { request, post, close, config, db, dir, port };
}

const report = (extra = {}) => ({ type: 'drain', x: 500, y: 300, desc: 'Blocked drain near the school.', level: 'hi', ...extra });

test('health shows the database driver', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const r = await app.request('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.database.ok, true);
  assert.match(r.json.database.driver, /^(better-sqlite3|node-sqlite)$/);
  console.log(`# database driver used by these tests: ${r.json.database.driver}`);
});

test('GET /api/reports returns the 12 seeded sample reports, newest first, in the frontend format', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const r = await app.request('GET', '/api/reports');
  assert.equal(r.status, 200);
  assert.match(r.headers['cache-control'], /no-store/);
  assert.equal(r.json.reports.length, 12);
  assert.equal(r.json.reports[0].id, 'RL-034');
  assert.equal(r.json.reports[11].id, 'RL-023');
  for (const rep of r.json.reports) {
    assert.deepEqual(Object.keys(rep).sort(), ['ai', 'brgy', 'createdAt', 'date', 'desc', 'id', 'img', 'lat', 'lng', 'log', 'lv', 'mine', 'st', 'type', 'x', 'y']);
    assert.match(rep.id, /^RL-\d{3}$/);
    assert.ok(['tree', 'drain', 'road', 'pole', 'flood', 'slope', 'river', 'wall'].includes(rep.type));
    assert.ok(['hi', 'mod', 'lo'].includes(rep.lv));
    assert.ok(['Pending', 'Verified', 'Under monitoring', 'Resolved'].includes(rep.st));
    assert.equal(typeof rep.x, 'number');
    assert.equal(typeof rep.y, 'number');
    assert.equal(rep.mine, false);
  }
  assert.doesNotMatch(r.text, /client_id|photo_file|public_id|is_sample/);
});

test('GET /api/reports/:id returns one report with the same map coordinates as the frontend sample', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const r = await app.request('GET', '/api/reports/RL-023');
  assert.equal(r.status, 200);
  assert.equal(r.json.report.id, 'RL-023');
  assert.equal(r.json.report.type, 'flood');
  assert.equal(r.json.report.x, 355);
  assert.equal(r.json.report.y, 81);
  assert.equal(r.json.report.st, 'Verified');
});

test('missing and malformed ids return 404 JSON (and no SQL ever sees them)', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  for (const id of ['RL-404', "RL-001'%20OR%20'1'='1", 'abc', '%2e%2e', 'RL-023%00', 'rl-023', 'RL-1']) {
    const r = await app.request('GET', `/api/reports/${id}`);
    assert.equal(r.status, 404, id);
    assert.equal(r.json.error.code, 'NOT_FOUND', id);
  }
  assert.equal((await app.request('GET', '/api/reports')).json.reports.length, 12, 'the table is untouched');
});

test('POST creates a report: 201, Location, readable again, counted in the list', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const r = await app.post(report());
  assert.equal(r.status, 201);
  assert.equal(r.json.report.id, 'RL-035', 'ids continue after the sample reports');
  assert.equal(r.headers.location, '/api/reports/RL-035');
  assert.equal(r.json.report.st, 'Pending');
  assert.equal(r.json.report.mine, true);
  assert.equal(r.json.report.x, 500);
  assert.equal(r.json.report.y, 300);
  assert.deepEqual(r.json.report.log.map((e) => e.t), ['Report submitted', 'AI-assisted assessment generated (demo)']);

  const again = await app.request('GET', '/api/reports/RL-035');
  assert.equal(again.json.report.desc, 'Blocked drain near the school.');
  assert.equal(again.json.report.mine, false, 'not mine without the client id header');
  const mine = await app.request('GET', '/api/reports/RL-035', { headers: { 'x-client-id': CLIENT_A } });
  assert.equal(mine.json.report.mine, true);
  assert.equal((await app.request('GET', '/api/reports')).json.reports.length, 13);
});

test('POST accepts every one of the 8 hazard types', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  for (const type of ['tree', 'drain', 'road', 'pole', 'flood', 'slope', 'river', 'wall']) {
    assert.equal((await app.post(report({ type }))).status, 201, type);
  }
});

test('POST ignores an id, status or owner chosen by the client', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const r = await app.post(report({ id: 'RL-001', status: 'Resolved', st: 'Resolved', mine: false, client_id: CLIENT_B }));
  assert.equal(r.status, 201);
  assert.equal(r.json.report.id, 'RL-035');
  assert.equal(r.json.report.st, 'Pending');
  assert.equal(r.json.report.mine, true);
});

test('POST validation errors: 400 with one message per field, and nothing is saved', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const r = await app.post({ type: 'bridge', x: 5, y: 5, desc: 'x'.repeat(300), level: 'urgent', photo: 'nope' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION');
  assert.deepEqual(Object.keys(r.json.error.fields).sort(), ['desc', 'level', 'location', 'photo', 'type']);
  assert.equal((await app.request('GET', '/api/reports')).json.reports.length, 12);
});

test('POST: coordinates must be map units inside Brgy. Alangilan', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  for (const [x, y, message] of [[5, 5, /outside Brgy\. Alangilan/], [-5, 300, /outside the map/], [500, 700, /outside the map/], ['500', 300, /must be numbers/], [13.78, 121.06, /outside Brgy\. Alangilan/]]) {
    const r = await app.post(report({ x, y }));
    assert.equal(r.status, 400, `${x},${y}`);
    assert.match(r.json.error.fields.location, message, `${x},${y}`);
  }
});

test('POST: bad or missing JSON, wrong content type, missing or bad client id', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const json = { 'content-type': 'application/json', 'x-client-id': CLIENT_A };

  let r = await app.request('POST', '/api/reports', { headers: json, body: '{"type": "tree", ' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'INVALID_JSON');
  assert.doesNotMatch(r.text, /Unexpected|position/);

  r = await app.request('POST', '/api/reports', { headers: json, body: '[1,2,3]' });
  assert.equal(r.status, 400);

  r = await app.request('POST', '/api/reports', { headers: { 'content-type': 'text/plain', 'x-client-id': CLIENT_A }, body: JSON.stringify(report()) });
  assert.equal(r.status, 415);
  r = await app.request('POST', '/api/reports', { headers: { 'x-client-id': CLIENT_A }, body: JSON.stringify(report()) });
  assert.equal(r.status, 415);

  r = await app.request('POST', '/api/reports', { headers: { 'content-type': 'application/json' }, body: report() });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'CLIENT_ID_REQUIRED');
  r = await app.request('POST', '/api/reports', { headers: { ...json, 'x-client-id': "x'; DROP TABLE reports;--" }, body: report() });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'INVALID_CLIENT_ID');

  assert.equal((await app.request('GET', '/api/reports')).json.reports.length, 12);
});

test('POST: a request body over the limit is refused with 413', async (t) => {
  const app = await startApp({ MAX_PHOTO_BYTES: '1024' }); // small limit keeps this test fast (the JSON limit is about 66 KB here)
  t.after(() => app.close());
  const huge = JSON.stringify(report({ desc: 'x'.repeat(app.config.jsonLimitBytes + 1000) }));
  const r = await app.request('POST', '/api/reports', { headers: { 'content-type': 'application/json', 'x-client-id': CLIENT_A }, body: huge });
  assert.equal(r.status, 413);
  assert.equal(r.json.error.code, 'PAYLOAD_TOO_LARGE');
});

test('POST with a photo: stored, served with safe headers, byte for byte the same', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  for (const [type, ext, mime] of [['jpeg', 'jpg', 'image/jpeg'], ['png', 'png', 'image/png'], ['webp', 'webp', 'image/webp']]) {
    const created = await app.post(report({ photo: images.dataUrl(type) }));
    assert.equal(created.status, 201, type);
    const url = created.json.report.img;
    assert.match(url, new RegExp(`^/uploads/[0-9a-f-]{36}\\.${ext}$`));

    const photo = await app.request('GET', url);
    assert.equal(photo.status, 200, type);
    assert.equal(photo.headers['content-type'], mime);
    assert.equal(photo.headers['x-content-type-options'], 'nosniff');
    assert.match(photo.headers['content-security-policy'], /default-src 'none'/);
    assert.equal(sha256(photo.bytes), sha256(images.buffer(type)), 'the served photo must be the uploaded one');

    assert.equal((await app.request('GET', `/api/reports/${created.json.report.id}`)).json.report.img, url, 'the report keeps pointing to its photo');
  }
});

test('POST with a photo that is not a real image is refused and leaves no file behind', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const fakes = [
    images.dataUrlFromBuffer(Buffer.from('<script>alert(1)</script>'), 'image/jpeg'),
    images.dataUrl('png', 'jpeg'),
    `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`,
    `data:text/html;base64,${Buffer.from('<html></html>').toString('base64')}`,
    'data:image/jpeg;base64,@@@@',
  ];
  for (const photo of fakes) {
    const r = await app.post(report({ photo }));
    assert.equal(r.status, 400, photo.slice(0, 40));
    assert.ok(r.json.error.fields.photo, photo.slice(0, 40));
  }
  assert.equal(fs.existsSync(app.config.uploadsDir) ? fs.readdirSync(app.config.uploadsDir).length : 0, 0);
});

test('POST: a photo over MAX_PHOTO_BYTES is refused', async (t) => {
  const app = await startApp({ MAX_PHOTO_BYTES: '1024' });
  t.after(() => app.close());
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9])]);
  const r = await app.post(report({ photo: images.dataUrlFromBuffer(big, 'image/jpeg') }));
  assert.equal(r.status, 400);
  assert.match(r.json.error.fields.photo, /too large/);
  assert.equal((await app.post(report({ photo: images.dataUrl('jpeg') }))).status, 201, 'a small photo still works');
});

test('?mine=1 returns only the reports of the device that sent the header', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  await app.post(report());
  await app.post(report({ type: 'tree' }), { 'x-client-id': CLIENT_B });
  await app.post(report({ type: 'pole' }));
  const own = await app.request('GET', '/api/reports?mine=1', { headers: { 'x-client-id': CLIENT_A } });
  assert.deepEqual(own.json.reports.map((r) => r.id), ['RL-037', 'RL-035']);
  assert.ok(own.json.reports.every((r) => r.mine));
  const other = await app.request('GET', '/api/reports?mine=1', { headers: { 'x-client-id': CLIENT_B } });
  assert.deepEqual(other.json.reports.map((r) => r.id), ['RL-036']);
  assert.equal((await app.request('GET', '/api/reports?mine=1')).status, 400);
  const all = await app.request('GET', '/api/reports', { headers: { 'x-client-id': CLIENT_A } });
  assert.equal(all.json.reports.length, 15, 'the public map still lists everyone');
  assert.equal(all.json.reports.filter((r) => r.mine).length, 2);
});

test('only GET and POST exist for reports in Phase 1 (no edit or delete)', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  for (const [method, p] of [['DELETE', '/api/reports/RL-023'], ['PUT', '/api/reports/RL-023'], ['PATCH', '/api/reports/RL-023'], ['POST', '/api/reports/RL-023'], ['DELETE', '/api/reports']]) {
    const r = await app.request(method, p, { headers: { 'content-type': 'application/json', 'x-client-id': CLIENT_A }, body: '{}' });
    assert.equal(r.status, 404, `${method} ${p}`);
  }
  assert.equal((await app.request('GET', '/api/reports/RL-023')).json.report.st, 'Verified', 'nothing was changed');
});

test('ten reports sent at the same time all get different ids', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => app.post(report({ desc: `parallel ${i}` }))));
  assert.ok(results.every((r) => r.status === 201));
  const ids = results.map((r) => r.json.report.id);
  assert.equal(new Set(ids).size, 10);
  assert.equal(Math.min(...ids.map((id) => Number(id.slice(3)))), 35);
  assert.equal(Math.max(...ids.map((id) => Number(id.slice(3)))), 44);
});

test('SQL and HTML in the description are stored as plain text', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const text = `Robert'); DROP TABLE reports;-- <img src=x onerror=alert(1)>`;
  const r = await app.post(report({ desc: text }));
  assert.equal(r.status, 201);
  assert.equal(r.json.report.desc, text);
  assert.equal((await app.request('GET', '/api/reports')).json.reports.length, 13);
});

test('reports and photos are still there after the server is stopped and started again', async (t) => {
  const first = await startApp();
  const created = await first.post(report({ desc: 'survives a restart', photo: images.dataUrl('png') }));
  assert.equal(created.status, 201);
  const url = created.json.report.img;
  const kept = { dir: first.dir, config: first.config };
  await first.close({ keepFiles: true });

  const second = await startApp({}, { seed: false, existing: kept });
  t.after(() => second.close());
  const r = await second.request('GET', '/api/reports/RL-035');
  assert.equal(r.status, 200);
  assert.equal(r.json.report.desc, 'survives a restart');
  assert.equal(r.json.report.img, url);
  assert.equal(sha256((await second.request('GET', url)).bytes), sha256(images.buffer('png')));
  assert.equal((await second.request('GET', '/api/reports')).json.reports.length, 13, 'no duplicates after restarting');
  assert.equal((await second.post(report())).json.report.id, 'RL-036', 'numbering continues');
});

test('uploads: only server-generated names are served; no listing, no guessing, no path tricks', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const created = await app.post(report({ photo: images.dataUrl('jpeg') }));
  const name = path.basename(created.json.report.img);
  fs.writeFileSync(path.join(app.config.uploadsDir, 'secret.txt'), 'top secret');

  for (const p of ['/uploads', '/uploads/', '/uploads/secret.txt', '/uploads/photo.jpg', `/uploads/${name}x`, `/uploads/${name.replace('.jpg', '.php')}`,
    `/uploads/${name.toUpperCase()}`, '/uploads/..%2fsecret.txt', '/uploads/%2e%2e/secret.txt', '/uploads/../secret.txt', `/uploads/sub/${name}`, '/uploads/.env']) {
    const r = await app.request('GET', p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!r.text.includes('top secret'), `${p} leaked a file`);
  }
  assert.equal((await app.request('GET', `/uploads/${name}`)).status, 200, 'the real photo is still served');
  assert.equal((await app.request('POST', `/uploads/${name}`)).status, 404);
});

test('private files and server code are NOT exposed', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const markers = ['CREATE TABLE', 'better-sqlite3', 'readylink-server', 'loadEnvFileIfPresent', 'SQLite format', 'DB_FILE', 'ref: refs/heads'];
  const paths = [
    '/server/src/db.js', '/server/src/app.js', '/server/src/schema.sql', '/server/src/services/reportService.js', '/server/src/routes/uploads.js',
    '/server/package.json', '/server/.env', '/server/.env.example', '/server/README.md', '/server/tests/unit/db.test.js',
    '/server/data/readylink.db', '/server/data/readylink.db-wal', '/server/data/.gitkeep', '/server/uploads/.gitkeep',
    '/data/../server/src/db.js', '/js/../server/src/db.js', '/js/..%2fserver%2fsrc%2fdb.js', '/css/%2e%2e/server/.env',
    '/.env', '/.gitignore', '/.git/config', '/.git/HEAD', '/package.json', '/README.md',
    '/api/../server/src/db.js', '/uploads/../server/src/db.js',
  ];
  for (const p of paths) {
    const r = await app.request('GET', p);
    assert.notEqual(r.status, 200, p);
    for (const m of markers) assert.ok(!r.text.includes(m), `${p} leaked "${m}"`);
  }
  // the temporary test database file itself is also unreachable
  const dbName = path.basename(app.config.dbFile);
  for (const p of [`/${dbName}`, `/data/${dbName}`, `/server/data/${dbName}`]) assert.notEqual((await app.request('GET', p)).status, 200, p);
});

test('the existing frontend is still served byte for byte, with the database enabled', async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const files = ['/', '/index.html', '/js/api.js', '/js/pages-public.js', '/css/styles.css', '/data/alangilan.geojson'];
  for (const p of files) {
    const disk = fs.readFileSync(path.join(FRONTEND_DIR, p === '/' || p === '/index.html' ? 'index.html' : p));
    const r = await app.request('GET', p);
    assert.equal(r.status, 200, p);
    assert.equal(sha256(r.bytes), sha256(disk), p);
  }
});
