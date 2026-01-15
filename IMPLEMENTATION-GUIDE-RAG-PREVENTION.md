# RAG Prevention Framework - Implementation Guide

Complete guide to set up and activate the RAG prevention framework for your team.

---

## Overview

This framework prevents the recurrence of 6 critical issues:

1. **API Keys in URLs** (Security)
2. **Sequential Blocking Operations** (Performance)
3. **Dead Code Accumulation** (Maintainability)
4. **Multiple Database Clients** (Architecture)
5. **PII Leakage to AI Providers** (Privacy/GDPR)
6. **Missing Caching** (Performance/Cost)

---

## What's Included

### Documentation (2,000+ lines)
```
docs/
├── RAG-PREVENTION-README.md           # Overview & workflow integration
├── RAG-PREVENTION-CHECKLIST.md        # Code review checklist with grep commands
├── RAG-QUICK-REFERENCE.md             # Quick reference card (bookmark this!)
todos/
├── RAG-PREVENTION-STRATEGIES.md       # Detailed patterns for each issue
```

### Automated Tools
```
scripts/
├── check-rag-issues.sh                # Bash script to check all 6 issues

.husky/
├── pre-commit-rag                     # Pre-commit hook to prevent commits

.github/workflows/
├── rag-prevention.yml                 # GitHub Actions CI/CD checks
```

---

## Phase 1: Setup (1 hour)

### Step 1: Review Documentation (30 minutes)
Read in this order:
1. This file (IMPLEMENTATION-GUIDE-RAG-PREVENTION.md)
2. `docs/RAG-PREVENTION-README.md` (overview)
3. `docs/RAG-QUICK-REFERENCE.md` (quick patterns)

Time: ~15 minutes for both

### Step 2: Understand Each Issue (15 minutes)
Read the 6 detailed sections in `todos/RAG-PREVENTION-STRATEGIES.md`:
- Skip the "Automated Checks" sections
- Focus on "Code Review Checklist" and "Best Practice Pattern"

Time: ~5 minutes per issue = 30 minutes total, but skim for overview (5-10 min)

### Step 3: Enable Tooling (15 minutes)

#### Enable Pre-commit Hook
```bash
cd /home/qualia/Desktop/Projects/aiagents/sofiatesting

# Option 1: Make it the default pre-commit
cp .husky/pre-commit-rag .husky/pre-commit

# Verify it's executable
ls -l .husky/pre-commit

# Test it
echo "test" > test.txt && git add test.txt
git commit -m "Test pre-commit hook"  # Should run the hook
git reset HEAD test.txt && rm test.txt
```

#### Verify GitHub Actions
```bash
# Check that .github/workflows/rag-prevention.yml exists
ls -l .github/workflows/rag-prevention.yml

# It will run automatically on PR/push
# No setup needed
```

#### Verify Script is Executable
```bash
ls -l scripts/check-rag-issues.sh
# Should show -rwxr-xr-x (executable)
```

---

## Phase 2: Team Training (2-3 hours)

### For Developers

#### Training Materials
1. Watch: Your team explains the 6 issues (10 min)
   - Use `docs/RAG-PREVENTION-README.md` → "The 6 Issues & Solutions"

2. Read: `docs/RAG-QUICK-REFERENCE.md` (10 min)
   - Bookmark this file

3. Hands-on: Run check script on sample code (5 min)
   ```bash
   ./scripts/check-rag-issues.sh
   ```

4. Practice: Fix a bad code example
   - Bad code is in `docs/RAG-QUICK-REFERENCE.md`
   - Fix it using the correct patterns provided

#### Expected Outcome
Developers can:
- Explain the 6 issues in 1 sentence each
- Run `./scripts/check-rag-issues.sh` before committing
- Know when to ask code reviewer for help

### For Code Reviewers

#### Training Materials
1. Read: `todos/RAG-PREVENTION-STRATEGIES.md` (40 min)
   - Focus on "Code Review Checklist" sections
   - Skip "Automated Checks"

2. Bookmark: `docs/RAG-PREVENTION-CHECKLIST.md`
   - This is your review guide

3. Practice: Review 2-3 sample PRs with mentor (30 min)
   - Use checklist from above
   - Run the grep commands
   - Practice saying "approved" vs "request changes"

