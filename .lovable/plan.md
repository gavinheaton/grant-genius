
# Add Execution Engine Database Columns

## Overview
Add the missing database columns that enable the dual-engine architecture (Cloud Run vs Edge Functions) for report generation. This will fix the current `generate-report` failures and enable the Admin UI settings that are already built.

## Database Migration

### SQL to execute:

```sql
-- Add execution engine configuration columns to grant_versions
ALTER TABLE public.grant_versions 
ADD COLUMN IF NOT EXISTS execution_engine_default TEXT DEFAULT 'cloud_run',
ADD COLUMN IF NOT EXISTS edge_allowed BOOLEAN DEFAULT true;

-- Add execution engine tracking columns to report_runs
ALTER TABLE public.report_runs
ADD COLUMN IF NOT EXISTS execution_engine TEXT DEFAULT 'cloud_run',
ADD COLUMN IF NOT EXISTS execution_engine_reason TEXT;
```

## What This Enables

### For Super Admins (Admin Console → Grants → Edit → Advanced tab)
- **Edge Allowed Toggle**: Enable/disable Edge function execution for debugging
- **Default Engine Dropdown**: Choose between Cloud Run (recommended) or Edge

### For Report Tracking
- **execution_engine**: Records which engine processed each run
- **execution_engine_reason**: Logs why that engine was selected (grant default, admin override, etc.)

## Default Behavior
- All grants will default to **Cloud Run** (production-ready, no timeout limits)
- Edge functions will be **allowed** by default for debugging purposes
- Super Admins can change these per grant version

## Technical Notes
- Uses `IF NOT EXISTS` to be idempotent (safe to re-run)
- Cloud Run is the recommended default as it has no timeout limits
- Edge functions have a 60-second timeout, suitable only for debugging short runs
