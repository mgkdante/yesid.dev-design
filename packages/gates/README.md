# @yesid/gates

Brand-quality checks that a product runs as its own lint script. The package finds violations;
each product decides which files to scan and supplies its palette, thresholds, allowlists,
exclusions and what counts as a failure.

## Interface

The root export holds the filesystem walk and comment helpers and the style, brand-hex, color-mix,
contrast, dataviz, Tailwind-variant and SEO-coverage engines. The
[product guide](https://github.com/mgkdante/yesid.dev-design/blob/v0.30.3/docs/BUILD-A-YESID-PRODUCT.md)
shows the `lint:design` script setup. The exact interface is in
[`api-reports/gates.api.md`](https://github.com/mgkdante/yesid.dev-design/blob/v0.30.3/api-reports/gates.api.md).

## Rules

- Engines take the product's configuration and return deterministic findings. They don't depend
  on Vitest or any other runner.
- Style-regression scans read each file once, keep the configured pattern and file order, and
  restore the caller's RegExp state after matching. Hit paths use `src/` plus the path relative to
  the scan root, with `/` separators on every OS, including when the root has a trailing separator.
- Comment stripping reads at most 1,048,576 UTF-16 code units, keeps every newline, and leaves
  incomplete delimiters visible so they can't hide later source.
- Filesystem walks reject symbolic links and non-regular entries, stay inside the canonical root,
  sort paths, and stop beyond 16 levels, 8,192 entries, 4,096 files or 32 MiB in total. Every
  regular file counts toward those limits, including extensions the engines skip. The limits leave
  at least 2.6x headroom over the largest product source tree measured.
- Product names, paths, colors, thresholds and policy never enter package defaults.

A scan that finds zero files usually means the product passed the wrong root or extensions.
Traversal rejects links and identity changes, but it can't guard against the tree being rewritten
while the caller reads the returned paths.

## Develop

```sh
bun run --cwd packages/gates test
bun run --cwd packages/gates check
```
