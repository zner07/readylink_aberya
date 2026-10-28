'use strict';
/* Photo handling. Pure Node, no packages.

   The frontend already holds the photo as a data URL ("data:image/jpeg;base64,..."), so the API accepts exactly that
   inside the JSON body. We never trust what the client says about the file:
     1. The text must be a base64 data URL for jpeg, png or webp, and the size is checked BEFORE decoding.
     2. The decoded bytes must really start like a JPEG, PNG or WEBP file (magic bytes) and look complete.
     3. The type found in the bytes must match the type the client declared.
     4. The stored file name is a random UUID made here, and the extension comes from the DETECTED type.
        The client's file name and extension are never used.
   Files are later served with a fixed content type, "nosniff" and a restrictive CSP (see routes/uploads.js).

   Not checked in Phase 1: image dimensions and deep image decoding. The size limit is the protection against huge files. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MIME_TO_TYPE = Object.freeze({
  'image/jpeg': { type: 'jpeg', ext: 'jpg' },
  'image/png': { type: 'png', ext: 'png' },
  'image/webp': { type: 'webp', ext: 'webp' },
});
const MIME_BY_EXT = Object.freeze({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/;
const UPLOAD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* The message is safe to show to the user (it ends up in the "photo" field error). */
class PhotoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PhotoError';
  }
}

/* Looks at the first bytes only. Returns 'jpeg', 'png', 'webp' or null. */
function detectImageType(buf) {
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/* Cheap check that the file is not cut off. */
function looksComplete(type, buf) {
  if (type === 'jpeg') return buf.lastIndexOf(Buffer.from([0xff, 0xd9])) >= 4; // end-of-image marker
  if (type === 'png') return buf.length >= 33 && buf.toString('latin1', buf.length - 8, buf.length - 4) === 'IEND';
  if (type === 'webp') return buf.length >= 20 && buf.readUInt32LE(4) + 8 <= buf.length;
  return false;
}

/* dataUrl -> { buffer, type, ext, mime }. Throws PhotoError with a readable message. */
function decodePhoto(dataUrl, { maxBytes }) {
  if (typeof dataUrl !== 'string') throw new PhotoError('The photo must be sent as a data URL string.');
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new PhotoError('The photo must be a JPEG, PNG or WEBP image sent as a base64 data URL.');
  const [, declaredMime, base64] = match;
  if (base64.length === 0 || base64.length % 4 !== 0) throw new PhotoError('The photo data is not valid.');

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const size = (base64.length / 4) * 3 - padding;
  if (size > maxBytes) {
    throw new PhotoError(`The photo is too large. The limit is ${Math.round((maxBytes / (1024 * 1024)) * 10) / 10} MB.`);
  }

  const buffer = Buffer.from(base64, 'base64');
  const type = detectImageType(buffer);
  if (!type) throw new PhotoError('The file is not a JPEG, PNG or WEBP image.');
  if (type !== MIME_TO_TYPE[declaredMime].type) throw new PhotoError('The photo content does not match its declared type.');
  if (!looksComplete(type, buffer)) throw new PhotoError('The photo file looks damaged or incomplete.');
  const { ext } = MIME_TO_TYPE[declaredMime];
  return { buffer, type, ext, mime: declaredMime };
}

/* Writes the file with a new random name. Returns the file name (not a path). */
function savePhoto(uploadsDir, photo) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `${crypto.randomUUID()}.${photo.ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), photo.buffer, { flag: 'wx', mode: 0o644 });
  return name;
}

/* Deletes an uploaded file. Only accepts names that this server could have generated. */
function removePhoto(uploadsDir, name) {
  if (typeof name === 'string' && UPLOAD_NAME.test(name)) fs.rmSync(path.join(uploadsDir, name), { force: true });
}

const photoUrl = (name) => (name ? `/uploads/${name}` : null);

module.exports = { decodePhoto, savePhoto, removePhoto, detectImageType, looksComplete, photoUrl, PhotoError, UPLOAD_NAME, MIME_BY_EXT };
