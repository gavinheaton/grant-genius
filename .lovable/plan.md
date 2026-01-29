
# Plan: Add Configurable Processing Window per Step

## Status: ✅ COMPLETED

## Overview

This feature allows admins to set a custom **processing window (timeout)** for each of the 13 pipeline steps directly from the Prompt Bundle editor.

---

## Implementation Summary

### 1. Database Migration ✅
Added `timeout_seconds` column to `prompt_bundle_steps` table:
- `NULL` means "use default" (hardcoded logic: 90s for Step 0, 120s for Step 12, 45s for others)
- Numeric value overrides the default

### 2. TypeScript Types ✅
Updated `src/hooks/usePromptBundles.ts`:
- Added `timeout_seconds: number | null` to `PromptBundleStep` interface
- Updated clone mutation to copy `timeout_seconds`

### 3. Admin UI ✅
Updated `src/components/admin/PromptStepEditor.tsx`:
- Added "Processing Window" dropdown with options: Default, 30s, 45s, 60s, 90s, 120s, 150s, 180s
- Shows the current default for each step (e.g., "Default: 45s", "Default: 90s" for Step 0)
- Saves the configured timeout with other step changes

### 4. Edge Functions ✅
Updated both `generate-report/index.ts` and `resume-report-run/index.ts`:
- Updated `fetchActiveBundle` to fetch `timeout_seconds` from database
- Added `getTimeoutForStep(stepNumber, overrideSeconds)` function
- Updated `callAIWithRetry` to accept custom timeout parameter
- All 13 steps now use configurable timeout from the bundle

---

## Usage

Admins can now:
1. Navigate to Admin → Prompt Bundles → Edit a bundle
2. Expand any step
3. Select "Processing Window" dropdown
4. Choose a custom timeout or leave as "Default"
5. Save the step

The configured timeout will be used for that step's AI request during report generation.
