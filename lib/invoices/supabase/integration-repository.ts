import "server-only";

import { deliverWithManualProvider } from "@/lib/invoices/integrations/manual-provider";
import {
  buildAccountingHandoffPayload,
  buildClientEmailPayload,
  buildCorrectedResendPayload,
  buildCreditNoteDeliveryPayload,
  buildDraftToMariosPayload,
  buildReceiptDeliveryPayload,
} from "@/lib/invoices/integrations/payloads";
import type {
  IntegrationDeliveryPayload,
  ManualProviderResult,
} from "@/lib/invoices/integrations/types";
import type { DeliveryRecord } from "@/lib/invoices/types/deliveries";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import { SUPABASE_TABLES } from "./schema";
import {
  createServiceSupabaseClient,
  getSupabasePersistenceMode,
} from "./server";

export type QueuedIntegrationDelivery = {
  queueItemId: string;
  providerMessageId: string;
  deliveryStatus: ManualProviderResult["deliveryStatus"];
  payload: IntegrationDeliveryPayload;
  persistenceMode: "supabase" | "fallback";
};

type FallbackQueueRow = QueuedIntegrationDelivery & {
  attempts: number;
  queueStatus: ManualProviderResult["queueStatus"];
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
};

let fallbackQueue: FallbackQueueRow[] = [];

export async function queueDraftToMarios(document: InvoiceDocument) {
  return queueManualDelivery(buildDraftToMariosPayload(document));
}

export async function queueAccountingHandoff(document: InvoiceDocument) {
  return queueManualDelivery(buildAccountingHandoffPayload(document));
}

export async function queueCorrectedResend(
  document: InvoiceDocument,
  reason?: string
) {
  return queueManualDelivery(buildCorrectedResendPayload(document, reason));
}

export async function queueClientEmail(
  document: InvoiceDocument,
  sharedCcEmail: string
) {
  return queueManualDelivery(buildClientEmailPayload(document, sharedCcEmail));
}

export async function queueReceiptDelivery(document: InvoiceDocument) {
  return queueManualDelivery(buildReceiptDeliveryPayload(document));
}

export async function queueCreditNoteDelivery(document: InvoiceDocument) {
  return queueManualDelivery(buildCreditNoteDeliveryPayload(document));
}

export async function queueManualDelivery(
  payload: IntegrationDeliveryPayload
): Promise<QueuedIntegrationDelivery> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return queueFallbackDelivery(payload);
  }

  const { data: documentRow, error: documentError } = await supabase
    .from(SUPABASE_TABLES.documents)
    .select("id")
    .eq("external_id", payload.documentId)
    .maybeSingle();

  if (documentError)
    throw new Error(
      `Unable to resolve queued document: ${documentError.message}`
    );
  if (!documentRow?.id)
    throw new Error(
      `Unable to queue delivery for missing document ${payload.documentId}`
    );

  const providerAccount = await findProviderAccountId(payload);
  const { data: queueRow, error: queueError } = await supabase
    .from(SUPABASE_TABLES.actionQueue)
    .insert({
      document_id: documentRow.id,
      action_type: payload.actionType,
      target: payload.target,
      channel: payload.channel,
      provider: payload.provider,
      provider_account_id: providerAccount,
      status: "processing",
      payload,
      attempts: 1,
    })
    .select("id")
    .single();

  if (queueError)
    throw new Error(
      `Unable to queue integration delivery: ${queueError.message}`
    );

  const providerResult = await deliverWithManualProvider({
    queueItemId: queueRow.id as string,
    payload,
  });

  const { error: updateError } = await supabase
    .from(SUPABASE_TABLES.actionQueue)
    .update({
      status: providerResult.queueStatus,
      provider_message_id: providerResult.providerMessageId,
      sent_at: new Date().toISOString(),
    })
    .eq("id", queueRow.id);

  if (updateError)
    throw new Error(
      `Unable to update integration delivery: ${updateError.message}`
    );

  const { error: deliveryError } = await supabase
    .from(SUPABASE_TABLES.deliveryEvents)
    .insert({
      queue_item_id: queueRow.id,
      document_id: documentRow.id,
      channel: payload.channel,
      target: payload.target,
      provider: providerResult.provider,
      status: providerResult.deliveryStatus,
      provider_message_id: providerResult.providerMessageId,
      raw_response: providerResult.rawResponse,
    });

  if (deliveryError)
    throw new Error(`Unable to write delivery event: ${deliveryError.message}`);

  await writeLegacyMessageEvent(
    documentRow.id as string,
    payload,
    providerResult
  );

  return {
    queueItemId: queueRow.id as string,
    providerMessageId: providerResult.providerMessageId,
    deliveryStatus: providerResult.deliveryStatus,
    payload,
    persistenceMode: "supabase",
  };
}

