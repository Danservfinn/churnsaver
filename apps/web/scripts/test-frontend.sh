#!/bin/bash
# Frontend Testing Script for Churn Saver
# Run from apps/web directory: ./scripts/test-frontend.sh

set -e

echo "🧪 Churn Saver Frontend Testing"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0
SKIPPED=0

log_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((FAILED++))
}

log_skip() {
    echo -e "${YELLOW}⊘ SKIP${NC}: $1"
    ((SKIPPED++))
}

# Step 1: Check dependencies
echo "📦 Step 1: Checking dependencies..."
if [ -d "node_modules" ]; then
    log_pass "node_modules exists"
else
    log_fail "node_modules not found - run 'pnpm install'"
    exit 1
fi

# Step 2: Type check
echo ""
echo "🔍 Step 2: Running TypeScript type check..."
if pnpm type-check 2>&1; then
    log_pass "TypeScript compilation"
else
    log_fail "TypeScript errors found"
fi

# Step 3: Lint check
echo ""
echo "🔍 Step 3: Running linter..."
if pnpm lint 2>&1; then
    log_pass "Linting"
else
    log_fail "Lint errors found"
fi

# Step 4: Unit tests
echo ""
echo "🧪 Step 4: Running unit tests..."
if pnpm test --run 2>&1; then
    log_pass "Unit tests"
else
    log_fail "Unit tests failed"
fi

# Step 5: Build check
echo ""
echo "🏗️ Step 5: Running production build..."
if pnpm build 2>&1; then
    log_pass "Production build"
else
    log_fail "Build failed"
fi

# Step 6: E2E tests (if playwright installed)
echo ""
echo "🎭 Step 6: Checking E2E test setup..."
if command -v playwright &> /dev/null || [ -f "node_modules/.bin/playwright" ]; then
    echo "Playwright found. To run E2E tests:"
    echo "  1. Start dev server: pnpm dev"
    echo "  2. In another terminal: pnpm exec playwright test"
    log_skip "E2E tests (require running server)"
else
    log_skip "E2E tests (playwright not installed)"
fi

# Summary
echo ""
echo "================================"
echo "📊 Test Summary"
echo "================================"
echo -e "${GREEN}Passed${NC}: $PASSED"
echo -e "${RED}Failed${NC}: $FAILED"
echo -e "${YELLOW}Skipped${NC}: $SKIPPED"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}❌ Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All automated tests passed!${NC}"
fi

echo ""
echo "📋 Manual Testing Checklist"
echo "================================"
echo "Run 'pnpm dev' then test these in your browser:"
echo ""
echo "Dashboard (http://localhost:3000/dashboard/dev-company):"
echo "  [ ] Page loads without errors"
echo "  [ ] 4 KPI tiles display"
echo "  [ ] Cases table or empty state shows"
echo "  [ ] Export CSV button works"
echo "  [ ] Refresh Data button works"
echo "  [ ] Settings link navigates correctly"
echo ""
echo "Settings (http://localhost:3000/settings):"
echo "  [ ] Page loads without errors"
echo "  [ ] Push toggle works"
echo "  [ ] DM toggle works"
echo "  [ ] Incentive dropdown works"
echo "  [ ] Reminder checkboxes work"
echo "  [ ] Save button works"
echo "  [ ] Reset button works"
echo ""
