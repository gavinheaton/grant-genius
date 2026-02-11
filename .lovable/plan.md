

## Add AI-Suggested Fixes to Failure Notification Emails

### What Changes

The failure notification email sent to `grantgenius@disruptorsco.com` currently only includes the Run ID, halt reason, and a link to the admin console. This change adds a **"Suggested Fix"** section that pattern-matches the halt reason text and includes actionable diagnostic advice directly in the email.

### How It Works

A simple pattern-matching function will analyze the `halt_reason` string and return a human-readable suggestion. No AI call is needed -- the most common failure modes have known fixes.

**Patterns to match:**

| Halt Reason Pattern | Suggested Fix |
|---|---|
| "JSON parse error" or "JSON Guard failed" | "The AI output was likely truncated due to insufficient token limits. Go to the prompt bundle step and increase `max_output_tokens` (e.g., from 4096 to 8192 or higher)." |
| "Unresolved variables" | "Template variables were not interpolated before execution. Check the prompt template for `{{variable}}` references and ensure all required inputs are provided in the application." |
| "timeout" or "deadline exceeded" | "The step exceeded its time limit. Consider increasing `timeout_seconds` for this step, or splitting the prompt into smaller sub-tasks." |
| "rate limit" or "429" | "The AI provider rate-limited the request. Wait a few minutes and retry, or switch to a different model via `model_override`." |
| "forbidden token" or "citation lint" | "The final report contained internal markers or placeholder tokens. Review the sanitiser step prompt to ensure all internal references are resolved before assembly." |
| Default (no match) | "No automated suggestion available. Review the step logs in the admin console for details." |

### File Changed

**`supabase/functions/worker-proxy/index.ts`** (lines ~542-566)

1. Add a `getSuggestedFix(haltReason: string): string` function that pattern-matches the halt reason and returns an advice string.
2. Include the suggestion in the failure email HTML as a styled "Suggested Fix" section below the halt reason.

### Email Output Example

The failure email will look like:

```
Report Generation Failed
Run ID: 4043a0e5-...
Halt Reason: JSON Guard failed after 3 attempts: JSON parse error...

Suggested Fix:
The AI output was likely truncated due to insufficient token limits.
Go to the prompt bundle step and increase max_output_tokens
(e.g., from 4096 to 8192 or higher).

[View in Admin Console]
```

### No Database or Schema Changes Required

This is a single edge function update to `worker-proxy/index.ts`.

