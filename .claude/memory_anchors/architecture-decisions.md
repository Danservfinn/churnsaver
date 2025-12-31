---
title: Architecture Decisions
link: architecture-decisions
type: memory_anchor
created_at: 2025-12-31
uuid: a1b2c3d4-adr-0001
tags: [adr, decisions, architecture]
---

# Architecture Decision Records

## ADR-001: Next.js App Router

**Status:** Accepted
**Date:** 2025-10-01

### Context
Need a modern React framework with server-side rendering for the Whop marketplace integration.

### Decision
Use Next.js 16 with App Router for:
- Server components by default
- Built-in API routes
- Edge runtime support
- Vercel deployment integration

### Consequences
- Learning curve for App Router patterns
- Must handle client/server component boundaries carefully

---

## ADR-002: Whop iframe Integration

**Status:** Accepted
**Date:** 2025-10-01

### Context
ChurnSaver needs to work as both a standalone app and embedded in Whop marketplace.

### Decision
Dual-mode architecture:
- `MainLayout` for standalone access
- `WhopAppLayout` for iframe embedding
- Shared `WhopContext` for auth state

### Consequences
- Must handle auth from multiple sources
- Testing requires QA demo bypass system

---

## ADR-003: QA Demo Bypass

**Status:** Accepted
**Date:** 2025-11-01

### Context
Need to test features without real Whop authentication or Stripe subscriptions.

### Decision
Create QA demo system with:
- Environment variable control
- Query parameter activation
- Mock data for all major features
- **Production kill switch** (always disabled in prod)

### Consequences
- Enables rapid development and testing
- Must ensure bypass is never enabled in production

---

## ADR-004: Subscription Tier Limits

**Status:** Accepted
**Date:** 2025-11-15

### Context
Need to monetize the platform while providing value at each tier.

### Decision
Three-tier model:
- **Free:** 10 recoveries, $1K cap
- **Pro:** 100 recoveries, $10K cap
- **Max:** Unlimited

### Consequences
- Must track usage per company
- Limits enforced at API level
- Clear upgrade path for users

---

## ADR-005: Premium UI Design

**Status:** Accepted
**Date:** 2025-12-01

### Context
Need professional appearance for Whop marketplace presence.

### Decision
Premium dark theme with:
- Glassmorphism effects
- Gradient backgrounds
- Spring animations (Framer Motion)
- shadcn/ui component base

### Consequences
- More complex CSS maintenance
- Must test reduced-motion accessibility
