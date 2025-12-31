---
title: Authentication Flow
link: authentication-flow
type: metadata
created_at: 2025-12-31
uuid: a1b2c3d4-auth-flow-0001
tags: [auth, whop, context, security]
---

# Authentication Flow

## Overview

ChurnSaver uses Whop OAuth for authentication, operating in two modes:
1. **Iframe Mode** - Embedded within Whop marketplace
2. **Standalone Mode** - Direct access for development/testing

## Key Components

### WhopContext (`src/lib/context/whop.tsx`)

Provides authentication state throughout the app:

```typescript
interface WhopContextType {
  companyId: string | null;
  userId: string | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

### Authentication Sources (Priority Order)

1. **Whop iframe context** - Token from parent window
2. **URL parameters** - `?company_id=xxx&user_id=xxx`
3. **localStorage** - Persisted from previous sessions
4. **QA Demo bypass** - Development/testing only

### Health Context Endpoint

`GET /api/health/context` - Validates auth and returns context:

```json
{
  "companyId": "biz_xxx",
  "userId": "user_xxx",
  "isAuthenticated": true
}
```

## Security Notes

- Tokens are validated server-side via Whop SDK
- Company ID is never implicitly trusted from client
- QA bypass is disabled in production environments

## Related Files

| File | Purpose |
|------|---------|
| `src/lib/context/whop.tsx` | Context provider |
| `src/app/api/health/context/route.ts` | Validation endpoint |
| `src/lib/whop/sdk.ts` | Whop SDK wrapper |
