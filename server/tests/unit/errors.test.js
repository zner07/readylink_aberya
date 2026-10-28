'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AppError, errorBody, apiNotFound, errorHandler } = require('../../src/middleware/errors');

/* A tiny fake of the Express response object, enough for the error handler. */
function fakeRes() {
  return {
    headersSent: false,
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('AppError becomes the standard { error: { code, message } } body', () => {
  const { status, body } = errorBody(new AppError(404, 'NOT_FOUND', 'No such report.'));
  assert.equal(status, 404);
  assert.deepEqual(body, { error: { code: 'NOT_FOUND', message: 'No such report.' } });
});

test('AppError can carry field-level details', () => {
  const { body } = errorBody(new AppError(400, 'VALIDATION', 'Please check the form.', { type: 'Unknown hazard type.' }));
  assert.deepEqual(body.error.fields, { type: 'Unknown hazard type.' });
});

test('client errors raised by Express keep their 4xx status but a generic message', () => {
  const { status, body } = errorBody(Object.assign(new Error('Unexpected token } in JSON at position 5'), { status: 400 }));
  assert.equal(status, 400);
  assert.equal(body.error.code, 'BAD_REQUEST');
  assert.doesNotMatch(JSON.stringify(body), /Unexpected token/);
});

test('unexpected errors become a generic 500 and never leak details', () => {
  const { status, body } = errorBody(new Error('ENOENT: secret/path/to/file.db'));
  assert.equal(status, 500);
  assert.equal(body.error.code, 'INTERNAL');
  assert.doesNotMatch(JSON.stringify(body), /secret|ENOENT|file\.db/);
});

test('non-Error values are handled too', () => {
  assert.equal(errorBody('boom').status, 500);
  assert.equal(errorBody(undefined).status, 500);
});

test('apiNotFound passes a 404 AppError to the next handler', () => {
  let received;
  apiNotFound({}, {}, (err) => { received = err; });
  assert.ok(received instanceof AppError);
  assert.equal(received.status, 404);
  assert.equal(received.code, 'NOT_FOUND');
});

test('errorHandler writes the JSON body with the right status', () => {
  const res = fakeRes();
  errorHandler()(new AppError(403, 'FORBIDDEN', 'Admins only.'), {}, res, () => assert.fail('next must not be called'));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: { code: 'FORBIDDEN', message: 'Admins only.' } });
});

test('errorHandler logs 500s on the server only, and keeps the response generic', () => {
  const res = fakeRes();
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    errorHandler()(new Error('database exploded'), {}, res, () => {});
  } finally {
    console.error = original;
  }
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /exploded/);
  assert.match(logged.join('\n'), /database exploded/);
});

test('errorHandler defers to Express when the response was already started', () => {
  const res = fakeRes();
  res.headersSent = true;
  let passed;
  errorHandler()(new Error('late'), {}, res, (err) => { passed = err; });
  assert.equal(passed.message, 'late');
  assert.equal(res.statusCode, null);
});

test('malformed JSON from the body parser becomes INVALID_JSON without leaking the parser message', () => {
  const { status, body } = errorBody(Object.assign(new SyntaxError('Unexpected token } in JSON at position 9'), { status: 400, type: 'entity.parse.failed' }));
  assert.equal(status, 400);
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.doesNotMatch(JSON.stringify(body), /Unexpected token|position/);
});

test('a request that is too large becomes 413 PAYLOAD_TOO_LARGE', () => {
  for (const err of [Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' }), Object.assign(new Error('x'), { status: 413 })]) {
    const { status, body } = errorBody(err);
    assert.equal(status, 413);
    assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');
  }
});

test('an unsupported media type becomes 415', () => {
  const { status, body } = errorBody(Object.assign(new Error('unsupported charset'), { status: 415 }));
  assert.equal(status, 415);
  assert.equal(body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
});
