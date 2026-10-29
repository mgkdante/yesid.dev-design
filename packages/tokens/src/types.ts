// DTCG-aligned token types for @yesid/tokens.
// W3C draft: https://design-tokens.github.io/community-group/format/

/** A primitive DTCG token (color, dimension, fontFamily, etc.). */
export interface DtcgPrimitive {
  $type: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier' | 'number' | 'string';
  $value: string | number;
  $description?: string;
}

/** Structured fluid-value extension; serialized under DECISIONS.md D10. */
export interface YesidClampToken {
  $type: 'yesid.clamp';
  $value: {
    min: string;
    preferred: string;
    max: string;
  };
  $description?: string;
}

/** Any leaf token. */
export type Token = DtcgPrimitive | YesidClampToken;

/** Recursive token tree. */
export interface TokenTree {
  [key: string]: Token | TokenTree;
}
