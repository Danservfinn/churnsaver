# Churn Saver User Guide

## Overview

Churn Saver automatically recovers failed subscription payments through intelligent nudges, incentives, and multi-channel communication. This guide covers all features and configuration options.

## Core Concepts

### Recovery Cases

A recovery case represents one attempt to recover revenue from a failed payment:

- **Created**: When first payment failure detected
- **Status**: `open`, `recovered`, `closed_no_recovery`
- **Attempts**: Number of recovery messages sent
- **Revenue**: Amount recovered (when successful)

### Attribution Window

Churn Saver attributes successful payments to recovery efforts for **14 days** after the initial failure. This ensures accurate ROI tracking.

### Communication Channels

#### Push Notifications
- **Delivery**: Immediate to user devices
- **Content**: Short, urgent recovery messages
- **Best For**: Immediate awareness and action

#### Direct Messages
- **Delivery**: In-app messages on Whop
- **Content**: Detailed recovery offers with links
- **Best For**: Personalized offers and instructions

## Configuration

### Basic Settings

#### Communication Channels

```typescript
{
  enable_push: true,      // Send push notifications
  enable_dm: true,        // Send direct messages
}
```

**Recommendation**: Enable both channels for maximum recovery rates.

#### Recovery Incentives

```typescript
{
  incentive_days: 3,      // Free days on first failure
}
```

**Options**: 0, 1, 3, 7, 14, 30 days

#### Reminder Schedule

```typescript
{
  reminder_offsets_days: [0, 2, 4]  // Days after failure
}
```

**Explanation**:
- `0`: Immediate (within minutes)
- `2`: Follow-up after 2 days
- `4`: Final attempt after 4 days

### Advanced Settings

#### Attribution Window

Currently fixed at 14 days. This determines how long successful payments are attributed to recovery efforts.

#### Case Merging

Multiple payment failures for the same membership within the attribution window are merged into a single recovery case.

#### Anti-Spam Protection

Prevents sending multiple messages within short timeframes, even if manually triggered.

## Dashboard

### KPI Overview

#### Active Cases
Number of open recovery cases currently being worked.

#### Recoveries
Total successful recoveries in the selected time window.

#### Recovery Rate
(Recoveries / Total Cases) × 100

#### Recovered Revenue
Total dollars recovered through successful payments.

#### Total Cases
All recovery cases (open + recovered + closed) in time window.

### Cases Table

#### Columns
- **Case ID**: Unique identifier
- **Membership ID**: Whop membership identifier
- **User ID**: Whop user identifier
- **Status**: Current case status
- **Attempts**: Number of nudges sent
- **Incentive Days**: Free days offered
- **Recovered Amount**: Revenue recovered
- **First Failure**: When failure occurred
- **Last Nudge**: When last message sent

#### Actions
- **Nudge**: Send immediate recovery message
- **Cancel**: Close case (stop recovery attempts)
- **Terminate**: Cancel membership (final action)

### Filtering & Export

#### Filters
- **Status**: open, recovered, closed_no_recovery
- **Date Range**: First failure date filter
- **Search**: By membership or user ID

#### Export
- **CSV Format**: All visible columns
- **Date Range**: Respects current filters
- **Filename**: `recovery_cases_YYYYMMDD_HHMM.csv`

## Message Templates

### Push Notification Template

```
💳 Payment Failed - Your membership needs attention

We've detected a payment issue with your membership. Click to resolve and keep access to exclusive content.
```

### Direct Message Template

```
Hi there,

We noticed your recent payment for [Membership Name] didn't go through. No worries - we've added [X] free days to give you time to update your payment method.

Click here to update payment: [Manage URL]

Your support means everything to us. Let's get this sorted!

Best,
[Creator Name]
```

### Customization Options

Currently, message templates are fixed but include:
- Membership name insertion
- Incentive amount display
- Direct payment links
- Personalized sender information

## Best Practices

### Setup Phase

#### Week 1: Testing
1. Create test payment failures
2. Verify notifications arrive
3. Test recovery flow end-to-end
4. Confirm dashboard tracking

#### Week 2: Optimization
1. Monitor open rates and response rates
2. Adjust incentive amounts based on data
3. Fine-tune reminder timing
4. Identify common failure reasons

