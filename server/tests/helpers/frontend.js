'use strict';
/* Loads the REAL frontend scripts (js/data.js ... js/api.js) into an isolated sandbox, the way a browser does,
   so tests run the actual js/api.js and js/api-server.js code. These files need no DOM, so no browser is required.
   Only the things a browser provides (fetch, localStorage, crypto, timers) are replaced by test doubles. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FRONTEND_DIR } = require('./env');

// Same order as in index.html, up to and including api.js.
const SCRIPTS = ['data', 'seed-data', 'demo-insights', 'map-data', 'map', 'config', 'api-server', 'api'];

/* A tiny localStorage / sessionStorage. failing = true makes every call throw (like a blocked browser). */
function fakeStorage({ failing = false } = {}) {
  const data = new Map();
  const guard = () => {
    if (failing) throw new Error('storage is blocked');
  };
  return {
    data,
    getItem: (k) => (guard(), data.has(k) ? data.get(k) : null),
    setItem: (k, v) => (guard(), void data.set(k, String(v))),
    removeItem: (k) => (guard(), void data.delete(k)),
  };
}

/* A fetch double. handler({ url, method, headers, body }) returns a reply() or throws to simulate a network failure.
   It also honors AbortController, like a real fetch. Every call is recorded in fetch.calls. */
function fakeFetch(handler) {
  const calls = [];
  const fetch = (url, opts = {}) =>
    new Promise((resolve, reject) => {
      const call = { url: String(url), method: opts.method || 'GET', headers: { ...(opts.headers || {}) }, body: opts.body };
      calls.push(call);
      if (opts.signal) {
        if (opts.signal.aborted) return reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }
      Promise.resolve()
        .then(() => handler(call))
        .then(resolve, reject);
    });
  fetch.calls = calls;
  return fetch;
}

/* An answer like fetch() gives. body can be an object (sent as JSON) or a plain string. */
const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
});
const hang = () => new Promise(() => {}); // never answers (only an abort ends it)

/* Everything that crosses the sandbox boundary is turned into plain data, so deepEqual compares values only. */
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function loadFrontend({ config, fetch, localStorage = fakeStorage(), sessionStorage = fakeStorage(), crypto = globalThis.crypto } = {}) {
  const sandbox = {
    console, setTimeout, clearTimeout, AbortController, fetch, localStorage, sessionStorage, crypto,
    guessType: () => 'road', // lives in pages-public.js (needs the DOM); only used when a draft has no sample type
  };
  sandbox.window = sandbox;
  if (config) sandbox.READYLINK_CONFIG = config;
  vm.createContext(sandbox);
  for (const name of SCRIPTS) {
    const file = path.join(FRONTEND_DIR, 'js', `${name}.js`);
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(sandbox);
  }
  const run = (code) => vm.runInContext(code, sandbox);
  return { sandbox, run, API: run('API'), ServerAPI: run('ServerAPI'), localStorage, sessionStorage, fetch };
}

module.exports = { loadFrontend, fakeStorage, fakeFetch, reply, hang, plain };
