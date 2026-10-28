# READYLINK server (Phase 2: the frontend uses the reports API)

Node.js + Express backend for READYLINK.

## What works in Phase 1
- A SQLite database for hazard reports, created automatically (`server/data/readylink.db`, never committed).
- Three endpoints: `GET /api/reports`, `GET /api/reports/:id`, `POST /api/reports`.
- Photo upload with real file checks (content, type and size), stored in `server/uploads/` (never committed).
- A repeatable seed that loads the 12 frontend sample reports (`RL-023` to `RL-034`) into the database.
- The existing frontend is still served unchanged by Express.

## What Phase 2 adds (the frontend is connected)
When the page is served by this server, the frontend **now uses the database**:
- Reports are loaded from `GET /api/reports`. New reports are sent with `POST /api/reports`, including the photo.
- **My reports** loads from `GET /api/reports?mine=1`, using an anonymous id the browser creates once (`X-Client-Id`, kept in localStorage).
- Reports and photos are still there after refreshing the page or restarting the server.
- Loading, error (with Try again) and empty states were added using the existing design.
- Everything else is unchanged. The same files still work as a pure demo on GitHub Pages, VS Code Live Server or a file opened from disk.

### Which data source is used? (`js/config.js`)
| `API_MODE` | Meaning |
|---|---|
| `auto` (default) | Ask `GET /api/health`. If the READYLINK server answers: **server mode**. Otherwise: **demo mode** (original behavior). |
| `server` | Always use the server. If it cannot be reached, an error with a Try again button is shown. Demo data is never used quietly. |
| `demo` | Never contact a server. |

`API_BASE` stays `''` (same origin). CORS is not set up, so the frontend must be served by this server.
In server mode the footer says so, and the "Reset demo data" button is hidden (it must never touch the database).

## What is still demo or not built yet
- **AI assessment** is still the demo/mock result. Its risk level is sent to the server as a suggestion for now.
- **Priority list** is still the hand-written sample list.
- **Admin login and admin changes are not connected (Phase 3).** The admin pages show the database reports, but sign-in is still the demo gate, and changing a status or risk level shows a message and saves nothing.
- **Offline sync is basic:** a report saved offline waits in this browser (localStorage) and **Send now** really sends it to the server. There is no IndexedDB and no automatic sending.
- Reports made by other people appear after you reload the page (no live updates).
- Nothing is deployed publicly. The server only listens on this computer.

## Setup (Windows PowerShell, Node.js 20.12 or newer)
From the project folder:

```powershell
node --version
cd server
npm.cmd install
Copy-Item .env.example .env
npm.cmd run db:init
npm.cmd run seed
npm.cmd run db:list
npm.cmd run test:unit
npm.cmd test
npm.cmd start
```

Then open **http://localhost:3000** (the app, still in demo mode) and **http://localhost:3000/api/reports** (the 12 sample reports as JSON).
Stop the server with `Ctrl + C`. `.env` is optional: without it the defaults are used.

`npm.cmd install` also installs the optional package `better-sqlite3`. If it fails, nothing breaks: see "Database drivers".

## Settings (`server/.env`)
| Name | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port (0 to 65535) |
| `HOST` | `127.0.0.1` | `127.0.0.1` = only this computer |
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `DB_DRIVER` | `auto` | `auto`, `better-sqlite3` or `node-sqlite` |
| `DB_FILE` | `data/readylink.db` | Database file (relative to `server/`), or `:memory:` |
| `UPLOADS_DIR` | `uploads` | Folder for photos (relative to `server/`) |
| `MAX_PHOTO_BYTES` | `5242880` | Largest photo (5 MB). Allowed: 1024 to 20971520 |
| `FRONTEND_DIR` | repository root | Folder with `index.html` |

## Database drivers
Both are real SQLite and use the same SQL (`src/schema.sql`):
- **better-sqlite3**: the recommended driver. It has a native part, so installing it can fail on some Windows setups.
- **node-sqlite**: the SQLite built into Node.js 22.5 and newer. No install needed. Node prints an "ExperimentalWarning" when it is used. That is expected.

