

## Expose Report Generation Pipeline as a Secure API

### Overview
Create an API layer that allows your other apps to trigger report generation and retrieve results, with usage tracking, and an admin toggle to enable/disable API access.

### Authentication and Security
- **API_SECRET_KEY** shared secret, validated server-side in edge functions
- Option B: API calls bypass credit checks entirely (trusted internal apps only)
- Admin can disable API access via a settings toggle

### New Database Tables

**`api_usage_logs`** -- tracks every API call for analytics
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| api_key_name | text | Identifier for which app is calling (passed as header) |
| endpoint | text | e.g. "generate-report", "report-status" |
| report_run_id | uuid | Nullable, linked run |
| source | text | "api" (vs "web" for UI calls) |
| response_status | integer | HTTP status returned |
| created_at | timestamptz | Auto |

**`api_settings`** -- single-row config table
| Column | Type | Default |
|---|---|---|
| id | uuid | PK |
| is_enabled | boolean | true |
| default_grant_id | uuid | Nullable, the "General" grant |
| updated_at | timestamptz | Auto |
| updated_by | uuid | Nullable |

Both tables get admin-only RLS policies.

### New Edge Functions

**1. `supabase/functions/api-generate-report/index.ts`**
- Validates `API_SECRET_KEY` from Bearer token
- Checks `api_settings.is_enabled` -- returns 503 if disabled
- Accepts: `{ summary, public_article_url?, grant_id?, trl?, ip_status?, webhook_url?, client_name? }`
- Looks up default published grant version (or uses provided `grant_id`)
- Creates application record with `api_source = client_name` using service role
- Creates report run and calls `enqueue-report`
- Logs to `api_usage_logs`
- Returns `{ run_id, status: "enqueued", poll_url }`
- **Bypasses credit/entitlement checks** (Option B)

**2. `supabase/functions/api-report-status/index.ts`**
- Validates `API_SECRET_KEY`
- Accepts query param `run_id`
- Returns run status, step progress, and when completed: report HTML + citations
- Logs to `api_usage_logs`

### Webhook Support
- Add `webhook_url` (text, nullable) column to `report_runs`
- Add `api_source` (text, nullable) column to `applications`
- Update `worker-proxy` post-save logic: after saving a completed report, check if `webhook_url` is set on the run and POST the result to it

### Admin UI: API Management
- New section in the Admin Dashboard or System Health page
- Toggle to enable/disable API access
- Usage stats: total API calls, calls today, calls by client name
- Table showing recent API usage logs

### Config Updates
- Add both new functions to `supabase/config.toml` with `verify_jwt = false`
- New secret: `API_SECRET_KEY` (will request from you before implementing)

### Implementation Sequence

1. **Database migration** -- create `api_usage_logs`, `api_settings` tables; add `webhook_url` to `report_runs`, `api_source` to `applications`
2. **Request API_SECRET_KEY secret** from you
3. **Create `api-generate-report` edge function** -- core API endpoint
4. **Create `api-report-status` edge function** -- polling/result endpoint
5. **Update `worker-proxy`** -- add webhook callback on report completion
6. **Build admin API management UI** -- toggle, usage stats, logs table

### API Usage Example (for your other apps)

```text
POST /functions/v1/api-generate-report
Authorization: Bearer <API_SECRET_KEY>
Content-Type: application/json

{
  "summary": "Research on novel polymer...",
  "public_article_url": "https://...",
  "client_name": "my-other-app"
}

Response: { "run_id": "uuid", "poll_url": "/functions/v1/api-report-status?run_id=uuid" }
```

```text
GET /functions/v1/api-report-status?run_id=uuid
Authorization: Bearer <API_SECRET_KEY>

Response (completed): { "status": "completed", "report_html": "...", "citations": [...] }
```

