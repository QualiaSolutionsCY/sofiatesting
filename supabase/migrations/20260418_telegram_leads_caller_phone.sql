-- Add caller_phone to telegram_leads so repeat-caller leads can be routed to the
-- agent who handled the original. Column holds the digits-only canonical form
-- (e.g. "447748700937" for +44 7748 700937, "35796565606" for +357 96 565606).
-- Look-ups use a set of variants generated at query time (with/without 357
-- country code, with/without leading 0) via normalizePhoneForSearch().

ALTER TABLE telegram_leads
  ADD COLUMN IF NOT EXISTS caller_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_telegram_leads_caller_phone
  ON telegram_leads (source_group_id, caller_phone)
  WHERE caller_phone IS NOT NULL;
