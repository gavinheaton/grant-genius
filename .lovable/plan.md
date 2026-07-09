## Verify Brevo IP allow-list fix

There are no recent `send-magic-link` logs, so I can't confirm from evidence whether Brevo is now accepting our requests.

### Steps
1. You trigger one magic-link sign-in from `/auth` (any email is fine).
2. I re-check the `send-magic-link` edge function logs.
3. If logs show `Email sent successfully` — the finding is resolved.
4. If logs still show `Brevo API error - status 401 unrecognised IP` — the IP shown in the new error needs to be added in Brevo Security → Authorised IPs (the outbound IP can change), or the API key's IP restriction should be removed entirely.

No code changes are involved — this is a Brevo account configuration issue.
