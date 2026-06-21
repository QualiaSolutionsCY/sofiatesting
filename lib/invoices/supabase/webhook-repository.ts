import "server-only";

import {
  type ParsedInboundReply,
  parseInboundReply,
} from "@/lib/invoices/integrations/webhook-parser";
import { getNextOfficialNumber } from "@/lib/invoices/numbering";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import {
  applyOfficialNumberToDocument,
  markApproved,
  transitionDocumentStatus,
} from "@/lib/invoices/workflow-actions";
import {
  listInvoiceDocuments,
  saveInvoiceDocument,
} from "./document-repository";
import { SUPABASE_TABLES } from "./schema";
import { createServiceSupabaseClient } from "./server";

export type InboundWebhookInput = {
  provider: "manual" | "whatsapp" | "email";
  eventId?: string;
  eventType?:
    | "delivery-status"
    | "inbound-message"
    | "approval-reply"
    | "unknown";
  signatureStatus?: "not-required" | "unverified" | "verified" | "failed";
  documentId?: string;
  providerMessageId?: string;
  text?: string;
  rawPayload: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type InboundWebhookResult = {
  status: "processed" | "ignored" | "failed";
  outcome: ParsedInboundReply["outcome"];
  documentId?: string;
  reason?: string;
};

const fallbackProcessedEvents = new Set<string>();
const fallbackWebhookEvents: InboundWebhookInput[] = [];

export async function processInboundWebhook(
  input: InboundWebhookInput
): Promise<InboundWebhookResult> {
  if (input.eventId && fallbackProcessedEvents.has(input.eventId)) {
    return {
      status: "ignored",
      outcome: "unknown",
      documentId: input.documentId,
      reason: "duplicate",
    };
  }

  await storeWebhookEvent(input, "received");

  const parsed = parseInboundReply(input.text ?? extractText(input.rawPayload));
  if (input.eventId) fallbackProcessedEvents.add(input.eventId);

  if (!input.documentId || parsed.outcome === "unknown") {
    await storeWebhookEvent(input, "ignored");
    return {
      status: "ignored",
      outcome: parsed.outcome,
      documentId: input.documentId,
    };
  }

  const current = await listInvoiceDocuments();
  const document = current.documents.find(
    (candidate) => candidate.id === input.documentId
  );
  if (!document) {
    await storeWebhookEvent(
      input,
      "failed",
      `Document ${input.documentId} was not found`
    );
    return {
      status: "failed",
      outcome: parsed.outcome,
      documentId: input.documentId,
      reason: "document not found",
    };
  }

  const updated = applyReplyToDocument(document, current.documents, parsed);
  await saveInvoiceDocument(
    updated,
    `Inbound ${parsed.outcome} reply from ${input.provider}`
  );
  await storeWebhookEvent(input, "processed");

  return {
    status: "processed",
    outcome: parsed.outcome,
    documentId: document.id,
  };
}

export function __resetWebhookRepositoryForTests() {
  fallbackProcessedEvents.clear();
  fallbackWebhookEvents.length = 0;
}

export function __getFallbackWebhookEventsForTests() {
  return structuredClone(fallbackWebhookEvents);
}

function applyReplyToDocument(
  document: InvoiceDocument,
  documents: InvoiceDocument[],
  parsed: ParsedInboundReply
): InvoiceDocument {
  if (parsed.outcome === "approved") {
    return applyOfficialNumberToDocument(
      markApproved(document),
      document.officialNumber ?? getNextOfficialNumber(documents, document.kind)
    );
  }

  if (
    parsed.outcome === "correction-requested" ||
    parsed.outcome === "rejected"
  ) {
    const label =
      parsed.outcome === "rejected"
        ? "Marios rejected draft via inbound reply"
        : "Marios requested correction via inbound reply";
    return {
      ...transitionDocumentStatus(document, "correction-needed"),
      correctionReason: parsed.reason ?? document.correctionReason,
      officialNumberPendingReason:
        "Waiting for corrected draft after Marios reply.",
      approvalTimeline: [
        ...document.approvalTimeline,
        { label, at: new Date().toISOString(), by: "Marios" },
      ],
      notes: [...document.notes, parsed.reason ?? label],
    };
  }

  return document;
}

async function storeWebhookEvent(
  input: InboundWebhookInput,
  processingStatus: "received" | "processed" | "ignored" | "failed",
  errorMessage?: string
) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    fallbackWebhookEvents.push(input);
    return;
  }

  const { data: documentRow } = input.documentId
    ? await supabase
        .from(SUPABASE_TABLES.documents)
        .select("id")
        .eq("external_id", input.documentId)
        .maybeSingle()
    : { data: null };

  const { error } = await supabase.from(SUPABASE_TABLES.webhookEvents).insert({
    provider: input.provider,
    event_type: input.eventType ?? "approval-reply",
    signature_status: input.signatureStatus ?? "not-required",
    processing_status: processingStatus,
    raw_payload: input.rawPayload,
    headers: input.headers ?? {},
    provider_message_id: input.providerMessageId,
    document_id: documentRow?.id ?? null,
    error_message: errorMessage,
  });

  if (error)
    throw new Error(
      `Unable to store invoice_webhook_events row: ${error.message}`
    );
}

function extractText(payload: Record<string, unknown>) {
  const text = payload.text ?? payload.message ?? payload.body;
  return typeof text === "string" ? text : "";
}
