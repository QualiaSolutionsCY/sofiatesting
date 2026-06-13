# Supabase MCP Operations Reference

Complete reference for all Supabase MCP (Model Context Protocol) operations available for project management.

---

## Project Context

| Key | Value |
|-----|-------|
| **Project ID** | `vceeheaxcrhmpqueudqx` |
| **Project Name** | sophia-whatsapp |
| **API URL** | `https://vceeheaxcrhmpqueudqx.supabase.co` |
| **Region** | eu-west-1 |
| **PostgreSQL Version** | 17.6.1 |

---

## MCP Operations Catalog

### 1. Project Management

| Operation | Description | Example |
|-----------|-------------|---------|
| `list_projects` | List all Supabase projects | Returns project IDs, names, regions, status |
| `get_project` | Get project details | Includes DB version, region, creation date |
| `create_project` | Create new project | Requires org_id, name, region, cost confirmation |
| `pause_project` | Pause a project | Stops compute, retains data |
| `restore_project` | Restore paused project | Brings project back online |
| `get_project_url` | Get API URL | Returns `https://{project_id}.supabase.co` |
| `get_publishable_keys` | Get API keys | Returns anon key + publishable keys |

### 2. Database Operations

| Operation | Description | Usage |
|-----------|-------------|-------|
| `list_tables` | List all tables with schema | `list_tables(project_id, schemas=["public"])` |
| `execute_sql` | Run arbitrary SQL | For SELECT, INSERT, UPDATE queries |
| `apply_migration` | Apply DDL migration | For CREATE TABLE, ALTER, etc. |
| `list_migrations` | View migration history | Shows applied migrations |
| `list_extensions` | List installed extensions | pgvector, pg_cron, etc. |
| `generate_typescript_types` | Generate TS types | Full Database type definitions |

### 3. Edge Functions

| Operation | Description | Usage |
|-----------|-------------|-------|
| `list_edge_functions` | List all functions | Returns name, version, status |
| `get_edge_function` | Get function code | Returns all files in function |
| `deploy_edge_function` | Deploy/update function | Upload new code version |

### 4. Monitoring & Advisors

| Operation | Description | Usage |
|-----------|-------------|-------|
| `get_logs` | Get service logs | Services: api, postgres, edge-function, auth, storage |
| `get_advisors` | Get recommendations | Types: security, performance |

### 5. Branching (Preview Environments)

| Operation | Description | Usage |
|-----------|-------------|-------|
| `create_branch` | Create dev branch | Copies schema, fresh data |
| `list_branches` | List all branches | Shows branch status |
| `delete_branch` | Delete a branch | Removes branch database |
| `merge_branch` | Merge to production | Applies migrations to main |
| `reset_branch` | Reset branch state | Discards untracked changes |
| `rebase_branch` | Rebase on production | Syncs newer prod migrations |

### 6. Documentation Search

| Operation | Description | Usage |
|-----------|-------------|-------|
| `search_docs` | Search Supabase docs | GraphQL query for guides, API refs |

---

## Current Project Statistics

### Database Tables (24 total)

| Table | Size | Purpose |
|-------|------|---------|
| `sophia_conversation_memory` | 12 MB | Vector embeddings for RAG |
| `chat_history` | 1760 kB | WhatsApp message history |
| `processed_webhooks` | 488 kB | Deduplication tracking |
| `webhook_debug_logs` | 416 kB | Debugging webhook payloads |
| `sophia_prompts` | 208 kB | Editable AI prompts |
| `telegram_leads` | 96 kB | Lead forwarding records |
| `agents` | 80 kB | Agent roster (30 agents) |

### Edge Functions (6 deployed)

| Function | Version | Purpose |
|----------|---------|---------|
| `sophia-bot` | v362 | Main WhatsApp AI bot |
| `whatsapp-webhook` | v74 | Legacy webhook handler |
| `telegram-sophia` | v48 | Telegram AI bot (disabled) |
| `telegram-health` | v10 | Health check endpoint |
| `telegram-monitor` | v10 | Monitoring endpoint |
| `telegram-stats` | v10 | Statistics endpoint |