#### Expected Outcome
Code reviewers can:
- Use grep commands to find issues quickly
- Know which issues are blocking vs warnings
- Complete a review in 5-10 minutes

### For Team Lead

#### Setup & Maintenance
1. Ensure pre-commit hook is enabled for all developers
2. Monitor GitHub Actions results in PRs
3. Share feedback from reviews with team
4. Run quarterly code quality audits

#### Metrics to Track
- Failed pre-commit checks (should trend down)
- GitHub Actions failures (should be rare)
- Code review time (should stay <10 min for RAG checks)
- Dead code accumulation (should be cleaned up quarterly)

---

## Phase 3: Activation (Next PR)

### For Your Next PR

1. **Before committing**:
   ```bash
   ./scripts/check-rag-issues.sh
   ```

2. **Before pushing**:
   ```bash
   git add . && git commit -m "Your message"
   # Pre-commit hook runs automatically
   ```

3. **After pushing**:
   - GitHub Actions runs automatically
   - Check the PR for results

4. **Code review**:
   - Reviewer uses `docs/RAG-PREVENTION-CHECKLIST.md`
   - Reviewer runs grep commands
   - Approve if all checks pass

---

## Phase 4: Maintenance (Quarterly)

### Monthly
```bash
# Check main branch for issues
./scripts/check-rag-issues.sh --fail-on-warning

# Monitor metrics
# - Cache hit rate in logs
# - Webhook response times
# - API quota usage
```

### Quarterly
```bash
# 1. Remove deprecated code >3 months old
grep -r '@deprecated.*202[0-5]' app/ lib/ supabase/

# 2. Audit database clients
grep -r 'new Supabase' app/ lib/ supabase/ | grep -v 'lib/supabase'

# 3. Review metrics
# - Verify cache hit rate >75%
# - Verify webhook response <100ms
# - Verify error rate <0.1%

# 4. Update documentation with new patterns
# Edit todos/RAG-PREVENTION-STRATEGIES.md
```

---

## File Reference

### Documentation Files

| File | Purpose | Read Time | When |
|------|---------|-----------|------|
| `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md` | This file - setup guide | 20 min | First time setup |
| `docs/RAG-PREVENTION-README.md` | Overview & integration | 15 min | Onboarding |
| `docs/RAG-PREVENTION-CHECKLIST.md` | Code review guide | 10 min | During review |
| `docs/RAG-QUICK-REFERENCE.md` | Quick patterns | 5 min | Bookmark & reference |
| `todos/RAG-PREVENTION-STRATEGIES.md` | Deep dive patterns | 40 min | Learning + reference |

### Tool Files

| File | Purpose | How to Use |
|------|---------|-----------|
| `scripts/check-rag-issues.sh` | Check all 6 issues | `./scripts/check-rag-issues.sh` |
| `.husky/pre-commit-rag` | Prevent bad commits | `cp to .husky/pre-commit` |
| `.github/workflows/rag-prevention.yml` | CI/CD checks | Auto-runs on PR |

---

## Quick Commands Reference

### For Developers
```bash
# Run before every commit
./scripts/check-rag-issues.sh

# Run with strict mode (fail on warnings)
./scripts/check-rag-issues.sh --fail-on-warning

# Check specific issue
grep -r 'API_KEY' app/ lib/ | grep -v 'Authorization'
```

### For Code Reviewers
```bash
# Check Issue 1: API Keys
grep -r '\?.*KEY\|Bearer.*\${' app/ lib/ supabase/

# Check Issue 2: Blocking
grep -B2 'for\|forEach' index.ts | grep 'await'

# Check Issue 3: Deprecated
grep '@deprecated' app/ lib/ | grep -v '202[6-9]'

# Check Issue 4: Clients
grep -r 'new Supabase' app/ lib/ | grep -v 'lib/supabase'

# Check Issue 5: PII
grep -r '@.*\|[0-9]{10}' supabase/functions/*/prompts.ts

# Check Issue 6: Caching
grep -c 'redis\|cache' database.ts
```

### For Team Leads
```bash
# Quarterly audit
./scripts/check-rag-issues.sh --fail-on-warning

# Find deprecated code to remove
grep -r '@deprecated.*202[0-5]' app/ lib/

# Check pre-commit failures
git log --oneline | head -20 | grep 'Fix RAG'
```

---

