---
title: Component Structure
link: component-structure
type: pattern
created_at: 2025-12-31
uuid: a1b2c3d4-ptrn-0002
tags: [react, components, ui, pattern]
---

# Component Structure

## Overview

Standard patterns for React components in ChurnSaver.

## Page Component Pattern

```typescript
// src/app/[page]/page.tsx (Server Component)
import { Metadata } from 'next';
import { PageClient } from './PageClient';

export const metadata: Metadata = {
  title: 'Page Title | ChurnSaver',
};

export default function Page() {
  return <PageClient />;
}
```

```typescript
// src/app/[page]/PageClient.tsx (Client Component)
'use client';

import { useState, useEffect } from 'react';
import { useWhop } from '@/lib/context/whop';
import { Card } from '@/components/ui/card';

export function PageClient() {
  const { companyId, isLoading } = useWhop();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (companyId) {
      fetchData(companyId).then(setData);
    }
  }, [companyId]);

  if (isLoading) return <LoadingSkeleton />;
  if (!companyId) return <AuthRequired />;

  return (
    <div className="container mx-auto p-4">
      {/* Content */}
    </div>
  );
}
```

## UI Component Pattern

```typescript
// src/components/ui/custom-component.tsx
import { cn } from '@/lib/utils';

interface CustomComponentProps {
  className?: string;
  children: React.ReactNode;
  variant?: 'default' | 'primary';
}

export function CustomComponent({
  className,
  children,
  variant = 'default',
}: CustomComponentProps) {
  return (
    <div
      className={cn(
        'base-styles',
        variant === 'primary' && 'primary-styles',
        className
      )}
    >
      {children}
    </div>
  );
}
```

## Directory Structure

```
src/
├── app/                    # Pages (App Router)
│   └── [page]/
│       ├── page.tsx       # Server component
│       └── PageClient.tsx # Client component
├── components/
│   ├── ui/                # Base UI (shadcn)
│   ├── layouts/           # Layout components
│   └── [feature]/         # Feature-specific
└── lib/
    ├── context/           # React contexts
    └── utils.ts           # Utilities
```

## Key Principles

1. **Server components default** - Use 'use client' only when needed
2. **Composition over inheritance** - Build with small components
3. **Props interface** - Always define TypeScript interfaces
4. **cn() for classes** - Use utility for conditional classes
5. **Colocation** - Keep related files together
