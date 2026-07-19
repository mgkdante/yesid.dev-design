# Deprecation policy

This policy applies to the public runtime, type, CSS, adoption, and manifest
contracts of the four released packages. Private Gallery code, test helpers,
and repository-only build internals are not public contracts unless a document
explicitly says otherwise.

## Lifecycle

### Experimental

An Experimental contract is labelled as such in its public documentation and
release notes. It is available for real use, but its shape is still being
validated. An incompatible experimental change waits for a minor release and
includes migration notes. A patch release does not silently reshape or remove
it.

### Stable

A public contract is Stable unless it is explicitly labelled Experimental or
Deprecated. Stable additions may ship compatibly. Incompatible changes enter
the Deprecated stage first; they do not appear without a migration path.

### Deprecated

A Deprecated contract remains functional and documented while consumers move
to its named replacement or migration. The release that starts deprecation
must include a release fragment, changelog entry, affected surface, replacement
path, and earliest eligible removal date.

Stable removal requires both of these gates:

1. at least 90 days have elapsed since the first published deprecation; and
2. the deprecated contract has remained available through at least one
   intervening minor release.

The deprecating minor does not count as the intervening minor. For example, a
contract deprecated in `v0.7.0` must still exist in `v0.8.0`; its earliest
version-eligible removal is `v0.9.0`, and only after the 90-day gate also passes.

## Compatibility rules

Patch releases never intentionally break a documented public contract. This
includes exports and export conditions, TypeScript declarations, Svelte props
and bindings, direct public assets, token names and meanings, adoption CLI
syntax, schema-2 manifest validation, and previously valid runtime behavior.

Fixing an implementation defect may change incorrect output, but the release
fragment must identify the corrected contract and the regression proof. If a
contract is unsafe enough that compatibility cannot be preserved, stop release
promotion, document the impact, and use an appropriately reviewed minor or
major transition. There is no hidden patch exception.

Removal evidence belongs in the pull request: the original deprecation release,
dates, intervening minor, migration documentation, API report diff, and focused
consumer or clean-room verification.
