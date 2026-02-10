

## Extend CMS: Editable Home Page, Pricing, and Footer

### Overview

All landing page content (Hero, Features, Pricing, Footer) is currently hardcoded in React components. This plan introduces a `homepage_settings` table and an admin editor page so every section of the homepage -- including the pricing table's text, feature lists, and the footer -- can be managed from the Admin Console without code changes.

The pricing section will remain wired to the existing Stripe integration (price IDs, `usePurchase` hook, checkout flow). Only the display text (headings, plan names, descriptions, feature bullet points, GST notes, CTA labels) becomes editable via the CMS. The actual purchase logic stays untouched.

---

### What Becomes Editable

**Hero Section**
- Background/hero image (uploaded to Storage)
- Badge text (e.g. "For Australian University Researchers")
- Headline and subheadline
- Primary and secondary CTA button labels and links
- Trust indicator items (icon name, label)

**Features Section**
- Section heading and subheading
- Feature cards: icon name, title, description (stored as a JSON array)

**Pricing Section**
- Section heading and subheading
- Per-plan display data: name, base price, GST note, description, feature bullet points, CTA label, highlighted flag
- Each plan maps to its existing Stripe product key (`single` or `bundle`), which is NOT editable -- this keeps the purchase flow intact
- Footer note text (e.g. "All prices in AUD...")

**Footer**
- Brand description text
- Footer link columns (JSON array of `{ heading, links: [{ label, url }] }`)
- Copyright text
- Support email
- CMS page links continue to render alongside the configurable columns

---

### Database Changes

**New table: `homepage_settings`** (single-row config pattern)

| Column | Type | Purpose |
|---|---|---|
| id | uuid PK | Single row, seeded in migration |
| hero_image_url | text | Uploaded hero image URL |
| hero_badge_text | text | Badge above headline |
| hero_headline | text | Main headline |
| hero_subheadline | text | Description paragraph |
| hero_cta_primary_text | text | Primary button label |
| hero_cta_primary_link | text | Primary button href |
| hero_cta_secondary_text | text | Secondary button label |
| hero_cta_secondary_link | text | Secondary button href |
| hero_trust_items | jsonb | Array of `{icon, label}` |
| features_heading | text | Section title |
| features_subheading | text | Section subtitle |
| features_items | jsonb | Array of `{icon, title, description}` |
| pricing_heading | text | Section title |
| pricing_subheading | text | Section subtitle |
| pricing_plans | jsonb | Array of `{type, name, basePrice, gstNote, description, features[], cta, highlighted}` |
| pricing_footer_note | text | Small print below pricing cards |
| footer_brand_description | text | Brand blurb |
| footer_columns | jsonb | Array of `{heading, links: [{label, url}]}` |
| footer_copyright | text | Copyright line |
| footer_support_email | text | Support email |
| updated_at | timestamptz | Auto-updated |
| updated_by | uuid | Admin who last saved |

**RLS Policies:**
- `SELECT`: public (landing page needs to read it without auth)
- `UPDATE` / `INSERT`: admin-only (via `is_admin(auth.uid())`)

**Storage bucket:** `homepage-assets` (public) for hero image uploads

**Seed data:** The migration inserts one row with all current hardcoded values so the page looks identical on first deploy.

---

### Frontend Changes

**1. New hook: `src/hooks/useHomepageSettings.ts`**
- `useHomepageSettings()` -- fetches the single row; returns typed data with hardcoded fallbacks so the page always renders
- `useUpdateHomepageSettings()` -- mutation for admin saves
- `useUploadHeroImage()` -- uploads to `homepage-assets` bucket, returns public URL

**2. Update `src/components/landing/Hero.tsx`**
- Consume settings for all text, CTAs, badge, trust indicators
- Render hero image as a full-width background (matching the reference image style)
- Fallback to current gradient background if no image is set

**3. Update `src/components/landing/Features.tsx`**
- Consume settings for heading, subheading, and feature items
- Icon names (strings like "FileText") mapped to Lucide components via a lookup object

**4. Update `src/components/landing/Pricing.tsx`**
- Consume settings for heading, subheading, plan display data, and footer note
- The `type` field on each plan (`"single"` or `"bundle"`) maps to the existing `handlePurchase()` function which calls `usePurchase()` with the correct Stripe price IDs
- Stripe price IDs, `usePurchase` hook, and checkout flow are NOT touched
- If no CMS data exists, falls back to the current hardcoded `plans` array

**5. Update `src/components/landing/Footer.tsx`**
- Consume settings for brand description, link columns, copyright, support email
- Render multi-column layout with configurable links alongside existing CMS page links
- Fallback to current layout if no settings exist

**6. New admin page: `src/pages/admin/HomepageEditor.tsx`**
- Tabbed interface with 4 tabs: Hero, Features, Pricing, Footer
- **Hero tab:** image upload dropzone, text fields for headline/subheadline/badge/CTAs, editable trust indicator list
- **Features tab:** editable card list (add/remove/reorder) with icon picker dropdown, title, description
- **Pricing tab:** editable plan list -- name, base price, GST note, description, feature bullets, CTA label, highlighted toggle. The `type` field is shown read-only (locked to `single`/`bundle` to preserve Stripe mapping). Section heading/subheading/footer note fields.
- **Footer tab:** brand description, editable column groups with nested link lists, copyright, support email
- Save button updates the single `homepage_settings` row
- "Preview" link opens the homepage in a new tab

**7. Update `src/components/admin/AdminSidebar.tsx`**
- Add "Homepage" entry under the Content section

**8. Update `src/App.tsx`**
- Add route `/admin/homepage` pointing to `HomepageEditor`

---

### How Pricing Stays Connected to Stripe

The pricing plans in the CMS store display-only data. The `type` field on each plan (`"single"` or `"bundle"`) is the key that connects to the existing purchase flow:

- `Pricing.tsx` calls `handlePurchase(plan.type)` on button click
- `handlePurchase` calls `purchaseReport()` or `purchaseBundle()` from `usePurchase`
- `usePurchase` uses the hardcoded Stripe price IDs (`SINGLE_REPORT_PRICE_ID`, `BUNDLE_10_PRICE_ID`)
- The `create-checkout` edge function creates the Stripe Checkout session

None of this logic changes. The CMS only controls what text appears on the cards.

---

### File Summary

| File | Change |
|---|---|
| Migration SQL | Create `homepage_settings` table + RLS + seed row + storage bucket |
| `src/hooks/useHomepageSettings.ts` | New -- fetch/update/upload hooks |
| `src/components/landing/Hero.tsx` | Consume CMS data, add hero image background |
| `src/components/landing/Features.tsx` | Consume CMS data for heading + feature cards |
| `src/components/landing/Pricing.tsx` | Consume CMS data for display text, keep Stripe wiring |
| `src/components/landing/Footer.tsx` | Consume CMS data for columns/links/copyright |
| `src/pages/admin/HomepageEditor.tsx` | New -- tabbed admin editor |
| `src/components/admin/AdminSidebar.tsx` | Add "Homepage" nav link |
| `src/App.tsx` | Add `/admin/homepage` route |

