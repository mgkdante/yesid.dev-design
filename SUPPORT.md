# Support

## Reproducible software defects

Use the repository's [bug report form](https://github.com/mgkdante/yesid.dev-design/issues/new?template=bug-report.yml)
for defects in an exact released tag of tokens, motion,
gates, SEO kit, UI, analytics, i18n core, or Gallery documentation. Include the exact tag from your
package URLs and a minimal reproduction. Remove secrets and private product data from evidence.

Supported reports identify an upstream package contract that can be reproduced
without patching the installed package. A consumer defect should first
be reduced at the boundary that appears to own it; see
[`CONTRIBUTING.md`](CONTRIBUTING.md#escaped-consumer-defects).

## Out of scope

Consumer-owned code, copy, application policy, deployment, and product-specific
Tailwind vocabulary stay with that consumer unless the reproduction proves a
portable upstream defect. Brand direction and identity values are owner
decisions, not support requests. General application development and bespoke
integration work are also outside repository support.

Feature requests must describe the reusable contract and the consumers that
need it.

## Security reports

Do not open a public issue for a suspected vulnerability. Use GitHub's enabled
[private vulnerability reporting](https://github.com/mgkdante/yesid.dev-design/security/advisories/new)
flow. Include affected tags, impact, reproduction, and any known mitigation.

## Release support window

Only immutable published releases can be production support targets. Branches,
moving references, and local builds are useful for diagnosis but do not claim published Release
provenance. Consumers choose their own upgrade schedule; see
[`DEPRECATION.md`](DEPRECATION.md) for compatibility and removal rules.
