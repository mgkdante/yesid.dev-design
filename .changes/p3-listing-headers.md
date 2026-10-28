---
"@yesid/ui": patch
---

`ListingFrame` draws every header drawing at one ink, `--blueprint-ink` on the art slot (0.32 dark, 0.5 light, a step bolder than before), whatever opacity the app or the drawing sets, and gives the header copy a halo in the page colour so strokes never cut into it. The header copy now rests on the bottom of the band at every width; from 1024px without an `aside` it used to sit at the top. Apps can delete their own listing-header blueprint opacities.
