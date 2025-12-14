# Why SOFIA Answers Differently on Vercel (Web) vs WhatsApp

## Overview

SOFIA uses **different system prompts, models, and response formatting** for web (Vercel) and WhatsApp, which causes different answer styles and behaviors.

---

## Key Differences

### 1. **AI Model Used**

**Web (Vercel):**
- User-selectable model (default: `chat-model` = Gemini 3 Pro Preview)
- Options: Gemini 3 Pro, Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 2.5 Flash-Lite
- Model can vary per user/session

**WhatsApp:**
- **Fixed model**: `chat-model-gemini3` (Gemini 3 Pro Preview)
- Always uses the same model regardless of user

**Impact:** Different models have different reasoning capabilities and response styles.

---

### 2. **System Prompt Differences**

**Web (Vercel):**
- Uses the full base system prompt from `lib/ai/prompts.ts`
- Includes all template instructions, formatting rules, and knowledge base
- No platform-specific modifications

**WhatsApp:**
- Uses the **same base prompt** BUT adds a **PLATFORM CONTEXT** section:

```typescript
const whatsappContext = `
PLATFORM CONTEXT: WhatsApp Mobile Messaging
- Users are on mobile and expect quick, concise text responses
- Calculator results (VAT, transfer fees, capital gains) should ALWAYS be formatted as text, NOT documents
- Generate documents when users ask for: "send document", "form", "registration", "contract", "agreement", "template", etc.
- If the user request implies a document (e.g., "I need rental registration"), use the sendDocument tool immediately.
- For calculator queries, provide clear, formatted text responses with tables if needed
- Use emojis sparingly for better readability on mobile
- Keep responses concise but complete
`;
```

**Impact:** WhatsApp responses are instructed to be more concise and mobile-friendly, while web responses can be more detailed.

---

### 3. **Temperature Settings**

**Both platforms:**
- `temperature: 0` (completely deterministic)
- Same temperature = same randomness level

**Impact:** No difference in randomness, but different prompts/models still produce different outputs.

---

### 4. **Context Building**

**Web (Vercel):**
- Uses full message history with proper structure
- Each message maintains its role (user/assistant) and parts
- Full conversation context preserved

**WhatsApp:**
- **Concatenates previous user messages** into a single string:
```typescript
const conversationContext = previousMessages
  .filter((m) => m.role === "user")
  .map((m) => {
    const textPart = m.parts?.find((p) => p.type === "text");
    return textPart && "text" in textPart ? textPart.text : "";
  })
  .join(" ");

const fullContext = `${conversationContext} ${userMessage}`;
```

**Impact:** WhatsApp may lose some context nuance by flattening conversation history.

---

### 5. **Tools Available**

**Web (Vercel):**
- `sendDocument` - Web-specific document sending (email/download)
- `requestSuggestions` - Web-specific suggestions tool

**WhatsApp:**
- `createWhatsAppSendDocumentTool` - WhatsApp-specific document sending
- `requestSuggestionsWhatsApp` - WhatsApp-specific suggestions

**Impact:** Different tool implementations may produce different outputs for the same action.

---

### 6. **Response Formatting**

**Web (Vercel):**
- Streams responses directly to UI
- Full markdown support
- Rich formatting preserved

**WhatsApp:**
- Uses `formatForWhatsApp()` function:
  - Converts `**bold**` → `*bold*` (WhatsApp format)
  - Cleans up multiple newlines
  - May split email responses into 3 separate messages (subject, body, notes)

**Impact:** WhatsApp responses are simplified for mobile readability.

---

### 7. **Document vs Text Decision**

**Web (Vercel):**
- Always streams text responses
- Documents are handled via UI components

**WhatsApp:**
- **Automatically decides** whether to send as document or text:
```typescript
if (shouldSendAsDocument(fullResponse)) {
  // Send as DOCX file
  const docBuffer = await generateDocx(fullResponse);
  await client.sendDocument({ ... });
} else {
  // Send as formatted text
  const formattedResponse = formatForWhatsApp(fullResponse);
  await client.sendLongMessage({ ... });
}
```

**Impact:** WhatsApp may send documents when web would show text, or vice versa.

---

### 8. **Message History Retrieval**

**Web (Vercel):**
- Full chat history with all metadata
- Proper message structure maintained

**WhatsApp:**
- May have fallback behavior if DB fails
- Uses simplified user context if DB operations fail

**Impact:** WhatsApp might have less complete conversation history in some cases.

---

## Summary Table

| Aspect | Web (Vercel) | WhatsApp |
|--------|--------------|----------|
| **Model** | User-selectable (default: Gemini 3 Pro) | Fixed: Gemini 3 Pro |
| **System Prompt** | Full base prompt | Base prompt + Mobile context |
| **Temperature** | 0 | 0 |
| **Context Building** | Full message history | Concatenated user messages |
| **Response Format** | Rich markdown | Simplified WhatsApp format |
| **Document Handling** | UI components | Auto-detect & send DOCX |
| **Tools** | Web-specific tools | WhatsApp-specific tools |
| **Response Style** | Can be detailed | Instructed to be concise |

---

## Why This Matters

1. **Different Instructions**: WhatsApp explicitly tells the AI to be "concise" and "mobile-friendly"
2. **Different Context**: WhatsApp flattens conversation history differently
3. **Different Formatting**: WhatsApp simplifies markdown for mobile
4. **Different Tools**: Platform-specific tool implementations
5. **Auto-Document Detection**: WhatsApp may send documents when web shows text

---

## Recommendations

If you want **consistent responses** across platforms:

1. **Remove platform-specific context** from WhatsApp prompt
2. **Use same context building** method (full message history)
3. **Standardize tool implementations** or make them platform-agnostic
4. **Remove auto-document detection** or make it consistent

If you want **platform-optimized responses** (current approach):

- Keep the differences but document them clearly
- The current setup is intentional for mobile vs desktop UX

---

## Code Locations

- **Web Chat Route**: `app/(chat)/api/chat/route.ts`
- **WhatsApp Handler**: `lib/whatsapp/message-handler.ts`
- **System Prompts**: `lib/ai/prompts.ts`
- **WhatsApp Formatting**: `lib/whatsapp/text-utils.ts`
- **Model Config**: `lib/ai/models.ts` and `lib/ai/providers.ts`

