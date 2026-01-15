# RAG Prevention Framework - Complete Index

Start here to navigate the RAG prevention framework for your Supabase Edge Functions project.

---

## For First-Time Users: Start Here

### 1. Read This First (5 minutes)
**File**: `/IMPLEMENTATION-GUIDE-RAG-PREVENTION.md`
- Overview of what you're implementing
- Time estimates for each phase
- Quick commands reference

### 2. For Quick Reference (Bookmark)
**File**: `/docs/RAG-QUICK-REFERENCE.md`
- One-page summary
- Pattern comparison (wrong vs correct)
- Keep this open while coding

### 3. During Code Review
**File**: `/docs/RAG-PREVENTION-CHECKLIST.md`
- Step-by-step review process
- Grep commands for each issue
- When to approve/reject

---

## The 6 Issues Being Prevented

### Issue 1: API Keys in URL Query Parameters
**Impact**: Security breach - keys logged everywhere
**Prevention**: Use Authorization headers, not query params
**Check**: `grep -r '\?.*KEY' app/`
**Documentation**: See RAG-PREVENTION-STRATEGIES.md → Issue 1

### Issue 2: Sequential Blocking Operations
**Impact**: Performance - webhook timeouts
**Prevention**: Fire-and-forget for non-critical ops, webhook returns <100ms
**Check**: `grep -B2 'for' index.ts | grep 'await'`
**Documentation**: See RAG-PREVENTION-STRATEGIES.md → Issue 2

### Issue 3: Dead Code Accumulation
**Impact**: Maintainability - confusion and technical debt
**Prevention**: All deprecated code must have removal date
**Check**: `grep '@deprecated' app/ | grep -v '202[6-9]'`
**Documentation**: See RAG-PREVENTION-STRATEGIES.md → Issue 3

### Issue 4: Multiple Database Client Instances
**Impact**: Architecture - connection pool exhaustion
**Prevention**: Single singleton client in lib/supabase.ts
**Check**: `grep -r 'new Supabase' app/ lib/ | grep -v 'lib/supabase'`
**Documentation**: See RAG-PREVENTION-STRATEGIES.md → Issue 4

### Issue 5: PII Leakage to AI Providers
**Impact**: Privacy/GDPR breach
**Prevention**: Never send email/phone/names to AI; use UUID/hashes
**Check**: `grep -r '@.*\|[0-9]{10}' supabase/functions/*/prompts.ts`
**Documentation**: See RAG-PREVENTION-STRATEGIES.md → Issue 5

### Issue 6: Missing Caching for Repeated API Calls
**Impact**: Performance/cost - API quota waste
**Prevention**: Cache expensive operations (1h for taxonomy, 24h for configs)
**Check**: `grep -c 'redis\|cache' database.ts`
**Documentation**: See RAG-PREVENTION-STRATEGIES.md → Issue 6

---

## Complete File Guide

### Documentation Files (Read in Order)

| # | File | Purpose | Time | For Whom |
|---|------|---------|------|----------|
| 1 | `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md` | Setup & activation guide | 20 min | Everyone first |
| 2 | `docs/RAG-PREVENTION-README.md` | Framework overview & workflow | 15 min | Team leads & developers |
| 3 | `docs/RAG-PREVENTION-CHECKLIST.md` | Code review patterns & commands | 10 min | Code reviewers (bookmark) |
| 4 | `docs/RAG-QUICK-REFERENCE.md` | One-page patterns (print/bookmark) | 5 min | All developers |
| 5 | `todos/RAG-PREVENTION-STRATEGIES.md` | Deep dive on each issue | 40 min | Team leads & learners |

### Tool Files

| File | Purpose | Usage |
|------|---------|-------|
| `scripts/check-rag-issues.sh` | Automated check for all 6 issues | `./scripts/check-rag-issues.sh` |
| `.husky/pre-commit-rag` | Pre-commit hook (blocks bad commits) | `cp to .husky/pre-commit` |
| `.github/workflows/rag-prevention.yml` | GitHub Actions validation | Auto-runs on PR/push |

