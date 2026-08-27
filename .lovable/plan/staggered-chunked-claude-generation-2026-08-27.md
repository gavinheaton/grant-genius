# Staggered (chunked) Claude generation

## What the evidence shows

Two runs from this morning are still sitting at `running` with no failure recorded:

- `7cfa3e95…` started 05:48, logs stop at "Calling Claude API…"
- `0b39e71c…` started 05:58, stream opened fine on `claude-sonnet-4-5-20250929` (1,268 input tokens)

The function logs then show `shutdown` at 05:51:59 — a few minutes into the 05:48 run.
So the model is answering, but the edge worker is being terminated by the runtime before
the stream finishes. Nothing marks the run failed, so the UI just hangs. Earlier failures
were the opposite end of the same problem: one giant answer hitting `max_tokens` with
nothing usable.

Both symptoms come from asking for the whole report in a single long response.

## The fix: stagger the generation into resumable chunks

Instead of one open-ended call, each invocation of `run-claude-report` does a bounded
slice of work, saves what it got, and hands off to the next invocation.

```text
invoke #1 -> stream ~2 min -> save partial HTML + state -> re-invoke self
invoke #2 -> continue from partial -> save -> re-invoke self
...
invoke #N -> model signals end_turn -> assemble -> save report -> complete
```

How continuation works: Claude is re-sent the original prompt plus everything it has
written so far as a prefilled assistant turn, and asked to carry on from exactly that
point. The pieces are concatenated, so the final HTML is one continuous document.

Details:

1. **Persist progress.** Partial HTML, chunk index, last `stop_reason` and a heartbeat
   timestamp are written to the run's step record after every chunk. A crash mid-way now
   loses at most one chunk, not the whole run.
2. **Bounded slice per invocation.** Each chunk uses a smaller `max_tokens` (~8k) and a
   soft wall-clock budget (~2 minutes) well inside the edge runtime limit. When the budget
   is hit, the reader is closed cleanly and whatever streamed is kept.
3. **Continue or finish.** If the chunk ended with `stop_reason: max_tokens` or the budget
   cut it short, the worker re-invokes itself for the next chunk. If it ended with
   `end_turn`, assembly and save proceed as today.
4. **Loop guards.** Hard cap on chunk count (e.g. 10), and a chunk that returns zero new
   characters twice in a row fails the run with a specific reason instead of looping.
5. **No more silent hangs.** The heartbeat lets the existing stalled-run cleanup mark a run
   failed when a chunk dies, and the resume path can pick up from the last saved chunk
   rather than restarting the whole report.
6. **Progress in the UI.** Each chunk logs "Section N generated (x chars)" to the run log,
   so researchers and admins see forward motion instead of a frozen spinner.

## Cleanup for the two stuck runs

Mark `7cfa3e95…` and `0b39e71c…` as failed with a clear reason so their applications leave
the in-progress state, and reuse one of them to verify the chunked path end to end (no new
credit consumed).

## Alternative considered

Moving the Claude engine onto the Cloud Run worker removes the runtime ceiling entirely and
matches how the multi-step pipeline already runs. That is a larger change; the chunked
approach above keeps the current engine and can ship now. Worth doing later if chunk
stitching proves fragile.

## Not changing

Prompt content, the pinned `claude-sonnet-4-5` model, report saving, reference validation,
emails, and exports all stay as they are.
