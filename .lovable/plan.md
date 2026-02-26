

## Add API Key Display and Integration Guide to Admin UI

### Problem
The `API_SECRET_KEY` is stored as a backend secret but there's no way for Super Admins to view it or share it with other apps. We need a secure way to surface this in the API Management page, along with integration instructions.

### Approach

Since the API key is stored as a backend secret (not accessible from the client), we'll create a small edge function that Super Admins can call to retrieve it, and add a "Developer Integration" card to the existing API Management page.

### Changes

**1. New edge function: `supabase/functions/get-api-key/index.ts`**
- Accepts authenticated requests only
- Verifies the caller is a Super Admin (checks `user_roles` table)
- Returns the `API_SECRET_KEY` value and the base URL for API endpoints
- This is the only secure way to surface a backend secret to the UI

**2. Update `src/pages/admin/ApiManagement.tsx`**
- Add a "Developer Integration" card (Super Admin only) at the top of the page containing:
  - A "Reveal API Key" button that calls the new edge function
  - The key is shown in a masked field with copy-to-clipboard functionality
  - The base URL for API endpoints (auto-derived from the project)
  - A quick-reference integration guide showing the two endpoints, required headers, and example request/response payloads
- Gate the card behind `isSuperAdmin` from `useAdminAuth` hook
- Add a security note reminding that the key grants full API access without credit checks

### Security Considerations
- Only Super Admins can reveal the key (server-side role check in the edge function)
- The key is not loaded on page render -- requires an explicit button click
- The key display auto-hides after 60 seconds

### Technical Details

The edge function will:
1. Validate the JWT using `getClaims()`
2. Query `user_roles` for `super_admin` role using service role client
3. Return `{ api_key, base_url }` or 403

The UI card will include:
- Masked key display with reveal/copy buttons
- Base URL display with copy button
- Collapsible integration guide with endpoint docs and code snippets
- The `useAdminAuth` hook is already available and provides `isSuperAdmin`

