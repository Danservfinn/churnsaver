# QA Testing Matrix - Frontend Polish & Functionality

**Target Environment:** Staging (`https://churnsaver-staging.vercel.app`)  
**Primary Auth Mode:** Real Whop embedded context  
**Last Updated:** December 13, 2024

## Test Matrix Overview

| Page/Feature | Desktop Chrome | Desktop Safari | Mobile Chrome | Mobile Safari | Status |
|--------------|----------------|----------------|---------------|---------------|--------|
| Landing (unauthenticated) | ✅ | ✅ | ✅ | ✅ | - |
| Dashboard (embedded) | ✅ | ✅ | ✅ | ✅ | - |
| Settings (embedded) | ✅ | ✅ | ✅ | ✅ | - |
| Navigation/Sidebar | ✅ | ✅ | ✅ | ✅ | - |
| KPIs Display | ✅ | ✅ | ✅ | ✅ | - |
| Cases Table | ✅ | ✅ | ✅ | ✅ | - |
| Settings Form | ✅ | ✅ | ✅ | ✅ | - |
| Error States | ✅ | ✅ | ⚠️ | ⚠️ | - |
| Loading States | ✅ | ✅ | ✅ | ✅ | - |
| Empty States | ✅ | ✅ | ✅ | ✅ | - |

**Legend:**
- ✅ = Required test coverage
- ⚠️ = Optional/additional coverage
- Status = Pass/Fail/Blocked (to be filled during QA)

## Viewport Configurations

### Desktop
- **1440×900** (Standard desktop)
- **1920×1080** (Large desktop)

### Tablet
- **768×1024** (iPad portrait)
- **1024×768** (iPad landscape)

### Mobile
- **390×844** (iPhone 12/13/14)
- **375×667** (iPhone SE)

## Pages & Features Checklist

### 1. Landing Page (Unauthenticated)
**URL:** `https://churnsaver-staging.vercel.app/`

**Test Cases:**
- [ ] Page loads without console errors
- [ ] Hero section renders correctly
- [ ] Feature cards display properly
- [ ] Navigation links work
- [ ] CTA buttons are clickable
- [ ] Responsive layout works on all viewports
- [ ] No layout shifts or hydration warnings

**Browsers:** Chrome, Safari (Desktop + Mobile)

---

### 2. Dashboard (Whop Embedded)
**URL:** `https://churnsaver-staging.vercel.app/dashboard/[companyId]`

**Test Cases:**

#### App Shell
- [ ] Sidebar renders and is functional
- [ ] Header/navigation bar displays correctly
- [ ] Active route highlighting works
- [ ] Mobile menu toggle works
- [ ] No overlapping elements
- [ ] Keyboard navigation (Tab order)

#### KPIs Section
- [ ] All KPI tiles render
- [ ] Values format correctly (currency, percentages)
- [ ] Loading skeletons display during fetch
- [ ] Empty state shows when no data
- [ ] Error state displays on API failure

#### Cases Table
- [ ] Table renders with data
- [ ] Sorting works (if implemented)
- [ ] Filtering works (if implemented)
- [ ] Pagination works (if implemented)
- [ ] Row actions (cancel/nudge/terminate) work
- [ ] Disabled states during actions
- [ ] Empty state when no cases
- [ ] Responsive table scrolling on mobile

**Browsers:** Chrome, Safari (Desktop + Mobile)

---

### 3. Settings Page (Whop Embedded)
**URL:** `https://churnsaver-staging.vercel.app/settings`

**Test Cases:**

#### Form Loading
- [ ] Settings load on page mount
- [ ] Toggles/selects populate with current values
- [ ] Loading state displays during fetch
- [ ] Error state on fetch failure

#### Form Interaction
- [ ] Toggle switches work (push notifications, DMs)
- [ ] Dropdown selects work (incentive days)
- [ ] Checkbox groups work (reminder offsets)
- [ ] Validation errors display correctly
- [ ] Validation errors clear on fix

#### Form Submission
- [ ] Save button shows loading state
- [ ] Success toast appears on save
- [ ] Error toast appears on failure
- [ ] Form values persist after refresh
- [ ] Reset to defaults works

**Browsers:** Chrome, Safari (Desktop + Mobile)

---

