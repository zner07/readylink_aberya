'use strict';
/* Which URL paths may Express serve from the repository root?

   The frontend lives in the repository root, next to the server/ folder (and later .env, the database and uploads).
   So the server must never serve "everything under the root". It serves ONLY:
     "/" and "/index.html"        -> index.html
     "/css/...", "/js/...", "/data/..." -> the existing frontend assets

   classify() is a pure function so it can be unit-tested without Express.
   It rejects anything that looks like path trickery BEFORE the file system is touched:
   encoded dots/slashes, "..", backslashes, NUL bytes, empty segments and dotfiles. */
const PUBLIC_DIRS = Object.freeze(['css', 'js', 'data']);
const BAD_ENCODINGS = /%2e|%2f|%5c|%00/i;

/* kind: 'index' (serve index.html) | 'asset' (let express.static serve it) | 'other' (not part of the frontend) | 'deny' (suspicious) */
function classify(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) return { kind: 'deny', reason: 'not an absolute path' };
  const pathOnly = rawPath.split(/[?#]/, 1)[0];
  if (pathOnly.includes('\0') || pathOnly.includes('\\') || BAD_ENCODINGS.test(pathOnly)) {
    return { kind: 'deny', reason: 'encoded or unsafe characters' };
  }
  if (pathOnly === '/' || pathOnly === '/index.html') return { kind: 'index' };
  const segments = pathOnly.slice(1).split('/');
  if (segments.some((s) => s === '')) return { kind: 'deny', reason: 'empty path segment' };
  if (segments.some((s) => s.startsWith('.'))) return { kind: 'deny', reason: 'dot segment or dotfile' };
  if (PUBLIC_DIRS.includes(segments[0]) && segments.length >= 2) return { kind: 'asset' };
  return { kind: 'other', reason: 'not part of the public frontend' };
}

const isServable = (rawPath) => ['index', 'asset'].includes(classify(rawPath).kind);

module.exports = { classify, isServable, PUBLIC_DIRS };
