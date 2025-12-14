# QA Testing Documentation

This directory contains comprehensive QA testing documentation and checklists for frontend polish and functionality testing.

## Overview

The QA testing plan covers:
- **UX Polish:** Layout, spacing, responsiveness, visual consistency
- **Functionality:** Core workflows, error handling, state management
- **Accessibility:** WCAG 2.1 Level AA compliance
- **Performance:** Core Web Vitals and Lighthouse scores
- **Cross-browser:** Chrome, Safari (Desktop + Mobile)

## Documentation Files

### [QA Matrix](./qa-matrix.md)
Comprehensive testing matrix covering all pages × devices × browsers with detailed checklists for each feature.

### [Embedded Auth Manual Checklist](./embedded-auth-manual-checklist.md)
Manual testing checklist for Whop embedded authentication context (required for final validation).

### [Accessibility Checklist](./a11y-checklist.md)
Accessibility testing checklist covering keyboard navigation, screen readers, and WCAG compliance.

### [Performance Checklist](./performance-checklist.md)
Performance testing checklist with Lighthouse targets and Core Web Vitals metrics.

## Test Suites

### Automated Tests

Located in `apps/web/test/e2e/`:

- **`unauth-smoke.spec.ts`** - Unauthenticated landing page and auth-gated routes
- **`embedded-auth.spec.ts`** - Embedded auth testing (QA demo mode + manual checklist)
- **`a11y-focused.spec.ts`** - Focused accessibility tests (keyboard, labels, contrast)
- **`performance-lighthouse.spec.ts`** - Performance metrics and Lighthouse audits
- **`frontend-flows.spec.ts`** - General frontend user flows
- **`accessibility.spec.ts`** - Comprehensive accessibility tests

### Running Tests

```bash
# Run all E2E tests
cd apps/web
pnpm test:e2e

# Run specific test suite
pnpm test:e2e -- unauth-smoke
pnpm test:e2e -- a11y-focused
pnpm test:e2e -- performance-lighthouse

# Run against staging
E2E_BASE_URL=https://churnsaver-staging.vercel.app pnpm test:e2e
```

## Testing Workflow

### 1. Automated Testing (CI/CD)
- Run Playwright smoke tests on staging
- Run accessibility tests
- Run performance baseline checks

### 2. Manual Testing (Pre-Release)
- Use QA matrix for comprehensive manual testing
- Test in real Whop embedded context
- Verify cross-browser compatibility
- Run Lighthouse audits

### 3. Issue Tracking
- Document issues in QA matrix
- Prioritize (P0/P1/P2)
- Track fixes and regressions

## Test Environment

**Primary:** Staging (`https://churnsaver-staging.vercel.app`)  
**Auth Mode:** 
- Automated: QA demo bypass (`?qa_demo=true`)
- Manual: Real Whop embedded context

## Quick Start

1. **Review QA Matrix:** [qa-matrix.md](./qa-matrix.md)
2. **Run Automated Tests:**
   ```bash
   cd apps/web
   pnpm test:e2e
   ```
3. **Manual Testing:** Follow checklists in each document
4. **Document Results:** Update test results logs in each checklist

## Acceptance Criteria

- ✅ No P0 functional bugs
- ✅ No console errors in embedded app
- ✅ Lighthouse Performance > 70
- ✅ Accessibility score > 90
- ✅ Core Web Vitals meet targets
- ✅ Cross-browser compatibility verified

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)

