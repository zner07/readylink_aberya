'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateNewReport, parseClientId, HAZARD_TYPES, LEVELS, STATUSES, MAX_DESC_LENGTH, DEFAULT_DESC } = require('../../src/services/reportValidation');
const images = require('../helpers/images');
const { geo } = require('../helpers/env');

const deps = { geo, maxPhotoBytes: 5 * 1024 * 1024 };
const good = (extra = {}) => ({ type: 'drain', x: 500, y: 300, desc: 'Blocked drain near the school.', level: 'mod', ...extra });
const check = (body) => validateNewReport(body, deps);

test('the allowed values are exactly the ones the frontend uses', () => {
  assert.deepEqual([...HAZARD_TYPES], ['tree', 'drain', 'road', 'pole', 'flood', 'slope', 'river', 'wall']);
  assert.deepEqual([...LEVELS], ['hi', 'mod', 'lo']);
  assert.deepEqual([...STATUSES], ['Pending', 'Verified', 'Under monitoring', 'Resolved']);
});

test('a valid report passes and gets lat/lng from the map units', () => {
  const { value, errors } = check(good());
  assert.deepEqual(errors, {});
  assert.equal(value.type, 'drain');
  assert.equal(value.x, 500);
  assert.equal(value.y, 300);
  assert.ok(value.lat > 13.77 && value.lat < 13.80);
  assert.ok(value.lng > 121.05 && value.lng < 121.08);
  assert.equal(value.photo, null);
});

test('every one of the 8 hazard types is accepted', () => {
  for (const type of HAZARD_TYPES) assert.deepEqual(check(good({ type })).errors, {}, type);
});

test('unknown, wrongly cased or non-text hazard types are rejected', () => {
  for (const type of ['Tree', 'TREE', 'fallen tree', 'bridge', '', ' tree', 'tree ', null, undefined, 5, ['tree'], {}]) {
    assert.match(check(good({ type })).errors.type, /Choose one of/, String(type));
  }
});

test('x and y must be real numbers', () => {
  for (const [x, y] of [['500', 300], [500, '300'], [null, 300], [500, undefined], [NaN, 300], [500, Infinity], [{}, []], [true, false]]) {
    assert.match(check(good({ x, y })).errors.location, /must be numbers/, `${x},${y}`);
  }
  assert.match(check({ type: 'tree' }).errors.location, /must be numbers/);
});

test('coordinates outside the map rectangle are rejected', () => {
  for (const [x, y] of [[-1, 300], [1001, 300], [500, -1], [500, 612]]) {
    assert.match(check(good({ x, y })).errors.location, /outside the map/, `${x},${y}`);
  }
});

test('coordinates inside the map but outside Brgy. Alangilan are rejected', () => {
  assert.match(check(good({ x: 5, y: 5 })).errors.location, /outside Brgy\. Alangilan/);
  assert.match(check(good({ x: 990, y: 600 })).errors.location, /outside Brgy\. Alangilan/);
});

test('description is optional, trimmed, cleaned and limited to 240 characters', () => {
  assert.equal(check(good({ desc: undefined })).value.desc, DEFAULT_DESC);
  assert.equal(check(good({ desc: null })).value.desc, DEFAULT_DESC);
  assert.equal(check(good({ desc: '   ' })).value.desc, DEFAULT_DESC);
  assert.equal(check(good({ desc: '  Leaning tree.  ' })).value.desc, 'Leaning tree.');
  assert.equal(check(good({ desc: 'a'.repeat(MAX_DESC_LENGTH) })).errors.desc, undefined);
  assert.match(check(good({ desc: 'a'.repeat(MAX_DESC_LENGTH + 1) })).errors.desc, /240/);
  assert.match(check(good({ desc: 12345 })).errors.desc, /must be text/);
  assert.match(check(good({ desc: { text: 'x' } })).errors.desc, /must be text/);
});

test('control characters are removed, line breaks are kept, and HTML is stored as plain text', () => {
  const cleaned = check(good({ desc: 'Line one\nLine two\u0000\u0007 <b>bold</b>' })).value.desc;
  assert.equal(cleaned, 'Line one\nLine two <b>bold</b>');
});

test('level is optional (defaults to mod) and must be hi, mod or lo', () => {
  assert.equal(check(good({ level: undefined })).value.level, 'mod');
  for (const level of LEVELS) assert.equal(check(good({ level })).value.level, level);
  for (const level of ['High', 'high', 'urgent', 5, [], {}]) assert.match(check(good({ level })).errors.level, /Use one of/, String(level));
});

test('a valid photo is accepted and decoded', () => {
  const { value, errors } = check(good({ photo: images.dataUrl('png') }));
  assert.deepEqual(errors, {});
  assert.equal(value.photo.type, 'png');
});

test('a bad photo is reported in the photo field', () => {
  assert.match(check(good({ photo: 'not a photo' })).errors.photo, /JPEG, PNG or WEBP/);
  assert.match(check(good({ photo: images.dataUrl('png', 'jpeg') })).errors.photo, /does not match/);
  assert.match(validateNewReport(good({ photo: images.dataUrl('jpeg') }), { geo, maxPhotoBytes: 100 }).errors.photo, /too large/);
});

test('all problems are reported together', () => {
  const { value, errors } = check({ type: 'bridge', x: 'a', y: 1, desc: 1, level: 'x', photo: 'no' });
  assert.equal(value, null);
  assert.deepEqual(Object.keys(errors).sort(), ['desc', 'level', 'location', 'photo', 'type']);
});

test('a body that is not an object is rejected', () => {
  for (const body of [null, undefined, 'text', 5, [], [good()]]) {
    const { value, errors } = check(body);
    assert.equal(value, null);
    assert.ok(errors._body, String(body));
  }
});

test('id, status, mine and client_id sent by the client are ignored', () => {
  const { value } = check(good({ id: 'RL-999', public_id: 'RL-999', status: 'Resolved', st: 'Resolved', mine: true, client_id: 'x', is_sample: 1, ai: 'lo' }));
  assert.deepEqual(Object.keys(value).sort(), ['desc', 'lat', 'level', 'lng', 'photo', 'type', 'x', 'y']);
});

test('parseClientId: valid, missing and invalid headers', () => {
  assert.deepEqual(parseClientId(undefined), { state: 'missing' });
  assert.deepEqual(parseClientId('client-aaaaaaaaaaaaaaaa'), { state: 'ok', id: 'client-aaaaaaaaaaaaaaaa' });
  assert.deepEqual(parseClientId('3281e664-afc8-4af8-bbda-a7784714bd5d'), { state: 'ok', id: '3281e664-afc8-4af8-bbda-a7784714bd5d' });
  for (const bad of ['', 'short', 'x'.repeat(65), 'has space in it 1234', 'quote"quote12345678', '1234567890123456; DROP TABLE reports', ['a'], 5]) {
    assert.equal(parseClientId(bad).state, 'invalid', String(bad));
  }
});
