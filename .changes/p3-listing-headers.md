---
"@yesid/ui": patch
---

`ListingFrame` draws every header drawing at one ink, `--blueprint-ink` on the art slot (0.32 dark, 0.5 light, a step bolder than before). It overrides the opacity `BlueprintShell` and inline styles give the drawings, so apps can delete their own listing-header opacities; an app rule that also forces opacity with `!important` must go. The header copy gets a halo in the page colour, and rests on the bottom of the band at every width; from 1024px without an `aside` it used to sit at the top.
