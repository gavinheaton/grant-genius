

# Add Admin User Functionality

## Overview
Enable Super Admins to add new admin users directly from the Admin Console. This allows inviting administrators without requiring them to first sign up as researchers.

## Approach

There are two ways to add admin users:

**Option A: Promote Existing Users (Already Implemented)**
The current system allows Super Admins to change a user's role from Researcher to Admin via the UserDetail page. This works for users who have already signed up.

**Option B: Add New Admin Users (To Be Implemented)**
Add an "Add Admin" button on the Users page that allows inviting a new user by email. This creates a profile and assigns an admin role immediately, then sends them a magic link to access the system.

## Implementation Details

### 1. Add "Add Admin" Button to Users Page

Update `src/pages/admin/Users.tsx` to include:
- An "Add Admin" button (visible only to Super Admins)
- A dialog/modal for entering the new admin's details

### 2. Create Add Admin Dialog Component

Create a new component `src/components/admin/AddAdminDialog.tsx`:
- Form with email input (required)
- Optional full name field
- Role selection (Admin or Super Admin) - restricted to Super Admins
- Submit triggers the invitation process

### 3. Create Edge Function for Admin Invitation

Create `supabase/functions/invite-admin/index.ts`:
- Validates the requesting user is a Super Admin
- Uses Supabase Admin API to create a new user
- Creates profile record with provided details
- Creates user_roles record with selected role
- Triggers magic link email for the new admin

This requires using the Supabase service role key to create users programmatically.

### 4. Update Users Page with Dialog Integration

```text
Changes to src/pages/admin/Users.tsx:
- Import AddAdminDialog component
- Add state for dialog open/close
- Add "Add Admin" button in the header (Super Admin only)
- Handle successful invitation with toast and list refresh
```

## Security Considerations

- Only Super Admins can add new admin users (enforced in edge function)
- Edge function validates caller's role before proceeding
- New admins receive a magic link - they still need to verify their email
- All actions are logged to audit_logs table

## User Flow

1. Super Admin clicks "Add Admin" button on Users page
2. Dialog opens with email and role selection
3. Super Admin enters details and submits
4. Edge function:
   - Validates Super Admin permission
   - Creates user in auth.users
   - Creates profile record
   - Creates user_roles record with selected role
   - Sends magic link email
5. New admin receives email, clicks link, gains access
6. Users list refreshes to show new admin

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/admin/AddAdminDialog.tsx` | CREATE | Dialog component for adding admin users |
| `src/pages/admin/Users.tsx` | MODIFY | Add button and dialog integration |
| `supabase/functions/invite-admin/index.ts` | CREATE | Edge function for secure user creation |

## Technical Details

### Edge Function Implementation

```text
invite-admin/index.ts:
1. Verify auth header and extract user from JWT
2. Check if requester has super_admin role using service client
3. Validate email format
4. Create user using supabase.auth.admin.createUser()
5. Insert profile record
6. Insert user_roles record with specified role
7. Generate and send magic link
8. Return success response with new user data
```

### Dialog Form Fields

```text
- Email (required, email validation)
- Full Name (optional)
- Role (select: Admin, Super Admin)
```

### Button Placement

The "Add Admin" button will be placed in the Users page header, next to the search and filter controls, visible only when `isSuperAdmin` is true.

