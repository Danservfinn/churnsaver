# RLS Implementation Guide

## Overview

This guide documents the implementation of Row Level Security (RLS) session context management for the Churn Saver application. The implementation ensures consistent tenant isolation across all database operations.

## Architecture

### Components

1. **Database Wrapper with RLS (`/src/lib/db-rls.ts`)**
   - Enhanced database interface with automatic RLS context setting
   - Provides `sqlWithRLS` object with query, select, insert, execute, and transaction methods
   - Automatically sets company context before database operations
   - Validates company context to prevent cross-tenant access
   - Handles context management for request lifecycle

2. **RLS Middleware (`/src/lib/rls-middleware.ts`)**
   - Request-level middleware for automatic company context extraction
   - Provides `withRLSContext` and `withRLSProtection` higher-order functions
   - Handles system operations with RLS context
   - Validates context before protected operations

3. **Application Middleware Integration (`/src/middleware.ts`)**
   - Updated Next.js middleware to set RLS context from authentication
   - Extracts company context from Whop tokens
   - Sets context headers for downstream handlers
   - Handles errors gracefully

4. **Service Layer Updates**
   - Updated all database access points to use RLS-enabled wrapper
   - Maintained backward compatibility with existing code
   - Added proper error handling for missing/invalid contexts

## Implementation Details

### Database Wrapper (`sqlWithRLS`)

The enhanced database wrapper provides these key features:

1. **Automatic Context Setting**
   ```typescript
   // RLS context is automatically set from request context or explicit parameter
   const result = await sqlWithRLS.select('SELECT * FROM recovery_cases');
   ```

2. **Context Validation**
   ```typescript
   // Company context is validated before operations (unless explicitly skipped)
   await sqlWithRLS.select('SELECT * FROM cases', [], { enforceCompanyContext: true });
   ```

3. **Transaction Support**
   ```typescript
   // All operations in a transaction use the same RLS context
   await sqlWithRLS.transaction(async (client) => {
     await client.query('INSERT INTO...');
     await client.query('UPDATE...');
   });
   ```

4. **Flexible Options**
   ```typescript
   // Can skip RLS for system operations
   await sqlWithRLS.execute('DELETE FROM events', [], { skipRLS: true });
   
   // Can use explicit company ID
   await sqlWithRLS.select('SELECT * FROM cases', [], { companyId: 'specific-company' });
   ```

### Middleware Integration

1. **Request Context Extraction**
   ```typescript
   // Company context is extracted from Whop authentication
   const context = await getRequestContextSDK(request);
   setRequestContext({
     companyId: context.companyId,
     userId: context.userId,
     isAuthenticated: context.isAuthenticated
   });
   ```

2. **API Route Protection**
   ```typescript
   // Protected API routes with automatic RLS context
   export const GET = withRLSProtection(async (request, context) => {
     // All database operations here automatically have RLS context
     const cases = await sqlWithRLS.select('SELECT * FROM recovery_cases');
     return Response.json({ cases });
   });
   ```

### Migration Compatibility

The implementation is fully compatible with existing RLS policies in `002_enable_rls_policies.sql`:

1. **Uses Existing Functions**
   - Calls `set_company_context()` function from migration
   - Uses `get_current_company_id()` function in policy checks

2. **Policy Alignment**
   - All tenant-scoped operations are protected by RLS policies
   - Company context is required for data access

## Usage Patterns

### Basic Database Operations

```typescript
// Simple query with automatic RLS context
const result = await sqlWithRLS.select('SELECT * FROM recovery_cases WHERE status = $1', [companyId]);

// Insert with RLS context
const newCase = await sqlWithRLS.insert(
  'INSERT INTO recovery_cases (id, company_id, user_id, status) VALUES ($1, $2, $3, $4)',
  [caseId, companyId, userId, 'open']
);

// Update with RLS context
const updated = await sqlWithRLS.execute(
  'UPDATE recovery_cases SET status = $1 WHERE id = $2',
  [status, caseId]
);
```

### Transaction Operations

```typescript
// Multiple operations in a single transaction with consistent RLS context
await sqlWithRLS.transaction(async (client) => {
  // Insert case
  await client.query('INSERT INTO recovery_cases...', [caseId, companyId, userId, 'open']);
  
  // Log action
  await client.query('INSERT INTO recovery_actions...', [companyId, caseId, userId, 'case_created']);
  
  // Update case status
  await client.query('UPDATE recovery_cases SET status = $2...', [caseId]);
});
```

### System Operations

