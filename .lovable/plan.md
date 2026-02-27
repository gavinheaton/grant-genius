

## Add API Cancel Report Endpoint

### Why a new endpoint?
The existing `cancel-report-run` function authenticates via Supabase JWT and checks user ownership. The external API authenticates via `API_SECRET_KEY`. Mixing both auth strategies into one function would add unnecessary complexity. A dedicated `api-cancel-report` endpoint keeps the pattern consistent with the other two API endpoints.

### Changes

**1. New edge function: `supabase/functions/api-cancel-report/index.ts`**
- Authenticates via `API_SECRET_KEY` (same pattern as `api-generate-report`)
- Checks `api_settings.is_enabled`
- Accepts `{ "run_id": "uuid" }` in the request body
- Validates the run exists and is cancellable (pending/running)
- Performs the same cancellation logic as the existing function: marks run as failed, fails pending/running steps, clears logs, refunds credit
- Fires the failure webhook if `webhook_url` is set on the run
- Logs the call to `api_usage_logs`
- Returns `{ "success": true, "message": "..." }` or idempotent success if already stopped

**2. Update `supabase/config.toml`**
- Add `[functions.api-cancel-report]` with `verify_jwt = false`

**3. Update `src/components/admin/DeveloperIntegrationCard.tsx`**
- Add the cancel endpoint to the integration guide documentation

**4. Update `.lovable/plan.md`**
- Document the new endpoint

### API Contract

```text
POST /functions/v1/api-cancel-report
Authorization: Bearer <API_SECRET_KEY>
Content-Type: application/json

Body: { "run_id": "uuid" }

Success: { "success": true, "message": "Report generation cancelled" }
Already stopped: { "success": true, "message": "Report generation already stopped", "already_stopped": true }
```

### Technical Notes
- No database migration needed
- Credit refund logic is identical to existing `cancel-report-run`
- Webhook notification reuses the same `report.failed` event format already implemented in `worker-proxy`
