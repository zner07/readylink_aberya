'use strict';
/* npm run db:init   Creates the database file and tables if they do not exist yet. Safe to run again. */
const { prepare } = require('../bootstrap');

const { config, db } = prepare();
const count = db.get('SELECT COUNT(*) AS n FROM reports').n;
console.log(`\nDatabase ready (${db.driver}).\n  File:    ${config.dbFile}\n  Reports: ${count}\n`);
db.close();
