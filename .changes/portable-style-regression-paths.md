---
"@yesid/gates": patch
---

Normalize style-regression hit paths to `src/` with forward slashes on every OS, including scan roots with a trailing separator. Windows callers receive the same finding paths as Linux callers.
