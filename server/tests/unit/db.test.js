'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase, availableDrivers, SCHEMA_VERSION } = require('../../src/db');
const { DRIVERS, tempDir, removeDir, openHandlesIn, memoryDb } = require('../helpers/env');

const NOW = '2026-10-12T05:00:00.000Z';
const insertReport = (db, over = {}) => {
  const r = { public_id: 'RL-001', type: 'drain', lat: 13.78, lng: 121.06, ai_level: 'mod', level: 'mod', status: 'Pending', description: 'x', ...over };
  return db.run(
    `INSERT INTO reports (public_id, type, lat, lng, ai_level, level, status, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [r.public_id, r.type, r.lat, r.lng, r.ai_level, r.level, r.status, r.description, NOW, NOW]
  );
};

test('at least one SQLite driver is available on this computer', () => {
  assert.ok(DRIVERS.length >= 1, `none of better-sqlite3 or node:sqlite could be loaded (found: ${availableDrivers()})`);
  console.log(`# drivers tested on this computer: ${DRIVERS.join(', ')}`);
});

for (const driver of DRIVERS) {
  test(`[${driver}] opens, creates the tables and sets the schema version`, () => {
    const db = memoryDb(driver);
    try {
      assert.equal(db.driver, driver);
      assert.equal(db.get('PRAGMA user_version').user_version, SCHEMA_VERSION);
      const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name);
      assert.deepEqual(tables, ['report_events', 'reports']);
      assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 0);
    } finally {
      db.close();
    }
  });

  test(`[${driver}] run, get, all return plain objects and numbers`, () => {
    const db = memoryDb(driver);
    try {
      const r = insertReport(db);
      assert.equal(r.changes, 1);
      assert.equal(typeof r.lastInsertRowid, 'number');
      const row = db.get('SELECT * FROM reports WHERE public_id = ?', ['RL-001']);
      assert.equal(Object.getPrototypeOf(row), Object.prototype);
      assert.equal(row.type, 'drain');
      assert.equal(row.is_sample, 0);
      assert.equal(db.get('SELECT * FROM reports WHERE public_id = ?', ['nope']), undefined);
      assert.equal(db.all('SELECT * FROM reports').length, 1);
    } finally {
      db.close();
    }
  });

  test(`[${driver}] the database itself rejects unknown hazard types, levels and statuses`, () => {
    const db = memoryDb(driver);
    try {
      for (const bad of [{ type: 'Tree' }, { type: 'bridge' }, { level: 'High' }, { ai_level: 'urgent' }, { status: 'pending' }, { status: 'Under Monitoring' }, { status: 'Done' }]) {
        assert.throws(() => insertReport(db, { public_id: 'RL-00' + Math.random().toString().slice(2, 6), ...bad }), /CHECK constraint/i, JSON.stringify(bad));
      }
      assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 0);
      for (const type of ['tree', 'drain', 'road', 'pole', 'flood', 'slope', 'river', 'wall']) insertReport(db, { public_id: 'RL-' + type, type });
      for (const status of ['Pending', 'Verified', 'Under monitoring', 'Resolved']) insertReport(db, { public_id: 'RL-s-' + status, status });
    } finally {
      db.close();
    }
  });

  test(`[${driver}] public ids are unique`, () => {
    const db = memoryDb(driver);
    try {
      insertReport(db);
      assert.throws(() => insertReport(db), /UNIQUE constraint/i);
    } finally {
      db.close();
    }
  });

  test(`[${driver}] timeline rows need a real report and are deleted with it (foreign keys are on)`, () => {
    const db = memoryDb(driver);
    try {
      assert.throws(() => db.run('INSERT INTO report_events (report_id, text, created_at) VALUES (?,?,?)', [999, 'x', NOW]), /FOREIGN KEY/i);
      const { lastInsertRowid } = insertReport(db);
      db.run('INSERT INTO report_events (report_id, text, created_at) VALUES (?,?,?)', [lastInsertRowid, 'Report submitted', NOW]);
      db.run('DELETE FROM reports WHERE id = ?', [lastInsertRowid]);
      assert.equal(db.get('SELECT COUNT(*) AS n FROM report_events').n, 0);
    } finally {
      db.close();
    }
  });

  test(`[${driver}] transaction commits on success and rolls back on error`, () => {
    const db = memoryDb(driver);
    try {
      db.transaction(() => insertReport(db, { public_id: 'RL-010' }));
      assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 1);
      assert.throws(
        () => db.transaction(() => {
          insertReport(db, { public_id: 'RL-011' });
          throw new Error('boom');
        }),
        /boom/
      );
      assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 1, 'the second insert must be rolled back');
      db.transaction(() => insertReport(db, { public_id: 'RL-012' })); // still usable after a rollback
      assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 2);
    } finally {
      db.close();
    }
  });

  test(`[${driver}] data is still there after closing and reopening the database file`, () => {
    const dir = tempDir();
    const file = path.join(dir, 'nested', 'persist.db');
    let db = null;
    try {
      db = openDatabase(file, { driver });
      insertReport(db, { public_id: 'RL-042', description: 'still here' });
      db.close();
      db = null;

      db = openDatabase(file, { driver }); // opening again must not wipe or duplicate anything
      assert.equal(db.get('SELECT description FROM reports WHERE public_id = ?', ['RL-042']).description, 'still here');
      assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 1);
      assert.equal(db.get('PRAGMA user_version').user_version, SCHEMA_VERSION);
      db.close();
      db = null;
    } finally {
      if (db) db.close(); // even when an assertion fails, never leave the file open (Windows cannot delete open files)
      removeDir(dir);
    }
  });

  test(`[${driver}] a database from a newer version of the app is refused`, () => {
    const dir = tempDir();
    const file = path.join(dir, 'future.db');
    let db = null;
    try {
      db = openDatabase(file, { driver });
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
      db.close();
      db = null;

      assert.throws(() => openDatabase(file, { driver }), /newer version of READYLINK/);

      // The refused attempt must not leave the database open. An open connection locks the file
      // (and its -wal and -shm files); on Windows a locked file cannot be deleted. Deleting here fails if one was left open.
      for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
    } finally {
      if (db) db.close();
      removeDir(dir);
    }
  });

  test(`[${driver}] opening a database that fails the schema check leaves no open file handles`, { skip: openHandlesIn(os.tmpdir()) === null && 'handle counting needs Linux (/proc)' }, () => {
    const dir = tempDir();
    const file = path.join(dir, 'future.db');
    try {
      const db = openDatabase(file, { driver });
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
      db.close();
      assert.equal(openHandlesIn(dir), 0, 'a normal close must release every handle');

      assert.throws(() => openDatabase(file, { driver }), /newer version of READYLINK/);
      assert.equal(openHandlesIn(dir), 0, 'a refused open must release every handle too (database, -wal and -shm)');
    } finally {
      removeDir(dir);
    }
  });
}

test('unknown driver names and unavailable drivers give a clear error', () => {
  assert.throws(() => openDatabase(':memory:', { driver: 'does-not-exist' }));
  if (!DRIVERS.includes('better-sqlite3')) {
    assert.throws(() => openDatabase(':memory:', { driver: 'better-sqlite3' }), /better-sqlite3 is not available/);
  }
});

test('auto driver falls back to node:sqlite with a message when better-sqlite3 is missing', () => {
  if (DRIVERS.includes('better-sqlite3') || !DRIVERS.includes('node-sqlite')) return; // only meaningful when it is really missing
  const messages = [];
  const db = openDatabase(':memory:', { driver: 'auto', onFallback: (m) => messages.push(m) });
  try {
    assert.equal(db.driver, 'node-sqlite');
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Using the SQLite built into Node\.js/);
  } finally {
    db.close();
  }
});
