# Embedded Auth Manual Testing Checklist

**Purpose:** Since Whop embedded authentication is complex and not easily automatable, use this checklist for manual testing within the real Whop embedded context.

**Environment:** Staging (`https://churnsaver-staging.vercel.app`)  
**Context:** Launch app from within Whop dashboard

## Pre-Testing Setup

- [ ] Access Whop dashboard with valid account
- [ ] Navigate to app listing/integration
- [ ] Launch ChurnSaver app from Whop
- [ ] Verify app loads in embedded iframe/context

## Authentication & Context Checks

### Company Context
- [ ] Company ID loads correctly (not "unknown" or placeholder)
- [ ] Company context persists across page navigations
- [ ] No auth errors in console
- [ ] No 401 loops in network tab

### Navigation
- [ ] Dashboard route loads: `/dashboard/[companyId]`
- [ ] Settings route loads: `/settings`
- [ ] Navigation between pages is smooth
- [ ] No flicker or hydration warnings
- [ ] Browser back/forward buttons work correctly

## Dashboard Functionality

### KPIs Display
- [ ] All KPI tiles render
- [ ] Values are formatted correctly (currency, percentages)
- [ ] Loading skeletons appear during fetch
- [ ] Values update correctly
- [ ] Empty state shows when no data

### Cases Table
- [ ] Table renders with data
- [ ] Cases display correctly
- [ ] Row actions work (cancel/nudge/terminate)
- [ ] Actions show loading states
- [ ] Actions show success/error feedback
- [ ] Table is scrollable on mobile

### Error Handling
- [ ] Network errors show friendly messages
- [ ] API errors don't crash the app
- [ ] Retry mechanisms work (if implemented)

## Settings Functionality

### Form Loading
- [ ] Settings load on page mount
- [ ] Current values populate correctly
- [ ] Loading state displays during fetch
- [ ] Error state shows on fetch failure

### Form Interaction
- [ ] Toggle switches work (push notifications, DMs)
- [ ] Dropdown selects work (incentive days)
- [ ] Checkbox groups work (reminder offsets)
- [ ] Validation errors display correctly
- [ ] Validation errors clear on fix

### Form Submission
- [ ] Save button shows loading state
- [ ] Success toast appears on save
- [ ] Error toast appears on failure
- [ ] Settings persist after page refresh
- [ ] Reset to defaults works

## Browser Compatibility

### Desktop Chrome
- [ ] All features work correctly
- [ ] No console errors
- [ ] Layout is correct

### Desktop Safari
- [ ] All features work correctly
- [ ] No console errors
- [ ] Layout is correct

### Mobile Chrome (via device or emulation)
- [ ] Responsive layout works
- [ ] Touch interactions work
- [ ] No layout issues

### Mobile Safari (via device or emulation)
- [ ] Responsive layout works
- [ ] Touch interactions work
- [ ] No layout issues

## Console & Network Checks

### Console
- [ ] No red errors
- [ ] No critical warnings
- [ ] No hydration mismatches
- [ ] No React warnings

### Network
- [ ] No repeated failing requests
- [ ] No 401 loops
- [ ] API calls are efficient
- [ ] Critical endpoints respond:
  - `/api/dashboard/kpis` - 200 OK
  - `/api/dashboard/cases` - 200 OK
  - `/api/settings` - 200 OK
  - `/api/subscription` - 200 OK

## Test Results Log

**Date:** _______________  
**Tester:** _______________  
**Browser:** _______________  
**Viewport:** _______________

### Results
- [ ] Authentication: Pass / Fail / Blocked
- [ ] Dashboard: Pass / Fail / Blocked
- [ ] Settings: Pass / Fail / Blocked
- [ ] Navigation: Pass / Fail / Blocked
- [ ] Error Handling: Pass / Fail / Blocked
- [ ] Browser Compatibility: Pass / Fail / Blocked

### Issues Found
1. [Issue description] - Priority: [P0/P1/P2] - Status: [Open/Fixed]
2. ...

### Screenshots
- [Link to screenshots]

## Notes

- **StorageState Automation:** Not feasible due to Whop's OAuth/iframe complexity
- **QA Demo Mode:** Use `?qa_demo=true` for automated testing where possible
- **Real Embedded Context:** Required for final validation before production

