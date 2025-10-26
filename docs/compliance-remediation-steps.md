# Compliance Violations Technical Remediation Steps

**Project:** Churn Saver  
**Date:** 2025-10-25  
**Version:** 1.0  

---

## Critical Violation #1: Missing GDPR User Deletion Endpoints

### 1. Specific Code Implementation Details

#### 1.1 User Deletion API Endpoint
**File:** `apps/web/src/app/api/user/delete/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/whop/authMiddleware';
import { apiSuccess, apiError, errors } from '@/lib/apiResponse';
import { deleteUserData } from '@/lib/data-deletion';
import { logger } from '@/lib/logger';
import { createRequestContext } from '@/lib/apiResponse';

export const DELETE = requireAuth(async (request: NextRequest, context) => {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    logger.info('User deletion request initiated', {
      userId,
      requestId: requestContext.requestId,
      timestamp: new Date().toISOString()
    });

    await deleteUserData(userId, {
      requestId: requestContext.requestId,
      deletedBy: userId,
      reason: 'user_request'
    });

    logger.info('User deletion completed successfully', {
      userId,
      requestId: requestContext.requestId
    });

    return apiSuccess({ 
      message: 'User data deletion completed',
      deletedAt: new Date().toISOString()
    }, requestContext);

  } catch (error) {
    logger.error('User deletion failed', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('User deletion failed', { details: error.message }) :
        errors.internalServerError('User deletion failed'),
      requestContext
    );
  }
});
```

#### 1.2 Data Deletion Service
**File:** `apps/web/src/lib/data-deletion.ts`

```typescript
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt } from '@/lib/encryption';

interface DeletionOptions {
  requestId: string;
  deletedBy: string;
  reason: 'user_request' | 'admin_action' | 'retention_policy';
  softDelete?: boolean;
}

interface DeletionResult {
  userId: string;
  deletedRecords: number;
  tablesProcessed: string[];
  errors: string[];
  timestamp: string;
}

export async function deleteUserData(userId: string, options: DeletionOptions): Promise<DeletionResult> {
  const startTime = Date.now();
  const result: DeletionResult = {
    userId,
    deletedRecords: 0,
    tablesProcessed: [],
    errors: [],
    timestamp: new Date().toISOString()
  };

  // Begin transaction for atomic deletion
  const client = await getDb().pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Record deletion request before processing
    await client.query(
      `INSERT INTO user_deletions (user_id, deletion_reason, completed, request_id) 
       VALUES ($1, $2, false, $3)`,
      [userId, options.reason, options.requestId]
    );

    // Delete from recovery_cases
    try {
      const casesResult = await client.query(
        'DELETE FROM recovery_cases WHERE user_id = $1 RETURNING id',
        [userId]
      );
      result.deletedRecords += casesResult.rowCount || 0;
      result.tablesProcessed.push('recovery_cases');
      
      logger.info('Deleted recovery cases', {
        userId,
        count: casesResult.rowCount,
        requestId: options.requestId
      });
    } catch (error) {
      const errorMsg = `Failed to delete recovery_cases: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg, { userId, requestId: options.requestId });
    }

    // Delete from events (check payload for user_id)
    try {
      const eventsResult = await client.query(
        `DELETE FROM events WHERE payload->>'user_id' = $1 OR payload->>'membership_id' IN 
         (SELECT membership_id FROM recovery_cases WHERE user_id = $1) RETURNING id`,
        [userId]
      );
      result.deletedRecords += eventsResult.rowCount || 0;
      result.tablesProcessed.push('events');
      
      logger.info('Deleted events', {
        userId,
        count: eventsResult.rowCount,
        requestId: options.requestId
      });
    } catch (error) {
      const errorMsg = `Failed to delete events: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg, { userId, requestId: options.requestId });
    }

    // Delete from recovery_actions
    try {
      const actionsResult = await client.query(
        'DELETE FROM recovery_actions WHERE user_id = $1 RETURNING id',
        [userId]
      );
      result.deletedRecords += actionsResult.rowCount || 0;
      result.tablesProcessed.push('recovery_actions');
      
      logger.info('Deleted recovery actions', {
        userId,
        count: actionsResult.rowCount,
        requestId: options.requestId
      });
    } catch (error) {
      const errorMsg = `Failed to delete recovery_actions: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg, { userId, requestId: options.requestId });
    }

    // Update deletion tracking
    await client.query(
      `UPDATE user_deletions SET completed = true, completed_at = NOW(), 
       deletion_summary = $1 WHERE user_id = $2 AND request_id = $3`,
      [encrypt(JSON.stringify(result)), userId, options.requestId]
    );

    await client.query('COMMIT');
    
    logger.info('User deletion transaction completed', {
      userId,
      totalRecords: result.deletedRecords,
      tablesProcessed: result.tablesProcessed.length,
      errors: result.errors.length,
      duration: Date.now() - startTime,
      requestId: options.requestId
    });

  } catch (error) {
    await client.query('ROLLBACK');
    
    logger.error('User deletion transaction failed, rolled back', {
      userId,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      requestId: options.requestId
    });
    
    throw error;
  } finally {
    client.release();
  }

  return result;
}

export async function getUserDeletionStatus(userId: string): Promise<any> {
  const result = await sql.query(`
    SELECT * FROM user_deletions 
    WHERE user_id = $1 
    ORDER BY created_at DESC 
    LIMIT 1
  `, [userId]);
  
  return result.rows[0] || null;
}

export async function verifyUserDeletion(userId: string): Promise<boolean> {
  const checks = await Promise.allSettled([
    sql.query('SELECT COUNT(*) as count FROM recovery_cases WHERE user_id = $1', [userId]),
    sql.query(`SELECT COUNT(*) as count FROM events WHERE payload->>'user_id' = $1`, [userId]),
    sql.query('SELECT COUNT(*) as count FROM recovery_actions WHERE user_id = $1', [userId])
  ]);

  const totalRemaining = checks.reduce((sum, check) => {
    if (check.status === 'fulfilled' && check.value.rows[0]) {
      return sum + parseInt(check.value.rows[0].count);
    }
    return sum;
  }, 0);

  return totalRemaining === 0;
}
```

### 2. Database Schema Changes

#### 2.1 User Deletion Tracking Table
**File:** `infra/migrations/015_user_deletion_tracking.sql`

```sql
-- Migration: 015_user_deletion_tracking.sql
-- Description: Add user deletion tracking for GDPR compliance

-- Create user deletions tracking table
CREATE TABLE IF NOT EXISTS user_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  request_id text NOT NULL,
  deleted_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  deletion_reason text NOT NULL CHECK (deletion_reason IN ('user_request', 'admin_action', 'retention_policy')),
  completed boolean DEFAULT false,
  deletion_summary jsonb, -- Encrypted summary of deletion results
  created_by text,
  metadata jsonb DEFAULT '{}',
  
  -- Constraints
  CONSTRAINT user_deletions_user_id_check CHECK (length(user_id) > 0),
  CONSTRAINT user_deletions_request_id_check CHECK (length(request_id) > 0)
);

-- Indexes for performance and auditing
CREATE INDEX IF NOT EXISTS idx_user_deletions_user_id ON user_deletions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_deletions_created_at ON user_deletions(created_at);
CREATE INDEX IF NOT EXISTS idx_user_deletions_completed ON user_deletions(completed);

-- Row Level Security for multi-tenant isolation
ALTER TABLE user_deletions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own deletions
CREATE POLICY user_deletions_user_policy ON user_deletions
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- RLS Policy: Admins can see all deletions
CREATE POLICY user_deletions_admin_policy ON user_deletions
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

-- Comments for documentation
COMMENT ON TABLE user_deletions IS 'Tracks GDPR user deletion requests and results for compliance auditing';
COMMENT ON COLUMN user_deletions.deletion_summary IS 'Encrypted JSON summary of deletion results including record counts and any errors';
COMMENT ON COLUMN user_deletions.deletion_reason IS 'Reason for deletion: user_request, admin_action, or retention_policy';
```

#### 2.2 Rollback Migration
**File:** `infra/migrations/015_rollback.sql`

```sql
-- Migration: 015_rollback.sql
-- Description: Rollback user deletion tracking

DROP TABLE IF EXISTS user_deletions CASCADE;
```

### 3. Configuration Changes Required

#### 3.1 Environment Variables
Add to `.env.development` and `.env.production`:

```bash
# GDPR Compliance Settings
GDPR_DELETION_ENABLED=true
GDPR_DELETION_RETENTION_DAYS=2555  # 7 years as required by some regulations
GDPR_DELETION_SOFT_DELETE=false  # Set to true for soft delete during testing
```

#### 3.2 Rate Limiting Configuration
**File:** `apps/web/src/server/middleware/rateLimit.ts` (modify existing)

```typescript
// Add deletion endpoint rate limiting
const deletionRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1, // Only 1 deletion request per user per day
  message: 'Too many deletion requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to deletion endpoint
export const withDeletionRateLimit = deletionRateLimit;
```

### 4. Dependencies That Need to Be Installed

No new dependencies required - uses existing packages:
- `pg` (already installed)
- `@types/pg` (already installed)
- `crypto` (Node.js built-in)
- Existing encryption utilities

### 5. Integration Points with Existing Code

#### 5.1 Integration with Authentication System
**File:** `apps/web/src/lib/whop/authMiddleware.ts` (extend existing)

```typescript
// Add user deletion permission check
export function requireUserDeletionPermission() {
  return async (request: NextRequest) => {
    const context = await whopAuthService.authenticate(request);
    
    if (!context.isAuthenticated) {
      throw errors.unauthorized('Authentication required for user deletion');
    }
    
    // Users can only delete their own data
    const { userId } = context.auth;
    
    return {
      ...context,
      canDeleteOwnData: true,
      targetUserId: userId
    };
  };
}
```

#### 5.2 Integration with Existing Error Handling
**File:** `apps/web/src/lib/errorRecovery.ts` (extend existing)

```typescript
// Add deletion-specific error recovery
export const handleDeletionError = async (
  error: Error, 
  userId: string, 
  requestId: string
): Promise<void> => {
  logger.error('User deletion error recovery initiated', {
    userId,
    requestId,
    error: error.message,
    timestamp: new Date().toISOString()
  });

  // Check if partial deletion occurred
  const verification = await verifyUserDeletion(userId);
  
  if (!verification) {
    // Schedule retry for incomplete deletion
    await scheduleDeletionRetry(userId, requestId, {
      reason: 'partial_deletion',
      originalError: error.message
    });
  }
};

async function scheduleDeletionRetry(
  userId: string, 
  requestId: string, 
  metadata: any
): Promise<void> {
  // Add to job queue for retry
  await sql.query(`
    INSERT INTO job_queue (job_type, payload, scheduled_at, priority)
    VALUES ('user_deletion_retry', $1, NOW() + INTERVAL '1 hour', 1)
  `, [JSON.stringify({ userId, requestId, metadata })]);
}
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Automated Tests
**File:** `apps/web/test/user-deletion.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { deleteUserData, verifyUserDeletion, getUserDeletionStatus } from '@/lib/data-deletion';
import { sql } from '@/lib/db';

describe('User Data Deletion', () => {
  const testUserId = 'test_user_' + Date.now();
  
  beforeEach(async () => {
    // Create test data
    await sql.query('INSERT INTO recovery_cases (id, user_id, company_id, membership_id, first_failure_at) VALUES ($1, $2, $3, $4, NOW())', 
      [`case_${testUserId}`, testUserId, 'test_company', 'membership_1']);
    
    await sql.query(`INSERT INTO events (whop_event_id, type, membership_id, payload) VALUES ($1, $2, $3, $4)`, 
      [`evt_${testUserId}`, 'payment.succeeded', 'membership_1', JSON.stringify({ user_id: testUserId })]);
  });

  afterEach(async () => {
    // Cleanup test data
    await sql.query('DELETE FROM recovery_cases WHERE user_id LIKE $1', [`${testUserId}%`]);
    await sql.query('DELETE FROM events WHERE payload->>\'user_id\' = $1', [testUserId]);
    await sql.query('DELETE FROM user_deletions WHERE user_id = $1', [testUserId]);
  });

  it('should delete all user data successfully', async () => {
    const result = await deleteUserData(testUserId, {
      requestId: 'test_req_123',
      deletedBy: testUserId,
      reason: 'user_request'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.tablesProcessed).toContain('recovery_cases');
    expect(result.tablesProcessed).toContain('events');
    expect(result.deletedRecords).toBeGreaterThan(0);
  });

  it('should verify complete deletion', async () => {
    await deleteUserData(testUserId, {
      requestId: 'test_req_124',
      deletedBy: testUserId,
      reason: 'user_request'
    });

    const isDeleted = await verifyUserDeletion(testUserId);
    expect(isDeleted).toBe(true);
  });

  it('should track deletion request', async () => {
    await deleteUserData(testUserId, {
      requestId: 'test_req_125',
      deletedBy: testUserId,
      reason: 'user_request'
    });

    const status = await getUserDeletionStatus(testUserId);
    expect(status).toBeTruthy();
    expect(status.completed).toBe(true);
    expect(status.deletion_reason).toBe('user_request');
  });
});
```

#### 6.2 API Endpoint Testing
**File:** `apps/web/test/api/user-delete.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import { DELETE } from '@/app/api/user/delete/route';

describe('User Deletion API', () => {
  it('should require authentication', async () => {
    const request = new Request('http://localhost:3000/api/user/delete', {
      method: 'DELETE'
    });

    const response = await DELETE(request);
    expect(response.status).toBe(401);
  });

  it('should delete user data for authenticated user', async () => {
    const mockRequest = {
      headers: {
        get: (key: string) => key === 'authorization' ? 'Bearer valid_token' : null
      }
    };

    const response = await DELETE(mockRequest as any);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.message).toContain('deletion completed');
  });
});
```

#### 6.3 Manual Verification Commands

```bash
# Test deletion endpoint
curl -X DELETE http://localhost:3000/api/user/delete \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Verify deletion in database
psql $DATABASE_URL -c "
  SELECT * FROM user_deletions 
  WHERE user_id = 'test_user_id' 
  ORDER BY created_at DESC 
  LIMIT 1;
"

# Check for remaining user data
psql $DATABASE_URL -c "
  SELECT 
    (SELECT COUNT(*) FROM recovery_cases WHERE user_id = 'test_user_id') as cases,
    (SELECT COUNT(*) FROM events WHERE payload->>'user_id' = 'test_user_id') as events,
    (SELECT COUNT(*) FROM recovery_actions WHERE user_id = 'test_user_id') as actions;
"
```

#### 6.4 Integration Test Script
**File:** `scripts/test-user-deletion.js`

```bash
#!/bin/bash
# User Deletion Integration Test

echo "🧪 Testing User Deletion Implementation..."

# 1. Create test user data
echo "📝 Creating test user data..."
node scripts/create-test-user-data.js

# 2. Test deletion API
echo "🗑️  Testing deletion API..."
curl -X DELETE http://localhost:3000/api/user/delete \
  -H "Authorization: Bearer TEST_TOKEN" \
  -H "Content-Type: application/json" \
  | jq .

# 3. Verify database cleanup
echo "🔍 Verifying database cleanup..."
node scripts/verify-deletion.js

# 4. Check audit trail
echo "📋 Checking audit trail..."
psql $DATABASE_URL -c "
  SELECT user_id, deletion_reason, completed, created_at 
  FROM user_deletions 
  WHERE user_id LIKE 'test_%' 
  ORDER BY created_at DESC 
  LIMIT 5;
"

echo "✅ User deletion testing completed!"
```

---

## High Severity Violation #2: Missing Data Export Functionality

### 1. Specific Code Implementation Details

#### 1.1 Data Export API Endpoint
**File:** `apps/web/src/app/api/user/export/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/whop/authMiddleware';
import { apiSuccess, apiError, errors } from '@/lib/apiResponse';
import { exportUserData } from '@/lib/data-export';
import { logger } from '@/lib/logger';
import { createRequestContext } from '@/lib/apiResponse';

interface ExportRequest {
  format?: 'json' | 'csv';
  includeEvents?: boolean;
  includeCases?: boolean;
  includeActions?: boolean;
  dateRange?: {
    from: string;
    to: string;
  };
}

export const POST = requireAuth(async (request: NextRequest, context) => {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    const body: ExportRequest = await request.json().catch(() => ({}));
    const exportOptions = {
      format: body.format || 'json',
      includeEvents: body.includeEvents ?? true,
      includeCases: body.includeCases ?? true,
      includeActions: body.includeActions ?? true,
      dateRange: body.dateRange,
      userId,
      requestId: requestContext.requestId
    };

    logger.info('User data export request initiated', {
      userId,
      format: exportOptions.format,
      requestId: requestContext.requestId,
      timestamp: new Date().toISOString()
    });

    const exportResult = await exportUserData(exportOptions);

    logger.info('User data export completed successfully', {
      userId,
      recordCount: exportResult.totalRecords,
      format: exportOptions.format,
      requestId: requestContext.requestId
    });

    // Set appropriate headers for download
    const headers = new Headers({
      'Content-Type': exportOptions.format === 'csv' ? 'text/csv' : 'application/json',
      'Content-Disposition': `attachment; filename="user-data-${userId}-${new Date().toISOString().split('T')[0]}.${exportOptions.format}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    });

    return new NextResponse(exportResult.data, {
      status: 200,
      headers
    });

  } catch (error) {
    logger.error('User data export failed', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('Data export failed', { details: error.message }) :
        errors.internalServerError('Data export failed'),
      requestContext
    );
  }
});
```

#### 1.2 Data Export Service
**File:** `apps/web/src/lib/data-export.ts`

```typescript
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt } from '@/lib/encryption';

interface ExportOptions {
  userId: string;
  requestId: string;
  format: 'json' | 'csv';
  includeEvents: boolean;
  includeCases: boolean;
  includeActions: boolean;
  dateRange?: {
    from: string;
    to: string;
  };
}

interface ExportResult {
  data: string;
  format: string;
  totalRecords: number;
  exportTime: string;
  recordCounts: {
    events: number;
    cases: number;
    actions: number;
  };
}

export async function exportUserData(options: ExportOptions): Promise<ExportResult> {
  const startTime = Date.now();
  const result: ExportResult = {
    data: '',
    format: options.format,
    totalRecords: 0,
    exportTime: new Date().toISOString(),
    recordCounts: {
      events: 0,
      cases: 0,
      actions: 0
    }
  };

  try {
    const exportData: any = {
      userId: options.userId,
      exportDate: new Date().toISOString(),
      requestId: options.requestId,
      data: {}
    };

    // Export recovery cases
    if (options.includeCases) {
      const casesQuery = buildCasesQuery(options.dateRange);
      const casesResult = await sql.query(casesQuery, [options.userId]);
      exportData.data.recoveryCases = casesResult.rows;
      result.recordCounts.cases = casesResult.rowCount || 0;
      
      logger.info('Exported recovery cases', {
        userId: options.userId,
        count: casesResult.rowCount,
        requestId: options.requestId
      });
    }

    // Export events
    if (options.includeEvents) {
      const eventsQuery = buildEventsQuery(options.dateRange);
      const eventsResult = await sql.query(eventsQuery, [options.userId]);
      exportData.data.events = eventsResult.rows;
      result.recordCounts.events = eventsResult.rowCount || 0;
      
      logger.info('Exported events', {
        userId: options.userId,
        count: eventsResult.rowCount,
        requestId: options.requestId
      });
    }

    // Export recovery actions
    if (options.includeActions) {
      const actionsQuery = buildActionsQuery(options.dateRange);
      const actionsResult = await sql.query(actionsQuery, [options.userId]);
      exportData.data.recoveryActions = actionsResult.rows;
      result.recordCounts.actions = actionsResult.rowCount || 0;
      
      logger.info('Exported recovery actions', {
        userId: options.userId,
        count: actionsResult.rowCount,
        requestId: options.requestId
      });
    }

    result.totalRecords = result.recordCounts.events + result.recordCounts.cases + result.recordCounts.actions;

    // Format output
    if (options.format === 'csv') {
      result.data = convertToCSV(exportData);
    } else {
      // Sanitize sensitive data before JSON export
      result.data = JSON.stringify(sanitizeExportData(exportData), null, 2);
    }

    // Track export for audit purposes
    await trackDataExport(options, result);

    logger.info('Data export completed', {
      userId: options.userId,
      totalRecords: result.totalRecords,
      format: options.format,
      duration: Date.now() - startTime,
      requestId: options.requestId
    });

    return result;

  } catch (error) {
    logger.error('Data export failed', {
      userId: options.userId,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      requestId: options.requestId
    });
    
    throw error;
  }
}

function buildCasesQuery(dateRange?: { from: string; to: string }): string {
  let query = `
    SELECT 
      id,
      company_id,
      membership_id,
      first_failure_at,
      last_nudge_at,
      attempts,
      incentive_days,
      status,
      failure_reason,
      recovered_amount_cents,
      created_at,
      updated_at
    FROM recovery_cases 
    WHERE user_id = $1
  `;

  if (dateRange) {
    query += ` AND created_at >= '${dateRange.from}' AND created_at <= '${dateRange.to}'`;
  }

  query += ' ORDER BY created_at DESC';
  return query;
}

function buildEventsQuery(dateRange?: { from: string; to: string }): string {
  let query = `
    SELECT 
      whop_event_id,
      type,
      membership_id,
      processed_at,
      created_at
    FROM events 
    WHERE payload->>'user_id' = $1
  `;

  if (dateRange) {
    query += ` AND created_at >= '${dateRange.from}' AND created_at <= '${dateRange.to}'`;
  }

  query += ' ORDER BY created_at DESC';
  return query;
}

function buildActionsQuery(dateRange?: { from: string; to: string }): string {
  let query = `
    SELECT 
      case_id,
      type,
      channel,
      metadata,
      created_at
    FROM recovery_actions 
    WHERE user_id = $1
  `;

  if (dateRange) {
    query += ` AND created_at >= '${dateRange.from}' AND created_at <= '${dateRange.to}'`;
  }

  query += ' ORDER BY created_at DESC';
  return query;
}

function sanitizeExportData(data: any): any {
  // Remove sensitive fields while maintaining data utility
  const sanitized = { ...data };
  
  if (sanitized.data?.events) {
    sanitized.data.events = sanitized.data.events.map((event: any) => {
      const { payload, ...safeEvent } = event;
      return safeEvent;
    });
  }

  return sanitized;
}

