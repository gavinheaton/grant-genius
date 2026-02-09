

## Favicon and Google Analytics Update

### Changes to `index.html`

**1. Favicon**
Replace the existing favicon reference with:
```html
<link rel="icon" href="https://disruptorsco.com/wp-content/uploads/2023/10/cropped-dc-stacked-icon-180x180.png" type="image/png" />
```

**2. Google Analytics (GA4)**
Add the gtag.js snippet to the `<head>` using Measurement ID `G-BY7T9G87NW`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-BY7T9G87NW"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-BY7T9G87NW');
</script>
```

### Technical Details
- **File**: `index.html` (single file change)
- Remove the old `<link rel="icon" href="/favicon.ico">` line
- Add both the favicon link and GA4 scripts into the `<head>` section

