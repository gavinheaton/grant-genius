

## Fix: Update Stuck Applications and Send Missing Emails

### Problem

5 applications have completed Cloud Run report runs but remain at `draft` status with no email sent. This is the exact bug we just fixed in `worker-proxy` — these are the historical victims.

### What Needs to Happen

**1. Update application status** for all 5 apps from `draft` to `ready`:

| Application | App ID | User |
|---|---|---|
| Test Humankind 2 | `a9220476-...` | joanne@disruptorsco.com |
| BERST v2 | `045ca1ce-...` | gavin@disruptorsco.com |
| Jessie Technology | `261b5db3-...` | gavin@disruptorsco.com |
| ErythroSight | `8e873537-...` | gavin@disruptorsco.com |
| AMT Bio Single Prompt | `ffa2e800-...` | gavin@disruptorsco.com |

**2. Send REPORT_READY emails** for the latest completed report on each application by calling the `send-report-email` edge function with the correct `reportRunId`, `reportId`, `applicationId`, and `userId` for each.

### Approach

- Use a database migration to update `applications.status = 'ready'` for the 5 app IDs
- Call the `send-report-email` edge function 5 times (once per app, using the most recent completed report run) to trigger the notification emails

### Data for Email Calls

| App Title | reportRunId | reportId | applicationId | userId |
|---|---|---|---|---|
| Test Humankind 2 | `7b279e5c-61dc-4bab-990c-c2af995d8ca2` | `dea2fc81-326b-49b6-8d04-58de2b7a85c8` | `a9220476-1139-463f-aceb-10d74ac85d4f` | `26c64646-56bd-4e28-b218-765111c76d23` |
| BERST v2 | `7025ef28-4c2c-4234-899e-c2a5587feb12` | `c366072e-09c5-4501-9059-d2b6b286723c` | `045ca1ce-a27f-4959-b06a-1ddc998a9a0d` | `46d9f8cd-c549-4e76-9105-a96d8aff30d2` |
| Jessie Technology | `0fd6e191-1de6-4642-a6fe-c94f611d0db5` | `8975249d-998b-4d6d-9bf2-d30e0cb05eac` | `261b5db3-c23f-4213-b42c-b45442477e7c` | `46d9f8cd-c549-4e76-9105-a96d8aff30d2` |
| ErythroSight | `c6c9145c-8d2d-4dd3-8de7-b31e9cd703d5` | `0ee99141-084b-4de2-8d72-f751a1d26caa` | `8e873537-2295-46ef-a1c5-c2339a315c14` | `46d9f8cd-c549-4e76-9105-a96d8aff30d2` |
| AMT Bio Single Prompt | `83e27546-b640-4cd6-886b-055242996cf4` | `27f9d3b7-9a6d-4f4c-9f75-dbedbcb2e721` | `ffa2e800-112e-4755-8c85-194a5794c59f` | `46d9f8cd-c549-4e76-9105-a96d8aff30d2` |

### Technical Summary

| Action | Detail |
|---|---|
| SQL update | Set `applications.status = 'ready'` for the 5 application IDs |
| Edge function calls | Call `send-report-email` 5 times with the data above |
| No code changes | This is a data fix only, no source code modifications needed |

