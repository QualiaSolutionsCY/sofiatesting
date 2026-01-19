# feat: Restructure SOPHIA into Clean Multi-Channel Architecture

## Overview

Transform SOPHIA from a monolithic codebase into a **"One Brain, Many Channels"** architecture with a shared core and thin channel handlers.

**Current State**: Code duplicated across 3 channels (~17,154 lines)
**Target State**: Single shared `_shared/` folder with thin channel handlers

> **Note:** This plan was simplified after code review. Gmail channel deferred (YAGNI), prompts kept as 1-2 files, directory structure flattened.

## Problem Statement

| Problem | Impact |
|---------|--------|
| 3 copies of Zyprus client | Bug fixes need 3 changes |
| 3 copies of calculator logic | Different accuracy across channels |
| 3 copies of prompts | 182KB WhatsApp vs 188 lines Telegram |
| No shared tool definitions | WhatsApp has 5 tools, Telegram has 0 |
| Inconsistent naming | `sophia-bot` vs `telegram-sophia` |

## Target Architecture (Simplified)

```
supabase/functions/
├── _shared/
│   ├── mod.ts                    # Barrel export
│   ├── zyprus.ts                 # Client + taxonomy (merged)
│   ├── calculators.ts            # VAT, transfer fees, capital gains
│   ├── prompts.ts                # System prompt (keep as single file, lazy-load later)
│   ├── tools.ts                  # Tool definitions + executor
│   ├── services.ts               # description-gen, image-handler merged
│   ├── db.ts                     # Supabase client + chat history
│   └── adapters/
│       ├── types.ts              # UnifiedMessage interface
│       ├── whatsapp.ts           # WhatsApp message parsing
│       └── telegram.ts           # Telegram message parsing
│
├── sophia-whatsapp/              # Thin WhatsApp handler (renamed from sophia-bot)
│   └── index.ts                  # Webhook + WaSend calls
│
└── sophia-telegram/              # Thin Telegram handler (renamed from telegram-sophia)
    ├── index.ts                  # Webhook + Bot API calls
    └── lead-router.ts            # Telegram-specific feature
```

**10 shared files instead of 30+. Same functionality.**

## Technical Approach - 3 Phases

### Phase 1: Extract Core to _shared/ (Day 1-3)

**Goal**: Move all shared logic to `_shared/`, keep WhatsApp working

#### Tasks

- [ ] Create `supabase/functions/_shared/` directory
- [ ] Create `_shared/adapters/types.ts`:

```typescript
export interface UnifiedMessage {
  channelType: 'whatsapp' | 'telegram';
  senderPhone: string;
  senderName?: string;
  timestamp: Date;
  text?: string;
  images?: { url: string; caption?: string }[];
  documents?: { url: string; filename: string }[];
  location?: { lat: number; lon: number };
  voiceUrl?: string;
  conversationId: string;
  replyToMessageId?: string;
}

export interface UnifiedResponse {
  text?: string;
  document?: { buffer: ArrayBuffer; filename: string };
}
```

- [ ] Create `_shared/db.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

let _client: ReturnType<typeof createClient> | null = null;

export const getSupabaseAdmin = () => {
  if (!_client) {
    _client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }
  return _client;
};
```

- [ ] Move `sophia-bot/zyprus/client.ts` + `taxonomy-cache.ts` → `_shared/zyprus.ts` (merge into one file)
- [ ] Move calculator logic from `sophia-bot/tools/executor.ts` → `_shared/calculators.ts`
- [ ] Move `sophia-bot/tools/definitions.ts` + `executor.ts` → `_shared/tools.ts`
- [ ] Move `sophia-bot/prompts.ts` → `_shared/prompts.ts` (keep as single file for now)
- [ ] Move `sophia-bot/services/description-generator.ts` + `image-handler.ts` → `_shared/services.ts`
- [ ] Create `_shared/mod.ts` barrel export
- [ ] Update `sophia-bot/index.ts` imports to use `../_shared/`
- [ ] Test: `supabase functions serve sophia-bot`
- [ ] Deploy and verify WhatsApp uploads still work
- [ ] Delete old folders: `sophia-bot/zyprus/`, `sophia-bot/tools/`, `sophia-bot/services/`

### Phase 2: Create Adapters & Re-enable Telegram (Day 4-5)

**Goal**: Thin channel handlers using shared core

#### Tasks

- [ ] Create `_shared/adapters/whatsapp.ts`:

```typescript
import type { UnifiedMessage } from "./types.ts";

export const parseWhatsAppMessage = (raw: WaSendWebhook): UnifiedMessage => {
  const msg = raw.data.message;
  return {
    channelType: 'whatsapp',
    senderPhone: msg.key.remoteJid.split('@')[0],
    timestamp: new Date(msg.messageTimestamp * 1000),
    text: msg.message?.conversation || msg.message?.extendedTextMessage?.text,
    images: extractImages(msg),
    conversationId: msg.key.remoteJid,
    replyToMessageId: msg.message?.extendedTextMessage?.contextInfo?.stanzaId,
  };
};

const extractImages = (msg: unknown) => {
  // Extract image URLs from various message types
};
```

