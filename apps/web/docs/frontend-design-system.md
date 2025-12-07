# ChurnSaver Frontend Design System

**Version:** 2.0
**Last Updated:** 2025-11-12
**Status:** Active
**Theme:** Warm Minimal (Claude-inspired)
**Constraints:** No blue, green, cyan, teal, or turquoise shades

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Components](#components)
6. [Patterns & Guidelines](#patterns--guidelines)
7. [Accessibility](#accessibility)
8. [Responsive Design](#responsive-design)
9. [Animation & Motion](#animation--motion)
10. [Implementation Guide](#implementation-guide)

---

## Design Philosophy

ChurnSaver's design system is built on three core principles:

### 1. **Professional & Trustworthy**
- Clean, modern interface that instills confidence
- Enterprise-grade visual quality
- Clear information hierarchy

### 2. **Data-Driven & Actionable**
- Metrics and KPIs are prominently displayed
- Visualizations make complex data digestible
- Actions are clear and accessible

### 3. **Creator-Centric**
- Intuitive workflows for non-technical users
- Empowering controls and customization
- Friendly but professional tone

---

## Color System

### Primary Palette

**No Blue Colors** - The design system intentionally avoids blue to create a unique brand identity.

#### Primary: Warm Gray
*Used for primary actions, links, brand elements, and success states*

```css
--primary-50: #fafafa;
--primary-100: #f5f5f5;
--primary-200: #eeeeee;
--primary-300: #e0e0e0;
--primary-400: #bdbdbd;
--primary-500: #9e9e9e;  /* Main primary color */
--primary-600: #757575;
--primary-700: #616161;
--primary-800: #424242;
--primary-900: #212121;
```

**Usage:**
- Primary buttons
- Active states
- Links
- Brand elements
- Success indicators (recovery) - uses warm gray instead of green

#### Secondary: Amber
*Used for secondary actions, warnings, and warm accents*

```css
--secondary-50: #fff8e1;
--secondary-100: #ffecb3;
--secondary-200: #ffe082;
--secondary-300: #ffd54f;
--secondary-400: #ffca28;
--secondary-500: #ffc107;  /* Main secondary color */
--secondary-600: #ffb300;
--secondary-700: #ffa000;
--secondary-800: #ff8f00;
--secondary-900: #ff6f00;
```

**Usage:**
- Secondary buttons
- Warning states
- Warm accent elements
- Highlights

#### Accent: Deep Orange
*Used for CTAs, highlights, and important actions*

```css
--accent-50: #fbe9e7;
--accent-100: #ffccbc;
--accent-200: #ffab91;
--accent-300: #ff8a65;
--accent-400: #ff7043;
--accent-500: #ff5722;  /* Main accent color */
--accent-600: #f4511e;
--accent-700: #e64a19;
--accent-800: #d84315;
--accent-900: #bf360c;
```

**Usage:**
- Call-to-action buttons
- Important highlights
- Data visualization accents
- Interactive elements

### Semantic Colors

#### Success (Warm Gray)
*Uses primary palette - warm gray instead of green for brand distinction*

```css
--success-50: #fafafa;
--success-100: #f5f5f5;
--success-200: #eeeeee;
--success-300: #e0e0e0;
--success-400: #bdbdbd;
--success-500: #9e9e9e;  /* Same as primary-500 */
--success-600: #757575;
--success-700: #616161;
--success-800: #424242;
--success-900: #212121;
```

**Usage:**
- Successful recoveries
- Positive metrics
- Success messages
- Completed states
- Note: Uses warm gray (not green) to maintain brand identity

#### Warning (Amber)
*Used for cautionary states and open cases*

```css
--warning-50: #fffbeb;
--warning-100: #fef3c7;
--warning-200: #fde68a;
--warning-300: #fcd34d;
--warning-400: #fbbf24;
--warning-500: #f59e0b;  /* Main warning color */
--warning-600: #d97706;
--warning-700: #b45309;
--warning-800: #92400e;
--warning-900: #78350f;
```

**Usage:**
- Open recovery cases
- Pending actions
- Warning messages
- Caution indicators

#### Danger (Red)
*Used for errors, failures, and destructive actions*

```css
--danger-50: #fef2f2;
--danger-100: #fee2e2;
--danger-200: #fecaca;
--danger-300: #fca5a5;
--danger-400: #f87171;
--danger-500: #ef4444;  /* Main danger color */
--danger-600: #dc2626;
--danger-700: #b91c1c;
--danger-800: #991b1b;
--danger-900: #7f1d1d;
```

**Usage:**
- Payment failures
- Error states
- Destructive actions
- Critical alerts

#### Neutral Grays
*Used for text, borders, and backgrounds*

```css
--gray-50: #f9fafb;
--gray-100: #f3f4f6;
--gray-200: #e5e7eb;
--gray-300: #d1d5db;
--gray-400: #9ca3af;
--gray-500: #6b7280;
--gray-600: #4b5563;
--gray-700: #374151;
--gray-800: #1f2937;
--gray-900: #111827;
```

**Usage:**
- Text colors
- Borders
- Backgrounds
- Disabled states

### Dark Mode Colors

```css
/* Dark mode backgrounds */
--dark-bg-primary: #0a0a0a;
--dark-bg-secondary: #171717;
--dark-bg-tertiary: #262626;

/* Dark mode foreground */
--dark-fg-primary: #ededed;
--dark-fg-secondary: #a3a3a3;
--dark-fg-tertiary: #737373;
```

### Color Usage Guidelines

1. **Primary (Warm Gray)**: Use for primary CTAs, active states, and success indicators (replaces green)
2. **Secondary (Amber)**: Use for secondary actions, warnings, and warm accents
3. **Accent (Deep Orange)**: Use for CTAs, highlights, and important actions
4. **Semantic Colors**: Use consistently for their intended meanings
5. **Neutral Grays**: Use for text hierarchy and structural elements

**Important:** No blue, green, cyan, teal, or turquoise colors are used in this design system to create a unique brand identity.

### Color Accessibility

- All color combinations meet WCAG 2.1 AA standards
- Minimum contrast ratio: 4.5:1 for normal text, 3:1 for large text
- Never rely solely on color to convey information
- Use icons, labels, and patterns alongside color

---

## Typography

### Font Families

```css
--font-sans: 'Geist Sans', system-ui, -apple-system, sans-serif;
--font-mono: 'Geist Mono', 'Courier New', monospace;
```

### Type Scale

| Element | Size | Weight | Line Height | Usage |
|---------|------|--------|-------------|-------|
| H1 | 2.5rem (40px) | 700 | 1.2 | Page titles |
| H2 | 2rem (32px) | 600 | 1.3 | Section headers |
| H3 | 1.5rem (24px) | 600 | 1.4 | Card headers |
| H4 | 1.25rem (20px) | 600 | 1.5 | Subsections |
| Body Large | 1.125rem (18px) | 400 | 1.6 | Important body text |
| Body | 1rem (16px) | 400 | 1.6 | Regular text |
| Body Small | 0.875rem (14px) | 400 | 1.5 | Secondary text |
| Caption | 0.75rem (12px) | 400 | 1.4 | Labels, captions |

### Font Weights

- **400 (Regular)**: Body text, default
- **500 (Medium)**: Emphasized text, labels
- **600 (Semibold)**: Headings, important text
- **700 (Bold)**: Strong emphasis, page titles

### Typography Examples

```tsx
// Page Title
<h1 className="text-4xl font-bold text-gray-900 dark:text-white">
  Recovery Dashboard
</h1>

// Section Header
<h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
  Active Cases
</h2>

// Card Header
<h3 className="text-xl font-semibold text-gray-900 dark:text-white">
  Recovery Metrics
</h3>

// Body Text
<p className="text-base text-gray-600 dark:text-gray-300">
  Monitor your recovery cases and track performance metrics.
</p>

// Small Text
<span className="text-sm text-gray-500 dark:text-gray-400">
  Last updated 2 minutes ago
</span>
```

---

## Spacing & Layout

### Spacing Scale

Based on 4px base unit:

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
--space-24: 6rem;     /* 96px */
```

### Container Widths

```css
--container-sm: 640px;
--container-md: 768px;
--container-lg: 1024px;
--container-xl: 1280px;
--container-2xl: 1536px;
```

### Layout Patterns

#### Page Layout
```tsx
<div className="min-h-screen bg-gray-50 dark:bg-gray-900">
  <div className="container mx-auto px-4 py-8">
    {/* Content */}
  </div>
</div>
```

#### Card Layout
```tsx
<div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
  {/* Card content */}
</div>
```

#### Grid Layouts
```tsx
{/* 2 columns on mobile, 4 on desktop */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {/* Grid items */}
</div>
```

### Spacing Guidelines

1. **Consistent Padding**: Use `p-6` (24px) for card padding
2. **Section Spacing**: Use `space-y-8` (32px) between sections
3. **Element Gaps**: Use `gap-4` (16px) for component spacing
4. **Grid Gaps**: Use `gap-6` (24px) for grid layouts

---

## Components

### Buttons

#### Primary Button
```tsx
<button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
  Save Changes
</button>
```

#### Secondary Button
```tsx
<button className="px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 transition-colors">
  Cancel
</button>
```

#### Ghost Button
```tsx
<button className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
  View Details
</button>
```

#### Destructive Button
```tsx
<button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
  Delete
</button>
```

#### Button Sizes
- **Small**: `px-3 py-1.5 text-sm`
- **Default**: `px-4 py-2 text-base`
- **Large**: `px-6 py-3 text-lg`

### KPI Tiles

```tsx
<div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
      {title}
    </h3>
    {trend && <TrendIcon direction={trend.direction} />}
  </div>
  <div className="flex items-baseline">
    <p className="text-3xl font-bold text-gray-900 dark:text-white">
      {value}
    </p>
  </div>
  {subtitle && (
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
      {subtitle}
    </p>
  )}
</div>
```

### Status Badges

```tsx
// Success Badge
<span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200">
  Recovered
</span>

// Warning Badge
<span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200">
  Open
</span>

// Danger Badge
<span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
  Failed
</span>

// Neutral Badge
<span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
  Closed
</span>
```

### Tables

```tsx
<div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
    <thead className="bg-gray-50 dark:bg-gray-900">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Status
        </th>
        {/* More headers */}
      </tr>
    </thead>
    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
      {/* Table rows */}
    </tbody>
  </table>
</div>
```

### Forms

#### Input Fields
```tsx
<input
  type="text"
  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
  placeholder="Enter value"
/>
```

#### Checkboxes
```tsx
<input
  type="checkbox"
  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
/>
```

#### Select Dropdowns
```tsx
<select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
  {/* Options */}
</select>
```

### Cards

```tsx
<div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
    Card Title
  </h2>
  <p className="text-gray-600 dark:text-gray-300">
    Card content goes here.
  </p>
</div>
```

### Modals

```tsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl max-w-md w-full mx-4">
    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
      Modal Title
    </h2>
    {/* Modal content */}
  </div>
</div>
```

### Loading States

#### Spinner
```tsx
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
```

#### Skeleton Loader
```tsx
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
</div>
```

### Empty States

```tsx
<div className="text-center py-12">
  <div className="text-gray-400 dark:text-gray-500 mb-4">
    <EmptyIcon className="w-16 h-16 mx-auto" />
  </div>
  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
    No cases found
  </h3>
  <p className="text-gray-500 dark:text-gray-400 mb-6">
    Cases will appear here when payment failures occur.
  </p>
  <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
    Create Case
  </button>
</div>
```

---

## Patterns & Guidelines

### Color Replacement Map

**Replace all blue/green colors with:**

| Old Color Class | New Class | Usage |
|----------------|-----------|-------|
| `bg-blue-600` | `bg-primary-600` | Primary buttons, links (warm gray) |
| `bg-blue-700` | `bg-primary-700` | Hover states |
| `bg-blue-500` | `bg-primary-500` | Focus rings, accents |
| `text-blue-600` | `text-primary-600` | Links, active text |
| `border-blue-600` | `border-primary-600` | Active borders |
| `ring-blue-500` | `ring-primary-500` | Focus rings |
| `bg-green-500` | `bg-primary-500` | Success states (warm gray, not green) |
| `text-green-600` | `text-primary-600` | Success text |

**For secondary actions:**
- Use `secondary-600` (amber) instead of `blue-600`
- Use `secondary-700` for hover states

**For highlights and CTAs:**
- Use `accent-500` (deep orange) for important actions
- Use `accent-600` for hover states

### Component Patterns

#### Action Buttons Group
```tsx
<div className="flex gap-2" role="group" aria-label="Actions">
  <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
    Primary Action
  </button>
  <button className="px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700">
    Secondary Action
  </button>
  <button className="px-4 py-2 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-700 rounded-lg">
    Cancel
  </button>
</div>
```

#### Status Indicators
```tsx
// Use semantic colors for status
const statusColors = {
  open: 'bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200',
  recovered: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
  closed: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
  failed: 'bg-danger-100 text-danger-800 dark:bg-danger-900 dark:text-danger-200',
};
```

#### Data Visualization Colors
```tsx
// Charts and graphs - import from @/lib/chart-colors
import { chartColors } from '@/lib/chart-colors';

// Or use directly:
const chartColors = {
  primary: '#9e9e9e',      // warm gray (primary-500)
  secondary: '#ffc107',     // amber (secondary-500)
  accent: '#ff5722',        // deep orange (accent-500)
  success: '#9e9e9e',       // warm gray (not green)
  warning: '#ffc107',       // amber (warning-500)
  danger: '#f44336',        // red (danger-500)
};
```

---

## Accessibility

### WCAG 2.1 AA Compliance

- **Color Contrast**: All text meets 4.5:1 ratio minimum
- **Focus Indicators**: Visible focus rings on all interactive elements
- **Keyboard Navigation**: All functionality accessible via keyboard
- **Screen Readers**: Proper ARIA labels and roles
- **Motion**: Respects `prefers-reduced-motion`

### Focus States

```tsx
// Standard focus ring
className="focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"

// For dark backgrounds
className="focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-gray-800"
```

### ARIA Patterns

```tsx
// Buttons
<button aria-label="Save changes" aria-describedby="save-help-text">
  Save
</button>

// Status indicators
<div role="status" aria-live="polite">
  Loading...
</div>

// Alerts
<div role="alert" aria-live="assertive">
  Error: Failed to save
</div>
```

---

## Responsive Design

### Breakpoints

```css
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet portrait */
lg: 1024px  /* Tablet landscape / Small desktop */
xl: 1280px  /* Desktop */
2xl: 1536px /* Large desktop */
```

### Mobile-First Approach

```tsx
// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {/* Responsive items */}
</div>

// Responsive text
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">
  Dashboard
</h1>

// Responsive padding
<div className="px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
  {/* Content */}
</div>
```

### Mobile Patterns

#### Stack on Mobile
```tsx
<div className="flex flex-col md:flex-row gap-4">
  {/* Stacks vertically on mobile, horizontal on desktop */}
</div>
```

#### Hide on Mobile
```tsx
<div className="hidden md:block">
  {/* Hidden on mobile, visible on tablet+ */}
</div>
```

#### Show Only on Mobile
```tsx
<div className="md:hidden">
  {/* Visible on mobile only */}
</div>
```

---

## Animation & Motion

### Transition Durations

```css
--transition-fast: 150ms;
--transition-base: 200ms;
--transition-slow: 300ms;
```

### Common Animations

#### Hover Transitions
```tsx
className="transition-colors duration-200"
className="transition-all duration-200"
```

#### Fade In
```tsx
className="animate-fade-in"
// CSS: @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
```

#### Slide In
```tsx
className="animate-slide-in"
// CSS: @keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } }
```

### Reduced Motion

```tsx
// Respect user preferences
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Implementation Guide

### Step 1: Update Tailwind Config

Add custom colors to `tailwind.config.ts`:

```typescript
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#eeeeee',
          300: '#e0e0e0',
          400: '#bdbdbd',
          500: '#9e9e9e',
          600: '#757575',
          700: '#616161',
          800: '#424242',
          900: '#212121',
        },
        secondary: {
          50: '#fff8e1',
          100: '#ffecb3',
          200: '#ffe082',
          300: '#ffd54f',
          400: '#ffca28',
          500: '#ffc107',
          600: '#ffb300',
          700: '#ffa000',
          800: '#ff8f00',
          900: '#ff6f00',
        },
        accent: {
          50: '#fbe9e7',
          100: '#ffccbc',
          200: '#ffab91',
          300: '#ff8a65',
          400: '#ff7043',
          500: '#ff5722',
          600: '#f4511e',
          700: '#e64a19',
          800: '#d84315',
          900: '#bf360c',
        },
      },
    },
  },
};
```

### Step 2: Replace Blue/Green Classes

Use find-and-replace to update all blue/green color classes:

1. `bg-blue-600` → `bg-primary-600` (warm gray)
2. `bg-blue-700` → `bg-primary-700`
3. `bg-blue-500` → `bg-primary-500`
4. `text-blue-600` → `text-primary-600`
5. `border-blue-600` → `border-primary-600`
6. `ring-blue-500` → `ring-primary-500`
7. `bg-green-500` → `bg-primary-500` (warm gray, not green)
8. `text-green-600` → `text-primary-600`

### Step 3: Update Component Variants

Update button and badge variants to use new colors:

```typescript
// Button variants
default: "bg-primary-600 text-white hover:bg-primary-700"
secondary: "bg-secondary-600 text-white hover:bg-secondary-700"

// Badge variants
success: "bg-primary-100 text-primary-800" // warm gray, not green
warning: "bg-secondary-100 text-secondary-800" // amber
danger: "bg-danger-100 text-danger-800" // red
```

### Step 4: Test Color Contrast

Verify all color combinations meet accessibility standards:

```typescript
// Use tools like:
// - WebAIM Contrast Checker
// - axe DevTools
// - Lighthouse
```

### Step 5: Update Documentation

- Update component examples
- Update style guide references
- Update design mockups

---

## Component Library Reference

### Available Components

1. **Buttons**
   - Primary (Emerald)
   - Secondary (Purple)
   - Ghost
   - Destructive (Red)

2. **Status Badges**
   - Success (Emerald)
   - Warning (Amber)
   - Danger (Red)
   - Neutral (Gray)

3. **Forms**
   - Input fields
   - Select dropdowns
   - Checkboxes
   - Radio buttons

4. **Data Display**
   - KPI Tiles
   - Tables
   - Cards
   - Empty states

5. **Feedback**
   - Loading spinners
   - Skeleton loaders
   - Toast notifications
   - Alerts

6. **Navigation**
   - Breadcrumbs
   - Tabs
   - Pagination

---

## Design Tokens

### CSS Variables

```css
:root {
  /* Primary Colors */
  --color-primary-500: #10b981;
  --color-primary-600: #059669;
  --color-primary-700: #047857;
  
  /* Secondary Colors */
  --color-secondary-500: #a855f7;
  --color-secondary-600: #9333ea;
  
  /* Accent Colors */
  --color-accent-500: #14b8a6;
  
  /* Semantic Colors */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  
  /* Spacing */
  --spacing-unit: 4px;
  
  /* Typography */
  --font-family-sans: 'Geist Sans', system-ui, sans-serif;
  --font-family-mono: 'Geist Mono', monospace;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}
```

---

## Best Practices

### Do's ✅

- Use semantic colors consistently (success = warm gray, warning = amber, danger = red)
- Maintain consistent spacing using the spacing scale
- Use warm gray (primary) for primary actions and success states
- Use amber (secondary) for warnings and secondary actions
- Use deep orange (accent) for highlights and CTAs
- Ensure all interactive elements have focus states
- Test color contrast for accessibility
- Use dark mode variants for all components
- Run `pnpm lint:colors` before committing to catch banned colors

### Don'ts ❌

- Don't use blue, green, cyan, teal, or turquoise colors anywhere in the UI
- Don't mix color systems (stick to the defined warm palette)
- Don't use color alone to convey information
- Don't skip accessibility features
- Don't use arbitrary spacing values
- Don't ignore dark mode support

---

## Resources

### Design Tools
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Heroicons](https://heroicons.com/) - Icon library
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

### Color Tools
- [Coolors](https://coolors.co/) - Color palette generator
- [Accessible Colors](https://accessible-colors.com/) - Contrast checker

### Typography
- [Google Fonts](https://fonts.google.com/)
- [Type Scale](https://type-scale.com/) - Typography calculator

---

## Version History

- **v1.0** (2025-01-27): Initial design system with non-blue color scheme

---

## Questions or Feedback?

For questions about this design system or to suggest improvements, please contact the design team or create an issue in the repository.


