`DB_DRIVER=auto` uses better-sqlite3 when it works and otherwise falls back to node-sqlite with a clear message in the terminal. The tests run once for every driver that is available on your computer.
Only `src/db.js` talks to a driver. Moving to PostgreSQL later means changing that file and the SQL in `src/services/`.

## Database commands
| Command | What it does |
|---|---|
| `npm.cmd run db:init` | Creates the database and tables if they do not exist. Safe to repeat |
| `npm.cmd run seed` | Adds the frontend sample reports. Skips the ones that already exist, so it is safe to repeat |
| `npm.cmd run db:list` | Prints the newest reports straight from the database file (read only). Use `npm.cmd run db:list -- 20` for more. Handy to confirm that a report really was saved |
| `npm.cmd run seed -- --reset` | Removes ONLY the sample reports, then adds them again. Real reports are never touched. Refused when `NODE_ENV=production` |

The sample data is read from `js/seed-data.js` (it is not copied), so the demo and the database cannot disagree.

## API
All answers are JSON. Errors always look like `{"error":{"code":"VALIDATION","message":"...","fields":{...}}}`.

### The report format (same field names the frontend already uses)
```json
{
  "id": "RL-035", "type": "drain",
  "x": 500, "y": 300, "lat": 13.7851, "lng": 121.0702,
  "ai": "hi", "lv": "hi", "st": "Pending",
  "date": "Oct 12", "createdAt": "2026-10-12T05:00:00.000Z",
  "desc": "Blocked drain near the school.", "brgy": "Brgy. Alangilan",
  "mine": true, "img": "/uploads/3281e664-afc8-4af8-bbda-a7784714bd5d.jpg",
  "log": [ { "t": "Report submitted", "d": "Oct 12, 1:00 PM", "at": "2026-10-12T05:00:00.000Z" } ]
}
```
- `x`, `y` are **SVG map units** (0 to 1000 by 0 to 611), exactly what the frontend draws. They are NOT latitude and longitude. The database stores real `lat`/`lng` and converts with the same constants as `js/map-data.js`.
- `type`: `tree`, `drain`, `road`, `pole`, `flood`, `slope`, `river`, `wall`.
- `ai`, `lv`: `hi`, `mod`, `lo`.
- `st`: `Pending`, `Verified`, `Under monitoring`, `Resolved` (exact spelling).
- `date` and `log[].d` are display text in Manila time. `createdAt` and `log[].at` are ISO 8601 (UTC).
- `img` is a URL path or `null`. `mine` is `true` when the request's `X-Client-Id` matches the report's owner. The client id is never returned.

### `GET /api/reports`
Everything for the public map, newest first (at most 500). Add `?mine=1` (and the `X-Client-Id` header) to get only this device's reports.
Answer: `{ "reports": [ ... ] }`

### `GET /api/reports/RL-023`
Answer: `{ "report": { ... } }`, or `404 NOT_FOUND`.

### `POST /api/reports`
Headers: `Content-Type: application/json` and `X-Client-Id: <16 to 64 letters, numbers, - or _>`.
```json
{ "type": "drain", "x": 500, "y": 300, "desc": "Blocked drain.", "level": "hi",
  "photo": "data:image/jpeg;base64,/9j/4AAQ..." }
```
| Field | Required | Rules |
|---|---|---|
| `type` | yes | One of the 8 keys, exactly |
| `x`, `y` | yes | Numbers. Must be inside the map and inside the Brgy. Alangilan boundary |
| `desc` | no | Up to 240 characters. Empty becomes "No description provided." |
| `level` | no | `hi`, `mod` or `lo` (default `mod`). **Temporary:** trusted from the client until the AI phase |
| `photo` | no | A base64 data URL of a JPEG, PNG or WEBP, up to `MAX_PHOTO_BYTES` |

