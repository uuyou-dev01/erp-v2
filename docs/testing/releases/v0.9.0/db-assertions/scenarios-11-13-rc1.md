# Scenarios 11 and 13 — isolated RC assertions

Run time: 2026-08-28 02:56 CST (Asia/Shanghai)

Environment:

- database: `erp_v090_collab_e2e` only
- server: production build/start on port `3101`
- browser/workers: Chrome, `workers=1`
- fixture writes: organizations, memberships, store/location access, service agreements,
  platform and inventory only
- business writes: UI actions only from offer publication onward
- verification reads: Prisma read-only assertions at the end of the UI flow

Command result:

```text
npx playwright test tests/e2e/release-scenarios-11-13.spec.ts --project=chrome --workers=1
2 passed (37.6s)
```

Verified facts:

- the requester created one fulfillment request; the provider-side accepting user became
  `assignedToId`
- a second active `FULFILLMENT` member in the same provider organization could view the
  request but could not ship it; the request remained `ACCEPTED`
- the assignee shipped it with the expected tracking number; the reservation became
  `CONSUMED` and its sole inventory allocation became `SHIPPED`
- exactly two related settlements existed and both were `PAID`: supply `CNY 120` and
  third-party fulfillment service `CNY 25`
- the MARGIN commission line was `INFORMATIONAL`, so reseller commission `CNY 60` did
  not reduce the supplier payable of `CNY 120`
- the commission line retained its `RESALE_LISTING` source; the reseller's corresponding
  `RESALE_COMMISSION` earning was `SETTLED` at `CNY 60` with exactly one posted ledger entry
- the assignee's service earning was `SETTLED` at `CNY 25` and had one posted wallet
  ledger entry
- exactly one `FULFILLMENT_SHIPMENT` work record existed for the assignee, quantity
  `1`, source `FULFILLMENT_REQUEST`
- fulfillment notifications for the request had the canonical request deep link and a
  non-empty dedupe key

No production/user database was read, reset or written by this run.
