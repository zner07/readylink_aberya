'use strict';
/* Phase 0 integration tests. These start the REAL Express app on a random local port.
   They need the dependencies installed first:   cd server   then   npm install   */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

try {
  require('express');
} catch (err) {
  throw new Error('Express is not installed. Open a terminal in the "server" folder and run:  npm install');
}

const { loadConfig } = require('../../src/config');
const { createApp } = require('../../src/app');

const config = loadConfig({ PORT: '0', NODE_ENV: 'test' });
let server;
let port;

before(async () => {
  server = createApp(config).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});

after(
  () =>
    new Promise((resolve) => {
      if (server.closeAllConnections) server.closeAllConnections();
      server.close(resolve);
    })
);

/* Sends the path EXACTLY as written. fetch() would quietly "clean up" things like /css/%2e%2e/ before sending. */
function raw(method, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: rawPath, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const listFiles = (dir) => fs.readdirSync(path.join(config.frontendDir, dir)).filter((f) => !f.startsWith('.'));

test('the server listens on this computer only (127.0.0.1)', () => {
  assert.equal(server.address().address, '127.0.0.1');
});

test('GET /api/health answers with JSON', async () => {
  const r = await raw('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /application\/json/);
  const body = JSON.parse(r.body.toString());
  assert.equal(body.ok, true);
  assert.equal(body.service, 'readylink-api');
  assert.ok(!Number.isNaN(Date.parse(body.time)));
});

test('safe default headers are set and the Express banner is hidden', async () => {
  const r = await raw('GET', '/api/health');
  assert.equal(r.headers['x-powered-by'], undefined);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.equal(r.headers['x-frame-options'], 'DENY');
});

test('unknown API routes return the standard JSON error', async () => {
  for (const [method, p] of [['GET', '/api/nope'], ['POST', '/api/health'], ['DELETE', '/api/health'], ['GET', '/api/admin']]) {
    const r = await raw(method, p);
    assert.equal(r.status, 404, `${method} ${p}`);
    assert.match(r.headers['content-type'], /application\/json/);
    assert.equal(JSON.parse(r.body.toString()).error.code, 'NOT_FOUND');
  }
});

test('"/" and "/index.html" serve the existing frontend page, byte for byte', async () => {
  const disk = fs.readFileSync(path.join(config.frontendDir, 'index.html'));
  for (const p of ['/', '/index.html']) {
    const r = await raw('GET', p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.equal(sha256(r.body), sha256(disk), p);
  }
  assert.match(disk.toString(), /<title>READYLINK<\/title>/);
});

test('HEAD / works', async () => {
  const r = await raw('HEAD', '/');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 0);
});

test('every existing css, js and data file is served byte for byte', async () => {
  let checked = 0;
  for (const dir of ['css', 'js', 'data']) {
    const files = listFiles(dir);
    assert.ok(files.length > 0, `${dir}/ should contain files`);
    for (const name of files) {
      const r = await raw('GET', `/${dir}/${name}`);
      assert.equal(r.status, 200, `/${dir}/${name}`);
      assert.equal(sha256(r.body), sha256(fs.readFileSync(path.join(config.frontendDir, dir, name))), `/${dir}/${name}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 18, `expected at least 18 frontend files, checked ${checked}`);
});

test('correct content types for css and js', async () => {
  assert.match((await raw('GET', '/css/styles.css')).headers['content-type'], /text\/css/);
  assert.match((await raw('GET', '/js/api.js')).headers['content-type'], /javascript/);
});

test('server code, secrets and project files are NOT served', async () => {
  const markers = ['readylink-server', 'READYLINK server settings', 'ref: refs/heads', 'READYLINK (frontend prototype)', 'loadEnvFileIfPresent'];
  const paths = [
    '/server/package.json', '/server/src/app.js', '/server/src/config.js', '/server/.env', '/server/.env.example',
    '/.env', '/.git/config', '/.git/HEAD', '/.gitignore', '/README.md', '/server/README.md',
    '/node_modules/express/package.json', '/package.json',
  ];
  for (const p of paths) {
    const r = await raw('GET', p);
    assert.notEqual(r.status, 200, p);
    const text = r.body.toString();
    for (const m of markers) assert.ok(!text.includes(m), `${p} leaked "${m}"`);
  }
});

test('path traversal attempts are refused', async () => {
  const tricks = [
    '/css/../server/package.json',
    '/js/../../etc/passwd',
    '/css/%2e%2e/server/package.json',
    '/css/%2E%2E/server/package.json',
    '/js/..%2fserver%2fpackage.json',
    '/js/%2e%2e%2fserver%2fpackage.json',
    '/css\\..\\server\\package.json',
    '/js/..%5cserver%5cpackage.json',
    '/js/api.js%00.png',
    '/js//api.js',
    '/data/%2e%2e/%2e%2e/server/.env',
  ];
  for (const p of tricks) {
    const r = await raw('GET', p);
    assert.ok([400, 403, 404].includes(r.status), `${p} returned ${r.status}`);
    assert.ok(!r.body.toString().includes('readylink-server'), `${p} leaked package.json`);
  }
});

test('folders are not listed', async () => {
  for (const p of ['/js', '/js/', '/css/', '/data/']) {
    assert.equal((await raw('GET', p)).status, 404, p);
  }
});

test('only GET and HEAD are served for the frontend', async () => {
  assert.equal((await raw('POST', '/')).status, 404);
  assert.equal((await raw('PUT', '/js/api.js')).status, 404);
  assert.equal((await raw('DELETE', '/css/styles.css')).status, 404);
});

test('unknown pages return a plain 404', async () => {
  const r = await raw('GET', '/nope');
  assert.equal(r.status, 404);
  assert.match(r.headers['content-type'], /text\/plain/);
});

test('in the test environment the frontend is not cached (no stale files while developing)', async () => {
  assert.match((await raw('GET', '/')).headers['cache-control'], /no-cache/);
  assert.match((await raw('GET', '/js/api.js')).headers['cache-control'], /no-cache/);
});
