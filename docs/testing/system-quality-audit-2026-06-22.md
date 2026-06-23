# System Quality Audit - 2026-06-22

## Scope

This audit covers the current stabilization pass for module regrouping, price/profit calculation, and baseline usability checks.

Out of scope for this pass:

- Shuttle/bus plans, target weights, cutoff loading times, and route ETA rules.
- Blocking profit calculation when SKU weight/dimensions are missing.

## Verified Gates

Recommended full gate:

- `npm run verify`

Equivalent sequential commands:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:smoke`

Current unit coverage after this pass:

- 45 Vitest files
- 143 Vitest tests

Current E2E smoke coverage after this pass:

- 19 Playwright smoke tests
- Workbench
- Workbench purchase cancellation in-page confirmation
- Procurement
- Procurement wizard -> mark ordered -> receive stock browser flow
- Procurement wizard duplicate-order submit error
- Procurement wizard duplicate-SKU quick-create error
- Procurement quick receive in-page confirmation and inline server error
- Procurement receive -> inventory listing -> sale shipment -> reports browser flow
- Consolidation logistics
- Sellable inventory board
- SKU catalog
- Listing operations
- Listing delist in-page confirmation
- Listing eligibility create form and batch dialog
- Listing quick sell -> sales shipment -> reports browser flow
- Sales
- Reports
- Collaboration/settings surfaces

## Completed Stabilization

- Primary navigation now follows six daily-operation modules:
  - 工作台
  - 采购与补货
  - 集运与仓配
  - 库存与商品
  - 上架与订单
  - 经营分析
- Low-frequency setup entries moved out of daily operations:
  - 销售平台
  - 仓库位置
  - 团队成员
  - 店铺管理
- Inventory page language aligned with the new module model:
  - 库存看板
  - 商品档案
  - 单件商品
  - 库存批次
- Price/profit calculation now has a shared tested contract:
  - net revenue excludes inventory cost
  - fee text parsing
  - proportional order-level fee allocation by line amount
  - rounding remainder assignment to the largest line
  - order profit summary from revenue, allocated fees, shipping, misc fees, and inventory cost
- Dashboard monthly gross profit now uses shared report/profit helpers.
- Dashboard profit metrics are covered by a pure unit test, separate from Prisma and page rendering.
- Business overview and sales report sales totals now exclude cancelled and returned orders while keeping status counts visible.
- Sales report monthly chart now groups by business order date rather than record creation date, keeping backfilled orders in the correct month.
- Sales page revenue totals and platform tabs now use the same valid-sales status rule as reports, and the current filtered effective revenue is visible in the page stats.
- Monthly P&L, platform breakdown, and fee detail reports now also use the shared valid-sales status rule instead of only excluding cancelled and returned orders.
- Monthly P&L purchase cost now uses allocated sold inventory cost instead of subtracting all purchase orders received in the month.
- Sales order detail profit now converts allocated inventory costs into the order currency before calculating gross profit.
- Sales order detail allocation rows now display cost amounts in the inventory cost currency instead of always using the order currency.
- Sales order detail rendering is now read-only for profit calculation and no longer writes computed gross profit into the `netRevenue` field while viewing the page.
- Listing pending, single-listing creation, and batch listing creation now block fulfillment-strict platforms such as Mercari, Yahoo Auction, and SNKRDUNK when the SKU or item unit only has in-transit/non-sellable stock.
- Listing create form and batch listing dialog now show fulfillment-strict eligibility reasons inline instead of hiding them behind generic browser alerts.
- The batch listing dialog is now reachable from the current sellable inventory unlisted-filter workflow instead of only from the retired pending-list component.
- Inventory report location valuation now multiplies lot unit cost by on-hand ledger quantity instead of counting each lot once.
- Inventory lot list totals now use stock-ledger on-hand quantity and base-currency inventory value instead of summing unit cost once per lot.
- SKU detail sales reference counts now exclude cancelled and returned order lines, matching the recent-sales list and report revenue rules.
- Sales order detail profit now uses the shared allocated-order profit helper instead of manual page-level math.
- Sales order detail profit now shows computed net revenue separately from net profit instead of conflating the persisted `netRevenue` field with gross profit.
- Sales order settlement now applies the actual sale price to order revenue and line amounts before recalculating fees and net revenue.
- Sales order settlement now has a multi-line regression ensuring actual sale price allocation keeps line totals equal to order revenue.
- Sales order settlement now rejects invalid, negative, or non-positive settlement amounts with localized structured errors before mutating order revenue, fees, or settlement status.
- A purchase-to-profit integration regression now covers purchase order -> receive -> stock ledger -> listing quick sell -> shipment -> dashboard profit metrics.
- A browser smoke regression now covers procurement wizard -> quick SKU creation -> purchase line -> mark ordered -> receive stock, with database assertions for purchase status, line values, inventory lot, and stock ledger quantity.
- A browser smoke regression now covers duplicate purchase-order submission in the procurement wizard and verifies the error stays inline without a browser alert.
- A browser smoke regression now covers duplicate SKU quick-create inside the procurement wizard and verifies the dialog stays open with an inline error.
- A browser smoke regression now covers quick receive when the purchase order changes underneath the page and verifies the server error stays inline without a browser alert.
- A browser smoke regression now covers batch listing from the current sellable inventory workflow, including a concurrent stock-change rejection surfaced inline without a browser alert.
- A browser smoke regression now covers listing search -> quick sell modal -> generated sales order -> shipment confirmation -> reports page, with database assertions for order status, net revenue, allocation cost, and lot quantity.
- A long browser smoke regression now covers procurement wizard -> receive stock -> sellable inventory listing creation -> quick sell -> shipment confirmation -> reports, with database assertions for order revenue, fees, allocation cost, and remaining lot quantity.
- Listing quick sell now subtracts unshipped PENDING/ALLOCATED reservations before assigning lot or item-unit stock, preventing the same stock from being sold twice before shipment.
- Listing quick sell now rejects invalid quantity/price/fee inputs with localized structured errors before creating an order or reserving stock.
- Listing creation, batch listing creation, and listing edits now reject negative listing prices before creating or mutating listings.
- Listing creation now rejects negative or over-100% fee-rate overrides and negative shipping-fee overrides before calculating estimated net revenue.
- Platform creation and platform edits now reject negative or over-100% default fee rates and negative default shipping fees before those defaults can feed listing or quick-sale calculations.
- SKU master detail and sellable inventory now share a consistent stock definition: sellable stock only includes stock in sellable locations, in-transit stock is shown separately, and sellable item units are no longer double counted.
- SKU master list now includes core reference metrics for sellable quantity, in-transit quantity, active listings, latest sale price, average sale price, sales count, and primary sales platform.
- SKU master detail now acts as a SKU analysis record with inventory distribution, active listing links, platform performance, sales history, purchase history, and cost-matched profit overview.
- SKU create/edit now validates catalog reference price/cost and supported currency values server-side; the form uses numeric reference inputs and a fixed currency selector.
- Application-level reservation regressions now cover duplicate quick-sale rejection, negative quick-sale price rejection, negative listing price rejection, negative batch listing price rejection, invalid listing fee input rejection, invalid platform fee default rejection, negative listing edit price rejection, cancellation releasing unshipped stock reservations, and return registration restoring shipped lot quantity through return ledger entries.
- A shared action-result helper now standardizes `{ success: true }` / `{ success: false, error }` server action responses.
- Purchase creation and purchase-line creation now use structured action wrappers for duplicate-order and missing-order errors.
- Purchase-line deletion now uses a structured action wrapper and an in-page confirmation dialog instead of posting to a missing API route.
- Purchase status updates now use structured action results and can show missing-order or invalid-submit errors inline.
- Purchase shipment/logistics updates now use a structured action wrapper for dialog-level server errors.
- Purchase receiving forms now use structured action results and can show server-side validation errors directly.
- Purchase quick receive now uses structured action results, opens an in-page confirmation dialog, and can show server-side validation errors directly.
- Procurement quick receive now has source-level coverage preventing browser-native alerts/confirms and console error logging from returning.
- SKU creation and edit saves now use structured action results and can show duplicate/missing SKU errors inline.
- SKU image upload validation now shows file-type, file-size, and upload failures inline without browser-native alerts or client console error logging.
- Inventory SKU form interactions now have source-level coverage preventing browser-native alerts/confirms and console error logging from returning.
- SKU deletion now uses structured action results and shows blocking relation errors inside the confirmation dialog.
- SKU catalog enable/disable now uses structured action results, replaces the browser confirm with the shared confirmation dialog, and shows failures inline.
- Location creation and edit saves now use structured action results and can show server-side validation errors inline.
- Location deletion now uses structured action results and shows blocking relation errors inside the confirmation dialog.
- Sales inventory allocation now uses structured action results and can show server-side stock/allocation errors directly.
- Sales order creation and sales order-line creation now use structured action wrappers and inline server-error messages.
- Sales order confirmation now uses a structured action wrapper, opens an in-page confirmation dialog, and returns localized missing-order errors inline.
- Sales order confirmation now has source-level coverage preventing browser-native alerts/confirms and console error logging from returning.
- Sales order settlement now uses a structured action wrapper and can show server-side settlement errors inline.
- Sales detail settlement now exposes actual sale price and submits it to the shared settlement action.
- Workbench settlement now only shows persisted settlement inputs: actual sale price, platform fee, and shipping fee.
- Sales shipment confirmation now uses structured action results and can show server-side status/shipment errors directly.
- Listing quick sell now uses structured action results and can show server-side stock/sale errors directly.
- Listing edit and delist actions now use structured action results and can show server-side update/delist errors inline.
- Listing delist buttons now use the shared in-page confirmation dialog instead of browser-native confirm prompts.
- Listing quick sell and delist interaction components now have source-level coverage preventing browser-native alerts/confirms and console error logging from returning.
- Sales platform creation, edit, and deletion now use structured action results and show save/delete failures inline.
- Workbench task assignment now uses structured action results and shows assignment failures inline.
- Team member creation now uses structured action results and shows invalid-email, missing-store, or permission errors inline instead of navigating to a server action error page.
- Team member deactivation now uses structured action results and shows permission, missing-member, or self-deactivation errors inline instead of navigating to a server action error page.
- Managed-store creation now uses structured action results and shows invalid-code, duplicate-code, invalid-currency, or permission errors inline instead of navigating to a server action error page.
- Login user switching now uses a structured action result and shows missing/disabled-user errors inline instead of navigating to a server action error page.
- Consolidation batch status changes now use structured action results, show stale/invalid-state errors inline, and enforce the OPEN -> SEALED -> SHIPPED -> RECEIVED sequence on the server.
- Workbench purchase cancellation now uses a structured action result and the shared in-page confirmation dialog instead of browser-native confirm/alert prompts.
- Workbench bulk actions now show full and partial batch failures inline, preserve the selection when records still need attention, and are covered by source-level checks preventing browser-native alerts/confirms and console error logging from returning in high-frequency workbench actions.
- Workbench drawer actions now show success, navigation suggestions, upload validation, thrown failures, and structured `{ success: false, error }` failures inline instead of using browser-native alerts/confirms or silently refreshing the panel.
- Workbench quick-entry updates and refresh controls now use Next router refresh instead of hard `window.location.reload`, preserving in-progress table state.
- Notification read actions now use structured action results and show failures inline instead of failing silently inside a transition.
- Shared confirmation dialog buttons are explicitly non-submit buttons, so dialogs embedded inside forms do not accidentally submit the parent form.
- Global `app` and `components` source scan no longer finds browser-native alerts/confirms or direct `console.error` calls.
- Upload API unexpected failures still return generic JSON errors but no longer log expected upload failures as server console errors.
- Manual inventory-lot creation now uses structured action results and can show server-side inbound quantity/cost errors inline.
- Inventory lot split-to-item-unit now uses a structured action result and keeps over-available-quantity failures inline without writing split/item records.
- Stocktake submissions now use a structured action wrapper, so server-side validation failures return inline errors instead of relying on thrown server action exceptions.
- Stocktake draft parsing now tolerates temporarily invalid unit-cost input and keeps the row visible for correction instead of throwing during client render.
- Item-unit creation and edit saves now use structured action results and can show server-side validation errors inline.
- Item-unit deletion now uses structured action results and shows blocking relation errors inside the confirmation dialog.
- CSV imports now share tested pre-write validation for empty files, required fields, positive quantities/costs, dates, and sales platform codes.
- Supported CSV imports now run full-file preflight before any business writes, so a later invalid row no longer leaves earlier rows partially imported.
- CSV preflight now rejects duplicate SKU codes and duplicate sales external order numbers within the same file before import writes begin.
- CSV preflight now checks database references before writes for existing SKU codes, inventory-lot SKU/location references, purchase-line SKU and purchase-order ownership references, and sales-order platform references.
- CSV import dialogs now show file parsing, missing mapping, and submit failures inline instead of relying on browser alerts.
- Core module browser smoke tests now fail on runtime errors, internal server errors, Prisma errors, or unhandled page errors.
- Build output no longer reports local image-preview or unused-variable warnings from this pass.
- Playwright's Next dev server no longer emits the `allowedDevOrigins` warning for `127.0.0.1`; the local E2E origin is explicitly allowed in `next.config.ts`.
- Prisma seed configuration has moved from deprecated `package.json#prisma` into `prisma.config.ts`, and the config explicitly loads `.env` before Prisma validates the schema.
- Playwright web-server subprocesses now set `FORCE_COLOR=0` for the full startup chain, removing the Node `NO_COLOR`/`FORCE_COLOR` conflict warning in local smoke runs.
- `caniuse-lite` and `baseline-browser-mapping` have been refreshed in the lockfile, removing stale Browserslist data warnings from build and smoke runs.