### 4. Navigation & Routing
**Test Cases:**
- [ ] Route changes are smooth (no flicker)
- [ ] No hydration warnings in console
- [ ] Back/forward browser buttons work
- [ ] Direct URL navigation works
- [ ] Company-scoped routes redirect correctly
- [ ] Auth gates show when not embedded

**Browsers:** Chrome, Safari (Desktop + Mobile)

---

### 5. Error States
**Test Cases:**
- [ ] Network offline shows friendly message
- [ ] 401 errors show auth gate
- [ ] 500 errors show error message
- [ ] API timeouts handled gracefully
- [ ] No infinite retry loops

**Browsers:** Chrome, Safari (Desktop only - easier to simulate)

---

### 6. Loading States
**Test Cases:**
- [ ] Skeletons display during data fetch
- [ ] Spinners show during actions
- [ ] Transitions are smooth (not jarring)
- [ ] No layout shifts during loading

**Browsers:** Chrome, Safari (Desktop + Mobile)

---

### 7. Empty States
**Test Cases:**
- [ ] Dashboard shows empty state when no cases
- [ ] Settings show defaults when not configured
- [ ] Empty states have helpful messaging
- [ ] Empty states have clear CTAs (if applicable)

**Browsers:** Chrome, Safari (Desktop + Mobile)

---

## Accessibility Checklist

### Keyboard Navigation
- [ ] Tab order is logical
- [ ] Focus indicators are visible
- [ ] All interactive elements are keyboard accessible
- [ ] Modals trap focus correctly
- [ ] Escape key closes modals/dropdowns

### Screen Reader
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Buttons have accessible names
- [ ] ARIA labels used where needed
- [ ] Landmarks are properly marked

### Visual
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] No color-only information
- [ ] Focus indicators are visible
- [ ] Text is readable at all sizes

**Browsers:** Chrome (with axe DevTools), Safari (VoiceOver on Mac)

---

## Performance Checklist

### Lighthouse Scores (Targets)
- [ ] Performance: > 70
- [ ] Accessibility: > 90
- [ ] Best Practices: > 90
- [ ] SEO: > 80

### Metrics
- [ ] First Contentful Paint < 1.8s
- [ ] Largest Contentful Paint < 2.5s
- [ ] Time to Interactive < 3.8s
- [ ] Cumulative Layout Shift < 0.1
- [ ] Total Blocking Time < 200ms

**Pages to Test:**
- Landing page
- Dashboard (embedded)
- Settings (embedded)

**Browsers:** Chrome (Lighthouse)

---

## Console & Network Checks

### Console
- [ ] No red errors
- [ ] No critical warnings
- [ ] No hydration mismatches
- [ ] No React warnings

### Network
- [ ] No repeated failing requests
- [ ] No 401 loops
- [ ] API calls are efficient (no redundant calls)
- [ ] Critical endpoints respond correctly:
  - `/api/dashboard/kpis`
  - `/api/dashboard/cases`
  - `/api/settings`
  - `/api/subscription`

**Browsers:** Chrome DevTools (all tests)

---

## Test Execution Log

### Test Session: [Date]
**Tester:** [Name]  
**Environment:** Staging  
**Browser:** [Chrome/Safari]  
**Viewport:** [Size]

#### Results:
- [ ] Landing Page: Pass / Fail / Blocked
- [ ] Dashboard: Pass / Fail / Blocked
- [ ] Settings: Pass / Fail / Blocked
- [ ] Navigation: Pass / Fail / Blocked
- [ ] Error States: Pass / Fail / Blocked
- [ ] Loading States: Pass / Fail / Blocked
- [ ] Empty States: Pass / Fail / Blocked
- [ ] Accessibility: Pass / Fail / Blocked
- [ ] Performance: Pass / Fail / Blocked

#### Issues Found:
1. [Issue description] - Priority: [P0/P1/P2] - Status: [Open/Fixed]
2. ...

#### Screenshots:
- [Link to screenshots folder]

---

## Notes

- **Whop Embedded Testing:** Most tests require launching the app from within Whop to receive proper authentication context
- **Test Data:** Ensure staging has test data (cases, settings) before running QA
- **Manual vs Automated:** Some checks (especially embedded auth flows) may need to be manual due to Whop authentication complexity
- **Regression Testing:** Run this matrix after each major release or significant UI change