export async function listDeliveryRecordsForDocument(
  documentExternalId: string
): Promise<DeliveryRecord[]> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return fallbackQueue
      .filter((row) => row.payload.documentId === documentExternalId)
      .map(toFallbackDeliveryRecord);
  }

  const { data: documentRow, error: documentError } = await supabase
    .from(SUPABASE_TABLES.documents)
    .select("id")
    .eq("external_id", documentExternalId)
    .maybeSingle();

  if (documentError)
    throw new Error(
      `Unable to resolve delivery document: ${documentError.message}`
    );
  if (!documentRow?.id) return [];

  const { data: queueRows, error: queueError } = await supabase
    .from(SUPABASE_TABLES.actionQueue)
    .select(
      "id, action_type, target, channel, provider, status, payload, attempts, provider_message_id, error_message, created_at, updated_at"
    )
    .eq("document_id", documentRow.id)
    .order("created_at", { ascending: false });

  if (queueError)
    throw new Error(`Unable to load delivery records: ${queueError.message}`);
  if (!queueRows?.length) return [];

  const queueIds = queueRows.map((row) => row.id);
  const { data: eventRows, error: eventError } = await supabase
    .from(SUPABASE_TABLES.deliveryEvents)
    .select("queue_item_id, status, error_message, event_at")
    .in("queue_item_id", queueIds)
    .order("event_at", { ascending: false });

  if (eventError)
    throw new Error(`Unable to load delivery events: ${eventError.message}`);

  return queueRows.map((row) => {
    const payload = row.payload as IntegrationDeliveryPayload;
    const latestEvent = eventRows?.find(
      (event) => event.queue_item_id === row.id
    );
    return {
      queueItemId: row.id as string,
      documentId: payload.documentId,
      actionType: payload.actionType,
      target: payload.target,
      channel: payload.channel,
      provider: payload.provider,
      queueStatus: row.status as DeliveryRecord["queueStatus"],
      deliveryStatus: (latestEvent?.status ??
        "pending") as DeliveryRecord["deliveryStatus"],
      providerMessageId:
        (row.provider_message_id as string | null) ?? undefined,
      attempts: Number(row.attempts ?? 0),
      errorMessage:
        (latestEvent?.error_message as string | null) ??
        (row.error_message as string | null) ??
        undefined,
      messageText: payload.messageText,
      subject: payload.subject,
      attachmentFilename: payload.attachmentFilename,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string | undefined,
    };
  });
}

export async function retryManualDelivery(
  queueItemId: string
): Promise<DeliveryRecord[]> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    const current = fallbackQueue.find(
      (row) => row.queueItemId === queueItemId
    );
    if (!current) return [];
    const retry = queueFallbackDelivery(current.payload);
    retry.attempts = current.attempts + 1;
    return fallbackQueue
      .filter((row) => row.payload.documentId === current.payload.documentId)
      .map(toFallbackDeliveryRecord);
  }

  const { data: queueRow, error: queueError } = await supabase
    .from(SUPABASE_TABLES.actionQueue)
    .select("id, document_id, payload, attempts")
    .eq("id", queueItemId)
    .single();

  if (queueError)
    throw new Error(`Unable to retry delivery: ${queueError.message}`);

  const payload = queueRow.payload as IntegrationDeliveryPayload;
  const attempts = Number(queueRow.attempts ?? 0) + 1;
  const providerResult = await deliverWithManualProvider({
    queueItemId,
    payload,
  });

  const { error: updateError } = await supabase
    .from(SUPABASE_TABLES.actionQueue)
    .update({
      status: providerResult.queueStatus,
      attempts,
      provider_message_id: providerResult.providerMessageId,
      error_message: null,
      sent_at: new Date().toISOString(),
    })
    .eq("id", queueItemId);

  if (updateError)
    throw new Error(
      `Unable to update retried delivery: ${updateError.message}`
    );

  const { error: deliveryError } = await supabase
    .from(SUPABASE_TABLES.deliveryEvents)
    .insert({
      queue_item_id: queueItemId,
      document_id: queueRow.document_id,
      channel: payload.channel,
      target: payload.target,
      provider: providerResult.provider,
      status: providerResult.deliveryStatus,
      provider_message_id: providerResult.providerMessageId,
      raw_response: providerResult.rawResponse,
    });

  if (deliveryError)
    throw new Error(
      `Unable to write retry delivery event: ${deliveryError.message}`
    );

  return listDeliveryRecordsForDocument(payload.documentId);
}

