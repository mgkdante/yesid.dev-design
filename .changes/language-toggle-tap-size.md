---
"@yesid/ui": patch
---

`LanguageToggle`'s link keeps the 44px tap minimum (`--size-tap-min`) on phones. It was 38px wide below 480px and 26px below 360px; the drawing keeps its phone size inside the wider target.
