---
"@yesid/motion": patch
---

`initLenis` now registers ScrollTrigger before it reads `ScrollTrigger.isTouch`. Before, Lenis started on touch devices whenever the app had not yet called `initScrollTriggerConfig()`, which is the case when `SiteRoot` mounts before the app's own `onMount`. Apps that already call `initScrollTriggerConfig()` first are unaffected.
