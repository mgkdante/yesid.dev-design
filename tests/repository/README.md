# Repository tests

This suite owns contracts that cross a package or app boundary: release and adoption tooling,
public API reports, shared configuration, CI routing, governance, and repository trust roots.
`tooling/` tests executable root tools; `contracts/` tests repository-wide invariants.

Run it directly with `bun run test:repository`. The root `bun run test` command runs this suite
before the package and Gallery suites. Gallery keeps only its rendered integration, package
dogfood, accessibility, and browser authority tests.