---

## Quick Access by Role

### I'm a Developer
1. Read: `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md` (20 min)
2. Bookmark: `docs/RAG-QUICK-REFERENCE.md`
3. Before each commit: `./scripts/check-rag-issues.sh`
4. Before pushing: Pre-commit hook runs automatically

### I'm a Code Reviewer
1. Read: `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md` (20 min)
2. Bookmark: `docs/RAG-PREVENTION-CHECKLIST.md`
3. On each PR: Use checklist to review
4. Run grep commands from checklist
5. Use "When to reject/approve" guidance

### I'm a Team Lead
1. Read: `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md` (setup phase)
2. Read: `todos/RAG-PREVENTION-STRATEGIES.md` (understand deeply)
3. Run training: See training materials in `docs/RAG-PREVENTION-README.md`
4. Monitor: Weekly GitHub Actions results
5. Maintain: Quarterly code audits

---

## Implementation Timeline

### Today (1 hour)
- [ ] Read `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md`
- [ ] Read `docs/RAG-PREVENTION-README.md`
- [ ] Enable pre-commit hook: `cp .husky/pre-commit-rag .husky/pre-commit`
- [ ] Test: `./scripts/check-rag-issues.sh`

### This Week (2-3 hours)
- [ ] Team reads `docs/RAG-QUICK-REFERENCE.md`
- [ ] Conduct training (use materials in `docs/RAG-PREVENTION-README.md`)
- [ ] Practice: Review 2-3 sample PRs with checklist

### Next PR
- [ ] Developer: `./scripts/check-rag-issues.sh` before commit
- [ ] Reviewer: Use `docs/RAG-PREVENTION-CHECKLIST.md`
- [ ] GitHub Actions: Validates automatically

### Monthly
- [ ] Monitor metrics (cache hit rate, webhook timing)
- [ ] Review GitHub Actions results

### Quarterly
- [ ] Remove deprecated code >3 months old
- [ ] Audit database clients (verify singleton)
- [ ] Review metrics dashboard

---

## Most Useful Commands (Copy & Paste)

### Before Committing (Run This)
```bash
./scripts/check-rag-issues.sh
```

### Issue 1: Check for Secrets in URLs
```bash
grep -r '\?.*KEY\|Bearer.*\${' app/ lib/ supabase/ | grep -v node_modules
```

### Issue 2: Check for Blocking Operations
```bash
grep -B2 'for\|forEach\|\.map(' app/ lib/ supabase/ | grep 'await fetch\|await supabase'
```

### Issue 3: Check for Deprecated Without Removal
```bash
grep -r '@deprecated' app/ lib/ supabase/ | grep -v 'node_modules\|202[6-9]\|removal'
```

### Issue 4: Check for Multiple DB Clients
```bash
grep -r 'new Supabase\|createClient' app/ lib/ supabase/ | grep -v 'node_modules\|supabase.ts\|lib/db'
```

### Issue 5: Check for PII in Prompts
```bash
grep -r '[a-z0-9._%+-]\+@[a-z0-9.-]\+\.[a-z]' supabase/functions/*/prompts.ts | grep -v 'node_modules\|example@\|test@'
```

### Issue 6: Check for Caching
```bash
grep -c 'redis.get\|cache\|Cache' supabase/functions/*/database.ts
```

---

## Decision Tree: What Document to Read

```
START HERE
    |
    v
What do you need?
    |
    +---> Setup/Implementation?
    |     --> IMPLEMENTATION-GUIDE-RAG-PREVENTION.md
    |
    +---> Quick reference patterns?
    |     --> docs/RAG-QUICK-REFERENCE.md
    |
    +---> Doing code review?
    |     --> docs/RAG-PREVENTION-CHECKLIST.md
    |
    +---> Need detailed patterns?
    |     --> todos/RAG-PREVENTION-STRATEGIES.md
    |
    +---> Framework workflow?
    |     --> docs/RAG-PREVENTION-README.md
    |
    +---> Running automation?
    |     --> ./scripts/check-rag-issues.sh
```

