

# Reset Stuck Grant Version for Fresh Pipeline Generation

## Current State

The grant version `5d26ac52-5cba-4264-b463-1fe22a9af733` (AEA Ignite) is stuck with:
- `pipeline_generation_status: 'generating'`
- `prompt_bundle_id: null` (no bundle was created - the function crashed before reaching that step)

## What Needs to Be Done

Reset the grant version status so you can retry the pipeline generation with the now-fixed code.

### Database Update Required

Run this SQL to reset the status:

```sql
UPDATE grant_versions 
SET pipeline_generation_status = 'none'
WHERE id = '5d26ac52-5cba-4264-b463-1fe22a9af733';
```

This single update will:
1. Clear the stuck `generating` status
2. Allow the UI to show the "Generate Pipeline" button again
3. Enable a fresh attempt with the corrected edge function code

## After Reset

Once approved, you can:
1. Navigate to the Admin Grants page
2. Click on the AEA Ignite grant
3. Use the "Generate Pipeline" button to run the corrected pipeline generation
4. Verify the archetype detection and step creation complete successfully

## Technical Context

- **AI Analysis**: Already completed successfully (status: `completed`)
- **Archetype**: Detected as "Commercialisation/Innovation" with medium confidence
- **Selected Modules**: `evidence_source_pack`, `economic_impact`, `stakeholder_mapping`, `market_sizing`, `competitor_analysis`, `ip_regulatory_strategy`
- **Rubric**: 3 sections extracted (Research Quality, Commercialisation Potential, Delivery Capability)

All the AI analysis data is preserved - only the pipeline generation step needs to be retried.

