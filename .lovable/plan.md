

# Update Report Generation Messaging and Email Default

## Overview

This plan updates the user-facing messaging to reflect the actual ~15 minute processing time and enables the "Email me when my report is ready" checkbox by default.

---

## Changes Required

### 1. Update Processing Time Messaging

**File: `src/components/workspace/GenerationProgress.tsx`**

Update the in-progress message to indicate ~15 minutes:

| Line | Current | New |
|------|---------|-----|
| 344-345 | "Grant Genius takes a few minutes to process. We'll be back soon with your report." | "Report generation typically takes around 15 minutes. Feel free to close this tab - we'll keep working in the background." |

### 2. Update Toast Message on Generation Start

**File: `src/hooks/useReportGeneration.ts`**

Update the success toast when generation starts:

| Line | Current | New |
|------|---------|-----|
| 438 | "This typically takes 2-3 minutes. You'll see progress updates below." | "This typically takes around 15 minutes. You'll see progress updates below." |

### 3. Enable Email Notification by Default

**Database Migration:**

Change the column default from `false` to `true`:

```sql
ALTER TABLE report_runs 
ALTER COLUMN email_on_complete SET DEFAULT true;
```

This ensures new report runs will have email notifications enabled automatically, encouraging users to leave and come back when ready.

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `src/components/workspace/GenerationProgress.tsx` | Update messaging to "~15 minutes" |
| `src/hooks/useReportGeneration.ts` | Update toast to "~15 minutes" |
| Database migration | Set `email_on_complete` default to `true` |

---

## User Experience Impact

- Users will have accurate expectations about processing time
- With email enabled by default, users can close the tab and return when notified
- The messaging encourages this "fire and forget" behavior since 15 minutes is a significant wait

