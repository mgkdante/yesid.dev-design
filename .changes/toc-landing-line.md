---
"@yesid/ui": patch
---

TOC jumps land on the active-section line. `navigateToc` and `revealTocTarget` (with the default `block: 'start'`) now place the target a quarter down the viewport instead of flush under the site chrome, and `observeActiveToc` reads that same line, so after a jump the pill counter and the highlighted entry name the section the reader picked. App scroll margins no longer affect TOC jumps. No API changes.
