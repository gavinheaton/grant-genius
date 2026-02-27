

## Fix API Pipeline: User, Grant, and Failure Webhook Issues

### Problems Identified

1. **Wrong user (Joanne Jacobs instead of PitchShop)**: The `api-generate-report` function (line 142-157) picks the first `super_admin` from the `user_roles` table as the application owner. This means every API-generated report is attributed to your super admin account rather than being identifiable as belonging to the calling app.

2. **Wrong grant pipeline (AEA Innovate instead of General Grant Application)**: The `api_settings.default_grant_id` is likely null. When no `grant_id` is passed in the API request and no default is configured, the fallback code (lines 104-121) picks *any* published grant version ordered by `version_number DESC` -- which happened to be AEA Innovate. There's no filter for a "general" grant.

3. **No webhook on failure**: The webhook callback only fires inside `handleSaveReport` (line 1041-1070), which only runs on successful report completion. When the run *fails*, `handleUpdateRun` sends a failure email to the admin but never calls the `webhook_url`, so PitchShop never got notified.

---

### Fixes

#### Fix 1: Dedicated API system user
- Create a dedicated "API Service Account" profile in the database (via a migration that inserts a placeholder into `profiles` if one doesn't exist, or use a configurable approach).
- **Simpler approach**: Add an `api_system_user_id` column to `api_settings` so admins can configure which user owns API-generated applications. Update the API Management UI to let admins pick this user.
- In `api-generate-report`, use `settings.api_system_user_id` instead of querying `user_roles` for the first super_admin.

#### Fix 2: Enforce default grant selection
- Ensure `api_settings.default_grant_id` is set correctly. The Admin API Management page already has the toggle but needs a grant selector dropdown.
- In `api-generate-report`, when no `grant_id` is provided and `default_grant_id` is null, return a clear 400 error ("No grant_id provided and no default grant configured") instead of falling back to a random published grant.
- Add a grant selector to the API Management admin page so the default can be configured from the UI.

#### Fix 3: Fire webhook on failure
- In `handleUpdateRun` (worker-proxy), when `status === "failed"`, fetch the run's `webhook_url` and POST a failure event to it:
  ```
  {
    "event": "report.failed",
    "run_id": "...",
    "status": "failed",
    "halt_reason": "..."
  }
  ```
- This ensures PitchShop (or any caller) always gets notified regardless of success or failure.

---

### Technical Changes

**1. Database migration**
- Add `api_system_user_id` (uuid, nullable) column to `api_settings`

**2. `supabase/functions/api-generate-report/index.ts`**
- Fetch `api_system_user_id` from `api_settings` alongside `is_enabled` and `default_grant_id`
- Use `api_system_user_id` as the application owner; fall back to first super_admin only if not configured
- Remove the random-grant fallback: return 400 error if no `grant_id` and no `default_grant_id`

**3. `supabase/functions/worker-proxy/index.ts`**
- In `handleUpdateRun`, when `status === "failed"`, fetch `webhook_url` from the run and POST a failure event

**4. `src/pages/admin/ApiManagement.tsx`**
- Add a "Default Grant" dropdown selector (fetching from `grants` table)
- Add a "System User" selector or display showing which user owns API applications
- Save both to `api_settings`

