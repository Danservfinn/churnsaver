# Troubleshooting Guide

## Quick Diagnosis

### System Health Check

Run these checks in order:

1. **Dashboard Access**: Can you access the Churn Saver dashboard?
2. **Recent Cases**: Are new recovery cases appearing?
3. **Notifications**: Are test notifications being sent?
4. **Settings**: Can you save configuration changes?

If any of these fail, follow the relevant section below.

---

## Webhook Issues

### Problem: No Recovery Cases Appearing

**Symptoms:**
- Dashboard shows no new cases
- Payment failures not being tracked
- "No recent activity" in dashboard

**Possible Causes:**

#### 1. Webhook Not Configured
**Check:**
- Whop dashboard → App settings → Webhooks
- Verify URL: `https://your-domain.vercel.app/api/webhooks/whop`
- Confirm webhook is active

**Fix:**
1. Update webhook URL if incorrect
2. Regenerate webhook secret if compromised
3. Save and test webhook

#### 2. Invalid Webhook Signature
**Check:**
- Server logs for "Invalid signature" errors
- Webhook secret matches between Whop and your app

**Fix:**
1. Copy webhook secret from Whop dashboard
2. Update `WHOP_WEBHOOK_SECRET` environment variable
3. Redeploy application

#### 3. Application Down
**Check:**
- Visit `https://your-domain.vercel.app/api/health`
- Should return `{"status":"healthy"}`

**Fix:**
- Check Vercel deployment status
- Review deployment logs
- Redeploy if necessary

### Problem: Duplicate Cases

**Symptoms:**
- Multiple cases for same membership
- Inflated case counts

**Cause:** Test webhooks or duplicate events

**Fix:**
- Use test environment for testing
- Check webhook logs for duplicate events
- Cases automatically merge within attribution window

---

## Notification Issues

### Problem: Push Notifications Not Sending

**Symptoms:**
- Users report no push notifications
- Direct messages work but push doesn't

**Checks:**

#### 1. Channel Settings
**Verify:**
- Settings → Communication Channels → Push enabled
- User has push notifications enabled in Whop

#### 2. Service Status
**Check:**
- Server logs for push service errors
- API rate limits not exceeded

#### 3. User Permissions
**Verify:**
- User hasn't disabled notifications
- Device has notification permissions

### Problem: Direct Messages Not Sending

**Symptoms:**
- Push works but DMs don't arrive
- Users can't find recovery messages

**Checks:**

#### 1. DM Settings
**Verify:**
- Settings → Communication Channels → DM enabled
- API permissions for DM sending

#### 2. Message Content
**Check:**
- Messages not being flagged as spam
- Template contains valid links
- Character limits not exceeded

#### 3. User Status
**Verify:**
- User account active
- Membership not terminated
- DM channel accessible

### Problem: Notifications Delayed

**Symptoms:**
- Messages arrive hours late
- Inconsistent delivery timing

**Possible Causes:**
- Queue backlog (high volume)
- Rate limiting
- Server performance issues

**Fix:**
- Monitor server resources
- Check queue depths
- Consider scaling if persistent

---

## Incentive Issues

### Problem: Free Days Not Applied

**Symptoms:**
- Recovery messages sent but no free days added
- Users report no incentives received

**Checks:**

#### 1. Incentive Settings
**Verify:**
- Settings → Incentive Strategy → Days > 0
- Membership supports free days feature

#### 2. API Permissions
**Check:**
- Whop API permissions for membership management
- Application has modify permissions

#### 3. Membership Status
**Verify:**
- Membership active and modifiable
- Not at billing cycle limit
- Supports free day additions

### Problem: Incentives Applied But Not Visible

**Symptoms:**
- Logs show incentives applied
- Users don't see free days in their account

**Cause:** Caching or display delay

**Fix:**
- Wait 5-10 minutes for sync
- Advise users to refresh their membership page
- Check Whop API documentation for delays

---

## Dashboard Issues

### Problem: Dashboard Not Loading

**Symptoms:**
- Page fails to load
- "Application Error" messages

**Checks:**

#### 1. Application Status
**Verify:**
- `GET /api/health` returns healthy
- Database connection working
- No deployment issues

#### 2. Browser Issues
**Check:**
- JavaScript enabled
- No ad blockers interfering
- Try incognito mode

#### 3. Network Issues
**Verify:**
- No firewall blocking requests
- CORS headers correct
- SSL certificate valid

### Problem: Metrics Not Updating

