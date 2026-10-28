'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { seedSamples, resetSamples, loadSampleRows, sampleDateToIso } = require('../../src/services/seedService');
const { createReport, listReports, getReport } = require('../../src/services/reportService');
const { validateNewReport, STATUSES } = require('../../src/services/reportValidation');
const { DRIVERS, geo, FRONTEND_DIR, CLIENT_A, memoryDb, tempDir, removeDir } = require('../helpers/env');

const frontendRows = loadSampleRows(FRONTEND_DIR);
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('the sample file has the 12 reports the frontend demo shows (RL-023 to RL-034)', () => {
  assert.equal(frontendRows.length, 12);
  assert.deepEqual(frontendRows.map((r) => r.id), ['RL-023', 'RL-024', 'RL-025', 'RL-026', 'RL-027', 'RL-028', 'RL-029', 'RL-030', 'RL-031', 'RL-032', 'RL-033', 'RL-034']);
});

test('sample dates become fixed ISO moments', () => {
  assert.equal(sampleDateToIso('Sep 25'), '2026-09-25T04:00:00.000Z');
  assert.equal(sampleDateToIso('Oct 1'), '2026-10-01T04:00:00.000Z');
  assert.throws(() => sampleDateToIso('25 Sep'), /Unrecognized sample date/);
  assert.throws(() => sampleDateToIso('Foo 3'), /Unrecognized sample date/);
});

for (const driver of DRIVERS) {
  const t = (name, fn) =>
    test(`[${driver}] ${name}`, () => {
      const db = memoryDb(driver);
      try {
        return fn(db);
      } finally {
        db.close();
      }
    });

  t('seeds all 12 sample reports', (db) => {
    assert.deepEqual(seedSamples(db, { geo, frontendDir: FRONTEND_DIR }), { inserted: 12, skipped: 0 });
    assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 12);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM reports WHERE is_sample = 1').n, 12);
  });

  t('seeding is repeatable: running it again adds nothing and duplicates nothing', (db) => {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    const before = db.get('SELECT COUNT(*) AS reports, (SELECT COUNT(*) FROM report_events) AS events FROM reports');
    assert.deepEqual(seedSamples(db, { geo, frontendDir: FRONTEND_DIR }), { inserted: 0, skipped: 12 });
    assert.deepEqual(db.get('SELECT COUNT(*) AS reports, (SELECT COUNT(*) FROM report_events) AS events FROM reports'), before);
  });

  t('the database output matches the frontend sample data, row by row', (db) => {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    const byId = new Map(listReports(db, { geo }).map((r) => [r.id, r]));
    for (const row of frontendRows) {
      const r = byId.get(row.id);
      assert.ok(r, `${row.id} is missing`);
      assert.equal(r.type, row.type, `${row.id} type`);
      assert.equal(r.x, row.x, `${row.id} x`);
      assert.equal(r.y, row.y, `${row.id} y`);
      assert.equal(r.lv, row.level, `${row.id} level`);
      assert.equal(r.ai, row.level, `${row.id} ai level`);
      assert.equal(r.st, STATUSES[row.statusIndex], `${row.id} status`);
      assert.equal(r.desc, row.desc, `${row.id} description`);
      assert.equal(r.date, row.date, `${row.id} date`);
      assert.equal(r.brgy, 'Brgy. Alangilan');
      assert.equal(r.img, null);
      assert.equal(r.mine, false);
    }
  });

  t('every sample timeline follows the frontend rules for its status', (db) => {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    const days = { 'Verified by barangay admin': 'Sep 28', 'Placed under monitoring': 'Sep 29', 'Marked as resolved': 'Oct 1' };
    for (const row of frontendRows) {
      const log = getReport(db, { geo }, row.id).log;
      const expected = ['Report submitted', 'AI-assisted assessment generated'];
      if (row.statusIndex >= 1) expected.push('Verified by barangay admin');
      if (row.statusIndex >= 2) expected.push('Placed under monitoring');
      if (row.statusIndex >= 3) expected.push('Marked as resolved');
      assert.deepEqual(log.map((e) => e.t), expected, row.id);
      assert.ok(log[0].d.startsWith(row.date), `${row.id}: first entry is on ${row.date}`);
      for (const e of log.slice(2)) assert.ok(e.d.startsWith(days[e.t]), `${row.id}: ${e.t} is on ${days[e.t]}`);
    }
  });

  t('ids and statuses follow the frontend conventions', (db) => {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    for (const r of listReports(db, { geo })) {
      assert.match(r.id, /^RL-\d{3}$/);
      assert.ok(STATUSES.includes(r.st));
    }
  });

  t('reset removes ONLY sample reports and keeps real ones', (db) => {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    const { value } = validateNewReport({ type: 'tree', x: 500, y: 300, desc: 'A real report.' }, { geo, maxPhotoBytes: 1e6 });
    const uploads = tempDir();
    const real = createReport(db, { geo, uploadsDir: uploads }, value, CLIENT_A); // no photo, so nothing is written there
    removeDir(uploads);
    assert.equal(real.id, 'RL-035');

    assert.equal(resetSamples(db), 12);
    const left = listReports(db, { geo });
    assert.deepEqual(left.map((r) => r.id), ['RL-035']);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM report_events').n, 2, 'only the real report keeps its timeline');

    assert.deepEqual(seedSamples(db, { geo, frontendDir: FRONTEND_DIR }), { inserted: 12, skipped: 0 });
    assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 13);
    assert.equal(getReport(db, { geo }, 'RL-035').desc, 'A real report.');
  });

  t('seeding never overwrites a report that already exists', (db) => {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    db.run("UPDATE reports SET status = 'Resolved', description = 'edited by an admin' WHERE public_id = 'RL-024'");
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    const r = getReport(db, { geo }, 'RL-024');
    assert.equal(r.st, 'Resolved');
    assert.equal(r.desc, 'edited by an admin');
  });
}

