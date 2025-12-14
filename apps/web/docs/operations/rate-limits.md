# Rate Limit Monitoring & Tuning

## Metrics
- Metric name: `rate_limit.request`
- Dimensions: `identifier`, `windowMs`, `remaining`, `resetAt`, `allowed`
- Source: emitted from `src/server/middleware/rateLimit.ts`

## Suggested Queries
- Count rejections per identifier: group by `identifier` where `allowed=false`.
- P95 remaining tokens per endpoint/company to spot overly tight limits.

## Tuning Procedure
1) Identify identifiers with frequent `allowed=false`.
2) Compare against upstream error rate and queue depth.
3) Adjust `RATE_LIMIT_CONFIGS` thresholds for affected endpoints.
4) Re-deploy and monitor for 24h.

