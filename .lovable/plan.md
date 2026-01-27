

# Rebrand to "Grant Genius"

## Summary
Rename the application from "Grant Commercialisation Assistant" to "Grant Genius" and add "Powered by Disruptors Co" branding to the footer.

---

## Changes Required

### 1. Header Component
**File:** `src/components/landing/Header.tsx`
- Change the full name from "Grant Commercialisation Assistant" to "Grant Genius"
- Update the mobile abbreviation from "GCA" to "GG"

### 2. Footer Component  
**File:** `src/components/landing/Footer.tsx`
- Update brand name to "Grant Genius"
- Replace the copyright line with:
  ```
  © 2025 Grant Genius · Powered by Disruptors Co
  ```

### 3. Dashboard Header
**File:** `src/pages/Dashboard.tsx`
- Update the abbreviation from "GCA" to "Grant Genius" (or "GG" for mobile)

### 4. Document Metadata
**File:** `index.html`
- Update `<title>` to "Grant Genius"
- Update `og:title` meta tag
- Update description meta tags appropriately

### 5. CSS Comments (housekeeping)
**File:** `src/index.css`
- Update the design system comment header to reference "Grant Genius"

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/landing/Header.tsx` | Brand name + abbreviation |
| `src/components/landing/Footer.tsx` | Brand name + "Powered by Disruptors Co" |
| `src/pages/Dashboard.tsx` | Header abbreviation |
| `index.html` | Document title + meta tags |
| `src/index.css` | Comment header |

---

## Visual Preview

**Footer will display:**
```
[Logo] Grant Genius     Privacy Policy | Terms | Support     © 2025 Grant Genius · Powered by Disruptors Co
```