test('seeding only READS the frontend seed file (it is never changed)', () => {
  const seedFile = path.join(FRONTEND_DIR, 'js', 'seed-data.js');
  const before = sha(seedFile);
  const db = memoryDb(DRIVERS[0]);
  try {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    resetSamples(db);
  } finally {
    db.close();
  }
  assert.equal(sha(seedFile), before);
});

test('a broken sample file is refused with a clear message', () => {
  const dir = tempDir();
  const write = (rows) => {
    fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'js', 'seed-data.js'), `const rd=${JSON.stringify(rows)};`);
  };
  try {
    write([['RL-001', 'bridge', 500, 300, 'hi', 0, 'Sep 25', 'x']]);
    assert.throws(() => loadSampleRows(dir), /unknown hazard type "bridge"/);
    write([['RL-1', 'tree', 500, 300, 'hi', 0, 'Sep 25', 'x']]);
    assert.throws(() => loadSampleRows(dir), /id must look like RL-023/);
    write([['RL-001', 'tree', 500, 300, 'High', 0, 'Sep 25', 'x']]);
    assert.throws(() => loadSampleRows(dir), /unknown level/);
    write([['RL-001', 'tree', 500, 300, 'hi', 9, 'Sep 25', 'x']]);
    assert.throws(() => loadSampleRows(dir), /status index/);
    write([['RL-001', 'tree', 500, 300, 'hi', 0, '25 Sep', 'x']]);
    assert.throws(() => loadSampleRows(dir), /Unrecognized sample date/);
    fs.writeFileSync(path.join(dir, 'js', 'seed-data.js'), 'const other = 1;');
    assert.throws(() => loadSampleRows(dir));
  } finally {
    removeDir(dir);
  }
});

test('a sample report outside the barangay boundary is refused', () => {
  const dir = tempDir();
  const db = memoryDb(DRIVERS[0]);
  try {
    fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'js', 'seed-data.js'), `const rd=[['RL-001','tree',5,5,'hi',0,'Sep 25','outside']];`);
    assert.throws(() => seedSamples(db, { geo, frontendDir: dir }), /outside the Brgy\. Alangilan boundary/);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 0);
  } finally {
    db.close();
    removeDir(dir);
  }
});
