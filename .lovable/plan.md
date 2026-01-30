

# Phase 1: Database Timeout Configuration Update

## Overview
Update the `prompt_bundle_steps` table to increase timeout values for the research-heavy steps that are timing out. You'll handle the model changes separately through the admin UI.

## Database Changes

### SQL Update
```sql
-- Increase timeouts for research-heavy steps (4, 5, 9, 10, 11) to 50 seconds
UPDATE prompt_bundle_steps 
SET timeout_seconds = 50
WHERE bundle_id = '90e0e5bd-f625-47c9-83a0-08821153c895'
  AND step_number IN (4, 5, 9, 10, 11);

-- Reduce assembly step timeouts to 45s for safety margin
UPDATE prompt_bundle_steps 
SET timeout_seconds = 45
WHERE bundle_id = '90e0e5bd-f625-47c9-83a0-08821153c895'
  AND step_number IN (12, 13);
```

## Configuration Summary

| Step | Name | Timeout Before | Timeout After |
|------|------|----------------|---------------|
| 4 | find_competitors | 35s (default) | 50s |
| 5 | market_sizing_source_pack | 35s (default) | 50s |
| 9 | economic_impact | 35s (default) | 50s |
| 10 | competitor_table | 35s (default) | 50s |
| 11 | partner_businesses | 35s (default) | 50s |
| 12 | assemble_sections | 55s | 45s |
| 13 | build_tables_sources | 55s | 45s |

## Your Manual Steps
After the database update, you'll change the models in the Prompt Bundles admin UI:
- Steps 4, 5, 9, 10, 11 → `gemini-2.5-flash-lite`

## Post-Update Testing
1. Mark the current stuck run as failed
2. Generate a new report
3. Monitor logs to verify steps complete within 50s

