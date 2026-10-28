'use strict';
/* HTTP layer for /api/reports. The handlers are plain functions, so they can be tested without a running server.
   The real work happens in src/services/*.

     GET  /api/reports            all reports, newest first          (add ?mine=1 to get only this device's reports)
     GET  /api/reports/:id        one report, or 404
     POST /api/reports            create a report                    (JSON body, header X-Client-Id required)

   About X-Client-Id: an anonymous id the browser makes once and keeps. It only LABELS reports as "mine".
   It is not a password and does not protect anything. Phase 1 has nothing that needs protecting by it:
   there is no edit or delete, and the id is never returned by the API. Admin features come with real login in Phase 3. */
const { AppError } = require('../middleware/errors');
const { validateNewReport, parseClientId } = require('../services/reportValidation');
const { createReport, listReports, getReport } = require('../services/reportService');

function createReportHandlers({ db, geo, config, now }) {
  const deps = { geo, uploadsDir: config.uploadsDir, now };
  const client = (req) => parseClientId(req.headers['x-client-id']);

  return {
    list(req, res, next) {
      try {
        const cid = client(req);
        const mineOnly = Boolean(req.query) && (req.query.mine === '1' || req.query.mine === 'true');
        if (mineOnly && cid.state !== 'ok') {
          throw new AppError(400, 'CLIENT_ID_REQUIRED', 'Send a valid X-Client-Id header to list your own reports.');
        }
        const reports = listReports(db, deps, { clientId: cid.state === 'ok' ? cid.id : null, mineOnly });
        res.json({ reports });
      } catch (err) {
        next(err);
      }
    },

    getOne(req, res, next) {
      try {
        const cid = client(req);
        const report = getReport(db, deps, req.params.id, cid.state === 'ok' ? cid.id : null);
        if (!report) throw new AppError(404, 'NOT_FOUND', 'No such report.');
        res.json({ report });
      } catch (err) {
        next(err);
      }
    },

    create(req, res, next) {
      try {
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) {
          throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the report as JSON (Content-Type: application/json).');
        }
        const cid = client(req);
        if (cid.state === 'missing') throw new AppError(400, 'CLIENT_ID_REQUIRED', 'Send your anonymous device id in the X-Client-Id header.');
        if (cid.state === 'invalid') throw new AppError(400, 'INVALID_CLIENT_ID', 'X-Client-Id must be 16 to 64 letters, numbers, "-" or "_".');

        const { value, errors } = validateNewReport(req.body, { geo, maxPhotoBytes: config.maxPhotoBytes });
        if (!value) throw new AppError(400, 'VALIDATION', 'Please check the report and try again.', errors);

        const report = createReport(db, deps, value, cid.id);
        res.status(201).set('Location', `/api/reports/${report.id}`).json({ report });
      } catch (err) {
        next(err);
      }
    },
  };
}

/* Needs Express. Kept separate so the handlers above can be tested without it. */
function createReportsRouter(handlers, config) {
  const express = require('express');
  const router = express.Router();
  router.get('/', handlers.list);
  router.get('/:id', handlers.getOne);
  // The photo travels inside the JSON as base64, so this route allows a bigger body than a normal API call.
  router.post('/', express.json({ limit: config.jsonLimitBytes, strict: true }), handlers.create);
  return router;
}

module.exports = { createReportHandlers, createReportsRouter };
