import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export function loadStoredDocuments(
  storage: Storage,
  key: string
): InvoiceDocument[] | null {
  const stored = storage.getItem(key);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as InvoiceDocument[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    clearStoredDocuments(storage, key);
    return null;
  }
}

export function saveStoredDocuments(
  storage: Storage,
  key: string,
  documents: InvoiceDocument[]
) {
  storage.setItem(key, JSON.stringify(documents));
}

export function clearStoredDocuments(storage: Storage, key: string) {
  storage.removeItem(key);
}