```typescript
// System operations with explicit company context
await withSystemRLSContext(async () => {
  await sqlWithRLS.execute('DELETE FROM events WHERE processed = true', [], { 
    companyId: 'system-company-id' 
  });
}, {
  companyId: 'system-company-id',
  userId: 'system',
  operationType: 'cleanup'
});
```

### API Route Protection

```typescript
// Protected API route with automatic RLS context
import { withRLSProtection } from '@/lib/rls-middleware';

export const GET = withRLSProtection(async (request: NextRequest, context) => {
  // Company context is automatically available in all database operations
  const cases = await sqlWithRLS.select('SELECT * FROM recovery_cases');
  
  // Additional context validation if needed
  if (!context.companyId) {
    return NextResponse.json({ error: 'Company context required' }, { status: 400 });
  }
  
  return NextResponse.json({ cases });
});
```

## Testing

### RLS Validation Tests

Comprehensive test suite (`/test/rls-validation.test.ts`) covers:

1. **Context Management**
   - Setting and retrieving request context
   - Context clearing between requests

2. **Database Operations**
   - Automatic RLS context setting for queries
   - Explicit company ID override
   - RLS skipping for system operations

3. **Data Isolation**
   - Cross-tenant access prevention
   - Context-based data filtering
   - Transaction consistency

4. **Error Handling**
   - Invalid company context rejection
   - Database connection error handling
   - Transaction rollback on errors

5. **Performance**
   - Concurrent request handling
   - Context switching overhead measurement

## Security Benefits

1. **Consistent Tenant Isolation**
   - All database operations automatically use company context
   - No manual context setting required
   - RLS policies enforced at database level

2. **Prevention of Data Leaks**
   - Company validation prevents access to other tenants' data
   - Context validation ensures only valid companies can be used
   - Automatic context clearing prevents context bleeding between requests

3. **Defense in Depth**
   - Multiple layers of security (authentication, RLS, application-level)
   - Comprehensive error handling and logging
   - Audit trail for all operations

## Migration Strategy

### Phase 1: Implementation
1. Deploy database wrapper and middleware
2. Update service layer to use RLS-enabled wrapper
3. Add comprehensive tests
4. Update API routes to use protected middleware

### Phase 2: Validation
1. Run comprehensive RLS validation tests
2. Verify cross-tenant data isolation
3. Test error handling scenarios
4. Performance testing with concurrent requests
5. Security penetration testing

### Phase 3: Rollout
1. Enable RLS context setting in production
2. Monitor for any context-related errors
3. Gradual migration of all database operations
4. Full audit logging

## Troubleshooting

### Common Issues

1. **Missing Company Context**
   ```
   Error: "Company context required for tenant-scoped operation"
   Solution: Ensure authentication middleware is properly setting context
   ```

2. **Invalid Company Context**
   ```
   Error: "Invalid company context: [company-id]"
   Solution: Verify company exists in database
   ```

3. **RLS Policy Violations**
   ```
   Error: "Access denied: Cannot modify data for different company"
   Solution: Check RLS policy configuration
   ```

### Debugging Tools

1. **Context Inspection**
   ```typescript
   // Check current context
   import { getRequestContext } from '@/lib/db-rls';
   const context = getRequestContext();
   console.log('Current context:', context);
   ```

2. **RLS Query Inspection**
   ```sql
   -- Check if RLS is active
   SELECT current_setting('app.current_company_id') as current_company_id;
   ```

3. **Transaction Monitoring**
   ```typescript
   // Monitor transaction performance
   console.time('transaction');
   await sqlWithRLS.transaction(...);
   console.timeEnd('transaction');
   ```

## Best Practices

1. **Always Use RLS-Enabled Wrapper**
   - Never use the original `sql` object for tenant-scoped operations
   - Always use `sqlWithRLS` for consistent context management

2. **Set Context Early**
   - Set request context at the beginning of request handlers
   - Use `withRLSProtection` for API routes to ensure automatic context

3. **Validate Context**
   - Use `enforceCompanyContext: true` for operations that require valid companies
   - Handle context validation errors gracefully

4. **Use Transactions for Multi-Step Operations**
   - Use `sqlWithRLS.transaction` for operations requiring consistency
   - Ensure all operations in a transaction use the same context

5. **Test Thoroughly**
   - Use the comprehensive test suite to verify RLS functionality
   - Test both positive and negative scenarios
   - Verify cross-tenant data isolation

## Conclusion

This implementation provides robust, automatic RLS session context management that ensures consistent tenant isolation across all database operations. The layered approach with middleware, database wrapper, and comprehensive testing provides multiple layers of security against data leaks and unauthorized access.