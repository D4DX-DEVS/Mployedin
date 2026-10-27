-- POST /logs/erase deletes WhatsApp rows by recipient number (GDPR erasure,
-- lib/gdpr/erasure.ts): index it like every other lookup, ending with the time column.
CREATE INDEX whatsapp_log_to ON whatsapp_log (to_number, sent_at);
