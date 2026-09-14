# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Future release changes are recorded here before they move into a versioned section.

## [0.9.0-rc.13] - 2026-09-14

### Added

- Added operating-report tabs for overview, sales and contribution profit, procurement and
  inventory, expenses, and consignment settlements, with searchable details and CSV exports.
- Added original-currency amounts, CNY conversion details, historical exchange-rate references,
  and explicit incomplete-cost and estimated-shipping states throughout operating reports.

### Changed

- Made personal collaboration open directly to tasks, moved relationships into a dedicated page,
  and clarified navigation and selected task scopes.
- Grouped warehouse inventory by product family and added family-aware search.
- Reworked listing cards to summarize active platforms separately for SKU stock and individual
  items, with clearer selected-SKU actions and inventory-detail access.

### Fixed

- Kept mixed-currency report totals, confirmed expense directions, settlement snapshots, and
  date boundaries consistent between summary cards, charts, details, and exports.
- Updated collaboration language regression coverage for the dedicated relationships page.

## [0.9.0-rc.8] - 2026-09-09

### Added

- Added lightweight transport-arrival collaboration tasks and completion-volume history for
  external warehouse operators.
- Added bundle-shipment manifests, SKU images, sender-provided shipment proofs and clipboard image
  paste to the shipment workflow.
- Added settlement exchange-rate snapshots with base-currency net-revenue totals.
- Added direct editing for active Listings and one-click relisting for sold-out or delisted records.

### Changed

- Reworked sender and executor shipment panels around elapsed time, product verification and proof
  visibility; unfinished tasks turn red after 20 hours instead of showing a countdown.
- Split Listing management from sold-out/delisted history, reduced summary-card height and kept the
  table header visible while scrolling.
- Classified sellable inventory by its physical warehouse market rather than duplicating stock into
  every market the warehouse can deliver to.

### Fixed

- Allowed an executor to submit a shipment with proofs already bound by the sender to the same order,
  while continuing to reject unbound or cross-business assets.
- Preserved stable client-generated identifiers across bundle-sale submissions and task creation.

## [0.9.0-rc.7] - 2026-09-09

### Added

- Added a personal external-task workspace with explicit relationship lifecycle, task assignment,
  optional ERP onboarding and company-connection growth paths.
- Added organization-targeted offer visibility backed by active company connections and immediate
  access revocation when a connection ends.

### Changed

- Generalized collaboration language to task owner and task collaborator while keeping concrete
  task types such as order shipment visible on task cards and details.
- Kept invited users outside the inviting company's membership and inventory boundary unless a
  separate company connection and business authorization are explicitly established.

## [0.9.0-rc.6] - 2026-09-07

### Added

- Added direction-neutral transfer packages with independent dispatch and receipt confirmation.
- Added exact lot and item-unit picking so one package can contain partial quantities from multiple
  purchases.
- Added inventory-based packing to open consolidation batches, including safe removal before sealing.

### Changed

- Transfer and consolidation now split only the selected unreserved quantity while leaving the
  remainder available at the origin.
- Procurement and workbench flows now route partial or mixed transfers through the transfer-package
  workspace while preserving the existing whole-order shortcut.

## [0.9.0-rc.2] - 2026-09-01

### Added

- Added a guided opening-stock count after warehouse creation.
- Added warehouse-scoped opening inventory entry with explicit batch labels, quantity, unit cost,
  currency and per-batch value traceability.

### Changed

- Warehouse details now keep both opening-stock and existing-stock count actions available whether
  the warehouse is empty or already contains inventory.
- Newly created warehouses now open their detail page with the initial inventory setup as the next
  operational step.

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
- Mobile operational forms expose explicit accessible names for logistics, arrival, warehouse,
  shipping, return and note controls; the final mobile/cross-device regression passes 18/18.

### Security

- Removed the unused `next-auth` dependency.
- Added production configuration fail-fast checks, secure cookie policy and authenticated private assets.
- Prevented Playwright from running `db push` or the destructive general demo seed.

### Known limitations

- This is a release candidate, not the production tag.
- Production data cleanup and deployment remain blocked until the supplied PostgreSQL backup is verified,
  restored into an isolated database and its generated manifest is approved.
- The full screenshot acceptance matrix must close all P0/P1 findings before `v0.9.0` is tagged.
