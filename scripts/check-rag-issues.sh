#!/bin/bash
# RAG Prevention Verification Script
# Run before PRs to catch common issues that were previously fixed
# Usage: ./scripts/check-rag-issues.sh [--fail-on-warning]

set -e

FAIL_ON_WARNING=${1:-false}
ERRORS=0
WARNINGS=0

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "=========================================="
echo "RAG Prevention Checks"
echo "=========================================="

# ==========================================
# Issue 1: API Keys in URLs
# ==========================================
echo -e "\n${YELLOW}[1/6]${NC} Checking for API keys in URLs..."

FOUND_SECRETS_IN_URLS=0

# Check for secrets in query parameters
if grep -r '\?.*[A-Z_]*KEY\|?.*[A-Z_]*TOKEN\|?.*[A-Z_]*SECRET' \
  --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
  app/ lib/ supabase/ 2>/dev/null | grep -v node_modules | grep -v '.next'; then
  echo -e "${RED}❌ Potential secrets in URL query parameters${NC}"
  FOUND_SECRETS_IN_URLS=1
  ((ERRORS++))
fi

# Check for Bearer tokens in URLs
if grep -r 'Bearer.*\${\|Authorization.*=.*\${' \
  --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
  app/ lib/ supabase/ 2>/dev/null | grep -v node_modules | grep -v '.next'; then
  echo -e "${RED}❌ Bearer tokens in URL construction${NC}"
  FOUND_SECRETS_IN_URLS=1
  ((ERRORS++))
fi

if [ $FOUND_SECRETS_IN_URLS -eq 0 ]; then
  echo -e "${GREEN}✅ No secrets in URLs${NC}"
fi

# ==========================================
# Issue 2: Secrets in console.log
# ==========================================
echo -e "\n${YELLOW}[2/6]${NC} Checking for secrets in console.log..."

FOUND_SECRETS_IN_LOGS=0

if grep -r 'console\.\(log\|error\|warn\).*\(API_KEY\|OPENROUTER\|RESEND\|WASEND\)' \
  --include="*.ts" --include="*.js" \
  app/ lib/ supabase/ 2>/dev/null | grep -v node_modules | grep -v '.next'; then
  echo -e "${YELLOW}⚠️  Secrets potentially logged${NC}"
  FOUND_SECRETS_IN_LOGS=1
  ((WARNINGS++))
fi

if [ $FOUND_SECRETS_IN_LOGS -eq 0 ]; then
  echo -e "${GREEN}✅ No secrets in console.log${NC}"
fi

# ==========================================
# Issue 3: Sequential blocking operations
# ==========================================
echo -e "\n${YELLOW}[3/6]${NC} Checking for blocking operation patterns..."

FOUND_BLOCKING=0

# Check for fetch inside loops
if grep -r 'for\|forEach\|map' \
  --include="*.ts" --include="*.js" \
  app/ lib/ supabase/ 2>/dev/null | \
  grep -v node_modules | grep -v '.next' | \
  grep -A5 'for\|forEach\|map' | grep -q 'await fetch\|await supabase'; then
  echo -e "${YELLOW}⚠️  Fetch/DB call detected inside loop${NC}"
  FOUND_BLOCKING=1
  ((WARNINGS++))
fi

# Check for multiple sequential awaits in webhook handlers
if grep -r 'serve\|/webhook' \
  --include="*.ts" --include="*.js" \
  app/ lib/ supabase/ 2>/dev/null | \
  grep -v node_modules | \
  head -5; then
  if grep -A30 'serve\|webhook' supabase/functions/sophia-bot/index.ts 2>/dev/null | \
    grep -c 'await' | grep -q '[3-9]\|[1-9][0-9]'; then
    echo -e "${YELLOW}⚠️  Multiple sequential awaits in handler (performance concern)${NC}"
    FOUND_BLOCKING=1
    ((WARNINGS++))
  fi
fi

if [ $FOUND_BLOCKING -eq 0 ]; then
  echo -e "${GREEN}✅ No obvious blocking operations detected${NC}"
fi

# ==========================================
# Issue 4: Deprecated code without removal plan
# ==========================================
echo -e "\n${YELLOW}[4/6]${NC} Checking for deprecated code without removal plan..."

FOUND_DEPRECATED_NO_PLAN=0

