'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { decodePhoto, savePhoto, removePhoto, detectImageType, photoUrl, PhotoError, UPLOAD_NAME } = require('../../src/services/photoService');
const images = require('../helpers/images');
const { tempDir, removeDir } = require('../helpers/env');

const LIMIT = { maxBytes: 5 * 1024 * 1024 };
const rejects = (input, pattern, limit = LIMIT) =>
  assert.throws(() => decodePhoto(input, limit), (err) => err instanceof PhotoError && pattern.test(err.message), `expected ${pattern} for ${String(input).slice(0, 40)}`);

test('real JPEG, PNG and WEBP photos are accepted and identified by their content', () => {
  for (const type of ['jpeg', 'png', 'webp']) {
    const photo = decodePhoto(images.dataUrl(type), LIMIT);
    assert.equal(photo.type, type);
    assert.equal(photo.ext, type === 'jpeg' ? 'jpg' : type);
    assert.equal(photo.mime, `image/${type}`);
    assert.ok(photo.buffer.equals(images.buffer(type)), 'bytes must be unchanged');
  }
});

test('detectImageType reads magic bytes only', () => {
  assert.equal(detectImageType(images.buffer('jpeg')), 'jpeg');
  assert.equal(detectImageType(images.buffer('png')), 'png');
  assert.equal(detectImageType(images.buffer('webp')), 'webp');
  assert.equal(detectImageType(Buffer.from('<html><script>alert(1)</script>')), null);
  assert.equal(detectImageType(Buffer.from('GIF89a......')), null);
  assert.equal(detectImageType(Buffer.alloc(0)), null);
});

test('a file that is not an image is rejected even when it claims to be one', () => {
  rejects(images.dataUrlFromBuffer(Buffer.from('<html><script>alert(1)</script></html>'), 'image/jpeg'), /not a JPEG, PNG or WEBP/);
  rejects(images.dataUrlFromBuffer(Buffer.from('plain text pretending to be a photo'), 'image/png'), /not a JPEG, PNG or WEBP/);
  rejects(images.dataUrlFromBuffer(Buffer.from('GIF89a' + 'x'.repeat(40)), 'image/jpeg'), /not a JPEG, PNG or WEBP/);
});

test('the declared type must match the real content', () => {
  rejects(images.dataUrl('png', 'jpeg'), /does not match/);
  rejects(images.dataUrl('jpeg', 'webp'), /does not match/);
  rejects(images.dataUrl('webp', 'png'), /does not match/);
});

test('only jpeg, png and webp are allowed as declared types (svg, gif, html, pdf are not)', () => {
  for (const mime of ['image/svg+xml', 'image/gif', 'text/html', 'application/pdf', 'image/jpg', 'image/bmp']) {
    rejects(`data:${mime};base64,${images.buffer('jpeg').toString('base64')}`, /must be a JPEG, PNG or WEBP/);
  }
});

test('input that is not a base64 data URL is rejected', () => {
  for (const bad of [null, undefined, 42, {}, [], '', 'hello', '/uploads/x.jpg', 'data:image/jpeg;base64,', 'data:image/jpeg;base64,!!!!', 'data:image/jpeg,AAAA', 'data:image/jpeg;base64,AAA']) {
    assert.throws(() => decodePhoto(bad, LIMIT), PhotoError, String(bad));
  }
});

test('size limit is enforced before the file is decoded', () => {
  const big = Buffer.concat([images.buffer('jpeg').subarray(0, 100), Buffer.alloc(3000, 1), images.buffer('jpeg').subarray(100)]);
  rejects(images.dataUrlFromBuffer(big, 'image/jpeg'), /too large/, { maxBytes: 2000 });
  // the same file is fine with a bigger limit
  assert.equal(decodePhoto(images.dataUrlFromBuffer(big, 'image/jpeg'), { maxBytes: 10000 }).type, 'jpeg');
});

test('an exactly-at-the-limit photo is accepted, one byte more is not', () => {
  const size = images.buffer('png').length;
  assert.equal(decodePhoto(images.dataUrl('png'), { maxBytes: size }).type, 'png');
  rejects(images.dataUrl('png'), /too large/, { maxBytes: size - 1 });
});

test('truncated or damaged files are rejected', () => {
  const jpeg = images.buffer('jpeg');
  rejects(images.dataUrlFromBuffer(jpeg.subarray(0, jpeg.length - 40), 'image/jpeg'), /damaged or incomplete/);
  const png = images.buffer('png');
  rejects(images.dataUrlFromBuffer(png.subarray(0, png.length - 20), 'image/png'), /damaged or incomplete/);
  const webp = images.buffer('webp');
  rejects(images.dataUrlFromBuffer(webp.subarray(0, webp.length - 30), 'image/webp'), /damaged or incomplete/);
});

test('a script hidden after JPEG magic bytes is not accepted as a photo', () => {
  const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('<script>alert(1)</script>')]);
  rejects(images.dataUrlFromBuffer(fake, 'image/jpeg'), /damaged or incomplete/);
});

test('savePhoto stores the file under a random UUID name, ignoring anything the client called it', () => {
  const dir = tempDir();
  try {
    const photo = decodePhoto(images.dataUrl('jpeg'), LIMIT);
    const a = savePhoto(path.join(dir, 'nested', 'uploads'), photo); // creates missing folders
    const b = savePhoto(path.join(dir, 'nested', 'uploads'), photo);
    assert.match(a, UPLOAD_NAME);
    assert.match(a, /\.jpg$/);
    assert.notEqual(a, b);
    assert.ok(fs.readFileSync(path.join(dir, 'nested', 'uploads', a)).equals(images.buffer('jpeg')));
    assert.equal(photoUrl(a), `/uploads/${a}`);
    assert.equal(photoUrl(null), null);
  } finally {
    removeDir(dir);
  }
});

test('the extension comes from the detected type', () => {
  const dir = tempDir();
  try {
    for (const [type, ext] of [['jpeg', 'jpg'], ['png', 'png'], ['webp', 'webp']]) {
      assert.ok(savePhoto(dir, decodePhoto(images.dataUrl(type), LIMIT)).endsWith(`.${ext}`));
    }
  } finally {
    removeDir(dir);
  }
});

test('removePhoto deletes our files and refuses any other name', () => {
  const dir = tempDir();
  try {
    const name = savePhoto(dir, decodePhoto(images.dataUrl('png'), LIMIT));
    const outside = path.join(dir, 'keep.txt');
    fs.writeFileSync(outside, 'keep me');
    removePhoto(dir, '../keep.txt');
    removePhoto(dir, 'keep.txt');
    removePhoto(dir, null);
    assert.ok(fs.existsSync(outside), 'unrelated files must survive');
    removePhoto(dir, name);
    assert.equal(fs.existsSync(path.join(dir, name)), false);
    removePhoto(dir, name); // already gone: no error
  } finally {
    removeDir(dir);
  }
});

test('UPLOAD_NAME only matches server-generated names', () => {
  assert.match('3281e664-afc8-4af8-bbda-a7784714bd5d.jpg', UPLOAD_NAME);
  for (const bad of ['../3281e664-afc8-4af8-bbda-a7784714bd5d.jpg', '3281e664-afc8-4af8-bbda-a7784714bd5d.php', '3281e664-afc8-4af8-bbda-a7784714bd5d.jpg/x', 'photo.jpg', '.env', '', '3281e664-afc8-4af8-bbda-a7784714bd5d.JPG', '3281e664-afc8-4af8-bbda-a7784714bd5d.jpg\0']) {
    assert.doesNotMatch(bad, UPLOAD_NAME, bad);
  }
});
