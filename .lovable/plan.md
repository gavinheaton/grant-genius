
# Proxy Edge Function for External Worker

## Overview

Since the Replit worker cannot directly access the `SUPABASE_SERVICE_ROLE_KEY` (it's only injected into Lovable Cloud Edge Functions), we'll create a **proxy edge function** that handles all database operations on behalf of the external worker.

The worker will call this proxy function instead of directly accessing the database, and the proxy will authenticate the worker using the shared `WORKER_SECRET`.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          LOVABLE CLOUD                                  │
│  ┌──────────────────┐     ┌──────────────────┐     ┌────────────────┐   │
│  │  enqueue-report  │────▶│  Replit Worker   │────▶│  worker-proxy  │   │
│  │  (dispatcher)    │     │  (external)      │     │  (new function)│   │
│  └──────────────────┘     └──────────────────┘     └────────┬───────┘   │
│                                                             │           │
│                                                             ▼           │
│                                                    ┌────────────────┐   │
│                                                    │   Supabase DB  │   │
│                                                    │   (via Service │   │
│                                                    │    Role Key)   │   │
│                                                    └────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Proxy Function Endpoints

The `worker-proxy` edge function will support multiple operations via an `action` field:

| Action | Purpose | Parameters |
|--------|---------|------------|
| `get_run_context` | Fetch all data needed to process a report run | `report_run_id` |
| `update_step` | Update step status and outputs | `report_run_id`, `step_number`, `status`, `outputs_json`, `error_message` |
| `update_run` | Update overall run status | `report_run_id`, `status`, `current_step`, `checkpoint_data_json`, `checkpoint_citations_json` |
| `save_report` | Create final report record | `report_run_id`, `content_json`, `citations_json` |
| `refund_credit` | Refund credit on failure | `report_run_id` |
| `get_prompt_bundle` | Fetch active prompt bundle and steps | (none) |

---

## Security

1. **Worker Authentication**: The proxy verifies the `Authorization: Bearer <WORKER_SECRET>` header matches the stored secret
2. **No User Auth**: This proxy bypasses user auth since it's an internal service-to-service call
3. **Action Validation**: Only whitelisted actions are allowed
4. **ID Validation**: All UUIDs are validated before database operations

---

## Technical Details

### New File: `supabase/functions/worker-proxy/index.ts`

The function will:

1. Validate the `WORKER_SECRET` in the Authorization header
2. Parse the `action` and parameters from the request body
3. Use `SUPABASE_SERVICE_ROLE_KEY` to perform privileged database operations
4. Return the results to the worker

### Data Returned by `get_run_context`

```json
{
  "run": {
    "id": "...",
    "status": "running",
    "current_step": 5,
    "checkpoint_data_json": {...},
    "checkpoint_citations_json": [...],
    "application": {
      "inputs_json": {...},
      "grant_version_id": "..."
    }
  },
  "prompt_bundle": {
    "system_prompt": "...",
    "steps": [...]
  },
  "grant_context": {
    "name": "...",
    "guidelines_excerpt": "...",
    "rubric": "..."
  }
}
```

---

## Configuration Changes

### `supabase/config.toml`

Add the new function with JWT verification disabled (uses WORKER_SECRET instead):

```toml
[functions.worker-proxy]
verify_jwt = false
```

---

## Replit Worker Updates

After this proxy is deployed, the Replit worker should be updated to:

1. Remove direct Supabase client usage
2. Call the proxy function for all database operations:
   - `POST https://sdrawnxfhiyyiiswqvni.supabase.co/functions/v1/worker-proxy`
   - Header: `Authorization: Bearer <WORKER_SECRET>`
   - Body: `{ "action": "get_run_context", "report_run_id": "..." }`

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/worker-proxy/index.ts` | **Create** - New proxy edge function |
| `supabase/config.toml` | **Modify** - Add `[functions.worker-proxy]` config |

---

## Benefits

1. **Secure**: Service role key never leaves Lovable Cloud
2. **Centralized**: All database logic stays in edge functions
3. **Debuggable**: Logs appear in Lovable Cloud function logs
4. **Maintainable**: Worker only needs HTTP client, no Supabase SDK
