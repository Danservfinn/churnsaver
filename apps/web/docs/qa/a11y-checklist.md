# Accessibility Testing Checklist

**Purpose:** Ensure the application meets WCAG 2.1 Level AA standards for accessibility.

**Tools:** 
- Playwright automated tests (`test/e2e/a11y-focused.spec.ts`)
- Manual testing with screen readers
- Browser DevTools accessibility audits

## Automated Tests

Run the focused accessibility tests:

```bash
cd apps/web
pnpm test:e2e -- a11y-focused
```

## Manual Testing Checklist

### Keyboard Navigation

- [ ] **Tab Order:** All interactive elements are reachable via Tab key
- [ ] **Focus Indicators:** Visible focus rings on all focusable elements
- [ ] **Skip Links:** Skip to main content link available (if applicable)
- [ ] **Escape Key:** Closes modals, dropdowns, and overlays
- [ ] **Arrow Keys:** Navigate within menus and lists
- [ ] **Enter/Space:** Activate buttons and links
- [ ] **No Keyboard Traps:** Can navigate away from all areas

### Screen Reader Testing

**Test with:** NVDA (Windows), VoiceOver (Mac), JAWS (Windows)

- [ ] **Page Title:** Descriptive page titles announced
- [ ] **Headings:** Proper heading hierarchy (h1 → h2 → h3)
- [ ] **Landmarks:** Navigation, main, banner, contentinfo properly marked
- [ ] **Form Labels:** All inputs have associated labels
- [ ] **Button Names:** All buttons have descriptive names
- [ ] **Link Text:** Links have descriptive text (not "click here")
- [ ] **Image Alt Text:** Images have descriptive alt text or marked decorative
- [ ] **Error Messages:** Form errors are announced
- [ ] **Dynamic Content:** Changes are announced (aria-live regions)

### Visual Accessibility

- [ ] **Color Contrast:** Text meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- [ ] **Color Independence:** Information not conveyed by color alone
- [ ] **Text Size:** Text can be resized up to 200% without loss of functionality
- [ ] **Focus Indicators:** Clear focus indicators on all interactive elements
- [ ] **Text Spacing:** Text readable with adjusted spacing (line-height, letter-spacing)

### Form Accessibility

- [ ] **Labels:** All form inputs have visible labels
- [ ] **Error Messages:** Clear, specific error messages
- [ ] **Required Fields:** Required fields are clearly marked
- [ ] **Error Association:** Errors are associated with their fields (aria-describedby)
- [ ] **Success Messages:** Success messages are announced

### Responsive & Mobile

- [ ] **Touch Targets:** Minimum 44×44px touch targets
- [ ] **Viewport:** Proper viewport meta tag
- [ ] **Orientation:** Works in both portrait and landscape
- [ ] **Zoom:** Content readable at 200% zoom

## Testing Tools

### Browser DevTools

**Chrome:**
1. Open DevTools (F12)
2. Go to "Lighthouse" tab
3. Select "Accessibility"
4. Run audit

**Firefox:**
1. Open DevTools (F12)
2. Go to "Accessibility" tab
3. Run accessibility checks

### axe DevTools

Install axe DevTools browser extension:
- Chrome: https://chrome.google.com/webstore/detail/axe-devtools
- Firefox: https://addons.mozilla.org/en-US/firefox/addon/axe-devtools/

Run automated scans and review violations.

## Common Issues to Check

### Critical (P0)
- Missing form labels
- Missing alt text on images
- Keyboard traps
- Missing focus indicators
- Insufficient color contrast (< 3:1)

### High (P1)
- Poor heading hierarchy
- Missing ARIA labels
- Non-descriptive link text
- Missing landmarks
- Form errors not announced

### Medium (P2)
- Missing skip links
- No aria-live regions for dynamic content
- Touch targets too small
- Text not resizable

## Test Results Log

**Date:** _______________  
**Tester:** _______________  
**Browser:** _______________  
**Screen Reader:** _______________

### Results
- [ ] Keyboard Navigation: Pass / Fail / Partial
- [ ] Screen Reader: Pass / Fail / Partial
- [ ] Visual Accessibility: Pass / Fail / Partial
- [ ] Form Accessibility: Pass / Fail / Partial
- [ ] Responsive/Mobile: Pass / Fail / Partial

### Issues Found
1. [Issue description] - WCAG Criterion: [X.X.X] - Priority: [P0/P1/P2] - Status: [Open/Fixed]
2. ...

### Screenshots/Evidence
- [Link to screenshots or audit reports]

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)
- [axe DevTools](https://www.deque.com/axe/devtools/)

