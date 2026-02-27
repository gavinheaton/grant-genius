
## Expose Report Generation Pipeline as a Secure API

### Status: ✅ IMPLEMENTED

### What was built

1. **Database**: `api_usage_logs` and `api_settings` tables with admin-only RLS; `webhook_url` column on `report_runs`; `api_source` column on `applications`; `api_system_user_id` column on `api_settings`
2. **`api-generate-report` edge function**: Accepts summary + optional inputs, creates application/run, triggers pipeline via `enqueue-report`, bypasses credit checks (Option B)
3. **`api-report-status` edge function**: Returns run progress, and when completed, the full report HTML + citations
4. **Webhook support**: `worker-proxy` POSTs completed report data to `webhook_url` if configured on the run — **including on failure** (event: `report.failed`)
5. **Admin UI**: `/admin/api` page with enable/disable toggle, usage stats, client breakdown, recent API call logs, **default grant selector**, and **system user selector**
6. **Sidebar**: "API Access" link added to admin sidebar under System section

### Fixes Applied (v2)

1. **User ownership**: API-generated apps now use `api_settings.api_system_user_id` instead of defaulting to first super admin
2. **Grant selection**: Random fallback removed — returns 400 if no `grant_id` provided and no default configured
3. **Failure webhooks**: `worker-proxy` now POSTs `report.failed` event to `webhook_url` when a run fails

### API Usage

```
POST /functions/v1/api-generate-report
Authorization: Bearer <API_SECRET_KEY>
Content-Type: application/json

{
  "summary": "Research on novel polymer...",
  "public_article_url": "https://...",
  "client_name": "my-other-app",
  "webhook_url": "https://my-app.com/webhook"
}

Response: { "run_id": "uuid", "status": "enqueued", "poll_url": "..." }
```

```
GET /functions/v1/api-report-status?run_id=uuid
Authorization: Bearer <API_SECRET_KEY>

Response: { "status": "completed", "report_html": "...", "citations": [...] }
```

### Webhook Events

**Success**: `{ "event": "report.completed", "run_id": "...", "report_html": "...", "citations": [...] }`
**Failure**: `{ "event": "report.failed", "run_id": "...", "status": "failed", "halt_reason": "..." }`
