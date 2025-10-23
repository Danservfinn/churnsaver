# Staging Rehearsal Checklist

## Pre-Rehearsal Setup
- [ ] Create staging Supabase project (churn-saver-staging)
- [ ] Configure staging Whop app with test credentials
- [ ] Set up staging Vercel deployment with production-like environment variables
- [ ] Verify staging database connection and permissions
- [ ] Deploy application to staging environment
- [ ] Confirm staging environment health checks pass

## Database Migration Testing
- [ ] Execute migrations 001-010 in sequence
- [ ] Verify table creation (events, recovery_cases, creator_settings, etc.)
- [ ] Confirm RLS policies are enabled and working
- [ ] Test job queue table functionality
- [ ] Validate A/B testing tables
- [ ] Check foreign key constraints
- [ ] Verify rate limiting tables
- [ ] Confirm performance indexes are created

## Webhook Processing Pipeline
- [ ] Test webhook signature validation (HMAC-SHA256)
- [ ] Verify replay protection (5-minute timestamp window)
- [ ] Test idempotent processing by whop_event_id
- [ ] Validate event payload encryption/decryption
- [ ] Check event attribution to recovery cases
- [ ] Test rate limiting (300/hour global, per-company limits)
- [ ] Verify webhook event logging and minimal payload storage
- [ ] Confirm GDPR-compliant payload redaction

## Job Queue and Scheduler Testing
- [ ] Test job queue insertion and processing
- [ ] Validate reminder scheduling logic
- [ ] Check cron job execution (every 5 minutes)
- [ ] Verify company-scoped processing
- [ ] Test concurrent processing protection
- [ ] Validate reminder attempt tracking
- [ ] Check nudge offset calculations (0,2,4 days)
- [ ] Confirm scheduler status endpoint functionality

## Data Retention and Privacy
- [ ] Execute event cleanup script (30/60 day retention)
- [ ] Test data privacy maintenance procedures
- [ ] Verify payload purging and minimal payload backfill
- [ ] Check GDPR compliance for PII handling
- [ ] Validate audit log retention policies
- [ ] Confirm encrypted data rotation

## Notification and External Services
- [ ] Test Push notification delivery (if enabled)
- [ ] Validate DM service integration (if enabled)
- [ ] Check notification failure handling
- [ ] Verify external API rate limiting
- [ ] Test notification retry logic

## Rollback Procedures
- [ ] Document current migration state
- [ ] Test database backup/restore procedures
- [ ] Verify Vercel rollback functionality
- [ ] Check migration rollback scripts
- [ ] Validate data consistency after rollback
- [ ] Test application deployment rollback

## Performance and Load Testing
- [ ] Test concurrent webhook processing
- [ ] Validate database query performance
- [ ] Check memory usage during bulk operations
- [ ] Verify cold start times for serverless functions
- [ ] Test high-volume reminder processing

## Security Validation
- [ ] Confirm all environment variables are encrypted
- [ ] Verify webhook secrets are properly configured
- [ ] Check database connection security (SSL required)
- [ ] Validate input sanitization and validation
- [ ] Test authentication and authorization
- [ ] Confirm audit logging is active

## Monitoring and Alerting
- [ ] Verify health check endpoints respond
- [ ] Test application logging levels
- [ ] Check database monitoring queries
- [ ] Validate error alerting mechanisms
- [ ] Confirm business metric tracking

## Go/No-Go Decision Criteria
- [ ] All migrations execute without errors
- [ ] Webhook processing works end-to-end
- [ ] Reminder scheduling functions correctly
- [ ] Data retention cleanup executes successfully
- [ ] Rollback procedures are tested and documented
- [ ] Performance meets production requirements
- [ ] Security validations pass
- [ ] Monitoring and alerting are functional