## Known Remaining Issues

1. Generated Next artifacts are not safe for parallel verification.
   - Cause: `tsconfig.json` includes `.next/types/**/*.ts`, while `next build` is deleting/regenerating those files.
   - Confirmed related failure mode: running `next build` and Playwright at the same time can produce transient `PageNotFoundError` and React Client Manifest missing-module errors.
   - Current project rule: run `npm run verify`, which executes typecheck, unit tests, build, and smoke tests sequentially.
   - Suggested later fix: add a dedicated typecheck setup that does not depend on volatile `.next/types`.

2. Playwright dev server logs intermittent `ECONNRESET` during route smoke.
   - Tests still pass.
   - Treat as a stability signal to monitor when expanding E2E coverage.

3. Several high-frequency server actions still throw raw errors directly.
   - This makes form usability inconsistent.
   - Purchase creation, purchase-line creation/deletion, procurement wizard submission and quick SKU creation, purchase status updates, purchase shipment/logistics updates, purchase receiving, purchase quick receive, consolidation status changes, notification read actions, login user switching, SKU creation/edit/delete/catalog status, location creation/edit/delete, manual inventory-lot creation, inventory-lot split-to-item-unit, item-unit creation/edit/delete, sales platform creation/edit/delete, workbench task assignment, workbench purchase cancellation, sales order creation, sales order-line creation, sales inventory allocation, sales order confirmation, sales order settlement, sales shipment, listing quick sell, listing creation, listing edit, listing delist, batch listing creation, and CSV import preflight now use structured in-flow error reporting.
   - Suggested next step: extend the same pattern to remaining create/update forms that still rely on thrown errors or browser alerts.

4. Price/profit is now better factored, but settlement is still incomplete.
   - Missing later layers: partner operation fees, final settlement adjustments, Japanese domestic shipping refinements, exchange-rate gain/loss, tax/customs detail.

## Recommended Next Iteration

1. Standardize server action error results for the remaining highest-frequency forms.
2. Add browser-level regressions for fulfillment-strict platform eligibility in quick-add listing dialogs.
3. Add browser-level import dialog regressions for SKU, inventory batch, purchase-line, and sales-order CSV mapping/error states.
4. Add a dedicated Listing CSV import path only if the product flow still needs bulk listing import outside the current sellable-inventory quick add/batch listing tools.
5. Extend cancellation/return regressions to browser-level workbench actions and item-unit return inspection flows.
