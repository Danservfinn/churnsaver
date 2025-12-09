# RLS policy rationale for webhook events

## Events table
- `events_webhook_insert_policy` permits inserts without company context so webhook ingestion can occur before tenant resolution.
- Row access for reads/updates is still restricted by `company_id = get_current_company_id()`; rows with `company_id` null are invisible to tenants.
- `company_resolution_status` tracks unresolved events. Jobs and processors ignore rows unless status = `resolved` and `company_id` is set.

## Recovery tables
- `recovery_cases` and related tables enforce `company_id = get_current_company_id()` for all operations.
- Advisory locks and partial unique indexes reinforce one-open-case-per-membership and prevent double-processing.

## Operational guidance
- Use the admin-only `/api/events/resolve` endpoint to set `company_id` for pending events and mark them `resolved`.
- Enqueuing or processing should never proceed without a resolved company context.

