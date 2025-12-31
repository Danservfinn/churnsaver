---
title: UI Bug Fixes Dec 2025
link: ui-bugs-dec-2025
type: debug_history
created_at: 2025-12-31
uuid: a1b2c3d4-debug-0001
tags: [bugfix, ui, frontend, dec-2025]
commit: 19ecfb7
---

# UI Bug Fixes - December 2025

## Context

During a prospect review of the ChurnSaver platform, 6 UI bugs were identified and fixed in a single commit.

## Bugs Fixed

### 1. Privacy Policy 404

**Problem:** `/privacy` returned 404
**Cause:** Page existed locally but was not tracked in git
**Fix:** `git add apps/web/src/app/privacy/page.tsx`

### 2. Terms of Service 404

**Problem:** `/terms` returned 404
**Cause:** Page existed locally but was not tracked in git
**Fix:** `git add apps/web/src/app/terms/page.tsx`

### 3. Settings Infinite Skeleton

**Problem:** `/settings` showed infinite loading spinner for unauthenticated users
**Cause:** No auth check before render, kept waiting for auth that never came
**Fix:** Added authentication check with friendly message:

```tsx
if (!isAuthLoading && (!companyId || companyId === 'unknown')) {
  return <AuthRequiredMessage />;
}
```

### 4. Duplicate Navbar on 404

**Problem:** 404 page showed two navigation bars
**Cause:** `not-found.tsx` included `AppHeader` while `MainLayout` already provides `TopToolbar`
**Fix:** Removed `AppHeader` from `not-found.tsx`

### 5. Placeholder Social Proof Avatars

**Problem:** Homepage showed generic letter avatars (A, B, C, D, E)
**Cause:** Placeholder implementation never replaced
**Fix:** Replaced with gradient color circles:

```tsx
{['from-violet-500 to-purple-500', 'from-blue-500 to-cyan-500', ...].map((gradient, i) => (
  <div className={`bg-gradient-to-br ${gradient} ...`} />
))}
```

### 6. Settings/Configuration Naming

**Problem:** Nav said "Settings" but page was called "Configuration"
**Cause:** Inconsistent naming
**Fix:** Standardized `AppHeader` to use "Configuration"

## Files Changed

| File | Change |
|------|--------|
| `src/app/not-found.tsx` | Removed AppHeader |
| `src/app/page.tsx` | Fixed avatars |
| `src/app/privacy/page.tsx` | Added to git |
| `src/app/terms/page.tsx` | Added to git |
| `src/app/settings/page.tsx` | Added auth check |
| `src/components/layouts/AppHeader.tsx` | Settings → Configuration |
| `src/lib/qaDemo.ts` | Max tier for testing |

## Verification

All tests pass: 353 passed, 11 skipped
