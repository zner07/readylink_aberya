'use strict';
/* Report business logic: create, list, get. Works with the small db interface from src/db.js. No Express in here.

   Report JSON returned by the API (the same field names the frontend already uses):
     { id, type, x, y, lat, lng, ai, lv, st, date, createdAt, desc, brgy, mine, img, log: [{ t, d, at, n? }] }
   - id         'RL-036'
   - x, y       SVG map units (what the frontend draws), calculated from the stored lat/lng
   - ai / lv    suggested level / current level: 'hi' | 'mod' | 'lo'
   - st         'Pending' | 'Verified' | 'Under monitoring' | 'Resolved'
   - date, d    display text like 'Sep 25' and 'Sep 25, 12:00 PM' (Manila time), for the existing UI
   - createdAt, at   the same moments as ISO 8601 (UTC)
   - mine       true when the X-Client-Id of the request matches the report's anonymous client id
   - img        '/uploads/<uuid>.jpg' or null
   The client id itself is never returned. */
const { savePhoto, removePhoto, photoUrl } = require('./photoService');

const BRGY = 'Brgy. Alangilan';
const DISPLAY_TIMEZONE = 'Asia/Manila';
const MAX_LIST = 500;
const PUBLIC_ID = /^RL-\d{3,}$/;

/* Node's date formatting may use a narrow no-break space before AM/PM. Browsers show a normal space. */
const cleanSpaces = (s) => s.replace(/[\u202f\u00a0]/g, ' ');
const formatDate = (iso) => cleanSpaces(new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: DISPLAY_TIMEZONE }));
const formatStamp = (iso) =>
  cleanSpaces(new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: DISPLAY_TIMEZONE }));

const round2 = (n) => Math.round(n * 100) / 100;

function toApiReport(row, events, clientId, geo) {
  const { x, y } = geo.latLngToXy(row.lat, row.lng);
  return {
    id: row.public_id,
    type: row.type,
    x: round2(x),
    y: round2(y),
    lat: row.lat,
    lng: row.lng,
    ai: row.ai_level,
    lv: row.level,
    st: row.status,
    date: formatDate(row.created_at),
    createdAt: row.created_at,
    desc: row.description,
    brgy: BRGY,
    mine: Boolean(clientId) && row.client_id === clientId,
    img: photoUrl(row.photo_file),
    log: events.map((e) => ({ t: e.text, d: formatStamp(e.created_at), at: e.created_at, ...(e.note ? { n: e.note } : {}) })),
  };
}

function eventsByReport(db, reportIds) {
  const map = new Map(reportIds.map((id) => [id, []]));
  if (!reportIds.length) return map;
  // reportIds are numbers read from our own table, never user input.
  const rows = db.all(`SELECT report_id, text, note, created_at FROM report_events WHERE report_id IN (${reportIds.join(',')}) ORDER BY id`);
  for (const r of rows) map.get(r.report_id).push(r);
  return map;
}

/* Next public id: RL-001, RL-002 ... (always the highest existing number + 1). Call inside a transaction. */
function nextPublicId(db) {
  const row = db.get("SELECT MAX(CAST(SUBSTR(public_id, 4) AS INTEGER)) AS n FROM reports");
  return 'RL-' + String((row.n || 0) + 1).padStart(3, '0');
}

/* value comes from validateNewReport(). Returns the report in API format. */
function createReport(db, { geo, uploadsDir, now = () => new Date() }, value, clientId) {
  const stamp = now().toISOString();
  const photoFile = value.photo ? savePhoto(uploadsDir, value.photo) : null;
  let publicId;
  try {
    publicId = db.transaction(() => {
      const id = nextPublicId(db);
      const { lastInsertRowid } = db.run(
        `INSERT INTO reports (public_id, type, lat, lng, ai_level, level, status, description, photo_file, client_id, is_sample, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, 0, ?, ?)`,
        [id, value.type, value.lat, value.lng, value.level, value.level, value.desc, photoFile, clientId, stamp, stamp]
      );
      // Same texts the frontend demo writes in the timeline.
      db.run('INSERT INTO report_events (report_id, text, created_at) VALUES (?, ?, ?)', [lastInsertRowid, 'Report submitted', stamp]);
      db.run('INSERT INTO report_events (report_id, text, created_at) VALUES (?, ?, ?)', [lastInsertRowid, 'AI-assisted assessment generated (demo)', stamp]);
      return id;
    });
  } catch (err) {
    removePhoto(uploadsDir, photoFile); // do not leave an orphan file behind
    throw err;
  }
  return getReport(db, { geo }, publicId, clientId);
}

/* options: { clientId, mineOnly }. Newest first. */
function listReports(db, { geo }, { clientId = null, mineOnly = false } = {}) {
  const rows = mineOnly
    ? db.all('SELECT * FROM reports WHERE client_id = ? ORDER BY id DESC LIMIT ?', [clientId, MAX_LIST])
    : db.all('SELECT * FROM reports ORDER BY id DESC LIMIT ?', [MAX_LIST]);
  const events = eventsByReport(db, rows.map((r) => r.id));
  return rows.map((r) => toApiReport(r, events.get(r.id), clientId, geo));
}

/* Returns the report or null. A malformed id simply returns null (never reaches SQL). */
function getReport(db, { geo }, publicId, clientId = null) {
  if (typeof publicId !== 'string' || !PUBLIC_ID.test(publicId)) return null;
  const row = db.get('SELECT * FROM reports WHERE public_id = ?', [publicId]);
  if (!row) return null;
  return toApiReport(row, eventsByReport(db, [row.id]).get(row.id), clientId, geo);
}

module.exports = { createReport, listReports, getReport, nextPublicId, formatDate, formatStamp, BRGY, MAX_LIST, PUBLIC_ID };
