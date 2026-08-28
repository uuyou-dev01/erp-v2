# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Future release changes are recorded here before they move into a versioned section.

## [0.9.0-rc.1] - 2026-08-28

### Added

- Release-candidate baseline for the first controlled Alibaba Cloud deployment.
- Account, organization, store, warehouse and cross-company collaboration foundations.
- Release-specific data recovery, isolated acceptance-test and deployment runbooks.
- Runtime liveness/readiness endpoints and immutable build identity metadata.
- Container deployment, scheduled jobs, backup and private-asset foundations.
- Server-enforced resale-listing idempotency and complete screenshot evidence for internal tasks,
  external warehouse handoff, notifications, OCR and revoked-access paths.

### Changed

- Public self-registration is disabled by default in favor of one-time administrator invitations.
- Production sessions and account changes use explicit invalidation and security-event controls.
- End-to-end tests require a dedicated database whose name ends in `_test` or `_e2e`.
- Next.js is pinned to 15.5.21; vulnerable transitive image/CSS packages are overridden to audited versions.
- Multi-organization navigation now keeps enterprise/store context visible on desktop and mobile,
  notification deep links switch context safely, and invalid objects use a recoverable Chinese 404.
- External warehouse login preserves the requested task, task handoff/withdrawal are available in
  the UI, notification labels are human-readable, and mobile notifications route to their business target.

### Security

- Removed the unused `next-auth` dependency.
- Added production configuration fail-fast checks, secure cookie policy and authenticated private assets.
- Prevented Playwright from running `db push` or the destructive general demo seed.

### Known limitations

- This is a release candidate, not the production tag.
- Production data cleanup and deployment remain blocked until the supplied PostgreSQL backup is verified,
  restored into an isolated database and its generated manifest is approved.
- The full screenshot acceptance matrix must close all P0/P1 findings before `v0.9.0` is tagged.
