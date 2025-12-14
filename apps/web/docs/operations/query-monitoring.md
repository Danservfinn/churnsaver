# Query Monitoring & Index Tuning

## Thresholds
- `SLOW_QUERY_THRESHOLD_MS` (default 100ms)
- `VERY_SLOW_QUERY_THRESHOLD_MS` (default 1000ms)

## Data Sources
- Table: `slow_queries` (see migration 011_slow_queries_table.sql)
- API: `GET /api/monitoring/queries?hours=24`
- Metric: `db.slow_query` (tags: companyId, endpoint, rowCount)

## Quick SQL
```sql
-- Top slow queries last 24h
select left(query_text, 120) as query, count(*) as hits,
       avg(duration_ms) as avg_ms, max(duration_ms) as max_ms
from slow_queries
where created_at >= now() - interval '24 hours'
group by left(query_text, 120)
order by avg_ms desc
limit 10;
```

## Index Tuning Steps
1) Pull top offenders from `slow_queries`.
2) Confirm execution plan with `EXPLAIN ANALYZE`.
3) Add/adjust indexes (prefer composite on filters + order by).
4) Re-run workload; ensure write overhead acceptable.
5) Drop unused or duplicate indexes after verification.


