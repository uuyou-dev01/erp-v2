# Resale listing server idempotency — RC2

Run time: 2026-08-28 10:29 CST (Asia/Shanghai)

Safety boundary:

- database: `erp_v090_idempotency_e2e` only
- the database was created specifically for this check
- the contaminated local `erp` database and all recovery/production databases were not read or written

Migration result:

```text
60 migrations found
60 migrations applied from zero to PostgreSQL 17
```

Targeted test result:

```text
npx vitest run tests/application/marketplace-resale-flow.test.ts
1 test file passed / 5 tests passed
```

The test sends two concurrent create calls with the same enterprise-scoped
idempotency key. Both calls return the same listing ID and the database contains
exactly one matching row. The database unique constraint closes the race between
the initial lookup and insert; a `P2002` replay resolves to the already-created row.

The browser form creates one stable key for its lifetime, so a double click,
retry after a slow response or raw request replay cannot create duplicate resale
listings for that submission.
