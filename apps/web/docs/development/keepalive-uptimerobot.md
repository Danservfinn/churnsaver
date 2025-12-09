# Keep-alive on Supabase Free (UptimeRobot)

Supabase Free pauses after ~1 week of inactivity. To keep the DB warm at zero cost:

1) In UptimeRobot (free tier), create an HTTP monitor.
2) URL: `https://<your-vercel-app>/api/health/webhooks` (or `/api/health` if preferred).
3) Interval: 5 minutes.
4) Alert contact: optional; goal is just to ping.

Notes:
- Endpoint is read-only and fast; no auth required.
- If you later move to Supabase Pro, you can delete this monitor.

