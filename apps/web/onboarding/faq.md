# Frequently Asked Questions

## Getting Started

### What is Churn Saver?

Churn Saver is an automated payment recovery system for Whop creators. It detects failed subscription payments and automatically sends personalized recovery messages with incentives to win back subscribers.

### How does it work?

1. Monitors all payment events through Whop webhooks
2. Creates recovery cases for failed payments
3. Sends multi-channel notifications (push + DM)
4. Applies free day incentives on first failure
5. Tracks recovery attribution for 14 days
6. Updates dashboard with real-time metrics

### How long does setup take?

Basic setup: 5 minutes
Full configuration: 15 minutes
Testing: 10 minutes
**Total**: ~30 minutes to fully operational

### Is it really automated?

Yes! Once configured, Churn Saver runs 24/7 without manual intervention. It automatically:
- Detects payment failures
- Sends recovery messages
- Applies incentives
- Tracks recoveries
- Updates your dashboard

## Pricing & Billing

### How much does it cost?

- **Free Tier**: 100 recoveries/month, basic features
- **Pro Tier**: $29/month, unlimited recoveries, advanced analytics
- **Enterprise**: Custom pricing for high-volume creators

### What counts as a "recovery"?

A recovery occurs when a user completes a successful payment within 14 days of their initial failure. The successful payment is attributed to your recovery efforts.

### Do I pay for failed recoveries?

No. You only pay for successful recoveries that generate revenue. Failed recovery attempts don't cost anything.

### Can I cancel anytime?

Yes, cancel anytime through your Whop dashboard. Your data remains accessible for 30 days after cancellation.

## Features & Configuration

### What communication channels are supported?

- **Push Notifications**: Immediate delivery to user devices
- **Direct Messages**: Personalized messages in Whop
- **Future**: Email, SMS (coming soon)

### Can I customize messages?

Currently, message templates are optimized and fixed. Custom messaging templates are planned for Q2 2025.

### What incentives can I offer?

Free days: 0, 1, 3, 7, 14, or 30 days added to the user's membership on first payment failure.

### How does the attribution window work?

Churn Saver attributes successful payments to recovery efforts for 14 days after the initial failure. This ensures accurate ROI tracking and prevents double-counting.

### Can I change settings anytime?

Yes, all settings are configurable in real-time through the dashboard. Changes take effect immediately.

## Technical Questions

### Is my data secure?

Yes, Churn Saver follows industry best practices:
- SOC 2 compliant infrastructure
- End-to-end encryption
- No sensitive payment data stored
- GDPR and CCPA compliant

### What happens to my data if I uninstall?

All recovery data remains accessible through the dashboard for 30 days. After that, data is securely deleted per our retention policy.

### Does it work with all Whop features?

Churn Saver works with all Whop membership types and payment methods. It integrates with:
- Standard memberships
- Custom memberships
- All payment processors
- Free day incentives

### Can I export my data?

Yes, full CSV export available with all recovery data, including:
- Case details
- Recovery status
- Revenue attribution
- Timestamps

### What's the uptime guarantee?

99.9% uptime SLA for Pro and Enterprise customers. Free tier operates on best-effort basis.

## Performance & Analytics

### What's the average recovery rate?

Industry average: 15-25%
Good performance: 25-35%
Excellent performance: 35%+

Recovery rates vary by:
- Incentive amount
- Communication strategy
- Membership value
- Audience engagement

### How quickly do recoveries happen?

Most recoveries occur within 48 hours:
- 60% within first 24 hours
- 80% within 48 hours
- 95% within 14 days

### Can I track ROI?

Yes, detailed ROI tracking including:
- Cost of incentives
- Revenue recovered
- Recovery rate percentage
- Net profit from recovery program

### What metrics are available?

**Real-time KPIs:**
- Active recovery cases
- Successful recoveries
- Recovery rate percentage
- Recovered revenue
- Total cases

**Detailed Analytics:**
- Recovery velocity
- Channel effectiveness
- Incentive performance
- Membership tier analysis

## Troubleshooting

### Why aren't cases appearing?

Common causes:
1. Webhook not configured in Whop
2. Invalid webhook signature
3. Application temporarily down
4. No payment failures occurring

Check our troubleshooting guide for detailed solutions.

### Why aren't notifications sending?

Possible issues:
1. Channel settings disabled
2. User notification preferences
3. API rate limits exceeded
4. Service temporarily unavailable

### Why aren't incentives applying?

Check:
1. Incentive settings configured
2. Membership supports free days
3. API permissions granted
4. Membership not at cycle limit

### Dashboard not loading?

Try:
1. Hard refresh (Ctrl+F5)
2. Clear browser cache
3. Check internet connection
4. Contact support if persistent

## Advanced Usage

### Can I run A/B tests?

Currently manual A/B testing supported. Split testing features coming in Q2 2025.

### Can I integrate with other tools?

API access coming soon. Currently integrates with:
- Whop memberships
- Whop payments
- Whop notifications

### Can I set different strategies per membership?

Currently one strategy per creator account. Tiered strategies coming in Q2 2025.

### What's the maximum recovery attempts?

Up to 3 automatic attempts (T+0, T+2, T+4), plus unlimited manual nudges.

### Can I pause recovery for specific users?

Yes, through case management:
- Cancel individual cases
- Terminate memberships
- Manual intervention available

## Support & Resources

### How do I get help?

**Self-Service:**
- Documentation and guides
- Video tutorials
- Community forum
- Troubleshooting tools

**Direct Support:**
- Email: support@churnsaver.com
- Pro/Enterprise: Priority support
- Response time: < 24 hours

### What's included in Pro tier?

Everything in Free, plus:
- Unlimited recoveries
- Advanced analytics
- Priority support
- Custom reporting
- API access (coming soon)

### What's included in Enterprise?

Everything in Pro, plus:
- Custom integrations
- White-label options
- Dedicated account manager
- Custom SLAs
- On-premise deployment option

## Future Features

### Coming Soon (Q1 2025)
- Custom message templates
- Advanced A/B testing
- Email notifications
- SMS notifications

### Roadmap (Q2 2025)
- API access for integrations
- Advanced analytics dashboard
- Predictive recovery scoring
- Multi-creator accounts

### Long-term Vision
- AI-powered messaging
- Advanced attribution models
- Cross-platform recovery
- Industry-leading automation

---

**Still have questions?** Check our full documentation or contact support. We're here to help you maximize revenue recovery!

