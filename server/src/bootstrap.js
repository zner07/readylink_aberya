'use strict';
/* Shared start-up steps for the server and the command-line scripts (db:init, seed):
   load .env, check settings, find the frontend, load the map boundary, open the database.
   If something is wrong it prints a clear message and stops. */
const fs = require('node:fs');
const path = require('node:path');
const { loadEnvFileIfPresent, loadConfig } = require('./config');
const { createGeo } = require('./services/geo');
const { openDatabase } = require('./db');

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function prepare() {
  const loadedEnv = loadEnvFileIfPresent();

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    fail(`Configuration problem: ${err.message}\nCheck server/.env (or your environment variables).`);
  }

  if (!fs.existsSync(path.join(config.frontendDir, 'index.html'))) {
    fail(`Could not find index.html in the frontend folder:\n  ${config.frontendDir}\nRun the server from the repository, or set FRONTEND_DIR in server/.env.`);
  }
  const boundaryFile = path.join(config.frontendDir, 'data', 'alangilan.geojson');
  if (!fs.existsSync(boundaryFile)) fail(`Could not find the map boundary file:\n  ${boundaryFile}`);

  let geo;
  try {
    geo = createGeo(boundaryFile);
  } catch (err) {
    fail(`The map boundary file could not be read:\n  ${err.message}`);
  }

  let db;
  try {
    db = openDatabase(config.dbFile, { driver: config.dbDriver, onFallback: (message) => console.warn(`\n${message}`) });
  } catch (err) {
    fail(`Could not open the database (${config.dbFile}):\n  ${err.message}`);
  }

  return { config, geo, db, loadedEnv };
}

module.exports = { prepare, fail };
