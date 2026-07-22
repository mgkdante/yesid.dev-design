# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately via GitHub's private vulnerability reporting: **Security tab → Report a vulnerability** on this repository. Do not open public issues for security reports.

You can expect an acknowledgement within a few days. Please include reproduction steps and the affected package or tool (`@yesid/tokens`, `@yesid/motion`, `@yesid/gates`, `@yesid/seo-kit`, `@yesid/ui`, `tools/adopt.ts`).

## Supported versions

Consumers pin tagged releases (`vX.Y.Z`). Security fixes ship as new tags; the latest tagged release is the supported one. Release tags are immutable — a published tag is never moved or reused.

## Scope

This repository distributes design-system packages and adoption tooling. Secrets are never required to consume it; anything that looks like a credential in this repository is design-token vocabulary.
