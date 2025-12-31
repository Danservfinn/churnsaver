---
title: API Route Pattern
link: api-route-pattern
type: pattern
created_at: 2025-12-31
uuid: a1b2c3d4-ptrn-0001
tags: [api, nextjs, handlers, pattern]
---

# API Route Pattern

## Overview

Standard pattern for Next.js App Router API routes in ChurnSaver.

## Template

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCompanyContext } from '@/lib/auth';
import { isQaDemoBypassEnabled, getQaDemoData } from '@/lib/qaDemo';
import { withRateLimit } from '@/server/middleware/rateLimit';

export async function GET(request: NextRequest) {
  try {
    // 1. Check QA demo bypass (dev only)
    if (isQaDemoBypassEnabled(request)) {
      return NextResponse.json(getQaDemoData());
    }

    // 2. Get authenticated context
    const context = await getCompanyContext(request);
    if (!context.companyId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // 3. Parse query parameters
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || context.companyId;

    // 4. Validate authorization
    if (companyId !== context.companyId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // 5. Business logic
    const data = await fetchData(companyId);

    // 6. Return response
    return NextResponse.json(data);

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Apply rate limiting
export const config = {
  api: { bodyParser: true }
};
```

## Key Principles

1. **QA bypass first** - Check demo mode before auth
2. **Auth second** - Validate user context
3. **Authorization third** - Verify access rights
4. **Business logic fourth** - Process request
5. **Error handling** - Catch and log all errors

## Response Format

```typescript
// Success
{ data: any, meta?: { page, limit, total } }

// Error
{ error: string, details?: string }
```

## Related Files

| File | Example |
|------|---------|
| `src/app/api/dashboard/kpis/route.ts` | GET endpoint |
| `src/app/api/settings/route.ts` | GET + PATCH |
| `src/app/api/webhooks/whop/route.ts` | POST webhook |
