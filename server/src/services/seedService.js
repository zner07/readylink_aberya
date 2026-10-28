'use strict';
/* Puts the frontend's sample reports into the database.

   The single source of truth stays js/seed-data.js (the "rd" array the demo mode uses). This file READS that file,
   it does not copy the data, so the demo and the database can never disagree. Each row is:
     [ id, type, x, y, level, statusIndex, 'Mon D', description ]
   Repeatable: running it again skips reports that already exist. Rows are marked is_sample = 1, so
   "npm run seed -- --reset" removes only sample data and never real reports. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { HAZARD_TYPES, LEVELS, STATUSES } = require('./reportValidation');

const SAMPLE_YEAR = 2026; // the sample dates in seed-data.js have no year
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Same timeline the frontend demo builds in js/api.js (SEED): later steps happened on these days.
const SAMPLE_TIMELINE = [
  { minStatus: 1, text: 'Verified by barangay admin', date: 'Sep 28' },
  { minStatus: 2, text: 'Placed under monitoring', date: 'Sep 29' },
  { minStatus: 3, text: 'Marked as resolved', date: 'Oct 1' },
];

/* 'Sep 25' -> '2026-09-25T04:00:00.000Z' (noon in Manila, so the day is the same in most time zones). */
function sampleDateToIso(text) {
  const m = /^([A-Z][a-z]{2}) (\d{1,2})$/.exec(text);
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  if (month < 0) throw new Error(`Unrecognized sample date "${text}". Use a format like "Sep 25".`);
  return new Date(Date.UTC(SAMPLE_YEAR, month, Number(m[2]), 4, 0, 0)).toISOString();
}

/* Reads the "rd" array from js/seed-data.js without running anything outside a sandbox. */
function loadSampleRows(frontendDir) {
  const file = path.join(frontendDir, 'js', 'seed-data.js');
  const code = fs.readFileSync(file, 'utf8');
  const rows = vm.runInNewContext(`${code}\n;rd`, Object.create(null), { timeout: 1000 });
  if (!Array.isArray(rows)) throw new Error(`${file} must define an array named rd.`);
  // Array.from copies the rows out of the vm sandbox into normal arrays and objects of this program.
  return Array.from(rows, (row, i) => {
    const [id, type, x, y, level, statusIndex, date, desc] = row;
    const bad = (why) => new Error(`Sample row ${i + 1} (${id}): ${why}`);
    if (!/^RL-\d{3,}$/.test(id)) throw bad('id must look like RL-023.');
    if (!HAZARD_TYPES.includes(type)) throw bad(`unknown hazard type "${type}".`);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw bad('x and y must be numbers.');
    if (!LEVELS.includes(level)) throw bad(`unknown level "${level}".`);
    if (!Number.isInteger(statusIndex) || statusIndex < 0 || statusIndex >= STATUSES.length) throw bad('status index must be 0 to 3.');
    if (typeof desc !== 'string' || !desc.trim()) throw bad('missing description.');
    sampleDateToIso(date);
    return { id, type, x, y, level, statusIndex, date, desc };
  });
}

/* Inserts missing sample reports. Returns { inserted, skipped }. */
function seedSamples(db, { geo, frontendDir }) {
  const rows = loadSampleRows(frontendDir);
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const { lat, lng } = geo.xyToLatLng(row.x, row.y);
    if (!geo.isInsideBoundary(lat, lng)) throw new Error(`Sample report ${row.id} is outside the Brgy. Alangilan boundary.`);
    db.transaction(() => {
      if (db.get('SELECT 1 AS found FROM reports WHERE public_id = ?', [row.id])) {
        skipped += 1;
        return;
      }
      const created = sampleDateToIso(row.date);
      const events = [
        { text: 'Report submitted', at: created },
        { text: 'AI-assisted assessment generated', at: created },
        ...SAMPLE_TIMELINE.filter((s) => row.statusIndex >= s.minStatus).map((s) => ({ text: s.text, at: sampleDateToIso(s.date) })),
      ];
      const updated = events[events.length - 1].at;
      const { lastInsertRowid } = db.run(
        `INSERT INTO reports (public_id, type, lat, lng, ai_level, level, status, description, photo_file, client_id, is_sample, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?)`,
        [row.id, row.type, lat, lng, row.level, row.level, STATUSES[row.statusIndex], row.desc, created, updated]
      );
      for (const e of events) db.run('INSERT INTO report_events (report_id, text, created_at) VALUES (?, ?, ?)', [lastInsertRowid, e.text, e.at]);
      inserted += 1;
    });
  }
  return { inserted, skipped };
}

/* Deletes ONLY sample reports (and their timeline). Real reports are never touched. Returns how many were removed. */
function resetSamples(db) {
  return db.transaction(() => db.run('DELETE FROM reports WHERE is_sample = 1').changes);
}

module.exports = { seedSamples, resetSamples, loadSampleRows, sampleDateToIso };
