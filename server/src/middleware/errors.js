'use strict';
/* Error handling for the API.
   Every API error uses ONE shape, which later phases and the frontend adapter rely on:
     { "error": { "code": "VALIDATION", "message": "Readable text.", "fields": { ... } } }
   Internal details (stack traces, file paths) are never sent to the client. */

class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/* Turns any thrown value into { status, body }. Pure function (unit-tested without Express). */
function errorBody(err) {
  if (err instanceof AppError) {
    const error = { code: err.code, message: err.message };
    if (err.fields) error.fields = err.fields;
    return { status: err.status, body: { error } };
  }
  // Errors raised by Express / the JSON body parser carry a status and often a type.
  if (err && err.type === 'entity.parse.failed') {
    return { status: 400, body: { error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } } };
  }
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return { status: 413, body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' } } };
  }
  if (err && err.status === 415) {
    return { status: 415, body: { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'The request type is not supported.' } } };
  }
  if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return { status: err.status, body: { error: { code: 'BAD_REQUEST', message: 'The request could not be understood.' } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } } };
}

/* Router fallback: any /api path that has no handler. */
function apiNotFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'No such API route.'));
}

/* Express error handler (4 arguments). */
function errorHandler() {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const { status, body } = errorBody(err);
    if (status === 500) console.error('[server error]', err && err.message ? err.message : err);
    res.status(status).json(body);
  };
}

module.exports = { AppError, errorBody, apiNotFound, errorHandler };