Anything else (`id`, `status`, `mine`, ...) is ignored: a client cannot choose a report's id or status. New reports are always `Pending`.
Answer: `201 { "report": { ... } }` with a `Location` header.
Errors: `400 VALIDATION` (with `fields`), `400 CLIENT_ID_REQUIRED` / `INVALID_CLIENT_ID`, `400 INVALID_JSON`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`.

### `GET /uploads/<name>`
Serves a photo. Only names made by the server are served (random UUID plus `.jpg`, `.png` or `.webp`). Everything else is a 404.

### Photo safety
The server does not trust the file name, the extension or the declared type. It checks the real bytes (JPEG, PNG or WEBP signature, complete file), compares them with the declared type, enforces the size limit before decoding, and stores the file under a random name. Files are served with a fixed content type, `nosniff` and a restrictive Content-Security-Policy.
Not checked in Phase 1: image dimensions and deep decoding.

### About `X-Client-Id`
An anonymous id the browser creates once and keeps. It only **labels** reports as "mine". It is not a password and does not protect anything: Phase 1 has no edit or delete, and the id is never returned. Real admin protection comes with login in Phase 3.

## Try it from PowerShell
Start the server in one window (`npm.cmd start`), then in another:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
(Invoke-RestMethod http://localhost:3000/api/reports).reports.Count
Invoke-RestMethod http://localhost:3000/api/reports/RL-023

$body = @{ type='drain'; x=500; y=300; desc='Test report'; level='hi' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/reports -ContentType 'application/json' -Headers @{ 'X-Client-Id'='client-test-1234567890' } -Body $body
```

With a photo (use any small JPG):
```powershell
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Pictures\test.jpg"))
$body = @{ type='tree'; x=500; y=300; desc='With photo'; photo="data:image/jpeg;base64,$b64" } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/reports -ContentType 'application/json' -Headers @{ 'X-Client-Id'='client-test-1234567890' } -Body $body
$r.report.img            # open http://localhost:3000 + this path in the browser
```

To see an error body (Windows PowerShell 5.1 throws on 400):
```powershell
try { Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/reports -ContentType 'application/json' -Headers @{ 'X-Client-Id'='client-test-1234567890' } -Body (@{ type='bridge' } | ConvertTo-Json) }
catch { $_.ErrorDetails.Message }
```

## Tests
| Command | Needs `npm.cmd install`? | What it checks |
|---|---|---|
| `npm.cmd run test:unit` | No | Settings, path policy, errors, **the real frontend `js/api.js` and `js/api-server.js` run with a fake fetch (what they send, errors, demo mode unchanged)**, map conversion (checked against `js/map-data.js`), photo validation, input validation, the database (every available driver), report logic, seeding vs the frontend sample data, and the HTTP handlers (with fake requests) |
| `npm.cmd run test:integration` | **Yes** | The real Express app over real HTTP: **the real frontend API client against the real server (sending, photos, my reports, restart, errors)**, reports API, photos served safely, restart persistence, private files and server code not exposed, frontend served byte for byte |
| `npm.cmd test` | **Yes** | Both |

The tests use temporary databases and folders. They never touch `server/data` or `server/uploads`.

## Phase 2 checklist: is the frontend really using the database?
Start the server (`npm.cmd start`), then open **http://localhost:3000** in the browser.
1. Home shows **12 risks reported** and the footer says "Reports are saved in the READYLINK database". There is no "Reset demo data" button.
2. Open Report a risk, send a report (pick a sample photo or upload your own).
3. In a second PowerShell window, from the `server` folder, confirm it is in the database:
   ```powershell
   npm.cmd run db:list -- 3
   (Invoke-RestMethod http://localhost:3000/api/reports).reports.Count
   ```
   Your report must appear (with its `RL-0xx` id and status `Pending`) and the count must be 13.
