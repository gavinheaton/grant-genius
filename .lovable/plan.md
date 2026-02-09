
# Simple CMS for Static Pages

## Overview
Create a lightweight content management system that allows admins to create and manage static pages (privacy policy, disclaimer, terms of service, etc.) with control over visibility in navigation and authentication requirements.

---

## Features Summary

| Feature | Description |
|---------|-------------|
| **Page Title** | Display title shown in navigation and as page heading |
| **Rich Text Body** | WYSIWYG-style content editor for page content |
| **Show in Menu** | Toggle whether page link appears in the header navigation |
| **Menu Position** | Control ordering of menu items (optional enhancement) |
| **Visibility** | Public (anyone) or Authenticated (logged-in users only) |
| **URL Slug** | Auto-generated from title, editable for SEO-friendly URLs |
| **Status** | Draft/Published to allow editing before going live |

---

## Additional Suggestions

Based on your requirements, here are a few enhancements to consider:

1. **URL Slug Field** - Auto-generate from title (e.g., "Privacy Policy" → `/privacy-policy`) but allow manual override for SEO control

2. **Draft/Published Status** - Save pages as drafts before publishing, preventing incomplete content from appearing

3. **Menu Order** - Numeric field to control the order of menu items when multiple pages are shown in the header

4. **Footer Links** - Option to show the page link in the footer (like the existing Privacy/Terms links) in addition to or instead of the header

5. **Meta Description** - For SEO, allow setting a meta description for each page

---

## Data Model

### New Table: `cms_pages`

```text
┌─────────────────────────────────────────────────────────────┐
│ cms_pages                                                    │
├─────────────────────────────────────────────────────────────┤
│ id              UUID PRIMARY KEY                            │
│ title           TEXT NOT NULL (page title)                  │
│ slug            TEXT UNIQUE NOT NULL (URL path)             │
│ content_html    TEXT (rich text content)                    │
│ is_published    BOOLEAN DEFAULT false                       │
│ show_in_menu    BOOLEAN DEFAULT false                       │
│ show_in_footer  BOOLEAN DEFAULT false                       │
│ menu_order      INTEGER DEFAULT 0                           │
│ requires_auth   BOOLEAN DEFAULT false                       │
│ meta_description TEXT (optional SEO)                        │
│ created_at      TIMESTAMPTZ                                 │
│ updated_at      TIMESTAMPTZ                                 │
│ created_by      UUID (admin who created)                    │
└─────────────────────────────────────────────────────────────┘
```

### RLS Policies

- **Public SELECT**: Allow anyone to read published pages that don't require auth
- **Authenticated SELECT**: Allow logged-in users to read published pages requiring auth
- **Admin ALL**: Admins can create, update, delete all pages

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                           ADMIN CONSOLE                              │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  /admin/pages - Page list with CRUD                            │  │
│  │  - Create/Edit dialog with rich text editor                    │  │
│  │  - Toggle visibility, menu position, auth requirement          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          DATABASE                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  cms_pages table with RLS policies                             │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         PUBLIC SITE                                   │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐  │
│  │  Header.tsx         │    │  /page/:slug - Dynamic page render  │  │
│  │  - Fetches menu     │    │  - Renders content_html             │  │
│  │    pages            │    │  - Handles auth redirect if needed  │  │
│  └─────────────────────┘    └─────────────────────────────────────┘  │
│  ┌─────────────────────┐                                             │
│  │  Footer.tsx         │                                             │
│  │  - Fetches footer   │                                             │
│  │    pages            │                                             │
│  └─────────────────────┘                                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Database Setup
1. Create `cms_pages` table with migration
2. Add RLS policies for public/auth/admin access
3. Create index on `slug` for fast lookups

### Phase 2: Admin Interface
1. Add "Pages" link to admin sidebar under a new "Content" group
2. Create `src/pages/admin/CmsPages.tsx` - list view with table
3. Add create/edit dialog with:
   - Title input
   - Slug input (auto-generated from title)
   - Rich text editor (using react-markdown for preview, textarea for input)
   - Toggle switches for: Published, Show in Menu, Show in Footer, Requires Auth
   - Menu order number input
   - Meta description textarea

### Phase 3: Frontend Display
1. Create `src/pages/CmsPage.tsx` - dynamic page component
2. Add route `/page/:slug` to App.tsx
3. Update `Header.tsx` to fetch and display menu pages
4. Update `Footer.tsx` to fetch and display footer pages
5. Handle auth requirement (redirect to login if not authenticated)

### Phase 4: Rich Text Editor
For the rich text body, we have options:
- **Simple**: Textarea with Markdown preview (use existing `react-markdown`)
- **Enhanced**: Add a WYSIWYG library like `@tiptap/react` or `react-quill`

Recommendation: Start with Markdown textarea + preview, upgrade to WYSIWYG later if needed.

---

## Files to Create/Modify

### New Files
- `src/pages/admin/CmsPages.tsx` - Admin page management
- `src/pages/CmsPage.tsx` - Public page renderer
- `src/hooks/useCmsPages.ts` - Data fetching hook

### Modified Files
- `src/App.tsx` - Add routes for `/page/:slug` and `/admin/pages`
- `src/components/admin/AdminSidebar.tsx` - Add "Pages" menu item
- `src/components/landing/Header.tsx` - Fetch and display menu pages
- `src/components/landing/Footer.tsx` - Fetch and display footer pages

### Database Migration
- Create `cms_pages` table
- Add RLS policies

---

## Technical Details

### Slug Generation
```typescript
const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};
```

### Header Menu Query
```typescript
const { data: menuPages } = useQuery({
  queryKey: ['cms-menu-pages'],
  queryFn: async () => {
    const { data } = await supabase
      .from('cms_pages')
      .select('id, title, slug, requires_auth')
      .eq('is_published', true)
      .eq('show_in_menu', true)
      .order('menu_order');
    return data;
  }
});
```

### Auth Protection for Pages
```typescript
// In CmsPage.tsx
if (page.requires_auth && !isAuthenticated) {
  navigate('/auth', { state: { from: `/page/${slug}` } });
  return null;
}
```

---

## Summary
This CMS provides:
- Simple page creation with title and rich text content
- Flexible visibility controls (menu, footer, public/auth)
- SEO-friendly slugs
- Draft/published workflow
- Seamless integration with existing header/footer
- RLS-protected data access
