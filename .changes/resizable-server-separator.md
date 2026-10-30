---
"@yesid/ui": patch
---

`ResizableHandle` server-renders as a static separator, out of the tab order, and becomes focusable once paneforge has written its `aria-valuenow`, `aria-valuemin` and `aria-valuemax` on mount. Server markup no longer fails axe `aria-required-attr`, so tests can run axe without waiting for hydration.
