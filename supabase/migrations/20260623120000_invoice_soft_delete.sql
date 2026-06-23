-- Soft-delete support for invoice documents.
-- Replaces the previous hard DELETE in deleteInvoiceDocument() so deleted invoices
-- are retained and surfaced in a "Deleted invoices" view (Marios requirement).
-- A NULL deleted_at means the document is live; a timestamp means it was soft-deleted.

ALTER TABLE invoice_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Indexed so the default list (deleted_at IS NULL) and the deleted view
-- (deleted_at IS NOT NULL) both stay fast as the ledger grows.
CREATE INDEX IF NOT EXISTS invoice_documents_deleted_at_idx
  ON invoice_documents (deleted_at);
