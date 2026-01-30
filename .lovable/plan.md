
# Add Diagnostic Logging to worker-proxy

## Overview
Add detailed logging to the `worker-proxy` edge function to capture exactly what the external Replit worker is sending when it calls `update_step` and `save_report`. This will help diagnose whether the worker is sending empty content or if something is being lost in transit.

## Changes to Make

### File: `supabase/functions/worker-proxy/index.ts`

#### 1. Add logging to `handleUpdateStep` (lines 257-290)
Log incoming step updates to see if the worker is sending empty outputs:

```typescript
async function handleUpdateStep(supabase: any, params: Record<string, unknown>) {
  const { report_run_id, step_number, status, outputs_json, citations_json, error_message, started_at, completed_at } = params;

  // DIAGNOSTIC LOGGING
  const outputsPreview = outputs_json 
    ? JSON.stringify(outputs_json).substring(0, 500) 
    : "undefined";
  console.log(`[DIAG] update_step: run=${report_run_id}, step=${step_number}, status=${status}`);
  console.log(`[DIAG] update_step outputs preview: ${outputsPreview}`);
  if (outputs_json && typeof outputs_json === "object") {
    const keys = Object.keys(outputs_json as object);
    console.log(`[DIAG] update_step outputs keys: ${keys.join(", ")}`);
  }
  // END DIAGNOSTIC LOGGING

  // ... rest of existing validation and update logic
}
```

#### 2. Add logging to `handleSaveReport` (lines 325-412)
Log the final report content to see what structure is being saved:

```typescript
async function handleSaveReport(supabase: any, params: Record<string, unknown>) {
  const { report_run_id, content_json, citations_json } = params;

  // DIAGNOSTIC LOGGING
  console.log(`[DIAG] save_report called for run: ${report_run_id}`);
  
  if (content_json && typeof content_json === "object") {
    const keys = Object.keys(content_json as object);
    console.log(`[DIAG] save_report content_json keys: ${keys.join(", ")}`);
    
    // Check for assembledReport structure
    const contentObj = content_json as Record<string, unknown>;
    if (contentObj.assembledReport) {
      const assembled = contentObj.assembledReport as Record<string, unknown>;
      const assembledKeys = Object.keys(assembled);
      console.log(`[DIAG] save_report assembledReport keys: ${assembledKeys.join(", ")}`);
      
      if (assembled.report_html) {
        const htmlLength = String(assembled.report_html).length;
        console.log(`[DIAG] save_report report_html length: ${htmlLength} chars`);
      } else {
        console.log(`[DIAG] save_report WARNING: No report_html in assembledReport!`);
      }
    } else {
      console.log(`[DIAG] save_report WARNING: No assembledReport in content_json!`);
    }
    
    // Check for sections array
    if (contentObj.sections && Array.isArray(contentObj.sections)) {
      const nonEmptySections = (contentObj.sections as Array<{content?: string}>)
        .filter(s => s.content && s.content.length > 0);
      console.log(`[DIAG] save_report sections: ${contentObj.sections.length} total, ${nonEmptySections.length} with content`);
    }
  }
  
  const contentPreview = content_json 
    ? JSON.stringify(content_json).substring(0, 1000) 
    : "undefined";
  console.log(`[DIAG] save_report content preview: ${contentPreview}`);
  // END DIAGNOSTIC LOGGING

  // ... rest of existing logic
}
```

## What This Will Reveal

After deploying this update, check the **worker-proxy** edge function logs when a report is generated. The logs will show:

| Log Pattern | What It Means |
|-------------|---------------|
| `outputs preview: {"content": ""}` | Worker is sending empty content (problem in Replit worker) |
| `outputs preview: {"content": "# Market Analysis..."}` | Worker sending real content (problem is elsewhere) |
| `WARNING: No assembledReport` | Final report structure is wrong |
| `report_html length: 0 chars` | HTML is empty but structure exists |
| `sections: 15 total, 0 with content` | All sections are empty |

## How to Use the Logs

1. **Generate a new report** after this change is deployed
2. **Check edge function logs** for `worker-proxy` in the backend dashboard
3. **Look for `[DIAG]` prefixed messages** to see exactly what the worker sent

## Expected Outcome

This will definitively answer whether:
- **The Replit worker is sending empty data** (fix needed in Replit)
- **Data is being lost in transit** (network/serialization issue)
- **Data is correct but not saved properly** (database issue)

## Technical Notes

- All logging uses `console.log` which appears in edge function logs
- Preview strings are truncated to avoid log overflow
- The `[DIAG]` prefix makes it easy to filter/search logs
- No functional changes to the existing logic - purely additive logging
