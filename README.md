# SOFIA – Zyprus Property Group AI Assistant

SOFIA is a production-grade Next.js 15 application that serves as the AI-powered assistant for Zyprus Property Group. Built with Vercel's AI SDK and Google Gemini API, it provides intelligent real estate document drafting, property listing management, and automated support through web, Telegram, and WhatsApp interfaces.

## 🚨 Critical Architecture Update

**SOFIA exclusively uses Google Gemini API** (Gemini 2.5 generation). There are no fallback options - Gemini API configuration is mandatory. Set `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` environment variable.

## 🚀 Active Development

**Optimization work in progress!** See `IMPLEMENTATION_PLAN.md` for:
- 12 prioritized performance & cost optimizations (11 completed)
- Current implementation status
- Testing & deployment checklists
- Performance metrics tracking

All contributors and AI agents MUST reference `IMPLEMENTATION_PLAN.md` before starting work.

## Core Features

- **AI-Powered Chat Interface** – Secure, access-code gated UI with guest and registered user sessions
- **Multi-Model Support** – Gemini 2.5 Flash (default), Gemini 2.5 Pro, Gemini 2.5 Flash-Lite
- **Template Engine** – 38 Cyprus real estate templates with smart field extraction
- **Property Listing Management** – Create, review, and upload listings to Zyprus API with retry logic
- **Telegram Bot Integration** – Webhook-powered conversational interface for external support
- **WhatsApp Integration** – Document detection and DOCX generation
- **Document Generation** – AI-assisted drafting of contracts, agreements, and property descriptions
- **Cyprus-Specific Tools** – Transfer fee, capital gains tax, and VAT calculators

## Tech Stack

- **Framework**: Next.js 15.3.0 with App Router
- **AI Platform**: Vercel AI SDK 5.0 with Google Gemini API
- **Models**: Gemini 2.5 Flash/Pro/Flash-Lite
- **Database**: Supabase PostgreSQL with Drizzle ORM
- **Authentication**: NextAuth.js 5.0 Beta
- **Rate Limiting**: Upstash Redis
- **Styling**: Tailwind CSS 4.0
- **Deployment**: Vercel

## Requirements

- Node.js 20+
- pnpm 9.x
- PostgreSQL (Supabase recommended - Session Pooler for Vercel)
- Redis (Upstash for rate limiting)
- **Google Gemini API Key** (REQUIRED - no fallback)
- Zyprus API OAuth credentials (for property uploads)
- Telegram Bot Token (optional, for bot integration)

## Environment Configuration

All required environment variables are documented in `.env.example`.

**For local development:**
1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in real values in `.env.local` (never commit this file)
3. Required minimum for local dev:
   - `OPENROUTER_API_KEY` - AI model access
   - `POSTGRES_URL` - Database connection
   - `SUPABASE_URL` + `SUPABASE_ANON_KEY` - Supabase client
   - `AUTH_SECRET` - Session signing (generate: `openssl rand -base64 32`)

**For Edge Functions (production):**
Set secrets via Supabase CLI:
```bash
supabase secrets set KEY=value --project-ref vceeheaxcrhmpqueudqx
```

See `.env.example` for complete list and provider links.

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your credentials (GOOGLE_GENERATIVE_AI_API_KEY is mandatory!)

# Initialize database
pnpm db:generate
pnpm db:migrate

# Start development server
pnpm dev
```

Visit `http://localhost:3000` and enter the access code to begin.

## Model Configuration

SOFIA uses Google Gemini 2.5 models (see `lib/ai/providers.ts`):

| Model ID | Actual Model | Use Case |
|----------|-------------|----------|
| `chat-model` | Gemini 2.5 Flash | Default - best price-performance with thinking |
| `chat-model-pro` | Gemini 2.5 Pro | Complex reasoning, extended context |
| `chat-model-flash-lite` | Gemini 2.5 Flash-Lite | Ultra-fast, cost-efficient |

Gemini 2.5 Flash is the default for optimal price/performance balance.

## Development Commands

### Core Development
```bash
pnpm dev          # Start Next.js dev server with Turbo
pnpm build        # Production build
pnpm start        # Start production server
```

### Code Quality
```bash
pnpm lint         # Run Ultracite linting (checks only)
pnpm format       # Auto-fix with Ultracite
```