# Find @deprecated without a date or migration path
if grep -r '@deprecated' \
  --include="*.ts" --include="*.js" \
  app/ lib/ supabase/ 2>/dev/null | \
  grep -v node_modules | \
  grep -v 'removal\|migrate\|202[6-9]\|203[0-9]\|REMOVED'; then
  echo -e "${YELLOW}⚠️  Deprecated code without removal date/plan${NC}"
  FOUND_DEPRECATED_NO_PLAN=1
  ((WARNINGS++))
fi

if [ $FOUND_DEPRECATED_NO_PLAN -eq 0 ]; then
  echo -e "${GREEN}✅ All deprecated code has removal plans${NC}"
fi

# ==========================================
# Issue 5: Multiple database client instances
# ==========================================
echo -e "\n${YELLOW}[5/6]${NC} Checking for multiple database client instances..."

FOUND_MULTIPLE_CLIENTS=0

# Check for Supabase client instantiation outside of singleton file
if grep -r 'new Supabase\|createClient' \
  --include="*.ts" --include="*.js" \
  app/ lib/ supabase/ 2>/dev/null | \
  grep -v node_modules | \
  grep -v 'supabase.ts\|lib/supabase\|lib/db' | \
  grep -q 'createClient\|new'; then
  echo -e "${RED}❌ Database client instantiated outside singleton file${NC}"
  FOUND_MULTIPLE_CLIENTS=1
  ((ERRORS++))
fi

if [ $FOUND_MULTIPLE_CLIENTS -eq 0 ]; then
  echo -e "${GREEN}✅ Database clients use singleton pattern${NC}"
fi

# ==========================================
# Issue 6: PII in AI prompts/calls
# ==========================================
echo -e "\n${YELLOW}[6/6]${NC} Checking for PII in AI prompts and API calls..."

FOUND_PII=0

# Check for email patterns in prompts
if grep -r '[a-z0-9._%+-]\+@[a-z0-9.-]\+\.[a-z]\{2,\}' \
  --include="*.ts" --include="*.js" \
  supabase/functions/*/prompts.ts lib/ai/prompts.ts 2>/dev/null | \
  grep -v node_modules | \
  grep -v 'example@\|test@\|sofia@zyprus.com'; then
  echo -e "${RED}❌ Email addresses detected in prompts${NC}"
  FOUND_PII=1
  ((ERRORS++))
fi

# Check for phone patterns in prompts
if grep -r '+[0-9]\{8,15\}\|+[0-9]\{2,\}[0-9]\{6,\}' \
  --include="*.ts" --include="*.js" \
  supabase/functions/*/prompts.ts lib/ai/prompts.ts 2>/dev/null | \
  grep -v node_modules; then
  echo -e "${RED}❌ Phone numbers detected in prompts${NC}"
  FOUND_PII=1
  ((ERRORS++))
fi

# Check for full names in system prompts
if grep -r 'fullName\|full_name\|User.*Name' \
  --include="*.ts" --include="*.js" \
  supabase/functions/*/prompts.ts lib/ai/prompts.ts 2>/dev/null | \
  grep -v node_modules | \
  grep '\${.*Name'; then
  echo -e "${YELLOW}⚠️  Full names detected in system prompts (should use UUID/ID)${NC}"
  FOUND_PII=1
  ((WARNINGS++))
fi

if [ $FOUND_PII -eq 0 ]; then
  echo -e "${GREEN}✅ No obvious PII in prompts${NC}"
fi

# ==========================================
# Summary
# ==========================================
echo -e "\n=========================================="
echo "Summary"
echo "=========================================="
echo -e "Errors: ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $ERRORS -gt 0 ]; then
  echo -e "\n${RED}❌ RAG checks FAILED - fix errors before proceeding${NC}"
  exit 1
fi

if [ $WARNINGS -gt 0 ] && [ "$FAIL_ON_WARNING" = "--fail-on-warning" ]; then
  echo -e "\n${RED}❌ RAG checks FAILED - fix warnings${NC}"
  exit 1
fi

if [ $WARNINGS -gt 0 ]; then
  echo -e "\n${YELLOW}⚠️  RAG checks passed with warnings - review before merging${NC}"
  exit 0
fi

echo -e "\n${GREEN}✅ All RAG checks passed!${NC}"
exit 0
