# ChurnSaver Architecture Documentation

> **Version:** 1.0.0  
> **Last Updated:** December 2024  
> **Status:** Production-Ready Architecture

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [Database Schema](#database-schema)
7. [Security Architecture](#security-architecture)
8. [Infrastructure & Deployment](#infrastructure--deployment)
9. [Monitoring & Observability](#monitoring--observability)
10. [Cost Projections](#cost-projections)
11. [Scaling Strategy](#scaling-strategy)
12. [Replication Guide](#replication-guide)

---

## Overview

ChurnSaver is a **SaaS churn recovery platform** integrated with the Whop marketplace. It automatically detects failed payments, manages recovery cases, and helps creators retain subscribers through automated nudges and incentives.

### Key Capabilities

- **Webhook Processing**: Real-time event ingestion from Whop
- **Recovery Case Management**: Automated case creation and lifecycle management
- **Reminder System**: Configurable multi-touch reminder sequences
- **Incentive Engine**: Dynamic incentive offers for recovery
- **Analytics Dashboard**: Recovery metrics and insights
- **Multi-Tenant**: Full data isolation per company/creator

### Architecture Principles

| Principle | Implementation |
|-----------|----------------|
| **Serverless-First** | Vercel Functions, auto-scaling |
| **Event-Driven** | Webhook-triggered workflows |
| **Security-by-Default** | RLS, encryption, rate limiting |
| **Async Processing** | Cron-only launch mode (events table drain); PgBoss worker optional |
| **Fail-Safe** | Idempotency + advisory locks; DLQ/circuit breakers when PgBoss enabled |

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WHOP MARKETPLACE                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Payments   │  │ Memberships │  │    Users    │  │   Webhooks  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          └────────────────┴────────────────┴────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            VERCEL EDGE NETWORK                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         NEXT.JS APPLICATION                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │  Webhook    │  │    API      │  │  Dashboard  │  │   Cron     │  │   │
│  │  │  Endpoint   │  │   Routes    │  │    UI       │  │   Jobs     │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘  │   │
│  │         │                │                │               │          │   │
│  │         ▼                ▼                ▼               ▼          │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │                    SERVER SERVICES LAYER                       │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │  │   │
│  │  │  │ Event    │ │ Case     │ │ Reminder │ │ Security         │  │  │   │
│  │  │  │ Processor│ │ Manager  │ │ Scheduler│ │ Monitor          │  │  │   │
│  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │  │   │
│  │  └───────┼────────────┼────────────┼────────────────┼────────────┘  │   │
│  │          │            │            │                │               │   │
│  │          ▼            ▼            ▼                ▼               │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │                      DATA ACCESS LAYER                         │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │  │   │
│  │  │  │ db-rls   │ │ Event    │ │ Rate     │ │ Encryption       │  │  │   │
│  │  │  │ (Pool)   │ │ Queue    │ │ Limiter  │ │ Service          │  │  │   │
│  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │  │   │
│  │  └───────┼────────────┼────────────┼────────────────┼────────────┘  │   │
│  └──────────┼────────────┼────────────┼────────────────┼────────────────┘   │
└─────────────┼────────────┼────────────┼────────────────┼────────────────────┘
              │            │            │                │
              └────────────┴────────────┴────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE (PostgreSQL)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          PGBOUNCER (Port 6543)                       │   │
│  │                       Connection Pooling Layer                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐ │
│  │                           POSTGRES                                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │ │
│  │  │  events  │ │ recovery │ │ creator  │ │ pgboss   │ │  rate    │   │ │
│  │  │          │ │  _cases  │ │ _settings│ │  _jobs   │ │ _limits  │   │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │                    ROW LEVEL SECURITY (RLS)                      │ │ │
│  │  │              Automatic tenant isolation by company_id            │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Request Flow Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │              INCOMING REQUEST                 │
                    └─────────────────────┬────────────────────────┘
                                          │
                    ┌─────────────────────▼────────────────────────┐
                    │           MIDDLEWARE CHAIN                    │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │ 1. Request Size Limit (1MB default)     │ │
                    │  │ 2. Rate Limiting (Token Bucket)         │ │
                    │  │ 3. RLS Context Injection                │ │
                    │  │ 4. Authentication Verification          │ │
                    │  └─────────────────────────────────────────┘ │
                    └─────────────────────┬────────────────────────┘
                                          │
                    ┌─────────────────────▼────────────────────────┐
                    │              ROUTE HANDLER                    │
                    │  • Input validation (Zod schemas)            │
                    │  • Business logic execution                  │
                    │  • Database operations (RLS-protected)       │
                    └─────────────────────┬────────────────────────┘
                                          │
                    ┌─────────────────────▼────────────────────────┐
                    │           ERROR HANDLER                       │
                    │  • Standardized error formatting             │
                    │  • Severity classification                   │
                    │  • Logging & monitoring                      │
                    └─────────────────────┬────────────────────────┘
                                          │
                    ┌─────────────────────▼────────────────────────┐
                    │              RESPONSE                         │
                    └──────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.2.0 | UI framework |
| **Next.js** | 16.0.7 | Full-stack framework |
| **TypeScript** | 5.x | Type safety |
| **Tailwind CSS** | 4.1.15 | Styling |
| **Framer Motion** | 12.x | Animations |
| **Lucide React** | 0.460.0 | Icons |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js API Routes** | 16.0.7 | Serverless functions |
| **Node.js** | 18+ | Runtime |
| **pg (node-postgres)** | 8.12.0 | Database client |
| **PgBoss** | 11.1.1 | Job queue |
| **Zod** | 4.1.12 | Schema validation |
| **jose** | 5.9.0 | JWT handling |
| **bcrypt** | 6.0.0 | Password hashing |

### Infrastructure

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Vercel** | Hosting, serverless functions | Pro plan |
| **Supabase** | PostgreSQL database | Pro plan with pooler |
| **PgBouncer** | Connection pooling | Port 6543 |

### External Integrations

| Integration | SDK | Purpose |
|-------------|-----|---------|
| **Whop API** | @whop/api 0.0.51 | Marketplace integration |
| **Whop React** | @whop/react 0.3.0 | Auth components |
| **Whop SDK** | @whop/sdk 0.0.2 | Server utilities |

### Development & Testing

| Tool | Version | Purpose |
|------|---------|---------|
| **Vitest** | 3.0.5 | Unit/integration testing |
| **Playwright** | 1.51.1 | E2E testing |
| **Biome** | 2.2.6 | Linting & formatting |
| **pnpm** | 9.15.9 | Package management |
| **Turbo** | - | Monorepo orchestration |

### Observability

| Tool | Purpose |
|------|---------|
| **OpenTelemetry** | Distributed tracing |
| **Custom Logger** | Structured logging with redaction |
| **Security Monitor** | Intrusion detection |

---

## Core Components

### 1. Webhook Handler (`/api/webhooks/whop`)

**Location:** `src/app/api/webhooks/whop/route.ts`

**Responsibilities:**
- Receive Whop webhook events
- Validate signatures (HMAC-SHA256)
- Check timestamp freshness (±300s tolerance)
- Apply rate limiting
- Store events for async processing

**Configuration:**
```typescript
// Rate limits
WEBHOOKS: {
  maxRequests: 100,        // Per company
  windowSeconds: 60,
  burstLimit: 20
}

// Timestamp tolerance
WEBHOOK_TIMESTAMP_SKEW_SECONDS: 300
```

### 2. Event Processor (`src/server/services/eventProcessor.ts`)

**Responsibilities:**
- Process stored webhook events asynchronously
- Extract payment/membership data
- Create/update recovery cases
- Handle event-specific business logic

**Supported Events:**
```typescript
type WebhookEventType =
  | 'payment.failed'
  | 'payment.succeeded'
  | 'membership.went_valid'
  | 'membership.went_invalid'
  | 'membership.renewed';
```

### 3. Case Manager (`src/server/services/cases.ts`)

**Responsibilities:**
- Create recovery cases on payment failure
- Track case lifecycle (open → recovered/closed)
- Manage reminder scheduling
- Calculate recovery metrics

**Case Status Flow:**
```
payment.failed → OPEN → [reminder cycle] → RECOVERED (payment.succeeded)
                   │                              or
                   └─────────────────────→ CLOSED_NO_RECOVERY (timeout)
```

### 4. Reminder Processor (`/api/cron/reminders`)

**Location:** `src/app/api/cron/reminders/route.ts`

**Responsibilities:**
- Select open `recovery_cases` due for reminder (`next_reminder_at <= now`)
- Send Whop push + DM (best-effort; failures are logged and do not block the run)
- Update attempts and compute `next_reminder_at` using `creator_settings.reminder_offsets_days`

**Default Schedule:**
```typescript
reminder_offsets_days: [0, 2, 4]  // Day 0, 2, 4 after failure
```

> Note: `src/server/services/scheduler.ts` exists as an optional, queue-based reminder scheduler. For launch simplicity and lower cost, the default path is the direct cron endpoint above.

### 5. Background Processing Mode (Cron-only, PgBoss optional)

**Cron-only (default, low-cost launch):**
- Webhooks are persisted to the `events` table with `processed=false`
- Vercel Cron calls `/api/cron/process-queue` to drain unprocessed events within a strict time budget
- Set `ENABLE_PG_BOSS=false` in production so no jobs accumulate in `pgboss.job`

**PgBoss (optional scale upgrade):**
- **Producer:** `src/server/services/jobQueue.ts` (enqueues `webhook-processing` jobs when enabled)
- **Worker:** `src/worker/queue-worker.ts` (long-lived process; not on Vercel)
- Enables retries and singleton keys for higher throughput, at the cost of extra infrastructure

> Operational note: `src/server/services/enhancedJobQueue.ts` is used by the maintenance endpoint for cleanup/metrics and is not required for the Cron-only launch path.

### 6. Security Monitor (`src/lib/security-monitoring.ts`)

**Responsibilities:**
- Intrusion detection
- Threat pattern recognition
- Session invalidation
- Security event logging

**Detection Patterns:**
- Brute force attacks
- Distributed attacks (DDoS)
- Anomalous access patterns
- Data exfiltration attempts
- Webhook abuse

---

## Data Flow

### Webhook Event Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WEBHOOK EVENT FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

1. INGESTION
   Whop Platform
        │
        ▼
   POST /api/webhooks/whop
        │
        ├── Validate signature (HMAC-SHA256)
        ├── Validate timestamp (±300s)
        ├── Parse & validate payload (Zod)
        └── Check rate limits
        │
        ▼
2. STORAGE (Synchronous)
   ┌─────────────────────────────────────────┐
   │            events table                  │
   │  • whop_event_id (idempotency key)      │
   │  • type, company_id, membership_id      │
   │  • encrypted_payload (AES-256-GCM)      │
   │  • processed = false                     │
   └─────────────────────────────────────────┘
        │
        ▼
3. QUEUE (Synchronous)
   ┌─────────────────────────────────────────┐
   │ OPTIONAL: PgBoss job queue (scale mode)  │
   │  • enabled when ENABLE_PG_BOSS=true      │
   │  • stores jobs in pgboss.job             │
   │  • name: 'webhook-processing'            │
   │  • data: { eventId, companyId, ... }     │
   │  • retryLimit: 3                         │
   └─────────────────────────────────────────┘
        │
        ▼
   Return 200 OK (within 10s timeout)

4. PROCESSING (Asynchronous - Cron-only launch)
   /api/cron/process-queue (every minute, time-budgeted)
        │
        ▼
   Event Processor
        │
        ├── payment.failed → Create recovery case
        ├── payment.succeeded → Mark case recovered
        ├── membership.went_valid → Update case status
        └── membership.went_invalid → Create/update case
        │
        ▼
   Mark event as processed
```

### Recovery Case Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RECOVERY CASE LIFECYCLE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                         payment.failed
                              │
                              ▼
                    ┌─────────────────┐
                    │   CASE CREATED  │
                    │   status: open  │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │  Day 0     │    │  Day 2     │    │  Day 4     │
    │  Reminder  │───▶│  Reminder  │───▶│  Reminder  │
    └────────────┘    └────────────┘    └────────────┘
           │                 │                 │
           │    payment.succeeded              │
           │         │                         │
           │         ▼                         │
           │  ┌────────────────┐              │
           └─▶│   RECOVERED    │◀─────────────┘
              │ status: recovered              │
              │ recovered_amount_cents: X      │
              └────────────────┘              │
                                              │
                              ┌───────────────┘
                              │ (timeout/max attempts)
                              ▼
                    ┌────────────────────┐
                    │  CLOSED_NO_RECOVERY │
                    │  status: closed     │
                    └────────────────────┘
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE SCHEMA                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────┐      ┌─────────────────────────────┐
│         events              │      │      recovery_cases         │
├─────────────────────────────┤      ├─────────────────────────────┤
│ id: uuid (PK)               │      │ id: uuid (PK)               │
│ whop_event_id: text (UQ)    │      │ company_id: text (IDX)      │
│ type: text                  │      │ membership_id: text         │
│ membership_id: text         │◀────▶│ user_id: text               │
│ company_id: text (IDX)      │      │ first_failure_at: timestamptz│
│ payload: jsonb (encrypted)  │      │ last_nudge_at: timestamptz  │
│ processed: boolean          │      │ next_reminder_at: timestamptz│
│ error: text                 │      │ attempts: int               │
│ created_at: timestamptz     │      │ incentive_days: int         │
└─────────────────────────────┘      │ status: text (CHECK)        │
                                     │ failure_reason: text        │
                                     │ recovered_amount_cents: int │
┌─────────────────────────────┐      │ created_at: timestamptz     │
│     creator_settings        │      │ updated_at: timestamptz     │
├─────────────────────────────┤      └─────────────────────────────┘
│ company_id: text (PK)       │
│ enable_push: boolean        │      ┌─────────────────────────────┐
│ enable_dm: boolean          │      │       rate_limits           │
│ incentive_days: int         │      ├─────────────────────────────┤
│ reminder_offsets_days: int[]│      │ id: uuid (PK)               │
│ created_at: timestamptz     │      │ identifier: text (IDX)      │
│ updated_at: timestamptz     │      │ tokens: numeric             │
└─────────────────────────────┘      │ last_refill: timestamptz    │
                                     │ created_at: timestamptz     │
┌─────────────────────────────┐      └─────────────────────────────┘
│      security_alerts        │
├─────────────────────────────┤      ┌─────────────────────────────┐
│ id: uuid (PK)               │      │    pgboss.job (PgBoss)      │
│ alert_type: text            │      ├─────────────────────────────┤
│ severity: text              │      │ id: uuid (PK)               │
│ source_ip: text             │      │ name: text                  │
│ user_id: text               │      │ data: jsonb                 │
│ company_id: text            │      │ state: text                 │
│ details: jsonb              │      │ retrylimit: int             │
│ resolved: boolean           │      │ retrycount: int             │
│ created_at: timestamptz     │      │ createdon: timestamptz      │
└─────────────────────────────┘      └─────────────────────────────┘
```

### Key Indexes

```sql
-- Events table
CREATE INDEX idx_events_company_id ON events(company_id);
CREATE INDEX idx_events_processed ON events(processed) WHERE processed = false;
CREATE INDEX idx_events_type ON events(type);

-- Recovery cases
CREATE INDEX idx_recovery_cases_company_id ON recovery_cases(company_id);
CREATE INDEX idx_recovery_cases_status ON recovery_cases(status);
CREATE INDEX idx_recovery_cases_next_reminder ON recovery_cases(next_reminder_at) 
  WHERE status = 'open';

-- Rate limits
CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier);
```

### Row Level Security (RLS)

```sql
-- Enable RLS on multi-tenant tables
ALTER TABLE recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their company's data
CREATE POLICY company_isolation ON recovery_cases
  USING (company_id = current_setting('app.current_company_id', true));
```

---

## Security Architecture

### Security Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER 1: EDGE PROTECTION                              │
│  • Vercel Edge Network (DDoS protection)                                    │
│  • TLS 1.3 encryption in transit                                            │
│  • Geographic restrictions (optional)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER 2: REQUEST VALIDATION                           │
│  • Request size limits (1MB default)                                        │
│  • Rate limiting (token bucket, per-company/IP)                             │
│  • Webhook signature verification (HMAC-SHA256)                             │
│  • Timestamp validation (replay attack prevention)                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER 3: AUTHENTICATION                               │
│  • Whop OAuth integration                                                   │
│  • JWT validation (jose library)                                            │
│  • Session management                                                       │
│  • Timing-safe token comparison                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER 4: AUTHORIZATION                                │
│  • RLS middleware (automatic context injection)                             │
│  • Company-scoped data access                                               │
│  • Role-based permissions                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER 5: DATA PROTECTION                              │
│  • AES-256-GCM encryption at rest                                           │
│  • Sensitive field encryption (payloads)                                    │
│  • PII redaction in logs                                                    │
│  • Secure key derivation (PBKDF2)                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAYER 6: MONITORING                                   │
│  • Security event tracking                                                  │
│  • Intrusion detection patterns                                             │
│  • Automated session invalidation                                           │
│  • Alert thresholds and notifications                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Encryption Implementation

```typescript
// Encryption configuration
Algorithm: AES-256-GCM
Key Length: 256 bits (32 bytes)
IV Length: 12 bytes (96 bits)
Auth Tag: 16 bytes (128 bits)

// Key derivation
PBKDF2 with SHA-256
Iterations: 100,000
Salt: Random 16 bytes
```

### Rate Limiting Configuration

```typescript
// Postgres-backed fixed-window counters (serverless-safe; no in-memory state)
// Source of truth: src/server/middleware/rateLimit.ts and route-specific overrides.
//
// Webhooks:
// - Base config: windowMs = 60s, maxRequests = 300 (used as a baseline)
// - Route override (recommended defaults):
//   - per-company: 100 req/min (when companyId can be extracted)
//   - per-IP fallback: 50 req/min (when companyId is missing)
//
// Other endpoints define their own config entries (api reads, scheduler, exports, etc.).
```

---

## Infrastructure & Deployment

### Vercel Configuration

```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm run build",
  "installCommand": "pnpm install",
  "outputDirectory": ".next",
  "functions": {
    "src/app/api/cron/process-queue/route.ts": { "maxDuration": 15 },
    "src/app/api/cron/reminders/route.ts": { "maxDuration": 15 },
    "src/app/api/cron/maintenance/route.ts": { "maxDuration": 60 },
    "src/app/api/**/*.ts": { "maxDuration": 10 }
  },
  "crons": [
    { "path": "/api/cron/process-queue", "schedule": "* * * * *" },
    { "path": "/api/cron/reminders", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/maintenance", "schedule": "0 * * * *" }
  ]
}
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://[user]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true

# Whop Integration
WHOP_APP_ID=app_xxxxx
WHOP_APP_SECRET=xxxxx
WHOP_WEBHOOK_SECRET=xxxxx
WHOP_API_KEY=xxxxx

# Security
JWT_SECRET=minimum_32_character_secret
ENCRYPTION_KEY=exactly_32_character_key_here!!

# Cron + processing mode
CRON_SECRET=minimum_16_character_secret
ENABLE_PG_BOSS=false

# Optional
LOG_DRAIN_URL=https://your-log-service.com/ingest
WEBHOOK_TIMESTAMP_SKEW_SECONDS=300
```

### Database Connection

```typescript
// Connection string format for serverless
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true

// Pool configuration
{
  max: 20,                    // Max connections in pool
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 10000,
  ssl: {
    rejectUnauthorized: true  // Enforce SSL verification
  }
}
```

### Cron Job Schedule

| Job | Schedule | Duration | Purpose |
|-----|----------|----------|---------|
| `process-queue` | Every minute | ~5s budget (15s max) | Drain unprocessed webhook events |
| `reminders` | Every 15 min | 10s max | Send scheduled reminders |
| `maintenance` | Hourly | 60s max | Cleanup, stats, archival |

> Uptime/health should be monitored via an external uptime checker hitting `/api/health` (free tiers are usually sufficient) to avoid unnecessary Vercel compute.

---

## Monitoring & Observability

### Logging Architecture

```typescript
// Log levels
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SECURITY = 4
}

// Log format (JSON)
{
  "timestamp": "2024-12-09T10:30:00.000Z",
  "level": "INFO",
  "category": "webhook",
  "message": "Event processed successfully",
  "metadata": {
    "eventId": "evt_xxx",
    "companyId": "co_xxx",
    "duration": 45
  }
}

// Sensitive field redaction
REDACTED_FIELDS = [
  'password', 'secret', 'token', 'key', 'authorization',
  'cookie', 'credential', 'card', 'ssn', 'apiKey'
]
```

### Security Monitoring Thresholds

```typescript
const ALERT_THRESHOLDS = {
  FAILED_AUTH_ATTEMPTS: 5,      // Trigger after 5 failures
  RATE_LIMIT_VIOLATIONS: 10,    // Trigger after 10 violations
  SUSPICIOUS_PATTERNS: 3,       // Trigger after 3 patterns
  DATA_ACCESS_ANOMALIES: 5      // Trigger after 5 anomalies
};

const SESSION_INVALIDATION_THRESHOLDS = {
  FAILED_AUTH_ATTEMPTS: 10,     // Invalidate after 10 failures
  RATE_LIMIT_VIOLATIONS: 20,    // Invalidate after 20 violations
  SUSPICIOUS_PATTERNS: 5        // Invalidate after 5 patterns
};
```

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-12-09T10:30:00.000Z",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "up", "latency": 12 },
    "jobQueue": { "status": "up", "pending": 5 },
    "memory": { "used": 128, "limit": 512 }
  }
}
```

---

## Cost Projections

### Tier 1: Launch Phase (0-1,000 Users)

| Service | Plan | Monthly Cost | Notes |
|---------|------|--------------|-------|
| Vercel | Pro | $20 | 100GB bandwidth, 100hrs compute |
| Supabase | Pro | $25 | 8GB database, daily backups |
| Domain | Included | $0 | Via Vercel |
| Uptime monitoring | Free tier | $0 | External uptime checker calling `/api/health` |
| Monitoring | Free tier | $0 | Start with Vercel Analytics/logs |
| **Total** | | **$45/month** | |

**Estimated Metrics:**
- ~10,000 webhook events/month
- ~500 API requests/day
- ~1GB database storage
- ~10GB bandwidth

**Cost guardrails (Cron-only mode):**
- Keep `/api/cron/process-queue` strictly time-budgeted (e.g. ~5s/run) so you stay inside included compute at launch.

### Tier 2: Growth Phase (1,000-10,000 Users)

| Service | Plan | Monthly Cost | Notes |
|---------|------|--------------|-------|
| Vercel | Pro + Functions | $50-100 | Additional compute |
| Supabase | Pro + Compute | $75-150 | More compute units |
| Monitoring | Free/Pro | $0-100 | Add APM/log drain as needed |
| Error Tracking (Sentry, optional) | Team | $0-26 | Add when incident volume requires it |
| Redis (Upstash, optional) | Pay-as-you-go | $0-50 | Rate limiting cache/caching upgrade |
| **Total** | | **$125-426/month** | |

**Estimated Metrics:**
- ~100,000 webhook events/month
- ~5,000 API requests/day
- ~5GB database storage
- ~50GB bandwidth

### Tier 3: Scale Phase (10,000-50,000 Users)

| Service | Plan | Monthly Cost | Notes |
|---------|------|--------------|-------|
| Vercel | Team/Enterprise | $200-500 | High availability |
| Supabase | Pro + Large Compute | $300-600 | Dedicated resources |
| Redis | Pro | $100-200 | High throughput |
| Monitoring | Enterprise | $200-400 | Full stack |
| CDN/Edge | Additional | $50-100 | Global distribution |
| **Total** | | **$850-1,800/month** | |

**Estimated Metrics:**
- ~500,000 webhook events/month
- ~25,000 API requests/day
- ~25GB database storage
- ~200GB bandwidth

### Cost Drivers

| Factor | Impact | Mitigation |
|--------|--------|------------|
| Webhook volume | High | Efficient batching, deduplication |
| Database compute | Medium | Query optimization, caching |
| Function invocations | Medium | Edge caching, static generation |
| Bandwidth | Low | CDN, compression |

### ROI Analysis

```
Assuming $5-10/month average revenue per recovered user:

Launch (100 recoveries/month):
  Revenue: $500-1,000
  Costs: $45
  ROI: 11-22x

Growth (500 recoveries/month):
  Revenue: $2,500-5,000
  Costs: $300
  ROI: 8-17x

Scale (2,000 recoveries/month):
  Revenue: $10,000-20,000
  Costs: $1,200
  ROI: 8-17x
```

---

## Scaling Strategy

### Horizontal Scaling (Automatic)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     VERCEL AUTO-SCALING                                      │
│                                                                              │
│  Request Volume    →    Function Instances                                  │
│  ─────────────────────────────────────────                                  │
│  Low (< 100/min)   →    1-2 instances                                       │
│  Medium (< 1K/min) →    5-10 instances                                      │
│  High (< 10K/min)  →    50+ instances                                       │
│                                                                              │
│  • Cold starts: ~200-500ms (first request)                                  │
│  • Warm: ~10-50ms                                                           │
│  • Max concurrent: Unlimited (Pro plan)                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Scaling Strategy

```
Phase 1: Single Instance (0-10K users)
├── Supabase Pro
├── PgBouncer pooling
└── Connection limit: 100

Phase 2: Optimized (10K-50K users)
├── Query optimization
├── Index tuning
├── Read replica consideration
└── Connection limit: 200

Phase 3: Distributed (50K+ users)
├── Read replicas (multi-region)
├── Sharding by company_id
├── Dedicated compute
└── Connection limit: 500+
```

### Caching Strategy

```typescript
// Future Redis implementation
interface CacheStrategy {
  // Rate limits - most critical
  rateLimits: {
    ttl: 60,           // 1 minute
    prefix: 'rl:'
  },
  
  // Session data
  sessions: {
    ttl: 3600,         // 1 hour
    prefix: 'session:'
  },
  
  // Dashboard analytics
  analytics: {
    ttl: 300,          // 5 minutes
    prefix: 'analytics:'
  }
}
```

---

## Replication Guide

### Prerequisites

1. **Accounts Required:**
   - Vercel account (Pro recommended)
   - Supabase account (Pro recommended)
   - Whop developer account
   - GitHub/GitLab repository

2. **Local Development:**
   - Node.js 18+
   - pnpm 9+
   - PostgreSQL 15+ (local or Docker)

### Step 1: Repository Setup

```bash
# Clone the repository
git clone https://github.com/your-org/churnsaver.git
cd churnsaver

# Install dependencies
pnpm install

# Copy environment template
cp apps/web/env.example apps/web/.env.local
```

### Step 2: Database Setup

```sql
-- 1. Create Supabase project
-- 2. Run migrations in order
\i infra/migrations/001_init.sql
\i infra/migrations/002_enable_rls_policies.sql
\i infra/migrations/003_add_job_queue.sql
-- ... continue with all migrations

-- 3. Enable required extensions (encryption helpers)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Optional: PgBoss worker mode (only if ENABLE_PG_BOSS=true)
-- PgBoss will create/manage its own schema on first start.
```

### Step 3: Whop App Configuration

1. Create new app at [Whop Developer Portal](https://whop.com/apps)
2. Configure OAuth redirect URLs:
   - Development: `http://localhost:3000/api/auth/callback/whop`
   - Production: `https://your-domain.vercel.app/api/auth/callback/whop`
3. Enable webhook events:
   - `payment.failed`
   - `payment.succeeded`
   - `membership.went_valid`
   - `membership.went_invalid`
4. Set webhook URL: `https://your-domain.vercel.app/api/webhooks/whop`

### Step 4: Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Set environment variables
vercel env add DATABASE_URL
vercel env add WHOP_APP_ID
vercel env add WHOP_APP_SECRET
vercel env add WHOP_WEBHOOK_SECRET
vercel env add ENCRYPTION_KEY
vercel env add JWT_SECRET

# Deploy
vercel --prod
```

### Step 5: Post-Deployment Verification

```bash
# Run health check
curl https://your-domain.vercel.app/api/health

# Test webhook (use Whop dashboard test event)
# Verify in logs that event was received and processed

# Run test suite
pnpm test
pnpm test:e2e:staging
```

### Configuration Checklist

- [ ] Database connection string uses pooler URL (port 6543)
- [ ] All required environment variables set
- [ ] Webhook secret matches Whop dashboard
- [ ] SSL/TLS enabled for database connection
- [ ] Cron jobs configured in vercel.json
- [ ] Domain configured and SSL certificate active
- [ ] Monitoring/logging configured

---

## Appendix

### File Structure

```
churnsaver/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── api/
│       │   │   │   ├── webhooks/whop/route.ts
│       │   │   │   ├── cron/
│       │   │   │   ├── cases/
│       │   │   │   └── health/
│       │   │   ├── dashboard/
│       │   │   └── settings/
│       │   ├── lib/
│       │   │   ├── db-rls.ts
│       │   │   ├── encryption.ts
│       │   │   ├── errorHandler.ts
│       │   │   ├── logger.ts
│       │   │   ├── rls-middleware.ts
│       │   │   ├── security-monitoring.ts
│       │   │   └── whop/
│       │   │       ├── webhookValidator.ts
│       │   │       ├── dataValidators.ts
│       │   │       └── dataTransformers.ts
│       │   ├── server/
│       │   │   ├── services/
│       │   │   │   ├── cases.ts
│       │   │   │   ├── eventProcessor.ts
│       │   │   │   ├── enhancedJobQueue.ts
│       │   │   │   └── scheduler.ts
│       │   │   ├── middleware/
│       │   │   │   └── rateLimit.ts
│       │   │   └── webhooks/
│       │   │       └── whop.ts
│       │   └── components/
│       ├── test/
│       ├── docs/
│       └── production/
├── infra/
│   ├── migrations/
│   └── scripts/
└── turbo.json
```

### Key Dependencies Summary

| Package | Version | Critical For |
|---------|---------|--------------|
| next | 16.0.7 | Application framework |
| @whop/api | 0.0.51 | Whop API integration |
| pg | 8.12.0 | Database operations |
| pg-boss | 11.1.1 | Job queue |
| zod | 4.1.12 | Schema validation |
| jose | 5.9.0 | JWT handling |
| bcrypt | 6.0.0 | Password security |

### Related Documentation

- [Whop Developer Docs](https://dev.whop.com)
- [Supabase Docs](https://supabase.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [PgBoss Documentation](https://github.com/timgit/pg-boss)
- [Next.js Documentation](https://nextjs.org/docs)

---

*This document was generated on December 9, 2024 and reflects the architecture as of version 1.0.0.*

