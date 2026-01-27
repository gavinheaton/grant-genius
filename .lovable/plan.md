
# Admin Console Implementation Plan

## Overview

This plan outlines the implementation of a comprehensive Admin Console for the Grant Genius application. The console will provide role-based access for managing grants, users, email templates, and viewing audit logs, following the specifications in the PRD.

---

## Current State Analysis

**What exists:**
- Database tables: `grants`, `grant_versions`, `profiles`, `user_roles`, `email_templates`, `email_outbox`, `email_events`, `audit_logs`
- RBAC system with `app_role` enum (`researcher`, `admin`, `super_admin`)
- Security functions: `has_role()` and `is_admin()` already implemented
- RLS policies protecting admin-only operations
- 4 grants with published versions in the database
- 1 user (researcher role)

**What needs to be built:**
- Admin Console UI with sidebar navigation
- Grant management screens (list, create, edit, publish)
- User management screens (list, view, role assignment)
- Email template management screens
- Audit log viewer
- Role-based access control in the frontend

---

## Architecture

```text
/admin (layout with sidebar)
  /admin/grants           - Grant list + management
  /admin/grants/new       - Create new grant
  /admin/grants/:id       - Edit grant + versions
  /admin/users            - User list
  /admin/users/:id        - User details + role management
  /admin/emails           - Email template management
  /admin/emails/logs      - Email delivery logs
  /admin/audit-logs       - Audit log viewer
```

---

## Implementation Tasks

### Phase 1: Foundation and Routing

**1.1 Create Admin Layout Component**
- Create `src/components/admin/AdminLayout.tsx`
- Implement sidebar navigation using existing Sidebar components
- Add role-based route protection (redirect non-admins)
- Include header with user info and logout

**1.2 Create Admin Auth Hook**
- Create `src/hooks/useAdminAuth.ts`
- Fetch user role from `user_roles` table
- Provide `isAdmin`, `isSuperAdmin`, `isLoading` states
- Handle unauthorized access gracefully

**1.3 Set Up Admin Routes**
- Add admin routes to `src/App.tsx`
- Create placeholder pages for each section

---

### Phase 2: Grant Management

**2.1 Grants List Page (`/admin/grants`)**
- Create `src/pages/admin/Grants.tsx`
- Display all grants in a table with columns: Name, Description, Status (Active/Inactive), Latest Version, Actions
- Add "New Grant" button
- Implement search and filter functionality

**2.2 Create Grant Page (`/admin/grants/new`)**
- Create `src/pages/admin/GrantCreate.tsx`
- Form fields: Name, Description
- On submit, create grant and redirect to edit page

**2.3 Edit Grant Page (`/admin/grants/:id`)**
- Create `src/pages/admin/GrantEdit.tsx`
- Tabs: Details, Versions, Required Inputs, Rubric
- **Details Tab:** Edit name, description, toggle active status
- **Versions Tab:** List all versions, show draft vs published status
- **Required Inputs Tab:** JSON editor for defining input fields
- **Rubric Tab:** JSON editor for rubric criteria
- Add "Create New Version" functionality (copies latest version)
- Add "Publish Version" button (Super Admin only)

---

### Phase 3: User Management

**3.1 Users List Page (`/admin/users`)**
- Create `src/pages/admin/Users.tsx`
- Display users table with: Email, Full Name, Role, Created Date, Actions
- Search by email or name
- Filter by role

**3.2 User Detail Page (`/admin/users/:id`)**
- Create `src/pages/admin/UserDetail.tsx`
- Show user profile information
- Show user's applications (read-only view)
- Show user's orders and entitlements
- Role management dropdown (Super Admin only)

---

### Phase 4: Email Template Management

**4.1 Email Templates Page (`/admin/emails`)**
- Create `src/pages/admin/EmailTemplates.tsx`
- Display templates table: Template Key, Brevo Template ID, Description, Actions
- Add "New Template" button
- Edit template mapping (template_key to brevo_template_id)
- "Send Test" button to send test email to admin

**4.2 Email Logs Page (`/admin/emails/logs`)**
- Create `src/pages/admin/EmailLogs.tsx`
- Display email_outbox records with status
- Filter by: recipient, template key, status, date range
- Show related email_events for each outbox entry
- Add "Resend" button for failed emails (with rate limiting)

---

### Phase 5: Audit Logs

**5.1 Audit Logs Page (`/admin/audit-logs`)**
- Create `src/pages/admin/AuditLogs.tsx`
- Display audit_logs with: Action, Entity Type, Entity ID, User, Timestamp
- Filter by entity type, action, date range
- Expandable rows to show old/new value JSON diffs

---

### Phase 6: Backend Enhancements

**6.1 Add Audit Logging Trigger (Database)**
- Create a trigger function to automatically log changes to grants, grant_versions, email_templates
- Insert records into audit_logs table

**6.2 Update RLS Policies**
- Ensure admin can read all profiles (currently restricted)
- Add policy for admin to view email_outbox for all users

---

## File Structure

```text
src/
├── components/
│   └── admin/
│       ├── AdminLayout.tsx
│       ├── AdminSidebar.tsx
│       ├── GrantForm.tsx
│       ├── GrantVersionEditor.tsx
│       ├── UserRoleSelect.tsx
│       ├── EmailTemplateForm.tsx
│       └── AuditLogViewer.tsx
├── hooks/
│   └── useAdminAuth.ts
└── pages/
    └── admin/
        ├── AdminDashboard.tsx
        ├── Grants.tsx
        ├── GrantCreate.tsx
        ├── GrantEdit.tsx
        ├── Users.tsx
        ├── UserDetail.tsx
        ├── EmailTemplates.tsx
        ├── EmailLogs.tsx
        └── AuditLogs.tsx
```

---

## Permission Matrix Implementation

| Feature | Admin | Super Admin |
|---------|-------|-------------|
| View grants/versions | Yes | Yes |
| Create/edit grant drafts | Yes | Yes |
| Publish/rollback versions | No | Yes |
| View all users | Yes | Yes |
| Change user roles | No | Yes |
| Manage email templates | Yes | Yes |
| View email logs | Yes | Yes |
| Resend emails | Yes | Yes |
| View audit logs | Yes | Yes |
| Revoke user sessions | No | Yes |

---

## Database Changes Required

**Migration 1: Add RLS policy for admin to view all profiles**
```sql
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));
```

**Migration 2: Create audit logging trigger**
```sql
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (entity_type, entity_id, action, user_id, old_value_json, new_value_json)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Technical Notes

- All admin pages will use the `useAdminAuth` hook to verify role before rendering
- The sidebar will show/hide items based on admin vs super_admin role
- Forms will use react-hook-form with zod validation (existing pattern)
- Tables will use the existing shadcn Table components
- JSON editors for rubric/inputs will use a simple textarea with JSON validation initially
- The design will follow the existing Grant Genius design system (navy + amber)

---

## Estimated Scope

- **15-20 new components**
- **9 new pages**
- **1 new hook**
- **2 database migrations**
- **Updates to App.tsx for routing**

This implementation will provide a complete Admin Console matching the PRD requirements while integrating seamlessly with the existing codebase patterns and design system.
