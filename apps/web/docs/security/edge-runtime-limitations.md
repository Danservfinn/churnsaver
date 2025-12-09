# Edge Runtime limitations

- Session invalidation relies on server-side Whop auth utilities that are not available in the Edge runtime. When invoked in Edge, invalidation is skipped and a metric `security.session_invalidation_skipped` is emitted for monitoring.
- Webhook and rate limit handlers should run in the Node.js runtime to ensure access to database connections, advisory locks, and authentication helpers.
- If an endpoint must run in Edge, it should avoid security-sensitive side effects (session revocation, job scheduling) and delegate those to a Node.js worker or API route.

