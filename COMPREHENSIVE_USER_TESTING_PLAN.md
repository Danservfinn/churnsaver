# ChurnSaver Comprehensive User Testing Plan

## Overview

This document provides an exhaustive testing plan for ChurnSaver from a user's perspective. It covers every feature, every scenario, and every pricing tier to ensure complete test coverage before production launch.

**Testing Philosophy**: Test like a real user would - break things, try edge cases, and verify everything works as advertised.

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Dummy Data Requirements](#2-dummy-data-requirements)
3. [Tier-Specific Testing Matrix](#3-tier-specific-testing-matrix)
4. [Feature Test Suites](#4-feature-test-suites)
5. [End-to-End User Journey Tests](#5-end-to-end-user-journey-tests)
6. [Edge Cases & Error Scenarios](#6-edge-cases--error-scenarios)
7. [Performance & Load Testing](#7-performance--load-testing)
8. [Security Testing](#8-security-testing)
9. [Compliance Testing](#9-compliance-testing)
10. [Test Execution Checklist](#10-test-execution-checklist)

---

## 1. Test Environment Setup

### 1.1 Test Instance Configuration

```bash
# Environment: test.churnsaver.app (or localhost:3000)
NODE_ENV=test
ENABLE_TEST_MODE=true
WHOP_MOCK_MODE=true  # Mock Whop API responses
```

### 1.2 Required Test Accounts

| Account Type | Purpose | Tier | Company ID |
|--------------|---------|------|------------|
| `test_creator_free` | Free tier testing | Free | `company_free_001` |
| `test_creator_pro` | Pro tier testing | Pro Monthly | `company_pro_001` |
| `test_creator_pro_annual` | Pro Annual testing | Pro Annual | `company_pro_002` |
| `test_creator_max` | Max tier testing | Max Monthly | `company_max_001` |
| `test_creator_max_annual` | Max Annual testing | Max Annual | `company_max_002` |
| `test_creator_expired` | Expired subscription | None | `company_expired_001` |
| `test_creator_downgrade` | Tier downgrade testing | Pro→Free | `company_downgrade_001` |

### 1.3 Test Database Initialization

```sql
-- Create test schema with isolated data
CREATE SCHEMA IF NOT EXISTS churnsaver_test;

-- Enable test isolation
SET search_path TO churnsaver_test;
```

---

## 2. Dummy Data Requirements

### 2.1 Seed Data Generator Script

Create `/scripts/seed-test-data.ts`:

```typescript
// seed-test-data.ts - Comprehensive test data seeder

interface TestDataConfig {
  companies: number;
  membershipsPerCompany: number;
  casesPerCompany: number;
  eventsPerCompany: number;
}

const TEST_CONFIG: Record<string, TestDataConfig> = {
  free: { companies: 3, membershipsPerCompany: 10, casesPerCompany: 5, eventsPerCompany: 20 },
  pro: { companies: 3, membershipsPerCompany: 200, casesPerCompany: 150, eventsPerCompany: 500 },
  max: { companies: 3, membershipsPerCompany: 1000, casesPerCompany: 500, eventsPerCompany: 2000 },
};
```

### 2.2 Mock Memberships (Per Company)

| Category | Count | Status | Purpose |
|----------|-------|--------|---------|
| Active Healthy | 50 | `active` | Baseline healthy members |
| Payment Failed - Recent | 20 | `payment_failed` | T+0 to T+2 testing |
| Payment Failed - Mid | 15 | `payment_failed` | T+2 to T+4 testing |
| Payment Failed - Late | 10 | `payment_failed` | T+4 to T+14 testing |
| Payment Failed - Expired | 5 | `payment_failed` | Past 14-day window |
| Recovered | 25 | `recovered` | Success case testing |
| Canceled by User | 10 | `canceled` | User-initiated cancel |
| Canceled by System | 5 | `auto_canceled` | System auto-cancel |
| Downgraded | 5 | `downgraded` | Plan downgrade testing |
| High-Value | 10 | varies | High LTV testing |
| Low-Value | 10 | varies | Low LTV testing |

### 2.3 Mock Events Dataset

```json
{
  "payment_failed_events": [
    {
      "type": "payment_failed",
      "reason": "card_declined",
      "count": 30,
      "distribution": "random_24h"
    },
    {
      "type": "payment_failed",
      "reason": "insufficient_funds",
      "count": 20,
      "distribution": "random_24h"
    },
    {
      "type": "payment_failed",
      "reason": "expired_card",
      "count": 15,
      "distribution": "random_24h"
    },
    {
      "type": "payment_failed",
      "reason": "processing_error",
      "count": 5,
      "distribution": "random_24h"
    }
  ],
  "payment_succeeded_events": [
    {
      "type": "payment_succeeded",
      "after_failure": true,
      "count": 25,
      "distribution": "within_recovery_window"
    }
  ],
  "membership_events": [
    {
      "type": "membership_went_invalid",
      "count": 10
    },
    {
      "type": "membership_went_valid",
      "count": 8
    }
  ]
}
```

### 2.4 Recovery Cases Dataset

| Case Status | Count | Age Range | Purpose |
|-------------|-------|-----------|---------|
| `open` - Stage T+0 | 10 | 0-2 days | Initial nudge testing |
| `open` - Stage T+2 | 8 | 2-4 days | Follow-up reminder testing |
| `open` - Stage T+4 | 5 | 4-7 days | Final attempt testing |
| `open` - Near Expiry | 3 | 12-14 days | Expiry boundary testing |
| `recovered` | 25 | 1-14 days | Success metrics testing |
| `closed_no_recovery` | 15 | 14+ days | Auto-close testing |
| `canceled_by_creator` | 5 | varies | Manual cancel testing |
| `terminated` | 3 | varies | Immediate termination testing |

### 2.5 Test User Profiles

```typescript
const TEST_USERS = [
  // High engagement users
  { id: 'user_high_001', loginFrequency: 'daily', paymentHistory: 'excellent', ltv: 500 },
  { id: 'user_high_002', loginFrequency: 'daily', paymentHistory: 'good', ltv: 350 },

  // Medium engagement users
  { id: 'user_med_001', loginFrequency: 'weekly', paymentHistory: 'mixed', ltv: 150 },
  { id: 'user_med_002', loginFrequency: 'weekly', paymentHistory: 'good', ltv: 200 },

  // Low engagement users (churn risk)
  { id: 'user_low_001', loginFrequency: 'monthly', paymentHistory: 'poor', ltv: 50 },
  { id: 'user_low_002', loginFrequency: 'never', paymentHistory: 'single', ltv: 25 },

  // Edge case users
  { id: 'user_edge_001', loginFrequency: 'daily', paymentHistory: 'fraud_flag', ltv: 0 },
  { id: 'user_edge_002', loginFrequency: null, paymentHistory: 'refunded', ltv: -100 },
];
```

---

## 3. Tier-Specific Testing Matrix

### 3.1 Feature Access by Tier

| Feature | Free | Pro | Max | Test Priority |
|---------|------|-----|-----|---------------|
| Dashboard Access | ✅ | ✅ | ✅ | P0 |
| View KPIs | ❌ | ✅ | ✅ | P0 |
| Case List View | ✅ | ✅ | ✅ | P0 |
| Manual Nudge | ✅ | ✅ | ✅ | P0 |
| Auto Reminders (T+0,2,4) | ✅ | ✅ | ✅ | P0 |
| Incentive (Free Days) | ✅ | ✅ | ✅ | P0 |
| Recovery Limit | 3/mo | 100/mo | ∞ | P0 |
| CSV Export | ❌ | ✅ | ✅ | P1 |
| Custom Templates | ❌ | ❌ | ✅ | P1 |
| A/B Testing | ❌ | ❌ | ✅ | P2 |
| Priority Support | ❌ | ❌ | ✅ | P2 |
| Analytics Dashboard | ❌ | ✅ | ✅ | P1 |

### 3.2 FREE Tier Test Cases

#### TEST-FREE-001: Recovery Limit Enforcement
```gherkin
Feature: Free Tier Recovery Limit
  Scenario: Creator hits 3 recovery limit
    Given creator is on Free tier
    And creator has 2 successful recoveries this month
    When a new payment_failed event occurs
    And the case is recovered successfully
    Then recovery count should be 3
    When another payment_failed event occurs
    And the case is recovered
    Then system should show "limit reached" warning
    And recovery should NOT be counted toward metrics
    But case should still be tracked
```

#### TEST-FREE-002: Feature Gating
```gherkin
Feature: Free Tier Feature Restrictions
  Scenario: Attempt to access Pro features
    Given creator is logged in with Free tier
    When creator navigates to Analytics
    Then "Upgrade to Pro" modal should appear
    When creator clicks "Export CSV"
    Then "Upgrade to Pro" modal should appear
    When creator tries to customize templates
    Then "Upgrade to Max" modal should appear
```

### 3.3 PRO Tier Test Cases

#### TEST-PRO-001: 100 Recovery Limit
```gherkin
Feature: Pro Tier Recovery Limit
  Scenario: Creator approaches and hits 100 limit
    Given creator is on Pro tier
    And creator has 98 recoveries this month
    When 2 more cases are recovered
    Then recovery count should be 100
    And warning banner should appear "Limit reached"
    When creator tries 101st recovery
    Then case should still process
    But recovery should NOT count in metrics
    And upgrade prompt should be shown
```

#### TEST-PRO-002: CSV Export Functionality
```gherkin
Feature: Pro Tier CSV Export
  Scenario: Export all cases
    Given creator is on Pro tier
    And creator has 150 cases in system
    When creator clicks "Export CSV"
    Then export job should be queued
    And progress indicator should appear
    When export completes
    Then CSV should download
    And CSV should contain all 150 cases
    And CSV should have correct headers
    And data should match dashboard
```

#### TEST-PRO-003: Analytics Access
```gherkin
Feature: Pro Tier Analytics
  Scenario: View analytics dashboard
    Given creator is on Pro tier
    When creator navigates to Analytics
    Then recovery rate chart should load
    And revenue recovered chart should load
    And trend analysis should display
    And date range filter should work
```

### 3.4 MAX Tier Test Cases

#### TEST-MAX-001: Unlimited Recoveries
```gherkin
Feature: Max Tier Unlimited Recoveries
  Scenario: High volume recovery processing
    Given creator is on Max tier
    And creator has 500 recoveries this month
    When 100 more cases are recovered
    Then all should be counted
    And no limit warning should appear
    And performance should remain stable
```

#### TEST-MAX-002: Custom Templates
```gherkin
Feature: Max Tier Custom Templates
  Scenario: Create and use custom template
    Given creator is on Max tier
    When creator navigates to Messages
    Then "Create Custom Template" button should be visible
    When creator creates new Push template
    And saves template with custom copy
    Then template should appear in list
    When new recovery case triggers
    Then custom template should be used
    And message should contain custom copy
```

#### TEST-MAX-003: A/B Testing
```gherkin
Feature: Max Tier A/B Testing
  Scenario: Configure A/B test
    Given creator is on Max tier
    When creator creates A/B test for incentive
    And sets Control: 3 days, Variant: 7 days
    And sets 50/50 traffic split
    Then test should activate
    When new cases come in
    Then 50% should get 3 days incentive
    And 50% should get 7 days incentive
    And results should be tracked separately
```

### 3.5 Tier Transition Tests

#### TEST-TIER-UPGRADE-001: Free to Pro
```gherkin
Feature: Tier Upgrade
  Scenario: Creator upgrades from Free to Pro
    Given creator is on Free tier
    And creator has 3 recoveries (at limit)
    When creator completes Pro subscription
    Then tier should update to Pro
    And recovery limit should reset to 100
    And analytics should unlock
    And CSV export should unlock
    And historical data should be preserved
```

#### TEST-TIER-DOWNGRADE-001: Pro to Free
```gherkin
Feature: Tier Downgrade
  Scenario: Creator downgrades from Pro to Free
    Given creator is on Pro tier
    And creator has 50 recoveries this month
    When subscription expires (no renewal)
    Then tier should downgrade to Free
    And recovery limit should be 3
    But existing cases should be viewable
    And historical analytics should be viewable
    But new analytics should be locked
    And CSV export should be locked
```

---

## 4. Feature Test Suites

### 4.1 Webhook Processing Tests

#### WEBHOOK-001: Signature Validation
```gherkin
Scenario Outline: Webhook signature verification
  Given webhook secret is configured
  When webhook arrives with <signature_type>
  Then response should be <expected_response>

  Examples:
    | signature_type | expected_response |
    | valid_signature | 200 OK |
    | invalid_signature | 401 Unauthorized |
    | missing_signature | 401 Unauthorized |
    | expired_timestamp | 401 Unauthorized |
    | wrong_secret | 401 Unauthorized |
```

#### WEBHOOK-002: Event Deduplication
```gherkin
Scenario: Duplicate event handling
  Given event with whop_event_id "evt_123" was processed
  When same event arrives again
  Then event should NOT be reprocessed
  And response should be 200 OK (idempotent)
  And case should remain unchanged
```

#### WEBHOOK-003: All Event Types
```gherkin
Scenario Outline: Process all webhook event types
  Given system is ready
  When <event_type> webhook arrives
  Then <expected_action> should occur

  Examples:
    | event_type | expected_action |
    | payment_failed | Create recovery case |
    | payment_succeeded | Mark case recovered (if exists) |
    | membership_went_invalid | Log event, check case |
    | membership_went_valid | Update case status |
    | payment_pending | Create/update case |
    | invoice_past_due | Create case if not exists |
```

### 4.2 Case Management Tests

#### CASE-001: Case Creation
```gherkin
Scenario: New recovery case creation
  Given member "user_123" has active membership
  When payment_failed event arrives
  Then new case should be created
  And case status should be "open"
  And first_failure_at should be set
  And failure_reason should be captured
  And T+0 nudge should be scheduled
```

#### CASE-002: Manual Nudge
```gherkin
Scenario: Creator sends manual nudge
  Given case exists with status "open"
  When creator clicks "Send Nudge"
  Then confirmation modal should appear
  When creator confirms
  Then nudge should be sent via enabled channels
  And last_nudge_at should update
  And action should be logged in recovery_actions
```

#### CASE-003: Cancel at Period End
```gherkin
Scenario: Creator cancels membership at period end
  Given case exists with status "open"
  When creator clicks "Cancel at Period End"
  Then Whop API should be called
  And membership should be marked for cancellation
  And case status should update to "canceled_by_creator"
  And action should be logged
```

#### CASE-004: Immediate Termination
```gherkin
Scenario: Creator terminates immediately
  Given case exists with status "open"
  When creator clicks "Terminate Immediately"
  Then warning modal should appear
  When creator confirms termination
  Then Whop API should terminate membership
  And case status should update to "terminated"
  And member should lose access immediately
```

#### CASE-005: Case Recovery Success
```gherkin
Scenario: Payment succeeds within window
  Given case exists with status "open"
  And first_failure_at is 5 days ago
  When payment_succeeded event arrives
  Then case status should update to "recovered"
  And recovered_amount_cents should be set
  And KPIs should update
  And scheduled reminders should be canceled
```

#### CASE-006: Case Auto-Close
```gherkin
Scenario: Case expires after 14 days
  Given case exists with status "open"
  And first_failure_at is 14 days ago
  When expiry job runs
  Then case status should update to "closed_no_recovery"
  And no more nudges should be scheduled
```

#### CASE-007: Case Reopen
```gherkin
Scenario: Reopen closed case
  Given case exists with status "closed_no_recovery"
  When creator clicks "Reopen Case"
  Then case status should update to "open"
  And new nudge sequence should start
```

### 4.3 Notification Tests

#### NOTIFY-001: Push Notification
```gherkin
Scenario: Send push notification
  Given creator has push notifications enabled
  And case exists in "open" status
  When T+0 nudge triggers
  Then push notification should be sent
  And notification should contain:
    | Field | Value |
    | Title | "Action Required: Update Payment" |
    | Body | Contains incentive offer |
    | Button | "Manage Billing" |
    | Deep Link | Whop Billing Portal URL |
```

#### NOTIFY-002: Direct Message
```gherkin
Scenario: Send DM
  Given creator has DM notifications enabled
  And case exists in "open" status
  When manual nudge is sent
  Then DM should be sent via Whop API
  And message should contain:
    | Element | Present |
    | Personalized greeting | Yes |
    | Failure reason | Yes |
    | Incentive offer | If enabled |
    | Recovery link | Yes |
```

#### NOTIFY-003: Channel Toggle
```gherkin
Scenario: Disable push, keep DM
  Given creator has both channels enabled
  When creator disables push in settings
  And saves settings
  Then only DM should be sent for new cases
  And push should NOT be sent
```

#### NOTIFY-004: Both Channels Disabled
```gherkin
Scenario: All notifications disabled
  Given creator has both channels disabled
  When new case is created
  Then no notifications should be sent
  And case should still be tracked
  And creator should see warning in dashboard
```

### 4.4 Incentive Tests

#### INCENT-001: Free Days Application
```gherkin
Scenario: Apply free days incentive
  Given creator has incentive enabled (3 days)
  And new case is created
  When T+0 nudge is sent
  Then 3 free days should be added to membership
  And incentive should be logged in case
  And notification should mention free days
```

#### INCENT-002: One-Time Incentive
```gherkin
Scenario: Incentive applied only once
  Given case has already received incentive
  When T+2 reminder is sent
  Then incentive should NOT be applied again
  And message should NOT mention new free days
```

#### INCENT-003: Incentive Toggle
```gherkin
Scenario: Disable incentive mid-case
  Given creator has incentive enabled
  And case exists without incentive yet
  When creator disables incentive in settings
  And nudge is sent for existing case
  Then no incentive should be applied
```

#### INCENT-004: Custom Incentive Amount
```gherkin
Scenario: Configure custom incentive days
  Given creator is on Pro tier
  When creator sets incentive to 7 days
  And saves settings
  Then new cases should receive 7 free days
```

### 4.5 Dashboard & Analytics Tests

#### DASH-001: KPI Accuracy
```gherkin
Scenario: Verify KPI calculations
  Given company has following data:
    | Metric | Value |
    | Total cases (30 days) | 100 |
    | Recovered cases | 25 |
    | Recovered revenue | $2,500 |
    | Incentive cost | $150 |
  When dashboard loads
  Then KPIs should show:
    | KPI | Value |
    | Total Failures | 100 |
    | Total Recoveries | 25 |
    | Recovery Rate | 25% |
    | Net Revenue | $2,350 |
```

#### DASH-002: Case List Filtering
```gherkin
Scenario: Filter cases by status
  Given 100 cases exist with various statuses
  When creator filters by "open"
  Then only open cases should appear
  When creator filters by date range
  Then only cases in range should appear
  When creator clears filters
  Then all cases should appear
```

#### DASH-003: Case List Pagination
```gherkin
Scenario: Paginate large case list
  Given 500 cases exist
  When dashboard loads
  Then first 25 cases should show
  And pagination controls should appear
  When creator clicks "Next"
  Then next 25 cases should load
  When creator jumps to page 10
  Then correct cases should display
```

#### DASH-004: Real-time Updates
```gherkin
Scenario: Dashboard updates in real-time
  Given dashboard is open
  When new payment_failed event arrives (background)
  Then case count should increment
  And new case should appear in list
  When case is recovered (background)
  Then KPIs should update
  And case status should change in list
```

### 4.6 Settings Tests

#### SET-001: Save and Load Settings
```gherkin
Scenario: Persist settings
  Given creator is on settings page
  When creator makes changes:
    | Setting | New Value |
    | Push enabled | false |
    | DM enabled | true |
    | Incentive days | 5 |
    | T+2 offset | 3 days |
  And clicks "Save"
  Then success toast should appear
  When creator refreshes page
  Then settings should show saved values
```

#### SET-002: Settings Validation
```gherkin
Scenario: Invalid settings rejected
  Given creator is on settings page
  When creator enters invalid incentive: -5 days
  And clicks "Save"
  Then validation error should appear
  And settings should NOT be saved
```

#### SET-003: Settings Reset
```gherkin
Scenario: Reset to defaults
  Given creator has custom settings
  When creator clicks "Reset to Defaults"
  Then confirmation modal should appear
  When creator confirms
  Then settings should reset to:
    | Setting | Default |
    | Push enabled | true |
    | DM enabled | true |
    | Incentive days | 3 |
```

### 4.7 CSV Export Tests

#### CSV-001: Basic Export
```gherkin
Scenario: Export cases to CSV
  Given creator is on Pro tier
  And 50 cases exist
  When creator clicks "Export CSV"
  Then export job should queue
  And progress should display
  When export completes
  Then CSV should download
  And CSV should have 51 rows (header + 50 cases)
```

#### CSV-002: Export Headers
```gherkin
Scenario: Verify CSV structure
  Given CSV is exported
  Then headers should include:
    | Header |
    | case_id |
    | membership_id |
    | user_id |
    | status |
    | failure_reason |
    | first_failure_at |
    | recovered_at |
    | recovered_amount |
    | incentive_applied |
    | nudge_count |
```

#### CSV-003: Export with Filters
```gherkin
Scenario: Export filtered results
  Given creator filters cases by "recovered"
  When creator exports CSV
  Then CSV should only contain recovered cases
  And row count should match filtered count
```

#### CSV-004: Large Export
```gherkin
Scenario: Export 10,000+ cases
  Given creator has 10,000 cases
  When creator exports CSV
  Then export should complete within 60 seconds
  And CSV should contain all 10,000 cases
  And file should be properly formatted
```

---

## 5. End-to-End User Journey Tests

### 5.1 Journey: New Creator Onboarding

```gherkin
Feature: New Creator Onboarding Journey

  Scenario: First-time creator setup
    # Step 1: App Installation
    Given creator has Whop store
    When creator installs ChurnSaver from App Store
    Then ChurnSaver should open in iframe
    And welcome/onboarding modal should appear

    # Step 2: Initial Configuration
    When creator completes onboarding:
      | Step | Action |
      | Channels | Enable Push and DM |
      | Incentive | Set to 3 days |
      | Review | Confirm settings |
    Then settings should be saved
    And dashboard should load

    # Step 3: First Webhook
    When first payment_failed event arrives
    Then case should be created
    And T+0 nudge should be sent
    And dashboard should show 1 failure

    # Step 4: First Recovery
    When member updates payment method
    And payment_succeeded event arrives
    Then case should be marked recovered
    And dashboard should show 1 recovery
    And "First Recovery!" celebration should appear
```

### 5.2 Journey: Daily Operations

```gherkin
Feature: Daily Creator Operations

  Scenario: Creator daily workflow
    # Morning Check
    Given creator logs into dashboard
    Then KPIs should load within 2 seconds
    And any new failures since last login should highlight

    # Review New Cases
    When creator filters by "New Today"
    Then today's cases should display
    When creator reviews a case
    Then case details should show:
      | Info | Present |
      | Member info | Yes |
      | Failure reason | Yes |
      | Timeline | Yes |
      | Actions taken | Yes |

    # Manual Intervention
    When creator sees high-value member at risk
    And clicks "Send Personal Nudge"
    Then custom message option should appear (Max tier)
    When nudge is sent
    Then success confirmation should show

    # End of Day Export
    When creator exports today's cases
    Then CSV should download
    And can be imported to external tools
```

### 5.3 Journey: Recovery Success

```gherkin
Feature: Full Recovery Journey

  Scenario: Member recovers after initial nudge
    Given member "user_456" fails payment (card declined)

    # T+0: Immediate Response
    When payment_failed webhook arrives
    Then case is created
    And push notification sent: "Update your payment"
    And DM sent with personalized message
    And 3 free days added to membership

    # Member Action
    When member clicks "Manage Billing" link
    Then member lands on Whop Billing Portal
    When member updates card details
    And payment succeeds

    # Recovery Complete
    When payment_succeeded webhook arrives
    Then case status changes to "recovered"
    And scheduled T+2, T+4 reminders are canceled
    And KPIs update in real-time
    And creator sees updated dashboard
```

### 5.4 Journey: Full Reminder Sequence

```gherkin
Feature: Complete Reminder Sequence

  Scenario: Member ignores all nudges
    Given member "user_789" fails payment

    # T+0
    When case is created
    Then initial nudge is sent
    And member receives push + DM

    # T+2 (No response)
    When 2 days pass
    And scheduler runs
    Then T+2 reminder is sent
    And message emphasizes urgency

    # T+4 (No response)
    When 2 more days pass
    And scheduler runs
    Then T+4 final reminder is sent
    And message is "last chance" tone

    # T+14 (Expiry)
    When 10 more days pass
    And expiry job runs
    Then case is auto-closed
    And status is "closed_no_recovery"
    And member's access ends (via Whop)
```

### 5.5 Journey: Tier Upgrade

```gherkin
Feature: Tier Upgrade Journey

  Scenario: Free creator upgrades to Pro
    Given creator is on Free tier
    And has hit 3 recovery limit

    # Limit Hit
    When 4th case comes in
    Then "Upgrade to Pro" banner appears
    And case is still tracked (just not counted)

    # Upgrade Flow
    When creator clicks "Upgrade"
    Then pricing modal appears
    When creator selects Pro Monthly ($49)
    And completes payment
    Then subscription webhook arrives
    And tier updates to Pro

    # Post-Upgrade
    When dashboard reloads
    Then recovery limit shows 100
    And Analytics tab unlocks
    And CSV Export unlocks
    And historical data is preserved
```

---

## 6. Edge Cases & Error Scenarios

### 6.1 Webhook Edge Cases

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| EDGE-WH-001 | Webhook arrives before member exists | Log error, don't create case |
| EDGE-WH-002 | Duplicate event within 1ms | Process only once |
| EDGE-WH-003 | Out-of-order events (success before failure) | Handle gracefully, don't create spurious case |
| EDGE-WH-004 | Webhook with missing company_id | Return 400, log error |
| EDGE-WH-005 | Webhook timeout (>30s processing) | Retry mechanism kicks in |
| EDGE-WH-006 | 1000 webhooks in 1 minute | Queue handles without dropping |
| EDGE-WH-007 | payment_succeeded for non-existent case | Log, no error |
| EDGE-WH-008 | Malformed JSON payload | Return 400, log payload |

### 6.2 Case Management Edge Cases

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| EDGE-CASE-001 | Same member fails twice in 24h | Single case, not duplicate |
| EDGE-CASE-002 | Member recovers then fails again same day | Create new case |
| EDGE-CASE-003 | Manual nudge on closed case | Reopen case first |
| EDGE-CASE-004 | Terminate member who already left | Handle gracefully |
| EDGE-CASE-005 | Case with $0 recovered amount | Track as recovered, $0 revenue |
| EDGE-CASE-006 | Case from deleted membership | Archive case, show warning |
| EDGE-CASE-007 | 10,000 concurrent open cases | Performance within SLA |
| EDGE-CASE-008 | Case older than retention period | Comply with data retention |

### 6.3 Notification Edge Cases

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| EDGE-NOTIF-001 | Whop Push API down | Queue for retry, log error |
| EDGE-NOTIF-002 | Whop DM API rate limited | Backoff and retry |
| EDGE-NOTIF-003 | Member blocked notifications | Log failed delivery |
| EDGE-NOTIF-004 | Empty notification content | Fallback to default template |
| EDGE-NOTIF-005 | 1000 notifications in 1 minute | Batch and rate limit |
| EDGE-NOTIF-006 | Notification to deleted user | Handle gracefully |

### 6.4 UI/UX Edge Cases

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| EDGE-UI-001 | Dashboard with 0 cases | Empty state with helpful text |
| EDGE-UI-002 | Dashboard with 50,000 cases | Virtual scrolling, fast load |
| EDGE-UI-003 | Very long failure reason text | Truncate with tooltip |
| EDGE-UI-004 | Special characters in member name | Escape properly, display correctly |
| EDGE-UI-005 | Screen reader navigation | Full accessibility |
| EDGE-UI-006 | Mobile viewport (320px) | Responsive layout |
| EDGE-UI-007 | Offline mode | Graceful degradation message |
| EDGE-UI-008 | Session timeout | Redirect to re-auth |

### 6.5 Concurrency Edge Cases

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| EDGE-CONC-001 | Two webhooks for same event (race) | Only one processed |
| EDGE-CONC-002 | Manual nudge during auto nudge | No duplicate notification |
| EDGE-CONC-003 | Settings save during case processing | Atomic, consistent state |
| EDGE-CONC-004 | Export while cases updating | Consistent snapshot |
| EDGE-CONC-005 | Tier change during case creation | Use new tier limits |

### 6.6 Error Handling Tests

```gherkin
Scenario Outline: Error handling
  Given <precondition>
  When <action>
  Then <expected_error>
  And <recovery_action>

  Examples:
    | precondition | action | expected_error | recovery_action |
    | DB connection lost | Dashboard load | "Service temporarily unavailable" | Auto-retry with backoff |
    | Invalid auth token | Any API call | 401 redirect to login | Clear session, re-auth |
    | Whop API 500 | Send nudge | "Failed to send, will retry" | Queue for retry |
    | Rate limit exceeded | Bulk operation | "Too many requests" | Show countdown timer |
    | Concurrent edit conflict | Save settings | "Settings changed, refresh" | Show diff, merge option |
```

---

## 7. Performance & Load Testing

### 7.1 Performance Benchmarks

| Metric | Target | Test Method |
|--------|--------|-------------|
| Dashboard initial load | <2s (4G) | Lighthouse, WebPageTest |
| Dashboard with 1000 cases | <3s | Load test with data |
| Webhook processing | <1s p95 | Artillery/k6 load test |
| API response time | <200ms p95 | New Relic APM |
| CSV export (10k rows) | <60s | Functional test |
| Concurrent users | 100 | k6 stress test |

### 7.2 Load Test Scenarios

```yaml
# k6 load test configuration
scenarios:
  webhook_spike:
    executor: 'ramping-arrival-rate'
    startRate: 10
    timeUnit: '1s'
    preAllocatedVUs: 100
    maxVUs: 500
    stages:
      - duration: '1m', target: 100  # Ramp to 100 rps
      - duration: '5m', target: 100  # Hold at 100 rps
      - duration: '1m', target: 500  # Spike to 500 rps
      - duration: '1m', target: 100  # Back to normal

  dashboard_concurrent:
    executor: 'constant-vus'
    vus: 50
    duration: '10m'

  export_stress:
    executor: 'per-vu-iterations'
    vus: 10
    iterations: 5  # 10 users each export 5 times
```

### 7.3 Performance Test Cases

| Test ID | Scenario | Pass Criteria |
|---------|----------|---------------|
| PERF-001 | 100 webhooks/second sustained | <1s p99 processing |
| PERF-002 | 500 webhook burst | Queue handles, no drops |
| PERF-003 | 50 concurrent dashboard sessions | <3s load time all |
| PERF-004 | 1000 case list render | Smooth scrolling, no jank |
| PERF-005 | 10 concurrent CSV exports | All complete <120s |
| PERF-006 | Settings save under load | <500ms response |
| PERF-007 | Memory usage over 24h | No leaks, stable |
| PERF-008 | DB connection pool exhaustion | Graceful queuing |

---

## 8. Security Testing

### 8.1 Authentication Tests

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| SEC-AUTH-001 | Access dashboard without auth | Redirect to Whop auth |
| SEC-AUTH-002 | Expired session token | Re-authenticate flow |
| SEC-AUTH-003 | Invalid x-whop-user-token | 401 Unauthorized |
| SEC-AUTH-004 | Token for different company | 403 Forbidden |
| SEC-AUTH-005 | Attempt to forge token | Signature validation fails |

### 8.2 Authorization Tests

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| SEC-AUTHZ-001 | Company A access Company B data | 403, RLS blocks |
| SEC-AUTHZ-002 | Free tier access Pro feature | Feature gating modal |
| SEC-AUTHZ-003 | Modify case from other company | 403, audit logged |
| SEC-AUTHZ-004 | Export data from other company | Empty result, logged |
| SEC-AUTHZ-005 | Escalate tier via API manipulation | Validation fails |

### 8.3 Data Security Tests

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| SEC-DATA-001 | PII in URL parameters | Never exposed |
| SEC-DATA-002 | Sensitive data in logs | Redacted |
| SEC-DATA-003 | Database direct access | Encrypted at rest |
| SEC-DATA-004 | API response data leakage | Only authorized data |
| SEC-DATA-005 | Export contains foreign data | RLS prevents |

### 8.4 Webhook Security Tests

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| SEC-WH-001 | Replay old webhook | Timestamp validation fails |
| SEC-WH-002 | Modified payload | Signature mismatch |
| SEC-WH-003 | Webhook from unknown IP | Process (Whop uses various IPs) |
| SEC-WH-004 | Oversized payload | 413, rejected |
| SEC-WH-005 | SQL injection in payload | Parameterized queries protect |
| SEC-WH-006 | XSS in failure_reason | Sanitized on display |

### 8.5 Multi-Tenant Isolation Tests

```gherkin
Feature: Multi-Tenant Data Isolation

  Scenario: Company A cannot see Company B data
    Given Company A has 50 cases
    And Company B has 30 cases

    When Company A user loads dashboard
    Then only Company A's 50 cases appear
    And API returns only Company A data

    When Company A user tries direct API:
      GET /api/cases/[company_b_case_id]
    Then 404 Not Found (not 403, to avoid enumeration)

    When Company A user tries SQL injection:
      GET /api/cases?filter=1' OR company_id='company_b'
    Then parameterized query blocks
    And only Company A results return
```

---

## 9. Compliance Testing

### 9.1 GDPR Compliance Tests

| Test ID | Requirement | Test |
|---------|-------------|------|
| GDPR-001 | Right to Access | User can export all their data |
| GDPR-002 | Right to Erasure | User deletion removes all PII |
| GDPR-003 | Data Minimization | Only necessary data collected |
| GDPR-004 | Consent | Notification consent tracked |
| GDPR-005 | Data Portability | Export in machine-readable format |
| GDPR-006 | Breach Notification | Audit trail exists |

### 9.2 Data Retention Tests

```gherkin
Feature: Data Retention Policy

  Scenario: Old data is purged
    Given event is 366 days old
    When retention job runs
    Then event should be deleted
    And audit log should record deletion

  Scenario: Active case data preserved
    Given case is 100 days old but still open
    When retention job runs
    Then case should NOT be deleted

  Scenario: Recovered case retention
    Given case was recovered 400 days ago
    When retention job runs
    Then case should be deleted
    But aggregated metrics preserved (anonymized)
```

### 9.3 Accessibility Tests (WCAG 2.1 AA)

| Test ID | Requirement | Test Method |
|---------|-------------|-------------|
| A11Y-001 | Keyboard navigation | Tab through all interactive elements |
| A11Y-002 | Screen reader | VoiceOver/NVDA full flow |
| A11Y-003 | Color contrast | 4.5:1 minimum |
| A11Y-004 | Focus indicators | Visible on all elements |
| A11Y-005 | Alt text | All images have descriptions |
| A11Y-006 | Form labels | All inputs labeled |
| A11Y-007 | Error announcements | ARIA live regions work |
| A11Y-008 | Zoom to 200% | Layout remains usable |

---

## 10. Test Execution Checklist

### 10.1 Pre-Test Setup

- [ ] Test environment deployed and accessible
- [ ] Test database initialized with seed data
- [ ] All test accounts created (Free, Pro, Max)
- [ ] Webhook endpoint configured for test environment
- [ ] Mock Whop API responses configured
- [ ] Monitoring and logging enabled
- [ ] Test data generator script ready
- [ ] All team members have test credentials

### 10.2 Test Execution Order

#### Phase 1: Foundation (Day 1-2)
- [ ] Environment smoke test
- [ ] Authentication flows (SEC-AUTH-*)
- [ ] Webhook signature validation (WEBHOOK-001)
- [ ] Basic case creation (CASE-001)

#### Phase 2: Core Features (Day 3-5)
- [ ] All webhook event types (WEBHOOK-003)
- [ ] Case lifecycle (CASE-001 to CASE-007)
- [ ] Notification channels (NOTIFY-001 to NOTIFY-004)
- [ ] Incentive system (INCENT-001 to INCENT-004)
- [ ] Dashboard & KPIs (DASH-001 to DASH-004)

#### Phase 3: Tier Testing (Day 6-7)
- [ ] Free tier limits (TEST-FREE-*)
- [ ] Pro tier features (TEST-PRO-*)
- [ ] Max tier features (TEST-MAX-*)
- [ ] Tier transitions (TEST-TIER-*)

#### Phase 4: Edge Cases (Day 8-9)
- [ ] All edge case scenarios (EDGE-*)
- [ ] Error handling
- [ ] Concurrent operations

#### Phase 5: Non-Functional (Day 10-11)
- [ ] Performance benchmarks (PERF-*)
- [ ] Load testing
- [ ] Security testing (SEC-*)

#### Phase 6: Compliance & Polish (Day 12)
- [ ] GDPR compliance (GDPR-*)
- [ ] Data retention
- [ ] Accessibility (A11Y-*)
- [ ] End-to-end journeys

### 10.3 Test Completion Criteria

| Category | Pass Criteria |
|----------|---------------|
| Functional | 100% of P0 tests pass, 95% of P1 pass |
| Performance | All benchmarks within 10% of target |
| Security | 0 critical/high vulnerabilities |
| Compliance | 100% GDPR tests pass |
| Accessibility | WCAG 2.1 AA compliant |

### 10.4 Bug Severity Definitions

| Severity | Definition | Example |
|----------|------------|---------|
| Critical | System down, data loss | Webhook processing fails completely |
| High | Major feature broken | Recovery cases not created |
| Medium | Feature degraded | CSV export missing columns |
| Low | Minor issue | Typo in notification |
| Enhancement | Improvement idea | Better loading animation |

### 10.5 Test Reporting Template

```markdown
## Test Execution Report

**Date:** YYYY-MM-DD
**Environment:** test.churnsaver.app
**Tester:** [Name]

### Summary
- Total Tests: X
- Passed: X (X%)
- Failed: X (X%)
- Blocked: X (X%)
- Not Run: X

### Failed Tests
| Test ID | Title | Severity | Notes |
|---------|-------|----------|-------|
| | | | |

### Blocked Tests
| Test ID | Blocker | Resolution |
|---------|---------|------------|
| | | |

### Performance Results
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| | | | |

### Recommendations
1.
2.
3.
```

---

## Appendix A: Test Data SQL Scripts

### A.1 Create Test Companies

```sql
-- Insert test companies for each tier
INSERT INTO companies (id, name, tier, created_at) VALUES
  ('company_free_001', 'Free Test Co', 'free', NOW()),
  ('company_free_002', 'Free Test Co 2', 'free', NOW()),
  ('company_pro_001', 'Pro Test Co', 'pro_monthly', NOW()),
  ('company_pro_002', 'Pro Annual Co', 'pro_annual', NOW()),
  ('company_max_001', 'Max Test Co', 'max_monthly', NOW()),
  ('company_max_002', 'Max Annual Co', 'max_annual', NOW()),
  ('company_expired_001', 'Expired Co', NULL, NOW() - INTERVAL '90 days'),
  ('company_downgrade_001', 'Downgrade Co', 'free', NOW());
```

### A.2 Create Test Cases

```sql
-- Generate diverse test cases
INSERT INTO recovery_cases (
  id, company_id, membership_id, user_id,
  status, failure_reason, first_failure_at,
  recovered_at, recovered_amount_cents, incentive_days
)
SELECT
  'case_' || generate_series,
  CASE (generate_series % 6)
    WHEN 0 THEN 'company_free_001'
    WHEN 1 THEN 'company_pro_001'
    WHEN 2 THEN 'company_max_001'
    ELSE 'company_pro_001'
  END,
  'mem_' || generate_series,
  'user_' || generate_series,
  CASE (generate_series % 5)
    WHEN 0 THEN 'open'
    WHEN 1 THEN 'recovered'
    WHEN 2 THEN 'closed_no_recovery'
    WHEN 3 THEN 'canceled_by_creator'
    ELSE 'open'
  END,
  CASE (generate_series % 4)
    WHEN 0 THEN 'card_declined'
    WHEN 1 THEN 'insufficient_funds'
    WHEN 2 THEN 'expired_card'
    ELSE 'processing_error'
  END,
  NOW() - (generate_series % 30 || ' days')::INTERVAL,
  CASE WHEN generate_series % 5 = 1
    THEN NOW() - ((generate_series % 14) || ' days')::INTERVAL
    ELSE NULL
  END,
  CASE WHEN generate_series % 5 = 1
    THEN (generate_series * 100) + 2999
    ELSE NULL
  END,
  CASE WHEN generate_series % 3 = 0 THEN 3 ELSE 0 END
FROM generate_series(1, 500);
```

### A.3 Create Test Events

```sql
-- Generate webhook events for testing
INSERT INTO events (
  whop_event_id, type, company_id, membership_id,
  payload, processed, created_at
)
SELECT
  'evt_' || generate_series,
  CASE (generate_series % 4)
    WHEN 0 THEN 'payment_failed'
    WHEN 1 THEN 'payment_succeeded'
    WHEN 2 THEN 'membership_went_invalid'
    ELSE 'membership_went_valid'
  END,
  'company_pro_001',
  'mem_' || (generate_series % 100),
  jsonb_build_object(
    'amount_cents', (generate_series * 100) + 999,
    'reason', 'test_event'
  ),
  TRUE,
  NOW() - (generate_series || ' hours')::INTERVAL
FROM generate_series(1, 1000);
```

---

## Appendix B: Mock Whop API Responses

### B.1 Membership Response

```json
{
  "id": "mem_test_123",
  "user_id": "user_test_456",
  "product_id": "prod_churnsaver_001",
  "plan_id": "plan_monthly",
  "status": "active",
  "valid": true,
  "created_at": "2024-01-15T10:30:00Z",
  "current_period_end": "2024-02-15T10:30:00Z",
  "manage_url": "https://whop.com/billing/manage/mem_test_123"
}
```

### B.2 Payment Failed Event

```json
{
  "event_id": "evt_payment_failed_001",
  "type": "payment_failed",
  "created_at": "2024-02-01T15:45:00Z",
  "data": {
    "membership_id": "mem_test_123",
    "user_id": "user_test_456",
    "company_id": "company_pro_001",
    "amount_cents": 4999,
    "failure_reason": "card_declined",
    "failure_message": "Your card was declined"
  }
}
```

### B.3 Send Notification Response

```json
{
  "success": true,
  "notification_id": "notif_001",
  "delivered_at": "2024-02-01T15:45:30Z"
}
```

---

## Appendix C: Automated Test Script

```typescript
// run-full-test-suite.ts
import { exec } from 'child_process';
import { writeFileSync } from 'fs';

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  duration: number;
}

async function runTestSuite(name: string, command: string): Promise<TestResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      const duration = Date.now() - start;
      const passed = (stdout.match(/✓/g) || []).length;
      const failed = (stdout.match(/✗/g) || []).length;
      resolve({ suite: name, passed, failed, duration });
    });
  });
}

async function main() {
  const results: TestResult[] = [];

  // Run all test suites
  results.push(await runTestSuite('Unit Tests', 'pnpm test:unit'));
  results.push(await runTestSuite('Integration Tests', 'pnpm test:integration'));
  results.push(await runTestSuite('E2E Tests', 'pnpm test:e2e'));
  results.push(await runTestSuite('Security Tests', 'pnpm test:security'));
  results.push(await runTestSuite('Performance Tests', 'pnpm test:perf'));

  // Generate report
  const report = generateReport(results);
  writeFileSync('test-report.md', report);
  console.log('Test suite complete. Report saved to test-report.md');
}

function generateReport(results: TestResult[]): string {
  const total = results.reduce((acc, r) => ({
    passed: acc.passed + r.passed,
    failed: acc.failed + r.failed,
    duration: acc.duration + r.duration
  }), { passed: 0, failed: 0, duration: 0 });

  return `# ChurnSaver Test Report
Generated: ${new Date().toISOString()}

## Summary
- **Total Passed:** ${total.passed}
- **Total Failed:** ${total.failed}
- **Pass Rate:** ${((total.passed / (total.passed + total.failed)) * 100).toFixed(1)}%
- **Duration:** ${(total.duration / 1000).toFixed(1)}s

## Suite Results
${results.map(r => `
### ${r.suite}
- Passed: ${r.passed}
- Failed: ${r.failed}
- Duration: ${(r.duration / 1000).toFixed(1)}s
`).join('')}
`;
}

main();
```

---

**Document Version:** 1.0
**Created:** $(date)
**Last Updated:** $(date)
**Author:** Test Engineering Team
