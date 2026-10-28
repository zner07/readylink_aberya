'use strict';
/* Database access. This is the ONLY file that talks to a SQLite driver.
   Everything else (services, routes, tests) uses the small interface returned by openDatabase():

     db.exec(sql)                 run one or more statements
     db.run(sql, [params])        INSERT / UPDATE / DELETE  -> { changes, lastInsertRowid }
     db.get(sql, [params])        one row (plain object) or undefined
     db.all(sql, [params])        array of rows
     db.transaction(fn)           runs fn() inside BEGIN IMMEDIATE ... COMMIT (ROLLBACK if fn throws)
     db.close()
     db.driver                    'better-sqlite3' or 'node-sqlite'

   Drivers
     better-sqlite3  the recommended driver (an optional npm package with a native part).
     node-sqlite     the SQLite built into Node.js 22.5 and newer ("node:sqlite"). No install needed.
   DB_DRIVER=auto (default) tries better-sqlite3 first and falls back to node-sqlite with a clear message,
   so a failed native install on Windows does not stop the project. Both are real SQLite and use the same SQL.

   To move to PostgreSQL later, this file and the SQL in src/services are the only places that change. */
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

function loadBetterSqlite3() {
  try {
    return require('better-sqlite3');
  } catch (err) {
    const e = new Error(`better-sqlite3 is not available (${err.code || err.message}). Run "npm install" in the server folder, or use DB_DRIVER=node-sqlite.`);
    e.code = 'DRIVER_UNAVAILABLE';
    throw e;
  }
}

function loadNodeSqlite() {
  try {
    return require('node:sqlite');
  } catch (err) {
    const e = new Error('node:sqlite is not available. It needs Node.js 22.5 or newer.');
    e.code = 'DRIVER_UNAVAILABLE';
    throw e;
  }
}

/* Which drivers work on this computer? Used by the tests. */
function availableDrivers() {
  const found = [];
  for (const [name, load] of [['better-sqlite3', loadBetterSqlite3], ['node-sqlite', loadNodeSqlite]]) {
    try {
      load();
      found.push(name);
    } catch (err) {
      /* not available */
    }
  }
  return found;
}

function adapt(raw, driver, isMemory) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  const plain = (row) => (row ? { ...row } : undefined);

  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 3000');
  if (!isMemory) raw.exec('PRAGMA journal_mode = WAL');

  return {
    driver,
    exec: (sql) => raw.exec(sql),
    run(sql, params = []) {
      const r = stmt(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    get: (sql, params = []) => plain(stmt(sql).get(...params)),
    all: (sql, params = []) => stmt(sql).all(...params).map(plain),
    transaction(fn) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          raw.exec('ROLLBACK');
        } catch (rollbackErr) {
          /* the original error is the useful one */
        }
        throw err;
      }
    },
    close() {
      cache.clear();
      raw.close();
    },
  };
}

function open(driver, file) {
  const isMemory = file === ':memory:';
  if (!isMemory) fs.mkdirSync(path.dirname(file), { recursive: true });
  if (driver === 'better-sqlite3') {
    const Database = loadBetterSqlite3();
    return adaptOrClose(new Database(file), 'better-sqlite3', isMemory);
  }
  const { DatabaseSync } = loadNodeSqlite();
  return adaptOrClose(new DatabaseSync(file), 'node-sqlite', isMemory);
}

/* adapt() runs a few PRAGMA statements. If one of them fails, close the connection we just opened. */
function adaptOrClose(raw, driver, isMemory) {
  try {
    return adapt(raw, driver, isMemory);
  } catch (err) {
    closeQuietly(raw);
    throw err;
  }
}

/* An open connection keeps the database file (and its -wal and -shm files) locked.
   On Windows a locked file cannot be deleted or moved, so every error path must close what it opened. */
function closeQuietly(connection) {
  try {
    connection.close();
  } catch (err) {
    /* already closed, or nothing more we can do: the original error is the useful one */
  }
}

/* Creates the tables when the database is new. Safe to run every time the server starts. */
function initSchema(db) {
  const version = db.get('PRAGMA user_version').user_version;
  if (version > SCHEMA_VERSION) {
    throw new Error(`This database was created by a newer version of READYLINK (schema ${version}, this server knows ${SCHEMA_VERSION}).`);
  }
  if (version < SCHEMA_VERSION) {
    db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

/* options: { driver: 'auto' | 'better-sqlite3' | 'node-sqlite', onFallback(message) } */
function openDatabase(file, { driver = 'auto', onFallback } = {}) {
  if (!['auto', 'better-sqlite3', 'node-sqlite'].includes(driver)) throw new Error(`Unknown database driver "${driver}".`);
  let db;
  if (driver === 'auto') {
    try {
      db = open('better-sqlite3', file);
    } catch (err) {
      if (err.code !== 'DRIVER_UNAVAILABLE' && !/better_sqlite3|better-sqlite3|NODE_MODULE_VERSION|\.node/i.test(String(err.message))) throw err;
      if (onFallback) onFallback(`${err.message.split('\n')[0]} Using the SQLite built into Node.js (node:sqlite) instead.`);
      db = open('node-sqlite', file);
    }
  } else {
    db = open(driver, file);
  }
  try {
    initSchema(db);
  } catch (err) {
    closeQuietly(db); // for example "database created by a newer version": do not leave the file open
    throw err;
  }
  return db;
}

module.exports = { openDatabase, availableDrivers, SCHEMA_VERSION };