- [ ] Create `_shared/adapters/telegram.ts` (similar pattern)
- [ ] Rename `sophia-bot/` → `sophia-whatsapp/`
- [ ] Slim `sophia-whatsapp/index.ts` to:
  - Webhook validation
  - Parse with `parseWhatsAppMessage()`
  - Call shared AI brain from `_shared/`
  - Send response with WaSend

- [ ] Rename `telegram-sophia/` → `sophia-telegram/`
- [ ] Slim `sophia-telegram/index.ts` to use shared core
- [ ] Enable Telegram: `supabase secrets set SOPHIA_TELEGRAM_ENABLED=true`
- [ ] Test both channels work

### Phase 3: Cleanup & Documentation (Day 6)

#### Tasks

- [ ] Delete unused files:
  - `lib/zyprus/` (Node.js version - unused)
  - Any backup files

- [ ] Update `CLAUDE.md` with new structure
- [ ] Update webhook URLs if function names changed
- [ ] Run manual tests:
  - WhatsApp property upload
  - WhatsApp DOCX generation
  - WhatsApp calculators
  - Telegram basic conversation

## Acceptance Criteria

### Functional Requirements

- [ ] WhatsApp property uploads work (same as current)
- [ ] WhatsApp DOCX generation works
- [ ] WhatsApp calculators work
- [ ] Telegram responds to messages using shared AI brain
- [ ] All channels share the same AI personality

### Non-Functional Requirements

- [ ] `_shared/` folder < 300KB total
- [ ] Each channel handler < 400 lines
- [ ] Single source of truth for all tools
- [ ] Single source of truth for prompts
- [ ] No code duplication between channels

### Quality Gates

- [ ] Manual test: WhatsApp property upload end-to-end
- [ ] Manual test: WhatsApp DOCX generation
- [ ] Manual test: Calculator accuracy unchanged
- [ ] Telegram responds correctly

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking WhatsApp uploads | Keep git branch backup, test after each move |
| Import path issues in Deno | Test locally with `supabase functions serve` |
| Deployment failures | Deploy one function at a time |

**Rollback procedure**: Each phase creates a git branch. If issues occur, revert to previous branch and redeploy.

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Duplicated code | ~17,154 lines | ~800 lines (channel-specific) |
| Time to add new tool | Edit 3+ files | Edit 1 file |
| Time to update prompts | Edit 3+ files | Edit 1 file |
| Shared files count | 0 | 10 |

## File Changes Summary

### Files to Create

| File | Purpose |
|------|---------|
| `_shared/mod.ts` | Barrel export |
| `_shared/adapters/types.ts` | UnifiedMessage interface |
| `_shared/adapters/whatsapp.ts` | WhatsApp parsing |
| `_shared/adapters/telegram.ts` | Telegram parsing |
| `_shared/zyprus.ts` | Zyprus client + taxonomy |
| `_shared/calculators.ts` | All calculators |
| `_shared/tools.ts` | Tool definitions + executor |
| `_shared/prompts.ts` | System prompt |
| `_shared/services.ts` | Description gen, image handler |
| `_shared/db.ts` | Supabase client |

### Files to Move

| From | To |
|------|-----|
| `sophia-bot/zyprus/*` | `_shared/zyprus.ts` (merged) |
| `sophia-bot/tools/*` | `_shared/tools.ts` |
| `sophia-bot/prompts.ts` | `_shared/prompts.ts` |
| `sophia-bot/services/*` | `_shared/services.ts` (merged) |

### Files to Delete

| File | Reason |
|------|--------|
| `lib/zyprus/client.ts` | Unused Node.js version |
| `lib/zyprus/taxonomy-cache.ts` | Unused Node.js version |
| `sophia-bot/zyprus/*` | Moved to _shared |
| `sophia-bot/tools/*` | Moved to _shared |
| `sophia-bot/services/*` | Moved to _shared |

### Files to Rename

| From | To |
|------|-----|
| `sophia-bot/` | `sophia-whatsapp/` |
| `telegram-sophia/` | `sophia-telegram/` |

## Deferred Work (YAGNI)

The following were removed from this plan to keep it focused:

- **Gmail channel** - Add when there's an actual user request
- **Prompt modularization** (15+ files) - Single file works, optimize later if needed
- **Per-channel tool restrictions** - All tools available everywhere for now
- **ChannelAdapter interface** - Functions work, add interface if 3+ channels

---

*Simplified after code review - 2026-01-19*
