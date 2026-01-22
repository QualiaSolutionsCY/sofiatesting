# Codebase Structure

**Analysis Date:** 2026-01-23

## Directory Layout

```
sofiatesting/
├── supabase/                    # LIVE: Edge Functions (Deno runtime)
│   └── functions/
│       ├── sophia-bot/          # LIVE WhatsApp bot (main entry point)
│       └── _shared/             # Shared code for Edge Functions
├── app/                         # NOT DEPLOYED: Next.js 15 web app
│   ├── (auth)/                  # Auth pages and API
│   ├── (chat)/                  # Chat UI and API
│   ├── (admin)/                 # Admin dashboard
│   └── api/                     # REST API routes
├── lib/                         # NOT USED BY LIVE BOT: Next.js utilities
│   ├── ai/                      # AI providers, tools, prompts
│   ├── db/                      # Drizzle schema and queries
│   ├── telegram/                # Telegram utilities
│   ├── whatsapp/                # WhatsApp utilities
│   └── zyprus/                  # Zyprus API client
├── components/                  # React components (web UI)
├── docs/                        # Documentation and templates
├── tests/                       # Test files (unit, manual)
├── UPLOAD-LISTINGS-EXTENSIVE-INFO/  # Zyprus API reference (DO NOT MODIFY)
└── .planning/                   # GSD planning files
```

## Directory Purposes

**supabase/functions/sophia-bot/:**
- Purpose: LIVE WhatsApp bot - all production traffic
- Contains: Webhook handler, AI orchestration, tools, DOCX templates
- Key files:
  - `index.ts`: Main entry point (webhook handler)
  - `tools/definitions.ts`: Tool schemas for OpenRouter
  - `tools/executor.ts`: Tool execution handlers
  - `prompts.ts`: System prompt (imported from _shared)
  - `docx/templates/`: DOCX generation functions
  - `agents/identifier.ts`: Phone-to-agent matching
  - `zyprus/client.ts`: Zyprus API client (Deno)
  - `zyprus/taxonomy-cache.ts`: UUID resolution with fallbacks
  - `services/`: Image handling, description generation, etc.
  - `rules/`: Region validation, reviewer assignment
  - `utils/`: Security, validation, logging

**supabase/functions/_shared/:**
- Purpose: Shared code for all Edge Functions
- Contains: Database client, calculators, prompts, services
- Key files:
  - `mod.ts`: Barrel export for all shared code
  - `db.ts`: Supabase client singleton, chat history ops
  - `prompts.ts`: SYSTEM_PROMPT and logo
  - `calculators.ts`: VAT, transfer fees, capital gains
  - `zyprus.ts`: Zyprus API exports
  - `services.ts`: URL validation, image handling, descriptions
  - `prompts/`: Template-specific prompts

**app/ (NOT DEPLOYED):**
- Purpose: Future web chat interface
- Contains: Next.js 15 pages and API routes
- Key files:
  - `(chat)/api/chat/route.ts`: Streaming chat API
  - `(auth)/auth.ts`: NextAuth configuration
  - `(admin)/admin/`: Admin dashboard pages

**lib/ (NOT USED BY LIVE BOT):**
- Purpose: Shared utilities for Next.js web app only
- Contains: AI setup, DB schema, external clients
- Key files:
  - `ai/providers.ts`: OpenRouter configuration
  - `ai/tools/*.ts`: Tool definitions (web version)
  - `db/schema.ts`: Drizzle ORM schema (all tables)
  - `db/queries.ts`: Database query functions
  - `zyprus/client.ts`: Zyprus API (Node.js version)

**docs/:**
- Purpose: Documentation and template reference
- Contains: PRD, architecture docs, knowledge files
- Key files:
  - `PRD.md`: Product requirements
  - `ARCHITECTURE.md`: System design docs
  - `templates/`: Document template reference
  - `knowledge/`: Cyprus real estate knowledge

## Key File Locations

**Entry Points:**
- `supabase/functions/sophia-bot/index.ts`: LIVE webhook handler
- `app/(chat)/api/chat/route.ts`: Web chat API (not deployed)

**Configuration:**
- `supabase/config.toml`: Supabase project config
- `package.json`: Node.js dependencies (web only)
- `tsconfig.json`: TypeScript config

**Core Logic:**
- `supabase/functions/sophia-bot/tools/executor.ts`: Tool execution
- `supabase/functions/sophia-bot/zyprus/client.ts`: Property uploads
- `supabase/functions/_shared/prompts.ts`: AI system prompt

**Testing:**
- `tests/unit/`: Unit tests (Node.js test runner)
- `tests/manual/`: Manual test scripts (upload testing, API testing)

## Naming Conventions

**Files:**
- kebab-case for all files: `region-validator.ts`, `my-notes-generator.ts`
- Test files: `*.test.ts` in `tests/unit/`
- Edge Function entry: `index.ts`

**Directories:**
- kebab-case: `sophia-bot`, `chat-history`
- Leading underscore for shared: `_shared`
- Route groups in parentheses: `(auth)`, `(chat)`, `(admin)`

**Code:**
- PascalCase: Types, interfaces (`Agent`, `ToolDefinition`)
- camelCase: Functions, variables (`identifyAgentByPhone`, `cachedToken`)
- SCREAMING_SNAKE: Constants (`SYSTEM_PROMPT`, `DEFAULT_COORDINATES`)

## Where to Add New Code

**New AI Tool (LIVE bot):**
1. Define schema in `supabase/functions/sophia-bot/tools/definitions.ts`
2. Add handler in `supabase/functions/sophia-bot/tools/executor.ts`
3. Deploy: `supabase functions deploy sophia-bot --no-verify-jwt`

**New DOCX Template:**
1. Create template in `supabase/functions/sophia-bot/docx/templates/`
2. Export from `supabase/functions/sophia-bot/docx/templates/index.ts`
3. Add detection in `supabase/functions/sophia-bot/docx/detector.ts`
4. Update system prompt in `supabase/functions/_shared/prompts.ts`

**New Shared Service:**
1. Add to `supabase/functions/_shared/services.ts` or new file
2. Export from `supabase/functions/_shared/mod.ts`
3. Import in sophia-bot as needed

**New Database Table:**
1. Add to `lib/db/schema.ts` (Drizzle)
2. Generate migration: `pnpm db:generate`
3. Apply: `pnpm db:migrate`
4. For Edge Functions: use raw SQL via Supabase client

**New Utility:**
- Edge Functions: `supabase/functions/sophia-bot/utils/`
- Shared: `supabase/functions/_shared/`
- Web only: `lib/` (not used by live bot)

## Special Directories

**UPLOAD-LISTINGS-EXTENSIVE-INFO/:**
- Purpose: Source of truth for Zyprus API integration
- Generated: No (reference documentation)
- Committed: Yes
- Note: DO NOT MODIFY - used for API endpoint discovery

**node_modules/:**
- Purpose: npm dependencies for web app
- Generated: Yes (pnpm install)
- Committed: No
- Note: Not used by Edge Functions (they use esm.sh imports)

**.next/:**
- Purpose: Next.js build output
- Generated: Yes (pnpm build)
- Committed: No

**artifacts/:**
- Purpose: Generated content storage
- Generated: Yes (runtime)
- Committed: No (gitignored)

**.planning/:**
- Purpose: GSD workflow files
- Generated: Manually
- Committed: Yes

---

*Structure analysis: 2026-01-23*
