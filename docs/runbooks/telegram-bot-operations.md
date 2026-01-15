# SOPHIA Telegram Bot - Operations Runbook

## System Overview

**SOPHIA Telegram Bot** is an AI-powered assistant for Zyprus Property Group that:
- Answers Cyprus real estate questions via direct messages
- Routes leads from Telegram groups to appropriate agents
- Uses OpenRouter (Gemini) for AI responses

### Architecture

```
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│  Telegram API   │────▶│  Supabase Edge Function  │────▶│   OpenRouter    │
│  (Webhook)      │     │  telegram-sophia         │     │   (Gemini AI)   │
└─────────────────┘     └──────────────────────────┘     └─────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────────┐
                        │   Supabase PostgreSQL    │
                        │  - Chat history          │
                        │  - Lead tracking         │
                        │  - Agent registry        │
                        └──────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Main Webhook | `telegram-sophia` Edge Function | Process messages |
| Health Check | `telegram-health` Edge Function | System status |
| Monitor | `telegram-monitor` Edge Function | Webhook monitoring |
| Database | Supabase PostgreSQL | Data storage |

---

## Quick Reference

### URLs

| Endpoint | URL |
|----------|-----|
| Webhook | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-sophia` |
| Health Check | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-health` |
| Monitor | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-monitor` |
| Stats API | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-stats` (requires auth) |
| Supabase Dashboard | https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx |

### Required Secrets

Set via Supabase Dashboard > Edge Functions > Secrets:

| Secret | Purpose |
|--------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot authentication |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook validation |
| `OPENROUTER_API_KEY` | AI model access |
| `ALERT_TELEGRAM_CHAT_ID` | Alert notifications (optional) |

---

## Health Checks

### Check System Health

```bash
curl https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-health
```

**Healthy Response:**
```json
{
  "status": "pass",
  "checks": {
    "database": {"status": "pass"},
    "telegram_webhook": {"status": "pass"},
    "recent_leads": {"status": "pass"},
    "registered_agents": {"status": "pass"}
  }
}
```

**Status Values:**
- `pass` - All systems operational
- `warn` - Degraded but functional
- `fail` - Critical issue

### Check Webhook Status

```bash
# Via Telegram API directly
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

**Key Fields:**
- `pending_update_count` - Should be 0 or low
- `last_error_message` - Check for errors
- `last_error_date` - When last error occurred

### Run Monitor Check

```bash
curl -X POST https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-monitor
```

---

## Common Issues

### Issue: Bot Not Responding

**Symptoms:** Messages sent to bot receive no response

**Diagnosis:**
1. Check health endpoint
2. Check Edge Function logs:
   ```bash
   supabase functions logs telegram-sophia --project-ref vceeheaxcrhmpqueudqx
   ```
3. Check webhook status via Telegram API

**Common Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Webhook not set | Run setup script (see Deployment section) |
| Invalid bot token | Update `TELEGRAM_BOT_TOKEN` secret |
| Edge Function error | Check logs, redeploy if needed |
| OpenRouter API issue | Check `OPENROUTER_API_KEY` |

### Issue: 401 Unauthorized Errors

**Cause:** Webhook secret mismatch or `--no-verify-jwt` flag missing

**Fix:**
```bash
# Redeploy with correct flag
cd supabase/functions/telegram-sophia
supabase functions deploy telegram-sophia --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

### Issue: Leads Not Being Forwarded

**Symptoms:** Group messages with property links not forwarded to agents

**Diagnosis:**
1. Check if message contains zyprus.com URL or property ID
2. Check if group has `lead_routing_enabled = true`
3. Check if target agents have `telegram_user_id` set

**Query to check:**
```sql
-- Check group routing status
SELECT group_name, lead_routing_enabled, region
FROM telegram_groups
WHERE telegram_chat_id = <CHAT_ID>;

-- Check agent registration
SELECT full_name, telegram_user_id, region, can_receive_leads
FROM agents
WHERE can_receive_leads = true;
```

### Issue: Duplicate Messages

**Symptoms:** Same lead forwarded multiple times

**Cause:** Deduplication window issue or message claim failure

**Check:**
```sql
-- Check processed messages
SELECT * FROM telegram_processed_messages
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Issue: High Pending Updates

**Symptoms:** `pending_update_count` > 100 in webhook info

**Cause:** Bot overwhelmed or processing slow

**Fix:**
1. Check for errors in logs
2. If stuck, reset webhook:
   ```bash
   # Delete webhook
   curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

   # Re-set webhook
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-sophia&secret_token=<SECRET>"
   ```

---

## Deployment

### Deploy Edge Function

```bash
cd /path/to/sofiatesting
supabase functions deploy telegram-sophia --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

**Important:** Always use `--no-verify-jwt` flag for Telegram webhooks.

### Set Webhook

```bash
# Set webhook with secret token
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-sophia" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

