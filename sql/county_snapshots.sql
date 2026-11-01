CREATE TABLE IF NOT EXISTS county_snapshots (source TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, refreshed_at TEXT NOT NULL, record_count INTEGER NOT NULL CHECK(record_count>=0));
