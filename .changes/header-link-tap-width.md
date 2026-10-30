---
"@yesid/ui": patch
---

The last package controls under `--size-tap-min` now meet it: `SiteHeader` links are at least 44px wide with the label centred (a short label such as "Map" was 39px); the `Sheet` close button is a 44px square around the same icon (it was 16px), and a sheet header leaves room for it; the `CodeBlock` copy button is 44px tall inside the same title bar height (it was 29px) and keeps clear of the title when the bar wraps; nested `TocNav` entries are 44px tall like the top level (they were 36px).
