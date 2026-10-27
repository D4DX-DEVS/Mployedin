-- logs-activity: high-volume, short-retention events (seeker activity feed,
-- profile and company page views, resource downloads) plus daily rollups that
-- charts read instead of scanning raw rows. Timestamps are epoch milliseconds.

CREATE TABLE activity_event (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  job_seeker_id TEXT NOT NULL,
  type          TEXT NOT NULL,
  priority      INTEGER,
  metadata      TEXT
) STRICT;
CREATE INDEX activity_event_time     ON activity_event (created_at);
CREATE INDEX activity_event_seeker   ON activity_event (job_seeker_id, created_at);
CREATE INDEX activity_event_type     ON activity_event (type, created_at);

CREATE TABLE profile_view (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  viewed_at     INTEGER NOT NULL,
  job_seeker_id TEXT NOT NULL,
  viewer_id     TEXT NOT NULL,
  viewer_role   TEXT NOT NULL,
  source        TEXT,
  notified_at   INTEGER
) STRICT;
CREATE INDEX profile_view_time   ON profile_view (viewed_at);
CREATE INDEX profile_view_seeker ON profile_view (job_seeker_id, viewed_at);
CREATE INDEX profile_view_viewer ON profile_view (viewer_id, viewed_at);

CREATE TABLE company_profile_view (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  viewed_at   INTEGER NOT NULL,
  viewer_id   TEXT NOT NULL,
  employer_id TEXT NOT NULL
) STRICT;
CREATE INDEX company_profile_view_time     ON company_profile_view (viewed_at);
CREATE INDEX company_profile_view_employer ON company_profile_view (employer_id, viewed_at);
CREATE INDEX company_profile_view_viewer   ON company_profile_view (viewer_id, viewed_at);

CREATE TABLE resource_download (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  downloaded_at INTEGER NOT NULL,
  resource_id   TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  file_key      TEXT NOT NULL,
  file_name     TEXT NOT NULL
) STRICT;
CREATE INDEX resource_download_time     ON resource_download (downloaded_at);
CREATE INDEX resource_download_resource ON resource_download (resource_id, downloaded_at);
CREATE INDEX resource_download_user     ON resource_download (user_id, downloaded_at);

-- Rebuilt nightly from profile_view (src/retention.ts). day = 'YYYY-MM-DD' UTC.
CREATE TABLE profile_view_daily (
  job_seeker_id TEXT NOT NULL,
  day           TEXT NOT NULL,
  views         INTEGER NOT NULL,
  PRIMARY KEY (job_seeker_id, day)
) STRICT, WITHOUT ROWID;
