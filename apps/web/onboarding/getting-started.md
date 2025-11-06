# Getting Started with Churn Saver

Welcome to Churn Saver! This guide will help you set up automated payment recovery for your Whop membership in just 5 minutes.

## Quick Start Checklist

- [ ] Install Churn Saver from Whop App Store
- [ ] Configure communication channels
- [ ] Set recovery incentives
- [ ] Customize reminder schedule
- [ ] Test with a sample payment failure

## Step 1: Installation

### From Whop App Store

1. Go to your Whop dashboard
2. Navigate to "Apps" or "Integrations"
3. Search for "Churn Saver"
4. Click "Install" and authorize the app

### Automatic Setup

Once installed, Churn Saver automatically:
- Creates webhook endpoints for payment events
- Sets up your database for recovery tracking
- Configures default recovery settings
- Begins monitoring payment events

## Step 2: Basic Configuration

### Communication Channels

Churn Saver can notify users through multiple channels:

**Push Notifications**
- Immediate delivery to user devices
- High open rates for urgent messages
- Works even when app is closed

**Direct Messages**
- Personalized messages in Whop
- Include payment links and incentives
- Best for detailed recovery offers

**Recommended Setup**: Enable both channels for maximum recovery rates.

### Recovery Incentives

Offer free days to encourage recovery:

- **First Failure**: 3 days free (recommended)
- **Options**: 1, 3, 7, 14, or 30 days
- **Timing**: Applied immediately on first failure

### Reminder Schedule

Configure when to send follow-up messages:

- **T+0**: Immediate (within minutes of failure)
- **T+2**: 2 days after failure
- **T+4**: 4 days after failure

**Pro Tip**: T+0 + T+2 + T+4 recovers ~70% of recoverable payments.

## Step 3: Advanced Configuration

### Attribution Window

Churn Saver attributes recoveries for **14 days** after initial failure. This means:
- Successful payments within 14 days count as recoveries
- Accurate revenue tracking and ROI calculation
- Prevents over-counting recoveries

### Case Management

Each payment failure creates a "recovery case":
- **Status**: Open → Recovered or Closed
- **Attempts**: Number of nudges sent
- **Revenue**: Amount recovered (when applicable)

### Dashboard Access

Access your recovery dashboard at:
```
https://your-app.whop.com/apps/churn-saver
```

## Step 4: Testing Your Setup

### Test Payment Failure

Create a test payment failure to verify everything works:

1. **Method 1**: Use Whop's test mode (if available)
2. **Method 2**: Create a small test membership ($1) and cancel payment
3. **Method 3**: Use our test webhook endpoint

### Verify Recovery Flow

After creating a test failure:

1. Check dashboard for new recovery case
2. Verify push notification sent (if enabled)
3. Check direct message in Whop
4. Confirm incentive days applied

### Test Recovery

Complete the payment to test recovery attribution:

1. Use the payment link from recovery message
2. Complete successful payment
3. Verify case shows as "Recovered"
4. Check revenue attribution in dashboard

## Step 5: Monitor & Optimize

### Key Metrics to Track

**Recovery Rate**: (Recovered Cases / Total Cases) × 100
- Industry average: 15-25%
- Good performance: 25-35%
- Excellent performance: 35%+

**Revenue Recovered**: Total dollars recovered through incentives
- Should exceed cost of free days
- Target: 3-5x return on incentive spend

**Response Time**: Average time to recovery
- Faster = higher recovery rates
- Target: < 48 hours

### Optimization Tips

**Channel Optimization**
- Push notifications: 40-50% open rate
- Direct messages: 60-70% open rate
- Use both for best results

**Incentive Optimization**
- Start with 3 days free
- Test 7 days for high-value memberships
- Monitor cost vs recovery rate

**Timing Optimization**
- T+0 essential for immediate awareness
- T+2 good for follow-up
- T+4 optional for persistent cases

## Troubleshooting

### Common Issues

**No Recovery Cases Appearing**
- Check webhook configuration in Whop
- Verify app permissions
- Check server logs for webhook errors

**Notifications Not Sending**
- Verify channel settings
- Check user notification preferences
- Review message templates

**Incentives Not Applying**
- Confirm membership supports free days
- Check incentive settings
- Verify API permissions

### Support Resources

- **Documentation**: Full guides and best practices
- **Video Tutorials**: Step-by-step setup videos
- **Community Forum**: Connect with other creators
- **Email Support**: support@churnsaver.com

## Next Steps

### Week 1: Monitor & Learn
- Watch recovery rates and patterns
- Note which incentives work best
- Identify common failure reasons

### Week 2: Optimize
- Adjust reminder timing based on data
- Test different incentive amounts
- Refine message templates

### Month 1: Scale
- Analyze overall impact on revenue
- Calculate ROI of recovery program
- Plan expansion to additional products

---

**Congratulations!** You're now protecting your revenue with automated payment recovery. Most creators see 20-40% recovery rates within the first month.

Need help? Check our [full documentation](./full-guide.md) or contact support.