**Symptoms:**
- KPIs show old data
- New cases not appearing in tables

**Checks:**

#### 1. Data Pipeline
**Verify:**
- Webhooks processing successfully
- Database writes successful
- Cache invalidation working

#### 2. Time Zones
**Check:**
- Dashboard timezone matches expectations
- Date filters include recent activity

#### 3. Cache Issues
**Fix:**
- Hard refresh browser (Ctrl+F5)
- Clear browser cache
- Check CDN cache settings

### Problem: CSV Export Failing

**Symptoms:**
- Export button doesn't work
- Download doesn't start

**Checks:**

#### 1. Permissions
**Verify:**
- User has export permissions
- File download not blocked

#### 2. Data Volume
**Check:**
- Export not too large (>10MB)
- Filters applied to reduce size

#### 3. Browser Security
**Fix:**
- Allow pop-ups for the domain
- Check download folder permissions

---

## Performance Issues

### Problem: Slow Dashboard Loading

**Symptoms:**
- Pages take >5 seconds to load
- Tables slow to render

**Checks:**

#### 1. Database Performance
**Verify:**
- Query execution times <1 second
- Database indexes present
- Connection pooling working

#### 2. Application Performance
**Check:**
- Server response times
- Memory usage not excessive
- No memory leaks

#### 3. Network Issues
**Verify:**
- CDN working correctly
- No network congestion
- Client internet connection stable

### Problem: High Error Rates

**Symptoms:**
- Frequent error messages
- Failed webhook processing

**Checks:**

#### 1. Error Logs
**Review:**
- Application error logs
- Database error logs
- API error responses

#### 2. Resource Limits
**Check:**
- Rate limits not exceeded
- Database connection limits
- Memory/CPU constraints

#### 3. Configuration Issues
**Verify:**
- Environment variables correct
- API keys valid
- Permissions properly set

---

## Configuration Issues

### Problem: Settings Not Saving

**Symptoms:**
- Changes don't persist after save
- Settings revert on refresh

**Checks:**

#### 1. Database Access
**Verify:**
- Database writable
- Table permissions correct
- Connection not failing

#### 2. Form Validation
**Check:**
- All required fields filled
- Values within allowed ranges
- No client-side validation errors

#### 3. Cache Issues
**Fix:**
- Clear application cache
- Hard refresh settings page
- Check for concurrent edits

### Problem: Invalid Configuration

**Symptoms:**
- Application errors after config change
- Features stop working

**Checks:**

#### 1. Value Ranges
**Verify:**
- Incentive days: 0-365
- Reminder offsets: 0-365
- Channel settings: boolean values

#### 2. Required Fields
**Check:**
- Company ID set
- API credentials valid
- Webhook URLs correct

#### 3. Rollback
**Fix:**
- Use browser back button
- Reset to defaults
- Contact support for recovery

---

## Advanced Troubleshooting

### Debug Mode

Enable debug logging:

```bash
# Environment variable
DEBUG=churn-saver:*

# Or in application
logger.level = 'debug'
```

### Log Analysis

Common log patterns:

```
✅ Webhook processed - Success
❌ Database connection failed - Check DATABASE_URL
⚠️ Invalid signature - Verify WHOP_WEBHOOK_SECRET
🚫 Rate limit exceeded - Implement backoff
```

### Performance Monitoring

Key metrics to monitor:

- Webhook response time (< 1 second)
- Database query time (< 100ms)
- Notification delivery rate (> 95%)
- Application uptime (> 99.9%)

### Emergency Contacts

**For urgent issues:**
- Email: support@churnsaver.com
- Response: < 4 hours
- Include: Error messages, timestamps, user impact

**For security issues:**
- Email: security@churnsaver.com
- Response: < 1 hour
- PGP key available on website

---

## Prevention Best Practices

### Regular Maintenance

1. **Weekly**: Review error logs, check performance metrics
2. **Monthly**: Update dependencies, rotate secrets
3. **Quarterly**: Security audit, performance optimization

### Monitoring Setup

1. **Uptime Monitoring**: Ping `/api/health` every 5 minutes
2. **Error Alerting**: Alert on >5% error rate
3. **Performance**: Alert on >2 second response times

### Backup Strategy

1. **Database**: Daily automated backups
2. **Configuration**: Version controlled settings
3. **Logs**: 30-day retention with searchable archive

Remember: Most issues are configuration-related. Start with the health check and work systematically through the symptoms.





