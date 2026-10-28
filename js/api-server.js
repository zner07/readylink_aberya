/* SERVER API CLIENT (Phase 2).

   Talks to the READYLINK Express server. js/api.js calls these functions when API.mode is 'server'.
   Everything that touches the network lives here, so the demo code in api.js stays untouched and readable.

   What is connected in Phase 2:      GET /api/reports, GET /api/reports?mine=1, POST /api/reports (with the photo)
   Still demo (later phases):          AI analysis, priority list, admin login, status changes, the offline queue

   Every request sends the header  X-Client-Id  (an anonymous id made once and kept in localStorage).
   It only LABELS reports as "mine". It is not a password, and nothing secret is stored or sent from the browser.

   Errors are thrown as ApiError. Its  .userMessage  is plain text that is safe to show in a toast or an error box. */
const ServerAPI = (() => {
  const CLIENT_ID_KEY = 'readylink-client-id'; // not under the demo keys, so "Reset demo data" never changes it
  const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/; // the same rule the server enforces
  const FIELD_LABELS = { type: 'Hazard type', location: 'Location', desc: 'Description', level: 'Risk level', photo: 'Photo' };

  class ApiError extends Error {
    constructor(message, { status = 0, code = '', fields = null, userMessage } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status; // HTTP status, 0 when the server could not be reached
      this.code = code; // for example VALIDATION, NOT_FOUND
      this.fields = fields; // field-by-field messages for VALIDATION
      this.userMessage = userMessage || message;
    }
  }

  const cfg = () => window.READYLINK_CONFIG || {};
  const base = () => String(cfg().API_BASE || '').replace(/\/+$/, '');

  /* ---- anonymous client id ------------------------------------------------------------------ */
  let memoryId = null; // used when localStorage is blocked (some private modes)
  function newClientId() {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
    else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return 'c' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  function clientId() {
    try {
      const saved = localStorage.getItem(CLIENT_ID_KEY);
      if (saved && CLIENT_ID_PATTERN.test(saved)) return saved;
      const id = newClientId();
      localStorage.setItem(CLIENT_ID_KEY, id);
      return id;
    } catch (err) {
      if (!memoryId) memoryId = newClientId();
      return memoryId;
    }
  }

  /* ---- friendly messages --------------------------------------------------------------------- */
  const UNREACHABLE = "Can't reach the READYLINK server. Check that it is running, then try again.";
  function friendlyMessage(status, error) {
    if (status === 400 && error && error.code === 'VALIDATION' && error.fields) {
      const parts = Object.entries(error.fields).map(([k, v]) => `${FIELD_LABELS[k] || k}: ${v}`);
      return `Please check the report. ${parts.join(' ')}`;
    }
    if (status === 413) return 'That report is too large to send. Try a smaller photo.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status >= 500) return 'The server had a problem. Please try again in a moment.';
    return (error && error.message) || 'The server did not accept the request.';
  }

  /* ---- one request ---------------------------------------------------------------------------- */
  async function request(method, path, { body, timeoutMs } = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || cfg().REQUEST_TIMEOUT_MS || 20000) : null;
    try {
      let res;
      try {
        res = await fetch(base() + path, {
          method,
          headers: { Accept: 'application/json', 'X-Client-Id': clientId(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          cache: 'no-store',
          signal: controller ? controller.signal : undefined,
        });
      } catch (err) {
        const timedOut = controller && controller.signal.aborted;
        throw new ApiError('network error', { userMessage: timedOut ? 'The server took too long to answer. Please try again.' : UNREACHABLE });
      }

      let data = null;
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch (err) {
        data = null; // not JSON: handled below
      }

      if (!res.ok) {
        const error = data && data.error ? data.error : null;
        throw new ApiError((error && error.message) || `HTTP ${res.status}`, { status: res.status, code: error ? error.code : '', fields: error ? error.fields : null, userMessage: friendlyMessage(res.status, error) });
      }
      if (!data || typeof data !== 'object') {
        throw new ApiError('unexpected answer', { status: res.status, userMessage: 'The server sent an answer the app could not read. Please try again.' });
      }
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---- server report -> the report object the UI already uses -------------------------------- */
  // The server uses the same field names (id, type, x, y, ai, lv, st, date, desc, brgy, mine, img, log).
  // Only the photo URL needs the API base when the API is not on the same origin.
  const toUiReport = (r) => ({ ...r, img: r.img ? base() + r.img : null, log: (r.log || []).map((e) => ({ ...e })) });

  function reportList(data) {
    if (!Array.isArray(data.reports)) throw new ApiError('unexpected answer', { userMessage: 'The server sent an answer the app could not read. Please try again.' });
    return data.reports.map(toUiReport);
  }

  /* ---- public functions ----------------------------------------------------------------------- */

  /* Is a READYLINK server answering at API_BASE? Never throws. Used by API_MODE 'auto'. */
  async function probe() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), cfg().PROBE_TIMEOUT_MS || 2000) : null;
    try {
      const res = await fetch(base() + '/api/health', { cache: 'no-store', signal: controller ? controller.signal : undefined });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data && data.ok === true && data.service === 'readylink-api');
    } catch (err) {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* GET /api/reports : everything for the public map, newest first. */
  const listReports = async () => reportList(await request('GET', '/api/reports'));

  /* GET /api/reports?mine=1 : only the reports sent from this browser (same X-Client-Id). */
  const listMyReports = async () => reportList(await request('GET', '/api/reports?mine=1'));

  /* POST /api/reports. draft = the wizard draft { x, y, desc, img (data URL or null) }, analysis = { t, lv }.
     The photo goes as the same data URL the wizard already holds. A sample photo has no data URL, so nothing is sent for it.
     TODO(ai): analysis.lv is the demo result. Once the server decides the level itself, stop sending it. */
  async function submitReport(draft, analysis) {
    const body = { type: analysis.t, x: draft.x, y: draft.y, desc: draft.desc || '', level: analysis.lv };
    if (draft.img) body.photo = draft.img;
    const data = await request('POST', '/api/reports', { body });
    if (!data.report) throw new ApiError('unexpected answer', { userMessage: 'The server sent an answer the app could not read. Please try again.' });
    return toUiReport(data.report);
  }

  return { probe, listReports, listMyReports, submitReport, clientId, toUiReport, ApiError };
})();