function convertToCSV(data: any): string {
  const headers = ['recordType', 'id', 'type', 'status', 'createdAt', 'metadata'];
  const rows = [headers.join(',')];

  // Add recovery cases
  if (data.data.recoveryCases) {
    data.data.recoveryCases.forEach((record: any) => {
      rows.push([
        'recovery_case',
        record.id,
        '',
        record.status,
        record.created_at,
        JSON.stringify({
          membershipId: record.membership_id,
          attempts: record.attempts,
          incentiveDays: record.incentive_days
        }).replace(/"/g, '""')
      ].join(','));
    });
  }

  // Add events
  if (data.data.events) {
    data.data.events.forEach((record: any) => {
      rows.push([
        'event',
        record.whop_event_id,
        record.type,
        '',
        record.created_at,
        JSON.stringify({
          membershipId: record.membership_id
        }).replace(/"/g, '""')
      ].join(','));
    });
  }

  // Add recovery actions
  if (data.data.recoveryActions) {
    data.data.recoveryActions.forEach((record: any) => {
      rows.push([
        'recovery_action',
        record.case_id,
        record.type,
        '',
        record.created_at,
        JSON.stringify({
          channel: record.channel,
          metadata: record.metadata
        }).replace(/"/g, '""')
      ].join(','));
    });
  }

  return rows.join('\n');
}

async function trackDataExport(options: ExportOptions, result: ExportResult): Promise<void> {
  try {
    await sql.query(`
      INSERT INTO data_exports (user_id, request_id, format, record_count, export_summary, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      options.userId,
      options.requestId,
      options.format,
      result.totalRecords,
      encrypt(JSON.stringify(result.recordCounts))
    ]);
  } catch (error) {
    logger.warn('Failed to track data export', {
      userId: options.userId,
      error: error instanceof Error ? error.message : String(error),
      requestId: options.requestId
    });
  }
}
```

### 2. Database Schema Changes

#### 2.1 Data Export Tracking Table
**File:** `infra/migrations/016_data_export_tracking.sql`

```sql
-- Migration: 016_data_export_tracking.sql
-- Description: Add data export tracking for GDPR compliance

-- Create data exports tracking table
CREATE TABLE IF NOT EXISTS data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  request_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('json', 'csv')),
  record_count integer NOT NULL DEFAULT 0,
  export_summary jsonb, -- Encrypted summary of export contents
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT data_exports_user_id_check CHECK (length(user_id) > 0),
  CONSTRAINT data_exports_request_id_check CHECK (length(request_id) > 0),
  CONSTRAINT data_exports_record_count_check CHECK (record_count >= 0)
);

-- Indexes for performance and auditing
CREATE INDEX IF NOT EXISTS idx_data_exports_user_id ON data_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_data_exports_created_at ON data_exports(created_at);
CREATE INDEX IF NOT EXISTS idx_data_exports_user_created ON data_exports(user_id, created_at);

-- Row Level Security
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own exports
CREATE POLICY data_exports_user_policy ON data_exports
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- RLS Policy: Admins can see all exports
CREATE POLICY data_exports_admin_policy ON data_exports
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

-- Comments for documentation
COMMENT ON TABLE data_exports IS 'Tracks GDPR data export requests for compliance auditing';
COMMENT ON COLUMN data_exports.export_summary IS 'Encrypted JSON summary of export contents including record counts by type';
COMMENT ON COLUMN data_exports.format IS 'Export format: json or csv';
```

#### 2.2 Rollback Migration
**File:** `infra/migrations/016_rollback.sql`

```sql
-- Migration: 016_rollback.sql
-- Description: Rollback data export tracking

DROP TABLE IF EXISTS data_exports CASCADE;
```

### 3. Configuration Changes Required

#### 3.1 Environment Variables
Add to `.env.development` and `.env.production`:

```bash
# Data Export Settings
DATA_EXPORT_ENABLED=true
DATA_EXPORT_MAX_RECORDS=10000
DATA_EXPORT_RATE_LIMIT_HOURS=24
DATA_EXPORT_INCLUDE_SENSITIVE_DATA=false
```

#### 3.2 API Rate Limiting
**File:** `apps/web/src/server/middleware/rateLimit.ts` (extend existing)

```typescript
// Add export endpoint rate limiting
const exportRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // Maximum 5 exports per user per day
  message: 'Too many export requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const withExportRateLimit = exportRateLimit;
```

### 4. Dependencies That Need to Be Installed

No new dependencies required - uses existing packages:
- `pg` (already installed)
- Existing utilities and middleware

### 5. Integration Points with Existing Code

#### 5.1 Integration with Authentication Middleware
**File:** `apps/web/src/app/api/user/export/route.ts` (uses existing)

```typescript
// Uses existing requireAuth middleware
export const POST = requireAuth(async (request: NextRequest, context) => {
  // Implementation uses existing authentication patterns
});
```

#### 5.2 Integration with Existing Error Handling
**File:** `apps/web/src/lib/data-export.ts` (extend existing error patterns)

```typescript
// Uses existing error handling patterns
import { logger } from '@/lib/logger';
import { errors } from '@/lib/apiResponse';
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Automated Tests
**File:** `apps/web/test/data-export.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { exportUserData } from '@/lib/data-export';
import { sql } from '@/lib/db';

describe('User Data Export', () => {
  const testUserId = 'test_user_' + Date.now();
  
  beforeEach(async () => {
    // Create test data
    await sql.query('INSERT INTO recovery_cases (id, user_id, company_id, membership_id, first_failure_at) VALUES ($1, $2, $3, $4, NOW())', 
      [`case_${testUserId}`, testUserId, 'test_company', 'membership_1']);
    
    await sql.query(`INSERT INTO events (whop_event_id, type, membership_id, payload) VALUES ($1, $2, $3, $4)`, 
      [`evt_${testUserId}`, 'payment.succeeded', 'membership_1', JSON.stringify({ user_id: testUserId })]);
  });

  afterEach(async () => {
    // Cleanup test data
    await sql.query('DELETE FROM recovery_cases WHERE user_id LIKE $1', [`${testUserId}%`]);
    await sql.query('DELETE FROM events WHERE payload->>\'user_id\' = $1', [testUserId]);
    await sql.query('DELETE FROM data_exports WHERE user_id = $1', [testUserId]);
  });

  it('should export user data in JSON format', async () => {
    const result = await exportUserData({
      userId: testUserId,
      requestId: 'test_req_123',
      format: 'json',
      includeEvents: true,
      includeCases: true,
      includeActions: true
    });

    expect(result.format).toBe('json');
    expect(result.totalRecords).toBeGreaterThan(0);
    expect(result.data).toContain('userId');
    expect(result.data).toContain('recoveryCases');
  });

  it('should export user data in CSV format', async () => {
    const result = await exportUserData({
      userId: testUserId,
      requestId: 'test_req_124',
      format: 'csv',
      includeEvents: true,
      includeCases: true,
      includeActions: true
    });

    expect(result.format).toBe('csv');
    expect(result.data).toContain('recordType');
    expect(result.data).toContain('recovery_case');
  });

  it('should filter by date range', async () => {
    const dateRange = {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
      to: new Date().toISOString()
    };

    const result = await exportUserData({
      userId: testUserId,
      requestId: 'test_req_125',
      format: 'json',
      includeEvents: true,
      includeCases: true,
      includeActions: true,
      dateRange
    });

    expect(result.totalRecords).toBeGreaterThan(0);
  });
});
```

#### 6.2 API Endpoint Testing
**File:** `apps/web/test/api/user-export.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import { POST } from '@/app/api/user/export/route';

describe('User Data Export API', () => {
  it('should require authentication', async () => {
    const request = new Request('http://localhost:3000/api/user/export', {
      method: 'POST',
      body: JSON.stringify({ format: 'json' })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should export data for authenticated user', async () => {
    const mockRequest = {
      headers: {
        get: (key: string) => key === 'authorization' ? 'Bearer valid_token' : null
      },
      json: async () => ({ format: 'json', includeEvents: true, includeCases: true })
    };

    const response = await POST(mockRequest as any);
    expect(response.status).toBe(200);
    
    const contentType = response.headers.get('Content-Type');
    expect(contentType).toBe('application/json');
  });

  it('should return CSV format when requested', async () => {
    const mockRequest = {
      headers: {
        get: (key: string) => key === 'authorization' ? 'Bearer valid_token' : null
      },
      json: async () => ({ format: 'csv' })
    };

    const response = await POST(mockRequest as any);
    expect(response.status).toBe(200);
    
    const contentType = response.headers.get('Content-Type');
    expect(contentType).toBe('text/csv');
  });
});
```

#### 6.3 Manual Verification Commands

```bash
# Test export API
curl -X POST http://localhost:3000/api/user/export \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format": "json", "includeEvents": true, "includeCases": true}' \
  --output user-export.json

# Test CSV export
curl -X POST http://localhost:3000/api/user/export \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format": "csv", "includeEvents": true, "includeCases": true}' \
  --output user-export.csv

# Verify export tracking in database
psql $DATABASE_URL -c "
  SELECT * FROM data_exports 
  WHERE user_id = 'test_user_id' 
  ORDER BY created_at DESC 
  LIMIT 1;
"
```

#### 6.4 Integration Test Script
**File:** `scripts/test-data-export.js`

```bash
#!/bin/bash
# Data Export Integration Test

echo "🧪 Testing Data Export Implementation..."

# 1. Create test user data
echo "📝 Creating test user data..."
node scripts/create-test-user-data.js

# 2. Test JSON export API
echo "📄 Testing JSON export API..."
curl -X POST http://localhost:3000/api/user/export \
  -H "Authorization: Bearer TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format": "json", "includeEvents": true, "includeCases": true, "includeActions": true}' \
  | jq . > test-export.json

# 3. Test CSV export API
echo "📊 Testing CSV export API..."
curl -X POST http://localhost:3000/api/user/export \
  -H "Authorization: Bearer TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format": "csv", "includeEvents": true, "includeCases": true, "includeActions": true}' \
  > test-export.csv

# 4. Verify export content
echo "🔍 Verifying export content..."
echo "JSON export size: $(wc -c < test-export.json) bytes"
echo "CSV export size: $(wc -c < test-export.csv) bytes"

# 5. Check audit trail
echo "📋 Checking audit trail..."
psql $DATABASE_URL -c "
  SELECT user_id, format, record_count, created_at 
  FROM data_exports 
  WHERE user_id LIKE 'test_%' 
  ORDER BY created_at DESC 
  LIMIT 5;
"

echo "✅ Data export testing completed!"
```

---

## High Severity Violation #3: Missing Consent Management

### 1. Specific Code Implementation Details

#### 1.1 Consent Management API Endpoints
**File:** `apps/web/src/app/api/user/consent/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/whop/authMiddleware';
import { apiSuccess, apiError, errors } from '@/lib/apiResponse';
import { 
  getUserConsent, 
  updateUserConsent, 
  createConsentRecord,
  ConsentType 
} from '@/lib/consent-management';
import { logger } from '@/lib/logger';
import { createRequestContext } from '@/lib/apiResponse';

interface ConsentRequest {
  consentType: ConsentType;
  granted: boolean;
  ipAddress?: string;
  userAgent?: string;
}

// GET user consent
export const GET = requireAuth(async (request: NextRequest, context) => {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    logger.info('User consent retrieval request', {
      userId,
      requestId: requestContext.requestId
    });

    const consentRecords = await getUserConsent(userId);

    return apiSuccess(consentRecords, requestContext);

  } catch (error) {
    logger.error('User consent retrieval failed', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('Consent retrieval failed', { details: error.message }) :
        errors.internalServerError('Consent retrieval failed'),
      requestContext
    );
  }
});

// POST update user consent
export const POST = requireAuth(async (request: NextRequest, context) => {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    const body: ConsentRequest = await request.json().catch(() => ({}));
    
    if (!body.consentType || typeof body.granted !== 'boolean') {
      throw errors.validationError('Invalid consent request format');
    }

    logger.info('User consent update request', {
      userId,
      consentType: body.consentType,
      granted: body.granted,
      requestId: requestContext.requestId
    });

    const consentRecord = await updateUserConsent(userId, {
      consentType: body.consentType,
      granted: body.granted,
      ipAddress: body.ipAddress || request.ip,
      userAgent: body.userAgent || request.headers.get('user-agent'),
      requestId: requestContext.requestId
    });

    return apiSuccess(consentRecord, requestContext);

  } catch (error) {
    logger.error('User consent update failed', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('Consent update failed', { details: error.message }) :
        errors.internalServerError('Consent update failed'),
      requestContext
    );
  }
});
```

#### 1.2 Consent Management Service
**File:** `apps/web/src/lib/consent-management.ts`

```typescript
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt } from '@/lib/encryption';

export enum ConsentType {
  DATA_PROCESSING = 'data_processing',
  MARKETING_COMMUNICATIONS = 'marketing_communications',
  ANALYTICS = 'analytics',
  COOKIES = 'cookies',
  THIRD_PARTY_SHARING = 'third_party_sharing',
  RECOVERY_NOTIFICATIONS = 'recovery_notifications',
  DATA_RETENTION = 'data_retention'
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  version: number;
  expiresAt?: string;
}

export interface ConsentUpdateRequest {
  consentType: ConsentType;
  granted: boolean;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export async function getUserConsent(userId: string): Promise<ConsentRecord[]> {
  try {
    const result = await sql.query(`
      SELECT 
        id,
        user_id as "userId",
        consent_type as "consentType",
        granted,
        ip_address as "ipAddress",
        user_agent as "userAgent",
        timestamp,
        version,
        expires_at as "expiresAt"
      FROM user_consent 
      WHERE user_id = $1 
      ORDER BY timestamp DESC
    `, [userId]);

    return result.rows.map(row => ({
      ...row,
      granted: Boolean(row.granted)
    }));

  } catch (error) {
    logger.error('Failed to retrieve user consent', {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function updateUserConsent(
  userId: string, 
  request: ConsentUpdateRequest
): Promise<ConsentRecord> {
  const startTime = Date.now();
  
  try {
    // Get current version for this consent type
    const versionResult = await sql.query(`
      SELECT COALESCE(MAX(version), 0) as max_version
      FROM user_consent 
      WHERE user_id = $1 AND consent_type = $2
    `, [userId, request.consentType]);

    const newVersion = (versionResult.rows[0]?.max_version || 0) + 1;

    // Insert new consent record
    const result = await sql.query(`
      INSERT INTO user_consent (
        user_id, consent_type, granted, ip_address, user_agent, 
        version, request_id, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, timestamp, version
    `, [
      userId,
      request.consentType,
      request.granted,
      request.ipAddress,
      request.userAgent,
      newVersion,
      request.requestId
    ]);

    const consentRecord: ConsentRecord = {
      id: result.rows[0].id,
      userId,
      consentType: request.consentType,
      granted: request.granted,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      timestamp: result.rows[0].timestamp,
      version: newVersion
    };

    // Log consent change for audit
    await logConsentChange(userId, request, consentRecord);

    logger.info('User consent updated successfully', {
      userId,
      consentType: request.consentType,
      granted: request.granted,
      version: newVersion,
      duration: Date.now() - startTime,
      requestId: request.requestId
    });

    return consentRecord;

  } catch (error) {
    logger.error('Failed to update user consent', {
      userId,
      consentType: request.consentType,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      requestId: request.requestId
    });
    throw error;
  }
}

export async function createConsentRecord(
  userId: string,
  consentType: ConsentType,
  granted: boolean,
  metadata?: any
): Promise<ConsentRecord> {
  try {
    const result = await sql.query(`
      INSERT INTO user_consent (
        user_id, consent_type, granted, ip_address, user_agent, 
        version, request_id, timestamp
      ) VALUES ($1, $2, $3, $4, $5, 1, $6, NOW())
      RETURNING id, timestamp, version
    `, [
      userId,
      consentType,
      granted,
      metadata?.ipAddress || 'unknown',
      metadata?.userAgent || 'unknown',
      metadata?.requestId || 'auto_generated'
    ]);

    return {
      id: result.rows[0].id,
      userId,
      consentType,
      granted,
      ipAddress: metadata?.ipAddress || 'unknown',
      userAgent: metadata?.userAgent || 'unknown',
      timestamp: result.rows[0].timestamp,
      version: 1
    };

  } catch (error) {
    logger.error('Failed to create consent record', {
      userId,
      consentType,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function hasValidConsent(
  userId: string, 
  consentType: ConsentType
): Promise<boolean> {
  try {
    const result = await sql.query(`
      SELECT granted, expires_at
      FROM user_consent 
      WHERE user_id = $1 AND consent_type = $2
      ORDER BY version DESC 
      LIMIT 1
    `, [userId, consentType]);

    if (result.rows.length === 0) {
      return false; // No consent record found
    }

    const consent = result.rows[0];
    
    // Check if consent has expired
    if (consent.expires_at && new Date(consent.expires_at) < new Date()) {
      return false;
    }

    return Boolean(consent.granted);

  } catch (error) {
    logger.error('Failed to check user consent', {
      userId,
      consentType,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function logConsentChange(
  userId: string, 
  request: ConsentUpdateRequest, 
  record: ConsentRecord
): Promise<void> {
  try {
    await sql.query(`
      INSERT INTO consent_audit_log (
        user_id, consent_type, previous_granted, new_granted, 
        ip_address, user_agent, request_id, timestamp
      ) VALUES (
        $1, $2, 
        (SELECT granted FROM user_consent WHERE user_id = $1 AND consent_type = $2 ORDER BY version DESC LIMIT 1 OFFSET 1),
        $3, $4, $5, $6, NOW()
      )
    `, [
      userId,
      request.consentType,
      request.granted,
      request.ipAddress,
      request.userAgent,
      request.requestId
    ]);
  } catch (error) {
    logger.warn('Failed to log consent change', {
      userId,
      consentType: request.consentType,
      error: error instanceof Error ? error.message : String(error),
      requestId: request.requestId
    });
  }
}

export async function getDefaultConsentSettings(): Promise<Record<ConsentType, boolean>> {
  return {
    [ConsentType.DATA_PROCESSING]: false,
    [ConsentType.MARKETING_COMMUNICATIONS]: false,
    [ConsentType.ANALYTICS]: true,
    [ConsentType.COOKIES]: true,
    [ConsentType.THIRD_PARTY_SHARING]: false,
    [ConsentType.RECOVERY_NOTIFICATIONS]: true,
    [ConsentType.DATA_RETENTION]: true
  };
}
```

### 2. Database Schema Changes

#### 2.1 User Consent Tables
**File:** `infra/migrations/017_consent_management.sql`

```sql
-- Migration: 017_consent_management.sql
-- Description: Add consent management for GDPR compliance

-- Create user consent table
CREATE TABLE IF NOT EXISTS user_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  consent_type text NOT NULL CHECK (consent_type IN (
    'data_processing',
    'marketing_communications', 
    'analytics',
    'cookies',
    'third_party_sharing',
    'recovery_notifications',
    'data_retention'
  )),
  granted boolean NOT NULL,
  ip_address text NOT NULL DEFAULT 'unknown',
  user_agent text NOT NULL DEFAULT 'unknown',
  version integer NOT NULL DEFAULT 1,
  request_id text,
  timestamp timestamptz DEFAULT now(),
  expires_at timestamptz,
  
  -- Constraints
  CONSTRAINT user_consent_user_id_check CHECK (length(user_id) > 0),
  CONSTRAINT user_consent_unique_user_type_version UNIQUE (user_id, consent_type, version)
);

-- Create consent audit log table
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  consent_type text NOT NULL,
  previous_granted boolean,
  new_granted boolean NOT NULL,
  ip_address text NOT NULL,
  user_agent text NOT NULL,
  request_id text,
  timestamp timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT consent_audit_log_user_id_check CHECK (length(user_id) > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_consent_user_id ON user_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consent_type ON user_consent(consent_type);
CREATE INDEX IF NOT EXISTS idx_user_consent_timestamp ON user_consent(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_consent_user_type_version ON user_consent(user_id, consent_type, version DESC);

CREATE INDEX IF NOT EXISTS idx_consent_audit_user_id ON consent_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_timestamp ON consent_audit_log(timestamp);

-- Row Level Security
ALTER TABLE user_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY user_consent_user_policy ON user_consent
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY user_consent_admin_policy ON user_consent
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

CREATE POLICY consent_audit_log_user_policy ON consent_audit_log
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY consent_audit_log_admin_policy ON consent_audit_log
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

-- Comments for documentation
COMMENT ON TABLE user_consent IS 'Stores user consent records for GDPR compliance';
COMMENT ON COLUMN user_consent.consent_type IS 'Type of consent: data_processing, marketing_communications, analytics, cookies, third_party_sharing, recovery_notifications, data_retention';
COMMENT ON COLUMN user_consent.version IS 'Version number for consent history tracking';
COMMENT ON TABLE consent_audit_log IS 'Audit log for consent changes';
```

#### 2.2 Rollback Migration
**File:** `infra/migrations/017_rollback.sql`

```sql
-- Migration: 017_rollback.sql
-- Description: Rollback consent management

DROP TABLE IF EXISTS consent_audit_log CASCADE;
DROP TABLE IF EXISTS user_consent CASCADE;
```

### 3. Configuration Changes Required

#### 3.1 Environment Variables
Add to `.env.development` and `.env.production`:

```bash
# Consent Management Settings
CONSENT_MANAGEMENT_ENABLED=true
CONSENT_DEFAULT_ANALYTICS=true
CONSENT_DEFAULT_COOKIES=true
CONSENT_DEFAULT_RECOVERY_NOTIFICATIONS=true
CONSENT_EXPIRY_DAYS=365
```

#### 3.2 Consent Configuration
**File:** `apps/web/src/lib/consent-config.ts`

```typescript
import { ConsentType } from './consent-management';

export const consentConfig = {
  [ConsentType.DATA_PROCESSING]: {
    required: true,
    description: 'Processing of your personal data for service delivery',
    category: 'essential'
  },
  [ConsentType.MARKETING_COMMUNICATIONS]: {
    required: false,
    description: 'Marketing communications and promotional offers',
    category: 'marketing'
  },
  [ConsentType.ANALYTICS]: {
    required: false,
    description: 'Analytics and usage tracking for service improvement',
    category: 'analytics'
  },
  [ConsentType.COOKIES]: {
    required: true,
    description: 'Essential cookies for service functionality',
    category: 'essential'
  },
  [ConsentType.THIRD_PARTY_SHARING]: {
    required: false,
    description: 'Sharing data with trusted third-party services',
    category: 'marketing'
  },
  [ConsentType.RECOVERY_NOTIFICATIONS]: {
    required: true,
    description: 'Notifications about payment recovery attempts',
    category: 'essential'
  },
  [ConsentType.DATA_RETENTION]: {
    required: true,
    description: 'Retention of data for service operation and legal compliance',
    category: 'essential'
  }
};

export type ConsentCategory = 'essential' | 'marketing' | 'analytics';
```

### 4. Dependencies That Need to Be Installed

No new dependencies required - uses existing packages:
- `pg` (already installed)
- Existing utilities and middleware

### 5. Integration Points with Existing Code

#### 5.1 Integration with Authentication Flow
**File:** `apps/web/src/lib/whop/auth.ts` (extend existing)

```typescript
import { hasValidConsent, ConsentType } from '@/lib/consent-management';

// Add consent check to authentication
async function checkRequiredConsents(userId: string): Promise<boolean> {
  const requiredConsents = [
    ConsentType.DATA_PROCESSING,
    ConsentType.RECOVERY_NOTIFICATIONS,
    ConsentType.DATA_RETENTION
  ];

  for (const consentType of requiredConsents) {
    const hasConsent = await hasValidConsent(userId, consentType);
    if (!hasConsent) {
      return false;
    }
  }

  return true;
}
```

#### 5.2 Integration with Data Processing
**File:** `apps/web/src/server/webhooks/whop.ts` (extend existing)

```typescript
import { hasValidConsent, ConsentType } from '@/lib/consent-management';

// Add consent check before processing webhooks
export async function processWebhook(event: any) {
  const userId = extractUserId(event);
  
  if (userId) {
    const hasDataProcessingConsent = await hasValidConsent(userId, ConsentType.DATA_PROCESSING);
    if (!hasDataProcessingConsent) {
      logger.warn('Webhook processing blocked - no data processing consent', {
        userId,
        eventType: event.type
      });
      return;
    }
  }

  // Continue with existing webhook processing logic
}
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Automated Tests
**File:** `apps/web/test/consent-management.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  getUserConsent, 
  updateUserConsent, 
  hasValidConsent,
  ConsentType 
} from '@/lib/consent-management';
import { sql } from '@/lib/db';

describe('Consent Management', () => {
  const testUserId = 'test_user_' + Date.now();
  
  afterEach(async () => {
    // Cleanup test data
    await sql.query('DELETE FROM user_consent WHERE user_id = $1', [testUserId]);
    await sql.query('DELETE FROM consent_audit_log WHERE user_id = $1', [testUserId]);
  });

  it('should create and retrieve user consent', async () => {
    const consentRecord = await updateUserConsent(testUserId, {
      consentType: ConsentType.DATA_PROCESSING,
      granted: true,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      requestId: 'test_req_123'
    });

    expect(consentRecord.userId).toBe(testUserId);
    expect(consentRecord.consentType).toBe(ConsentType.DATA_PROCESSING);
    expect(consentRecord.granted).toBe(true);
    expect(consentRecord.version).toBe(1);
  });

  it('should update consent with version increment', async () => {
    // Create initial consent
    await updateUserConsent(testUserId, {
      consentType: ConsentType.ANALYTICS,
      granted: false,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      requestId: 'test_req_124'
    });

    // Update consent
    const updatedConsent = await updateUserConsent(testUserId, {
      consentType: ConsentType.ANALYTICS,
      granted: true,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      requestId: 'test_req_125'
    });

    expect(updatedConsent.granted).toBe(true);
    expect(updatedConsent.version).toBe(2);
  });

  it('should correctly validate consent status', async () => {
    await updateUserConsent(testUserId, {
      consentType: ConsentType.MARKETING_COMMUNICATIONS,
      granted: true,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      requestId: 'test_req_126'
    });

    const hasConsent = await hasValidConsent(testUserId, ConsentType.MARKETING_COMMUNICATIONS);
    expect(hasConsent).toBe(true);

    // Test non-existent consent
    const noConsent = await hasValidConsent(testUserId, ConsentType.THIRD_PARTY_SHARING);
    expect(noConsent).toBe(false);
  });
});
```

#### 6.2 API Endpoint Testing
**File:** `apps/web/test/api/user-consent.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import { GET, POST } from '@/app/api/user/consent/route';

describe('User Consent API', () => {
  it('should require authentication for GET', async () => {
    const request = new Request('http://localhost:3000/api/user/consent', {
      method: 'GET'
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('should require authentication for POST', async () => {
    const request = new Request('http://localhost:3000/api/user/consent', {
      method: 'POST',
      body: JSON.stringify({
        consentType: 'data_processing',
        granted: true
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should update consent for authenticated user', async () => {
    const mockRequest = {
      headers: {
        get: (key: string) => key === 'authorization' ? 'Bearer valid_token' : null
      },
      json: async () => ({
        consentType: 'data_processing',
        granted: true
      })
    };

    const response = await POST(mockRequest as any);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.consentType).toBe('data_processing');
    expect(data.data.granted).toBe(true);
  });

  it('should validate consent request format', async () => {
    const mockRequest = {
      headers: {
        get: (key: string) => key === 'authorization' ? 'Bearer valid_token' : null
      },
      json: async () => ({
        consentType: 'invalid_type',
        granted: 'not_boolean'
      })
    };

    const response = await POST(mockRequest as any);
    expect(response.status).toBe(400);
  });
});
```

#### 6.3 Manual Verification Commands

```bash
# Test consent retrieval
curl -X GET http://localhost:3000/api/user/consent \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  | jq .

# Test consent update
curl -X POST http://localhost:3000/api/user/consent \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "consentType": "data_processing",
    "granted": true
  }' \
  | jq .

# Verify consent in database
psql $DATABASE_URL -c "
  SELECT * FROM user_consent 
  WHERE user_id = 'test_user_id' 
  ORDER BY timestamp DESC 
  LIMIT 5;
"

# Check audit log
psql $DATABASE_URL -c "
  SELECT * FROM consent_audit_log 
  WHERE user_id = 'test_user_id' 
  ORDER BY timestamp DESC 
  LIMIT 5;
"
```

#### 6.4 Integration Test Script
**File:** `scripts/test-consent-management.js`

```bash
#!/bin/bash
# Consent Management Integration Test

echo "🧪 Testing Consent Management Implementation..."

# 1. Test consent retrieval
echo "📋 Testing consent retrieval..."
curl -X GET http://localhost:3000/api/user/consent \
  -H "Authorization: Bearer TEST_TOKEN" \
  | jq .

# 2. Test consent updates
echo "✅ Testing consent updates..."
for consent_type in "data_processing" "analytics" "marketing_communications"; do
  echo "Updating $consent_type consent..."
  curl -X POST http://localhost:3000/api/user/consent \
    -H "Authorization: Bearer TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"consentType\": \"$consent_type\", \"granted\": true}" \
    | jq .data.consentedAt
done

# 3. Verify consent records
echo "🔍 Verifying consent records..."
psql $DATABASE_URL -c "
  SELECT consent_type, granted, version, timestamp 
  FROM user_consent 
  WHERE user_id LIKE 'test_%' 
  ORDER BY timestamp DESC 
  LIMIT 10;
"

# 4. Check audit trail
echo "📊 Checking audit trail..."
psql $DATABASE_URL -c "
  SELECT consent_type, previous_granted, new_granted, timestamp 
  FROM consent_audit_log 
  WHERE user_id LIKE 'test_%' 
  ORDER BY timestamp DESC 
  LIMIT 10;
"

echo "✅ Consent management testing completed!"
```

---

[Continue with remaining violations...]
---

## High Severity Violation #4: Incomplete Developer Documentation

### 1. Specific Code Implementation Details

#### 1.1 Comprehensive Developer Documentation
**File:** `developerdocs.md` (complete rewrite)

```markdown
# Churn Saver Developer Documentation

## Table of Contents
- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Database Setup](#database-setup)
- [Environment Configuration](#environment-configuration)
- [Testing](#testing)
- [Development Workflow](#development-workflow)
- [Common Issues](#common-issues)
- [Deployment](#deployment)
- [Contributing](#contributing)

## Prerequisites

### Required Software
- **Node.js**: 18.0.0 or higher
- **PostgreSQL**: 14.0 or higher (for local development)
- **Git**: 2.30.0 or higher
- **pnpm**: 8.0.0 or higher (package manager)

### Required Accounts
- **Whop Developer Account**: [Create here](https://whop.com/dashboard/developer)
- **Supabase Account** (if using Supabase): [Create here](https://supabase.com)
- **Vercel Account** (for deployment): [Create here](https://vercel.com)

### Development Tools
- **IDE**: VS Code (recommended) with extensions:
  - TypeScript and JavaScript Language Features
  - Prettier - Code formatter
  - ESLint
  - GitLens
  - Thunder Client (for API testing)

## Development Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/churn-saver.git
cd churn-saver
```

### 2. Install Dependencies
```bash
# Install root dependencies
pnpm install

# Install web app dependencies
cd apps/web
pnpm install

# Install infra dependencies
cd ../../infra
pnpm install
```

### 3. Environment Configuration
```bash
# Copy environment templates
cp apps/web/.env.development.example apps/web/.env.local
cp infra/.env.example infra/.env.local

# Edit environment files
# apps/web/.env.local - Application environment variables
# infra/.env.local - Infrastructure environment variables
```

### 4. Database Setup

#### Option A: Local PostgreSQL
```bash
# Start PostgreSQL (using Homebrew on macOS)
brew services start postgresql

# Create database
createdb churn_saver_dev

# Run migrations
cd infra
pnpm run migrate:up

# Seed test data (optional)
pnpm run seed
```

#### Option B: Docker PostgreSQL
```bash
# Start PostgreSQL container
docker run --name churn-saver-db \
  -e POSTGRES_DB=churn_saver_dev \
  -e POSTGRES_USER=dev \
  -e POSTGRES_PASSWORD=dev_password \
  -p 5432:5432 \
  -d postgres:14

# Set DATABASE_URL
export DATABASE_URL="postgresql://dev:dev_password@localhost:5432/churn_saver_dev"
```

#### Option C: Supabase
```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# This will provide a local DATABASE_URL
```

### 5. Start Development Server
```bash
cd apps/web
pnpm dev

# The app will be available at http://localhost:3000
# Whop proxy will handle tunneling for webhook testing
```

## Project Structure

```
churn-saver/
├── apps/
│   └── web/                    # Next.js web application
│       ├── src/
│       │   ├── app/            # App Router pages and API routes
│       │   ├── components/      # React components
│       │   ├── lib/           # Utility libraries
│       │   └── server/         # Server-side code
│       ├── public/              # Static assets
│       ├── test/               # Test files
│       └── docs/              # Documentation
├── infra/
│   ├── migrations/             # Database migrations
│   ├── scripts/               # Infrastructure scripts
│   └── docs/                 # Infrastructure docs
├── docs/                     # Project documentation
└── scripts/                   # Utility scripts
```

## Database Setup

### Migration System
The project uses a numbered migration system:

```bash
# List migrations
cd infra
pnpm run migrate:list

# Run pending migrations
pnpm run migrate:up

# Rollback last migration
pnpm run migrate:down

# Create new migration
pnpm run migrate:create migration_name
```

### Database Schema
Key tables:
- `events` - Webhook events for idempotency
- `recovery_cases` - Payment recovery cases
- `recovery_actions` - Recovery action logs
- `creator_settings` - Company-specific settings
- `user_consent` - GDPR consent records
- `data_exports` - Data export tracking

### Connection Management
Database connections are managed via `apps/web/src/lib/db.ts`:
- Connection pooling with max 10 connections
- Automatic SSL for Supabase connections
- Query helpers for type-safe database operations

## Environment Configuration

### Required Environment Variables

#### Application (apps/web/.env.local)
```bash
# Whop Configuration
NEXT_PUBLIC_WHOP_APP_ID=your_app_id
WHOP_API_KEY=your_api_key
WHOP_WEBHOOK_SECRET=your_webhook_secret

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/churn_saver_dev

# Security
ENCRYPTION_KEY=your_32_character_encryption_key
JWT_SECRET=your_jwt_secret

# Development
NODE_ENV=development
ALLOW_INSECURE_DEV=true  # Only for development
```

#### Infrastructure (infra/.env.local)
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/churn_saver_dev

# Supabase (if applicable)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Testing

### Test Structure
```
apps/web/test/
├── unit/                 # Unit tests
├── integration/          # Integration tests
├── e2e/                # End-to-end tests
└── fixtures/            # Test data and mocks
```

### Running Tests
```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Run e2e tests only
pnpm test:e2e

# Run tests with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### Test Database
Tests use a separate database:
```bash
# Create test database
createdb churn_saver_test

# Set test environment
export NODE_ENV=test
export DATABASE_URL="postgresql://user:password@localhost:5432/churn_saver_test"

# Run test migrations
cd infra
DATABASE_URL="postgresql://user:password@localhost:5432/churn_saver_test" pnpm run migrate:up
```

### Writing Tests
```typescript
// Example test file: apps/web/test/unit/services/cases.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createCase, getCaseById } from '@/server/services/cases';

describe('Case Service', () => {
  beforeEach(async () => {
    // Setup test data
  });

  afterEach(async () => {
    // Cleanup test data
  });

  it('should create a new recovery case', async () => {
    const caseData = {
      id: 'test_case_123',
      userId: 'user_123',
      companyId: 'company_123',
      membershipId: 'membership_123',
      firstFailureAt: new Date().toISOString()
    };

    const result = await createCase(caseData);
    
    expect(result).toBeDefined();
    expect(result.id).toBe(caseData.id);
    expect(result.status).toBe('open');
  });
});
```

## Development Workflow

### 1. Feature Development
```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
# ...development work...

# Run tests
pnpm test

# Format code
pnpm format

# Lint code
pnpm lint

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push branch
git push origin feature/new-feature
```

### 2. Code Quality
```bash
# Format all files
pnpm format

# Check linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type checking
pnpm type-check
```

### 3. Database Changes
```bash
# Create migration
cd infra
pnpm run migrate:create add_new_column

# Edit migration file
# ...SQL changes...

# Test migration
pnpm run migrate:up

# Verify changes
psql $DATABASE_URL -c "\d table_name"
```

## Common Issues

### Database Connection Issues
**Problem**: `ECONNREFUSED` database connection error
**Solution**:
```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Start PostgreSQL if needed
brew services start postgresql

# Verify connection string
echo $DATABASE_URL
```

### Whop Webhook Issues
**Problem**: Webhook validation fails
**Solution**:
```bash
# Check webhook secret configuration
echo $WHOP_WEBHOOK_SECRET

# Test with ngrok for local development
ngrok http 3000

# Update webhook URL in Whop dashboard to ngrok URL
```

### Environment Variable Issues
**Problem**: Missing or incorrect environment variables
**Solution**:
```bash
# Check required variables
cd apps/web
pnpm run env:check

# Compare with template
diff .env.local .env.development.example
```

### Build Issues
**Problem**: TypeScript compilation errors
**Solution**:
```bash
# Check TypeScript version
pnpm list typescript

# Clear build cache
rm -rf .next

# Rebuild
pnpm build
```

## Deployment

### Local Deployment
```bash
# Build for production
cd apps/web
pnpm build

# Start production server
pnpm start
```

### Vercel Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Database Migration Deployment
```bash
# Deploy migrations to production
cd infra
DATABASE_URL=$PROD_DATABASE_URL pnpm run migrate:up

# Verify migration
DATABASE_URL=$PROD_DATABASE_URL pnpm run migrate:status
```

## Contributing

### Code Style
- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public functions
- Write tests for new functionality
- Keep functions small and focused

### Pull Request Process
1. Create feature branch from `main`
2. Implement changes with tests
3. Ensure all tests pass
4. Update documentation
5. Submit pull request with:
   - Clear description
   - Testing instructions
   - Screenshots if applicable

### Code Review Checklist
- [ ] Code follows project style
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Environment variables are documented
- [ ] Database migrations are tested
- [ ] Security considerations are addressed

## Architecture Overview

### Core Components
- **Authentication**: Whop JWT token validation
- **Webhook Processing**: Event-driven architecture
- **Case Management**: Recovery case lifecycle
- **Notification System**: Multi-channel notifications
- **Analytics**: KPI tracking and reporting

### Key Libraries
- **Next.js 15**: React framework with App Router
- **PostgreSQL**: Primary database
- **Supabase**: Database hosting and real-time features
- **Whop SDK**: Integration with Whop platform
- **Tailwind CSS**: Styling framework

### Security Features
- JWT token validation
- Webhook signature verification
- Data encryption at rest
- Row Level Security (RLS)
- PII redaction in logs
- Rate limiting

## Monitoring and Debugging

### Logging
```typescript
import { logger } from '@/lib/logger';

// Info logging
logger.info('User action completed', { userId, action });

// Error logging
logger.error('Processing failed', { error, context });

// Security logging
logger.security('Suspicious activity detected', { userId, ip });
```

### Debug Mode
```bash
# Enable debug logging
export DEBUG=churn-saver:*

# Run with debug output
DEBUG=churn-saver:* pnpm dev
```

### Performance Monitoring
```typescript
import { metrics } from '@/lib/metrics';

// Track custom metrics
metrics.increment('api.requests', { endpoint: '/api/cases' });
metrics.timer('database.query', { table: 'recovery_cases' });
```

## API Documentation

### Authentication
All API endpoints require authentication via Whop JWT token:
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://your-app.com/api/endpoint
```

### Rate Limiting
API endpoints are rate-limited:
- General endpoints: 100 requests/minute
- Webhook endpoints: 1000 requests/minute
- Export endpoints: 5 requests/hour

### Error Handling
Standard error response format:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "category": "validation",
    "severity": "medium"
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T18:00:00.000Z"
  }
}
```

## Troubleshooting

### Common Debugging Scenarios

#### 1. Webhook Not Received
**Symptoms**: No webhook events in database
**Debugging Steps**:
```bash
# Check webhook URL is accessible
curl -X POST https://your-app.com/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check webhook logs
tail -f logs/webhook.log

# Verify webhook secret in Whop dashboard
echo $WHOP_WEBHOOK_SECRET
```

#### 2. Database Performance Issues
**Symptoms**: Slow API responses
**Debugging Steps**:
```sql
-- Check slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check missing indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats 
WHERE schemaname = 'public';
```

#### 3. Memory Leaks
**Symptoms**: Increasing memory usage over time
**Debugging Steps**:
```bash
# Monitor memory usage
node --inspect apps/web/.next/server.js

# Check for memory leaks in tests
pnpm test:memory

# Profile memory usage
pnpm build
node --prof apps/web/.next/server.js
```

## Getting Help

### Resources
- **Project Wiki**: [Link to wiki]
- **API Documentation**: [Link to API docs]
- **Architecture Docs**: [Link to architecture docs]
- **Slack Channel**: #churn-saver-dev
- **Email**: dev-team@company.com

### Reporting Issues
1. Check existing issues in GitHub
2. Create new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details
   - Logs/screenshots

### Emergency Contacts
- **On-call Engineer**: +1-555-XXX-XXXX
- **Engineering Manager**: +1-555-XXX-XXXX
- **DevOps**: devops@company.com
```

#### 1.2 API Documentation Enhancement
**File:** `apps/web/docs/api-documentation.md`

```markdown
# Churn Saver API Documentation

## Overview
The Churn Saver API provides RESTful endpoints for managing payment recovery cases, user data, and system administration.

## Base URL
- **Development**: `http://localhost:3000/api`
- **Production**: `https://your-app.com/api`

## Authentication
All API endpoints require authentication using Whop JWT tokens:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://your-app.com/api/endpoint
```

## Rate Limiting
- **Standard endpoints**: 100 requests/minute
- **Webhook endpoints**: 1000 requests/minute  
- **Data export endpoints**: 5 requests/hour
- **User deletion endpoints**: 1 request/day

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T18:00:00.000Z",
    "version": "1.0.0"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "category": "validation",
    "severity": "medium",
    "statusCode": 400
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T18:00:00.000Z",
    "version": "1.0.0"
  }
}
```

## Endpoints

### Cases Management

#### Get Cases
```http
GET /api/dashboard/cases
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `status` (optional): Filter by status (`open`, `recovered`, `closed_no_recovery`)
- `companyId` (optional): Filter by company ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "case_123",
      "companyId": "company_456",
      "membershipId": "membership_789",
      "userId": "user_abc",
      "status": "open",
      "firstFailureAt": "2025-10-20T10:00:00.000Z",
      "attempts": 2,
      "incentiveDays": 3
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3
    }
  }
}
```

#### Create Case
```http
POST /api/cases
```

**Request Body:**
```json
{
  "membershipId": "membership_789",
  "failureReason": "payment_failed",
  "amount": 4999
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "case_123",
    "status": "open",
    "createdAt": "2025-10-25T18:00:00.000Z"
  }
}
```

#### Update Case
```http
PUT /api/cases/{caseId}
```

**Request Body:**
```json
{
  "status": "recovered",
  "recoveredAmount": 4999,
  "notes": "Customer contacted and payment recovered"
}
```

#### Delete Case
```http
DELETE /api/cases/{caseId}
```

### Case Actions

#### Send Nudge
```http
POST /api/cases/{caseId}/nudge
```

**Request Body:**
```json
{
  "channel": "push",
  "message": "Your payment method needs updating"
}
```

#### Cancel Membership
```http
POST /api/cases/{caseId}/cancel-membership
```

#### Terminate Case
```http
POST /api/cases/{caseId}/terminate
```

### User Data Management

#### Get User Data Export
```http
POST /api/user/export
```

**Request Body:**
```json
{
  "format": "json",
  "includeEvents": true,
  "includeCases": true,
  "includeActions": true,
  "dateRange": {
    "from": "2025-09-25T00:00:00.000Z",
    "to": "2025-10-25T23:59:59.999Z"
  }
}
```

**Response:** Download file with user data

#### Delete User Data
```http
DELETE /api/user/delete
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "User data deletion completed",
    "deletedAt": "2025-10-25T18:00:00.000Z"
  }
}
```

#### Get User Consent
```http
GET /api/user/consent
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "consentType": "data_processing",
      "granted": true,
      "timestamp": "2025-10-25T18:00:00.000Z",
      "version": 1
    }
  ]
}
```

#### Update User Consent
```http
POST /api/user/consent
```

**Request Body:**
```json
{
  "consentType": "marketing_communications",
  "granted": false
}
```

### Webhooks

#### Whop Webhook
```http
POST /api/webhooks/whop
```

**Headers:**
- `x-whop-signature`: Webhook signature
- `x-whop-timestamp`: Request timestamp

**Request Body:** Whop event payload

**Response:** `200 OK` for successful processing

### Health Checks

#### Database Health
```http
GET /api/health/db
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "connection": {
      "status": "connected",
      "latency_ms": 15
    },
    "performance": {
      "avg_query_time_ms": 25
    }
  }
}
```

#### Application Health
```http
GET /api/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 86400
  }
}
```

## Error Codes

### Authentication Errors
- `UNAUTHORIZED` (401): Invalid or missing authentication
- `INVALID_TOKEN` (401): JWT token is invalid
- `TOKEN_EXPIRED` (401): JWT token has expired
- `INSUFFICIENT_PERMISSIONS` (403): User lacks required permissions

### Validation Errors
- `VALIDATION_ERROR` (400): General validation failure
- `MISSING_REQUIRED_FIELD` (400): Required field is missing
- `INVALID_FORMAT` (400): Field format is invalid

### Business Logic Errors
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource conflict
- `UNPROCESSABLE_ENTITY` (422): Cannot process request

### System Errors
- `INTERNAL_SERVER_ERROR` (500): Unexpected server error
- `SERVICE_UNAVAILABLE` (503): Service temporarily unavailable
- `GATEWAY_TIMEOUT` (504): External service timeout

## SDK Integration

### JavaScript/TypeScript
```typescript
import { WhopClient } from '@whop/sdk';

const client = new WhopClient({
  appId: 'your_app_id',
  apiKey: 'your_api_key'
});

// Get user information
const user = await client.getUser(userId);

// Send notification
await client.sendNotification(userId, {
  type: 'push',
  message: 'Payment recovery needed'
});
```

### Webhook Validation
```typescript
import { webhookValidator } from '@/lib/whop/webhookValidator';

const isValid = await webhookValidator.validateWebhook(
  rawBody,
  signature,
  timestamp,
  payload
);
```

## Testing

### Local Testing
```bash
# Start development server
pnpm dev

# Test endpoints
curl -X GET http://localhost:3000/api/health

# Test with authentication
curl -X GET http://localhost:3000/api/dashboard/cases \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Integration Testing
```bash
# Run integration tests
pnpm test:integration

# Test webhook processing
node scripts/test-webhook.js
```

## Monitoring

### Metrics Endpoints
- KPI data: `/api/dashboard/kpis`
- System metrics: `/api/monitoring/dashboard`
- Error metrics: `/api/security/metrics`

### Logging
All API requests are logged with:
- Request ID for tracing
- User context (when authenticated)
- Performance metrics
- Error details

## Rate Limiting Details

### Headers
Rate limit information is included in response headers:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time (Unix timestamp)

### Retry Logic
When rate limited:
```javascript
const retryAfter = parseInt(response.headers.get('X-RateLimit-Reset'));
setTimeout(() => {
  // Retry request
}, retryAfter * 1000);
```
```

### 3. Component Documentation Standards
**File:** `apps/web/src/components/dashboard/CasesTable.tsx` (enhance existing)

```typescript
import React, { useState, useMemo } from 'react';
import { RecoveryCase } from '@/types/cases';

/**
 * CasesTable Component
 * 
 * Displays recovery cases in a tabular format with filtering, sorting, and pagination.
 * Supports bulk operations and real-time updates.
 * 
 * @component
 * @example
 * ```tsx
 * <CasesTable 
 *   cases={recoveryCases}
 *   onCaseAction={handleCaseAction}
 *   loading={isLoading}
 *   pagination={{ page: 1, limit: 10, total: 100 }}
 * />
 * ```
 */
interface CasesTableProps {
  /** Array of recovery cases to display */
  cases: RecoveryCase[];
  
  /** Callback function for case actions (cancel, terminate, nudge) */
  onCaseAction: (caseId: string, action: string, metadata?: any) => void;
  
  /** Loading state indicator */
  loading?: boolean;
  
  /** Pagination configuration */
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
  
  /** Available filters */
  filters?: {
    status?: string[];
    dateRange?: {
      from: string;
      to: string;
    };
  };
  
  /** Enable bulk operations */
  allowBulkActions?: boolean;
  
  /** Custom CSS classes */
  className?: string;
}

/**
 * Recovery case interface for type safety
 * @typedef {Object} RecoveryCase
 * @property {string} id - Unique case identifier
 * @property {string} companyId - Associated company ID
 * @property {string} membershipId - Associated membership ID
 * @property {string} userId - User who owns the case
 * @property {string} status - Current case status
 * @property {string} firstFailureAt - Timestamp of first payment failure
 * @property {number} attempts - Number of recovery attempts made
 * @property {number} incentiveDays - Number of incentive days offered
 * @property {string|null} failureReason - Reason for payment failure
 * @property {number} recoveredAmountCents - Amount recovered in cents
 * @property {string} createdAt - Case creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */

export const CasesTable: React.FC<CasesTableProps> = ({
  cases,
  onCaseAction,
  loading = false,
  pagination,
  filters,
  allowBulkActions = false,
  className = ''
}) => {
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState({
    key: 'createdAt',
    direction: 'desc' as 'asc' | 'desc'
  });

  /**
   * Filters and sorts cases based on current configuration
   * @returns {RecoveryCase[]} Filtered and sorted cases
   */
  const filteredAndSortedCases = useMemo(() => {
    let filtered = [...cases];

    // Apply status filter
    if (filters?.status?.length) {
      filtered = filtered.filter(case_ => 
        filters.status!.includes(case_.status)
      );
    }

    // Apply date range filter
    if (filters?.dateRange) {
      const { from, to } = filters.dateRange;
      filtered = filtered.filter(case_ => {
        const caseDate = new Date(case_.firstFailureAt);
        return caseDate >= new Date(from) && caseDate <= new Date(to);
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[sortConfig.key as keyof RecoveryCase];
      const bValue = b[sortConfig.key as keyof RecoveryCase];
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [cases, filters, sortConfig]);

  /**
   * Handles case action button clicks
   * @param {string} caseId - The case ID
   * @param {string} action - The action to perform
   * @param {any} metadata - Additional action metadata
   */
  const handleCaseAction = (
    caseId: string, 
    action: string, 
    metadata?: any
  ): void => {
    onCaseAction(caseId, action, metadata);
  };

  /**
   * Handles sorting configuration changes
   * @param {string} key - The field to sort by
   */
  const handleSort = (key: string): void => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  /**
   * Handles bulk case selection
   * @param {string} caseId - The case ID to toggle selection
   */
  const handleCaseSelection = (caseId: string): void => {
    setSelectedCases(prev => 
      prev.includes(caseId) 
        ? prev.filter(id => id !== caseId)
        : [...prev, caseId]
    );
  };

  /**
   * Renders case status badge with appropriate styling
   * @param {string} status - The case status
   * @returns {JSX.Element} Status badge component
   */
  const renderStatusBadge = (status: string): JSX.Element => {
    const statusConfig = {
      open: { color: 'bg-yellow-100 text-yellow-800', label: 'Open' },
      recovered: { color: 'bg-green-100 text-green-800', label: 'Recovered' },
      closed_no_recovery: { color: 'bg-red-100 text-red-800', label: 'Closed' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || 
      { color: 'bg-gray-100 text-gray-800', label: status };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading cases...</span>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {allowBulkActions && (
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCases(filteredAndSortedCases.map(c => c.id));
                    } else {
                      setSelectedCases([]);
                    }
                  }}
                />
              </th>
            )}
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('id')}
            >
              Case ID
              {sortConfig.key === 'id' && (
                <span className="ml-1">
                  {sortConfig.direction === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('status')}
            >
              Status
              {sortConfig.key === 'status' && (
                <span className="ml-1">
                  {sortConfig.direction === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User ID
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('firstFailureAt')}
            >
              First Failure
              {sortConfig.key === 'firstFailureAt' && (
                <span className="ml-1">
                  {sortConfig.direction === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredAndSortedCases.map((case_) => (
            <tr key={case_.id} className="hover:bg-gray-50">
              {allowBulkActions && (
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={selectedCases.includes(case_.id)}
                    onChange={() => handleCaseSelection(case_.id)}
                  />
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {case_.id}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {renderStatusBadge(case_.status)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {case_.userId}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(case_.firstFailureAt).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2">
                  {case_.status === 'open' && (
                    <>
                      <button
                        className="text-blue-600 hover:text-blue-900 text-xs font-medium"
                        onClick={() => handleCaseAction(case_.id, 'nudge')}
                      >
                        Nudge
                      </button>
                      <button
                        className="text-green-600 hover:text-green-900 text-xs font-medium"
                        onClick={() => handleCaseAction(case_.id, 'recover')}
                      >
                        Recover
                      </button>
                    </>
                  )}
                  <button
                    className="text-red-600 hover:text-red-900 text-xs font-medium"
                    onClick={() => handleCaseAction(case_.id, 'terminate')}
                  >
                    Terminate
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {pagination && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </div>
          <div className="flex space-x-2">
            <button
              className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              onClick={() => handleCaseAction('prev', 'paginate')}
              disabled={pagination.page === 1}
            >
              Previous
            </button>
            <button
              className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              onClick={() => handleCaseAction('next', 'paginate')}
              disabled={pagination.page * pagination.limit >= pagination.total}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CasesTable;
```

### 2. Database Schema Changes

No database changes required for documentation improvements.

### 3. Configuration Changes Required

#### 3.1 Documentation Build Configuration
**File:** `apps/web/package.json` (add scripts)

```json
{
  "scripts": {
    "docs:build": "typedoc --out docs/api --entryPointStrategy packages src",
    "docs:serve": "http-server docs -p 8080",
    "docs:deploy": "aws s3 sync docs/ s3://your-docs-bucket --delete",
    "dev": "whop-proxy --command 'next dev --turbopack'",
    "build": "next build",
    "start": "next start",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "test": "node test/auth.test.js && node test/webhooks.test.js && node test/protected-api.test.js && node test/dashboard.test.js",
    "data-privacy-maintenance": "npx tsx scripts/data-privacy-maintenance.ts"
  }
}
```

#### 3.2 TypeDoc Configuration
**File:** `apps/web/typedoc.json`

```json
{
  "entryPoints": [
    "src/**/*.ts",
    "src/**/*.tsx"
  ],
  "out": "docs/api",
  "theme": "default",
  "includeVersion": true,
  "excludeExternals": true,
  "excludePrivate": true,
  "disableSources": false,
  "sourceLinkTemplate": "https://github.com/your-org/churn-saver/blob/{gitRevision}/{path}#L{line}",
  "gitRevision": "main"
}
```

### 4. Dependencies That Need to Be Installed

```bash
# Documentation dependencies
cd apps/web
pnpm add -D typedoc @types/node http-server

# Global tools
npm install -g typedoc
```

### 5. Integration Points with Existing Code

#### 5.1 Integration with Existing Components
Enhance existing components with comprehensive JSDoc comments following the pattern shown in the CasesTable example.

#### 5.2 Integration with Build Process
**File:** `apps/web/next.config.ts` (extend existing)

```typescript
import { withWhopAppConfig } from "@whop/react/next.config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ hostname: "**" }],
  },
  // Add documentation generation
  experimental: {
    outputFileTracingIncludes: {
      '*': ['docs/**/*'],
    },
  },
};

export default withWhopAppConfig(nextConfig);
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Documentation Tests
**File:** `apps/web/test/documentation.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Documentation Quality', () => {
  it('should have JSDoc comments for all exported functions', async () => {
    const fs = require('fs');
    const path = require('path');
    
    // Get all TypeScript files
    const srcFiles = getAllFiles('src', ['.ts', '.tsx']);
    
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const exportedFunctions = extractExportedFunctions(content);
      
      for (const func of exportedFunctions) {
        expect(content).toContain(`/**`);
        expect(content).toContain(`@function`);
        expect(content).toContain(`@param`);
      }
    }
  });

  it('should have comprehensive README files', () => {
    const requiredDocs = [
      'developerdocs.md',
      'docs/api-documentation.md',
      'docs/troubleshooting-guide.md',
      'docs/security-guide.md'
    ];
    
    for (const doc of requiredDocs) {
      expect(fs.existsSync(doc)).toBe(true);
    }
  });
});

function getAllFiles(dir: string, extensions: string[]): string[] {
  // Implementation to recursively get all files with specified extensions
}

function extractExportedFunctions(content: string): string[] {
  // Implementation to extract exported function names
}
```

#### 6.2 Documentation Build Verification
**File:** `scripts/test-documentation.js`

```bash
#!/bin/bash
# Documentation Quality Test

echo "📚 Testing Documentation Quality..."

# 1. Check developer documentation exists
if [ ! -f "developerdocs.md" ]; then
  echo "❌ developerdocs.md is missing"
  exit 1
fi

echo "✅ developerdocs.md exists"

# 2. Check API documentation exists
if [ ! -f "docs/api-documentation.md" ]; then
  echo "❌ API documentation is missing"
  exit 1
fi

echo "✅ API documentation exists"

# 3. Build TypeDoc documentation
cd apps/web
pnpm run docs:build

if [ ! -d "docs/api" ]; then
  echo "❌ TypeDoc documentation build failed"
  exit 1
fi

echo "✅ TypeDoc documentation built successfully"

# 4. Check for JSDoc comments
echo "🔍 Checking JSDoc comment coverage..."
node scripts/check-jsdoc-coverage.js

# 5. Validate documentation links
echo "🔗 Validating documentation links..."
node scripts/validate-doc-links.js

echo "✅ Documentation quality tests passed!"
```

#### 6.3 Manual Verification
```bash
# Generate documentation
cd apps/web
pnpm run docs:build

# Serve documentation locally
pnpm run docs:serve

# Check documentation at http://localhost:8080

# Validate JSDoc coverage
node scripts/validate-jsdoc.js
```

---

[Continue with remaining violations...]
---

## High Severity Violation #7: Missing Local Development Setup Guide

### 1. Specific Code Implementation Details

#### 1.1 Enhanced Local Development Setup
**File:** `apps/web/DEVELOPMENT.md` (new file)

```markdown
# Local Development Setup Guide

## Prerequisites

### System Requirements
- **Operating System**: macOS 10.15+, Ubuntu 18.04+, or Windows 10+
- **Node.js**: 18.0.0 or higher
- **pnpm**: 8.0.0 or higher
- **PostgreSQL**: 14.0 or higher (for local database)
- **Git**: 2.30.0 or higher

### Required Accounts
- **Whop Developer Account**: [Create here](https://whop.com/dashboard/developer)
- **GitHub Account**: For code management and CI/CD
- **Vercel Account** (optional): For deployment

### Development Tools
- **IDE**: VS Code (recommended)
- **Browser**: Chrome/Edge with DevTools
- **API Client**: Postman, Insomnia, or curl
- **Database Client**: pgAdmin, DBeaver, or psql

## Quick Start

### 1. Repository Setup
```bash
# Clone the repository
git clone https://github.com/your-org/churn-saver.git
cd churn-saver

# Install dependencies
pnpm install

# Set up development environment
pnpm run dev:setup
```

### 2. Environment Configuration
```bash
# Copy environment templates
cp apps/web/.env.development.example apps/web/.env.local
cp infra/.env.example infra/.env.local

# Edit environment files
# See Environment Configuration section below
```

### 3. Database Setup
Choose one of the following options:

#### Option A: Local PostgreSQL (Recommended for Development)
```bash
# Install PostgreSQL (macOS with Homebrew)
brew install postgresql@14
brew services start postgresql@14

# Create development database
createdb churn_saver_dev

# Create test database
createdb churn_saver_test

# Set database URLs
echo 'DATABASE_URL="postgresql://localhost:5432/churn_saver_dev"' >> apps/web/.env.local
echo 'TEST_DATABASE_URL="postgresql://localhost:5432/churn_saver_test"' >> apps/web/.env.local
```

#### Option B: Docker PostgreSQL
```bash
# Start PostgreSQL container
docker run --name churn-saver-db \
  -e POSTGRES_DB=churn_saver_dev \
  -e POSTGRES_USER=dev \
  -e POSTGRES_PASSWORD=dev_password \
  -e POSTGRES_TEST_DB=churn_saver_test \
  -p 5432:5432 \
  -v $(pwd)/infra/docker/init.sql:/docker-entrypoint-initdb.d/init.sql \
  -d postgres:14

# Set database URLs
echo 'DATABASE_URL="postgresql://dev:dev_password@localhost:5432/churn_saver_dev"' >> apps/web/.env.local
echo 'TEST_DATABASE_URL="postgresql://dev:dev_password@localhost:5432/churn_saver_test"' >> apps/web/.env.local
```

#### Option C: Supabase Local
```bash
# Install Supabase CLI
npm install -g supabase

# Initialize Supabase project
supabase init

# Start local services
supabase start

# This will provide local DATABASE_URL and anon keys
supabase status
```

### 4. Run Database Migrations
```bash
# Run development migrations
cd infra
DATABASE_URL="postgresql://localhost:5432/churn_saver_dev" pnpm run migrate:up

# Verify migrations
psql $DATABASE_URL -c "\dt"
```

### 5. Start Development Server
```bash
cd apps/web
pnpm dev

# The application will be available at:
# - Main app: http://localhost:3000
# - API endpoints: http://localhost:3000/api
# - Health check: http://localhost:3000/api/health
```

## Environment Configuration

### Development Environment Variables
**File:** `apps/web/.env.local`

```bash
# Whop Configuration (Required)
NEXT_PUBLIC_WHOP_APP_ID=your_development_app_id
WHOP_API_KEY=your_development_api_key
WHOP_WEBHOOK_SECRET=your_development_webhook_secret

# Database Configuration (Required)
DATABASE_URL=postgresql://localhost:5432/churn_saver_dev
TEST_DATABASE_URL=postgresql://localhost:5432/churn_saver_test

# Security Configuration (Required)
ENCRYPTION_KEY=your_32_character_development_key
JWT_SECRET=your_development_jwt_secret

# Development Settings (Optional)
ALLOW_INSECURE_DEV=true
DEBUG=churn-saver:*
LOG_LEVEL=debug

# External Services (Optional)
REDIS_URL=redis://localhost:6379
WEBHOOK_TEST_URL=https://your-ngrok-url.ngrok.io/api/webhooks/whop
```

### Infrastructure Environment Variables
**File:** `infra/.env.local`

```bash
# Database Configuration
DATABASE_URL=postgresql://localhost:5432/churn_saver_dev
TEST_DATABASE_URL=postgresql://localhost:5432/churn_saver_test

# Supabase Configuration (if using Supabase)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your_local_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key

# Development Settings
NODE_ENV=development
LOG_LEVEL=debug
```

## Development Workflow

### 1. Daily Development Routine
```bash
# 1. Pull latest changes
git pull origin main

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Install any new dependencies
pnpm install

# 4. Start development server
pnpm dev

# 5. Make changes and test
# ...development work...

# 6. Run tests
pnpm test

# 7. Format and lint code
pnpm format
pnpm lint

# 8. Commit changes
git add .
git commit -m "feat: implement your feature"

# 9. Push branch
git push origin feature/your-feature-name
```

### 2. Database Development Workflow
```bash
# Create new migration
cd infra
pnpm run migrate:create add_new_feature_table

# Edit migration file
# ...SQL changes...

# Test migration on development database
DATABASE_URL="postgresql://localhost:5432/churn_saver_dev" pnpm run migrate:up

# Test rollback if needed
DATABASE_URL="postgresql://localhost:5432/churn_saver_dev" pnpm run migrate:down

# Verify changes
psql $DATABASE_URL -c "\d new_feature_table"
```

### 3. Testing Workflow
```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:unit          # Unit tests only
pnpm test:integration   # Integration tests only
pnpm test:e2e          # End-to-end tests only

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test -- test/cases.test.ts
```

## Common Development Tasks

### 1. Adding New API Endpoints
```bash
# 1. Create API route file
touch apps/web/src/app/api/new-endpoint/route.ts

# 2. Implement endpoint with proper error handling
# See existing routes for patterns

# 3. Add tests
touch apps/web/test/api/new-endpoint.test.ts

# 4. Update API documentation
# Edit docs/api-documentation.md

# 5. Test endpoint
curl -X GET http://localhost:3000/api/new-endpoint \
  -H "Authorization: Bearer YOUR_DEV_TOKEN"
```

### 2. Database Schema Changes
```bash
# 1. Create migration
cd infra
pnpm run migrate:create add_new_column

# 2. Write SQL migration
# Follow existing migration patterns

# 3. Test migration
DATABASE_URL="postgresql://localhost:5432/churn_saver_dev" pnpm run migrate:up

# 4. Update TypeScript types
# Edit apps/web/src/types/database.ts

# 5. Test with sample data
# Use scripts/create-test-data.js if needed
```

### 3. Adding New Components
```bash
# 1. Create component file
touch apps/web/src/components/NewComponent.tsx

# 2. Follow component documentation patterns
# See CasesTable.tsx for example

# 3. Add component tests
touch apps/web/test/components/NewComponent.test.tsx

# 4. Import and use in pages
# Add to appropriate page component
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Database Connection Issues
**Problem**: `ECONNREFUSED` when starting the app
**Solutions**:
```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Start PostgreSQL if needed
brew services start postgresql@14

# Verify database exists
psql -h localhost -U postgres -l

# Check DATABASE_URL format
echo $DATABASE_URL

# Test connection directly
psql $DATABASE_URL -c "SELECT 1;"
```

#### 2. Port Conflicts
**Problem**: Port 3000 already in use
**Solutions**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 pnpm dev
```

#### 3. Dependency Installation Issues
**Problem**: `npm ERR!` during pnpm install
**Solutions**:
```bash
# Clear pnpm cache
pnpm store prune

# Clear node_modules
rm -rf node_modules
rm -rf apps/web/node_modules

# Reinstall dependencies
pnpm install

# Check Node.js version
node --version  # Should be 18+

# Check pnpm version
pnpm --version  # Should be 8+
```

#### 4. Whop Integration Issues
**Problem**: Webhook validation fails
**Solutions**:
```bash
# Check webhook configuration
echo $WHOP_WEBHOOK_SECRET

# Test webhook with ngrok
ngrok http 3000

# Update webhook URL in Whop dashboard
# Use ngrok URL for local testing

# Test webhook manually
curl -X POST http://localhost:3000/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -H "x-whop-signature: test_signature" \
  -d '{"test": true}'
```

#### 5. Build Issues
**Problem**: TypeScript compilation errors
**Solutions**:
```bash
# Check TypeScript version
pnpm list typescript

# Clear build cache
rm -rf .next

# Check for type errors
pnpm type-check

# Update TypeScript types
pnpm add -D @types/node@latest

# Check tsconfig.json configuration
cat apps/web/tsconfig.json
```

## Development Tools

### 1. VS Code Extensions
```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense",
    "ms-vscode.test-adapter-converter"
  ]
}
```

### 2. Useful Scripts
**File:** `apps/web/package.json` (add scripts)

```json
{
  "scripts": {
    "dev": "whop-proxy --command 'next dev --turbopack'",
    "dev:setup": "pnpm run db:setup && pnpm run db:migrate",
    "db:setup": "createdb churn_saver_dev || true && createdb churn_saver_test || true",
    "db:migrate": "cd infra && DATABASE_URL=$DATABASE_URL pnpm run migrate:up",
    "db:reset": "cd infra && DATABASE_URL=$DATABASE_URL pnpm run migrate:down && pnpm run migrate:up",
    "db:seed": "node scripts/seed-dev-data.js",
    "test:watch": "jest --watch",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand",
    "type-check": "tsc --noEmit",
    "lint:fix": "biome lint --write .",
    "clean": "rm -rf .next && rm -rf node_modules/.cache"
  }
}
```

### 3. Debug Configuration
**File:** `apps/web/.vscode/launch.json`

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Next.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/apps/web/node_modules/.bin/next",
      "args": ["--inspect"],
      "cwd": "${workspaceFolder}/apps/web",
      "env": {
        "NODE_OPTIONS": "--inspect"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeExecutable": "pnpm"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/apps/web/node_modules/.bin/jest",
      "args": ["--runInBand", "--no-cache"],
      "cwd": "${workspaceFolder}/apps/web",
      "console": "integratedTerminal",
      "internalConsoleOptions": "openOnSessionStart"
    }
  ]
}
```

## Performance Optimization

### 1. Development Performance
```bash
# Enable Next.js turbopack (already enabled)
pnpm dev

# Monitor memory usage
node --inspect apps/web/.next/server.js

# Profile bundle size
pnpm build
npx @next/bundle-analyzer .next
```

### 2. Database Performance
```sql
-- Check slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 10;

-- Check missing indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND correlation > 0.8
ORDER BY correlation DESC;
```

## Testing Strategies

### 1. Unit Testing
```typescript
// Example: apps/web/test/unit/services/cases.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createCase, getCaseById } from '@/server/services/cases';

describe('Case Service Unit Tests', () => {
  beforeEach(async () => {
    // Setup test data
    await setupTestData();
  });

  afterEach(async () => {
    // Cleanup test data
    await cleanupTestData();
  });

  it('should create a new case with valid data', async () => {
    const caseData = {
      id: 'test_case_123',
      userId: 'user_123',
      companyId: 'company_123',
      membershipId: 'membership_123',
      firstFailureAt: new Date().toISOString()
    };

    const result = await createCase(caseData);
    
    expect(result).toBeDefined();
    expect(result.id).toBe(caseData.id);
    expect(result.status).toBe('open');
  });

  it('should throw error for invalid case data', async () => {
    const invalidCaseData = {
      // Missing required fields
      userId: 'user_123'
    };

    await expect(createCase(invalidCaseData)).rejects.toThrow();
  });
});
```

### 2. Integration Testing
```typescript
// Example: apps/web/test/integration/api/cases.test.ts
import { describe, it, expect } from '@jest/globals';
import { createApp } from '@/test/utils/app';

describe('Cases API Integration Tests', () => {
  let app: any;

  beforeAll(async () => {
    app = await createApp();
  });

  it('should create case via API', async () => {
    const response = await app.request('/api/cases', {
      method: 'POST',
      body: {
        membershipId: 'test_membership',
        failureReason: 'payment_failed'
      },
      headers: {
        'Authorization': 'Bearer test_token'
      }
    });

    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBeDefined();
  });
});
```

### 3. End-to-End Testing
```typescript
// Example: apps/web/test/e2e/case-management.test.ts
import { test, expect } from '@playwright/test';

test('should manage recovery cases end-to-end', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[data-testid=username]', 'test_user');
  await page.fill('[data-testid=password]', 'test_password');
  await page.click('[data-testid=login-button]');

  // Navigate to cases
  await page.goto('/dashboard');
  await expect(page.locator('[data-testid=cases-table]')).toBeVisible();

  // Create new case
  await page.click('[data-testid=add-case-button]');
  await page.fill('[data-testid=membership-id]', 'test_membership');
  await page.click('[data-testid=create-case-button]');

  // Verify case appears in table
  await expect(page.locator('text=test_membership')).toBeVisible();
});
```

## Deployment Preparation

### 1. Pre-deployment Checklist
```bash
# 1. Run full test suite
pnpm test

# 2. Check code quality
pnpm lint
pnpm type-check

# 3. Build application
pnpm build

# 4. Test build locally
pnpm start

# 5. Check environment variables
pnpm run env:check

# 6. Update documentation
# Ensure API docs are current
```

### 2. Local Production Testing
```bash
# Build for production
pnpm build

# Start production server locally
pnpm start

# Test with production configuration
NODE_ENV=production pnpm start
```

## Getting Help

### Development Resources
- **Project Documentation**: [Link to project wiki]
- **API Documentation**: [Link to API docs]
- **Component Library**: [Link to Storybook if available]
- **Database Schema**: [Link to schema docs]

### Support Channels
- **Development Slack**: #churn-saver-dev
- **Technical Support**: dev-team@company.com
- **Emergency Contact**: +1-555-XXX-XXXX

### Common Commands Reference
```bash
# Development
pnpm dev                    # Start development server
pnpm test                   # Run all tests
pnpm lint                   # Check code quality
pnpm format                 # Format code

# Database
pnpm run db:migrate          # Run migrations
pnpm run db:reset            # Reset database
pnpm run db:seed             # Seed test data

# Build
pnpm build                   # Build for production
pnpm start                   # Start production server

# Utilities
pnpm run clean               # Clean build cache
pnpm run type-check          # Check TypeScript types
```

---

## High Severity Violation #10: Limited Error Recovery Testing

### 1. Specific Code Implementation Details

#### 1.1 Comprehensive Error Recovery Tests
**File:** `apps/web/test/error-recovery-comprehensive.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { executeWithRecovery } from '@/lib/errorRecovery';
import { CircuitBreaker } from '@/lib/resilience';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';

describe('Error Recovery Scenarios', () => {
  beforeEach(async () => {
    // Setup test environment
    await setupTestEnvironment();
  });

  afterEach(async () => {
    // Cleanup test environment
    await cleanupTestEnvironment();
  });

  describe('Database Connection Recovery', () => {
    it('should recover from temporary database connection loss', async () => {
      // Simulate database connection failure
      const originalPool = getDb().pool;
      
      // Mock connection failure
      getDb().pool = {
        connect: () => Promise.reject(new Error('Connection timeout')),
        query: () => Promise.reject(new Error('Connection lost')),
        end: () => Promise.resolve()
      } as any;

      // Test recovery mechanism
      const result = await executeWithRecovery(
        async () => sql.query('SELECT 1 as test'),
        {
          service: 'database',
          maxRetries: 3,
          retryDelay: 1000,
          circuitBreaker: true
        }
      );

      // Restore original pool
      getDb().pool = originalPool;

      expect(result).toBeDefined();
      expect(result.rows[0].test).toBe(1);
    });

    it('should implement circuit breaker pattern', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 5000
      });

      // Simulate failures to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Simulated failure');
          });
        } catch (error) {
          // Expected failures
        }
      }

      // Circuit should be open now
      expect(circuitBreaker.getState()).toBe('OPEN');

      // Subsequent calls should fail immediately
      await expect(
        circuitBreaker.execute(async () => sql.query('SELECT 1'))
      ).rejects.toThrow('Circuit breaker is OPEN');
    });
  });

  describe('External Service Recovery', () => {
    it('should recover from Whop API failures', async () => {
      // Mock Whop API failure
      const mockWhopClient = {
        getUser: jest.fn()
          .mockRejectedValueOnce(new Error('API timeout'))
          .mockRejectedValueOnce(new Error('API rate limited'))
          .mockResolvedValueOnce({ id: 'user_123', email: 'test@example.com' })
      };

      // Test recovery with exponential backoff
      const result = await executeWithRecovery(
        async () => mockWhopClient.getUser('user_123'),
        {
          service: 'whop_api',
          maxRetries: 3,
          retryDelay: 1000,
          backoffMultiplier: 2
        }
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('user_123');
      expect(mockWhopClient.getUser).toHaveBeenCalledTimes(3);
    });

    it('should handle webhook processing failures', async () => {
      const testWebhook = {
        id: 'evt_test_123',
        type: 'payment.succeeded',
        data: {
          membership: { id: 'membership_123' },
          user: { id: 'user_123' }
        }
      };

      // Simulate webhook processing failure
      const processWebhook = jest.fn()
        .mockRejectedValueOnce(new Error('Database constraint violation'))
        .mockResolvedValueOnce({ success: true });

      // Test recovery mechanism
      const result = await executeWithRecovery(
        async () => processWebhook(testWebhook),
        {
          service: 'webhook_processor',
          maxRetries: 2,
          retryDelay: 500,
          deadLetterQueue: true
        }
      );

      expect(result.success).toBe(true);
      expect(processWebhook).toHaveBeenCalledTimes(2);
    });
  });

  describe('Job Queue Recovery', () => {
    it('should recover from job processing failures', async () => {
      const testJob = {
        id: 'job_123',
        type: 'send_nudge',
        payload: { caseId: 'case_123', userId: 'user_123' },
        attempts: 0,
        maxAttempts: 3
      };

      // Simulate job processing failure
      const processJob = jest.fn()
        .mockRejectedValueOnce(new Error('Notification service unavailable'))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce({ success: true });

      // Test job retry mechanism
      const result = await executeWithRecovery(
        async () => processJob(testJob),
        {
          service: 'job_queue',
          maxRetries: testJob.maxAttempts,
          retryDelay: 2000,
          exponentialBackoff: true
        }
      );

      expect(result.success).toBe(true);
      expect(processJob).toHaveBeenCalledTimes(3);
    });

    it('should handle dead letter queue for failed jobs', async () => {
      const failedJob = {
        id: 'job_456',
        type: 'process_payment',
        payload: { paymentId: 'pay_123' },
        attempts: 5,
        maxAttempts: 3
      };

      // Test dead letter queue mechanism
      const result = await executeWithRecovery(
        async () => {
          throw new Error('Max retry attempts exceeded');
        },
        {
          service: 'job_queue',
          maxRetries: 0,
          deadLetterQueue: true,
          jobData: failedJob
        }
      );

      // Verify job was moved to dead letter queue
      const deadLetterJob = await sql.query(`
        SELECT * FROM job_queue_dead_letter 
        WHERE job_id = $1
      `, [failedJob.id]);

      expect(deadLetterJob.rows).toHaveLength(1);
      expect(deadLetterJob.rows[0].job_id).toBe(failedJob.id);
    });
  });

  describe('Memory and Resource Recovery', () => {
    it('should handle memory pressure scenarios', async () => {
      // Simulate memory pressure
      const originalMemory = process.memoryUsage();
      
      // Mock high memory usage
      Object.defineProperty(process, 'memoryUsage', {
        value: () => ({
          ...originalMemory,
          heapUsed: originalMemory.heapUsed * 2, // Double memory usage
          heapTotal: originalMemory.heapTotal
        }),
        writable: true
      });

      // Test memory recovery mechanisms
      const result = await executeWithRecovery(
        async () => {
          // Simulate memory-intensive operation
          const largeArray = new Array(1000000).fill(0);
          return largeArray.reduce((sum, val) => sum + val, 0);
        },
        {
          service: 'memory_intensive_operation',
          memoryThreshold: 500 * 1024 * 1024, // 500MB
          maxRetries: 2,
          retryDelay: 1000
        }
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
    });

    it('should implement graceful degradation under load', async () => {
      // Simulate high load scenario
      const concurrentRequests = 100;
      const requests = Array(concurrentRequests).fill(0).map((_, index) => 
        executeWithRecovery(
          async () => {
            // Simulate processing delay
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
            return { requestId: `req_${index}`, processed: true };
          },
          {
            service: 'api_request',
            maxRetries: 1,
            timeout: 5000,
            circuitBreaker: true
          }
        )
      );

      const results = await Promise.allSettled(requests);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Should handle load gracefully (not all requests should fail)
      expect(successful + failed).toBe(concurrentRequests);
      expect(successful).toBeGreaterThan(concurrentRequests * 0.8); // At least 80% success
    });
  });

  describe('Data Consistency Recovery', () => {
    it('should recover from partial transaction failures', async () => {
      const testData = {
        caseId: 'case_789',
        userId: 'user_789',
        action: 'nudge_sent'
      };

      // Simulate partial transaction failure
      const executeTransaction = jest.fn()
        .mockRejectedValueOnce(new Error('Connection lost during commit'))
        .mockResolvedValueOnce({ success: true });

      // Test transaction recovery mechanism
      const result = await executeWithRecovery(
        async () => executeTransaction(testData),
        {
          service: 'database_transaction',
          maxRetries: 2,
          retryDelay: 500,
          transactionRollback: true
        }
      );

      expect(result.success).toBe(true);
      expect(executeTransaction).toHaveBeenCalledTimes(2);
    });

    it('should verify data integrity after recovery', async () => {
      const originalData = await sql.query(`
        SELECT COUNT(*) as count FROM recovery_actions 
        WHERE case_id = $1
      `, ['case_integrity_test']);

      // Simulate data corruption scenario
      await sql.query(`
        INSERT INTO recovery_actions (case_id, type, created_at)
        VALUES ($1, 'test_action', NOW())
      `, ['case_integrity_test']);

      // Run integrity check and recovery
      const result = await executeWithRecovery(
        async () => verifyDataIntegrity('case_integrity_test'),
        {
          service: 'data_integrity',
          maxRetries: 1,
          autoRepair: true
        }
      );

      expect(result.integrity).toBe(true);
      
      // Verify data was repaired
      const finalData = await sql.query(`
        SELECT COUNT(*) as count FROM recovery_actions 
        WHERE case_id = $1
      `, ['case_integrity_test']);

      expect(finalData.rows[0].count).toBe(originalData.rows[0].count);
    });
  });
});

async function setupTestEnvironment(): Promise<void> {
  // Setup test database and services
  await sql.query(`
    INSERT INTO recovery_cases (id, user_id, company_id, membership_id, first_failure_at)
    VALUES ('case_recovery_test', 'user_recovery_test', 'company_recovery_test', 'membership_recovery_test', NOW())
    ON CONFLICT DO NOTHING
  `);
}

async function cleanupTestEnvironment(): Promise<void> {
  // Cleanup test data
  await sql.query(`
    DELETE FROM recovery_cases 
    WHERE id LIKE '%_recovery_test' OR id LIKE '%_integrity_test'
  `);
}

async function verifyDataIntegrity(caseId: string): Promise<{ integrity: boolean; repaired: boolean }> {
  // Implementation to verify and repair data integrity
  const duplicateActions = await sql.query(`
    SELECT COUNT(*) as count FROM recovery_actions 
    WHERE case_id = $1 
    GROUP BY case_id, type, created_at
    HAVING COUNT(*) > 1
  `, [caseId]);

  if (duplicateActions.rows.length > 0) {
    // Remove duplicates
    await sql.query(`
      DELETE FROM recovery_actions 
      WHERE ctid NOT IN (
        SELECT ctid FROM recovery_actions 
        WHERE case_id = $1 
        GROUP BY case_id, type, created_at 
        ORDER BY created_at DESC 
        LIMIT 1
      )
    `, [caseId]);

    return { integrity: true, repaired: true };
  }

  return { integrity: true, repaired: false };
}
```

#### 1.2 Error Recovery Service Enhancement
**File:** `apps/web/src/lib/errorRecovery.ts` (extend existing)

```typescript
import { logger } from '@/lib/logger';
import { CircuitBreaker } from '@/lib/resilience';
import { sql } from '@/lib/db';

export interface RecoveryOptions {
  service: string;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  timeout?: number;
  circuitBreaker?: boolean;
  deadLetterQueue?: boolean;
  transactionRollback?: boolean;
  autoRepair?: boolean;
  memoryThreshold?: number;
  exponentialBackoff?: boolean;
  jobData?: any;
}

export interface RecoveryResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  duration: number;
  recoveryStrategy?: string;
}

export interface DeadLetterJob {
  id: string;
  originalJobId: string;
  jobType: string;
  payload: any;
  error: string;
  failedAt: string;
  retryCount: number;
  maxRetries: number;
}

/**
 * Enhanced execute with recovery function
 * Implements multiple recovery strategies based on service type
 */
export async function executeWithRecovery<T = any>(
  operation: () => Promise<T>,
  options: RecoveryOptions
): Promise<RecoveryResult<T>> {
  const startTime = Date.now();
  const {
    service,
    maxRetries = 3,
    retryDelay = 1000,
    backoffMultiplier = 2,
    timeout = 30000,
    circuitBreaker = false,
    deadLetterQueue = false,
    transactionRollback = false,
    autoRepair = false,
    memoryThreshold = 0,
    exponentialBackoff = false,
    jobData
  } = options;

  let lastError: Error | null = null;
  let attempts = 0;
  let circuitBreakerInstance: CircuitBreaker | null = null;

  try {
    // Initialize circuit breaker if enabled
    if (circuitBreaker) {
      circuitBreakerInstance = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 60000,
        monitoringEnabled: true
      });
    }

    // Check memory usage if threshold specified
    if (memoryThreshold > 0) {
      const memoryUsage = process.memoryUsage();
      if (memoryUsage.heapUsed > memoryThreshold) {
        logger.warn('High memory usage detected, applying memory recovery', {
          service,
          heapUsed: memoryUsage.heapUsed,
          threshold: memoryThreshold
        });

        // Force garbage collection
        if (global.gc) {
          global.gc();
        }

        // Wait for memory to be freed
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Execute operation with retry logic
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attempts = attempt;
      
      try {
        let result: T;

        if (circuitBreakerInstance) {
          result = await circuitBreakerInstance.execute(operation);
        } else {
          // Apply timeout if specified
          if (timeout > 0) {
            result = await Promise.race([
              operation(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Operation timeout')), timeout)
              )
            ]);
          } else {
            result = await operation();
          }
        }

        const duration = Date.now() - startTime;
        
        logger.info('Operation completed successfully', {
          service,
          attempt,
          duration,
          recoveryStrategy: determineRecoveryStrategy(options)
        });

        return {
          success: true,
          data: result,
          attempts: attempt,
          duration,
          recoveryStrategy: determineRecoveryStrategy(options)
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn('Operation attempt failed', {
          service,
          attempt,
          error: lastError.message,
          willRetry: attempt < maxRetries
        });

        // Handle transaction rollback if enabled
        if (transactionRollback && attempt === maxRetries) {
          await handleTransactionRollback(lastError, jobData);
        }

        // Handle auto-repair if enabled
        if (autoRepair && attempt === maxRetries) {
          const repairResult = await handleAutoRepair(service, lastError, jobData);
          if (repairResult.success) {
            return {
              success: true,
              data: repairResult.data,
              attempts: attempt,
              duration: Date.now() - startTime,
              recoveryStrategy: 'auto_repair'
            };
          }
        }

        // Handle dead letter queue if enabled
        if (deadLetterQueue && attempt === maxRetries) {
          await handleDeadLetterQueue(jobData, lastError, attempt);
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay for next attempt
        let delay = retryDelay;
        if (exponentialBackoff) {
          delay = retryDelay * Math.pow(backoffMultiplier, attempt - 1);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All attempts failed
    const duration = Date.now() - startTime;
    
    logger.error('Operation failed after all retries', {
      service,
      attempts,
      duration,
      finalError: lastError?.message,
      recoveryStrategy: determineRecoveryStrategy(options)
    });

    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      attempts,
      duration,
      recoveryStrategy: determineRecoveryStrategy(options)
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const fatalError = error instanceof Error ? error : new Error(String(error));
    
    logger.error('Unexpected error during recovery execution', {
      service,
      error: fatalError.message,
      duration
    });

    return {
      success: false,
      error: fatalError,
      attempts,
      duration,
      recoveryStrategy: 'unexpected_error'
    };
  }
}

function determineRecoveryStrategy(options: RecoveryOptions): string {
  const strategies: string[] = [];
  
  if (options.circuitBreaker) strategies.push('circuit_breaker');
  if (options.deadLetterQueue) strategies.push('dead_letter_queue');
  if (options.transactionRollback) strategies.push('transaction_rollback');
  if (options.autoRepair) strategies.push('auto_repair');
  if (options.memoryThreshold > 0) strategies.push('memory_management');
  if (options.exponentialBackoff) strategies.push('exponential_backoff');
  
  return strategies.join(',') || 'retry';
}

async function handleTransactionRollback(error: Error, jobData?: any): Promise<void> {
  try {
    logger.info('Attempting transaction rollback', {
      error: error.message,
      jobData
    });

    // Rollback any pending transactions
    await sql.query('ROLLBACK');

    // Log rollback for audit
    await sql.query(`
      INSERT INTO transaction_rollback_log (error_message, job_data, rollback_at)
      VALUES ($1, $2, NOW())
    `, [error.message, JSON.stringify(jobData || {})]);

  } catch (rollbackError) {
    logger.error('Transaction rollback failed', {
      originalError: error.message,
      rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
    });
  }
}

async function handleAutoRepair(service: string, error: Error, jobData?: any): Promise<{ success: boolean; data?: any }> {
  try {
    logger.info('Attempting auto-repair', {
      service,
      error: error.message,
      jobData
    });

    switch (service) {
      case 'database':
        return await repairDatabaseIntegrity(error, jobData);
      
      case 'job_queue':
        return await repairJobQueueState(error, jobData);
      
      case 'webhook_processor':
        return await repairWebhookProcessing(error, jobData);
      
      default:
        logger.warn('No auto-repair strategy available for service', { service });
        return { success: false };
    }
  } catch (repairError) {
    logger.error('Auto-repair failed', {
      service,
      repairError: repairError instanceof Error ? repairError.message : String(repairError)
    });
    return { success: false };
  }
}

async function handleDeadLetterQueue(jobData: any, error: Error, attemptCount: number): Promise<void> {
  try {
    const deadLetterJob: DeadLetterJob = {
      id: `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalJobId: jobData?.id || 'unknown',
      jobType: jobData?.type || 'unknown',
      payload: jobData,
      error: error.message,
      failedAt: new Date().toISOString(),
      retryCount: attemptCount,
      maxRetries: jobData?.maxRetries || 3
    };

    await sql.query(`
      INSERT INTO job_queue_dead_letter (
        id, original_job_id, job_type, payload, error, failed_at, retry_count, max_retries
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
    `, [
      deadLetterJob.id,
      deadLetterJob.originalJobId,
      deadLetterJob.jobType,
      JSON.stringify(deadLetterJob.payload),
      deadLetterJob.error,
      deadLetterJob.retryCount,
      deadLetterJob.maxRetries
    ]);

    logger.info('Job moved to dead letter queue', {
      originalJobId: deadLetterJob.originalJobId,
      deadLetterId: deadLetterJob.id,
      error: error.message
    });

  } catch (dlqError) {
    logger.error('Failed to move job to dead letter queue', {
      error: dlqError instanceof Error ? dlqError.message : String(dlqError),
      originalJobId: jobData?.id
    });
  }
}

async function repairDatabaseIntegrity(error: Error, jobData?: any): Promise<{ success: boolean; data?: any }> {
  // Implementation for database integrity repair
  try {
    // Check for common integrity issues
    const orphanedRecords = await sql.query(`
      SELECT COUNT(*) as count FROM recovery_actions ra
      LEFT JOIN recovery_cases rc ON ra.case_id = rc.id
      WHERE rc.id IS NULL
    `);

    if (orphanedRecords.rows[0].count > 0) {
      logger.info('Found orphaned records, cleaning up', {
        count: orphanedRecords.rows[0].count
      });

      await sql.query(`
        DELETE FROM recovery_actions 
        WHERE case_id NOT IN (SELECT id FROM recovery_cases)
      `);
    }

    return { success: true, data: { cleanedRecords: orphanedRecords.rows[0].count } };
  } catch (repairError) {
    logger.error('Database integrity repair failed', {
      error: repairError instanceof Error ? repairError.message : String(repairError)
    });
    return { success: false };
  }
}

async function repairJobQueueState(error: Error, jobData?: any): Promise<{ success: boolean; data?: any }> {
  // Implementation for job queue state repair
  try {
    // Reset stuck jobs
    await sql.query(`
      UPDATE job_queue 
      SET status = 'pending', attempts = 0 
      WHERE status = 'processing' 
      AND created_at < NOW() - INTERVAL '1 hour'
    `);

    return { success: true, data: { resetStuckJobs: true } };
  } catch (repairError) {
    logger.error('Job queue repair failed', {
      error: repairError instanceof Error ? repairError.message : String(repairError)
    });
    return { success: false };
  }
}

async function repairWebhookProcessing(error: Error, jobData?: any): Promise<{ success: boolean; data?: any }> {
  // Implementation for webhook processing repair
  try {
    // Re-process failed webhooks
    const failedWebhooks = await sql.query(`
      SELECT * FROM events 
      WHERE processed = false 
      AND error IS NOT NULL 
      AND created_at > NOW() - INTERVAL '1 hour'
      LIMIT 10
    `);

    for (const webhook of failedWebhooks.rows) {
      // Mark for reprocessing
      await sql.query(`
        UPDATE events 
        SET processed = false, error = NULL, attempts = 0 
        WHERE id = $1
      `, [webhook.id]);
    }

    return { success: true, data: { reprocessedWebhooks: failedWebhooks.rows.length } };
  } catch (repairError) {
    logger.error('Webhook processing repair failed', {
      error: repairError instanceof Error ? repairError.message : String(repairError)
    });
    return { success: false };
  }
}
```

### 2. Database Schema Changes

#### 2.1 Error Recovery Tables
**File:** `infra/migrations/018_error_recovery_enhancements.sql`

```sql
-- Migration: 018_error_recovery_enhancements.sql
-- Description: Add error recovery and monitoring tables

-- Transaction rollback log table
CREATE TABLE IF NOT EXISTS transaction_rollback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_message text NOT NULL,
  job_data jsonb,
  rollback_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT transaction_rollback_log_error_message_check CHECK (length(error_message) > 0)
);

-- Dead letter queue table
CREATE TABLE IF NOT EXISTS job_queue_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id text NOT NULL,
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  error text NOT NULL,
  failed_at timestamptz DEFAULT now(),
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  processed_at timestamptz,
  processing_result text,
  
  -- Constraints
  CONSTRAINT job_queue_dead_letter_original_job_id_check CHECK (length(original_job_id) > 0),
  CONSTRAINT job_queue_dead_letter_error_check CHECK (length(error) > 0)
);

-- Error recovery metrics table
CREATE TABLE IF NOT EXISTS error_recovery_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  operation_type text NOT NULL,
  error_type text NOT NULL,
  recovery_strategy text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  successful boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT error_recovery_metrics_service_check CHECK (length(service) > 0),
  CONSTRAINT error_recovery_metrics_operation_type_check CHECK (length(operation_type) > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transaction_rollback_log_created_at ON transaction_rollback_log(created_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_failed_at ON job_queue_dead_letter(failed_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_original_job_id ON job_queue_dead_letter(original_job_id);
CREATE INDEX IF NOT EXISTS idx_error_recovery_metrics_service_created_at ON error_recovery_metrics(service, created_at);
CREATE INDEX IF NOT EXISTS idx_error_recovery_metrics_successful ON error_recovery_metrics(successful, created_at);

-- Row Level Security
ALTER TABLE transaction_rollback_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_recovery_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY transaction_rollback_log_admin_policy ON transaction_rollback_log
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

CREATE POLICY job_queue_dead_letter_admin_policy ON job_queue_dead_letter
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

CREATE POLICY error_recovery_metrics_admin_policy ON error_recovery_metrics
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

-- Comments for documentation
COMMENT ON TABLE transaction_rollback_log IS 'Logs transaction rollback attempts for error recovery auditing';
COMMENT ON TABLE job_queue_dead_letter IS 'Stores jobs that failed after max retry attempts for manual inspection';
COMMENT ON TABLE error_recovery_metrics IS 'Tracks error recovery patterns and effectiveness';
```

#### 2.2 Rollback Migration
**File:** `infra/migrations/018_rollback.sql`

```sql
-- Migration: 018_rollback.sql
-- Description: Rollback error recovery enhancements

DROP TABLE IF EXISTS error_recovery_metrics CASCADE;
DROP TABLE IF EXISTS job_queue_dead_letter CASCADE;
DROP TABLE IF EXISTS transaction_rollback_log CASCADE;
```

### 3. Configuration Changes Required

#### 3.1 Environment Variables
Add to `.env.development` and `.env.production`:

```bash
# Error Recovery Settings
ERROR_RECOVERY_ENABLED=true
ERROR_RECOVERY_MAX_RETRIES=3
ERROR_RECOVERY_RETRY_DELAY=1000
ERROR_RECOVERY_CIRCUIT_BREAKER_ENABLED=true
ERROR_RECOVERY_DEAD_LETTER_QUEUE_ENABLED=true
ERROR_RECOVERY_AUTO_REPAIR_ENABLED=true
ERROR_RECOVERY_MEMORY_THRESHOLD_MB=500
ERROR_RECOVERY_METRICS_ENABLED=true
```

#### 3.2 Error Recovery Configuration
**File:** `apps/web/src/lib/errorRecoveryConfig.ts`

```typescript
export const errorRecoveryConfig = {
  database: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    circuitBreaker: true,
    transactionRollback: true,
    autoRepair: true,
    timeout: 30000
  },
  
  external_api: {
    maxRetries: 3,
    retryDelay: 1500,
    backoffMultiplier: 2,
    exponentialBackoff: true,
    circuitBreaker: true,
    timeout: 15000
  },
  
  job_queue: {
    maxRetries: 5,
    retryDelay: 2000,
    exponentialBackoff: true,
    deadLetterQueue: true,
    timeout: 60000
  },
  
  webhook_processor: {
    maxRetries: 2,
    retryDelay: 500,
    deadLetterQueue: true,
    autoRepair: true,
    timeout: 10000
  },
  
  memory_intensive: {
    maxRetries: 2,
    retryDelay: 5000,
    memoryThreshold: 500 * 1024 * 1024, // 500MB
    circuitBreaker: true
  }
};

export type RecoveryServiceType = keyof typeof errorRecoveryConfig;
```

### 4. Dependencies That Need to Be Installed

No new dependencies required - uses existing packages:
- `pg` (already installed)
- Existing utilities and error handling libraries

### 5. Integration Points with Existing Code

#### 5.1 Integration with Existing Error Handling
**File:** `apps/web/src/lib/errorRecovery.ts` (extend existing)

```typescript
// Enhance existing error recovery with new strategies
import { CircuitBreaker } from '@/lib/resilience';
```

#### 5.2 Integration with Job Queue
**File:** `apps/web/src/server/services/jobQueue.ts` (extend existing)

```typescript
import { executeWithRecovery } from '@/lib/errorRecovery';
import { errorRecoveryConfig } from '@/lib/errorRecoveryConfig';

// Add recovery to job processing
export async function processJobWithRecovery(job: any): Promise<any> {
  return executeWithRecovery(
    async () => processJob(job),
    {
      service: 'job_queue',
      ...errorRecoveryConfig.job_queue,
      jobData: job
    }
  );
}
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Automated Tests
**File:** `apps/web/test/error-recovery-enhanced.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { executeWithRecovery } from '@/lib/errorRecovery';
import { sql } from '@/lib/db';

describe('Enhanced Error Recovery', () => {
  beforeEach(async () => {
    await setupErrorRecoveryTest();
  });

  afterEach(async () => {
    await cleanupErrorRecoveryTest();
  });

  it('should implement circuit breaker correctly', async () => {
    let failureCount = 0;
    
    const operation = async () => {
      failureCount++;
      if (failureCount <= 3) {
        throw new Error(`Simulated failure ${failureCount}`);
      }
      return { success: true };
    };

    const result = await executeWithRecovery(operation, {
      service: 'test_circuit_breaker',
      maxRetries: 5,
      circuitBreaker: true
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBeGreaterThan(3);
  });

  it('should handle dead letter queue correctly', async () => {
    const testJob = {
      id: 'job_dlq_test',
      type: 'test_operation',
      payload: { test: true },
      maxRetries: 2
    };

    const failingOperation = async () => {
      throw new Error('Consistent failure for DLQ test');
    };

    const result = await executeWithRecovery(failingOperation, {
      service: 'test_dlq',
      maxRetries: 2,
      deadLetterQueue: true,
      jobData: testJob
    });

    expect(result.success).toBe(false);
    
    // Verify job was moved to dead letter queue
    const dlqJob = await sql.query(`
      SELECT * FROM job_queue_dead_letter 
      WHERE original_job_id = $1
    `, [testJob.id]);

    expect(dlqJob.rows).toHaveLength(1);
    expect(dlqJob.rows[0].original_job_id).toBe(testJob.id);
  });

  it('should implement exponential backoff correctly', async () => {
    const attemptTimes: number[] = [];
    let attemptCount = 0;
    
    const operation = async () => {
      attemptCount++;
      attemptTimes.push(Date.now());
      
      if (attemptCount < 3) {
        throw new Error(`Attempt ${attemptCount} failed`);
      }
      
      return { success: true };
    };

    const result = await executeWithRecovery(operation, {
      service: 'test_exponential_backoff',
      maxRetries: 3,
      retryDelay: 100,
      exponentialBackoff: true
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    
    // Verify exponential backoff timing
    expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThan(100); // Second retry
    expect(attemptTimes[3] - attemptTimes[2]).toBeGreaterThan(200); // Third retry
  });

  it('should handle memory pressure recovery', async () => {
    const originalMemory = process.memoryUsage();
    
    // Mock high memory usage
    Object.defineProperty(process, 'memoryUsage', {
      value: () => ({
        ...originalMemory,
        heapUsed: originalMemory.heapUsed * 1.5, // 50% increase
        heapTotal: originalMemory.heapTotal
      }),
      writable: true
    });

    const operation = async () => {
      // Memory-intensive operation
      const largeArray = new Array(100000).fill(0);
      return largeArray.reduce((sum, val) => sum + val, 0);
    };

    const result = await executeWithRecovery(operation, {
      service: 'test_memory_recovery',
      memoryThreshold: 100 * 1024 * 1024, // 100MB threshold
      maxRetries: 2
    });

    expect(result.success).toBe(true);
  });
});

async function setupErrorRecoveryTest(): Promise<void> {
  // Setup test environment for error recovery tests
  await sql.query(`
    INSERT INTO job_queue (id, job_type, payload, status, created_at)
    VALUES ('job_dlq_test', 'test_operation', '{"test": true}', 'pending', NOW())
    ON CONFLICT DO NOTHING
  `);
}

async function cleanupErrorRecoveryTest(): Promise<void> {
  // Cleanup test environment
  await sql.query(`
    DELETE FROM job_queue_dead_letter 
    WHERE original_job_id LIKE '%_test%'
  `);
  
  await sql.query(`
    DELETE FROM job_queue 
    WHERE id LIKE '%_test%'
  `);
  
  await sql.query(`
    DELETE FROM error_recovery_metrics 
    WHERE service LIKE '%_test%'
  `);
}
```

#### 6.2 Integration Test Script
**File:** `scripts/test-error-recovery.js`

```bash
#!/bin/bash
# Error Recovery Integration Test

echo "🧪 Testing Error Recovery Implementation..."

# 1. Test circuit breaker
echo "⚡ Testing circuit breaker..."
node scripts/test-circuit-breaker.js

# 2. Test dead letter queue
echo "💀 Testing dead letter queue..."
node scripts/test-dead-letter-queue.js

# 3. Test exponential backoff
echo "📈 Testing exponential backoff..."
node scripts/test-exponential-backoff.js

# 4. Test memory recovery
echo "🧠 Testing memory recovery..."
node scripts/test-memory-recovery.js

# 5. Test auto-repair mechanisms
echo "🔧 Testing auto-repair mechanisms..."
node scripts/test-auto-repair.js

# 6. Verify error recovery metrics
echo "📊 Verifying error recovery metrics..."
psql $DATABASE_URL -c "
  SELECT service, recovery_strategy, successful, COUNT(*) as count
  FROM error_recovery_metrics 
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY service, recovery_strategy, successful
  ORDER BY created_at DESC
  LIMIT 10;
"

echo "✅ Error recovery testing completed!"
```

#### 6.3 Manual Verification Commands

```bash
# Test circuit breaker functionality
curl -X POST http://localhost:3000/api/test/circuit-breaker \
  -H "Content-Type: application/json" \
  -d '{"simulateFailures": true}' \
  | jq .

# Test dead letter queue monitoring
curl -X GET http://localhost:3000/api/admin/dead-letter-queue \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  | jq .

# Test error recovery metrics
curl -X GET http://localhost:3000/api/admin/error-recovery-metrics \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  | jq .

# Verify error recovery tables
psql $DATABASE_URL -c "
  SELECT 
    COUNT(*) as total_recoveries,
    AVG(attempts) as avg_attempts,
    AVG(duration_ms) as avg_duration
  FROM error_recovery_metrics 
  WHERE created_at > NOW() - INTERVAL '24 hours';
"
```

---

[Continue with remaining violations...]
---

## Medium Severity Violation #8: Missing Debugging Procedures

### 1. Specific Code Implementation Details

#### 1.1 Debugging Service
**File:** `apps/web/src/lib/debugging.ts` (new file)

```typescript
import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';

export interface DebugSession {
  id: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  startTime: string;
  endTime?: string;
  context: Record<string, any>;
  logs: DebugLog[];
  status: 'active' | 'completed' | 'error';
}

export interface DebugLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  category: string;
  data?: any;
}

export interface DebugContext {
  userId?: string;
  companyId?: string;
  requestId?: string;
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  featureFlags?: Record<string, boolean>;
  environment?: string;
}

export interface DebugOptions {
  includeSensitiveData?: boolean;
  maxLogEntries?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  persistToDatabase?: boolean;
  persistToFile?: boolean;
}

class DebugService {
  private activeSessions: Map<string, DebugSession> = new Map();
  private logBuffer: Map<string, DebugLog[]> = new Map();
  private readonly maxBufferEntries = 1000;

  /**
   * Start a new debugging session
   * @param {string} sessionId - Unique session identifier
   * @param {DebugContext} context - Debug context information
   * @param {DebugOptions} options - Debug options
   * @returns {Promise<DebugSession>} Created debug session
   */
  async startDebugSession(
    sessionId: string, 
    context: DebugContext, 
    options: DebugOptions = {}
  ): Promise<DebugSession> {
    const debugSession: DebugSession = {
      id: `debug_${sessionId}_${Date.now()}`,
      sessionId,
      requestId: context.requestId,
      userId: context.userId,
      startTime: new Date().toISOString(),
      context: { ...context },
      logs: [],
      status: 'active'
    };

    this.activeSessions.set(debugSession.id, debugSession);
    this.logBuffer.set(debugSession.id, []);

    logger.info('Debug session started', {
      debugSessionId: debugSession.id,
      userId: context.userId,
      sessionId,
      requestId: context.requestId
    });

    // Persist session to database if enabled
    if (options.persistToDatabase) {
      await this.persistDebugSession(debugSession);
    }

    return debugSession;
  }

  /**
   * Add log entry to debug session
   * @param {string} sessionId - Debug session ID
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {string} category - Log category
   * @param {any} data - Additional log data
   * @param {boolean} includeSensitive - Whether to include sensitive data
   */
  addDebugLog(
    sessionId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    category: string,
    data?: any,
    includeSensitive = false
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn('Attempted to add log to non-existent debug session', { sessionId });
      return;
    }

    const logEntry: DebugLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      category,
      data: includeSensitive ? data : this.sanitizeLogData(data)
    };

    session.logs.push(logEntry);

    // Maintain buffer size limit
    if (session.logs.length > this.maxBufferEntries) {
      session.logs = session.logs.slice(-this.maxBufferEntries);
    }

    this.logBuffer.set(sessionId, session.logs);
  }

  /**
   * End debugging session and generate report
   * @param {string} sessionId - Debug session ID
   * @param {string} reason - Reason for ending session
   * @param {DebugOptions} options - Debug options
   * @returns {Promise<DebugSession>} Completed debug session
   */
  async endDebugSession(
    sessionId: string,
    reason = 'Session completed',
    options: DebugOptions = {}
  ): Promise<DebugSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn('Attempted to end non-existent debug session', { sessionId });
      throw new Error(`Debug session ${sessionId} not found`);
    }

    session.endTime = new Date().toISOString();
    session.status = 'completed';

    logger.info('Debug session ended', {
      debugSessionId: session.id,
      userId: session.userId,
      reason,
      duration: this.calculateSessionDuration(session)
    });

    // Generate debug report
    const report = await this.generateDebugReport(session, options);

    // Persist report if enabled
    if (options.persistToDatabase) {
      await this.persistDebugReport(session, report);
    }

    // Save to file if enabled
    if (options.persistToFile) {
      await this.saveDebugReportToFile(session, report);
    }

    // Remove from active sessions
    this.activeSessions.delete(sessionId);
    this.logBuffer.delete(sessionId);

    return { ...session, status: 'completed' };
  }

  /**
   * Get active debug session
   * @param {string} sessionId - Debug session ID
   * @returns {DebugSession | null} Debug session or null
   */
  getDebugSession(sessionId: string): DebugSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get all active debug sessions
   * @returns {DebugSession[]} Array of active debug sessions
   */
  getActiveDebugSessions(): DebugSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Add API request debugging information
   * @param {string} sessionId - Debug session ID
   * @param {any} request - API request object
   * @param {any} response - API response object
   * @param {number} duration - Request duration in milliseconds
   */
  addApiDebugInfo(
    sessionId: string,
    request: any,
    response: any,
    duration: number
  ): void {
    const requestData = {
      method: request.method,
      url: request.url,
      headers: this.sanitizeHeaders(request.headers),
      body: this.sanitizeLogData(request.body),
      timestamp: new Date().toISOString()
    };

    const responseData = {
      status: response.status,
      headers: this.sanitizeHeaders(response.headers),
      body: this.sanitizeLogData(response.body),
      timestamp: new Date().toISOString()
    };

    this.addDebugLog(
      sessionId,
      'debug',
      `API ${request.method} ${request.url}`,
      'api_request',
      {
        request: requestData,
        response: responseData,
        duration
      },
      false
    );
  }

  /**
   * Add database query debugging information
   * @param {string} sessionId - Debug session ID
   * @param {string} query - SQL query
   * @param {any[]} params - Query parameters
   * @param {any} result - Query result
   * @param {number} duration - Query duration in milliseconds
   */
  addDatabaseDebugInfo(
    sessionId: string,
    query: string,
    params: any[],
    result: any,
    duration: number
  ): void {
    this.addDebugLog(
      sessionId,
      'debug',
      'Database Query',
      'database_query',
      {
        query: this.sanitizeQuery(query),
        params: this.sanitizeLogData(params),
        result: this.sanitizeLogData(result),
        duration
      },
      false
    );
  }

  /**
   * Add error debugging information
   * @param {string} sessionId - Debug session ID
   * @param {Error} error - Error object
   * @param {string} context - Error context
   * @param {any} additionalData - Additional error data
   */
  addErrorDebugInfo(
    sessionId: string,
    error: Error,
    context: string,
    additionalData?: any
  ): void {
    this.addDebugLog(
      sessionId,
      'error',
      error.message,
      'error',
      {
        name: error.name,
        stack: error.stack,
        context,
        data: this.sanitizeLogData(additionalData)
      },
      false
    );
  }

  private async generateDebugReport(
    session: DebugSession,
    options: DebugOptions
  ): Promise<any> {
    const report = {
      sessionId: session.id,
      userId: session.userId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: this.calculateSessionDuration(session),
      context: session.context,
      summary: this.generateSessionSummary(session),
      logs: options.includeSensitiveData ? 
        session.logs : 
        session.logs.map(log => this.sanitizeLogData(log.data))),
      statistics: this.generateSessionStatistics(session)
    };

    return report;
  }

  private calculateSessionDuration(session: DebugSession): number {
    const startTime = new Date(session.startTime).getTime();
    const endTime = session.endTime ? new Date(session.endTime).getTime() : Date.now();
    return endTime - startTime;
  }

  private generateSessionSummary(session: DebugSession): any {
    const logCounts = session.logs.reduce((counts, log) => {
      counts[log.level] = (counts[log.level] || 0) + 1;
      counts[log.category] = (counts[log.category] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return {
      totalLogs: session.logs.length,
      logLevels: logCounts,
      categories: Object.keys(
        session.logs.reduce((cats, log) => {
          cats[log.category] = true;
          return cats;
        }, {} as Record<string, boolean>)
      )
    };
  }

  private generateSessionStatistics(session: DebugSession): any {
    const apiRequests = session.logs.filter(log => log.category === 'api_request');
    const databaseQueries = session.logs.filter(log => log.category === 'database_query');
    const errors = session.logs.filter(log => log.level === 'error');

    return {
      apiRequests: {
        count: apiRequests.length,
        averageDuration: apiRequests.length > 0 ? 
          apiRequests.reduce((sum, log) => sum + (log.data?.duration || 0), 0) / apiRequests.length : 
          0
      },
      databaseQueries: {
        count: databaseQueries.length,
        averageDuration: databaseQueries.length > 0 ? 
          databaseQueries.reduce((sum, log) => sum + (log.data?.duration || 0), 0) / databaseQueries.length : 
          0
      },
      errors: {
        count: errors.length,
        categories: errors.reduce((cats, error) => {
          cats[error.category] = (cats[error.category] || 0) + 1;
          return cats;
        }, {} as Record<string, number>)
      }
    };
  }

  private sanitizeLogData(data: any): any {
    if (!data) return data;

    if (typeof data === 'string') {
      return this.redactSensitiveString(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeLogData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (this.isSensitiveField(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeLogData(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  private sanitizeHeaders(headers: any): any {
    if (!headers) return headers;

    const sanitized: any = {};
    for (const [key, value] of Object.entries(headers)) {
      if (this.isSensitiveHeader(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private sanitizeQuery(query: string): string {
    // Remove potential sensitive data from SQL queries
    return query.replace(/('.*password.*'=|'.*token.*'=|'.*secret.*'=)/gi, "'[REDACTED]'");
  }

  private redactSensitiveString(str: string): string {
    // Redact common sensitive patterns
    return str
      .replace(/(password["']?\s*[:=]\s*["']?)([^"'\s]+)/gi, '$1[REDACTED]')
      .replace(/(token["']?\s*[:=]\s*["']?)([^"'\s]+)/gi, '$1[REDACTED]')
      .replace(/(secret["']?\s*[:=]\s*["']?)([^"'\s]+)/gi, '$1[REDACTED]')
      .replace(/(\d{3}[-\s]?\d{2}[-\s]?\d{4})/g, '[REDACTED_CREDIT_CARD]') // Basic credit card pattern
      .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[REDACTED_EMAIL]'); // Email pattern
  }

  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'apiKey', 
      'creditCard', 'ssn', 'socialSecurityNumber', 'bankAccount',
      'authorization', 'cookie', 'session'
    ];
    return sensitiveFields.some(field => 
      fieldName.toLowerCase().includes(field.toLowerCase())
    );
  }

  private isSensitiveHeader(headerName: string): boolean {
    const sensitiveHeaders = [
      'authorization', 'cookie', 'x-api-key', 'x-auth-token'
    ];
    return sensitiveHeaders.some(header => 
      headerName.toLowerCase().includes(header.toLowerCase())
    );
  }

  private async persistDebugSession(session: DebugSession): Promise<void> {
    try {
      await sql.query(`
        INSERT INTO debug_sessions (
          id, user_id, session_id, request_id, start_time, 
          context, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        session.id,
        session.userId,
        session.sessionId,
        session.requestId,
        session.startTime,
        encrypt(JSON.stringify(session.context)),
        session.status
      ]);
    } catch (error) {
      logger.error('Failed to persist debug session', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async persistDebugReport(session: DebugSession, report: any): Promise<void> {
    try {
      await sql.query(`
        INSERT INTO debug_reports (
          session_id, user_id, start_time, end_time, duration, 
          context, summary, statistics, logs, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        session.id,
        session.userId,
        session.startTime,
        session.endTime,
        this.calculateSessionDuration(session),
        encrypt(JSON.stringify(session.context)),
        encrypt(JSON.stringify(report.summary)),
        encrypt(JSON.stringify(report.statistics)),
        encrypt(JSON.stringify(report.logs))
      ]);
    } catch (error) {
      logger.error('Failed to persist debug report', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async saveDebugReportToFile(session: DebugSession, report: any): Promise<void> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const debugDir = path.join(process.cwd(), 'debug-logs');
      await fs.mkdir(debugDir, { recursive: true });
      
      const filename = `debug-report-${session.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const filepath = path.join(debugDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      
      logger.info('Debug report saved to file', {
        sessionId: session.id,
        filepath
      });
    } catch (error) {
      logger.error('Failed to save debug report to file', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// Singleton instance
export const debugService = new DebugService();

// Convenience functions
export const startDebugging = debugService.startDebugSession.bind(debugService);
export const endDebugging = debugService.endDebugSession.bind(debugService);
export const addDebugLog = debugService.addDebugLog.bind(debugService);
export const addApiDebugInfo = debugService.addApiDebugInfo.bind(debugService);
export const addDatabaseDebugInfo = debugService.addDatabaseDebugInfo.bind(debugService);
export const addErrorDebugInfo = debugService.addErrorDebugInfo.bind(debugService);
```

#### 1.2 Debug API Endpoints
**File:** `apps/web/src/app/api/debug/session/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/whop/authMiddleware';
import { apiSuccess, apiError, errors } from '@/lib/apiResponse';
import { debugService } from '@/lib/debugging';
import { logger } from '@/lib/logger';
import { createRequestContext } from '@/lib/apiResponse';

// POST - Start debug session
export async function POST(request: NextRequest, context) {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId, context, options } = body;

    if (!sessionId) {
      throw errors.validationError('Session ID is required');
    }

    const debugContext = {
      userId,
      requestId: requestContext.requestId,
      userAgent: request.headers.get('user-agent'),
      ipAddress: request.ip,
      environment: process.env.NODE_ENV,
      ...context
    };

    const debugSession = await debugService.startDebugSession(
      sessionId,
      debugContext,
      options
    );

    return apiSuccess({
      sessionId: debugSession.id,
      startTime: debugSession.startTime,
      context: debugSession
    }, requestContext);

  } catch (error) {
    logger.error('Failed to start debug session', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('Failed to start debug session', { details: error.message }) :
        errors.internalServerError('Failed to start debug session'),
      requestContext
    );
  }
}

// GET - Get debug session
export async function GET(request: NextRequest, context) {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      throw errors.validationError('Session ID is required');
    }

    const debugSession = debugService.getDebugSession(sessionId);
    
    if (!debugSession) {
      throw errors.notFound('Debug session not found');
    }

    // Verify user owns this session
    if (debugSession.userId !== userId) {
      throw errors.forbidden('Access denied to debug session');
    }

    return apiSuccess({
      sessionId: debugSession.id,
      userId: debugSession.userId,
      startTime: debugSession.startTime,
      endTime: debugSession.endTime,
      status: debugSession.status,
      context: debugSession.context,
      logCount: debugSession.logs.length
    }, requestContext);

  } catch (error) {
    logger.error('Failed to get debug session', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('Failed to get debug session', { details: error.message }) :
        errors.internalServerError('Failed to get debug session'),
      requestContext
    );
  }
}

// PUT - End debug session
export async function PUT(request: NextRequest, context) {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      throw errors.validationError('Session ID is required');
    }

    const body = await request.json().catch(() => ({}));
    const { reason, options } = body;

    const debugSession = debugService.getDebugSession(sessionId);
    
    if (!debugSession) {
      throw errors.notFound('Debug session not found');
    }

    // Verify user owns this session
    if (debugSession.userId !== userId) {
      throw errors.forbidden('Access denied to debug session');
    }

    const completedSession = await debugService.endDebugSession(
      sessionId,
      reason || 'Session ended by user',
      options
    );

    return apiSuccess({
      sessionId: completedSession.id,
      startTime: completedSession.startTime,
      endTime: completedSession.endTime,
      duration: completedSession.endTime ? 
        new Date(completedSession.endTime).getTime() - new Date(completedSession.startTime).getTime() : 
        0,
      reason,
      status: completedSession.status
    }, requestContext);

  } catch (error) {
    logger.error('Failed to end debug session', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('Failed to end debug session', { details: error.message }) :
        errors.internalServerError('Failed to end debug session'),
      requestContext
    );
  }
}
```

#### 1.3 Debug Log API Endpoint
**File:** `apps/web/src/app/api/debug/logs/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/whop/authMiddleware';
import { apiSuccess, apiError, errors } from '@/lib/apiResponse';
import { debugService } from '@/lib/debugging';
import { logger } from '@/lib/logger';
import { createRequestContext } from '@/lib/apiResponse';

// POST - Add debug log
export async function POST(request: NextRequest, context) {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId, level, message, category, data, includeSensitive } = body;

    if (!sessionId || !level || !message || !category) {
      throw errors.validationError('Session ID, level, message, and category are required');
    }

    const debugSession = debugService.getDebugSession(sessionId);
    
    if (!debugSession) {
      throw errors.notFound('Debug session not found');
    }

    // Verify user owns this session
    if (debugSession.userId !== userId) {
      throw errors.forbidden('Access denied to debug session');
    }

    debugService.addDebugLog(
      sessionId,
      level,
      message,
      category,
      data,
      includeSensitive || false
    );

    return apiSuccess({
      sessionId,
      timestamp: new Date().toISOString(),
      added: true
    }, requestContext);

  } catch (error) {
    logger.error('Failed to add debug log', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('Failed to add debug log', { details: error.message }) :
        errors.internalServerError('Failed to add debug log'),
      requestContext
    );
  }
}

// GET - Get debug logs
export async function GET(request: NextRequest, context) {
  const requestContext = createRequestContext(request);
  
  try {
    const { userId } = context.auth;
    
    if (!userId) {
      throw errors.unauthorized('User authentication required');
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!sessionId) {
      throw errors.validationError('Session ID is required');
    }

    const debugSession = debugService.getDebugSession(sessionId);
    
    if (!debugSession) {
      throw errors.notFound('Debug session not found');
    }

    // Verify user owns this session
    if (debugSession.userId !== userId) {
      throw errors.forbidden('Access denied to debug session');
    }

    // Paginate logs
    const startIndex = Math.max(0, Math.min(offset, debugSession.logs.length - 1));
    const endIndex = Math.min(startIndex + limit, debugSession.logs.length);
    const paginatedLogs = debugSession.logs.slice(startIndex, endIndex);

    return apiSuccess({
      sessionId,
      logs: paginatedLogs,
      pagination: {
        total: debugSession.logs.length,
        limit,
        offset,
        hasMore: endIndex < debugSession.logs.length
      }
    }, requestContext);

  } catch (error) {
    logger.error('Failed to get debug logs', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.auth?.userId,
      requestId: requestContext.requestId
    });

    return apiError(
      error instanceof Error ? 
        errors.internalServerError('Failed to get debug logs', { details: error.message }) :
        errors.internalServerError('Failed to get debug logs'),
      requestContext
    );
  }
}
```

### 2. Database Schema Changes

#### 2.1 Debug Tables
**File:** `infra/migrations/019_debug_tables.sql`

```sql
-- Migration: 019_debug_tables.sql
-- Description: Add debug session and logging tables

-- Debug sessions table
CREATE TABLE IF NOT EXISTS debug_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id text NOT NULL,
  request_id text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  context jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('active', 'completed', 'error')),
  created_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT debug_sessions_user_id_check CHECK (length(user_id) > 0),
  CONSTRAINT debug_sessions_session_id_check CHECK (length(session_id) > 0),
  CONSTRAINT debug_sessions_unique_session_id UNIQUE (session_id)
);

-- Debug reports table
CREATE TABLE IF NOT EXISTS debug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES debug_sessions(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration integer NOT NULL,
  context jsonb NOT NULL DEFAULT '{}',
  summary jsonb NOT NULL DEFAULT '{}',
  statistics jsonb NOT NULL DEFAULT '{}',
  logs jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT debug_reports_session_id_check CHECK (session_id IS NOT NULL),
  CONSTRAINT debug_reports_user_id_check CHECK (length(user_id) > 0),
  CONSTRAINT debug_reports_duration_check CHECK (duration >= 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_debug_sessions_user_id ON debug_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_session_id ON debug_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_status ON debug_sessions(status);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_created_at ON debug_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_debug_reports_session_id ON debug_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_debug_reports_user_id ON debug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_debug_reports_created_at ON debug_reports(created_at);

-- Row Level Security
ALTER TABLE debug_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debug_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY debug_sessions_user_policy ON debug_sessions
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY debug_sessions_admin_policy ON debug_sessions
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

CREATE POLICY debug_reports_user_policy ON debug_reports
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY debug_reports_admin_policy ON debug_reports
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

-- Comments for documentation
COMMENT ON TABLE debug_sessions IS 'Stores debugging session information for troubleshooting';
COMMENT ON TABLE debug_reports IS 'Stores completed debugging session reports with logs and statistics';
COMMENT ON COLUMN debug_sessions.context IS 'Encrypted JSON context information for the debug session';
COMMENT ON COLUMN debug_reports.logs IS 'Encrypted JSON array of debug logs for the session';
```

#### 2.2 Rollback Migration
**File:** `infra/migrations/019_rollback.sql`

```sql
-- Migration: 019_rollback.sql
-- Description: Rollback debug tables

DROP TABLE IF EXISTS debug_reports CASCADE;
DROP TABLE IF EXISTS debug_sessions CASCADE;
```

### 3. Configuration Changes Required

#### 3.1 Environment Variables
Add to `.env.development` and `.env.production`:

```bash
# Debug Settings
DEBUG_ENABLED=true
DEBUG_PERSIST_TO_DATABASE=false
DEBUG_PERSIST_TO_FILE=true
DEBUG_LOG_DIRECTORY=debug-logs
DEBUG_MAX_SESSION_DURATION_HOURS=24
DEBUG_MAX_LOG_ENTRIES=1000
DEBUG_INCLUDE_SENSITIVE_DATA=false
```

#### 3.2 Debug Configuration
**File:** `apps/web/src/lib/debugConfig.ts`

```typescript
export const debugConfig = {
  enabled: process.env.DEBUG_ENABLED === 'true',
  persistToDatabase: process.env.DEBUG_PERSIST_TO_DATABASE === 'true',
  persistToFile: process.env.DEBUG_PERSIST_TO_FILE === 'true',
  logDirectory: process.env.DEBUG_LOG_DIRECTORY || 'debug-logs',
  maxSessionDurationHours: parseInt(process.env.DEBUG_MAX_SESSION_DURATION_HOURS || '24'),
  maxLogEntries: parseInt(process.env.DEBUG_MAX_LOG_ENTRIES || '1000'),
  includeSensitiveData: process.env.DEBUG_INCLUDE_SENSITIVE_DATA === 'true',
  
  // Debug categories
  categories: {
    api_request: true,
    database_query: true,
    error: true,
    webhook_processing: true,
    job_processing: true,
    authentication: true
  },
  
  // Log levels
  logLevels: {
    debug: true,
    info: true,
    warn: true,
    error: true
  }
};
```

### 4. Dependencies That Need to Be Installed

No new dependencies required - uses existing packages:
- `pg` (already installed)
- Node.js built-in `fs` module
- Existing utilities and error handling libraries

### 5. Integration Points with Existing Code

#### 5.1 Integration with Existing Error Handling
**File:** `apps/web/src/lib/errorRecovery.ts` (extend existing)

```typescript
import { debugService } from '@/lib/debugging';

// Add debugging to error recovery
export const executeWithRecoveryAndDebugging = async (
  operation: () => Promise<any>,
  options: RecoveryOptions,
  debugSessionId?: string
): Promise<RecoveryResult<any>> => {
  if (debugSessionId) {
    debugService.addDebugLog(
      debugSessionId,
      'debug',
      'Starting recovery operation',
      'error_recovery',
      { operation: operation.name || 'anonymous', options }
    );
  }

  const result = await executeWithRecovery(operation, options);

  if (debugSessionId) {
    debugService.addDebugLog(
      debugSessionId,
      result.success ? 'info' : 'error',
      `Recovery operation ${result.success ? 'completed' : 'failed'}`,
      'error_recovery',
      { 
        success: result.success,
        attempts: result.attempts,
        duration: result.duration,
        error: result.error?.message
      }
    );
  }

  return result;
};
```

#### 5.2 Integration with API Middleware
**File:** `apps/web/src/server/middleware/debugMiddleware.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { debugService } from '@/lib/debugging';
import { logger } from '@/lib/logger';

interface DebugMiddlewareOptions {
  enabled?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  includeHeaders?: boolean;
  includeBody?: boolean;
  maxLogEntries?: number;
}

export function withDebugging(options: DebugMiddlewareOptions = {}) {
  return (handler: (req: NextRequest, res: NextResponse) => Promise<void>) => {
    return async (req: NextRequest, res: NextResponse) => {
      const {
        enabled = true,
        logLevel = 'debug',
        includeHeaders = true,
        includeBody = true,
        maxLogEntries = 100
      } = options;

      if (!enabled || !process.env.DEBUG_ENABLED) {
        return await handler(req, res);
      }

      const startTime = Date.now();
      const originalUrl = req.url;
      const originalMethod = req.method;

      // Create debug session if not exists
      const sessionId = req.headers.get('x-debug-session-id');
      if (sessionId) {
        let debugSession = debugService.getDebugSession(sessionId);
        
        if (!debugSession) {
          // Create new session
          debugSession = await debugService.startDebugSession(
            sessionId,
            {
              userAgent: req.headers.get('user-agent'),
              ipAddress: req.ip,
              requestId: req.headers.get('x-request-id')
            },
            { persistToDatabase: false }
          );
        }

        // Log request details
        debugService.addApiDebugInfo(
          sessionId,
          {
            method: originalMethod,
            url: originalUrl,
            headers: includeHeaders ? req.headers : undefined,
            body: includeBody ? await req.clone().json().catch(() => null) : null
          },
          undefined,
          Date.now() - startTime
        );
      }

      // Execute original handler
      try {
        await handler(req, res);
      } catch (error) {
        if (sessionId) {
          debugService.addErrorDebugInfo(
            sessionId,
            error instanceof Error ? error : new Error(String(error)),
            'api_middleware',
            { method: originalMethod, url: originalUrl }
          );
        }
        throw error;
      }

      // Log response details
      if (sessionId) {
        debugService.addApiDebugInfo(
          sessionId,
          {
            method: originalMethod,
            url: originalUrl,
            status: res.status,
            headers: includeHeaders ? Object.fromEntries(res.headers.entries()) : undefined,
            body: null // Response body typically not logged
          },
          Date.now() - startTime
        );
      }
    };
  };
}
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Automated Tests
**File:** `apps/web/test/debugging.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { debugService } from '@/lib/debugging';

describe('Debug Service', () => {
  const testSessionId = 'test_session_' + Date.now();
  const testUserId = 'debug_user_' + Date.now();
  
  afterEach(async () => {
    // Cleanup test sessions
    try {
      await debugService.endDebugSession(testSessionId, 'Test cleanup');
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should start debug session with context', async () => {
    const context = {
      userId: testUserId,
      requestId: 'test_req_123',
      environment: 'test'
    };

    const session = await debugService.startDebugSession(testSessionId, context);

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(testUserId);
    expect(session.context.requestId).toBe('test_req_123');
    expect(session.status).toBe('active');
  });

  it('should add debug logs to session', async () => {
    const context = { userId: testUserId };
    await debugService.startDebugSession(testSessionId, context);

    debugService.addDebugLog(
      testSessionId,
      'info',
      'Test log message',
      'test_category',
      { testData: 'test_value' }
    );

    debugService.addDebugLog(
      testSessionId,
      'error',
      'Test error message',
      'test_error',
      { error: 'Test error details' }
    );

    const session = debugService.getDebugSession(testSessionId);
    expect(session.logs).toHaveLength(2);
    expect(session.logs[0].level).toBe('info');
    expect(session.logs[0].message).toBe('Test log message');
    expect(session.logs[1].level).toBe('error');
    expect(session.logs[1].message).toBe('Test error message');
  });

  it('should sanitize sensitive data in logs', async () => {
    const context = { userId: testUserId };
    await debugService.startDebugSession(testSessionId, context);

    debugService.addDebugLog(
      testSessionId,
      'info',
      'Test with sensitive data',
      'test_sensitive',
      { 
        password: 'secret123',
        token: 'token456',
        email: 'test@example.com'
      },
      false // Don't include sensitive
    );

    const session = debugService.getDebugSession(testSessionId);
    expect(session.logs).toHaveLength(1);
    expect(session.logs[0].data.password).toBe('[REDACTED]');
    expect(session.logs[0].data.token).toBe('[REDACTED]');
    expect(session.logs[0].data.email).toBe('[REDACTED_EMAIL]');
  });

  it('should generate debug report on session end', async () => {
    const context = { userId: testUserId };
    await debugService.startDebugSession(testSessionId, context);

    // Add some test logs
    debugService.addDebugLog(testSessionId, 'info', 'Test log 1', 'test');
    debugService.addDebugLog(testSessionId, 'error', 'Test error', 'test');
    debugService.addDebugLog(testSessionId, 'warn', 'Test warning', 'test');

    const report = await debugService.endDebugSession(testSessionId, 'Test completed');
    
    expect(report).toBeDefined();
    expect(report.summary.totalLogs).toBe(3);
    expect(report.summary.logLevels.info).toBe(1);
    expect(report.summary.logLevels.error).toBe(1);
    expect(report.summary.logLevels.warn).toBe(1);
    expect(report.statistics.apiRequests.count).toBe(0);
    expect(report.statistics.errors.count).toBe(1);
  });
});
```

#### 6.2 API Endpoint Testing
**File:** `apps/web/test/api/debug.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import { POST, GET, PUT } from '@/app/api/debug/session/route';
import { POST as LOG_POST, GET as LOG_GET } from '@/app/api/debug/logs/route';

describe('Debug API', () => {
  const testUserId = 'debug_test_user';
  const mockAuth = { userId: testUserId };

  it('should start debug session', async () => {
    const request = new Request('http://localhost:3000/api/debug/session', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test_session_123',
        context: { test: true }
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'test_req_123'
      }
    });

    const response = await POST(request, { auth: mockAuth } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.sessionId).toBeDefined();
    expect(data.data.startTime).toBeDefined();
  });

  it('should get debug session', async () => {
    // First start a session
    const startRequest = new Request('http://localhost:3000/api/debug/session', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test_session_456',
        context: { test: true }
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    await POST(startRequest, { auth: mockAuth } as any);

    // Then get the session
    const getRequest = new Request('http://localhost:3000/api/debug/session?sessionId=test_session_456', {
      method: 'GET',
      headers: { 'x-request-id': 'test_req_456' }
    });

    const response = await GET(getRequest, { auth: mockAuth } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.sessionId).toBe('test_session_456');
    expect(data.data.status).toBe('active');
  });

  it('should end debug session', async () => {
    // First start a session
    const startRequest = new Request('http://localhost:3000/api/debug/session', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test_session_789',
        context: { test: true }
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    await POST(startRequest, { auth: mockAuth } as any);

    // Then end the session
    const endRequest = new Request('http://localhost:3000/api/debug/session?sessionId=test_session_789', {
      method: 'PUT',
      body: JSON.stringify({
        reason: 'Test completion'
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await PUT(endRequest, { auth: mockAuth } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('completed');
    expect(data.data.endTime).toBeDefined();
  });

  it('should add debug logs', async () => {
    // First start a session
    const startRequest = new Request('http://localhost:3000/api/debug/session', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test_session_logs',
        context: { test: true }
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    await POST(startRequest, { auth: mockAuth } as any);

    // Add debug logs
    const logRequest = new Request('http://localhost:3000/api/debug/logs', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test_session_logs',
        level: 'info',
        message: 'Test debug log',
        category: 'test_api',
        data: { test: 'value' }
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await LOG_POST(logRequest, { auth: mockAuth } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.added).toBe(true);
  });

  it('should get debug logs', async () => {
    // First start a session and add logs
    const startRequest = new Request('http://localhost:3000/api/debug/session', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test_session_get_logs',
        context: { test: true }
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    await POST(startRequest, { auth: mockAuth } as any);

    // Add some logs
    await LOG_POST(new Request('http://localhost:3000/api/debug/logs', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test_session_get_logs',
        level: 'info',
        message: 'Test log 1',
        category: 'test'
      }),
      headers: { 'Content-Type': 'application/json' }
    }, { auth: mockAuth } as any);

    await LOG_POST(new Request('http://localhost:3000/api/debug/logs', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test_session_get_logs',
        level: 'error',
        message: 'Test error',
        category: 'test'
      }),
      headers: { 'Content-Type': 'application/json' }
    }, { auth: mockAuth } as any);

    // Get logs
    const getRequest = new Request('http://localhost:3000/api/debug/logs?sessionId=test_session_get_logs&limit=10', {
      method: 'GET',
      headers: { 'x-request-id': 'test_req_get_logs' }
    });

    const response = await LOG_GET(getRequest, { auth: mockAuth } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.logs).toHaveLength(2);
    expect(data.data.pagination.total).toBe(2);
  });
});
```

#### 6.3 Manual Verification Commands

```bash
# Start debug session
curl -X POST http://localhost:3000/api/debug/session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "debug_test_123",
    "context": {
      "feature": "payment_recovery",
      "environment": "development"
    },
    "options": {
      "persistToFile": true,
      "includeSensitiveData": false
    }
  }' \
  | jq .

# Add debug log
curl -X POST http://localhost:3000/api/debug/logs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "debug_test_123",
    "level": "info",
    "message": "API request completed successfully",
    "category": "api_request",
    "data": {
      "endpoint": "/api/cases",
      "duration": 150,
      "status": 200
    }
  }' \
  | jq .

# Get debug session
curl -X GET "http://localhost:3000/api/debug/session?sessionId=debug_test_123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  | jq .

# Get debug logs
curl -X GET "http://localhost:3000/api/debug/logs?sessionId=debug_test_123&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  | jq .

# End debug session
curl -X PUT "http://localhost:3000/api/debug/session?sessionId=debug_test_123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Debugging completed"
  }' \
  | jq .

# Check debug logs directory
ls -la debug-logs/

# Check debug report files
ls -la debug-logs/debug-report-*.json
```

#### 6.4 Integration Test Script
**File:** `scripts/test-debugging.js`

```bash
#!/bin/bash
# Debugging Integration Test

echo "🧪 Testing Debugging Implementation..."

# 1. Start debug session
echo "🔍 Starting debug session..."
SESSION_ID="debug_test_$(date +%s)"
curl -X POST http://localhost:3000/api/debug/session \
  -H "Authorization: Bearer TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"context\": {
      \"test\": true,
      \"environment\": \"test\"
    },
    \"options\": {
      \"persistToFile\": true
    }
  }" \
  | jq .data.sessionId

# 2. Simulate API request with debugging
echo "📡 Simulating API request with debugging..."
curl -X GET http://localhost:3000/api/dashboard/cases \
  -H "Authorization: Bearer TEST_TOKEN" \
  -H "x-debug-session-id: $SESSION_ID" \
  > /dev/null

# 3. Add debug log
echo "📝 Adding debug log..."
curl -X POST http://localhost:3000/api/debug/logs \
  -H "Authorization: Bearer TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"level\": \"info\",
    \"message\": \"API request simulated\",
    \"category\": \"api_request\",
    \"data\": {
      \"endpoint\": \"/api/dashboard/cases\",
      \"method\": \"GET\"
    }
  }" \
  | jq .data.added

# 4. Add error log
echo "❌ Adding error log..."
curl -X POST http://localhost:3000/api/debug/logs \
  -H "Authorization: Bearer TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"level\": \"error\",
    \"message\": \"Simulated error for testing\",
    \"category\": \"test\",
    \"data\": {
      \"errorType\": \"simulation\",
      \"expected\": false
    }
  }" \
  | jq .data.added

# 5. End debug session
echo "🏁 Ending debug session..."
curl -X PUT "http://localhost:3000/api/debug/session?sessionId=$SESSION_ID" \
  -H "Authorization: Bearer TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"reason\": \"Test completed\"
  }" \
  | jq .data.status

# 6. Verify debug report
echo "📊 Verifying debug report..."
if [ -f "debug-logs/debug-report-$SESSION_ID-*.json" ]; then
  REPORT_FILE=$(ls debug-logs/debug-report-$SESSION_ID-*.json | head -n 1)
  echo "Debug report saved to: $REPORT_FILE"
  
  # Check report content
  LOG_COUNT=$(jq '.summary.totalLogs' "$REPORT_FILE")
  ERROR_COUNT=$(jq '.statistics.errors.count' "$REPORT_FILE")
  
  echo "Report contains $LOG_COUNT logs with $ERROR_COUNT errors"
else
  echo "❌ Debug report file not found"
fi

echo "✅ Debugging testing completed!"
```

---

[Continue with remaining violations...]
---

## Medium Severity Violation #9: Missing Contribution Guidelines

### 1. Specific Code Implementation Details

#### 1.1 Contribution Guidelines Documentation
**File:** `CONTRIBUTING.md` (new file)

```markdown
# Contributing to Churn Saver

Thank you for your interest in contributing to Churn Saver! This document provides guidelines and procedures for contributing to the project.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation Standards](#documentation-standards)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Community Resources](#community-resources)

## Code of Conduct

### Our Pledge
We are committed to providing a friendly, safe, and welcoming environment for all contributors, regardless of:
- Gender, gender identity, or expression
- Sexual orientation
- Disability
- Physical appearance
- Body size
- Race
- Ethnicity
- Age
- Religion
- Nationality
- Other non-biasing characteristics

### Expected Behavior
- Use welcoming and inclusive language
- Respect different viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior
- Sexual language or imagery
- Trolling, insulting/derogatory comments
- Personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Any other conduct which could reasonably be considered inappropriate in a professional setting

### Reporting Issues
If you experience or witness unacceptable behavior, please contact:
- **Email**: conduct@company.com
- **Private Slack Message**: @moderators
- **GitHub Issues**: @moderators in any repository

## Getting Started

### Prerequisites
- **Node.js**: 18.0.0 or higher
- **pnpm**: 8.0.0 or higher
- **Git**: 2.30.0 or higher
- **PostgreSQL**: 14.0 or higher (for local development)

### Initial Setup
```bash
# 1. Fork the repository
# Click "Fork" button on GitHub repository page

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/churn-saver.git
cd churn-saver

# 3. Add upstream remote
git remote add upstream https://github.com/original-org/churn-saver.git

# 4. Install dependencies
pnpm install

# 5. Set up development environment
cp apps/web/.env.development.example apps/web/.env.local
# Edit .env.local with your configuration

# 6. Verify setup
pnpm test
pnpm dev
```

### Development Environment
```bash
# Start development server
pnpm dev

# Run tests in watch mode
pnpm test:watch

# Check code quality
pnpm lint
pnpm type-check
```

## Development Workflow

### 1. Create Feature Branch
```bash
# Sync with upstream
git fetch upstream
git checkout main
git merge upstream/main

# Create feature branch
git checkout -b feature/your-feature-name
```

### 2. Development Process
```bash
# Make changes
# ...development work...

# Run tests frequently
pnpm test

# Check code quality
pnpm lint
pnpm format

# Commit changes with conventional commits
git add .
git commit -m "feat: add new feature description"
```

### 3. Conventional Commits
We use [Conventional Commits](https://www.conventionalcommits.org/) specification:

#### Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependency updates, etc.)
- `perf`: Performance improvements
- `ci`: CI/CD changes

#### Examples
```bash
feat(auth): add JWT token refresh mechanism

Add automatic token refresh 30 seconds before expiration
to prevent authentication failures during long-running operations.

Closes #123
```

```bash
fix(api): handle null values in case creation

Fix null reference error when creating recovery cases
with missing membership data.

Closes #456
```

### 4. Keep Branch Updated
```bash
# Regularly sync with upstream
git fetch upstream
git merge upstream/main

# Resolve any conflicts
# ...resolve conflicts...

# Continue development
```

## Coding Standards

### TypeScript Guidelines
- Use TypeScript for all new code
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Use enums for constants
- Avoid `// @ts-ignore` unless absolutely necessary

#### Example
```typescript
// Good
interface RecoveryCase {
  id: string;
  status: 'open' | 'recovered' | 'closed';
  createdAt: Date;
}

// Bad
const caseData: any = {
  id: '123',
  status: 'open'
};
```

### React Component Guidelines
- Use functional components with hooks
- Follow existing component patterns
- Use proper TypeScript props
- Add JSDoc comments for complex components
- Keep components small and focused

#### Example
```typescript
// Good
interface CasesTableProps {
  cases: RecoveryCase[];
  onCaseAction: (caseId: string, action: string) => void;
  loading?: boolean;
}

export const CasesTable: React.FC<CasesTableProps> = ({
  cases,
  onCaseAction,
  loading = false
}) => {
  // Component implementation
};

// Bad
export default function CasesTable(props: any) {
  // Component implementation with any types
}
```

### Database Guidelines
- Use parameterized queries to prevent SQL injection
- Follow existing migration naming convention
- Add proper indexes for performance
- Use transactions for multi-table operations
- Add comments for complex queries

#### Example
```typescript
// Good
const result = await sql.query(`
  SELECT * FROM recovery_cases 
  WHERE user_id = $1 AND status = $2
  ORDER BY created_at DESC
  LIMIT $3
`, [userId, status, limit]);

// Bad
const result = await sql.query(`
  SELECT * FROM recovery_cases 
  WHERE user_id = '${userId}' AND status = '${status}'
  ORDER BY created_at DESC
  LIMIT ${limit}
`);
```

### Error Handling Guidelines
- Use custom error classes for different error types
- Include proper error context and metadata
- Log errors with appropriate severity
- Handle errors gracefully in user-facing code
- Use try-catch blocks for async operations

#### Example
```typescript
// Good
try {
  const result = await processPayment(paymentData);
  return result;
} catch (error) {
  logger.error('Payment processing failed', {
    paymentId: paymentData.id,
    error: error.message
  });
  
  throw new AppError(
    'Payment processing failed',
    ErrorCode.PAYMENT_ERROR,
    ErrorCategory.BUSINESS_LOGIC,
    ErrorSeverity.MEDIUM,
    500,
    true,
    { paymentId: paymentData.id }
  );
}

// Bad
try {
  const result = await processPayment(paymentData);
  return result;
} catch (error) {
  throw error; // Re-throw without context
}
```

## Testing Guidelines

### Test Structure
```
apps/web/test/
├── unit/                 # Unit tests
├── integration/          # Integration tests
├── e2e/                # End-to-end tests
├── fixtures/            # Test data and mocks
└── utils/               # Test utilities
```

### Unit Testing
- Test individual functions and components in isolation
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Test both happy path and error cases

#### Example
```typescript
describe('Case Service', () => {
  describe('createCase', () => {
    it('should create a new case with valid data', async () => {
      // Arrange
      const caseData = {
        id: 'test_case_123',
        userId: 'user_123',
        companyId: 'company_123',
        membershipId: 'membership_123',
        firstFailureAt: new Date().toISOString()
      };

      // Act
      const result = await createCase(caseData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(caseData.id);
      expect(result.status).toBe('open');
    });

    it('should throw error for invalid case data', async () => {
      // Arrange
      const invalidCaseData = {
        // Missing required fields
        userId: 'user_123'
      };

      // Act & Assert
      await expect(createCase(invalidCaseData)).rejects.toThrow();
    });
  });
});
```

### Integration Testing
- Test interaction between multiple components/services
- Use test database with known state
- Test API endpoints with authentication
- Verify database transactions
- Test error recovery scenarios

### End-to-End Testing
- Test complete user workflows
- Use Playwright or Cypress
- Test in multiple browsers
- Include accessibility testing
- Test performance critical paths

### Test Coverage
- Aim for 80%+ code coverage
- Focus on business logic and error handling
- Add coverage reports to CI/CD
- Review coverage gaps regularly

```bash
# Run tests with coverage
pnpm test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

## Documentation Standards

### Code Documentation
- Add JSDoc comments for all public functions
- Include parameter types and return types
- Add usage examples for complex functions
- Document error conditions
- Keep comments up-to-date with code changes

#### Example
```typescript
/**
 * Creates a new recovery case
 * 
 * @param {CreateCaseRequest} caseData - Case creation data
 * @param {string} caseData.id - Unique case identifier
 * @param {string} caseData.userId - User ID who owns the case
 * @param {string} caseData.membershipId - Membership ID that failed
 * @param {string} caseData.firstFailureAt - Timestamp of first payment failure
 * @returns {Promise<RecoveryCase>} Created recovery case
 * @throws {AppError} When case data is invalid or case already exists
 * 
 * @example
 * ```typescript
 * const caseData = {
 *   id: 'case_123',
 *   userId: 'user_123',
 *   membershipId: 'membership_123',
 *   firstFailureAt: '2025-10-25T10:00:00.000Z'
 * };
 * 
 * const recoveryCase = await createCase(caseData);
 * console.log(recoveryCase.status); // 'open'
 * ```
 */
export async function createCase(caseData: CreateCaseRequest): Promise<RecoveryCase> {
  // Implementation
}
```

### API Documentation
- Document all endpoints with method, path, and parameters
- Include request/response examples
- Document authentication requirements
- Include error response examples
- Keep API docs in sync with code changes

### README Updates
- Update README.md for significant features
- Include setup instructions for new dependencies
- Add troubleshooting for common issues
- Update version numbers and changelog

## Pull Request Process

### 1. Before Submitting PR
```bash
# 1. Run full test suite
pnpm test

# 2. Check code quality
pnpm lint
pnpm type-check

# 3. Format code
pnpm format

# 4. Check for security issues
pnpm audit

# 5. Update documentation
# Add relevant docs for new features
```

### 2. Pull Request Requirements
- **Descriptive Title**: Use conventional commit format
- **Clear Description**: Explain what and why
- **Testing Instructions**: How to test the changes
- **Screenshots**: For UI changes
- **Links to Issues**: Reference any related issues
- **Breaking Changes**: Clearly document any breaking changes

### 3. Pull Request Template
```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Cross-browser testing (if applicable)

## Checklist
- [ ] Code follows project standards
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] No security vulnerabilities
- [ ] No breaking changes (or documented)

## Related Issues
Closes #123, #456
```

### 4. Code Review Process
- **Assign Reviewers**: At least one maintainer review
- **Automated Checks**: All CI/CD checks must pass
- **Review Timeline**: Respond to reviews within 48 hours
- **Address Feedback**: Make requested changes or explain reasoning
- **Approval**: At least one maintainer approval required

### 5. Merging Process
- **Linear History**: Maintain clean, linear git history
- **Squash Commits**: Squash feature branches before merge
- **Delete Branch**: Delete feature branch after merge
- **Release Notes**: Update release notes for significant changes

## Release Process

### 1. Version Management
- Follow [Semantic Versioning](https://semver.org/)
- Update package.json version
- Create git tag for releases
- Update CHANGELOG.md

### 2. Release Types
- **Major**: Breaking changes (X.0.0)
- **Minor**: New features (X.Y.0)
- **Patch**: Bug fixes (X.Y.Z)

### 3. Release Checklist
```bash
# 1. Update version
npm version patch  # or minor/major

# 2. Update changelog
# Edit CHANGELOG.md

# 3. Run full test suite
pnpm test

# 4. Build application
pnpm build

# 5. Create release
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3

# 6. Deploy (handled by CI/CD)
```

## Community Resources

### Communication Channels
- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For general questions and discussions
- **Slack**: #churn-saver-contributors for real-time discussion
- **Email**: contributors@company.com for private questions

### Getting Help
- **New Contributors**: Start with good first issues
- **Documentation**: Ask questions in GitHub Discussions
- **Code Review**: Request reviews from maintainers
- **Mentorship**: Available for new contributors

### Recognition
- **Contributors List**: Recognized in README.md
- **Release Notes**: Thank contributors in release notes
- **Community Spotlight**: Highlight significant contributions
- **Swag**: Available for active contributors

## Security

### Security Reporting
- **Private Disclosure**: Report security issues privately
- **Contact**: security@company.com
- **Response Time**: Security issues addressed within 48 hours
- **Disclosure**: Security issues disclosed after fix

### Security Guidelines
- Never commit sensitive data
- Use environment variables for secrets
- Follow secure coding practices
- Report security vulnerabilities
- Participate in security training

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).

## Questions?

- Check existing [GitHub Issues](https://github.com/your-org/churn-saver/issues)
- Start a [GitHub Discussion](https://github.com/your-org/churn-saver/discussions)
- Contact maintainers at maintainers@company.com

Thank you for contributing to Churn Saver! 🚀
```

#### 1.2 GitHub Issue Templates
**File:** `.github/ISSUE_TEMPLATE/bug_report.md`

```markdown
---
name: Bug Report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''

---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Actual behavior**
A clear and concise description of what actually happened.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment**
- OS: [e.g. macOS 13.0, Ubuntu 20.04]
- Browser: [e.g. Chrome 91, Safari 14]
- Node.js version: [e.g. 18.0.0]
- App version: [e.g. 1.2.3]

**Additional Context**
Add any other context about the problem here.

**Logs**
If applicable, add relevant log files or error messages.
```

**File:** `.github/ISSUE_TEMPLATE/feature_request.md`

```markdown
---
name: Feature Request
about: Suggest an idea for this project
title: '[FEATURE] '
labels: enhancement
assignees: ''

---

**Is your feature request related to a problem?**
A clear and concise description of what the problem is. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Additional Context**
Add any other context or screenshots about the feature request here.
```

#### 1.3 Pull Request Template
**File:** `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## Description
Please include a summary of the change and which issue is fixed. Please also include relevant motivation and context. List any dependencies that are required for this change.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass locally
- [ ] Integration tests pass locally
- [ ] Manual testing completed
- [ ] Performance impact considered

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published in downstream modules
```

### 2. Database Schema Changes

No database changes required for contribution guidelines.

### 3. Configuration Changes Required

#### 3.1 GitHub Workflows
**File:** `.github/workflows/contributor-check.yml` (new file)

```yaml
name: Contributor Check

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  check-contributor:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: |
          cd apps/web
          npm ci

      - name: Check if first-time contributor
        id: check-contributor
        run: |
          contributor=$(gh api user --login "${{ github.actor }}" | jq -r '.login // empty')
          if [[ -z "$contributor" ]]; then
            echo "is_first_contributor=true" >> $GITHUB_OUTPUT
          else
            echo "is_first_contributor=false" >> $GITHUB_OUTPUT
          fi
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Welcome first-time contributor
        if: steps.check-contributor.outputs.is_first_contributor == 'true'
        uses: actions/github-script@v6
        with:
          script: |
            const issue_number = context.issue.number;
            const actor = context.actor;
            
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issue_number,
              body: `🎉 Welcome @${actor}! Thank you for your first contribution to Churn Saver. We appreciate your effort and will review your PR shortly. A maintainer will be assigned to review your changes.`
            });

      - name: Add welcome label
        if: steps.check-contributor.outputs.is_first_contributor == 'true'
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              labels: ['first-time-contributor']
            });
```

#### 3.2 Dependabot Configuration
**File:** `.github/dependabot.yml` (new file)

```yaml
version: 2
updates:
  # Enable version updates for npm
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
      time: "09:00"
    open-pull-requests-limit: 10
    reviewers:
      - "dependabot[bot]"
    assignees:
      - "dependabot[bot]"
    commit-message:
      prefix: "chore"
      include: "scope"
    labels:
      - "dependencies"
      - "npm"

  # Enable version updates for GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "daily"
      time: "09:00"
    open-pull-requests-limit: 5
    reviewers:
      - "dependabot[bot]"
    assignees:
      - "dependabot[bot]"
    commit-message:
      prefix: "chore"
      labels:
      - "dependencies"
      - "github-actions"
```

### 4. Dependencies That Need to Be Installed

No new dependencies required - uses existing GitHub workflows.

### 5. Integration Points with Existing Code

#### 5.1 Integration with Existing Documentation
**File:** `README.md` (extend existing)

```markdown
## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for detailed information on how to contribute to this project.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

For detailed guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).
```

#### 5.2 Integration with Package.json
**File:** `apps/web/package.json` (extend existing)

```json
{
  "scripts": {
    "dev": "whop-proxy --command 'next dev --turbopack'",
    "build": "next build",
    "start": "next start",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "test": "node test/auth.test.js && node test/webhooks.test.js && node test/protected-api.test.js && node test/dashboard.test.js",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage --watchAll=false",
    "contributor:check": "node scripts/check-contributor.js",
    "pre-commit": "lint-staged && npm run test:unit",
    "commit": "git-cz",
    "release": "semantic-release"
  },
  "husky": {
    "hooks": {
      "pre-commit": "npm run pre-commit",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "config": {
    "commitizen": {
      "path": "./node_modules/cz-conventional-changelog"
    }
  },
  "devDependencies": {
    "@commitlint/cli": "^17.0.0",
    "@commitlint/config-conventional": "^17.0.0",
    "commitizen": "^4.3.0",
    "cz-conventional-changelog": "^3.3.0",
    "husky": "^8.0.0",
    "lint-staged": "^13.0.0",
    "semantic-release": "^19.0.0"
  }
}
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Automated Tests
**File:** `apps/web/test/contributing.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';

describe('Contribution Guidelines', () => {
  it('should have required contribution files', () => {
    const fs = require('fs');
    
    // Check for required files
    expect(fs.existsSync('CONTRIBUTING.md')).toBe(true);
    expect(fs.existsSync('.github/ISSUE_TEMPLATE/bug_report.md')).toBe(true);
    expect(fs.existsSync('.github/ISSUE_TEMPLATE/feature_request.md')).toBe(true);
    expect(fs.existsSync('.github/PULL_REQUEST_TEMPLATE.md')).toBe(true);
    expect(fs.existsSync('.github/workflows/contributor-check.yml')).toBe(true);
    expect(fs.existsSync('.github/dependabot.yml')).toBe(true);
  });

  it('should have proper package.json scripts for contributors', () => {
    const packageJson = require('../../package.json');
    
    // Check for contributor scripts
    expect(packageJson.scripts['contributor:check']).toBeDefined();
    expect(packageJson.scripts['pre-commit']).toBeDefined();
    expect(packageJson.scripts['commit']).toBeDefined();
    expect(packageJson.scripts['release']).toBeDefined();
  });

  it('should have proper commitizen configuration', () => {
    const packageJson = require('../../package.json');
    
    // Check for commitizen config
    expect(packageJson.config.commitizen).toBeDefined();
    expect(packageJson.config.commitizen.path).toContain('cz-conventional-changelog');
  });

  it('should have proper husky configuration', () => {
    const packageJson = require('../../package.json');
    
    // Check for husky config
    expect(packageJson.husky).toBeDefined();
    expect(packageJson.husky.hooks['pre-commit']).toBeDefined();
    expect(packageJson.husky.hooks['commit-msg']).toBeDefined();
  });
});
```

#### 6.2 Integration Test Script
**File:** `scripts/test-contributing-setup.js`

```bash
#!/bin/bash
# Contribution Guidelines Test

echo "🧪 Testing Contribution Guidelines Setup..."

# 1. Check for required files
echo "📄 Checking required contribution files..."
REQUIRED_FILES=(
  "CONTRIBUTING.md"
  ".github/ISSUE_TEMPLATE/bug_report.md"
  ".github/ISSUE_TEMPLATE/feature_request.md"
  ".github/PULL_REQUEST_TEMPLATE.md"
  ".github/workflows/contributor-check.yml"
  ".github/dependabot.yml"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing required file: $file"
    exit 1
  fi
  echo "✅ Found: $file"
done

# 2. Check package.json configuration
echo "📦 Checking package.json configuration..."
if ! grep -q "contributor:check" apps/web/package.json; then
  echo "❌ Missing contributor:check script in package.json"
  exit 1
fi
echo "✅ Found contributor:check script"

if ! grep -q "pre-commit" apps/web/package.json; then
  echo "❌ Missing pre-commit script in package.json"
  exit 1
fi
echo "✅ Found pre-commit script"

if ! grep -q "commitizen" apps/web/package.json; then
  echo "❌ Missing commitizen configuration in package.json"
  exit 1
fi
echo "✅ Found commitizen configuration"

# 3. Check GitHub workflows
echo "🔄 Checking GitHub workflows..."
if [ ! -f ".github/workflows/contributor-check.yml" ]; then
  echo "❌ Missing contributor-check workflow"
  exit 1
fi
echo "✅ Found contributor-check workflow"

# 4. Test commit message validation
echo "📝 Testing commit message validation..."
# Create test commit with conventional format
git add .
git commit -m "test: commit message for testing" --no-verify

# Check if commit message passes validation
if npx commitlint --from HEAD~1 --to HEAD --verbose; then
  echo "✅ Commit message validation works"
else
  echo "❌ Commit message validation failed"
  git reset --soft HEAD~1
  exit 1
fi

git reset --soft HEAD~1

# 5. Test pre-commit hooks
echo "🪝 Testing pre-commit hooks..."
# Create test file to trigger pre-commit
echo "test" > test-contributing.txt
git add test-contributing.txt

# Run pre-commit hook
if npx husky run pre-commit; then
  echo "✅ Pre-commit hooks work"
else
  echo "❌ Pre-commit hooks failed"
  git reset HEAD test-contributing.txt
  exit 1
fi

git reset HEAD test-contributing.txt

echo "✅ Contribution guidelines setup test passed!"
```

#### 6.3 Manual Verification Commands

```bash
# Test contribution guidelines setup
npm run contributor:check

# Test commit message validation
echo "feat: test feature" | npx commitlint --verbose

# Test pre-commit hooks
git add .
git commit -m "test: validation test" --no-verify
npx husky run pre-commit
git reset --soft HEAD~1

# Test semantic release
npx semantic-release --dry-run

# Verify GitHub workflows
gh workflow list
```

---

## Medium Severity Violation #11: Incomplete Job Queue Error Handling

### 1. Specific Code Implementation Details

#### 1.1 Enhanced Job Queue Service
**File:** `apps/web/src/server/services/jobQueue.ts` (extend existing)

```typescript
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { executeWithRecovery } from '@/lib/errorRecovery';
import { CircuitBreaker } from '@/lib/resilience';

export interface Job {
  id: string;
  type: string;
  payload: any;
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  createdAt: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  metadata?: any;
}

export interface JobResult {
  success: boolean;
  jobId: string;
  result?: any;
  error?: Error;
  duration?: number;
  retryable?: boolean;
}

export interface JobProcessor {
  type: string;
  handler: (job: Job) => Promise<any>;
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
    circuitBreaker?: boolean;
  };
}

class JobQueueService {
  private processors: Map<string, JobProcessor> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private activeJobs: Map<string, Job> = new Map();
  private readonly maxConcurrentJobs = 10;

  /**
   * Register a job processor
   * @param {JobProcessor} processor - Job processor configuration
   */
  registerProcessor(processor: JobProcessor): void {
    this.processors.set(processor.type, processor);
    
    // Create circuit breaker if enabled
    if (processor.options?.circuitBreaker) {
      this.circuitBreakers.set(processor.type, new CircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringEnabled: true
      }));
    }
    
    logger.info('Job processor registered', {
      type: processor.type,
      maxRetries: processor.options?.maxRetries || 3,
      circuitBreaker: !!processor.options?.circuitBreaker
    });
  }

  /**
   * Add job to queue
   * @param {string} type - Job type
   * @param {any} payload - Job payload
   * @param {number} priority - Job priority (lower = higher priority)
   * @param {string} scheduledAt - Optional scheduled time
   * @returns {Promise<string>} Job ID
   */
  async addJob(
    type: string,
    payload: any,
    priority = 5,
    scheduledAt?: string
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await sql.query(`
        INSERT INTO job_queue (
          id, job_type, payload, priority, status, 
          attempts, max_attempts, created_at, scheduled_at
        ) VALUES ($1, $2, $3, $4, 'pending', 0, $5, NOW(), $6)
      `, [
        jobId,
        type,
        JSON.stringify(payload),
        priority,
        this.getMaxRetriesForType(type),
        scheduledAt || null
      ]);

      logger.info('Job added to queue', {
        jobId,
        type,
        priority,
        scheduledAt
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to add job to queue', {
        jobId,
        type,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Process jobs from queue
   * @param {number} batchSize - Number of jobs to process
   * @returns {Promise<JobResult[]>} Processing results
   */
  async processJobs(batchSize = 5): Promise<JobResult[]> {
    const results: JobResult[] = [];
    
    try {
      // Get pending jobs
      const jobs = await this.getPendingJobs(batchSize);
      
      if (jobs.length === 0) {
        return results;
      }

      logger.info('Processing jobs', {
        count: jobs.length,
        jobIds: jobs.map(job => job.id)
      });

      // Process jobs concurrently with limit
      const processingPromises = jobs.map(job => 
        this.processJobWithConcurrencyControl(job)
      );

      const processingResults = await Promise.allSettled(processingPromises);
      
      // Collect results
      for (let i = 0; i < processingResults.length; i++) {
        const result = processingResults[i];
        const job = jobs[i];
        
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            jobId: job.id,
            error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
            retryable: true
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Job processing failed', {
        batchSize,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  /**
   * Process single job with error handling and recovery
   * @param {Job} job - Job to process
   * @returns {Promise<JobResult>} Processing result
   */
  private async processJobWithConcurrencyControl(job: Job): Promise<JobResult> {
    // Check concurrency limit
    if (this.activeJobs.size >= this.maxConcurrentJobs) {
      logger.warn('Job queue concurrency limit reached', {
        jobId: job.id,
        activeJobs: this.activeJobs.size,
        maxConcurrentJobs: this.maxConcurrentJobs
      });
      
      return {
        success: false,
        jobId: job.id,
        error: new Error('Concurrency limit reached'),
        retryable: true
      };
    }

    // Add to active jobs
    this.activeJobs.set(job.id, job);

    try {
      const processor = this.processors.get(job.type);
      if (!processor) {
        throw new Error(`No processor registered for job type: ${job.type}`);
      }

      // Update job status to processing
      await this.updateJobStatus(job.id, 'processing', {
        startedAt: new Date().toISOString()
      });

      const startTime = Date.now();
      let result: any;
      let error: Error | null = null;

      try {
        // Process job with recovery
        const recoveryOptions = {
          service: 'job_queue',
          maxRetries: this.getMaxRetriesForType(job.type),
          retryDelay: processor.options?.retryDelay || 2000,
          timeout: processor.options?.timeout || 30000,
          circuitBreaker: processor.options?.circuitBreaker || false,
          jobData: job
        };

        if (processor.options?.circuitBreaker) {
          const circuitBreaker = this.circuitBreakers.get(job.type);
          if (circuitBreaker) {
            result = await circuitBreaker.execute(() => processor.handler(job));
          } else {
            result = await executeWithRecovery(() => processor.handler(job), recoveryOptions);
          }
        } else {
          result = await executeWithRecovery(() => processor.handler(job), recoveryOptions);
        }
      } catch (processingError) {
        error = processingError instanceof Error ? processingError : new Error(String(processingError));
        logger.error('Job processing error', {
          jobId: job.id,
          type: job.type,
          error: error.message,
          attempts: job.attempts + 1
        });
      }

      const duration = Date.now() - startTime;

      // Determine if job should be retried
      const shouldRetry = error && job.attempts < job.maxAttempts;
      const retryable = shouldRetry && this.isRetryableError(error);

      if (error && shouldRetry) {
        // Update job with error and increment attempts
        await this.updateJobStatus(job.id, 'failed', {
          error: error.message,
          attempts: job.attempts + 1,
          completedAt: new Date().toISOString()
        });

        // Schedule retry if applicable
        if (retryable) {
          await this.scheduleRetry(job, error);
        }

        return {
          success: false,
          jobId: job.id,
          error,
          duration,
          retryable
        };
      } else if (error) {
        // Move to dead letter queue if max attempts reached
        if (job.attempts >= job.maxAttempts) {
          await this.moveToDeadLetterQueue(job, error);
        }

        await this.updateJobStatus(job.id, 'failed', {
          error: error.message,
          attempts: job.attempts + 1,
          completedAt: new Date().toISOString()
        });

        return {
          success: false,
          jobId: job.id,
          error,
          duration,
          retryable: false
        };
      } else {
        // Job completed successfully
        await this.updateJobStatus(job.id, 'completed', {
          result: JSON.stringify(result),
          completedAt: new Date().toISOString()
        });

        return {
          success: true,
          jobId: job.id,
          result,
          duration
        };
      }
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Get pending jobs from database
   * @param {number} limit - Maximum number of jobs to retrieve
   * @returns {Promise<Job[]>} Array of pending jobs
   */
  private async getPendingJobs(limit: number): Promise<Job[]> {
    try {
      const result = await sql.query(`
        UPDATE job_queue 
        SET status = 'processing', started_at = NOW()
        WHERE id IN (
          SELECT id FROM job_queue 
          WHERE status = 'pending' 
          AND (scheduled_at IS NULL OR scheduled_at <= NOW())
          ORDER BY priority ASC, created_at ASC
          LIMIT $1
        )
        RETURNING id, job_type, payload, priority, status, attempts, 
                  max_attempts, created_at, scheduled_at, started_at, error, metadata
      `, [limit]);

      return result.rows.map(row => ({
        ...row,
        payload: JSON.parse(row.payload),
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      }));
    } catch (error) {
      logger.error('Failed to get pending jobs', {
        limit,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update job status in database
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {any} updates - Additional fields to update
   */
  private async updateJobStatus(
    jobId: string,
    status: string,
    updates: any = {}
  ): Promise<void> {
    try {
      const updateFields = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');

      await sql.query(`
        UPDATE job_queue 
        SET status = $1, ${updateFields}
        WHERE id = $2
      `, [status, ...Object.values(updates), jobId]);
    } catch (error) {
      logger.error('Failed to update job status', {
        jobId,
        status,
        updates,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Schedule job retry with exponential backoff
   * @param {Job} job - Job to retry
   * @param {Error} error - Error that caused retry
   */
  private async scheduleRetry(job: Job, error: Error): Promise<void> {
    try {
      const retryDelay = this.calculateRetryDelay(job.attempts);
      const scheduledAt = new Date(Date.now() + retryDelay).toISOString();

      await sql.query(`
        UPDATE job_queue 
        SET status = 'pending', scheduled_at = $1, error = $2
        WHERE id = $3
      `, [scheduledAt, error.message, job.id]);

      logger.info('Job retry scheduled', {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        retryDelay,
        scheduledAt
      });
    } catch (scheduleError) {
      logger.error('Failed to schedule job retry', {
        jobId: job.id,
        error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError)
      });
    }
  }

  /**
   * Move job to dead letter queue
   * @param {Job} job - Job to move
   * @param {Error} error - Error that caused dead letter
   */
  private async moveToDeadLetterQueue(job: Job, error: Error): Promise<void> {
    try {
      await sql.query(`
        INSERT INTO job_queue_dead_letter (
          id, original_job_id, job_type, payload, error, failed_at, 
          retry_count, max_retries, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, NOW(), $5, $6, NOW()
        )
      `, [
        job.id,
        job.type,
        JSON.stringify(job.payload),
        error.message,
        job.attempts,
        job.maxAttempts
      ]);

      // Mark original job as moved to dead letter
      await this.updateJobStatus(job.id, 'dead_letter', {
        error: error.message,
        completedAt: new Date().toISOString()
      });

      logger.warn('Job moved to dead letter queue', {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        error: error.message
      });
    } catch (dlqError) {
      logger.error('Failed to move job to dead letter queue', {
        jobId: job.id,
        error: dlqError instanceof Error ? dlqError.message : String(dlqError)
      });
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} attempt - Current attempt number
   * @returns {number} Delay in milliseconds
   */
  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 2^attempt * base_delay (max 5 minutes)
    const baseDelay = 1000; // 1 second
    const maxDelay = 300000; // 5 minutes
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return delay + jitter;
  }

  /**
   * Get max retries for job type
   * @param {string} type - Job type
   * @returns {number} Maximum retry attempts
   */
  private getMaxRetriesForType(type: string): number {
    const processor = this.processors.get(type);
    return processor?.options?.maxRetries || 3;
  }

  /**
   * Determine if error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const nonRetryableErrors = [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'ForbiddenError'
    ];

    return !nonRetryableErrors.some(errorType => 
      error.name === errorType || error.message.includes(errorType)
    );
  }

  /**
   * Get job queue statistics
   * @returns {Promise<any>} Queue statistics
   */
  async getQueueStatistics(): Promise<any> {
    try {
      const result = await sql.query(`
        SELECT 
          job_type,
          status,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) as avg_duration_ms
        FROM job_queue 
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY job_type, status
        ORDER BY job_type, status
      `);

      return {
        last24Hours: result.rows,
        activeJobs: this.activeJobs.size,
        maxConcurrentJobs: this.maxConcurrentJobs
      };
    } catch (error) {
      logger.error('Failed to get queue statistics', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Clean up old completed jobs
   * @param {number} daysOld - Age threshold in days
   * @returns {Promise<number>} Number of cleaned jobs
   */
  async cleanupOldJobs(daysOld = 30): Promise<number> {
    try {
      const result = await sql.query(`
        DELETE FROM job_queue 
        WHERE status IN ('completed', 'dead_letter') 
        AND completed_at < NOW() - INTERVAL '${daysOld} days'
        RETURNING id
      `);

      logger.info('Cleaned up old jobs', {
        cleanedJobs: result.rowCount || 0,
        daysOld
      });

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Failed to cleanup old jobs', {
        daysOld,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// Singleton instance
export const jobQueueService = new JobQueueService();

// Convenience functions
export const registerJobProcessor = jobQueueService.registerProcessor.bind(jobQueueService);
export const addJob = jobQueueService.addJob.bind(jobQueueService);
export const processJobs = jobQueueService.processJobs.bind(jobQueueService);
export const getQueueStatistics = jobQueueService.getQueueStatistics.bind(jobQueueService);
export const cleanupOldJobs = jobQueueService.cleanupOldJobs.bind(jobQueueService);
```

### 2. Database Schema Changes

#### 2.1 Enhanced Job Queue Tables
**File:** `infra/migrations/020_job_queue_enhancements.sql`

```sql
-- Migration: 020_job_queue_enhancements.sql
-- Description: Enhance job queue with error handling and monitoring

-- Add error handling columns to job_queue
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Create dead letter queue table
CREATE TABLE IF NOT EXISTS job_queue_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id text NOT NULL,
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  error text NOT NULL,
  failed_at timestamptz DEFAULT now(),
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  created_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT job_queue_dead_letter_original_job_id_check CHECK (length(original_job_id) > 0),
  CONSTRAINT job_queue_dead_letter_error_check CHECK (length(error) > 0),
  CONSTRAINT job_queue_dead_letter_retry_count_check CHECK (retry_count >= 0),
  CONSTRAINT job_queue_dead_letter_max_retries_check CHECK (max_retries > 0)
);

-- Create job metrics table
CREATE TABLE IF NOT EXISTS job_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  error_type text,
  created_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT job_metrics_job_id_check CHECK (length(job_id) > 0),
  CONSTRAINT job_metrics_job_type_check CHECK (length(job_type) > 0),
  CONSTRAINT job_metrics_status_check CHECK (length(status) > 0),
  CONSTRAINT job_metrics_duration_ms_check CHECK (duration_ms >= 0),
  CONSTRAINT job_metrics_attempts_check CHECK (attempts >= 0)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority ON job_queue(status, priority ASC);
CREATE INDEX IF NOT EXISTS idx_job_queue_type_status ON job_queue(job_type, status);
CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled_at ON job_queue(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_queue_created_at ON job_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_started_at ON job_queue(started_at) WHERE started_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_queue_completed_at ON job_queue(completed_at) WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_original_job_id ON job_queue_dead_letter(original_job_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_failed_at ON job_queue_dead_letter(failed_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_job_type ON job_queue_dead_letter(job_type);

CREATE INDEX IF NOT EXISTS idx_job_metrics_job_id ON job_metrics(job_id);
CREATE INDEX IF NOT EXISTS idx_job_metrics_job_type ON job_metrics(job_type);
CREATE INDEX IF NOT EXISTS idx_job_metrics_created_at ON job_metrics(created_at);

-- Row Level Security
ALTER TABLE job_queue_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY job_queue_dead_letter_admin_policy ON job_queue_dead_letter
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

CREATE POLICY job_metrics_admin_policy ON job_metrics
  FOR ALL USING (
    current_setting('app.user_role', true) = 'admin' OR 
    current_setting('app.current_company_id', true) IS NOT NULL
  );

-- Comments for documentation
COMMENT ON TABLE job_queue_dead_letter IS 'Stores jobs that failed after max retry attempts for manual inspection';
COMMENT ON TABLE job_metrics IS 'Tracks job processing metrics and performance';
COMMENT ON COLUMN job_queue.error IS 'Error message from last failed attempt';
COMMENT ON COLUMN job_queue.started_at IS 'Timestamp when job processing started';
COMMENT ON COLUMN job_queue.completed_at IS 'Timestamp when job processing completed';
COMMENT ON COLUMN job_queue.metadata IS 'Additional job metadata for processing context';
```

#### 2.2 Rollback Migration
**File:** `infra/migrations/020_rollback.sql`

```sql
-- Migration: 020_rollback.sql
-- Description: Rollback job queue enhancements

DROP TABLE IF EXISTS job_metrics CASCADE;
DROP TABLE IF EXISTS job_queue_dead_letter CASCADE;

-- Note: We don't drop the added columns from job_queue
-- as they might contain data. Handle this in a separate migration if needed.
```

### 3. Configuration Changes Required

#### 3.1 Environment Variables
Add to `.env.development` and `.env.production`:

```bash
# Job Queue Settings
JOB_QUEUE_ENABLED=true
JOB_QUEUE_MAX_CONCURRENT_JOBS=10
JOB_QUEUE_BATCH_SIZE=5
JOB_QUEUE_RETRY_BASE_DELAY_MS=1000
JOB_QUEUE_RETRY_MAX_DELAY_MS=300000
JOB_QUEUE_CLEANUP_DAYS=30
JOB_QUEUE_METRICS_ENABLED=true
```

#### 3.2 Job Queue Configuration
**File:** `apps/web/src/lib/jobQueueConfig.ts`

```typescript
export const jobQueueConfig = {
  enabled: process.env.JOB_QUEUE_ENABLED === 'true',
  maxConcurrentJobs: parseInt(process.env.JOB_QUEUE_MAX_CONCURRENT_JOBS || '10'),
  batchSize: parseInt(process.env.JOB_QUEUE_BATCH_SIZE || '5'),
  retry: {
    baseDelayMs: parseInt(process.env.JOB_QUEUE_RETRY_BASE_DELAY_MS || '1000'),
    maxDelayMs: parseInt(process.env.JOB_QUEUE_RETRY_MAX_DELAY_MS || '300000'),
    maxAttempts: {
      webhook_processing: 3,
      send_notification: 5,
      data_cleanup: 2,
      report_generation: 1
    }
  },
  cleanup: {
    enabled: true,
    retentionDays: parseInt(process.env.JOB_QUEUE_CLEANUP_DAYS || '30'),
    schedule: '0 2 * * *' // 2 AM daily
  },
  metrics: {
    enabled: process.env.JOB_QUEUE_METRICS_ENABLED === 'true',
    retentionDays: 90
  }
};

export type JobType = keyof typeof jobQueueConfig.retry.maxAttempts;
```

### 4. Dependencies That Need to Be Installed

No new dependencies required - uses existing packages:
- `pg` (already installed)
- Existing utilities and error handling libraries

### 5. Integration Points with Existing Code

#### 5.1 Integration with Existing Job Processors
**File:** `apps/web/src/server/services/scheduler.ts` (extend existing)

```typescript
import { jobQueueService, registerJobProcessor } from '@/lib/jobQueue';

// Register job processors
registerJobProcessor({
  type: 'send_nudge',
  handler: async (job) => {
    // Existing nudge sending logic
    return await sendNudgeNotification(job.payload);
  },
  options: {
    maxRetries: 3,
    retryDelay: 2000,
    timeout: 30000,
    circuitBreaker: true
  }
});

registerJobProcessor({
  type: 'process_webhook',
  handler: async (job) => {
    // Existing webhook processing logic
    return await processWebhookEvent(job.payload);
  },
  options: {
    maxRetries: 2,
    retryDelay: 1000,
    timeout: 15000,
    circuitBreaker: true
  }
});

// Replace existing job processing with enhanced queue
export async function processScheduledJobs(): Promise<void> {
  try {
    const results = await jobQueueService.processJobs();
    
    logger.info('Job processing completed', {
      processedJobs: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (error) {
    logger.error('Job processing failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

#### 5.2 Integration with Existing Cron Jobs
**File:** `apps/web/src/server/cron/processReminders.ts` (extend existing)

```typescript
import { addJob } from '@/lib/jobQueue';

// Convert existing direct processing to job queue
export async function processReminders(): Promise<void> {
  try {
    // Get reminders that need to be sent
    const reminders = await getPendingReminders();
    
    // Add to job queue instead of processing directly
    for (const reminder of reminders) {
      await addJob('send_reminder', {
        reminderId: reminder.id,
        userId: reminder.userId,
        membershipId: reminder.membershipId,
        type: reminder.type
      }, 2); // High priority for reminders
    }
    
    logger.info('Reminders added to job queue', {
      count: reminders.length
    });
  } catch (error) {
    logger.error('Failed to process reminders', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Automated Tests
**File:** `apps/web/test/job-queue-enhanced.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { jobQueueService, registerJobProcessor } from '@/lib/jobQueue';
import { sql } from '@/lib/db';

describe('Enhanced Job Queue', () => {
  const testProcessor = {
    type: 'test_job',
    handler: async (job: any) => {
      if (job.payload.shouldFail) {
        throw new Error('Simulated processing failure');
      }
      return { success: true, processedAt: new Date().toISOString() };
    },
    options: {
      maxRetries: 3,
      retryDelay: 100,
      timeout: 5000
    }
  };

  beforeEach(async () => {
    // Register test processor
    registerJobProcessor(testProcessor);
    
    // Clean up test data
    await sql.query('DELETE FROM job_queue WHERE job_type = $1', [testProcessor.type]);
    await sql.query('DELETE FROM job_queue_dead_letter WHERE job_type = $1', [testProcessor.type]);
    await sql.query('DELETE FROM job_metrics WHERE job_type = $1', [testProcessor.type]);
  });

  afterEach(async () => {
    // Clean up test data
    await sql.query('DELETE FROM job_queue WHERE job_type = $1', [testProcessor.type]);
    await sql.query('DELETE FROM job_queue_dead_letter WHERE job_type = $1', [testProcessor.type]);
    await sql.query('DELETE FROM job_metrics WHERE job_type = $1', [testProcessor.type]);
  });

  it('should process successful job', async () => {
    const jobId = await jobQueueService.addJob(testProcessor.type, {
      shouldFail: false,
      testId: 'success_123'
    });

    const results = await jobQueueService.processJobs(1);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].jobId).toBe(jobId);
    expect(results[0].result.success).toBe(true);
  });

  it('should retry failed job and eventually succeed', async () => {
    const jobId = await jobQueueService.addJob(testProcessor.type, {
      shouldFail: true,
      failCount: 2, // Fail first 2 attempts
      testId: 'retry_456'
    });

    // Process multiple times to simulate retries
    let results: any[] = [];
    for (let i = 0; i < 3; i++) {
      results = await jobQueueService.processJobs(1);
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait between processing
    }

    // Should eventually succeed on 3rd attempt
    const finalResult = results.find(r => r.jobId === jobId);
    expect(finalResult.success).toBe(true);
  });

  it('should move job to dead letter queue after max retries', async () => {
    const jobId = await jobQueueService.addJob(testProcessor.type, {
      shouldFail: true,
      failCount: 10, // Always fail
      testId: 'dead_letter_789'
    });

    // Process multiple times to exhaust retries
    for (let i = 0; i < 5; i++) {
      await jobQueueService.processJobs(1);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Check if job was moved to dead letter queue
    const deadLetterJob = await sql.query(`
      SELECT * FROM job_queue_dead_letter 
      WHERE original_job_id = $1
    `, [jobId]);

    expect(deadLetterJob.rows).toHaveLength(1);
    expect(deadLetterJob.rows[0].original_job_id).toBe(jobId);
    expect(deadLetterJob.rows[0].retry_count).toBeGreaterThanOrEqual(3);
  });

  it('should handle concurrent job processing limit', async () => {
    // Add more jobs than concurrent limit
    const jobIds = [];
    for (let i = 0; i < 15; i++) {
      const jobId = await jobQueueService.addJob(testProcessor.type, {
        testId: `concurrent_${i}`,
        delay: 100 // Slow processing
      });
      jobIds.push(jobId);
    }

    // Process jobs
    await jobQueueService.processJobs(20); // More than concurrent limit

    // Check that only max concurrent jobs were processed
    const activeJobs = await sql.query(`
      SELECT COUNT(*) as count FROM job_queue 
      WHERE status = 'processing' AND job_type = $1
    `, [testProcessor.type]);

    expect(activeJobs.rows[0].count).toBeLessThanOrEqual(10);
  });

  it('should track job metrics correctly', async () => {
    const jobId = await jobQueueService.addJob(testProcessor.type, {
      testId: 'metrics_123',
      shouldFail: false
    });

    await jobQueueService.processJobs(1);

    // Check metrics were recorded
    const metrics = await sql.query(`
      SELECT * FROM job_metrics 
      WHERE job_id = $1
    `, [jobId]);

    expect(metrics.rows).toHaveLength(1);
    expect(metrics.rows[0].job_id).toBe(jobId);
    expect(metrics.rows[0].job_type).toBe(testProcessor.type);
    expect(metrics.rows[0].status).toBe('completed');
    expect(metrics.rows[0].duration_ms).toBeGreaterThan(0);
  });
});
```

#### 6.2 Integration Test Script
**File:** `scripts/test-job-queue-enhanced.js`

```bash
#!/bin/bash
# Enhanced Job Queue Test

echo "🧪 Testing Enhanced Job Queue Implementation..."

# 1. Test job addition
echo "📝 Testing job addition..."
JOB_ID=$(curl -s -X POST http://localhost:3000/api/test/job-queue/add-job \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TEST_TOKEN" \
  -d '{
    "type": "test_job",
    "payload": {
      "testId": "enhancement_test",
      "shouldFail": false
    }
  }' | jq -r '.jobId')

echo "Added job: $JOB_ID"

# 2. Test job processing
echo "⚙️ Testing job processing..."
curl -s -X POST http://localhost:3000/api/test/job-queue/process-jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TEST_TOKEN" \
  -d '{"batchSize": 5}' | jq .

# 3. Wait for processing and check results
echo "⏳ Waiting for job processing..."
sleep 3

curl -s -X GET "http://localhost:3000/api/test/job-queue/job-status?jobId=$JOB_ID" \
  -H "Authorization: Bearer TEST_TOKEN" \
  | jq .

# 4. Test retry mechanism
echo "🔄 Testing retry mechanism..."
RETRY_JOB_ID=$(curl -s -X POST http://localhost:3000/api/test/job-queue/add-job \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TEST_TOKEN" \
  -d '{
    "type": "test_job",
    "payload": {
      "testId": "retry_test",
      "shouldFail": true,
      "failCount": 2
    }
  }' | jq -r '.jobId')

echo "Added retry job: $RETRY_JOB_ID"

# Process multiple times to trigger retries
for i in {1..4}; do
  curl -s -X POST http://localhost:3000/api/test/job-queue/process-jobs \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer TEST_TOKEN" \
    -d '{"batchSize": 1}' \
    > /dev/null
  
  sleep 1
done

# Check final status
curl -s -X GET "http://localhost:3000/api/test/job-queue/job-status?jobId=$RETRY_JOB_ID" \
  -H "Authorization: Bearer TEST_TOKEN" \
  | jq .

# 5. Test dead letter queue
echo "💀 Testing dead letter queue..."
DLQ_JOB_ID=$(curl -s -X POST http://localhost:3000/api/test/job-queue/add-job \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TEST_TOKEN" \
  -d '{
    "type": "test_job",
    "payload": {
      "testId": "dlq_test",
      "shouldFail": true,
      "failCount": 10
    }
  }' | jq -r '.jobId')

echo "Added DLQ job: $DLQ_JOB_ID"

# Process multiple times to exhaust retries
for i in {1..6}; do
  curl -s -X POST http://localhost:3000/api/test/job-queue/process-jobs \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer TEST_TOKEN" \
    -d '{"batchSize": 1}' \
    > /dev/null
  
  sleep 1
done

# Check dead letter queue
curl -s -X GET "http://localhost:3000/api/test/job-queue/dead-letter-queue" \
  -H "Authorization: Bearer TEST_TOKEN" \
  | jq .

# 6. Test queue statistics
echo "📊 Testing queue statistics..."
curl -s -X GET http://localhost:3000/api/test/job-queue/statistics \
  -H "Authorization: Bearer TEST_TOKEN" \
  | jq .

# 7. Test job cleanup
echo "🧹 Testing job cleanup..."
curl -s -X POST http://localhost:3000/api/test/job-queue/cleanup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TEST_TOKEN" \
  -d '{"daysOld": 1}' \
  | jq .

echo "✅ Enhanced job queue testing completed!"
```

#### 6.3 Manual Verification Commands

```bash
# Test job queue statistics
curl -X GET http://localhost:3000/api/admin/job-queue/statistics \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  | jq .

# Test dead letter queue monitoring
curl -X GET http://localhost:3000/api/admin/job-queue/dead-letter-queue \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  | jq .

# Test job metrics
curl -X GET http://localhost:3000/api/admin/job-queue/metrics \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  | jq .

# Verify job queue tables
psql $DATABASE_URL -c "
  SELECT 
    job_type,
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_duration_ms
  FROM job_queue 
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY job_type, status
  ORDER BY job_type, status;
"

# Verify dead letter queue
psql $DATABASE_URL -c "
  SELECT 
    job_type,
    COUNT(*) as count,
    AVG(retry_count) as avg_retries
  FROM job_queue_dead_letter 
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY job_type
  ORDER BY job_type;
"
```

---

[Continue with final violation...]
---

## Medium Severity Violation #12: Missing WCAG 2.1 Compliance

### 1. Specific Code Implementation Details

#### 1.1 Accessibility Utilities
**File:** `apps/web/src/lib/accessibility.ts` (new file)

```typescript
/**
 * Accessibility utilities for WCAG 2.1 compliance
 */

export interface AccessibilityOptions {
  announcePageChanges?: boolean;
  announceFormErrors?: boolean;
  focusManagement?: boolean;
  keyboardNavigation?: boolean;
  screenReaderSupport?: boolean;
  colorContrast?: boolean;
  reducedMotion?: boolean;
}

export interface AriaAttributes {
  role?: string;
  label?: string;
  labelledby?: string;
  describedby?: string;
  expanded?: boolean;
  selected?: boolean;
  required?: boolean;
  invalid?: boolean;
  busy?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  live?: string;
  atomic?: boolean;
  relevant?: string;
}

export interface FocusableElement {
  element: HTMLElement;
  focusable: boolean;
  tabIndex: number;
}

/**
 * Accessibility utility class for WCAG 2.1 compliance
 */
export class AccessibilityUtils {
  private static liveRegion: HTMLElement | null = null;
  private static focusTrap: HTMLElement[] = [];
  private static skipLinks: HTMLElement[] = [];

  /**
   * Initialize accessibility features
   * @param {AccessibilityOptions} options - Accessibility options
   */
  static initialize(options: AccessibilityOptions = {}): void {
    this.setupFocusManagement(options.focusManagement !== false);
    this.setupKeyboardNavigation(options.keyboardNavigation !== false);
    this.setupScreenReaderSupport(options.screenReaderSupport !== false);
    this.setupColorContrast(options.colorContrast !== false);
    this.setupReducedMotion(options.reducedMotion !== false);
    this.setupPageChangeAnnouncements(options.announcePageChanges !== false);
    this.setupFormErrorAnnouncements(options.announceFormErrors !== false);
  }

  /**
   * Get appropriate ARIA attributes for element
   * @param {HTMLElement} element - Element to analyze
   * @param {string} role - ARIA role
   * @param {string} label - Accessible label
   * @returns {AriaAttributes} ARIA attributes
   */
  static getAriaAttributes(
    element: HTMLElement,
    role?: string,
    label?: string
  ): AriaAttributes {
    const attributes: AriaAttributes = {};

    // Determine role
    attributes.role = role || this.inferRole(element);

    // Determine label
    if (label) {
      attributes.label = label;
    } else {
      attributes.label = this.inferLabel(element);
    }

    // Set other attributes based on role and element type
    if (attributes.role === 'button') {
      attributes.required = element.hasAttribute('aria-required') || 
                   element.hasAttribute('required');
    }

    if (attributes.role === 'textbox' || attributes.role === 'combobox') {
      attributes.required = element.hasAttribute('aria-required') || 
                   element.hasAttribute('required');
      attributes.invalid = element.hasAttribute('aria-invalid') || 
                     element.hasAttribute('aria-invalid');
    }

    if (attributes.role === 'grid' || attributes.role === 'treegrid') {
      attributes.atomic = true;
    }

    // Check for expanded/collapsed state
    if (element.hasAttribute('aria-expanded')) {
      attributes.expanded = element.getAttribute('aria-expanded') === 'true';
    }

    // Check for selection state
    if (element.hasAttribute('aria-selected')) {
      attributes.selected = element.getAttribute('aria-selected') === 'true';
    }

    return attributes;
  }

  /**
   * Setup focus management for accessibility
   * @param {boolean} enabled - Whether focus management is enabled
   */
  static setupFocusManagement(enabled: boolean = true): void {
    if (!enabled) return;

    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('focusin', this.handleFocusIn);
    document.addEventListener('focusout', this.handleFocusOut);

    // Set initial focus
    const initialFocus = this.getInitialFocusableElement();
    if (initialFocus) {
      setTimeout(() => initialFocus.focus(), 100);
    }
  }

  /**
   * Setup keyboard navigation support
   * @param {boolean} enabled - Whether keyboard navigation is enabled
   */
  static setupKeyboardNavigation(enabled: boolean = true): void {
    if (!enabled) return;

    document.addEventListener('keydown', this.handleKeyboardNavigation);

    // Add skip links for keyboard users
    this.addSkipLinks();
  }

  /**
   * Setup screen reader support
   * @param {boolean} enabled - Whether screen reader support is enabled
   */
  static setupScreenReaderSupport(enabled: boolean = true): void {
    if (!enabled) return;

    // Announce page changes to screen readers
    this.setupLiveRegion();

    // Add ARIA landmarks
    this.addAriaLandmarks();
  }

  /**
   * Setup color contrast support
   * @param {boolean} enabled - Whether color contrast support is enabled
   */
  static setupColorContrast(enabled: boolean = true): void {
    if (!enabled) return;

    // Detect high contrast mode
    if (window.matchMedia && window.matchMedia('(prefers-contrast: high)').matches) {
      document.body.classList.add('high-contrast');
    }

    // Detect reduced color preference
    if (window.matchMedia && window.matchMedia('(prefers-reduced-data: color)').matches) {
      document.body.classList.add('reduced-color');
    }
  }

  /**
   * Setup reduced motion support
   * @param {boolean} enabled - Whether reduced motion support is enabled
   */
  static setupReducedMotion(enabled: boolean = true): void {
    if (!enabled) return;

    // Detect reduced motion preference
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('reduced-motion');
    }
  }

  /**
   * Setup page change announcements
   * @param {boolean} enabled - Whether page change announcements are enabled
   */
  static setupPageChangeAnnouncements(enabled: boolean = true): void {
    if (!enabled) return;

    // Observe page changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          this.announcePageChange('Content updated');
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Setup form error announcements
   * @param {boolean} enabled - Whether form error announcements are enabled
   */
  static setupFormErrorAnnouncements(enabled: boolean = true): void {
    if (!enabled) return;

    // Observe form validation errors
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            mutation.attributeName === 'aria-invalid' &&
            (mutation.target as HTMLElement).getAttribute('aria-invalid') === 'true') {
          const element = mutation.target as HTMLElement;
          const errorMessage = element.getAttribute('aria-errormessage') || 
                               this.getValidationErrorMessage(element);
          
          this.announceToScreenReader(errorMessage, 'assertive');
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-invalid'],
      subtree: true
    });
  }

  /**
   * Create focus trap for modal dialogs
   * @param {HTMLElement} container - Container element
   * @returns {() => void} Function to remove focus trap
   */
  static createFocusTrap(container: HTMLElement): () => void {
    const focusableElements = this.getFocusableElements(container);
    
    // Store current focus
    const currentFocus = document.activeElement as HTMLElement;
    
    // Set focus to first focusable element
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Trap focus within container
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          // Shift + Tab: Move to previous focusable element
          event.preventDefault();
          const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
          const previousIndex = currentIndex === 0 ? focusableElements.length - 1 : currentIndex - 1;
          focusableElements[previousIndex].focus();
        } else {
          // Tab: Move to next focusable element
          event.preventDefault();
          const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
          const nextIndex = (currentIndex + 1) % focusableElements.length;
          focusableElements[nextIndex].focus();
        }
      } else if (event.key === 'Escape') {
        // Escape: Restore previous focus
        event.preventDefault();
        if (currentFocus) {
          currentFocus.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Return function to remove focus trap
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (currentFocus) {
        currentFocus.focus();
      }
    };
  }

  /**
   * Announce message to screen reader
   * @param {string} message - Message to announce
   * @param {string} priority - Announcement priority
   */
  static announceToScreenReader(message: string, priority: 'polite' | 'assertive' | 'off' = 'polite'): void {
    if (!this.liveRegion) {
      this.createLiveRegion();
    }

    this.liveRegion.textContent = '';
    this.liveRegion.setAttribute('aria-live', priority);
    this.liveRegion.textContent = message;

    // Clear announcement after delay
    setTimeout(() => {
      if (this.liveRegion) {
        this.liveRegion.textContent = '';
      }
    }, 1000);
  }

  /**
   * Get focusable elements within container
   * @param {HTMLElement} container - Container element
   * @returns {HTMLElement[]} Array of focusable elements
   */
  static getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'details',
      'summary',
      'audio[controls]',
      'video[controls]',
      '[contenteditable="true"]'
    ].join(', ');

    const elements = Array.from(container.querySelectorAll(focusableSelectors)) as HTMLElement[];
    
    // Filter out elements that are not actually focusable
    return elements.filter(element => {
      // Check if element is visible
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      // Check if element is disabled
      if (element.hasAttribute('disabled')) {
        return false;
      }

      // Check if element has tabindex = -1
      const tabIndex = element.getAttribute('tabindex');
      if (tabIndex === '-1') {
        return false;
      }

      return true;
    });
  }

  /**
   * Infer ARIA role from element
   * @param {HTMLElement} element - Element to analyze
   * @returns {string} Inferred ARIA role
   */
  static inferRole(element: HTMLElement): string {
    const tagName = element.tagName.toLowerCase();
    
    // Map HTML elements to ARIA roles
    const roleMap: Record<string, string> = {
      'header': 'banner',
      'nav': 'navigation',
      'main': 'main',
      'aside': 'complementary',
      'footer': 'contentinfo',
      'section': 'region',
      'article': 'article',
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'h4': 'heading',
      'h5': 'heading',
      'h6': 'heading',
      'ul': 'list',
      'ol': 'list',
      'li': 'listitem',
      'table': 'table',
      'thead': 'rowgroup',
      'tbody': 'rowgroup',
      'tr': 'row',
      'th': 'columnheader',
      'td': 'cell',
      'form': 'form',
      'fieldset': 'group',
      'legend': 'legend',
      'label': 'label',
      'input': 'textbox',
      'textarea': 'textbox',
      'select': 'combobox',
      'option': 'option',
      'button': 'button',
      'a': 'link',
      'img': 'img',
      'dialog': 'dialog',
      'alert': 'alert',
      'progressbar': 'progressbar'
    };

    return roleMap[tagName] || '';
  }

  /**
   * Infer accessible label from element
   * @param {HTMLElement} element - Element to analyze
   * @returns {string} Inferred accessible label
   */
  static inferLabel(element: HTMLElement): string {
    // Check for explicit label
    if (element.hasAttribute('aria-label')) {
      return element.getAttribute('aria-label') || '';
    }

    // Check for label element
    if (element.id) {
      const labelElement = document.querySelector(`label[for="${element.id}"]`);
      if (labelElement) {
        return labelElement.textContent || '';
      }
    }

    // Check for title attribute
    if (element.hasAttribute('title')) {
      return element.getAttribute('title') || '';
    }

    // Check for placeholder (for form inputs)
    if (element.hasAttribute('placeholder')) {
      return element.getAttribute('placeholder') || '';
    }

    // Check for alt text (for images)
    if (element.tagName.toLowerCase() === 'img' && element.hasAttribute('alt')) {
      return element.getAttribute('alt') || '';
    }

    // Check for text content (as last resort)
    return element.textContent?.trim() || '';
  }

  /**
   * Get validation error message from element
   * @param {HTMLElement} element - Form element
   * @returns {string} Validation error message
   */
  static getValidationErrorMessage(element: HTMLElement): string {
    // Check for explicit error message
    if (element.hasAttribute('aria-errormessage')) {
      return element.getAttribute('aria-errormessage') || '';
    }

    // Check for validation message in DOM
    const errorId = element.getAttribute('aria-describedby') || '';
    if (errorId) {
      const errorElement = document.getElementById(errorId);
      if (errorElement) {
        return errorElement.textContent || '';
      }
    }

    // Generate default error message based on element type
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'input') {
      const inputType = element.getAttribute('type') || 'text';
      return `Please enter a valid ${inputType}`;
    }

    return 'This field is required';
  }

  /**
   * Get initial focusable element for page
   * @returns {HTMLElement | null} Initial focusable element
   */
  static getInitialFocusableElement(): HTMLElement | null {
    // Look for main content first
    const mainElement = document.querySelector('main');
    if (mainElement) {
      const focusableElements = this.getFocusableElements(mainElement);
      return focusableElements.length > 0 ? focusableElements[0] : null;
    }

    // Look for h1 as fallback
    const h1Element = document.querySelector('h1');
    if (h1Element) {
      return h1Element;
    }

    // Look for first focusable element
    const focusableElements = this.getFocusableElements();
    return focusableElements.length > 0 ? focusableElements[0] : null;
  }

  /**
   * Add skip links for keyboard navigation
   */
  static addSkipLinks(): void {
    // Create skip links container
    const skipLinksContainer = document.createElement('div');
    skipLinksContainer.className = 'skip-links';
    skipLinksContainer.setAttribute('aria-label', 'Skip navigation links');
    
    // Add skip to main content link
    const skipToMain = document.createElement('a');
    skipToMain.href = '#main-content';
    skipToMain.textContent = 'Skip to main content';
    skipToMain.className = 'skip-link';
    
    // Add skip to navigation link
    const skipToNav = document.createElement('a');
    skipToNav.href = '#main-navigation';
    skipToNav.textContent = 'Skip to navigation';
    skipToNav.className = 'skip-link';
    
    skipLinksContainer.appendChild(skipToMain);
    skipLinksContainer.appendChild(skipToNav);
    
    // Add to beginning of body
    if (document.body.firstChild) {
      document.body.insertBefore(skipLinksContainer, document.body.firstChild);
    } else {
      document.body.appendChild(skipLinksContainer);
    }
  }

  /**
   * Add ARIA landmarks to page
   */
  static addAriaLandmarks(): void {
    // Add role to main element if missing
    const mainElements = document.querySelectorAll('main');
    mainElements.forEach(main => {
      if (!main.hasAttribute('role')) {
        main.setAttribute('role', 'main');
      }
    });

    // Add role to navigation elements if missing
    const navElements = document.querySelectorAll('nav');
    navElements.forEach(nav => {
      if (!nav.hasAttribute('role')) {
        nav.setAttribute('role', 'navigation');
      }
    });

    // Add role to header elements if missing
    const headerElements = document.querySelectorAll('header');
    headerElements.forEach(header => {
      if (!header.hasAttribute('role')) {
        header.setAttribute('role', 'banner');
      }
    });

    // Add role to footer elements if missing
    const footerElements = document.querySelectorAll('footer');
    footerElements.forEach(footer => {
      if (!footer.hasAttribute('role')) {
        footer.setAttribute('role', 'contentinfo');
      }
    });

    // Add role to aside elements if missing
    const asideElements = document.querySelectorAll('aside');
    asideElements.forEach(aside => {
      if (!aside.hasAttribute('role')) {
        aside.setAttribute('role', 'complementary');
      }
    });
  }

  /**
   * Create live region for screen reader announcements
   */
  static createLiveRegion(): void {
    if (this.liveRegion) return;

    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = 'sr-only live-region';
    
    // Add to end of body
    document.body.appendChild(this.liveRegion);
  }

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} event - Keyboard event
   */
  private static handleKeyboardNavigation(event: KeyboardEvent): void {
    // Handle Tab navigation
    if (event.key === 'Tab') {
      // Find next focusable element
      const focusableElements = this.getFocusableElements();
      const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
      
      if (event.shiftKey) {
        // Shift + Tab: Move to previous
        event.preventDefault();
        const previousIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
        focusableElements[previousIndex].focus();
      } else {
        // Tab: Move to next
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % focusableElements.length;
        focusableElements[nextIndex].focus();
      }
    }
  }

  /**
   * Handle focus in event
   * @param {FocusEvent} event - Focus event
   */
  private static handleFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    
    // Add focus indicator
    target.classList.add('focused');
    
    // Announce focus change to screen readers
    const label = this.inferLabel(target);
    if (label) {
      this.announceToScreenReader(`${label} focused`, 'polite');
    }
  }

  /**
   * Handle focus out event
   * @param {FocusEvent} event - Focus event
   */
  private static handleFocusOut(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    
    // Remove focus indicator
    target.classList.remove('focused');
  }

  /**
   * Handle key down event
   * @param {KeyboardEvent} event - Keyboard event
   */
  private static handleKeyDown(event: KeyboardEvent): void {
    // Handle Escape key to close modals
    if (event.key === 'Escape') {
      const modals = document.querySelectorAll('[role="dialog"]');
      modals.forEach(modal => {
        if (modal.style.display !== 'none') {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
          
          // Restore focus to trigger element
          const triggerId = modal.getAttribute('data-trigger') || '';
          if (triggerId) {
            const triggerElement = document.getElementById(triggerId);
            if (triggerElement) {
              triggerElement.focus();
            }
          }
        }
      });
    }
  }
}

// Convenience functions
export const initializeAccessibility = AccessibilityUtils.initialize;
export const getAriaAttributes = AccessibilityUtils.getAriaAttributes;
export const createFocusTrap = AccessibilityUtils.createFocusTrap;
export const announceToScreenReader = AccessibilityUtils.announceToScreenReader;
export const getFocusableElements = AccessibilityUtils.getFocusableElements;
```

#### 1.2 Accessibility Components
**File:** `apps/web/src/components/ui/AccessibleButton.tsx` (new file)

```typescript
import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { getAriaAttributes, AccessibilityUtils } from '@/lib/accessibility';

interface AccessibleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-pressed'?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Accessible Button component with WCAG 2.1 compliance
 * 
 * @component
 * @example
 * ```tsx
 * <AccessibleButton 
 *   variant="primary" 
 *   size="md" 
 *   onClick={handleClick}
 *   aria-label="Submit form"
 * >
 *   Submit
 * </AccessibleButton>
 * ```
 */
const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  ({ 
    className, 
    variant = 'primary', 
    size = 'md', 
    loading = false,
    disabled = false,
    children,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-expanded': ariaExpanded,
    'aria-pressed': ariaPressed,
    onClick,
    ...props 
  }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
    
    const variantClasses = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-400',
      secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500 disabled:bg-gray-400',
      outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500 disabled:bg-gray-100'
    };
    
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg'
    };

    const classes = cn(
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      (disabled || loading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      className
    );

    // Build ARIA attributes
    const ariaProps: any = {};
    
    if (ariaLabel) {
      ariaProps['aria-label'] = ariaLabel;
    }
    
    if (ariaDescribedBy) {
      ariaProps['aria-describedby'] = ariaDescribedBy;
    }
    
    if (ariaExpanded !== undefined) {
      ariaProps['aria-expanded'] = ariaExpanded;
    }
    
    if (ariaPressed !== undefined) {
      ariaProps['aria-pressed'] = ariaPressed;
    }
    
    if (disabled) {
      ariaProps['aria-disabled'] = true;
    }
    
    if (loading) {
      ariaProps['aria-busy'] = true;
    }

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) {
        event.preventDefault();
        return;
      }
      
      // Announce action to screen readers
      const buttonLabel = ariaLabel || AccessibilityUtils.inferLabel(event.currentTarget);
      if (buttonLabel) {
        AccessibilityUtils.announceToScreenReader(`${buttonLabel} activated`);
      }
      
      if (onClick) {
        onClick(event);
      }
    };

    return (
      <button
        className={classes}
        ref={ref}
        disabled={disabled || loading}
        aria-atomic="true"
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        {...ariaProps}
        {...props}
      >
        {loading ? (
          <span className="sr-only">Loading</span>
        ) : null}
        
        {children}
      </button>
    );
  }
);

AccessibleButton.displayName = 'AccessibleButton';

export default AccessibleButton;
```

**File:** `apps/web/src/components/ui/AccessibleForm.tsx` (new file)

```typescript
import React, { forwardRef, FormHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { AccessibilityUtils } from '@/lib/accessibility';

interface AccessibleFormProps extends FormHTMLAttributes<HTMLFormElement> {
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-errormessage'?: string;
  noValidate?: boolean;
}

/**
 * Accessible Form component with WCAG 2.1 compliance
 * 
 * @component
 * @example
 * ```tsx
 * <AccessibleForm 
 *   onSubmit={handleSubmit}
 *   aria-label="Payment form"
 *   noValidate
 * >
 *   <input type="text" required aria-label="Card number" />
 *   <button type="submit">Submit</button>
 * </AccessibleForm>
 * ```
 */
const AccessibleForm = forwardRef<HTMLFormElement, AccessibleFormProps>(
  ({ 
    className, 
    children, 
    onSubmit,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-errormessage': ariaErrorMessage,
    noValidate = false,
    ...props 
  }, ref) => {
    const baseClasses = 'space-y-6';
    const classes = cn(baseClasses, className);

    // Build ARIA attributes
    const ariaProps: any = {};
    
    if (ariaLabel) {
      ariaProps['aria-label'] = ariaLabel;
    }
    
    if (ariaDescribedBy) {
      ariaProps['aria-describedby'] = ariaDescribedBy;
    }
    
    if (ariaInvalid !== undefined) {
      ariaProps['aria-invalid'] = ariaInvalid;
    }
    
    if (ariaErrorMessage) {
      ariaProps['aria-errormessage'] = ariaErrorMessage;
    }

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      
      // Validate form if not using browser validation
      if (noValidate) {
        const form = event.currentTarget;
        const isValid = this.validateForm(form);
        
        if (!isValid) {
          form.setAttribute('aria-invalid', 'true');
          
          // Announce validation errors
          const errors = this.getFormValidationErrors(form);
          if (errors.length > 0) {
            AccessibilityUtils.announceToScreenReader(`Form validation failed: ${errors.join(', ')}`);
          }
        } else {
          form.setAttribute('aria-invalid', 'false');
        }
      }
      
      if (onSubmit) {
        onSubmit(event);
      }
    };

    return (
      <form
        className={classes}
        ref={ref}
        noValidate={noValidate}
        aria-atomic="true"
        role="form"
        onSubmit={handleSubmit}
        {...ariaProps}
        {...props}
      >
        {children}
      </form>
    );
  });

  /**
   * Validate form accessibility
   * @param {HTMLFormElement} form - Form element
   * @returns {boolean} Whether form is valid
   */
  validateForm(form: HTMLFormElement): boolean {
    // Check required fields
    const requiredFields = form.querySelectorAll('[required]');
    for (let i = 0; i < requiredFields.length; i++) {
      const field = requiredFields[i] as HTMLInputElement;
      if (!field.value || field.value.trim() === '') {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get form validation errors
   * @param {HTMLFormElement} form - Form element
   * @returns {string[]} Array of error messages
   */
  getFormValidationErrors(form: HTMLFormElement): string[] {
    const errors: string[] = [];
    
    // Check required fields
    const requiredFields = form.querySelectorAll('[required]');
    for (let i = 0; i < requiredFields.length; i++) {
      const field = requiredFields[i] as HTMLInputElement;
      const label = AccessibilityUtils.inferLabel(field);
      
      if (!field.value || field.value.trim() === '') {
        errors.push(`${label} is required`);
      }
    }
    
    return errors;
  }

AccessibleForm.displayName = 'AccessibleForm';

export default AccessibleForm;
```

### 2. Database Schema Changes

No database changes required for WCAG 2.1 compliance.

### 3. Configuration Changes Required

#### 3.1 Environment Variables
Add to `.env.development` and `.env.production`:

```bash
# Accessibility Settings
ACCESSIBILITY_ENABLED=true
ACCESSIBILITY_COLOR_CONTRAST=true
ACCESSIBILITY_REDUCED_MOTION=true
ACCESSIBILITY_SCREEN_READER_SUPPORT=true
ACCESSIBILITY_FOCUS_MANAGEMENT=true
ACCESSIBILITY_KEYBOARD_NAVIGATION=true
ACCESSIBILITY_PAGE_CHANGE_ANNOUNCEMENTS=true
ACCESSIBILITY_FORM_ERROR_ANNOUNCEMENTS=true
```

#### 3.2 Accessibility Configuration
**File:** `apps/web/src/lib/accessibilityConfig.ts`

```typescript
export const accessibilityConfig = {
  enabled: process.env.ACCESSIBILITY_ENABLED === 'true',
  
  // Visual accessibility
  colorContrast: {
    enabled: process.env.ACCESSIBILITY_COLOR_CONTRAST === 'true',
    highContrastTheme: {
      background: '#000000',
      text: '#ffffff',
      primary: '#ffcc00',
      secondary: '#0066cc'
    }
  },
  
  reducedMotion: {
    enabled: process.env.ACCESSIBILITY_REDUCED_MOTION === 'true',
    respectPrefersReducedMotion: true
  },
  
  // Auditory accessibility
  screenReader: {
    enabled: process.env.ACCESSIBILITY_SCREEN_READER_SUPPORT === 'true',
    announcements: {
      pageChanges: process.env.ACCESSIBILITY_PAGE_CHANGE_ANNOUNCEMENTS === 'true',
      formErrors: process.env.ACCESSIBILITY_FORM_ERROR_ANNOUNCEMENTS === 'true',
      navigationChanges: true
    }
  },
  
  // Keyboard accessibility
  focusManagement: {
    enabled: process.env.ACCESSIBILITY_FOCUS_MANAGEMENT === 'true',
    visibleFocusIndicator: true,
    skipLinks: true
  },
  
  keyboardNavigation: {
    enabled: process.env.ACCESSIBILITY_KEYBOARD_NAVIGATION === 'true',
    trapFocusInModals: true,
    skipLinks: true
  },
  
  // ARIA support
  aria: {
    landmarks: true,
    labels: true,
    descriptions: true,
    liveRegions: true,
    expandedStates: true,
    invalidStates: true
  }
};
```

### 4. Dependencies That Need to Be Installed

No new dependencies required - uses existing packages:
- React (already installed)
- TypeScript (already installed)
- Tailwind CSS (already installed)

### 5. Integration Points with Existing Code

#### 5.1 Integration with Existing Components
**File:** `apps/web/src/components/dashboard/CasesTable.tsx` (extend existing)

```typescript
import { AccessibilityUtils } from '@/lib/accessibility';
import { getAriaAttributes } from '@/lib/accessibility';

// Add accessibility to CasesTable component
export const CasesTable: React.FC<CasesTableProps> = ({
  cases,
  onCaseAction,
  loading = false,
  className = ''
}) => {
  // ...existing code...

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200" 
             role="table" 
             aria-label="Recovery cases table"
             aria-rowcount={filteredAndSortedCases.length}>
        <thead className="bg-gray-50">
          <tr>
            {allowBulkActions && (
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  aria-label="Select all cases"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCases(filteredAndSortedCases.map(c => c.id));
                    } else {
                      setSelectedCases([]);
                    }
                  }}
                />
              </th>
            )}
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('id')}
              role="columnheader"
              aria-sort={sortConfig.direction === 'asc' ? 'ascending' : 'descending'}
            >
              Case ID
              {sortConfig.key === 'id' && (
                <span className="sr-only">
                  {sortConfig.direction === 'asc' ? 'Sorted ascending' : 'Sorted descending'}
                </span>
              )}
            </th>
            {/* ...other headers with accessibility attributes */}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredAndSortedCases.map((case_) => (
            <tr 
              key={case_.id} 
              className="hover:bg-gray-50"
              aria-selected={selectedCases.includes(case_.id)}
            >
              {allowBulkActions && (
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    aria-label={`Select case ${case_.id}`}
                    checked={selectedCases.includes(case_.id)}
                    onChange={() => handleCaseSelection(case_.id)}
                  />
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                <span aria-label={`Case ID: ${case_.id}`}>
                  {case_.id}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {renderStatusBadge(case_.status)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <span aria-label={`User ID: ${case_.userId}`}>
                  {case_.userId}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <span aria-label={`First failure: ${new Date(case_.firstFailureAt).toLocaleDateString()}`}>
                  {new Date(case_.firstFailureAt).toLocaleDateString()}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2" role="group" aria-label={`Actions for case ${case_.id}`}>
                  {case_.status === 'open' && (
                    <>
                      <button
                        className="text-blue-600 hover:text-blue-900 text-xs font-medium"
                        onClick={() => handleCaseAction(case_.id, 'nudge')}
                        aria-label={`Send nudge for case ${case_.id}`}
                      >
                        Nudge
                      </button>
                      <button
                        className="text-green-600 hover:text-green-900 text-xs font-medium"
                        onClick={() => handleCaseAction(case_.id, 'recover')}
                        aria-label={`Recover case ${case_.id}`}
                      >
                        Recover
                      </button>
                    </>
                  )}
                  <button
                    className="text-red-600 hover:text-red-900 text-xs font-medium"
                    onClick={() => handleCaseAction(case_.id, 'terminate')}
                    aria-label={`Terminate case ${case_.id}`}
                  >
                    Terminate
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {pagination && (
        <div className="mt-4 flex items-center justify-between" role="navigation" aria-label="Table pagination">
          <div className="text-sm text-gray-700">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </div>
          <div className="flex space-x-2">
            <button
              className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              onClick={() => handleCaseAction('prev', 'paginate')}
              disabled={pagination.page === 1}
              aria-label="Previous page"
              aria-disabled={pagination.page === 1}
            >
              Previous
            </button>
            <button
              className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              onClick={() => handleCaseAction('next', 'paginate')}
              disabled={pagination.page * pagination.limit >= pagination.total}
              aria-label="Next page"
              aria-disabled={pagination.page * pagination.limit >= pagination.total}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
```

#### 5.2 Integration with App Layout
**File:** `apps/web/src/app/layout.tsx` (extend existing)

```typescript
import { AccessibilityUtils } from '@/lib/accessibility';
import { accessibilityConfig } from '@/lib/accessibilityConfig';

// Add accessibility initialization to app layout
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize accessibility features
  React.useEffect(() => {
    if (accessibilityConfig.enabled) {
      AccessibilityUtils.initialize({
        announcePageChanges: accessibilityConfig.screenReader.announcements.pageChanges,
        announceFormErrors: accessibilityConfig.screenReader.announcements.formErrors,
        focusManagement: accessibilityConfig.focusManagement.enabled,
        keyboardNavigation: accessibilityConfig.keyboardNavigation.enabled,
        screenReaderSupport: accessibilityConfig.screenReader.enabled,
        colorContrast: accessibilityConfig.colorContrast.enabled,
        reducedMotion: accessibilityConfig.reducedMotion.enabled
      });
    }
  }, []);

  return (
    <html lang="en" className={accessibilityConfig.enabled ? 'accessibility-enabled' : ''}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {accessibilityConfig.enabled && (
          <meta name="description" content="Churn Saver - Payment recovery solution with full accessibility support" />
        )}
      </head>
      <body className={`
        ${accessibilityConfig.colorContrast.enabled ? 'high-contrast' : ''}
        ${accessibilityConfig.reducedMotion.enabled ? 'reduced-motion' : ''}
      `}>
        {children}
      </body>
    </html>
  );
}
```

### 6. Verification Methods to Confirm Implementation

#### 6.1 Automated Tests
**File:** `apps/web/test/accessibility.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AccessibilityUtils } from '@/lib/accessibility';
import { render, screen } from '@testing-library/react';

describe('Accessibility Utilities', () => {
  beforeEach(() => {
    // Set up DOM for testing
    document.body.innerHTML = '';
    AccessibilityUtils.initialize();
  });

  afterEach(() => {
    // Clean up DOM after testing
    document.body.innerHTML = '';
  });

  describe('ARIA Attributes', () => {
    it('should infer correct ARIA roles', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      
      const attributes = AccessibilityUtils.getAriaAttributes(button);
      expect(attributes.role).toBe('button');
    });

    it('should infer labels from various elements', () => {
      // Test with aria-label
      const labeledElement = document.createElement('div');
      labeledElement.setAttribute('aria-label', 'Test Label');
      document.body.appendChild(labeledElement);
      
      const attributes = AccessibilityUtils.getAriaAttributes(labeledElement);
      expect(attributes.label).toBe('Test Label');

      // Test with label element
      const inputElement = document.createElement('input');
      inputElement.id = 'test-input';
      document.body.appendChild(inputElement);
      
      const labelElement = document.createElement('label');
      labelElement.setAttribute('for', 'test-input');
      labelElement.textContent = 'Test Input Label';
      document.body.appendChild(labelElement);
      
      const inputAttributes = AccessibilityUtils.getAriaAttributes(inputElement);
      expect(inputAttributes.label).toBe('Test Input Label');
    });
  });

  describe('Focus Management', () => {
    it('should get focusable elements correctly', () => {
      // Create test elements
      const button = document.createElement('button');
      button.textContent = 'Test Button';
      document.body.appendChild(button);
      
      const input = document.createElement('input');
      input.setAttribute('type', 'text');
      document.body.appendChild(input);
      
      const disabledButton = document.createElement('button');
      disabledButton.setAttribute('disabled', 'true');
      disabledButton.textContent = 'Disabled Button';
      document.body.appendChild(disabledButton);
      
      const hiddenDiv = document.createElement('div');
      hiddenDiv.style.display = 'none';
      document.body.appendChild(hiddenDiv);
      
      const focusableElements = AccessibilityUtils.getFocusableElements();
      
      expect(focusableElements).toContain(button);
      expect(focusableElements).toContain(input);
      expect(focusableElements).not.toContain(disabledButton);
      expect(focusableElements).not.toContain(hiddenDiv);
    });

    it('should create focus trap correctly', () => {
      // Create modal container
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.innerHTML = `
        <button id="modal-close">Close</button>
        <button id="modal-save">Save</button>
      `;
      document.body.appendChild(modal);
      
      // Create focus trap
      const removeFocusTrap = AccessibilityUtils.createFocusTrap(modal);
      
      // Focus should be on first button
      expect(document.activeElement?.id).toBe('modal-close');
      
      // Test Tab navigation
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
      document.dispatchEvent(tabEvent);
      expect(document.activeElement?.id).toBe('modal-save');
      
      // Test Shift+Tab navigation
      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      document.dispatchEvent(shiftTabEvent);
      expect(document.activeElement?.id).toBe('modal-close');
      
      // Remove focus trap
      removeFocusTrap();
    });
  });

  describe('Screen Reader Support', () => {
    it('should announce messages to screen reader', () => {
      // Create live region
      AccessibilityUtils.createLiveRegion();
      
      // Test announcement
      AccessibilityUtils.announceToScreenReader('Test announcement', 'assertive');
      
      const liveRegion = document.querySelector('.live-region');
      expect(liveRegion).toBeTruthy();
      expect(liveRegion?.textContent).toBe('Test announcement');
      expect(liveRegion?.getAttribute('aria-live')).toBe('assertive');
    });
  });

  describe('Color Contrast', () => {
    it('should detect high contrast preference', () => {
      // Mock matchMedia
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-contrast: high)',
        media: originalMatchMedia(query)
      }));
      
      // Re-initialize
      AccessibilityUtils.setupColorContrast(true);
      
      expect(document.body.classList.contains('high-contrast')).toBe(true);
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-contrast: high)');
      
      // Restore
      window.matchMedia = originalMatchMedia;
    });
  });

  describe('Reduced Motion', () => {
    it('should detect reduced motion preference', () => {
      // Mock matchMedia
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: originalMatchMedia(query)
      }));
      
      // Re-initialize
      AccessibilityUtils.setupReducedMotion(true);
      
      expect(document.body.classList.contains('reduced-motion')).toBe(true);
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
      
      // Restore
      window.matchMedia = originalMatchMedia;
    });
  });
});

describe('Accessible Components', () => {
  it('should render AccessibleButton with proper ARIA attributes', () => {
    const onClick = jest.fn();
    
    render(
      <AccessibleButton 
        onClick={onClick}
        aria-label="Test Button"
        aria-expanded={false}
      >
        Test Button
      </AccessibleButton>
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
    expect(button).toHaveAttribute('aria-label', 'Test Button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    
    // Test click
    button.click();
    expect(onClick).toHaveBeenCalled();
  });

  it('should render AccessibleForm with proper validation', () => {
    const onSubmit = jest.fn();
    
    render(
      <AccessibleForm 
        onSubmit={onSubmit}
        aria-label="Test Form"
        noValidate
      >
        <input 
          type="text" 
          required 
          aria-label="Test Input"
          aria-describedby="input-error"
        />
        <div id="input-error" className="text-red-500">Input is required</div>
        <button type="submit">Submit</button>
      </AccessibleForm>
    );
    
    const form = screen.getByRole('form');
    const input = screen.getByLabelText('Test Input');
    const button = screen.getByRole('button', { name: 'Submit' });
    
    expect(form).toBeTruthy();
    expect(form).toHaveAttribute('aria-label', 'Test Form');
    expect(input).toBeTruthy();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'input-error');
    expect(button).toBeTruthy();
  });
});
```

#### 6.2 Accessibility Test Script
**File:** `scripts/test-accessibility.js`

```bash
#!/bin/bash
# Accessibility Testing Script

echo "🧪 Testing WCAG 2.1 Accessibility Implementation..."

# 1. Test accessibility initialization
echo "🔍 Testing accessibility initialization..."
node -e "
  const { AccessibilityUtils } = require('./apps/web/src/lib/accessibility');
  
  AccessibilityUtils.initialize({
    announcePageChanges: true,
    announceFormErrors: true,
    focusManagement: true,
    keyboardNavigation: true,
    screenReaderSupport: true,
    colorContrast: true,
    reducedMotion: true
  });
  
  console.log('✅ Accessibility initialized successfully');
"

# 2. Test ARIA attributes
echo "🏷️ Testing ARIA attributes..."
curl -X POST http://localhost:3000/api/test/accessibility/aria-attributes \
  -H "Content-Type: application/json" \
  | jq .

# 3. Test focus management
echo "🎯 Testing focus management..."
curl -X POST http://localhost:3000/api/test/accessibility/focus-management \
  -H "Content-Type: application/json" \
  | jq .

# 4. Test screen reader support
echo "🔊 Testing screen reader support..."
curl -X POST http://localhost:3000/api/test/accessibility/screen-reader \
  -H "Content-Type: application/json" \
  | jq .

# 5. Test color contrast
echo "🎨 Testing color contrast..."
curl -X POST http://localhost:3000/api/test/accessibility/color-contrast \
  -H "Content-Type: application/json" \
  | jq .

# 6. Test reduced motion
echo "🌊 Testing reduced motion..."
curl -X POST http://localhost:3000/api/test/accessibility/reduced-motion \
  -H "Content-Type: application/json" \
  | jq .

# 7. Test keyboard navigation
echo "⌨️ Testing keyboard navigation..."
curl -X POST http://localhost:3000/api/test/accessibility/keyboard-navigation \
  -H "Content-Type: application/json" \
  | jq .

# 8. Run automated accessibility tests
echo "🧪 Running automated accessibility tests..."
cd apps/web
pnpm test:accessibility

# 9. Test accessibility in browser
echo "🌐 Testing accessibility in browser..."
echo "Opening application in browser for manual accessibility testing..."
echo "Please check the following:"
echo "1. Keyboard navigation (Tab, Shift+Tab, Enter, Space, Arrow keys)"
echo "2. Screen reader compatibility (NVDA, JAWS, VoiceOver)"
echo "3. Color contrast (high contrast mode)"
echo "4. Reduced motion (respect prefers-reduced-motion)"
echo "5. Focus indicators (visible focus outline)"
echo "6. ARIA labels and descriptions"
echo "7. Form validation and error announcements"
echo ""
echo "Application URL: http://localhost:3000"

# Open browser (macOS)
if command -v open >/dev/null 2>&1; then
  open http://localhost:3000
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3000
elif command -v gnome-open >/dev/null 2>&1; then
  gnome-open http://localhost:3000
fi

echo "✅ Accessibility testing completed!"
```

#### 6.3 Manual Verification Commands

```bash
# Test accessibility features
curl -X GET http://localhost:3000/api/test/accessibility/status \
  | jq .

# Test ARIA compliance
curl -X POST http://localhost:3000/api/test/accessibility/validate-aria \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:3000/dashboard"
  }' \
  | jq .

# Test focus management
curl -X POST http://localhost:3000/api/test/accessibility/focus-trap \
  -H "Content-Type: application/json" \
  -d '{
    "selector": ".modal-dialog"
  }' \
  | jq .

# Test screen reader announcements
curl -X POST http://localhost:3000/api/test/accessibility/screen-reader-announcement \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test announcement",
    "priority": "polite"
  }' \
  | jq .

# Verify accessibility classes
curl -X GET http://localhost:3000/dashboard \
  -H "User-Agent: Mozilla/5.0" \
  | grep -E "(high-contrast|reduced-motion|accessibility-enabled)" || echo "No accessibility classes found"
```

---

## Final Comprehensive Remediation Summary

### Overview
This document provides detailed technical remediation steps for all identified compliance violations in the Churn Saver project. The remediations address critical, high, and medium severity violations with specific implementation details, database schema changes, configuration requirements, and verification methods.

### Implementation Priority

#### 1. Critical Priority (Immediate - within 1 week)
- **GDPR User Deletion Endpoints**: Essential for legal compliance
- **Consent Management**: Required for privacy regulations

#### 2. High Priority (Within 2 weeks)
- **Data Export Functionality**: Required for user rights compliance
- **Developer Documentation**: Essential for team productivity
- **Local Development Setup Guide**: Critical for onboarding
- **Error Recovery Testing**: Important for system reliability

#### 3. Medium Priority (Within 4 weeks)
- **Component Documentation**: Improves maintainability
- **API Endpoint Documentation**: Supports integration
- **Debugging Procedures**: Enhances troubleshooting
- **Contribution Guidelines**: Facilitates community involvement
- **Job Queue Error Handling**: Improves system stability
- **WCAG 2.1 Compliance**: Ensures accessibility

### Implementation Dependencies

#### 1. Database Migrations
All database changes must be applied in order:
1. `015_user_deletion_tracking.sql`
2. `016_data_export_tracking.sql`
3. `017_consent_management.sql`
4. `018_error_recovery_enhancements.sql`
5. `019_debug_tables.sql`
6. `020_job_queue_enhancements.sql`

#### 2. Environment Variables
All required environment variables must be added to both development and production environments:
- See individual sections for specific variable requirements

#### 3. Code Integration
New components and services must be integrated with existing codebase:
- Follow established patterns and conventions
- Maintain backward compatibility
- Update existing components as needed

### Testing Requirements

#### 1. Automated Testing
- Unit tests for all new components and services
- Integration tests for API endpoints
- End-to-end tests for critical user flows
- Accessibility tests for WCAG compliance

#### 2. Manual Verification
- Manual testing of all new features
- Cross-browser compatibility testing
- Accessibility testing with screen readers
- Security testing of sensitive operations

### Documentation Updates

#### 1. Technical Documentation
- Update API documentation for new endpoints
- Update component documentation with examples
- Update development guides with new requirements
- Add troubleshooting guides for common issues

#### 2. User Documentation
- Update user guides for new features
- Add accessibility information
- Update privacy policy and terms of service
- Add help articles for new functionality

### Success Metrics

#### 1. Compliance Metrics
- 100% GDPR compliance (user deletion, data export, consent)
- 100% WCAG 2.1 AA compliance
- 100% documentation coverage for critical components
- 95%+ code coverage for new features

#### 2. Quality Metrics
- Zero critical security vulnerabilities
- 99.9%+ uptime for production systems
- <2 second average API response time
- <1 second average database query time

### Rollback Plan

#### 1. Database Rollback
- Rollback migrations available for all changes
- Tested rollback procedures documented
- Data backup procedures verified

#### 2. Code Rollback
- Feature flags for new functionality
- Gradual rollout with monitoring
- Emergency disable procedures documented

### Timeline

#### Week 1
- Implement GDPR user deletion endpoints
- Implement consent management system
- Apply database migrations for GDPR compliance

#### Week 2
- Implement data export functionality
- Create comprehensive developer documentation
- Implement error recovery testing

#### Week 3
- Create local development setup guide
- Implement debugging procedures
- Create contribution guidelines

#### Week 4
- Enhance job queue error handling
- Implement WCAG 2.1 compliance
- Complete API endpoint documentation
- Component documentation updates

### Resources Required

#### 1. Development Resources
- 2-3 full-time developers
- 1 QA engineer
- 1 technical writer
- Code review time from senior developers

#### 2. Testing Resources
- Accessibility testing tools and expertise
- Cross-browser testing environment
- Performance testing tools
- Security testing resources

#### 3. Documentation Resources
- Technical writing support
- Documentation design and review
- Video tutorial creation (optional)
- Translation services (if applicable)

### Risk Assessment

#### 1. Technical Risks
- Database migration failures
- Breaking changes to existing functionality
- Performance impact of new features
- Integration challenges with third-party services

#### 2. Compliance Risks
- Regulatory interpretation changes
- Accessibility standard updates
- Privacy law changes
- Security vulnerability discoveries

#### 3. Mitigation Strategies
- Comprehensive testing before deployment
- Gradual rollout with monitoring
- Emergency rollback procedures
- Regular compliance reviews

### Conclusion

The successful implementation of these remediation steps will bring the Churn Saver project into full compliance with GDPR, WCAG 2.1, and industry best practices for documentation and development processes. The implementation plan provides clear priorities, timelines, and success metrics to ensure effective remediation of all identified violations.

Regular review and updates to this remediation plan will be necessary to maintain ongoing compliance as regulations and standards evolve.