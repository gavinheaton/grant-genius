

## Fix: Markdown Bullets Not Rendering in CMS Pages

### Problem
Bullet points (and other markdown list styles) don't appear because Tailwind CSS strips default list styles. The CMS page wrapper uses `prose` classes to restore them, but the required Tailwind Typography plugin isn't activated.

The package `@tailwindcss/typography` is already installed -- it just needs to be registered in the Tailwind config.

### Solution
**One-line change** in `tailwind.config.ts`:

Add `require("@tailwindcss/typography")` to the `plugins` array (line 97):

```ts
plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
```

This activates the `prose` / `prose-lg` / `dark:prose-invert` classes already applied in `CmsPage.tsx`, which will correctly render:
- Bullet lists (`ul > li`)
- Numbered lists (`ol > li`)
- Blockquotes, tables, code blocks, and other markdown elements

No other file changes needed.

