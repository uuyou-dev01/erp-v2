# v0.9.0-rc.1 isolated Playwright assertion

- Date: 2026-08-28 (Asia/Shanghai)
- Database: `erp_v090_root_e2e`
- Database safety: name ends in `_e2e`; the contaminated `erp` database was not used
- Server: production `next build` + `next start`
- Browser: Playwright Chromium
- Concurrency: one worker, one BrowserContext per actor in multi-account flows
- Generic `db:seed` / `prisma db push`: not used
- Result: **36/36 tests passed in 1.6 minutes**
- Screenshots produced and retained: **107**

The suite covers route smoke, purchase-to-profit, consolidation, task assignment,
invite-only onboarding and reset/revocation, listing eligibility, sales/shipment,
mobile/OCR/idempotency/device isolation, organization connection history,
procurement, service agreement lifecycle, supply-offer publishing and
collaboration surfaces.

The lifecycle flows use database writes only for isolated fixture setup and
cleanup. After browser interaction begins, state transitions occur through the
UI. The invite expiry negative case updates fixture time to simulate expiration;
it does not continue a successful business flow through the database.

Passing this suite does not close screenshot scenarios that are absent or only
partial in `acceptance-report.md`.
