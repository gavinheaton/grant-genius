

# Deploy enqueue-report Edge Function

## Overview
Create a new edge function that triggers the external Cloud Run worker to process report generation.

## Implementation

### 1. Create Edge Function File
**File:** `supabase/functions/enqueue-report/index.ts`

The function will:
- Accept `report_run_id` from the request body
- Call the Cloud Run worker's `/enqueue-run` endpoint
- Pass the worker secret for authentication
- Return the worker's response

### 2. Add CORS Headers
Add standard CORS headers for web app compatibility (required for browser calls).

### 3. Update Config
Add to `supabase/config.toml`:
```toml
[functions.enqueue-report]
verify_jwt = false
```

### 4. Deploy
Deploy the function automatically.

## Secrets Status
- `CLOUD_RUN_URL` - Already configured
- `WORKER_SECRET` - Already configured

## Files to Create/Modify
| File | Action |
|------|--------|
| `supabase/functions/enqueue-report/index.ts` | Create |
| `supabase/config.toml` | Add function config |