### Prompt Sections (DB-editable)

| Key | Priority | Size | Last Updated |
|-----|----------|------|--------------|
| `identity` | 10 | 840 chars | 2026-01-23 |
| `safety_rules` | 20 | 3,540 chars | 2026-01-23 |
| `document_routing` | 30 | 5,731 chars | 2026-01-23 |
| `property_upload` | 40 | 5,698 chars | 2026-01-23 |
| `response_format` | 50 | 5,035 chars | 2026-01-23 |
| `calculators` | 60 | 4,294 chars | 2026-01-23 |
| `cyprus_knowledge` | 70 | 10,640 chars | 2026-01-23 |

### Usage Stats

- **Total Messages**: 2,359
- **Unique Users**: 27
- **First Message**: 2025-12-15
- **Last Message**: 2026-01-24

---

## Extensions Installed

| Extension | Version | Purpose |
|-----------|---------|---------|
| `vector` | 0.8.0 | pgvector for embeddings/RAG |
| `pg_cron` | 1.6.4 | Scheduled jobs |
| `pg_graphql` | 1.5.11 | GraphQL API |
| `uuid-ossp` | 1.1 | UUID generation |
| `pgcrypto` | 1.3 | Cryptographic functions |
| `pg_stat_statements` | 1.11 | Query performance stats |
| `supabase_vault` | 0.3.1 | Secrets management |
| `plpgsql` | 1.0 | PL/pgSQL procedures |

---

## Database Functions (RPC)

| Function | Purpose |
|----------|---------|
| `get_or_create_sophia_user` | Create/fetch user profile |
| `get_sophia_recent_context` | Fetch recent chat context |
| `search_sophia_memory` | Vector similarity search on memory |
| `search_sophia_knowledge` | Vector search on knowledge base |
| `select_next_agent_atomic` | Round-robin agent selection |
| `cleanup_old_chat_history` | Cleanup scheduled job |
| `cleanup_old_processed_webhooks` | Dedup table maintenance |
| `get_daily_lead_stats` | Analytics function |
| `get_lead_stats_by_region` | Regional analytics |

---

## Performance Advisors (7 issues)

### Unindexed Foreign Keys
These FKs could benefit from indexes for JOIN performance:

1. `Chat.userId` → `User.id`
2. `Document.userId` → `User.id`
3. `lead_forwarding_rotation.last_forwarded_to_agent_id` → `agents.id`
4. `Message_v2.chatId` → `Chat.id`
5. `sophia_conversation_memory.user_id` → `sophia_user_profiles.id`
6. `Stream.chatId` → `Chat.id`
7. `Suggestion.documentId` → `Document.id`

### Unused Indexes (14 found)
Consider removing unused indexes to save storage and improve write performance.

---

## Common MCP Usage Patterns

### 1. Check Project Health
```
get_logs(project_id, service="edge-function")
get_advisors(project_id, type="security")
get_advisors(project_id, type="performance")
```

### 2. Debug SOPHIA Issues
```
get_logs(project_id, service="edge-function")
execute_sql(project_id, "SELECT * FROM chat_history ORDER BY created_at DESC LIMIT 10")
```

### 3. Update Prompts
```
execute_sql(project_id, "UPDATE sophia_prompts SET content = '...' WHERE key = 'identity'")
```

### 4. Deploy Edge Function
```
deploy_edge_function(project_id, name="sophia-bot", files=[...])
```

### 5. Generate Types After Schema Change
```
generate_typescript_types(project_id)
```

---

## Edge Function Logs Analysis

Recent logs show healthy operation:
- All requests returning **200 status**
- Execution times: 170ms - 30s (longer for DOCX generation)
- Current version: **v362** (sophia-bot)
- Last activity: Active (within last hour)

---

## Security Status

✅ **No security issues flagged**
- All tables have RLS enabled
- No exposed sensitive data detected

---

## Quick Reference Commands

```bash
# Deploy sophia-bot
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# View logs
supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx

# Check secrets
supabase secrets list --project-ref vceeheaxcrhmpqueudqx
```

---

*Generated: 2026-01-24 via Supabase MCP exploration*
