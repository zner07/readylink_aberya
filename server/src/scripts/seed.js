'use strict';
/* npm run seed             Adds the sample reports from js/seed-data.js (skips the ones that already exist).
   npm run seed -- --reset  First removes ONLY the sample reports, then adds them again. Real reports are never touched. */
const { prepare, fail } = require('../bootstrap');
const { seedSamples, resetSamples } = require('../services/seedService');

const reset = process.argv.includes('--reset');
const { config, geo, db } = prepare();

if (reset && config.isProduction) {
  db.close();
  fail('Refusing to run --reset when NODE_ENV=production.');
}

let removed = 0;
if (reset) removed = resetSamples(db);
const { inserted, skipped } = seedSamples(db, { geo, frontendDir: config.frontendDir });
const total = db.get('SELECT COUNT(*) AS n FROM reports').n;

console.log(`\nSample reports: ${inserted} added, ${skipped} already there${reset ? `, ${removed} removed first` : ''}.`);
console.log(`Total reports in the database: ${total} (${db.driver}).\n`);
db.close();
