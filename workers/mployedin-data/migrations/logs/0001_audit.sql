-- logs-audit: who did what (admin audit trail) and consent evidence.
-- Long retention (see src/tables.ts). Timestamps are epoch milliseconds.
-- Indexes: every filter the read API accepts leads one, and each ends with the
-- time column, so a filtered, newest-first page is one index range scan.

CREATE TABLE audit_log (
  id                TEXT PRIMARY KEY,
  created_at        INTEGER NOT NULL,
  actor_id          TEXT,
  actor_role        TEXT,
  on_behalf_of_id   TEXT,
  on_behalf_of_role TEXT,
  action            TEXT NOT NULL,
  resource          TEXT NOT NULL,
  resource_id       TEXT,
  ip_address        TEXT,
  country           TEXT,
  user_agent        TEXT,
  changes           TEXT,
  meta              TEXT
) STRICT;
CREATE INDEX audit_log_time        ON audit_log (created_at);
CREATE INDEX audit_log_actor       ON audit_log (actor_id, created_at);
CREATE INDEX audit_log_on_behalf   ON audit_log (on_behalf_of_id, created_at);
CREATE INDEX audit_log_action      ON audit_log (action, created_at);
CREATE INDEX audit_log_resource    ON audit_log (resource, resource_id, created_at);
CREATE INDEX audit_log_resource_id ON audit_log (resource_id, created_at);
CREATE INDEX audit_log_country     ON audit_log (country, created_at);

CREATE TABLE consent_log (
  id             TEXT PRIMARY KEY,
  created_at     INTEGER NOT NULL,
  user_id        TEXT NOT NULL,
  user_name      TEXT,
  consent_type   TEXT NOT NULL,
  granted        INTEGER NOT NULL CHECK (granted IN (0, 1)),
  source         TEXT,
  policy_version TEXT,
  receipt_id     TEXT,
  ip_address     TEXT
) STRICT;
CREATE INDEX consent_log_time    ON consent_log (created_at);
CREATE INDEX consent_log_user    ON consent_log (user_id, consent_type, created_at);
CREATE INDEX consent_log_type    ON consent_log (consent_type, created_at);
CREATE INDEX consent_log_receipt ON consent_log (receipt_id, created_at);
