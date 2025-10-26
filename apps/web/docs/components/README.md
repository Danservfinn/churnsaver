# Component Documentation

## Overview

The Churn Saver application uses a component-based architecture built with React and TypeScript. Components are organized by functionality and follow consistent patterns for props, styling, and accessibility. This documentation covers all available components, their usage patterns, and best practices.

## Table of Contents

1. [Component Architecture](#component-architecture)
2. [Design System](#design-system)
3. [Accessibility](#accessibility)
4. [Component Categories](#component-categories)
5. [Usage Guidelines](#usage-guidelines)
6. [Styling Patterns](#styling-patterns)
7. [Performance Considerations](#performance-considerations)

## Component Architecture

### Component Structure

All components follow a consistent structure:

```typescript
// Component file structure
ComponentName/
├── ComponentName.tsx          # Main component implementation
├── ComponentName.test.tsx      # Unit tests
├── ComponentName.stories.tsx    # Storybook stories (if applicable)
├── index.ts                   # Export barrel
└── types.ts                   # Component-specific types
```

### Component Template

```typescript
import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { VariantProps } from 'class-variance-authority';

interface ComponentNameProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ComponentName = forwardRef<HTMLDivElement, ComponentNameProps>(
  ({ children, variant = 'default', size = 'md', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Base styles
          'base-class-styles',
          // Variant styles
          variants[variant],
          // Size styles
          sizes[size],
          // Custom classes
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

ComponentName.displayName = 'ComponentName';

export { ComponentName };
export type { ComponentNameProps };
```

### Component Principles

1. **Composition over Inheritance**: Prefer composition patterns
2. **Single Responsibility**: Each component has one clear purpose
3. **Consistent Props**: Follow naming conventions
4. **TypeScript First**: Full type safety
5. **Accessibility Built-in**: ARIA attributes and keyboard navigation

## Design System

### UI Foundation

The design system is built on:

- **Tailwind CSS**: Utility-first styling
- **Class Variance Authority**: Variant management
- **Lucide React**: Icon system
- **Custom Theme**: Consistent color and spacing

### Color Palette

```css
/* Primary Colors */
--primary-50: #eff6ff;
--primary-500: #3b82f6;
--primary-600: #2563eb;
--primary-900: #1e3a8a;

/* Semantic Colors */
--success: #10b981;
--warning: #f59e0b;
--error: #ef4444;
--info: #06b6d4;

/* Neutral Colors */
--gray-50: #f9fafb;
--gray-500: #6b7280;
--gray-900: #111827;
```

### Typography Scale

```css
/* Font Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;   /* 24px */

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Spacing Scale

```css
/* Spacing (4px base unit) */
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
```

## Accessibility

### WCAG Compliance

All components strive for WCAG 2.1 AA compliance:

- **Color Contrast**: Minimum 4.5:1 ratio
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader**: Proper ARIA labels
- **Focus Management**: Visible focus indicators
- **Reduced Motion**: Respects user preferences

### Accessibility Features

```typescript
// Focus management
const { focusRef } = useFocusManagement();

// ARIA attributes
<button
  aria-label="Close dialog"
  aria-describedby="dialog-description"
  aria-expanded={isOpen}
>

// Keyboard navigation
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    onClose();
  }
};

// Screen reader announcements
const announceToScreenReader = (message: string) => {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', 'polite');
  announcement.textContent = message;
  document.body.appendChild(announcement);
  setTimeout(() => document.body.removeChild(announcement), 1000);
};
```

### Testing Accessibility

```typescript
// Accessibility testing utilities
import { axe, toHaveNoViolations } from 'jest-axe';

// Test component for accessibility violations
test('should not have accessibility violations', async () => {
  const { container } = render(<Component />);
  
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

// Test keyboard navigation
test('should be keyboard navigable', () => {
  render(<Component />);
  
  const button = screen.getByRole('button');
  button.focus();
  
  fireEvent.keyDown(button, { key: 'Enter' });
  expect(onClick).toHaveBeenCalled();
});
```

## Component Categories

### UI Components

Base UI components that form the design system:

- [**Button**](./ui/button.md) - Interactive button element
- [**Card**](./ui/card.md) - Container component with header and content
- [**Badge**](./ui/badge.md) - Small status or label indicator

### Layout Components

Components for page structure and layout:

- [**WhopAppLayout**](./layouts/whop-app-layout.md) - Main application layout wrapper
- [**WhopClientWrapper**](./layouts/whop-client-wrapper.md) - Client-side context provider

### Dashboard Components

Specialized components for dashboard functionality:

- [**MonitoringDashboard**](./dashboard/monitoring-dashboard.md) - Real-time system monitoring
- [**MonitoringDashboardSimple**](./dashboard/monitoring-dashboard-simple.md) - Simplified dashboard view
- [**CasesTable**](./dashboard/cases-table.md) - Tabular case data display
- [**KpiTile**](./dashboard/kpi-tile.md) - Key performance indicator display

## Usage Guidelines

### Component Composition

```typescript
// Preferred: Composition
<Card>
  <CardHeader>
    <CardTitle>Dashboard</CardTitle>
  </CardHeader>
  <CardContent>
    <Button variant="primary">Action</Button>
  </CardContent>
</Card>

// Avoid: Deep nesting
<div className="card">
  <div className="card-header">
    <div className="card-title">Dashboard</div>
  </div>
  <div className="card-content">
    <button className="btn btn-primary">Action</button>
  </div>
</div>
```

### Props Patterns

```typescript
// Consistent prop naming
interface ComponentProps {
  // Content
  children?: React.ReactNode;
  
  // Variants
  variant?: 'default' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  
  // State
  disabled?: boolean;
  loading?: boolean;
  
  // Events
  onClick?: (event: React.MouseEvent) => void;
  onSubmit?: (data: FormData) => void;
  
  // Styling
  className?: string;
  style?: React.CSSProperties;
  
  // Accessibility
  ariaLabel?: string;
  ariaDescribedBy?: string;
}
```

### Error Boundaries

```typescript
// Error boundary for components
class ComponentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }

    return this.props.children;
  }
}
```

## Styling Patterns

### Tailwind Integration

```typescript
// Using cn utility for class merging
import { cn } from '@/lib/utils';

const className = cn(
  'base-styles',
  variant && variantStyles[variant],
  size && sizeStyles[size],
  className
);
```

### CSS-in-JS (when needed)

```typescript
// Dynamic styles that can't be handled with Tailwind
const dynamicStyles: React.CSSProperties = {
  '--dynamic-color': color,
  '--dynamic-size': `${size}px`,
};

<div style={dynamicStyles} className="base-class">
```

### Responsive Design

```typescript
// Responsive props
interface ResponsiveProps {
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
}

// Usage in component
<div className={cn(
  'grid-cols-1',
  columns?.sm && `sm:grid-cols-${columns.sm}`,
  columns?.md && `md:grid-cols-${columns.md}`,
  columns?.lg && `lg:grid-cols-${columns.lg}`
)}>
```

## Performance Considerations

### React Performance

```typescript
// Memoization for expensive components
const ExpensiveComponent = React.memo(({ data }) => {
  const processedData = useMemo(() => {
    return expensiveCalculation(data);
  }, [data]);

  return <div>{processedData}</div>;
});

// Callback memoization
const handleClick = useCallback((id: string) => {
  onItemClick(id);
}, [onItemClick]);
```

### Bundle Optimization

```typescript
// Dynamic imports for large components
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

// Usage with Suspense
<Suspense fallback={<Loading />}>
  <HeavyComponent />
</Suspense>
```

### Virtualization

```typescript
// For large lists, use virtualization
import { FixedSizeList as List } from 'react-window';

const VirtualizedList = ({ items }) => (
  <List
    height={400}
    itemCount={items.length}
    itemSize={50}
    itemData={items}
  >
    {({ index, style, data }) => (
      <div style={style}>
        {data[index].content}
      </div>
    )}
  </List>
);
```

## Testing Patterns

### Component Testing

```typescript
// Testing utilities
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Basic render test
test('renders component correctly', () => {
  render(<Component title="Test" />);
  
  expect(screen.getByText('Test')).toBeInTheDocument();
});

// Interaction testing
test('handles click events', async () => {
  const handleClick = jest.fn();
  render(<Component onClick={handleClick} />);
  
  await userEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalled();
});

// Async state testing
test('loads data asynchronously', async () => {
  render(<Component />);
  
  await waitFor(() => {
    expect(screen.getByText('Loaded data')).toBeInTheDocument();
  });
});
```

### Visual Regression Testing

```typescript
// Storybook integration for visual testing
export default {
  title: 'Component',
  component: Component,
  parameters: {
    // Visual regression testing
    chromatic: { viewports: [320, 768, 1024] },
    // Accessibility testing
    a11y: { disable: false },
  },
};

export const Default = {
  args: {
    title: 'Default Component',
    variant: 'primary',
  },
};
```

## Best Practices

### Do's

1. **Use TypeScript** for all components
2. **Follow naming conventions** consistently
3. **Implement proper accessibility** from the start
4. **Write comprehensive tests** for interactions
5. **Use semantic HTML** elements
6. **Optimize for performance** with memoization
7. **Document complex props** with JSDoc

### Don'ts

1. **Don't use inline styles** unless absolutely necessary
2. **Don't ignore accessibility** requirements
3. **Don't create deeply nested** component hierarchies
4. **Don't use any types** - be specific
5. **Don't forget error boundaries** for robustness
6. **Don't hardcode content** - use props
7. **Don't skip testing** edge cases

## Migration Guide

### Converting Legacy Components

```typescript
// Before: Legacy component
function OldComponent(props) {
  return (
    <div className="old-component">
      <button onclick={props.onClick}>
        {props.text}
      </button>
    </div>
  );
}

// After: Modern component
const NewComponent = forwardRef<HTMLButtonElement, ComponentProps>(
  ({ children, onClick, variant = 'default', className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        onClick={onClick}
        className={className}
        {...props}
      >
        {children}
      </Button>
    );
  }
);
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0