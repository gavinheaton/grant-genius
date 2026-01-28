

# Admin Credit Granting Feature

## Overview

Add the ability for Super Admins to manually grant report credits to users directly from the User Detail page in the Admin Console. This is essential for testing, customer support refunds, and promotional credits.

## Current State

- Entitlements are only created via the Stripe webhook (server-side)
- The `entitlements` table has no INSERT policy for authenticated users
- The UserDetail page already displays entitlements but has no way to add them
- Super Admins can already change user roles, so this follows the same pattern

## Solution Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│                     ADMIN CREDIT GRANTING FLOW                     │
└────────────────────────────────────────────────────────────────────┘
                               │
    ┌──────────────────────────▼──────────────────────────┐
    │  1. Super Admin views UserDetail page               │
    │     (sees existing entitlements table)              │
    └──────────────────────────┬──────────────────────────┘
                               │
    ┌──────────────────────────▼──────────────────────────┐
    │  2. Clicks "Grant Credit" button                    │
    │     (only visible to Super Admins)                  │
    └──────────────────────────┬──────────────────────────┘
                               │
    ┌──────────────────────────▼──────────────────────────┐
    │  3. Modal dialog opens:                             │
    │     - Credit type (REPORT_ONE_OFF)                  │
    │     - Quantity (default 1)                          │
    │     - Reason/note (for audit)                       │
    └──────────────────────────┬──────────────────────────┘
                               │
    ┌──────────────────────────▼──────────────────────────┐
    │  4. Calls Edge Function: grant-credit               │
    │     (uses service role key)                         │
    └──────────────────────────┬──────────────────────────┘
                               │
    ┌──────────────────────────▼──────────────────────────┐
    │  5. Edge Function:                                  │
    │     - Verifies caller is Super Admin                │
    │     - Creates entitlement row                       │
    │     - Logs action to audit_logs                     │
    └──────────────────────────┬──────────────────────────┘
                               │
    ┌──────────────────────────▼──────────────────────────┐
    │  6. UI refreshes, shows new entitlement             │
    └─────────────────────────────────────────────────────┘
```

## Implementation Plan

### 1. Create Edge Function: `grant-credit`

**File:** `supabase/functions/grant-credit/index.ts`

The edge function will:
- Verify the caller has Super Admin role (query `user_roles` table)
- Accept: `target_user_id`, `entitlement_type`, `quantity`, `reason`
- Insert into `entitlements` table using service role
- Insert audit log entry for accountability
- Return the created entitlement

### 2. Update UserDetail Page UI

**File:** `src/pages/admin/UserDetail.tsx`

Add to the Entitlements card:
- "Grant Credit" button (only for Super Admins)
- Dialog component for the grant form
- Mutation hook to call the edge function
- Success/error toast notifications

### 3. Create Grant Credit Dialog Component

**File:** `src/components/admin/GrantCreditDialog.tsx`

A modal dialog containing:
- Select for entitlement type (currently only REPORT_ONE_OFF)
- Number input for quantity (1-10)
- Text input for reason/note
- Cancel and Confirm buttons

### 4. Configure Edge Function

**File:** `supabase/config.toml`

Add configuration for the new function with `verify_jwt = false` (we'll verify manually).

## Technical Details

### Edge Function: `grant-credit`

```typescript
// Key logic:
// 1. Extract and verify JWT from Authorization header
// 2. Query user_roles to confirm caller is super_admin
// 3. Insert entitlement (no order_id - it's a manual grant)
// 4. Insert audit_log entry
// 5. Return success with new entitlement ID
```

### UI Component Changes

The UserDetail page Entitlements card will be enhanced:

| Current | After |
|---------|-------|
| Shows entitlements list | Shows entitlements list |
| No actions | "Grant Credit" button for Super Admins |
| - | Dialog for granting credits |

### Audit Trail

Every manual credit grant will be logged to `audit_logs` with:
- `entity_type`: "entitlements"
- `entity_id`: new entitlement ID
- `action`: "MANUAL_GRANT"
- `user_id`: granting admin's ID
- `new_value_json`: includes reason and target user

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/grant-credit/index.ts` | **Create** | New edge function for granting credits |
| `supabase/config.toml` | **Update** | Add grant-credit function config |
| `src/components/admin/GrantCreditDialog.tsx` | **Create** | Dialog component for grant form |
| `src/pages/admin/UserDetail.tsx` | **Update** | Add button and dialog integration |

## Security Considerations

- Only Super Admins can grant credits (verified server-side)
- All grants are logged to audit_logs for accountability
- No direct RLS policy change needed - uses service role key
- Rate limiting: edge function can add basic protection if needed

## Testing

After implementation:
1. Navigate to Admin → Users → Select a user
2. Click "Grant Credit" button
3. Fill in quantity and reason
4. Confirm and verify:
   - New entitlement appears in the list
   - User's credit count increases on their dashboard
   - Audit log entry is created

