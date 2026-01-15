# RAG Prevention Framework

A comprehensive prevention system for the 6 critical issues that were fixed in this codebase. This framework prevents recurrence through code review, automated checks, and developer education.

## Quick Start

### For Developers
Before committing code:
```bash
./scripts/check-rag-issues.sh
```

### For Code Reviewers
When reviewing a PR:
1. Open `/docs/RAG-PREVENTION-CHECKLIST.md`
2. Use the grep commands specific to your PR's changes
3. Run the automated check script

### For Team Leads
Set up prevention framework:
```bash
# Enable pre-commit hook
cp .husky/pre-commit-rag .husky/pre-commit

# Enable GitHub Actions (already set up in .github/workflows/rag-prevention.yml)
git add .github/workflows/rag-prevention.yml && git commit -m "Enable RAG prevention checks"
```

---

## The 6 Issues & Solutions

### 1. API Keys in URL Query Parameters ⚠️
**Impact**: Security breach - keys logged in access logs, CDN logs, error tracking

**Prevention**:
- Pre-commit hook blocks commits with `?key=`, `?token=` patterns
- Code review checks for `Authorization` header usage
- GitHub Actions validates no secrets in URLs

**Check Command**:
```bash
grep -r '?.*KEY\|Bearer.*\${' app/ lib/ supabase/
```

### 2. Sequential Blocking Operations 🚀
**Impact**: Performance - Webhook timeouts, slow responses

**Prevention**:
- Developers trained on fire-and-forget pattern
- Code review enforces <100ms webhook returns
- Performance tests measure handler timing

**Check Command**:
```bash
grep -B2 'for\|forEach' index.ts | grep 'await fetch\|await db'
```

### 3. Dead/Unused Code 🧹
**Impact**: Maintainability - Confusion, hidden bugs, technical debt

**Prevention**:
- Deprecated code requires removal date
- Code review checks for `@deprecated` without removal plan
- Quarterly cleanup removes dead code >3 months old

**Check Command**:
```bash
grep '@deprecated' app/ lib/ | grep -v '202[6-9]\|removal'
```

### 4. Multiple Database Clients ⚡
**Impact**: Architecture - Connection pool exhaustion, inconsistent state

**Prevention**:
- Single `lib/supabase.ts` exports singleton
- Code review verifies no `new Supabase()` outside singleton file
- GitHub Actions checks for multiple client files

**Check Command**:
```bash
grep -r 'new Supabase\|createClient' app/ lib/ | grep -v 'lib/supabase'
```

### 5. PII Leakage to AI Providers 🔒
**Impact**: Privacy/GDPR - Violations, compliance risks

**Prevention**:
- Code review checks prompts for email/phone/names
- Developers trained to use UUIDs instead of PII
- Automated grep patterns detect email/phone in prompts

**Check Command**:
```bash
grep -r '[a-z0-9._%+-]\+@[a-z0-9.-]\+' supabase/functions/*/prompts.ts
```

### 6. Missing Caching for Repeated Calls 💾
**Impact**: Performance/Cost - API quota waste, increased latency

**Prevention**:
- Code review verifies expensive operations are cached
- Developers document cache TTL strategy
- Performance tests validate cache hit rates

**Check Command**:
```bash
grep -r 'fetch.*taxonomy\|db.query' app/ lib/ | wc -l
```

---

## Framework Components

### 1. Developer Tools
```
scripts/
├── check-rag-issues.sh       # Run before committing (checks all 6 issues)
```

**Usage**:
```bash
# Full check
./scripts/check-rag-issues.sh

# Fail on warnings (strict mode)
./scripts/check-rag-issues.sh --fail-on-warning
```

### 2. Pre-commit Hook
```
.husky/
├── pre-commit-rag            # Blocks commits with RAG issues
```

**Setup**:
```bash
cp .husky/pre-commit-rag .husky/pre-commit
git add .husky/pre-commit
```

### 3. CI/CD Pipeline
```
.github/workflows/
├── rag-prevention.yml        # Automated checks on PR/push
```

Runs on:
- Every pull request
- Pushes to main branch
- Changes to `*.ts`, `*.js`, `supabase/functions/`, `lib/`, `app/`

### 4. Code Review Guides
```
docs/
├── RAG-PREVENTION-CHECKLIST.md      # Detailed review checklist
├── RAG-PREVENTION-STRATEGIES.md     # Strategic patterns & best practices
└── RAG-PREVENTION-README.md         # This file
```

---

## Workflow Integration

### Developer Workflow
```
1. Write code
   ↓
2. Run: ./scripts/check-rag-issues.sh
   ↓
3. If OK → git commit (pre-commit hook runs again)
   ↓
4. If OK → Push to GitHub
   ↓
5. GitHub Actions runs full checks
   ↓
6. Code review uses checklist
   ↓
7. Merge when all checks pass
```

### Code Review Workflow
```
1. Open PR
   ↓
2. GitHub Actions runs RAG prevention checks
   ↓
3. Reviewer opens RAG-PREVENTION-CHECKLIST.md
   ↓
4. Run grep commands for relevant issues
   ↓
5. Use specific checklist section
   ↓
6. Approve if all checks pass
   ↓
7. Request changes if issues found
```

---

## Quick Reference

### By Issue Type

#### Security (Issues 1, 5)
```bash
# Check API keys
grep -r '\?.*KEY\|Bearer.*\${' app/ lib/ supabase/

# Check PII
grep -r '@[a-z0-9]\|phone\|email' supabase/functions/*/prompts.ts
```

