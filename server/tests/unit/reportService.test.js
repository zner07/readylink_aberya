'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createReport, listReports, getReport, nextPublicId, formatDate, formatStamp, MAX_LIST } = require('../../src/services/reportService');
const { validateNewReport } = require('../../src/services/reportValidation');
const { seedSamples } = require('../../src/services/seedService');
const images = require('../helpers/images');
const { DRIVERS, geo, FRONTEND_DIR, CLIENT_A, CLIENT_B, memoryDb, tempDir, removeDir } = require('../helpers/env');

const NOW = new Date('2026-10-12T05:00:00.000Z'); // 1:00 PM in Manila
const input = (extra = {}) => ({ type: 'drain', x: 500, y: 300, desc: 'Blocked drain near the school.', level: 'hi', ...extra });
const valid = (extra) => {
  const { value, errors } = validateNewReport(input(extra), { geo, maxPhotoBytes: 5 * 1024 * 1024 });
  assert.deepEqual(errors, {});
  return value;
};

/* Runs a test body with a fresh database and uploads folder for one driver. */
function withEnv(driver, fn) {
  const db = memoryDb(driver);
  const uploadsDir = tempDir('readylink-uploads-');
  const ctx = { db, geo, uploadsDir, now: () => NOW };
  try {
    return fn(ctx);
  } finally {
    db.close();
    removeDir(uploadsDir);
  }
}

