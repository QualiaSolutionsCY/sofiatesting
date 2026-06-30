-- ============================================================================
-- Invoice schema REPRODUCIBILITY migration (NO-OP on production).
-- ============================================================================
--
-- WHY THIS FILE EXISTS
--   The invoice tables (invoice_documents and friends) were created out-of-band
--   via the Supabase dashboard / a now-deleted project. The repo only ever held
--   ALTER statements against those tables:
--     - 20260617121000_security_advisor_hardening.sql  (ALTER POLICY / REVOKE)
--     - 20260623120000_invoice_soft_delete.sql         (ADD COLUMN deleted_at)
--     - 20260625120000_invoice_number_integrity_and_approvals.sql
--                                                       (partial unique index + RPC)
--   ...and NO `CREATE TABLE` for the invoice schema, so the schema was not
--   reproducible from migrations alone. This file reconstructs the full schema
--   so a fresh database (CI branch, local stack, disaster recovery) can be stood
--   up from `supabase/migrations/` with no manual dashboard steps.
--
-- SAFE ON THE LIVE DATABASE (OWNER decision)
--   This runs against a LIVE money system where every object below ALREADY
--   exists. Every statement is idempotent and therefore a no-op on prod:
--     - CREATE TYPE wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object`
--     - CREATE TABLE IF NOT EXISTS
--     - ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--     - CREATE INDEX IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS
--   No data is written, altered, or dropped.
--
-- RLS IS DEFERRED ON PURPOSE
--   This pass does NOT call `ENABLE ROW LEVEL SECURITY` on the live tables.
--   The intended RLS + service-role policies are included at the bottom of this
--   file, COMMENTED OUT, to document intent. Flipping RLS on a running invoicing
--   system is a separate, tested increment (see M10 scope). The goal here is
--   reproducibility, not a security-posture change. NOTE: the existing
--   20260617121000 hardening migration already `ALTER POLICY`s the
--   "Service role can manage ..." policies, which means on prod those policies
--   (and RLS) already exist — they were created out-of-band alongside the tables.
--
-- SCHEMA SOURCES (how each object was reconstructed)
--   - Column names + TS types: lib/invoices/supabase/document-mappers.ts
--       (Row payload types: toDocumentRow / fromDocumentRow / toRevisionRow /
--        toApprovalRows / toPaymentRow / toStorageObjectRow / toMessageEventRows)
--   - Table name registry + enum value sets: lib/invoices/supabase/schema.ts
--   - Insert/select column lists for queue/delivery/webhook/provider tables:
--       lib/invoices/supabase/integration-repository.ts,
--       lib/invoices/supabase/webhook-repository.ts,
--       lib/invoices/supabase/document-repository.ts
--   - deleted_at column + index: 20260623120000_invoice_soft_delete.sql
--   - partial unique index on (kind, official_number) + allocate_official_number
--     RPC + invoice_document_kind cast: 20260625120000_..._integrity_and_approvals.sql
--
--   Where a Postgres type could not be pinned exactly from app code, a sensible
--   type is used and flagged with `-- TODO verify type`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Enum types.
--    schema.ts enumerates the value sets but the live DB stores `kind` as an
--    enum (the integrity migration casts `p_kind::invoice_document_kind`). Other
--    status columns are stored as text in the row payloads (the mappers type
--    them as TS string unions, and the integration/webhook inserts pass plain
--    strings), so only the kind enum is reconstructed as a real Postgres enum.
--    Wrapped in DO blocks because Postgres has no `CREATE TYPE IF NOT EXISTS`.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.invoice_document_kind AS ENUM ('invoice', 'credit-note', 'receipt');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ----------------------------------------------------------------------------
-- 1) invoice_documents — the ledger. The canonical row.
--    Source: document-mappers.ts InvoiceDocumentRow(Payload) (cols + types),
--            soft-delete migration (deleted_at), integrity migration (kind enum).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_documents (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id                     text NOT NULL UNIQUE,
  kind                            public.invoice_document_kind NOT NULL,
  client_name                     text NOT NULL,
  client_email                    text,
  bill_to_label                   text NOT NULL,
  description                     text NOT NULL,
  amount                          numeric(14, 2) NOT NULL,
  vat_mode                        text NOT NULL,
  vat_amount                      numeric(14, 2) NOT NULL,
  total                           numeric(14, 2) NOT NULL,
  currency                        text NOT NULL DEFAULT 'EUR',
  issue_date                      date NOT NULL,                  -- TODO verify type (mapper writes ISO date string)
  due_date                        date,                           -- TODO verify type (mapper writes ISO date string)
  recurrence                      text NOT NULL DEFAULT 'none',
  draft_number                    text NOT NULL,
  official_number                 text,
  official_number_pending_reason  text,
  status                          text NOT NULL,
  payment_status                  text NOT NULL,
  paid_at                         timestamptz,                    -- TODO verify type (mapper writes ISO timestamp string)
  paid_amount                     numeric(14, 2),
  receipt_number                  text,
  linked_credit_note_number       text,
  source_invoice_number           text,
  correction_reason               text,
  commission_person_name          text,
  requires_commission_person      boolean NOT NULL DEFAULT false,
  storage_status                  text NOT NULL DEFAULT 'not-generated',
  storage_path                    text,
  whatsapp_status                 text NOT NULL DEFAULT 'planned',
  marios_review_phone             text NOT NULL DEFAULT '',
  accounting_group_label          text NOT NULL DEFAULT '',
  line_items                      jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata                        jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes                           jsonb NOT NULL DEFAULT '[]'::jsonb,  -- TODO verify type (string[]; could be text[] on prod)
  deleted_at                      timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- Belt-and-suspenders: if the live table predates a column, add it idempotently.
-- (Matches the soft-delete migration's ADD COLUMN IF NOT EXISTS deleted_at.)
ALTER TABLE public.invoice_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- soft-delete index (mirrors 20260623120000_invoice_soft_delete.sql).
CREATE INDEX IF NOT EXISTS invoice_documents_deleted_at_idx
  ON public.invoice_documents (deleted_at);

-- Partial unique index on official numbers (mirrors 20260625120000).
-- Drafts (official_number IS NULL) and soft-deleted rows are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_documents_kind_official_number_key
  ON public.invoice_documents (kind, official_number)
  WHERE official_number IS NOT NULL AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2) invoice_document_revisions — revision snapshots.
--    Source: document-mappers.ts RevisionRowPayload + document-repository.ts
--            writeRevision() insert (document_id FK, revision_number, reason,
--            snapshot jsonb, created_by).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_document_revisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES public.invoice_documents (id) ON DELETE CASCADE,
  revision_number  integer NOT NULL,
  reason           text,
  snapshot         jsonb NOT NULL,
  created_by       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, revision_number)
);

CREATE INDEX IF NOT EXISTS invoice_document_revisions_document_id_idx
  ON public.invoice_document_revisions (document_id);

-- ----------------------------------------------------------------------------
-- 3) invoice_approvals — durable approval audit trail.
--    Source: document-mappers.ts ApprovalRow (document_id, event_label,
--            event_status, official_number, event_at) + document-repository.ts
--            writeRelatedRows() insert. Confirmed FK is document_id.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_approvals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES public.invoice_documents (id) ON DELETE CASCADE,
  event_label      text NOT NULL,
  event_status     text NOT NULL,
  official_number  text,
  event_at         timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_approvals_document_id_idx
  ON public.invoice_approvals (document_id);

-- ----------------------------------------------------------------------------
-- 4) invoice_payments — recorded payments.
--    Source: document-mappers.ts PaymentRowPayload + document-repository.ts
--            writeRelatedRows() insert (invoice_document_id, paid_amount,
--            paid_at, created_by). NOTE: the insert uses invoice_document_id as
--            the FK column name (not invoice_external_id, which is the in-app
--            payload field name).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_document_id  uuid NOT NULL REFERENCES public.invoice_documents (id) ON DELETE CASCADE,
  paid_amount          numeric(14, 2) NOT NULL,
  paid_at              timestamptz NOT NULL,
  created_by           text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_document_id_idx
  ON public.invoice_payments (invoice_document_id);

-- ----------------------------------------------------------------------------
-- 5) invoice_storage_objects — generated PDF storage metadata.
--    Source: document-mappers.ts StorageObjectRowPayload + document-repository.ts
--            writeRelatedRows() upsert (document_id, bucket, path, filename,
--            content_type, public_url) with onConflict "bucket,path".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_storage_objects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES public.invoice_documents (id) ON DELETE CASCADE,
  bucket        text NOT NULL,
  path          text NOT NULL,
  filename      text NOT NULL,
  content_type  text NOT NULL DEFAULT 'application/pdf',
  public_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- onConflict target used by the upsert in writeRelatedRows().
  UNIQUE (bucket, path)
);

CREATE INDEX IF NOT EXISTS invoice_storage_objects_document_id_idx
  ON public.invoice_storage_objects (document_id);

-- ----------------------------------------------------------------------------
-- 6) invoice_message_events — legacy WhatsApp message history.
--    Source: document-mappers.ts MessageEventRowPayload + document-repository.ts
--            and integration-repository.ts inserts (document_id, target, status,
--            message_text, provider_message_id, event_at).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_message_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id          uuid NOT NULL REFERENCES public.invoice_documents (id) ON DELETE CASCADE,
  target               text NOT NULL,
  status               text NOT NULL,
  message_text         text NOT NULL,
  provider_message_id  text,
  event_at             timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_message_events_document_id_idx
  ON public.invoice_message_events (document_id);

-- ----------------------------------------------------------------------------
-- 7) integration_provider_accounts — provider/channel account registry.
--    Source: integration-repository.ts findProviderAccountId() select
--            (id, provider, channel, account_label). Selected by
--            provider='manual', channel, account_label.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_provider_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text NOT NULL,
  channel        text NOT NULL,
  account_label  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, channel, account_label)
);

-- ----------------------------------------------------------------------------
-- 8) invoice_action_queue — outbound delivery queue.
--    Source: integration-repository.ts insert/select/update (document_id,
--            action_type, target, channel, provider, provider_account_id,
--            status, payload jsonb, attempts, provider_message_id, error_message,
--            sent_at, created_at, updated_at).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_action_queue (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id          uuid NOT NULL REFERENCES public.invoice_documents (id) ON DELETE CASCADE,
  action_type          text NOT NULL,
  target               text NOT NULL,
  channel              text NOT NULL,
  provider             text NOT NULL,
  provider_account_id  uuid REFERENCES public.integration_provider_accounts (id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'queued',
  payload              jsonb NOT NULL,
  attempts             integer NOT NULL DEFAULT 0,
  provider_message_id  text,
  error_message        text,
  sent_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_action_queue_document_id_idx
  ON public.invoice_action_queue (document_id);

-- ----------------------------------------------------------------------------
-- 9) invoice_delivery_events — per-attempt delivery status events.
--    Source: integration-repository.ts inserts/selects (queue_item_id,
--            document_id, channel, target, provider, status,
--            provider_message_id, raw_response jsonb, error_message, event_at).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_delivery_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id        uuid NOT NULL REFERENCES public.invoice_action_queue (id) ON DELETE CASCADE,
  document_id          uuid NOT NULL REFERENCES public.invoice_documents (id) ON DELETE CASCADE,
  channel              text NOT NULL,
  target               text NOT NULL,
  provider             text NOT NULL,
  status               text NOT NULL,
  provider_message_id  text,
  raw_response         jsonb,
  error_message        text,
  event_at             timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_delivery_events_queue_item_id_idx
  ON public.invoice_delivery_events (queue_item_id);
CREATE INDEX IF NOT EXISTS invoice_delivery_events_document_id_idx
  ON public.invoice_delivery_events (document_id);

-- ----------------------------------------------------------------------------
-- 10) invoice_webhook_events — inbound webhook event log.
--     Source: webhook-repository.ts storeWebhookEvent() insert (provider,
--             event_type, signature_status, processing_status, raw_payload jsonb,
--             headers jsonb, provider_message_id, document_id, error_message).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_webhook_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             text NOT NULL,
  event_type           text NOT NULL DEFAULT 'unknown',
  signature_status     text NOT NULL DEFAULT 'not-required',
  processing_status    text NOT NULL DEFAULT 'received',
  raw_payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers              jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id  text,
  document_id          uuid REFERENCES public.invoice_documents (id) ON DELETE SET NULL,
  error_message        text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_webhook_events_document_id_idx
  ON public.invoice_webhook_events (document_id);

-- ----------------------------------------------------------------------------
-- 11) invoice_access_users — MVP access-code users (Marios/Charalambous/Colleague).
--     Source: lib/invoices/access.ts (name, role, code) +
--             lib/invoices/supabase/access-policy.md ("role labels and seed-safe
--             code labels"). Real code hashes are generated server-side before
--             production (access-policy.md), so the stored column is a hash, not
--             the plaintext code.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_access_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  role        text NOT NULL,                         -- owner | finance | operations
  code_hash   text,                                  -- TODO verify type (hashed access code; not plaintext per access-policy.md)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- FOLLOW-UP (separate tested increment): enable RLS on live invoice tables
--   — see M10 scope.
--
-- The statements below are the INTENDED Row Level Security posture. They are
-- COMMENTED OUT here on purpose: this migration is reproducibility-only and must
-- be a no-op on the live money system. Enabling RLS on a running invoicing
-- database is a separate, tested increment. The "Service role can manage ..."
-- policy names below match those already ALTER'd by the existing
-- 20260617121000_security_advisor_hardening.sql migration, so on a FRESH
-- database these are the policies the hardening migration expects to exist.
--
-- ALTER TABLE public.invoice_documents            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_document_revisions   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_approvals            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_payments             ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_storage_objects      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_message_events       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_access_users         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_action_queue         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_delivery_events      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_webhook_events       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.integration_provider_accounts ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Service role can manage invoice documents"
--   ON public.invoice_documents
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage invoice document revisions"
--   ON public.invoice_document_revisions
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage invoice approvals"
--   ON public.invoice_approvals
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage invoice payments"
--   ON public.invoice_payments
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage invoice storage objects"
--   ON public.invoice_storage_objects
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage invoice message events"
--   ON public.invoice_message_events
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage invoice access users"
--   ON public.invoice_access_users
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- -- The queue/delivery/webhook/provider tables are server-side only; same posture.
-- CREATE POLICY "Service role can manage invoice action queue"
--   ON public.invoice_action_queue
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage invoice delivery events"
--   ON public.invoice_delivery_events
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage invoice webhook events"
--   ON public.invoice_webhook_events
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- CREATE POLICY "Service role can manage integration provider accounts"
--   ON public.integration_provider_accounts
--   USING ((select auth.role()) = 'service_role')
--   WITH CHECK ((select auth.role()) = 'service_role');
-- ============================================================================
