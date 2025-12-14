# Whop Webhook Events Configuration

## Staging Webhook Configuration

**Webhook URL**: `https://churnsaver-staging.vercel.app/api/webhooks/whop`

**Required Events** (subscribe to these in Whop Dashboard):

### Core Recovery Events
- ✅ **`payment_failed`** - Triggers recovery case creation when a payment fails
- ✅ **`payment_succeeded`** - Marks recovery case as recovered when payment succeeds

### Membership Lifecycle Events
- ✅ **`membership_activated`** - Tracks new/activated memberships
- ✅ **`membership_deactivated`** - Handles membership termination/deactivation

## Optional Events (for future features)

These events are available but not currently required:

- `invoice_created` - Track invoice creation
- `invoice_paid` - Track invoice payments
- `invoice_past_due` - Track overdue invoices
- `invoice_voided` - Track voided invoices
- `entry_created` - Track entry creation
- `entry_approved` - Track entry approvals
- `entry_denied` - Track entry denials
- `entry_deleted` - Track entry deletions
- `payment_created` - Track payment creation
- `payment_pending` - Track pending payments
- `dispute_created` - Track disputes
- `dispute_updated` - Track dispute updates
- `refund_created` - Track refunds
- `refund_updated` - Track refund updates

## Event Processing

The webhook handler automatically normalizes event types, so both formats work:
- `payment_failed` ✅ (Whop's format)
- `payment.failed` ✅ (also supported via normalization)

## Configuration Steps

1. Navigate to: https://whop.com/dashboard/biz_hqNeRcxEMkuyOL/developer/
2. Select app: "Churn Saver [st]" (`app_oU8bWaXO`)
3. Go to: Settings → Webhooks
4. Create/Update webhook:
   - **URL**: `https://churnsaver-staging.vercel.app/api/webhooks/whop`
   - **Secret**: Must match `WHOP_WEBHOOK_SECRET` in Vercel
   - **Events**: Select the 4 required events listed above
5. Save and test

## Verification

After configuration, test the webhook:
1. Use Whop's test webhook feature (if available)
2. Or send a test event manually
3. Verify the event is accepted (200 response)
4. Check Vercel logs to confirm processing
5. Verify event appears in Supabase `events` table

