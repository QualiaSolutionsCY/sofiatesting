import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
type ArtifactKind = "text" | "code" | "image" | "sheet";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { sendDocument } from "./ai/tools/send-document";
import type { Suggestion } from "./db/schema";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type sendDocumentTool = InferUITool<ReturnType<typeof sendDocument>>;

export type ChatTools = {
  requestSuggestions: requestSuggestionsTool;
  sendDocument: sendDocumentTool;
};

// Type for document sending data stream
export type SendDocumentData = {
  id: string;
  title: string;
  url: string;
  content: string;
  size: number;
  suggestedRecipientName?: string;
  suggestedRecipientEmail?: string;
  suggestedRecipientPhone?: string;
  suggestedMethod: "email" | "whatsapp" | "download";
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  usage: AppUsage;
  "send-document": SendDocumentData;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
