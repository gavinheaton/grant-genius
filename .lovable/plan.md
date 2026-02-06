
# Enhanced Edge Function Monitoring & Deployment Dashboard

## Overview
Expand the Admin System Health page to provide comprehensive monitoring of all edge functions with the ability to deploy/redeploy them directly from the dashboard.

## Current State
- **SystemHealth.tsx** exists at `/admin/system-health`
- **useBackendHealth.ts** probes only 3 functions: `generate-report`, `enqueue-report`, `resume-report-run`
- **system-health edge function** lists 10 critical functions but doesn't probe them individually
- No deployment capability exists - admins must rely on automatic deploys

## Proposed Changes

### 1. Expand Function Monitoring

Update `useBackendHealth.ts` to probe ALL critical functions (not just 3):
- generate-report
- enqueue-report
- worker-proxy
- resume-report-run
- cancel-report-run
- create-checkout
- stripe-webhook
- send-report-email
- generate-pdf
- generate-docx

Group functions by category for better visibility:
- **Report Generation**: generate-report, enqueue-report, resume-report-run, worker-proxy
- **User Actions**: cancel-report-run, create-checkout
- **Payments**: stripe-webhook
- **Notifications**: send-report-email
- **Exports**: generate-pdf, generate-docx

### 2. Add Deploy Button per Function

For each function with status "not_deployed" or "error", show a "Deploy" button that triggers deployment.

Create a new edge function `deploy-function/index.ts` that:
- Accepts a function name parameter
- Uses the Supabase Management API to trigger deployment
- Returns deployment status

Note: Since Lovable auto-deploys edge functions from the codebase, the "deploy" action would actually be a request to re-publish/redeploy. We can implement this by:
- Creating a `trigger-deploy` edge function that calls the Lovable/Supabase deployment API
- OR showing clear instructions to the admin on how to trigger a redeploy

### 3. Add "Deploy All Missing" Button

A convenience button that deploys all functions currently showing as "not_deployed" in a single action.

### 4. Add Quick Health Widget to Admin Dashboard

Add a small summary card on the main Admin Dashboard showing:
- Total functions: X
- Healthy: X (green)
- Missing: X (red badge if any)
- Link to full System Health page

---

## Technical Implementation

### Files to Create
```text
supabase/functions/trigger-redeploy/index.ts
```
Edge function to trigger redeployment of specified functions.

### Files to Modify

**src/hooks/useBackendHealth.ts**
- Expand `criticalFunctions` array to include all 10 functions
- Add function categorization
- Add `deployFunction` and `deployAllMissing` methods
- Track deployment status per function

**src/pages/admin/SystemHealth.tsx**
- Add "Deploy" button next to each missing function
- Add "Deploy All Missing" button in the warning banner
- Group functions by category with collapsible sections
- Show deployment progress/status

**src/components/admin/FunctionHealthCard.tsx** (new component)
- Reusable card for displaying function status with deploy action

**src/pages/admin/AdminDashboard.tsx**
- Add small "Backend Health" summary card
- Show count of missing functions with link to System Health page

**src/components/admin/QuickHealthWidget.tsx** (new component)
- Compact widget showing function health summary

---

## User Experience

### System Health Page
```text
+--------------------------------------------------+
| System Health                           [Refresh] |
+--------------------------------------------------+
| Backend Configuration                             |
| URL: https://xxx.supabase.co  | Status: OK       |
+--------------------------------------------------+
| Secrets Configuration                             |
| SUPABASE_URL ✓ | CLOUD_RUN_URL ✓ | ...           |
+--------------------------------------------------+
| Edge Functions           [Deploy All Missing (2)] |
+--------------------------------------------------+
| ▼ Report Generation (3/4 healthy)                |
|   generate-report    OK     200    45ms          |
|   enqueue-report     OK     200    38ms          |
|   resume-report-run  ⚠ NOT DEPLOYED  [Deploy]    |
|   worker-proxy       OK     200    52ms          |
+--------------------------------------------------+
| ▼ User Actions (2/2 healthy)                     |
|   cancel-report-run  OK     200    41ms          |
|   create-checkout    OK     200    39ms          |
+--------------------------------------------------+
| ...                                               |
+--------------------------------------------------+
```

### Admin Dashboard Widget
```text
+------------------------+
| Backend Health         |
| 8/10 functions OK      |
| ⚠ 2 missing            |
| [View Details →]       |
+------------------------+
```

---

## Edge Cases & Considerations

1. **Deployment may fail**: Show error message and retry option
2. **Deployment takes time**: Show loading spinner, poll for status
3. **Permissions**: Only Super Admin should be able to deploy
4. **Rate limiting**: Prevent spam-clicking deploy buttons
5. **Lovable platform limitations**: Deployment may need to trigger a project republish rather than individual function deployment

---

## Implementation Order

1. Update `useBackendHealth.ts` to probe all functions
2. Create `FunctionHealthCard` component with deploy button UI
3. Update `SystemHealth.tsx` with grouped functions and deploy buttons
4. Create `trigger-redeploy` edge function (if platform supports it)
5. Add `QuickHealthWidget` component
6. Add health widget to Admin Dashboard