### Update Secrets

Via Supabase Dashboard:
1. Go to Edge Functions > Secrets
2. Add/update the secret
3. Redeploy the function

Or via CLI:
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<value> --project-ref vceeheaxcrhmpqueudqx
```

---

## Database Maintenance

### Automatic Cleanup (pg_cron)

The following cleanup jobs run automatically:

| Job | Schedule | Retention |
|-----|----------|-----------|
| `cleanup-processed-messages` | Daily 3 AM UTC | 7 days |
| `cleanup-chat-history` | Daily 3 AM UTC | 30 days |
| `cleanup-registrations` | Hourly | Expired only |
| `cleanup-webhook-logs` | Daily 4 AM UTC | 7 days |
| `cleanup-cleanup-logs` | Weekly (Sun 4 AM) | 30 days |

### Check Cron Jobs

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job;
```

### View Cleanup History

```sql
SELECT * FROM cleanup_logs
ORDER BY cleaned_at DESC
LIMIT 20;
```

### Manual Cleanup

```sql
-- Run cleanup manually if needed
SELECT cleanup_old_processed_messages();
SELECT cleanup_old_chat_history();
```

---

## Monitoring

### View Recent Leads

```sql
SELECT
  created_at,
  source_group_name,
  property_reference_id,
  status,
  forwarded_to_agent_id
FROM telegram_leads
ORDER BY created_at DESC
LIMIT 20;
```

### Lead Stats by Region

```sql
SELECT * FROM get_lead_stats_by_region(7);  -- Last 7 days
```

### Lead Stats by Agent

```sql
SELECT * FROM get_lead_stats_by_agent(7);  -- Last 7 days
```

### Stats Dashboard API

The stats API provides comprehensive dashboard data (requires Supabase auth):

```bash
# Using anon key (read access)
curl -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-stats?days=7"
```

**Response includes:**
- Summary (total leads, registered agents, active groups)
- Leads by region
- Leads by agent
- Daily breakdown
- Group status
- Recent cleanup logs

### Check Webhook Health History

```sql
SELECT * FROM webhook_health_logs
ORDER BY checked_at DESC
LIMIT 10;
```

### Edge Function Logs

```bash
# Real-time logs
supabase functions logs telegram-sophia --project-ref vceeheaxcrhmpqueudqx --scroll

# Last 100 lines
supabase functions logs telegram-sophia --project-ref vceeheaxcrhmpqueudqx
```

---

## Agent Management

### Register New Agent

Agents self-register via the `/register` command in direct chat with the bot:
1. Agent sends `/register` to bot
2. Bot asks for phone number
3. Agent enters phone (must match database record)
4. Bot links Telegram ID to agent record

### Check Agent Registration

```sql
SELECT id, full_name, telegram_user_id, phone, region, can_receive_leads
FROM agents
WHERE is_active = true;
```

### Manually Link Agent

```sql
UPDATE agents
SET telegram_user_id = <TELEGRAM_USER_ID>
WHERE phone = '+357XXXXXXXX';
```

---

## Routing Rules

### Current Lead Routing Logic

1. **Client requests specific agent** → Direct forward to that agent
2. **Paphos region** → 50/50 rotation between Marios Azinas and Dimitris Panayiotou
3. **Limassol/Larnaca** → Michelle, Lauren, Qualia Admin (Russian preference: Diana)
4. **Others group** → Ivan, Narine, Michelle
5. **Fallback** → Limassol agents

### Check Routing Configuration

See `supabase/functions/telegram-sophia/routing-constants.ts` for current agent lists.

---

## Escalation

### When to Escalate

- Health check returning `fail` status
- Pending updates > 1000
- Multiple agents reporting missing leads
- AI responses consistently failing

### Contact

- **Technical Issues:** Check Supabase status page, OpenRouter status
- **Bot Token Issues:** Regenerate via @BotFather on Telegram
- **Database Issues:** Supabase Dashboard > Database

---

## Appendix

### Useful SQL Queries

```sql
-- Count messages by day
SELECT DATE(created_at), COUNT(*)
FROM telegram_chat_history
GROUP BY DATE(created_at)
ORDER BY 1 DESC;

-- Active groups
SELECT telegram_chat_id, group_name, lead_routing_enabled, region
FROM telegram_groups
WHERE lead_routing_enabled = true;

-- Failed leads
SELECT * FROM telegram_leads
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Rotation state
SELECT * FROM telegram_rotation_state;
```

### File Locations

```
supabase/functions/
├── telegram-sophia/     # Main bot webhook
│   ├── index.ts         # Entry point
│   ├── lead-router.ts   # Lead forwarding logic
│   ├── database.ts      # Database operations
│   ├── prompts.ts       # AI system prompt
│   └── routing-constants.ts  # Agent lists
├── telegram-health/     # Health check endpoint
└── telegram-monitor/    # Webhook monitoring
```
