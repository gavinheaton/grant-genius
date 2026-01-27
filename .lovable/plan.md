

# Simplify Application Inputs for MVP

## Current State

The `ApplicationWorkspace.tsx` currently displays 5 input fields:
| Field | Type | Required | Status |
|-------|------|----------|--------|
| Research Technical Description | textarea | Yes | **Remove** |
| Public Article URL | url | Yes | Keep |
| 100-Word Summary | textarea | Yes | Keep |
| Technology Readiness Level | text | No | Keep (optional) |
| IP Status | text | No | Keep (optional) |

## Proposed Changes

### 1. Remove Technical Description Field

**File: `src/pages/ApplicationWorkspace.tsx`**

- Remove `technicalDescription` from the `ApplicationInputs` interface (line 24)
- Remove `technicalDescription` from the initial state object (line 53)
- Remove `technicalDescription` from the fetched data mapping (line 102)
- Remove the Technical Description form field section (lines 249-262)
- Update autosave condition to only check `summary` and `publicArticleUrl` (line 153)

### 2. Reorder Fields for Better UX

Place fields in logical order:
1. **Public Article URL** (first - provides context for the summary)
2. **100-Word Summary** (second - main required input)
3. **Optional fields** (TRL, IP Status - keep as-is at bottom)

### 3. Database Default Update

Update the default `required_inputs_json` for new grant versions to reflect the simplified schema. This ensures the Admin Console shows the correct defaults:

```json
[
  {"key": "publicArticleUrl", "label": "Public Article URL", "type": "url", "required": true, "help_text": "Link to a published article or preprint describing your research"},
  {"key": "summary", "label": "100-Word Summary", "type": "textarea", "required": true, "maxWords": 100, "help_text": "Concise summary of your research commercialisation potential"},
  {"key": "trl", "label": "Technology Readiness Level (TRL)", "type": "text", "required": false},
  {"key": "ipStatus", "label": "IP Status", "type": "text", "required": false}
]
```

---

## Technical Details

### Interface Change

```typescript
// Before
interface ApplicationInputs {
  technicalDescription: string;
  publicArticleUrl: string;
  summary: string;
  trl: string;
  ipStatus: string;
}

// After
interface ApplicationInputs {
  publicArticleUrl: string;
  summary: string;
  trl: string;
  ipStatus: string;
}
```

### Autosave Condition Update

```typescript
// Before (line 153)
if (inputs.technicalDescription || inputs.summary || inputs.publicArticleUrl) {

// After
if (inputs.summary || inputs.publicArticleUrl) {
```

### Form Field Order (After Change)

1. Public Article URL input (with helper text)
2. 100-Word Summary textarea (with word counter)
3. Optional fields grid (TRL + IP Status)

---

## Backward Compatibility

Existing applications that have `technicalDescription` data stored in `inputs_json` will continue to work - the field simply won't be displayed in the UI. The data remains in the database for historical reference.

---

## Summary of File Changes

| File | Change |
|------|--------|
| `src/pages/ApplicationWorkspace.tsx` | Remove technicalDescription from interface, state, fetch mapping, autosave check, and form UI |

No database migration needed - this is a UI-only change that simplifies what's displayed to researchers.

