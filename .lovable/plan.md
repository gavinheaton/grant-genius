
Goal
- Eliminate the persistent `404` to `.../functions/v1/generate-report` on the published site and make failures diagnosable (instead of “non‑2xx” with no actionable info).

What the current errors mean (so we don’t chase noise)
- `background-redux-new.js` + `LastPass ... duplicate id`:
  - These are coming from browser extensions (LastPass / similar). They are noisy but not the root cause of report generation failing.
- The real blocker is:
  - `Failed to load resource: .../functions/v1/generate-report ... 404`
  - A 404 at that URL specifically means “the backend function endpoint can’t find a deployed function named `generate-report` in the environment your site is hitting” (or it’s hitting the wrong environment entirely).

Key facts from the codebase
- The frontend calls the backend function by name:
  - `supabase.functions.invoke("generate-report", { body: { applicationId } })` in `src/hooks/useReportGeneration.ts`.
- The backend function folder exists in the repo:
  - `supabase/functions/generate-report/index.ts` (present in file list)
- The backend config lists that function:
  - `supabase/config.toml` includes `[functions.generate-report] verify_jwt = false`
- When called via tooling, `/generate-report` returns `401 Unauthorized`, which strongly suggests the function exists in at least one environment. The mismatch (tool sees it; browser sees 404) points to an environment/routing mismatch, not a code bug inside the function.

Most likely root causes (ranked)
1) Environment mismatch (published site is calling a different backend environment than the one we tested)
- The platform has separate Test vs Live environments. A function can exist in one but not the other.
- Symptoms match perfectly: tool call returns 401 (exists), browser returns 404 (missing).

2) The function is deployed, but the browser is not actually calling the same function endpoint
- Example: published build still using stale embedded backend URL/keys, or the custom domain is serving an older build artifact.
- However, you reported hard refresh + incognito, which reduces (but doesn’t fully eliminate) this possibility (CDN caching can still bite).

3) Function name mismatch in deployed environment (less likely)
- Frontend requests `generate-report`; if deployed function name differs (e.g., `generate_report`, `generateReport`, or was deleted), you get 404.
- Repo shows the right name, so this is mostly about the deployed Live environment state.

Plan (diagnose first, then harden, then fix)
Phase 1 — Prove which environment your published site is calling (fast, definitive)
1) Add a lightweight “Backend diagnostics” endpoint in the app (client-side only) that:
   - Reads the backend base URL and project ref from runtime config (the same values `supabase` client uses).
   - Makes a direct fetch to:
     - `OPTIONS {backendBase}/functions/v1/generate-report`
     - `GET {backendBase}/functions/v1/generate-report` (expect 401/405/400, but not 404 if deployed)
   - Displays a small diagnostic panel (only in admin/super-admin mode or behind a query param like `?debug=1`) showing:
     - Backend base URL
     - HTTP status from preflight
     - HTTP status from direct call
     - Timestamp + request id (if any)
   Why:
   - This removes guesswork and tells us whether the published site can see the function at all.

2) Add targeted logging around `startGeneration()` in `src/hooks/useReportGeneration.ts`:
   - When `invoke("generate-report")` fails, capture:
     - error name/type
     - HTTP status (if present)
     - response body (if present)
     - backend URL used
   - Show a user-friendly toast:
     - If 404: “Backend function not available (deployment mismatch). Please try again in 2 minutes; if persistent, contact support.”
   Why:
   - Right now the UI collapses many failure modes into “non‑2xx status code”.

Phase 2 — Ensure `generate-report` is present in the Live environment (the actual fix)
3) Add an internal “function presence check” in the backend deployment pipeline (pragmatic runtime check)
   - Implement a new backend function: `functions-health` (or `health`) that returns a JSON list of required functions and their readiness checks.
   - It can do minimal checks like:
     - return version/build timestamp
     - (optional) verify required secrets exist for worker dispatch (without revealing them)
   Why:
   - There’s no official “list all functions” endpoint from the browser; this gives us one stable health probe.

4) Align deployment so Live always contains:
   - `generate-report`
   - `enqueue-report` / `worker-proxy` / `resume-report-run` / `cancel-report-run`
   - Confirm `verify_jwt = false` is consistently set for any function the browser calls, and validate auth inside the function code (not via verify_jwt).
   Notes:
   - We will verify that every function response (success and error) includes correct CORS headers, especially for `OPTIONS` preflight.
   - If any function is missing required CORS headers, browsers can surface confusing “failed to fetch” behaviors (though usually not a 404). We’ll still standardize CORS across all callable functions.

Phase 3 — Prevent regressions (so this doesn’t come back)
5) Add a “preflight check before starting generation”
   - Before `supabase.functions.invoke("generate-report")`, do a quick `fetch(OPTIONS ...)` and if it returns 404:
     - short-circuit and show a deterministic error
     - optionally offer a “Retry” button
   Why:
   - Users won’t burn time clicking generate, only to hit the same dead endpoint.

6) Add a small admin-only “Backend Status” page
   - Could live under `/admin/system` with:
     - function health results
     - last N failures (pulled from existing logs tables if present)
     - worker connectivity probe (optional)
   Why:
   - Makes production troubleshooting possible without devtools.

Files/components that will likely be changed (implementation mode)
- Frontend
  - `src/hooks/useReportGeneration.ts` (better error inspection + preflight)
  - Possibly a new debug UI component (e.g., `src/components/admin/BackendDiagnosticsCard.tsx`)
  - Possibly add a route under admin (e.g., `src/pages/admin/SystemHealth.tsx`) and link from AdminSidebar
- Backend functions (Lovable Cloud functions)
  - Standardize CORS headers in `supabase/functions/generate-report/index.ts` and any other callable functions
  - Add a new health probe function (e.g., `supabase/functions/system-health/index.ts`)

Acceptance criteria (what “fixed” looks like)
- From the published site (custom domain), clicking “Generate report” no longer produces a 404 to `/functions/v1/generate-report`.
- If the backend is temporarily mis-deployed, the UI shows:
  - a clear message (“generation unavailable; backend not deployed”)
  - diagnostic info in admin-only view (backend URL + status)
- The same flow works in:
  - custom domain
  - Lovable published URL
  - preview URL

Risks / edge cases
- If your custom domain is accidentally connected to a different project/build, the diagnostics panel will reveal a different backend URL/project ref than expected. If that’s the case, the fix is domain/project configuration (not code).
- If 404 occurs only for some users, it can be CDN inconsistency; the diagnostics panel will help correlate by showing build/version timestamps.

What I need from you during implementation (quick checks)
- After implementing the diagnostics panel, you’ll run it once on the published site and paste:
  - the backend URL shown
  - the status codes returned for OPTIONS/GET
- Then we’ll confirm the Live environment function deployment alignment.

