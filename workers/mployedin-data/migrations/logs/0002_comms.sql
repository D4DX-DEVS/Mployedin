-- logs-comms: outbound email and WhatsApp history. Status columns are updated
-- in place when a delivery receipt arrives (same id, see src/tables.ts mutable).
-- Timestamps are epoch milliseconds.

CREATE TABLE email_log (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  sent_at       INTEGER NOT NULL,
  user_id       TEXT,
  to_address    TEXT NOT NULL,
  subject       TEXT,
  category      TEXT NOT NULL,
  status        TEXT NOT NULL,
  message_id    TEXT,
  error_message TEXT,
  source        TEXT NOT NULL,
  metadata      TEXT
) STRICT;
CREATE INDEX email_log_time     ON email_log (sent_at);
CREATE INDEX email_log_user     ON email_log (user_id, sent_at);
CREATE INDEX email_log_status   ON email_log (status, sent_at);
CREATE INDEX email_log_category ON email_log (category, sent_at);
CREATE INDEX email_log_source   ON email_log (source, sent_at);
CREATE INDEX email_log_message  ON email_log (message_id, sent_at);

CREATE TABLE whatsapp_log (
  id                    TEXT PRIMARY KEY,
  created_at            INTEGER NOT NULL,
  sent_at               INTEGER NOT NULL,
  status_at             INTEGER,
  user_id               TEXT,
  to_number             TEXT NOT NULL,
  wa_message_id         TEXT,
  kind                  TEXT NOT NULL,
  template_name         TEXT,
  template_language     TEXT,
  source                TEXT NOT NULL,
  category              TEXT NOT NULL,
  notification_type     TEXT,
  status                TEXT NOT NULL,
  error_code            INTEGER,
  error_kind            TEXT,
  error_message         TEXT,
  skip_reason           TEXT,
  schedule_id           TEXT,
  broadcast_id          TEXT,
  conversation_category TEXT
) STRICT;
CREATE INDEX whatsapp_log_time      ON whatsapp_log (sent_at);
CREATE INDEX whatsapp_log_user      ON whatsapp_log (user_id, sent_at);
CREATE INDEX whatsapp_log_status    ON whatsapp_log (status, sent_at);
CREATE INDEX whatsapp_log_wa_id     ON whatsapp_log (wa_message_id, sent_at);
CREATE INDEX whatsapp_log_broadcast ON whatsapp_log (broadcast_id, sent_at);
CREATE INDEX whatsapp_log_schedule  ON whatsapp_log (schedule_id, sent_at);
CREATE INDEX whatsapp_log_source    ON whatsapp_log (source, sent_at);
CREATE INDEX whatsapp_log_category  ON whatsapp_log (category, sent_at);