## Integration with Existing Workflows

### Git Workflow
```
Branch → Commit → Push → PR → Review → Merge
  ↓        ↓       ↓    ↓     ↓      ↓
  |     Check   GHA  GHA  Check   GHA
  |     Script  Runs Check Script Passes
  |            Results
```

### GitHub Actions
```
Pull Request Created
  ↓
.github/workflows/rag-prevention.yml runs
  ↓
Three jobs run in parallel:
  - security-checks (PII, secrets)
  - code-quality (deprecated, clients)
  - performance-checks (blocking ops)
  ↓
Results appear on PR
  ↓
Reviewer checks results before approving
```

---

## Troubleshooting

### Pre-commit Hook Issues

**Problem**: Pre-commit hook not running
```bash
# Solution: Copy the hook
cp .husky/pre-commit-rag .husky/pre-commit
chmod +x .husky/pre-commit
```

**Problem**: Pre-commit hook failing on old code
```bash
# Solution: You can skip for this commit (not recommended)
git commit --no-verify

# But then fix the issues:
./scripts/check-rag-issues.sh
# And commit again without --no-verify
```

### GitHub Actions Issues

**Problem**: Actions not running
```bash
# Solution: Push to GitHub (Actions run on push/PR)
git push origin feature-branch
```

**Problem**: Actions failing but check script passes locally
```bash
# Solution: GitHub Actions might be stricter
# Run with fail-on-warning:
./scripts/check-rag-issues.sh --fail-on-warning
```

### Script Issues

**Problem**: "command not found: ./scripts/check-rag-issues.sh"
```bash
# Solution: Make it executable
chmod +x scripts/check-rag-issues.sh
```

**Problem**: grep commands not working
```bash
# Solution: Ensure you're in the right directory
cd /home/qualia/Desktop/Projects/aiagents/sofiatesting
```

---

## Success Metrics

### After 1 Week
- [ ] All developers run `./scripts/check-rag-issues.sh` before commits
- [ ] No RAG-related errors in GitHub Actions
- [ ] Pre-commit hook prevents 1-2 bad commits

### After 1 Month
- [ ] Team reviews using RAG-PREVENTION-CHECKLIST.md
- [ ] Code review time stays <10 min for RAG checks
- [ ] Cache hit rate documented and >75%
- [ ] Webhook response time <100ms

### After 3 Months
- [ ] Zero PII in production prompts
- [ ] Zero blocked PRs for RAG issues
- [ ] Deprecated code cleaned up
- [ ] Database clients verified as singleton
- [ ] All API keys in headers, not URLs

### After 1 Year
- [ ] Prevention framework is second nature
- [ ] Few RAG-related issues in production
- [ ] Team can onboard new members in 30 min
- [ ] Quarterly audits show clean code

---

## Next Steps

### Immediate (Today)
1. Read this file ✓
2. Read `docs/RAG-PREVENTION-README.md`
3. Enable pre-commit hook
4. Test with sample commit

### This Week
1. Team reads `docs/RAG-QUICK-REFERENCE.md`
2. Run training sessions
3. Use on next PR

### This Month
1. Monitor GitHub Actions results
2. Collect feedback from team
3. Update documentation based on experience
4. Quarterly cleanup of deprecated code

---

## Getting Help

### Questions About Setup?
See: `IMPLEMENTATION-GUIDE-RAG-PREVENTION.md` (this file)

### Need a Quick Pattern?
See: `docs/RAG-QUICK-REFERENCE.md`

### During Code Review?
See: `docs/RAG-PREVENTION-CHECKLIST.md`

### Want Deep Dive on an Issue?
See: `todos/RAG-PREVENTION-STRATEGIES.md`

### Check Script Failed?
Run: `./scripts/check-rag-issues.sh`

---

## Summary

**Setup Time**: 1 hour
**Training Time**: 2-3 hours per team member
**Ongoing Maintenance**: 10 minutes per PR + 4 hours/quarter

**Benefits**:
- ✅ Zero API key leakage
- ✅ Fast webhook handlers (<100ms)
- ✅ Clean, maintainable code
- ✅ GDPR compliant (no PII leakage)
- ✅ Optimized performance (cached queries)
- ✅ Scalable architecture (singleton clients)

**Start Today**: `./scripts/check-rag-issues.sh`