for (const driver of DRIVERS) {
  const t = (name, fn) => test(`[${driver}] ${name}`, () => withEnv(driver, fn));

  t('creates a report with the same fields and values the frontend uses', ({ db, ...ctx }) => {
    const report = createReport(db, ctx, valid(), CLIENT_A);
    assert.deepEqual(Object.keys(report).sort(), ['ai', 'brgy', 'createdAt', 'date', 'desc', 'id', 'img', 'lat', 'lng', 'log', 'lv', 'mine', 'st', 'type', 'x', 'y']);
    assert.equal(report.id, 'RL-001');
    assert.equal(report.type, 'drain');
    assert.equal(report.st, 'Pending');
    assert.equal(report.ai, 'hi');
    assert.equal(report.lv, 'hi');
    assert.equal(report.desc, 'Blocked drain near the school.');
    assert.equal(report.brgy, 'Brgy. Alangilan');
    assert.equal(report.img, null);
    assert.equal(report.mine, true);
    assert.equal(report.createdAt, '2026-10-12T05:00:00.000Z');
    assert.equal(report.date, 'Oct 12');
  });

  t('x and y come back exactly as the frontend sent them (SVG map units, not lat/lng)', ({ db, ...ctx }) => {
    for (const [x, y] of [[500, 300], [355, 81], [545, 373], [474.5, 136.25]]) {
      const r = createReport(db, ctx, valid({ x, y }), CLIENT_A);
      assert.equal(r.x, x);
      assert.equal(r.y, y);
      assert.ok(r.lat > 13.77 && r.lat < 13.80 && r.lng > 121.05 && r.lng < 121.08, 'lat/lng are real coordinates');
    }
  });

  t('timeline starts with the two entries the frontend demo writes', ({ db, ...ctx }) => {
    const { log } = createReport(db, ctx, valid(), CLIENT_A);
    assert.deepEqual(log.map((e) => e.t), ['Report submitted', 'AI-assisted assessment generated (demo)']);
    assert.equal(log[0].d, 'Oct 12, 1:00 PM');
    assert.equal(log[0].at, '2026-10-12T05:00:00.000Z');
    assert.equal(log[0].n, undefined);
  });

  t('ids count up: RL-001, RL-002 ... and never repeat', ({ db, ...ctx }) => {
    const ids = [];
    for (let i = 0; i < 25; i += 1) ids.push(createReport(db, ctx, valid(), CLIENT_A).id);
    assert.equal(ids[0], 'RL-001');
    assert.equal(ids[24], 'RL-025');
    assert.equal(new Set(ids).size, 25);
  });

  t('new ids continue after the seeded sample reports (RL-035 after RL-034)', ({ db, ...ctx }) => {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    assert.equal(createReport(db, ctx, valid(), CLIENT_A).id, 'RL-035');
    assert.equal(createReport(db, ctx, valid(), CLIENT_A).id, 'RL-036');
  });

  t('id numbering follows the highest number, also with gaps and past 999', ({ db }) => {
    assert.equal(nextPublicId(db), 'RL-001');
    for (const id of ['RL-007', 'RL-999']) {
      db.run(`INSERT INTO reports (public_id, type, lat, lng, ai_level, level, description, created_at, updated_at) VALUES (?, 'tree', 13.78, 121.06, 'mod', 'mod', 'x', 'a', 'a')`, [id]);
    }
    assert.equal(nextPublicId(db), 'RL-1000');
  });

  t('a photo is saved to disk and the report points to it', ({ db, uploadsDir, ...ctx }) => {
    const report = createReport(db, { ...ctx, uploadsDir }, valid({ photo: images.dataUrl('jpeg') }), CLIENT_A);
    assert.match(report.img, /^\/uploads\/[0-9a-f-]{36}\.jpg$/);
    const file = path.join(uploadsDir, path.basename(report.img));
    assert.ok(fs.readFileSync(file).equals(images.buffer('jpeg')), 'the stored file must be the uploaded photo');
    const other = createReport(db, { ...ctx, uploadsDir }, valid({ photo: images.dataUrl('jpeg') }), CLIENT_A);
    assert.notEqual(other.img, report.img, 'every upload gets its own random name');
    assert.equal(getReport(db, ctx, report.id).img, report.img, 'the photo is still linked when the report is read again');
  });

  t('png and webp photos keep their own extension', ({ db, uploadsDir, ...ctx }) => {
    assert.match(createReport(db, { ...ctx, uploadsDir }, valid({ photo: images.dataUrl('png') }), CLIENT_A).img, /\.png$/);
    assert.match(createReport(db, { ...ctx, uploadsDir }, valid({ photo: images.dataUrl('webp') }), CLIENT_A).img, /\.webp$/);
  });

  t('if saving fails, the uploaded photo is removed (no orphan files) and no report is stored', ({ db, uploadsDir, ...ctx }) => {
    const failing = Object.create(db);
    failing.run = (sql, params) => {
      if (/INSERT INTO report_events/.test(sql)) throw new Error('disk full');
      return db.run(sql, params);
    };
    assert.throws(() => createReport(failing, { ...ctx, uploadsDir }, valid({ photo: images.dataUrl('png') }), CLIENT_A), /disk full/);
    assert.deepEqual(fs.readdirSync(uploadsDir), []);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 0, 'the half-saved report must be rolled back');
  });

  t('the anonymous client id is never returned, but marks reports as mine', ({ db, ...ctx }) => {
    const created = createReport(db, ctx, valid(), CLIENT_A);
    assert.doesNotMatch(JSON.stringify(created), new RegExp(CLIENT_A));
    const asA = getReport(db, ctx, created.id, CLIENT_A);
    const asB = getReport(db, ctx, created.id, CLIENT_B);
    const asNobody = getReport(db, ctx, created.id);
    assert.equal(asA.mine, true);
    assert.equal(asB.mine, false);
    assert.equal(asNobody.mine, false);
    assert.doesNotMatch(JSON.stringify([asA, asB, asNobody, listReports(db, ctx, { clientId: CLIENT_A })]), /client-/);
  });

  t('list returns everything for the public map, newest first', ({ db, ...ctx }) => {
    createReport(db, ctx, valid(), CLIENT_A);
    createReport(db, ctx, valid({ type: 'tree' }), CLIENT_B);
    createReport(db, ctx, valid({ type: 'pole' }), CLIENT_A);
    const all = listReports(db, ctx);
    assert.deepEqual(all.map((r) => r.id), ['RL-003', 'RL-002', 'RL-001']);
    assert.deepEqual(all.map((r) => r.mine), [false, false, false]);
    const seenByA = listReports(db, ctx, { clientId: CLIENT_A });
    assert.deepEqual(seenByA.map((r) => r.mine), [true, false, true]);
    assert.ok(all.every((r) => r.log.length === 2), 'timelines are included');
  });

  t('mineOnly returns only this device\'s reports', ({ db, ...ctx }) => {
    createReport(db, ctx, valid(), CLIENT_A);
    createReport(db, ctx, valid({ type: 'tree' }), CLIENT_B);
    createReport(db, ctx, valid({ type: 'pole' }), CLIENT_A);
    assert.deepEqual(listReports(db, ctx, { clientId: CLIENT_A, mineOnly: true }).map((r) => r.id), ['RL-003', 'RL-001']);
    assert.deepEqual(listReports(db, ctx, { clientId: CLIENT_B, mineOnly: true }).map((r) => r.id), ['RL-002']);
    assert.deepEqual(listReports(db, ctx, { clientId: 'client-cccccccccccccccc', mineOnly: true }), []);
    assert.deepEqual(listReports(db, ctx, { clientId: null, mineOnly: true }), [], 'no client id must never match reports that have none (seeded samples)');
  });

  t('seeded sample reports are never "mine"', ({ db, ...ctx }) => {
    seedSamples(db, { geo, frontendDir: FRONTEND_DIR });
    assert.ok(listReports(db, ctx, { clientId: CLIENT_A }).every((r) => r.mine === false));
    assert.deepEqual(listReports(db, ctx, { clientId: CLIENT_A, mineOnly: true }), []);
  });

  t(`list stops at ${MAX_LIST} reports`, ({ db, ...ctx }) => {
    db.transaction(() => {
      for (let i = 1; i <= MAX_LIST + 5; i += 1) {
        db.run(`INSERT INTO reports (public_id, type, lat, lng, ai_level, level, description, created_at, updated_at) VALUES (?, 'tree', 13.78, 121.06, 'mod', 'mod', 'x', '2026-10-12T00:00:00.000Z', 'a')`, ['RL-' + String(i).padStart(3, '0')]);
      }
    });
    assert.equal(listReports(db, ctx).length, MAX_LIST);
  });

  t('get returns one report, or null when it does not exist', ({ db, ...ctx }) => {
    const created = createReport(db, ctx, valid(), CLIENT_A);
    assert.equal(getReport(db, ctx, created.id).id, created.id);
    assert.equal(getReport(db, ctx, 'RL-404'), null);
  });

  t('malformed ids are treated as "not found" and never reach SQL', ({ db, ...ctx }) => {
    createReport(db, ctx, valid(), CLIENT_A);
    for (const id of ["RL-001' OR '1'='1", "RL-001'; DROP TABLE reports;--", 'rl-001', 'RL-1', 'RL-', '1', '', '../etc/passwd', 'RL-001 ', null, undefined, 5, {}, ['RL-001']]) {
      assert.equal(getReport(db, ctx, id), null, String(id));
    }
    assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 1, 'the table must still be there');
  });

  t('text is stored exactly as typed: SQL and HTML stay harmless plain text', ({ db, ...ctx }) => {
    const text = `Robert'); DROP TABLE reports;-- <img src=x onerror=alert(1)>`;
    const r = createReport(db, ctx, valid({ desc: text }), CLIENT_A);
    assert.equal(getReport(db, ctx, r.id).desc, text);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM reports').n, 1);
  });

  t('timeline notes are returned as "n" only when there is one', ({ db, ...ctx }) => {
    const r = createReport(db, ctx, valid(), CLIENT_A);
    const row = db.get('SELECT id FROM reports WHERE public_id = ?', [r.id]);
    db.run('INSERT INTO report_events (report_id, text, note, created_at) VALUES (?, ?, ?, ?)', [row.id, 'Admin remark added', 'Checked by the tanod', '2026-10-13T01:00:00.000Z']);
    const log = getReport(db, ctx, r.id).log;
    assert.equal(log.length, 3);
    assert.equal(log[2].n, 'Checked by the tanod');
    assert.equal(log[0].n, undefined);
  });
}

test('display dates use Manila time and plain spaces', () => {
  assert.equal(formatDate('2026-10-12T05:00:00.000Z'), 'Oct 12');
  assert.equal(formatDate('2026-10-12T20:30:00.000Z'), 'Oct 13', '4:30 AM the next day in Manila');
  assert.equal(formatStamp('2026-10-12T05:00:00.000Z'), 'Oct 12, 1:00 PM');
  assert.equal(formatStamp('2026-10-12T20:30:00.000Z'), 'Oct 13, 4:30 AM');
  assert.doesNotMatch(formatStamp('2026-10-12T05:00:00.000Z'), /[\u202f\u00a0]/);
});
