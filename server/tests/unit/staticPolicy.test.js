'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify, isServable } = require('../../src/staticPolicy');

test('the page itself is served', () => {
  for (const p of ['/', '/index.html', '/?x=1', '/index.html?v=2', '/#/map']) {
    assert.equal(classify(p).kind, 'index', p);
  }
});

test('the existing frontend assets are served (css, js, data)', () => {
  const files = [
    '/css/tokens.css', '/css/styles.css',
    '/js/utils.js', '/js/api.js', '/js/map-data.js', '/js/pages-public.js', '/js/events.js',
    '/data/alangilan.geojson', '/data/alangilan-features.geojson',
    '/js/api.js?v=2',
  ];
  for (const p of files) assert.equal(classify(p).kind, 'asset', p);
});

test('server code, secrets, git data and project files are NOT served', () => {
  const notFrontend = [
    '/server/package.json', '/server/src/app.js', '/server/.env', '/server/.env.example',
    '/.env', '/.git/config', '/.gitignore', '/README.md', '/tests/x.js', '/docs/API.md',
    '/node_modules/express/package.json', '/uploads/photo.jpg', '/favicon.ico',
    '/server/data/readylink.db', '/server/data/readylink.db-wal', '/server/uploads/photo.jpg', '/server/src/db.js', '/server/src/schema.sql', '/server/tests/helpers/images.js',
  ];
  for (const p of notFrontend) assert.equal(isServable(p), false, p);
});

test('path traversal tricks are rejected before touching the file system', () => {
  const tricks = [
    '/css/../server/package.json',
    '/js/../../etc/passwd',
    '/css/%2e%2e/server/package.json',
    '/css/%2E%2E/server/package.json',
    '/js/..%2fserver%2fpackage.json',
    '/js/..%2Fserver%2Fpackage.json',
    '/js/%2e%2e%2fserver%2fpackage.json',
    '/css\\..\\server\\package.json',
    '/js/..%5cserver%5cpackage.json',
    '/js/api.js%00.png',
    '/js/api.js\0',
    '/js//api.js',
    '//js/api.js',
    '/js/./api.js',
  ];
  for (const p of tricks) {
    assert.equal(isServable(p), false, p);
    assert.equal(classify(p).kind, 'deny', p);
  }
});

test('dotfiles and hidden folders inside the public folders are rejected', () => {
  for (const p of ['/css/.hidden', '/js/.env', '/data/.git/config', '/js/sub/.secret.js']) {
    assert.equal(classify(p).kind, 'deny', p);
  }
});

test('directories (no file name) are not served', () => {
  for (const p of ['/css', '/js', '/data', '/css/', '/js/']) {
    assert.equal(isServable(p), false, p);
  }
});

test('malformed input is rejected', () => {
  for (const p of ['', 'index.html', 'js/api.js', null, undefined, 42, {}]) {
    assert.equal(classify(p).kind, 'deny', String(p));
  }
});

test('a normal percent-encoded file name is still allowed to reach express.static', () => {
  assert.equal(classify('/js/my%20file.js').kind, 'asset');
});
