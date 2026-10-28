'use strict';
/* npm run db:list         Prints the newest reports straight from the database FILE (read only).
   npm run db:list -- 20   Prints the newest 20 (default 10).
   Use it to check that a report sent from the app was really saved. */
const { prepare } = require('../bootstrap');

const limit = Math.min(Math.max(parseInt(process.argv[2], 10) || 10, 1), 200);
const { config, db } = prepare();

const total = db.get('SELECT COUNT(*) AS n FROM reports').n;
const rows = db.all(
  `SELECT public_id, type, status, level, is_sample, created_at, photo_file, client_id, substr(description, 1, 40) AS description
   FROM reports ORDER BY id DESC LIMIT ?`,
  [limit]
);

console.log(`\nDatabase: ${config.dbFile} (${db.driver})`);
console.log(`Reports in the database: ${total}. Showing the newest ${rows.length}:\n`);
for (const r of rows) {
  const owner = r.client_id ? r.client_id.slice(0, 8) + '…' : '(sample)';
  console.log(
    `${r.public_id.padEnd(8)} ${r.type.padEnd(6)} ${r.status.padEnd(17)} ${r.level.padEnd(3)} ${r.created_at.slice(0, 19)}Z  device ${owner.padEnd(10)} photo ${r.photo_file ? 'yes' : 'no '}  "${r.description}"`
  );
}
console.log('');
db.close();
