# PostgreSQL 17 empty-database migration assertion

- Date: 2026-08-28 (Asia/Shanghai)
- Database: `erp_v090_migrate_test`
- PostgreSQL server: 17.2
- Safety: the database name ends in `_test`; the development `erp` database was not used.
- Command: `npx prisma migrate deploy`
- Result: **pass**
- Applied migrations: 59
- Final Prisma result: `Database schema is up to date!`

The first rehearsal exposed an invalid conflict target in
`20260817120000_backfill_open_shipping_dispatches`. The migration was corrected
to use the existing `(requestId, idempotencyKey)` unique constraint. The test
database was then dropped, recreated, and the complete migration chain was run
again from zero successfully. This change must remain in the release commit.

This assertion covers an empty PostgreSQL 17 database only. Restoring and
cleaning the user's production backup is a separate release gate and remains
blocked until the backup file is supplied.
