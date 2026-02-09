

## Finishing Touches: Review Status Indicators

Two small additions to complete the review workflow feature.

### 1. Pending Review Count Badge (AdminSidebar)

Add a live count of reviews assigned to the current admin that are in "pending" status. Display as a small badge next to the "Reviews" link in the sidebar.

- Query `report_reviews` where `reviewer_user_id = current user` and `status = 'pending'`
- Show count as a small numbered badge (e.g., a red/amber circle with "3")
- Use `useEffect` + Supabase query on mount (no need for realtime here)

### 2. "In Review" Badge on Application Workspace

When a researcher views their application and the latest report has `review_status` of `pending_review` or `in_review`, show an informational card/badge so they know their report is being reviewed.

- After reports are loaded, check the latest report's `review_status`
- If it's `pending_review` or `in_review`, show a card with a Clock icon and message like "Your report is currently being reviewed. You'll receive an email once it's ready."
- This replaces the "no report yet" state when the report exists but is still in review

### Technical Details

| File | Change |
|------|--------|
| `src/components/admin/AdminSidebar.tsx` | Add `useEffect` to fetch pending review count for current user; render badge on "Reviews" item |
| `src/pages/ApplicationWorkspace.tsx` | After loading reports, check `review_status`; show "In Review" info card when applicable |