export async function cancelManualDelivery(
  queueItemId: string
): Promise<DeliveryRecord[]> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    const current = fallbackQueue.find(
      (row) => row.queueItemId === queueItemId
    );
    if (!current) return [];
    current.queueStatus = "cancelled";
    current.deliveryStatus = "cancelled";
    current.updatedAt = new Date().toISOString();
    return fallbackQueue
      .filter((row) => row.payload.documentId === current.payload.documentId)
      .map(toFallbackDeliveryRecord);
  }

  const { data: queueRow, error: queueError } = await supabase
    .from(SUPABASE_TABLES.actionQueue)
    .select("id, document_id, payload")
    .eq("id", queueItemId)
    .single();

  if (queueError)
    throw new Error(`Unable to cancel delivery: ${queueError.message}`);

  const payload = queueRow.payload as IntegrationDeliveryPayload;
  const { error: updateError } = await supabase
    .from(SUPABASE_TABLES.actionQueue)
    .update({ status: "cancelled", error_message: null })
    .eq("id", queueItemId);

  if (updateError)
    throw new Error(
      `Unable to update cancelled delivery: ${updateError.message}`
    );

  const { error: deliveryError } = await supabase
    .from(SUPABASE_TABLES.deliveryEvents)
    .insert({
      queue_item_id: queueItemId,
      document_id: queueRow.document_id,
      channel: payload.channel,
      target: payload.target,
      provider: payload.provider,
      status: "cancelled",
      raw_response: { mode: "manual", cancelled: true },
    });

  if (deliveryError)
    throw new Error(
      `Unable to write cancelled delivery event: ${deliveryError.message}`
    );

  return listDeliveryRecordsForDocument(payload.documentId);
}

async function findProviderAccountId(payload: IntegrationDeliveryPayload) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return null;

  const accountLabel =
    payload.channel === "email" ? "manual-email" : "manual-whatsapp";
  const { data, error } = await supabase
    .from(SUPABASE_TABLES.providerAccounts)
    .select("id")
    .eq("provider", "manual")
    .eq("channel", payload.channel)
    .eq("account_label", accountLabel)
    .maybeSingle();

  if (error)
    throw new Error(`Unable to resolve provider account: ${error.message}`);
  return data?.id ?? null;
}

async function writeLegacyMessageEvent(
  documentId: string,
  payload: IntegrationDeliveryPayload,
  providerResult: ManualProviderResult
) {
  if (payload.channel !== "whatsapp") return;
  if (payload.target !== "marios" && payload.target !== "accounting-group")
    return;

  const supabase = createServiceSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.from(SUPABASE_TABLES.messageEvents).insert({
    document_id: documentId,
    target: payload.target,
    status: "sent",
    message_text: payload.messageText,
    provider_message_id: providerResult.providerMessageId,
    event_at: new Date().toISOString(),
  });

  if (error)
    throw new Error(`Unable to write message history event: ${error.message}`);
}

function queueFallbackDelivery(
  payload: IntegrationDeliveryPayload
): FallbackQueueRow {
  const queueItemId = `fallback-${fallbackQueue.length + 1}`;
  const providerResult = {
    providerMessageId: `manual:${payload.channel}:${payload.actionType}:${queueItemId}`,
    deliveryStatus: "manual-copy-ready" as const,
  };
  const row: FallbackQueueRow = {
    queueItemId,
    providerMessageId: providerResult.providerMessageId,
    deliveryStatus: providerResult.deliveryStatus,
    queueStatus: "sent",
    attempts: 1,
    payload,
    persistenceMode: "fallback",
    createdAt: new Date().toISOString(),
  };
  fallbackQueue = [row, ...fallbackQueue];
  return row;
}

export function __resetIntegrationRepositoryForTests() {
  fallbackQueue = [];
}

export function __getFallbackIntegrationQueueForTests() {
  return structuredClone(fallbackQueue);
}

function toFallbackDeliveryRecord(row: FallbackQueueRow): DeliveryRecord {
  return {
    queueItemId: row.queueItemId,
    documentId: row.payload.documentId,
    actionType: row.payload.actionType,
    target: row.payload.target,
    channel: row.payload.channel,
    provider: row.payload.provider,
    queueStatus: row.queueStatus,
    deliveryStatus: row.deliveryStatus,
    providerMessageId: row.providerMessageId,
    attempts: row.attempts,
    errorMessage: row.errorMessage,
    messageText: row.payload.messageText,
    subject: row.payload.subject,
    attachmentFilename: row.payload.attachmentFilename,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const integrationRepositoryMode = getSupabasePersistenceMode;