---

## Success Checkpoints

### Week 1
- [ ] Pre-commit hook enabled for all developers
- [ ] `./scripts/check-rag-issues.sh` runs successfully
- [ ] No RAG-related errors in GitHub Actions

### Month 1
- [ ] Team using `RAG-PREVENTION-CHECKLIST.md` for reviews
- [ ] Code review time <10 min for RAG checks
- [ ] All new code passes checks
- [ ] Cache hit rate documented and >75%

### Quarter 1
- [ ] Zero PII in production prompts
- [ ] Zero blocked PRs for RAG issues
- [ ] Deprecated code cleaned up
- [ ] Database clients verified as singleton

### Year 1
- [ ] Prevention is second nature
- [ ] Few RAG issues in production
- [ ] Team can onboard in 30 min
- [ ] Quarterly audits show clean code

---

## File Structure

```
/home/qualia/Desktop/Projects/aiagents/sofiatesting/
├── IMPLEMENTATION-GUIDE-RAG-PREVENTION.md          (START HERE - 20 min read)
├── RAG-PREVENTION-INDEX.md                         (This file)
├── docs/
│   ├── RAG-PREVENTION-README.md                    (Framework overview)
│   ├── RAG-PREVENTION-CHECKLIST.md                 (Code review - BOOKMARK)
│   └── RAG-QUICK-REFERENCE.md                      (1-page - BOOKMARK & PRINT)
├── todos/
│   └── RAG-PREVENTION-STRATEGIES.md                (Deep dive patterns)
├── scripts/
│   └── check-rag-issues.sh                         (Run before commits)
├── .husky/
│   └── pre-commit-rag                              (Copy to .husky/pre-commit)
└── .github/workflows/
    └── rag-prevention.yml                          (Auto-runs on PR)
```

---

## Asking for Help

### "What do I do before committing?"
→ Run: `./scripts/check-rag-issues.sh`
→ Read: `docs/RAG-QUICK-REFERENCE.md`

### "How do I review a PR?"
→ Use: `docs/RAG-PREVENTION-CHECKLIST.md`
→ Run: The grep commands from the checklist

### "What's the pattern for Issue X?"
→ See: `todos/RAG-PREVENTION-STRATEGIES.md` → Issue X

### "How do I set this up?"
→ Read: `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md`

### "What are the 6 issues?"
→ See: This file (RAG-PREVENTION-INDEX.md) → "The 6 Issues"

---

## Key Takeaways

1. **Security First**: No secrets in URLs, headers only
2. **Performance**: Webhook handlers return <100ms
3. **Maintainability**: Deprecated code has removal dates
4. **Architecture**: Database clients are singletons
5. **Privacy**: Never send PII to AI; use UUIDs/hashes
6. **Cost**: Cache expensive operations

---

## Start Now

### For Immediate Action
```bash
# 1. Run the check script
./scripts/check-rag-issues.sh

# 2. Read the quick reference
cat docs/RAG-QUICK-REFERENCE.md

# 3. Bookmark this checklist
docs/RAG-PREVENTION-CHECKLIST.md
```

### For Complete Setup
1. Follow steps in `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md`
2. Run training with team
3. Enable pre-commit hook
4. Use on next PR

---

## Questions?

- **What's the 6-issue overview?** → Read this file
- **How do I set it up?** → Read `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md`
- **Quick patterns?** → Bookmark `docs/RAG-QUICK-REFERENCE.md`
- **Deep dive?** → Read `todos/RAG-PREVENTION-STRATEGIES.md`
- **Code review?** → Use `docs/RAG-PREVENTION-CHECKLIST.md`

---

**Start with**: `/IMPLEMENTATION-GUIDE-RAG-PREVENTION.md` (20 min read)

**Bookmark**: `/docs/RAG-QUICK-REFERENCE.md` (reference while coding)

**Run before commits**: `./scripts/check-rag-issues.sh`

