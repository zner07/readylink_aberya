/* READYLINK frontend settings. Loaded before js/api.js.

   API_MODE decides where reports come from:
     'auto'    (default) Ask the server: GET /api/health. If the READYLINK server answers, use it ("server mode").
               If not (GitHub Pages, a file opened from disk, VS Code Live Server ...), use the built-in demo data ("demo mode").
               So the same files work everywhere, and the page served by Express uses the database by itself.
     'server'  Always use the server. If it cannot be reached, the app shows an error instead of quietly using demo data.
     'demo'    Never contact a server. Reports live in this browser only (the original behavior).

   API_BASE            '' = same origin as the page (what you want when Express serves the frontend).
                       Only set it if the API lives somewhere else (that server would then need CORS, which is not set up).
   PROBE_TIMEOUT_MS    how long 'auto' waits for the health check before choosing demo mode.
   REQUEST_TIMEOUT_MS  how long a report request may take before the app gives up (photos can be large).

   Values already set in window.READYLINK_CONFIG before this file runs are kept (handy for tests).
   There are no secrets here. Anything in this file is public. */
window.READYLINK_CONFIG = Object.assign(
  { API_MODE: 'auto', API_BASE: '', PROBE_TIMEOUT_MS: 2000, REQUEST_TIMEOUT_MS: 20000 },
  window.READYLINK_CONFIG || {}
);