4. Press F5 to refresh the page. Open My reports: your report is still there. If you uploaded a photo, the photo still shows.
5. Stop the server (`Ctrl + C`), start it again, refresh: still there.
6. Open the site in a private window: My reports is empty (it has its own anonymous id), but the Risk map still shows all reports.
7. Stop the server and refresh the page: you must NOT see a blank page. With `API_MODE: 'server'` you get an error box with Try again. With the default `auto` the page was served by the server, so it needs the server to load at all.
8. To see demo mode again: open `index.html` from disk, or run the page on GitHub Pages. It uses demo data as before.

## Phase 1 checklist (run these on your computer)
1. `npm.cmd install` finishes. Note whether `better-sqlite3` installed (the next commands show the driver name).
2. `npm.cmd run test:unit` shows no failures.
3. `npm.cmd test` shows no failures.
4. `npm.cmd run db:init` prints "Database ready" with a driver name.
5. `npm.cmd run seed` prints "12 added", and running it again prints "0 added, 12 already there".
6. `npm.cmd start`, then open http://localhost:3000/api/reports: 12 reports, `RL-034` first.
7. http://localhost:3000/api/reports/RL-023 shows `"x":355,"y":81`.
8. Create a report with the PowerShell commands above: you get `RL-035` with status `Pending`.
9. Create one with a photo, then open its `img` path in the browser: the same photo shows. A new file appears in `server/uploads/`.
10. Stop the server, start it again: the new reports and photos are still there.
11. Try http://localhost:3000/server/src/db.js, http://localhost:3000/server/package.json and http://localhost:3000/.env: all must be "Not found".
12. http://localhost:3000 still shows the READYLINK app and the demo flow still works.
13. `git status` shows no `.db`, `.db-wal`, `.db-shm`, `.env` or uploaded photos.

## Known limitations
- The photo travels as base64 inside JSON (about 33 percent larger). That is fine for the 80 to 250 KB photos the frontend produces. A file-upload format can replace it later if needed.
- The suggested risk level comes from the client until the AI phase.
- `GET /api/reports` returns all reports (maximum 500) with no pagination, because the admin dashboard and the map work from the full list.
- The sample reports are not "mine" for any device.
- Sample timeline entries show 12:00 PM, because the demo data only has dates.
- No rate limiting yet (planned for the hardening phase), so do not expose this server to the internet.
- SQLite files do not survive on hosts with temporary disks. A hosted database would be needed for deployment.

## Keeping the original frontend recoverable
```powershell
git tag frontend-demo-v1
git switch -c backend
```
Work on the `backend` branch. `main` (and your GitHub Pages demo) stays as it was. To go back: `git switch main`.

## Safety rules
- Never commit `.env`, `*.db` files or uploaded photos. They are in `.gitignore`. `.env.example` has no secrets.
- Never put secrets in files under `css/`, `js/` or `index.html`. Anything there is public.
- The server only serves `index.html`, `css/`, `js/`, `data/` and `/uploads/<server-made-name>`. It never serves `server/`, `.env`, `.git` or `README.md`.
- GitHub Pages publishes the repository, so the `server/` source code is visible if the repository is public. That is fine as long as no secrets are committed.

## Folder layout
```
server/
  package.json  .env.example
  data/  uploads/            (database and photos; contents are not committed)
  src/
    server.js  app.js  bootstrap.js  config.js  db.js  schema.sql  staticPolicy.js
    middleware/errors.js
    routes/reports.js  uploads.js
    services/geo.js  photoService.js  reportValidation.js  reportService.js  seedService.js
    scripts/initDb.js  seed.js  listReports.js
  tests/
    helpers/   unit/   integration/
```

Frontend files added in Phase 2 (in the project root, not in `server/`):
- `js/config.js`: the settings above
- `js/api-server.js`: the only file that talks to the reports API (anonymous client id, requests, error messages)
- changed: `js/api.js` (server-mode branches, demo code kept), `js/events.js` (start-up loading/error), `js/router.js`, `js/pages-public.js`, `js/pages-admin.js`, `js/connection.js`, `js/shells.js`, `js/state.js`, `index.html`
