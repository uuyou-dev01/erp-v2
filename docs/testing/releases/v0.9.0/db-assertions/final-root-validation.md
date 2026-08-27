# v0.9.0 RC final root validation

Run time: 2026-08-28 03:10 CST (Asia/Shanghai)

Safety boundary:

- database: `erp_v090_root_e2e` only
- test URLs included `connection_limit=5` and `pool_timeout=10`
- server: production build/start on port `3100`
- browser/workers: Chromium, `workers=1`
- the contaminated local `erp` database and any recovery/production database were not read, reset or written

Results:

```text
npm run typecheck
PASS

npx vitest run
122 test files passed / 502 tests passed (2.53s)

npm run build
PASS — Next.js 15.5.21 production build

npm audit --omit=dev --registry=https://registry.npmjs.org
0 vulnerabilities

npx playwright test --project=chrome --workers=1
44 passed (2.2m)
```

Post-run checks:

- port `3100` was released
- PostgreSQL reported zero remaining connections to `erp_v090_root_e2e`
- the final screenshot directory contained 194 PNG files
- the primary reviewer opened all 194 images through 17 labelled contact sheets
- no Runtime Error overlay, blank failed route, real password, token or private address was observed

This validation does not clear the release for UAT or production. The missing user
backup recovery/retention drill, final Docker runtime validation, load test and partial
scenario evidence remain explicit hold conditions in `acceptance-report.md`.
