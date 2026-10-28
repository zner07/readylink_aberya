# READYLINK (frontend prototype)

AI-assisted community disaster risk identification and reporting web system.
Prototype area: **Brgy. Alangilan, Batangas City**.

> **This is the frontend / UI phase only.** There is no backend, database, real AI or real login yet.
> Everything runs in the browser with demo data so the team can later plug in their own parts.

## Run it

No install and no build step.

> **Extract the zip first.** If you double-click `index.html` while it is still inside the .zip, Windows opens only that one file
> and the page stays blank. Right-click the zip, choose **Extract All**, then open `index.html` from the extracted folder.

- **Quickest:** double-click `index.html`.
- **VS Code:** open this folder, install the *Live Server* extension, right-click `index.html` and choose **Open with Live Server**.
- **GitHub Pages (free hosting):** push the folder to a repo, then **Settings -> Pages -> Deploy from a branch -> main / root**.

The Archivo font loads from Google Fonts, so it needs internet. Without it the page falls back to a system font and the layout still works.

## Folder structure

```
readylink/
  index.html            page skeleton + <link>/<script> tags (script ORDER matters)
  css/
    tokens.css          colors, shadows, font stack, light + dark theme variables
    styles.css          all component, page and responsive styles
  js/
    utils.js            helpers, icon set, logo, contour background
    data.js             constants: risk types, categories, levels, statuses, mock AI reasons
    seed-data.js        DEMO sample reports
    demo-insights.js    DEMO sample data for "Reports to prioritize" (hand-written, not AI)
    map-data.js         Alangilan boundary + OSM roads/stream/campus (generated, see below)
    map.js              boundary test, lat/lng conversion, mapSVG() (draws the map and pins)
    heatmap.js          heatmap layer + hotspot summary (calculated from the report coordinates)
    illustrations.js    sample-photo illustrations, photo() helper
    api.js              DEMO DATA LAYER  <-- the file your backend/AI/auth work replaces
    state.js            UI state, report draft, toast, confirm dialog
    connection.js       online/offline pill, sync states (Saved locally, Pending sync, Syncing, Submitted)
    shells.js           navbar, admin sidebar, mobile menus, footer
    pages-public.js     Home, Report a risk (4 steps), Risk map, My reports, Track report
    pages-admin.js      Admin sign in, Overview, Reports, Report review
    router.js           hash router + render()
    events.js           click/change/keyboard handlers, mobile menu, app boot
  data/
    alangilan.geojson            barangay boundary (OpenStreetMap)
    alangilan-features.geojson   roads, stream, BatStateU campus (OpenStreetMap)
```

The scripts are plain (non-module) scripts that share one global scope, so they work from `file://`.
Keep the order in `index.html`: each file may use things defined by the files above it.

## Where to connect real work

Everything the UI needs from a server goes through the `API` object in **`js/api.js`**.
The methods are already `async`, so swap each body for a `fetch()` call and the pages keep working.

| `API` method | What it does now (demo) | Replace with |
|---|---|---|
| `listReports()` | reads reports from `localStorage` (or the seed data) | `GET /reports` |
| `submitReport(draft, analysis)` | creates a report in `localStorage`, keeps the photo as a data URL | `POST /reports` + upload the photo file to storage |
| `updateReport(id, patch)` | changes status, risk level or remarks in `localStorage` | `PATCH /reports/:id` (admin only) |
| `analyzeReport(draft)` | **MOCK.** Picks a result from the sample photo or keywords. It never looks at the image | the real AI call. Keep the returned shape `{t, c, lv, reason}` |
| `getPriorityQueue()` | **DEMO.** Returns the hand-written list in `js/demo-insights.js`. It is not an AI result | the real prioritization service. Keep the shape `{id, level, reason}` |
| `listPending()`, `setConnectivity()`, `setQueueState()`, `syncReport()` | **DEMO device queue** in `localStorage` (key `readylink-demo-queue-v1`) for reports made offline. `syncReport()` only moves a report into the demo store | a real offline store (IndexedDB) + sync worker + `POST /reports` |
| `submitReport(draft, analysis, {offline})` | with `offline: true` the report goes to the demo device queue | `POST /reports` online; queue it on the device when offline |
| `signIn / signOut / hasSession` | accepts any non-empty email and password | real authentication |
| `resetDemo()` | restores sample data (footer link "Reset demo data") | delete when a real database exists |

Tips:
- Search the code for `DEMO`, `MOCK` or `TODO(` to find every placeholder.
- A report looks like `{id, type, x, y, ai, lv, st, date, desc, brgy, mine, img, log[]}`. `x, y` are map coordinates; use `geo(x, y)` in `js/map.js` for lat/lng.
- The AI result is only ever a **suggestion**. Admins verify (this is a core rule of the project).
- Photos are resized in the browser and kept as a data URL (`handleFile()` in `js/pages-public.js`). Replace this with a real file upload.

## Map and data credit

The boundary, roads, stream and campus come from **OpenStreetMap** (ODbL licence).
Keep the credit "(c) OpenStreetMap contributors" on the map when you publish.
`js/map-data.js` was generated from the two GeoJSON files in `data/` (they are not loaded at runtime).
If the map needs to change, regenerate that file instead of editing it by hand.
The map has no official sitio boundaries, so no sitio names are shown.

## Design

Minimal + flat with subtle glass panels. To change colors, edit **`css/tokens.css`**.
Dark mode is defined twice (the `prefers-color-scheme` block and `[data-theme="dark"]`); keep them in sync.
Mobile layout (<= 620px) uses a menu button for both the public site and the Admin side.

## Planned features: what the UI does now

These three features have UI and safe demo behavior only. Nothing here talks to a server.

| Feature | Where | Real now | Demo / still to build |
|---|---|---|---|
| **AI Risk Prioritization** | Admin Overview, "Reports to prioritize" | The list links to the real review page and skips resolved reports | The order and the explanations are **hand-written sample data** (`js/demo-insights.js`). Connect the AI service through `API.getPriorityQueue()` |
| **Community Risk Heatmap** | Risk map, **Markers / Heatmap** switch (public and admin) | Heat layer and hotspot summary are calculated from the report coordinates, the filters apply, the existing boundary, roads, stream and campus are reused | The reports themselves are demo data, so the heatmap is labeled "Demo data". If hotspots should be computed on the server, replace `hotspots()` in `js/heatmap.js` |
| **Offline-first reporting** | Report a risk (pill + review note), success screen, My reports, Track report | The Online/Offline pill follows the browser connection (`navigator.onLine` and the online/offline events) | **No real offline system yet.** "Simulate offline" is a demo switch, the queue is `localStorage`, there is no IndexedDB, service worker or automatic sync, and "Sync now (demo)" contacts no server |

Sync states used by the UI (`report.sync`): `local` (Saved locally), `pending` (Pending sync), `syncing` (Syncing), `submitted` (Submitted; also the default when the field is missing).
Reports that are not submitted yet stay out of the public map, the hero map, the heatmap, the priority list and every admin page, as they would in a real system.
