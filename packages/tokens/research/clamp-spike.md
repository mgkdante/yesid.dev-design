# clamp() in DTCG — serialization decision

**Date:** 2026-04-26 · **Slice:** slice-design-1-token-engine · **Status:** Decision

## Context
yesid.dev uses `clamp(min, preferred, max)` extensively for fluid typography and spacing.
The W3C DTCG draft `dimension` type accepts a single value, not a clamp expression.
We need a serialization that survives round-trips (Figma MCP, `design-md` lint, our generators)
without losing min/preferred/max separability.

## Findings
- DTCG draft 4.0: `dimension` is `{ value: number, unit: string }` — single value only.
- Tokens Studio extends with `composite` types; Figma's announced native DTCG export will likely
  follow Style Dictionary's `expression` pattern.
- The `design-md` Google CLI accepts arbitrary string values in YAML — it does not type-check
  dimension internals beyond "is a string or number."

## Decision
**Store clamp values with a `$type: "yesid.clamp"` extension and a structured `$value`.**
Generators serialize back to a CSS string per output target.

```jsonc
{
  "text": {
    "display": {
      "fontSize": {
        "$type": "yesid.clamp",
        "$value": {
          "min": "2.5rem",
          "preferred": "5vw",
          "max": "4rem"
        }
      }
    }
  }
}
```

Generators emit:
- **tokens.css / app.css:** `clamp(2.5rem, 5vw, 4rem)`
- **motion/tokens.ts:** N/A — motion tokens have no clamp values today
- **DESIGN.md YAML:** flat string `"clamp(2.5rem, 5vw, 4rem)"` (Google CLI accepts strings)
- **Figma Variables:** Figma supports min/max via formulas; preferred maps to default value;
  documented in `figma.md` (Child 3)

## Fallback (R1 fall-back per spec)
If the `yesid.clamp` extension breaks Figma MCP `variable_tool`, store as
`{ "$type": "string", "$value": "clamp(2.5rem, 5vw, 4rem)" }`. Lossy for round-trip but works
for all 5 outputs. Document in handoff if invoked.

## Owner
Yesid. Re-evaluate when Figma ships native DTCG export (announced 2026).
