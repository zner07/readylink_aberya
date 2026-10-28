-- READYLINK database schema, version 1.
-- The database itself rejects values the frontend does not understand (hazard types, levels, statuses).

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- What the frontend calls "id", for example RL-036.
  public_id   TEXT NOT NULL UNIQUE,
  -- Exactly the 8 hazard keys the frontend uses.
  type        TEXT NOT NULL CHECK (type IN ('tree','drain','road','pole','flood','slope','river','wall')),
  -- Real-world location. The frontend's x,y (SVG map units) are calculated from these, see src/services/geo.js.
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  -- Risk level: hi = High, mod = Moderate, lo = Low.
  -- ai_level is the level suggested when the report was made, level is the current (admin-confirmed) level.
  -- Until the AI phase, the suggested level comes from the client (see API docs).
  ai_level    TEXT NOT NULL CHECK (ai_level IN ('hi','mod','lo')),
  level       TEXT NOT NULL CHECK (level IN ('hi','mod','lo')),
  -- Exact strings used by the frontend (note the lowercase "m" in "Under monitoring").
  status      TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Verified','Under monitoring','Resolved')),
  description TEXT NOT NULL,
  -- File name only (never a path). The file lives in the uploads folder.
  photo_file  TEXT,
  -- Anonymous device id used only to label "my reports". It is NOT authentication and is never returned by the API.
  client_id   TEXT,
  -- 1 = sample report from js/seed-data.js, 0 = real report. Lets "npm run seed -- --reset" remove only sample data.
  is_sample   INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at  TEXT NOT NULL, -- ISO 8601, UTC
  updated_at  TEXT NOT NULL  -- ISO 8601, UTC
);

CREATE TABLE IF NOT EXISTS report_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_events_report ON report_events (report_id, id);
CREATE INDEX IF NOT EXISTS idx_reports_client ON reports (client_id);
