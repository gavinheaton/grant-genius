

## Fix: Report Created with Admin's User ID Instead of Researcher's

### Root Cause

When an admin resumes a stalled run via the `resume-report-run` edge function, the report is created with the **admin's user_id** instead of the **application owner's user_id**.

- Line 322: `const userId = userData.user.id` -- this is the admin who called the function
- Line 365: `const ownerUserId = ...` -- this is the actual application owner
- Line 765: `createFinalReport(..., userId, ...)` -- passes the admin's ID

The RLS policy on `reports` requires `auth.uid() = user_id`, so Gavin (the researcher) cannot see his own report because it's owned by the admin account.

### Immediate Fix: Correct Gavin's Report

Run a database update to fix the existing report:

```sql
UPDATE reports
SET user_id = 'a2cd9756-73df-4c42-8279-f05ac78f065b'
WHERE id = '4bbcf8d6-efb6-43b6-af3f-594ca132d6a8';
```

This sets the report's user_id to Gavin's actual account (`gavin@heatoncommunications.com`).

### Code Fix: Use Owner ID for Report Creation

**File: `supabase/functions/resume-report-run/index.ts`**

Change line 765 from `userId` to `ownerUserId` in the `createFinalReport` call:

```typescript
// Line 759-770: Before
await createFinalReport(
  supabase,
  reportRunId,
  applicationId,
  grantVersionId,
  templateVersionId,
  userId,        // <-- BUG: admin's ID
  inputs,
  reportContent,
  citations,
  emailOnComplete
);

// After
await createFinalReport(
  supabase,
  reportRunId,
  applicationId,
  grantVersionId,
  templateVersionId,
  ownerUserId,   // <-- FIX: application owner's ID
  inputs,
  reportContent,
  citations,
  emailOnComplete
);
```

### Files Changed

| File | Change |
|---|---|
| Database | Update report `4bbcf8d6` user_id to Gavin's ID |
| `supabase/functions/resume-report-run/index.ts` | Line 765: change `userId` to `ownerUserId` |

### Risk

Low. The `ownerUserId` is already resolved and validated earlier in the function (line 365). This is the same variable used for the email notification (line 423). The fix ensures consistency between report ownership and email recipient.

