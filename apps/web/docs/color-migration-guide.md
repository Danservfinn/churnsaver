# Color Migration Guide: Removing Blue Colors

This guide helps developers replace all blue colors with the new emerald green, purple, and teal color scheme.

## Quick Reference

### Primary Replacements (Most Common)

| Find | Replace With | Usage |
|------|--------------|-------|
| `bg-blue-600` | `bg-emerald-600` | Primary buttons, main actions |
| `bg-blue-700` | `bg-emerald-700` | Button hover states |
| `bg-blue-500` | `bg-emerald-500` | Focus rings, accents |
| `text-blue-600` | `text-emerald-600` | Links, active text |
| `border-blue-600` | `border-emerald-600` | Active borders |
| `ring-blue-500` | `ring-emerald-500` | Focus rings |
| `bg-blue-50` | `bg-emerald-50` | Light backgrounds |
| `bg-blue-100` | `bg-emerald-100` | Subtle backgrounds |
| `bg-blue-900` | `bg-emerald-900` | Dark mode backgrounds |

### Secondary Actions

| Find | Replace With | Usage |
|------|--------------|-------|
| `bg-blue-600` (secondary) | `bg-purple-600` | Secondary buttons |
| `bg-blue-700` (secondary) | `bg-purple-700` | Secondary hover states |

### Informational Elements

| Find | Replace With | Usage |
|------|--------------|-------|
| `bg-blue-100` (info) | `bg-teal-100` | Informational badges |
| `text-blue-600` (info) | `text-teal-600` | Info text |

## Files to Update

### High Priority (User-Facing)

1. **`apps/web/src/app/page.tsx`**
   - Replace button colors
   - Update step indicators

2. **`apps/web/src/app/dashboard/[companyId]/page.tsx`**
   - Update loading spinner
   - Replace button colors
   - Update refresh button

3. **`apps/web/src/app/dashboard/page.tsx`**
   - Update loading spinner
   - Replace button colors

4. **`apps/web/src/app/settings/page.tsx`**
   - Update form focus states
   - Replace button colors
   - Update checkbox colors

### Medium Priority (Components)

5. **`apps/web/src/components/ui/AccessibleTable.tsx`**
   - Replace selection colors
   - Update sort indicators

6. **`apps/web/src/components/ui/AccessibleNavigation.tsx`**
   - Update active states
   - Replace link colors

7. **`apps/web/src/components/ui/AccessibleForm.tsx`**
   - Update loading spinner

8. **`apps/web/src/components/ui/input.tsx`**
   - Update focus ring color

9. **`apps/web/src/components/ui/select.tsx`**
   - Update focus ring color

### Low Priority (Monitoring/Dashboard)

10. **`apps/web/src/components/dashboard/MonitoringDashboard.tsx`**
    - Update priority colors (P3)

11. **`apps/web/src/components/dashboard/MonitoringDashboardSimple.tsx`**
    - Update priority colors

12. **`apps/web/src/components/dashboard/SecurityMonitoringDashboard.tsx`**
    - Update low severity colors
    - Update active tab colors

## Search & Replace Commands

### Using VS Code Find & Replace

1. Open Find & Replace (Cmd+Shift+H / Ctrl+Shift+H)
2. Enable regex mode (.*)
3. Use these patterns:

```
Find: bg-blue-600
Replace: bg-emerald-600

Find: bg-blue-700
Replace: bg-emerald-700

Find: bg-blue-500
Replace: bg-emerald-500

Find: text-blue-600
Replace: text-emerald-600

Find: border-blue-600
Replace: border-emerald-600

Find: ring-blue-500
Replace: ring-emerald-500

Find: bg-blue-50
Replace: bg-emerald-50

Find: bg-blue-100
Replace: bg-emerald-100

Find: bg-blue-900
Replace: bg-emerald-900
```

### Using Terminal (sed)

```bash
# Navigate to apps/web/src
cd apps/web/src

# Replace all blue-600 with emerald-600
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/bg-blue-600/bg-emerald-600/g'
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/text-blue-600/text-emerald-600/g'
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/border-blue-600/border-emerald-600/g'

# Replace blue-700 with emerald-700
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/bg-blue-700/bg-emerald-700/g'

# Replace blue-500 with emerald-500
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/ring-blue-500/ring-emerald-500/g'

# Replace blue-50/100 with emerald-50/100
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/bg-blue-50/bg-emerald-50/g'
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/bg-blue-100/bg-emerald-100/g'

# Replace blue-900 with emerald-900
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/bg-blue-900/bg-emerald-900/g'
```

## Context-Specific Replacements

### Loading Spinners

**Before:**
```tsx
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
```

**After:**
```tsx
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
```

### Primary Buttons

**Before:**
```tsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
  Save
</button>
```

**After:**
```tsx
<button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
  Save
</button>
```

### Focus Rings

**Before:**
```tsx
<input className="focus:ring-2 focus:ring-blue-500" />
```

**After:**
```tsx
<input className="focus:ring-2 focus:ring-emerald-500" />
```

### Active/Selected States

**Before:**
```tsx
<div className={active ? 'bg-blue-50 text-blue-600' : ''}>
```

**After:**
```tsx
<div className={active ? 'bg-emerald-50 text-emerald-600' : ''}>
```

### Links

**Before:**
```tsx
<a className="text-blue-600 hover:text-blue-800">Link</a>
```

**After:**
```tsx
<a className="text-emerald-600 hover:text-emerald-800">Link</a>
```

## Special Cases

### Priority Levels (Monitoring Dashboard)

**Before:**
```tsx
P3: 'bg-blue-100 text-blue-800'
```

**After:**
```tsx
P3: 'bg-purple-100 text-purple-800'  // Use purple for low priority
```

### Low Severity (Security Dashboard)

**Before:**
```tsx
low: 'bg-blue-100 text-blue-800'
```

**After:**
```tsx
low: 'bg-teal-100 text-teal-800'  // Use teal for informational/low severity
```

### Active Tabs

**Before:**
```tsx
className={active ? 'border-b-2 border-blue-500 text-blue-600' : ''}
```

**After:**
```tsx
className={active ? 'border-b-2 border-emerald-500 text-emerald-600' : ''}
```

## Verification Checklist

After making replacements, verify:

- [ ] All primary buttons use emerald-600/700
- [ ] All focus rings use emerald-500
- [ ] All links use emerald-600
- [ ] Loading spinners use emerald-600
- [ ] No blue colors remain in user-facing components
- [ ] Dark mode variants are updated
- [ ] Color contrast meets accessibility standards
- [ ] Visual consistency across all pages

## Testing

1. **Visual Testing**
   - Check all pages in light mode
   - Check all pages in dark mode
   - Verify hover states
   - Verify focus states

2. **Accessibility Testing**
   - Run contrast checker on all text/background combinations
   - Verify focus indicators are visible
   - Test with screen reader

3. **Functional Testing**
   - Test all buttons and links
   - Verify form inputs work correctly
   - Check loading states display properly

## Rollback Plan

If issues arise, you can quickly rollback:

```bash
# Reverse the replacements
find . -type f -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/bg-emerald-600/bg-blue-600/g'
# ... repeat for all replacements
```

## Questions?

Refer to the main [Frontend Design System](./frontend-design-system.md) document for complete color specifications and usage guidelines.




















