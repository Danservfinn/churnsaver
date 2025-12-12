# Health Check Monitoring

## Internal
- Vercel cron calls `GET /api/health` every 5 minutes for liveness.
- If the endpoint returns non-200, investigate logs and queue depth.

## External Uptime
- Configure BetterUptime / Pingdom / UptimeRobot against `https://your-domain/api/health`.
- Alerts: Pager/email/Slack on 3 consecutive failures or p95 > 1s.

## Alert Routing
- Webhook targets: `SLACK_WEBHOOK_URL` (recommended) or email.
- Include response body and status in alerts for triage.

## Runbook (high level)
1) Check `/api/health?detailed=true`.
2) Review queue status and DB connectivity.
3) If repeated failures, scale functions/DB or pause traffic until stable.


