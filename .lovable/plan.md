
## Add Hero Image Transparency Slider

### Problem
The hero background image overlay is hardcoded to 80% opacity (`bg-background/80`), making the image very faded. Admins need control over this.

### Changes

**1. `src/components/admin/homepage/SectionContentEditor.tsx`**
- Add a slider (0-100) inside the `hero` case labeled "Image Overlay Opacity"
- Stores the value as `content_json.overlay_opacity` (number, 0-100, default 80)

**2. `src/components/landing/Hero.tsx`**
- Read `overlay_opacity` from `overrideContent` or `settings` (default 80)
- Replace the hardcoded `bg-background/80` class with an inline style: `backgroundColor: hsl(var(--background) / {opacity})`

| File | Change |
|---|---|
| `src/components/admin/homepage/SectionContentEditor.tsx` | Add opacity slider (0-100) in the hero editor |
| `src/components/landing/Hero.tsx` | Use dynamic overlay opacity from content data instead of hardcoded 80% |
