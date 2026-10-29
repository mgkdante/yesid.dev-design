---
"@yesid/ui": patch
---

`ConstructionProps` with `layout="around-fixture"` now spaces its four artworks evenly on phones (below 768px). The order is balise, sign, a centred 40px gap for the caller's light, helmet, barricade, with equal gaps while the row fits its container (304px or wider); a narrower container shrinks the artwork to fit. Its phone rules now use a plain `(max-width: 767px)` query, so they apply without the consumer compiling `@custom-media`; consumers that already compile it get the same CSS. Artwork sizes, wider viewports and the other layouts are unchanged.
