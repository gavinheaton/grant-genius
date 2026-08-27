# Fix "Claude returned empty response" on single-prompt runs

## What's happening

The Claude single-prompt engine streams its answer back in small events. The current
code has a bug: when Claude sends a real error *in the middle of the stream*
(overload, rate limit, context too long, refusal), that error is caught and thrown
inside a `try` block whose own `catch` deliberately ignores unparseable data. So the
error is swallowed, the stream ends with no text, and the run fails with the generic
message "Claude returned empty response" — hiding the actual cause.

A second, related gap: the code never inspects the stream's completion metadata
(`stop_reason`), so a run that stopped early for a known reason still reports nothing
useful.

## Fix

In `supabase/functions/run-claude-report/index.ts` (streaming loop, ~lines 322-368):

1. Separate the JSON parse from the event handling. Only the `JSON.parse` call sits
   inside the tolerant `try/catch`; event handling (including the `error` event) runs
   outside it so a genuine stream error propagates to the outer handler and is written
   to `halt_reason` and the run log verbatim.
2. Capture `message_start` (model, input tokens) and `message_delta` (`stop_reason`,
   output tokens) and log them, so the run detail page shows how the generation ended.
3. When nothing was produced, fail with a specific reason built from whatever was
   captured — the stream error text, or `stop_reason` (e.g. `max_tokens`, `refusal`),
   or "stream closed with no content" — instead of the flat generic string.
4. Log the total streamed length and stop reason on success too, for future diagnosis.

## Retry behaviour

Mid-stream `overloaded_error` / `rate_limit_error` from Anthropic are transient. Add a
single automatic retry of the whole streamed call when the failure is one of those and
no content was produced yet, with a short backoff, logging the retry to the run log.
No retry if partial content already streamed (avoids duplicated report bodies).

## Not changing

Prompt content, model selection, timeouts/watchdog, and the downstream save/validation
path stay as they are.

## Verification

Deploy the function, re-run the failing report, and read the run's worker logs: either
the report completes, or the failure line now names the real Anthropic reason instead
of "empty response".
