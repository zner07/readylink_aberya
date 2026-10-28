'use strict';
/* GET /uploads/<uuid>.<jpg|png|webp>

   Only names that this server could have generated are served (random UUID + a fixed extension).
   Anything else is a plain 404: no directory listing, no dotfiles, no guessing, no path tricks.
   Headers: the content type comes from the file extension WE chose, "nosniff" stops the browser from guessing,
   and a strict Content-Security-Policy makes the file harmless even if it were opened as a page. */
const { UPLOAD_NAME, MIME_BY_EXT } = require('../services/photoService');

function createUploadsHandler(config) {
  const notFound = (res) => res.status(404).type('text/plain').send('Not found');

  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res);
    const name = String(req.path || '').slice(1); // path is relative to the /uploads mount, for example "/<uuid>.jpg"
    if (!UPLOAD_NAME.test(name)) return notFound(res);
    const ext = name.slice(name.lastIndexOf('.') + 1);

    return res.sendFile(
      name,
      {
        root: config.uploadsDir,
        dotfiles: 'deny',
        cacheControl: false,
        headers: {
          'Content-Type': MIME_BY_EXT[ext],
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          // The file name is unique and the content never changes, so browsers may keep it.
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      },
      (err) => {
        if (!err) return undefined;
        if (err.code === 'ENOENT' || err.status === 404) return notFound(res);
        return next(err);
      }
    );
  };
}

module.exports = { createUploadsHandler };
