
## Expose Report Generation Pipeline as a Secure API

### Status: ✅ IMPLEMENTED

### What was built

1. **Database**: `api_usage_logs` and `api_settings` tables with admin-only RLS; `webhook_url` column on `report_runs`; `api_source` column on `applications`
2. **`api-generate-report` edge function**: Accepts summary + optional inputs, creates application/run, triggers pipeline via `enqueue-report`, bypasses credit checks (Option B)
3. **`api-report-status` edge function**: Returns run progress, and when completed, the full report HTML + citations
4. **Webhook support**: `worker-proxy` POSTs completed report data to `webhook_url` if configured on the run
5. **Admin UI**: `/admin/api` page with enable/disable toggle, usage stats, client breakdown, and recent API call logs
6. **Sidebar**: "API Access" link added to admin sidebar under System section

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
