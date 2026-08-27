# v0.9.0-rc.1 automated gate results

Date: 2026-08-28 (Asia/Shanghai)

| Gate | Result | Evidence |
|---|---|---|
| Clean dependency install | pass | `npm ci`: 545 packages installed from the lockfile |
| Prisma schema format/generate | pass | Prisma Client generated from the release schema |
| TypeScript | pass | `npm run typecheck` exited 0 |
| Unit/application integration tests | pass | 121 files, 495 tests against `erp_v090_e2e` |
| Production build | pass | Next.js 15.5.21 production build exited 0 |
| Empty PostgreSQL 17 migrations | pass | 59 migrations applied from zero |
| Production dependency audit | pass | `npm audit --omit=dev --registry=https://registry.npmjs.org`: 0 vulnerabilities |
| Production fail-fast | pass | weak secret exits code 1; port 3199 is closed after rejection |
| Complete current Playwright suite | pass | 36/36 on `erp_v090_root_e2e`, production build/start, Chromium, one worker |
| Backup restore and retention apply | blocked | current production backup file has not been supplied |
| Container OCR/Chromium runtime | blocked | Docker Hub authentication endpoint timeout; final image was not built |
| 10 sessions + one OCR/scrape load gate | pending | run only after the complete functional suite passes |

The current suite produced 107 release screenshots. The primary reviewer opened
all of them in 12 labelled contact sheets. Scenario coverage is still incomplete,
so this pass does not mean the full requested acceptance matrix is complete.

The local `erp` database is an incident artifact and was not used for these
gates. No result in this document authorizes production deployment.