### Database Management
```bash
pnpm db:generate  # Generate Drizzle migrations
pnpm db:migrate   # Apply migrations to database
pnpm db:studio    # Launch Drizzle Studio GUI
pnpm db:push      # Push schema directly (skip migrations)
pnpm db:pull      # Pull schema from database
```

### Testing
```bash
pnpm test         # Run Playwright E2E tests
pnpm test:unit    # Run unit tests
pnpm test:ai-models # Test AI model connectivity
```

**Note**: E2E tests require `PLAYWRIGHT=True` environment variable and a running dev server.

## Project Structure

```
app/
├── (auth)/           # Authentication pages
├── (chat)/           # Main chat interface
│   ├── api/chat/     # Streaming AI endpoint
│   └── chat/[id]/    # Individual chat sessions
├── api/
│   ├── listings/     # Property listing CRUD
│   ├── templates/    # Template metadata
│   └── telegram/     # Telegram webhook
└── properties/       # Property management UI

lib/
├── ai/
│   ├── providers.ts  # Gemini API configuration
│   ├── prompts.ts    # System prompts
│   ├── knowledge/    # Cyprus real estate knowledge base
│   └── tools/        # Cyprus real estate tools
├── db/
│   ├── schema.ts     # Drizzle schema
│   └── queries.ts    # Database operations
└── zyprus/
    └── client.ts     # Zyprus API integration

docs/
├── guides/           # Setup documentation
├── knowledge/        # Domain knowledge
├── templates/        # Template registry
└── updates/          # Change logs
```

## Documentation

Comprehensive documentation in `docs/`:
- `docs/README.md` – Documentation index
- `docs/guides/` – Setup guides for AI Gateway, deployment, Telegram
- `docs/knowledge/` – Cyprus real estate domain knowledge
- `docs/templates/` – Template system overview
- `CLAUDE.md` – AI agent instructions (root directory)
- `IMPLEMENTATION_PLAN.md` – Current optimization work

## Deployment

### Vercel Deployment

```bash
# Install Vercel CLI
pnpm i -g vercel

# Deploy to Vercel
vercel --prod

# Required environment variables in Vercel dashboard:
# - GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY (mandatory)
# - POSTGRES_URL (Session Pooler format for IPv4)
# - AUTH_SECRET
# - All other production credentials
```

### Configuration Files
- `vercel.json` – Function configuration and cron jobs
- `next.config.ts` – Next.js configuration
- `middleware.ts` – Access control and auth routing

## Architecture Highlights

### Google Gemini API Integration
- **No Fallbacks**: Gemini API key is mandatory - app won't function without it
- **Unified Access**: All models accessed through `@ai-sdk/google`
- **Model Selection**: Users can choose between Flash, Pro, and Flash-Lite models
- **Knowledge Embedding**: Cyprus real estate knowledge embedded in system prompts (24h cache)

### Authentication Flow
1. **Access Code Gate**: All pages require `qualia-access=granted` cookie
2. **Guest Auto-Login**: Unauthenticated users get guest sessions
3. **Rate Limiting**: Different quotas for guest vs registered users
4. **Session Management**: JWT-based with NextAuth.js

### Cyprus Real Estate Tools
- Capital gains tax calculator
- Property transfer fee calculator
- VAT calculator for real estate
- Property listing creation and management
- Integration with Zyprus property platform

## Troubleshooting

### Common Issues

**503 Errors / AI not responding**
- Verify `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` is set in Vercel
- Check Google AI Studio for quota limits: https://aistudio.google.com

**Database connection fails on Vercel**
- Vercel is IPv4-only - use Session Pooler connection format
- NOT: `db.PROJECT_ID.supabase.co` (will fail with DNS errors)
- USE: `aws-1-eu-west-3.pooler.supabase.com`

**Rate limiting errors**
- Guest users have lower message quotas
- Check `lib/ai/entitlements.ts` for limits
- Upgrade to registered account for higher quotas

**Property upload failures**
- Verify Zyprus OAuth credentials
- Check `ListingUploadAttempt` table for error details
- Ensure all required fields are populated

## Contributing

1. Create feature branches from `main`
2. Reference `IMPLEMENTATION_PLAN.md` for ongoing work
3. Update documentation in `docs/` for significant changes
4. Run tests before submitting PRs
5. Include screenshots for UI changes

## License

MIT License - see `LICENSE` file

---

**Need Help?** Check `CLAUDE.md` for detailed development patterns and `docs/README.md` for comprehensive documentation.