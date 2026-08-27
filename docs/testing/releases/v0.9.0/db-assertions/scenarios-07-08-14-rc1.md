# Scenarios 07, 08 and 14 isolated RC evidence

Review time: 2026-08-28 02:34 CST (Asia/Shanghai)

## Isolation

- Database: `erp_v090_flow_e2e` only.
- Web port: `3102` only.
- Runtime: Next.js production build/start, Chromium, one worker.
- Setup: guarded Playwright reset and the dedicated E2E fixture only; no generic seed or `db push`.
- Business flow: UI actions only after fixture setup. Later Prisma calls are read-only assertions.
- The local `erp`, root E2E and recovery databases were not accessed by this run.

## Command and final result

```text
npm run typecheck
PASS

E2E_PORT=3102 TEST_DATABASE_URL=<erp_v090_flow_e2e URL> \
  npx playwright test tests/e2e/release-scenarios-07-08-14.spec.ts \
  --project=chrome --workers=1

4/4 passed (auth setup plus scenarios 07, 08 and 14), 41.1 s

git diff --check
PASS
```

## Assertions and screenshots

- Scenario 07 (`07-01-*` through `07-10-*`): A publishes a public offer,
  B sees it, A delists it, A publishes a B-only offer, B sees its supply price
  but no internal cost, and unrelated C sees an empty market plus a 404 for the
  direct offer URL.
- Scenario 08 (`08-01-*` through `08-10-*`): five one-unit orders reserve all
  five shared units; the sixth form reports zero live availability and disables
  submission; cancellation changes the owner counters from `0 / 5` to `1 / 4`.
  A sees both physical item identities, while B is blocked from replacing the
  unavailable exact unit with the available same-SKU unit.
- Scenario 14 (`14-01-*` through `14-08-*`): valid CNY to JPY conversion creates
  one resale listing after a double click; a unique external number and a DB
  count assert one record. Missing GBP, future-only CAD and 238-day-old EUR rates
  each show a specific UI error and create zero records.

All 28 screenshots were opened and visually reviewed. They show the expected
actor, form data, positive result or negative state; no runtime overlay, real
credential, token or private address is visible.

## Failures retained and corrected

1. Static preflight found that the single-item publish form supplied only the
   item price while `SupplyOffer.unitPrice` remained null. Publishing now copies
   an item price to the offer only when exactly one item exists; multi-item
   pricing remains item-specific. The final scenario 07 result shows CNY 120.
2. The first scenario 08 run tried to inspect a fully reserved offer through the
   buyer market URL, which correctly returns 404. The final evidence uses the
   owner detail for the authoritative `0 / 5` and `1 / 4` counters.
3. An early URL assertion also matched the still-open `/requests/new?...` page.
   The assertion now waits until the URL leaves `/new` before recording the
   fulfillment request ID.
4. Direct FX fixtures initially omitted the active organization connection on
   their visibility rules and correctly returned 404. The dedicated fixture now
   binds the existing active connection, matching production visibility rules.
5. Visual review exposed a real UX discrepancy: the sixth order form showed a
   plan remainder of one even though live offer inventory was zero. The page now
   calculates the minimum of plan remainder, live offer remainder and live item
   remainder, displays a reason at zero and disables submission. The server-side
   transaction and oversell checks remain unchanged.

## Visual review notes

- Strengths: actor identity, visibility badges, owner reservation counters and
  negative error copy are prominent and easy to compare across screenshots.
- Follow-up: the unauthorized direct-offer route uses Next.js's English 404 in
  an otherwise Chinese UI. This does not disclose offer data, but a localized
  denial/not-found state would be clearer.
- Follow-up: the FX submit errors are visually clear but should use a live-region
  or `role="alert"` consistently for screen-reader announcement.
- Follow-up: the double-click evidence proves one browser submission and one
  listing row, but the create-listing action has no idempotency key or database
  uniqueness guarantee. It must not be treated as protection against a raw
  network-request replay.