#### Performance (Issues 2, 6)
```bash
# Check blocking operations
grep -B2 'for\|forEach' index.ts | grep 'await fetch'

# Check caching
rg 'redis\.get|cache\(' --type ts | wc -l
```

#### Code Quality (Issues 3, 4)
```bash
# Check deprecated
grep '@deprecated' app/ lib/ | grep -v '202[6-9]'

# Check clients
grep -r 'new Supabase' app/ lib/ | grep -v 'lib/supabase'
```

### By File Type

#### Reviewing Prompts
```bash
# Check for emails
grep -r '@' supabase/functions/*/prompts.ts

# Check for phone
grep -r '+[0-9]' supabase/functions/*/prompts.ts

# Check for names
grep -r 'Name\|fullName' supabase/functions/*/prompts.ts
```

#### Reviewing API Handlers
```bash
# Check for quick returns
grep -A5 'serve\|webhook' index.ts | grep 'return'

# Check for parallel ops
grep -c 'Promise.all\|Promise.allSettled' index.ts
```

#### Reviewing Database Code
```bash
# Check singleton import
grep 'import.*supabase' database.ts

# Check for new instances
grep 'new Supabase\|createClient' database.ts
```

---

## Best Practices

### Security
- ✅ Secrets in headers only, never in URLs
- ✅ No PII in system prompts (use UUIDs/hashes)
- ✅ Environment variables loaded once at startup
- ✅ Webhook signatures verified before processing

### Performance
- ✅ Webhook handlers return <100ms
- ✅ Non-critical ops are fire-and-forget
- ✅ Database calls parallelized with `Promise.all`
- ✅ Expensive ops cached (1h for taxonomy, 24h for configs)

### Maintainability
- ✅ Deprecated code has removal dates
- ✅ Dead code removed immediately
- ✅ Single implementation per feature
- ✅ Database clients use singleton pattern

---

## Metrics & Monitoring

### Track These Metrics
```typescript
// Cache effectiveness
console.log(`[Cache] Hit rate: ${hits}/${total} = ${hitRate}%`);
// Should be >75%

// Webhook performance
console.log(`[Webhook] Response time: ${elapsed}ms`);
// Should be <100ms

// Error rate
console.log(`[Error] Rate: ${errors}/${total} = ${errorRate}%`);
// Should be <0.1%
```

### Alerts to Set
- Cache hit rate drops below 50%
- Webhook response time exceeds 500ms
- API quota approaching limit
- Dead code accumulating (>10 functions)

---

## Maintenance Schedule

### Weekly
- Monitor webhook response times
- Review error logs for patterns
- Spot-check cache effectiveness

### Monthly
- Run `./scripts/check-rag-issues.sh` on main
- Review deprecated code removal progress
- Audit API usage vs quota

### Quarterly
- Remove deprecated code >3 months old
- Review and update this documentation
- Conduct code review training refresher
- Analyze metrics for trends

---

## Team Training

### New Developer Onboarding
1. Read this README (10 min)
2. Read RAG-PREVENTION-STRATEGIES.md (20 min)
3. Run check script on sample code (5 min)
4. Do mock code review with checklist (15 min)

### Code Reviewer Training
1. Understand all 6 issues (in RAG-PREVENTION-STRATEGIES.md)
2. Memorize key grep commands
3. Bookmark RAG-PREVENTION-CHECKLIST.md
4. Review 2-3 PRs with mentor

### Quarterly Refresher
- Team reads latest patterns in RAG-PREVENTION-STRATEGIES.md
- Review any issues found in past quarter
- Update prevention rules based on new patterns

---

## Troubleshooting

### "Pre-commit hook failed - what do I do?"

1. Run the check script to see issues:
   ```bash
   ./scripts/check-rag-issues.sh
   ```

2. Fix the specific issue (see RAG-PREVENTION-STRATEGIES.md)

3. Try commit again:
   ```bash
   git commit -m "message"
   ```

4. If you absolutely must skip (not recommended):
   ```bash
   git commit --no-verify
   ```

### "GitHub Actions failed - can I still merge?"

No. Fix the issue:

1. View the failed job output
2. Use grep commands from RAG-PREVENTION-CHECKLIST.md to find issues
3. Fix in a new commit
4. Push - Actions will re-run
5. Merge when all checks pass

### "I think the check is wrong - how do I report it?"

Open an issue with:
- Which check failed
- Why you think it's a false positive
- Code example
- Proposed fix

---

## References

### Documentation
- **RAG-PREVENTION-STRATEGIES.md**: Detailed patterns for each issue
- **RAG-PREVENTION-CHECKLIST.md**: Code review checklist with grep commands
- **CLAUDE.md**: Project-level best practices

### Tools
- Bash script: `/scripts/check-rag-issues.sh`
- Pre-commit hook: `/.husky/pre-commit-rag`
- GitHub Actions: `/.github/workflows/rag-prevention.yml`

### Related
- OWASP Secrets Management: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- GDPR Data Minimization: https://gdpr-info.eu/art-5-gdpr/
- Deno Security: https://deno.land/manual/basics/security

---

## Summary

This framework prevents the 6 critical issues through:

1. **Automation**: Pre-commit hooks + GitHub Actions
2. **Education**: Detailed guides + training materials
3. **Enforcement**: Code review checklists + strict rules
4. **Monitoring**: Metrics + quarterly audits

Following this framework ensures your codebase stays secure, performant, and maintainable.

**Start today**: Run `./scripts/check-rag-issues.sh` on your next PR!

