'use strict';
/* READYLINK Express app (Phase 1: Phase 0 + the reports API and photo serving).

   What it does:
     GET /api/health        -> { ok: true, ... }
     /api/reports ...       -> reports API (Phase 1, only when a database is passed in)
     GET /uploads/<name>    -> uploaded photos (only server-generated names)
     GET /api/<anything>    -> 404 JSON error
     GET / , /index.html    -> the EXISTING frontend index.html, unchanged
     GET /css/*, /js/*, /data/* -> the EXISTING frontend files, unchanged
     everything else        -> 404 (server/, .env, .git, README.md ... are never served)

   The frontend files are served exactly as they are on disk. The frontend keeps running in demo mode
   (js/api.js is not touched until Phase 2). Because the page and the API share one origin, no CORS is needed. */
const path = require('node:path');
const express = require('express');
const { classify, PUBLIC_DIRS } = require('./staticPolicy');
const { apiNotFound, errorHandler } = require('./middleware/errors');
const { createReportHandlers, createReportsRouter } = require('./routes/reports');
const { createUploadsHandler } = require('./routes/uploads');

/* deps (optional): { db, geo }. When both are given the reports API and /uploads are enabled. */
function createApp(config, deps = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Small, safe default headers. A Content-Security-Policy is planned for a later phase
  // (the frontend uses Google Fonts and inline styles, so it needs to be configured carefully).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // ---- API ---------------------------------------------------------------------------------
  const api = express.Router();
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); // API answers should never be served from a stale cache
    next();
  });
  api.get('/health', (req, res) => {
    const body = { ok: true, service: 'readylink-api', time: new Date().toISOString() };
    if (deps.db) {
      try {
        deps.db.get('SELECT 1 AS ok');
        body.database = { ok: true, driver: deps.db.driver };
      } catch (err) {
        body.ok = false;
        body.database = { ok: false };
        return res.status(503).json(body);
      }
    }
    return res.json(body);
  });
  if (deps.db && deps.geo) {
    api.use('/reports', createReportsRouter(createReportHandlers({ db: deps.db, geo: deps.geo, config }), config));
  }
  api.use(apiNotFound);
  app.use('/api', api);

  // ---- Uploaded photos (only files with server-generated names) ----------------------------
  if (deps.db) app.use('/uploads', createUploadsHandler(config));

  // ---- Existing frontend (unchanged files) -------------------------------------------------
  const cacheControl = config.isProduction ? 'public, max-age=300' : 'no-cache';

  app.get(['/', '/index.html'], (req, res, next) => {
    res.sendFile('index.html', { root: config.frontendDir, dotfiles: 'deny', cacheControl: false, headers: { 'Cache-Control': cacheControl } }, (err) => {
      if (err) next(err);
    });
  });

  // Defense in depth: staticPolicy rejects suspicious paths first, express.static is also locked to one folder.
  const staticGuard = (req, res, next) => {
    if (classify(req.originalUrl).kind === 'asset') return next();
    res.status(404).type('text/plain').send('Not found');
  };
  for (const dir of PUBLIC_DIRS) {
    app.use(
      '/' + dir,
      staticGuard,
      express.static(path.join(config.frontendDir, dir), {
        index: false,
        dotfiles: 'ignore',
        fallthrough: true,
        setHeaders: (res) => res.setHeader('Cache-Control', cacheControl),
      })
    );
  }

  app.use((req, res) => res.status(404).type('text/plain').send('Not found'));
  app.use(errorHandler());
  return app;
}

module.exports = { createApp };
