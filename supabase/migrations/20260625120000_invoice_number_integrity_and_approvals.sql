-- Official-number integrity + durable approval audit trail.
--
-- Closes the CRITICAL read-modify-write race on official numbers: official numbers
-- were computed purely in app code (Math.max(...numbers)+1) over a stale in-app list
-- with NO transaction/lock and NO DB-level uniqueness, so two concurrent writers
-- (admin actions, the Sophia intent bridge, the WhatsApp approval webhook, the create
-- flow) could read the same max and assign the SAME legal number to two distinct tax
-- documents — both succeeding silently. This migration makes that collision impossible
-- (partial unique index) and impossible to compute incorrectly (transactional RPC).
--
-- KNOWN ISSUE — migration history mismatch: local/remote migration history can drift
-- and block `supabase db push`. If push fails, apply this file's SQL verbatim via the
-- Supabase dashboard SQL editor (project vceeheaxcrhmpqueudqx). All DDL below is
-- idempotent (IF NOT EXISTS / CREATE OR REPLACE) so re-running it is safe.

-- 1) DB-level uniqueness: two distinct LIVE documents of the same kind can never share
--    an official number. Partial so drafts (official_number IS NULL) and soft-deleted
--    rows (deleted_at IS NOT NULL) are exempt — only live, numbered documents are unique.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_documents_kind_official_number_key
  ON invoice_documents (kind, official_number)
  WHERE official_number IS NOT NULL AND deleted_at IS NULL;

-- 2) Transactional allocation. Serializes concurrent callers for the given kind via a
--    transaction-scoped advisory lock (so two writers cannot read the same max — and
--    advisory-lock + aggregate is legal, unlike SELECT MAX(...) FOR UPDATE which Postgres
--    rejects), computes the max of the TRAILING numeric group of official_number
--    (mirroring extractSequence in lib/invoices/numbering.ts — the trailing \d+ group,
--    NOT replace(/\D/g,'') which would let a year prefix like '2026-11424' poison the
--    sequence), applies the same per-kind fallback floors used by the app
--    (credit-note -> 10096, receipt -> 10386, else 11424) and returns max+1
--    (or floor+1 when none exist yet). The partial unique index above is the hard
--    backstop: even if a caller bypasses this RPC, a colliding number fails loudly.
CREATE OR REPLACE FUNCTION public.allocate_official_number(p_kind text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_floor   bigint;
  v_max     bigint;
BEGIN
  v_floor := CASE p_kind
    WHEN 'credit-note' THEN 10096
    WHEN 'receipt'     THEN 10386
    ELSE 11424
  END;

  -- Serialize allocation per kind for the rest of the transaction. Two concurrent
  -- allocations of the same kind block here until the first commits, so they cannot
  -- read the same max. Released automatically at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('invoice_official_number:' || p_kind));

  -- Max of the trailing \d+ group across live, numbered rows of this kind. The trailing
  -- group is taken so a year/prefix (e.g. '2026-11424') cannot poison the sequence.
  SELECT COALESCE(
           MAX((regexp_match(official_number, '(\d+)\D*$'))[1]::bigint),
           v_floor
         )
    INTO v_max
    FROM invoice_documents
   WHERE kind = p_kind::invoice_document_kind
     AND official_number IS NOT NULL
     AND deleted_at IS NULL;

  RETURN GREATEST(v_max, v_floor) + 1;
END;
$$;

-- The service client allocates numbers; grant execute on the allocator.
GRANT EXECUTE ON FUNCTION public.allocate_official_number(text) TO service_role;
