export type ParsedInboundReply =
  | { outcome: "approved"; normalizedText: string }
  | { outcome: "rejected"; normalizedText: string; reason?: string }
  | { outcome: "correction-requested"; normalizedText: string; reason?: string }
  | { outcome: "unknown"; normalizedText: string };

const approvalTokens = [
  "approve",
  "approved",
  "ok",
  "yes",
  "confirmed",
  "go ahead",
];
const rejectionTokens = ["reject", "rejected", "no", "cancel", "do not send"];
const correctionTokens = [
  "correct",
  "correction",
  "change",
  "fix",
  "revise",
  "wrong",
];

export function parseInboundReply(text: string): ParsedInboundReply {
  const normalizedText = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalizedText) return { outcome: "unknown", normalizedText };

  if (hasToken(normalizedText, correctionTokens)) {
    return {
      outcome: "correction-requested",
      normalizedText,
      reason: text.trim(),
    };
  }

  if (hasToken(normalizedText, rejectionTokens)) {
    return { outcome: "rejected", normalizedText, reason: text.trim() };
  }

  if (hasToken(normalizedText, approvalTokens)) {
    return { outcome: "approved", normalizedText };
  }

  return { outcome: "unknown", normalizedText };
}

function hasToken(text: string, tokens: string[]) {
  return tokens.some((token) =>
    new RegExp(`(^|\\b)${escapeRegExp(token)}(\\b|$)`, "i").test(text)
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