### Ongoing Management

#### Daily Monitoring
- Check for unusual failure spikes
- Monitor recovery rate trends
- Review high-value recovery cases

#### Weekly Review
- Analyze recovery performance
- Adjust settings based on data
- Clean up old cases
- Plan incentive budget

#### Monthly Analysis
- Calculate ROI of recovery program
- Identify improvement opportunities
- Review message effectiveness
- Plan feature updates

## Troubleshooting

### Webhook Issues

#### Symptoms
- No new recovery cases appearing
- Dashboard shows no recent activity

#### Solutions
1. Check webhook URL in Whop settings
2. Verify webhook secret matches
3. Review server logs for signature errors
4. Test webhook endpoint manually

### Notification Issues

#### Symptoms
- Users not receiving messages
- Push notifications not working

#### Solutions
1. Verify channel settings enabled
2. Check user notification preferences
3. Test with known working membership
4. Review error logs

### Incentive Issues

#### Symptoms
- Free days not applying
- Users reporting no incentives

#### Solutions
1. Confirm membership supports free days
2. Check incentive settings
3. Verify API permissions
4. Test with small incentive amount

### Performance Issues

#### Symptoms
- Dashboard slow to load
- Webhook responses delayed

#### Solutions
1. Check database connection
2. Review server resource usage
3. Optimize query performance
4. Consider database scaling

## API Reference

### Webhook Endpoints

#### Payment Failed
```json
{
  "type": "payment_failed",
  "data": {
    "membership": {
      "id": "mem_xxx",
      "user_id": "usr_xxx"
    },
    "payment": {
      "amount": 999,
      "currency": "usd",
      "failure_reason": "card_declined"
    }
  }
}
```

#### Payment Succeeded
```json
{
  "type": "payment_succeeded",
  "data": {
    "membership": {
      "id": "mem_xxx",
      "user_id": "usr_xxx"
    },
    "payment": {
      "amount": 2499,
      "currency": "usd"
    }
  }
}
```

### Dashboard APIs

#### KPIs Endpoint
```
GET /api/dashboard/kpis?window=14
```

#### Cases Endpoint
```
GET /api/dashboard/cases?page=1&limit=10&status=open&startDate=2024-01-01
```

#### Export Endpoint
```
GET /api/cases/export?status=open&startDate=2024-01-01&endDate=2024-12-31
```

## Security & Privacy

### Data Handling
- Payment data never stored locally
- User PII minimized in logs
- End-to-end encryption for sensitive data
- SOC 2 compliant infrastructure

### Access Control
- Creator-only access to dashboard
- API key authentication for webhooks
- Secure token management
- Regular security audits

### Compliance
- GDPR compliant data handling
- CCPA compliance for California users
- Regular security updates
- Transparent data practices

## Support & Resources

### Getting Help

#### Self-Service
- Search documentation
- Check troubleshooting guides
- Review video tutorials
- Browse community forum

#### Direct Support
- Email: support@churnsaver.com
- Response time: < 24 hours
- Priority support for Pro/Enterprise

### Additional Resources

- **Blog**: Recovery strategy tips and best practices
- **Webinars**: Monthly creator-focused sessions
- **Templates**: Message template library
- **Integrations**: Third-party tool connections

---

## Frequently Asked Questions

### General
**Q: How much does it cost?**
A: Free tier: 100 recoveries/month. Pro: $29/month unlimited.

**Q: Does it work with all payment methods?**
A: Yes, works with all Whop-supported payment methods.

### Setup
**Q: How long does setup take?**
A: 5 minutes for basic setup, 15 minutes for full configuration.

**Q: Can I customize messages?**
A: Currently fixed templates. Custom messaging coming soon.

### Performance
**Q: What's the average recovery rate?**
A: 20-35% depending on configuration and audience.

**Q: How quickly are recoveries attributed?**
A: Real-time for immediate recoveries, up to 14 days for delayed payments.

### Technical
**Q: Is my data secure?**
A: SOC 2 compliant with end-to-end encryption.

**Q: Can I export my data?**
A: Yes, full CSV export available.

**Q: What happens if I uninstall?**
A: All data remains accessible. Recovery stops immediately.











