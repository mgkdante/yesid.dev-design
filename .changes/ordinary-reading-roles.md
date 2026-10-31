---
"@yesid/tokens": patch
"@yesid/ui": patch
---

Add explicit ordinary-reading size roles: prose 19/20px, block code 16/17px, inline code 0.95em, figure captions 16px, supporting prose 18px and section headings 20/22px, with desktop sizes starting at 1024px. Apply these roles with the documented line heights when adopting the package. The shared class merger recognizes them as font sizes, preserving text colours and replacing competing base sizes. Existing body, mono, caption, compact-density, control, data and artistic display sizes are unchanged. Gallery demonstrates the reading roles.
