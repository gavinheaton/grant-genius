

## Dynamic Homepage Section Builder

### What Changes

Replace the current fixed-section landing page (Hero, Features, Pricing, Footer hardcoded in order) with a dynamic, reorderable section system. Admins can add, remove, and drag-reorder any number of sections from a library of content types.

### New Section Types

| Type | Description |
|---|---|
| `hero` | Existing hero section (badge, headline, CTAs, trust items, background image) |
| `features_grid` | Existing feature cards grid with heading/subheading |
| `pricing` | Existing pricing plans section |
| `text_image_left` | Two columns: text on left, image on right |
| `text_image_right` | Two columns: image on left, text on right |
| `stats_bar` | Row of stat numbers with labels (e.g. "500+ Reports") |
| `testimonials` | Grid/carousel of quotes with author info |
| `cta_banner` | Full-width call-to-action strip |
| `logo_cloud` | Row of partner/university logos |
| `faq` | Accordion of question-answer pairs |
| `rich_text` | Freeform markdown content block |

### Database Changes

**New table: `homepage_sections`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `section_type` | text | One of the types above |
| `sort_order` | integer | Controls rendering order |
| `is_visible` | boolean | Toggle section on/off without deleting |
| `heading` | text | Optional section heading |
| `subheading` | text | Optional section subheading |
| `content_json` | jsonb | Type-specific content payload |
| `settings_json` | jsonb | Type-specific display settings (bg color, padding, etc.) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

The existing `homepage_settings` table is kept for backward compatibility (hero defaults, footer settings, pricing defaults) but the new sections table becomes the primary source when sections exist.

**RLS Policies:**
- Anyone can SELECT (public landing page)
- Admins can INSERT, UPDATE, DELETE

**Content JSON examples by type:**

```text
text_image_left / text_image_right:
  { "heading": "...", "body_markdown": "...", "image_url": "...", "cta_text": "...", "cta_link": "..." }

stats_bar:
  { "stats": [{ "value": "500+", "label": "Reports" }, ...] }

testimonials:
  { "items": [{ "quote": "...", "author": "...", "role": "...", "avatar_url": "..." }, ...] }

cta_banner:
  { "heading": "...", "subtext": "...", "button_text": "...", "button_link": "...", "style": "primary" }

logo_cloud:
  { "heading": "Trusted by", "logos": [{ "url": "...", "alt": "...", "link": "..." }, ...] }

faq:
  { "items": [{ "question": "...", "answer": "..." }, ...] }

rich_text:
  { "markdown": "..." }

features_grid:
  { "items": [{ "icon": "...", "title": "...", "description": "..." }, ...] }

hero:
  { "badge": "...", "headline": "...", "subheadline": "...", ... }

pricing:
  { "plans": [...], "footer_note": "..." }
```

### Frontend Changes

**Landing page (`src/pages/Landing.tsx`)**

Replace the hardcoded section list with a dynamic renderer:
- Query `homepage_sections` ordered by `sort_order`
- For each section, render the appropriate component based on `section_type`
- Fall back to current hardcoded layout if no sections exist (backward compatibility)

**New components in `src/components/landing/`:**
- `SectionRenderer.tsx` -- maps section_type to the correct component
- `TextImageSection.tsx` -- two-column text + image layout (prop controls left/right)
- `StatsBar.tsx` -- horizontal stat numbers
- `Testimonials.tsx` -- quote grid
- `CtaBanner.tsx` -- full-width CTA strip
- `LogoCloud.tsx` -- logo row
- `FaqSection.tsx` -- accordion FAQ
- `RichTextSection.tsx` -- markdown block

**Homepage Editor (`src/pages/admin/HomepageEditor.tsx`)**

Major redesign of the editor:

1. **Section list panel** (left/main area):
   - Shows all sections as draggable cards in order
   - Each card shows type icon, heading preview, visibility toggle
   - Drag handle for reordering (update `sort_order` on drop)
   - Click to expand/edit inline
   - Delete button with confirmation

2. **"Add Section" button**:
   - Opens a picker dialog showing all available section types with icons and descriptions
   - Inserts new section at the bottom with default content

3. **Per-section editor**:
   - When a section card is expanded, shows the appropriate editor form
   - Hero, Features, Pricing editors remain largely the same but are now inline within the card
   - New editors for each new type (text fields, image upload, array item management)
   - Section-level settings: background style (light/muted/dark), padding size, visibility toggle

4. **Footer tab remains separate** (footer is always rendered last, not part of the dynamic sections)

### New hook: `useHomepageSections`

```text
useHomepageSections()     -- query all sections ordered by sort_order
useCreateSection()        -- insert new section
useUpdateSection()        -- update content/settings
useDeleteSection()        -- remove section
useReorderSections()      -- batch update sort_order values
```

### Migration Strategy

- Keep existing `homepage_settings` table and its data
- On first load, if `homepage_sections` is empty, Landing.tsx falls back to the current hardcoded Hero/Features/Pricing
- Admin can optionally "Initialize from current" which seeds `homepage_sections` from the existing `homepage_settings` data
- Once sections exist, they take priority

### Files Changed

| File | Change |
|---|---|
| **Database** | Create `homepage_sections` table with RLS |
| `src/hooks/useHomepageSections.ts` | New hook for CRUD + reorder |
| `src/pages/Landing.tsx` | Dynamic section rendering with fallback |
| `src/components/landing/SectionRenderer.tsx` | New: maps type to component |
| `src/components/landing/TextImageSection.tsx` | New: two-column layout |
| `src/components/landing/StatsBar.tsx` | New: stats row |
| `src/components/landing/Testimonials.tsx` | New: quotes grid |
| `src/components/landing/CtaBanner.tsx` | New: CTA strip |
| `src/components/landing/LogoCloud.tsx` | New: logo row |
| `src/components/landing/FaqSection.tsx` | New: FAQ accordion |
| `src/components/landing/RichTextSection.tsx` | New: markdown block |
| `src/pages/admin/HomepageEditor.tsx` | Full rewrite to section-based editor with drag-reorder |
| `src/hooks/useHomepageSettings.ts` | Kept, no changes (backward compat) |

