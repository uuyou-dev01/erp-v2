# SKU Catalog Model Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current loose "parent SKU / child SKU" catalog behavior with an explicit product catalog model that supports 商品组、规格 SKU、独立 SKU, generated names/codes, used-item condition handling, and clean business-entry restrictions.

**Architecture:** Keep the existing `SKU` table and `parentSkuId` relationship as the physical backbone, but add explicit catalog role and identity fields so the model is no longer inferred only from child counts. 商品组 is an SPU-like, non-operational shell; 规格 SKU and 独立 SKU are operational SKUs that can enter purchase, inventory, listing, and sales flows. 中古成色 belongs to `ItemUnit` or market/intelligence observations, not the SKU identity.

**Tech Stack:** Next.js App Router, React 19, Prisma 6, PostgreSQL, Vitest, existing shadcn-style local UI components.

---

## Target Business Model

### Terms

- 商品组 / 款型: the shared catalog shell. Examples: `AJ1 芝加哥 2015`, `火影忍者 晓组织系列`, `Nike SB 短袖 2011 小花猫 黑色`. It stores shared brand, category, manufacturer/style number, images, description, and variant axes. It does not directly create stock, purchase lines, listings, or sales lines.
- SPU-like usage: 商品组 behaves like the system's practical SPU concept in forms and lists. It is the user-facing product family/model, but the codebase should keep the term `商品组` / `GROUP` instead of renaming everything to SPU.
- 规格 SKU: a stockable/sellable SKU under a 商品组. The user only enters a short variant value such as `42码`, `小南`, `10cm`, `M`. The system generates the full display name and internal SKU code.
- 独立 SKU: a stockable/sellable SKU with no variants. Example: `竹筐`. It can later be converted into a 商品组 if variants are introduced.
- 单件 / ItemUnit: an actual physical piece, especially for used goods. Condition, defects, photos, owner/holder, and label belong here.
- 品牌货号 / 款号 / manufacturerCode: an external brand/manufacturer style number such as Nike `555088-101`. It is not the same thing as our internal SKU code, but can be used as the base of generated internal SKU codes.

### Examples The Model Must Support

- 商品组 `AJ1 芝加哥 2015`, brand `Nike`, manufacturerCode `555088-101`, variant axis `尺码`; variants `41码`, `42码`, `43码`.
- 商品组 `火影忍者 晓组织系列`, variant axis `角色`; variants `小南`, `佩恩`, `迪达拉`.
- 独立 SKU `竹筐`, no variants.
- 商品组 `手串`, variant axis `长度`; variants `10cm`, `20cm`, `30cm`.
- 商品组 `Nike SB 短袖 2011 小花猫 黑色`, axes `尺码`; variants `S`, `M`, `L`. Color can stay on the group when the whole款型 is already black.
- 中古 items use the same SKU identity as the new item; individual condition like `二手 S`, defects, and photos live on `ItemUnit.conditionGrade`, `ItemUnit.notes`, `ItemUnit.photos`.

---

## Data Model Changes

### Files

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260706xxxx_add_sku_catalog_identity/migration.sql`
- Create/Modify: `lib/application/sku-identity.ts`
- Modify: `lib/application/sku-operability.ts`
- Modify: `lib/application/sku-catalog.ts`
- Modify: `app/actions/skus.ts`

### Prisma Changes

- Add explicit catalog role to `SKU`:
  - `catalogRole String @default("SIMPLE")`
  - Allowed values in application code: `GROUP`, `VARIANT`, `SIMPLE`.
- Add shared identity fields to `SKU`:
  - `manufacturerCode String?`
  - `variantLabel String?`
  - `variantAxes Json?`
  - `variantValues Json?`
  - `nameSource String @default("AUTO")`
  - `codeSource String @default("AUTO")`
- Add indexes:
  - `@@index([storeId, catalogRole])`
  - `@@index([manufacturerCode])`

### Role Invariants

- `GROUP`
  - Must have `parentSkuId = null`.
  - Can have `variantAxes`.
  - Can have child SKUs.
  - Cannot be used in inventory, purchase, listing, sales, supply offer items, or item units.
- `VARIANT`
  - Must have `parentSkuId` pointing to a `GROUP` in the same store.
  - Must have `variantLabel` or `variantValues`.
  - Inherits missing `brand`, `category`, `manufacturerCode`, images, and common description from group where appropriate.
  - Can be used in business flows.
- `SIMPLE`
  - Must have `parentSkuId = null`.
  - Can be used in business flows.
  - Has no child variants initially.

### Compatibility

- Existing child relationship remains: `parentSkuId` still links variants to their 商品组.
- Legacy code that only checks `parentSkuId` will continue to work during transition, but updated helpers should prefer `catalogRole`.
- Because this is a local/dev reset and the user said old data can be cleared, no complex production backfill is required for this iteration.

---

## Identity And Generation Rules

### Files

- Create/Modify: `lib/application/sku-identity.ts`
- Modify: `app/actions/skus.ts`
- Add/Modify tests: `tests/application/sku-identity.test.ts`, `tests/application/skus-action.test.ts`

### Functions

- `deriveCatalogRole({ catalogRole, parentSkuId, childCount })`
  - If explicit role exists, use it.
  - Else if `parentSkuId`, return `VARIANT`.
  - Else if `childCount > 0`, return `GROUP`.
  - Else return `SIMPLE`.
- `normalizeVariantLabel({ variantLabel, variantValues })`
  - Prefer a trimmed manual `variantLabel`.
  - Else join variant values in axis order with ` / `.
- `buildSkuDisplayName({ role, name, parentName, variantLabel })`
  - `GROUP`: group name.
  - `SIMPLE`: product name.
  - `VARIANT`: `${parentName} · ${variantLabel}`.
- `generateSkuCodeCandidate(input)`
  - Group with brand + manufacturer code: `NIKE-555088-101`.
  - Variant under that group: `NIKE-555088-101-42`.
  - Chinese-only or no brand style number: fallback sequence such as `PG-00012` for group, `PG-00012-01` for variant.
  - Simple SKU with manufacturer code can use brand/manufacturer code; otherwise `SKU-00012`.
- `ensureUniqueSkuCode(storeId, candidate)`
  - If candidate exists, append `-02`, `-03`, etc.

### Form Behavior

- Users should not be forced to type full names like `火影忍者 晓组织系列 小南`.
- For a variant, user enters only `小南`; generated name becomes `火影忍者 晓组织系列 · 小南`.
- SKU code is generated by default but can be edited in an advanced field.
- Generated values are previewed before submit.
- The form must visually separate the SPU-like group layer from operational SKU creation:
  - 商品组 form asks "what product family/model is this?"
  - 规格 SKU form asks "which option under this product family can actually be bought/sold?"
  - 独立 SKU form asks "is this product itself directly stockable?"

---

## Server Actions And Business Rules

### Files

- Modify: `app/actions/skus.ts`
- Modify: `lib/application/sku-operability.ts`
- Modify: `app/actions/inventory-lots.ts`
- Modify: `app/actions/item-units.ts`
- Modify: `app/actions/import.ts`
- Modify: listing/supply actions that call SKU business flows:
  - `app/actions/resale-listings.ts`
  - `app/actions/supply-offers.ts`
  - `app/actions/customer-orders.ts`

### Create SKU Action

- `CreateSKUInput` should support:
  - `catalogRole?: "GROUP" | "VARIANT" | "SIMPLE"`
  - `name?: string`
  - `code?: string`
  - `parentSkuId?: string | null`
  - `manufacturerCode?: string`
  - `variantLabel?: string`
  - `variantAxes?: string[]`
  - `variantValues?: Record<string, string>`
  - `nameSource?: "AUTO" | "MANUAL"`
  - `codeSource?: "AUTO" | "MANUAL"`
- Creation rules:
  - GROUP requires `name`.
  - VARIANT requires `parentSkuId` and variant label/values; name can be omitted.
  - SIMPLE requires `name`.
  - If code omitted, generate.
  - If name omitted for variant, generate from parent.
  - Reject variant if parent is not a GROUP.
  - Reject group under another parent.

### Update SKU Action

- Allow editing shared group fields and variant labels.
- If variant label changes and name/code are still auto-source, regenerate name/code.
- If user manually edited name/code, preserve them unless they click "重新生成".
- Do not allow changing a GROUP into an operational SKU while it has children.
- Do not allow changing operational SKU into GROUP while it has inventory/business references.

### Operability Gate

- Update `assertOperationalSku`:
  - Reject `catalogRole === "GROUP"` with message `商品组只用于管理规格，请选择具体规格 SKU 后再入库/上架/销售`.
  - Keep fallback rejection for old parent rows with children.
- Make all business entry points use this helper.

---

## Database Reset And Seed Data

### Files

- Modify: `prisma/seed.ts`
- Replace or deprecate: `prisma/seed-child-skus.ts`
- Optional create: `prisma/reset-catalog-demo.ts`

### Reset Scope

- This reset is for the current local/dev database.
- Preserve only base organization, store, user, platforms, locations, and FX rates.
- Clear old business/catalog demo data where necessary:
  - listings, order allocations, order lines, customer orders
  - purchase lines, purchase orders
  - stock ledgers, inventory lots, item units
  - product intelligence observations/items if needed for consistent examples
  - SKUs

### New Seed SKUs

- 商品组 `AJ1 芝加哥 2015`
  - brand `Nike`
  - category `球鞋`
  - manufacturerCode `555088-101`
  - variantAxes `["尺码"]`
  - variants `41码`, `42码`, `43码`
- 商品组 `火影忍者 晓组织系列`
  - category `潮玩`
  - variantAxes `["角色"]`
  - variants `小南`, `佩恩`, `迪达拉`
- 商品组 `手串`
  - category `饰品`
  - variantAxes `["长度"]`
  - variants `10cm`, `20cm`, `30cm`
- 商品组 `Nike SB 短袖 2011 小花猫 黑色`
  - brand `Nike`
  - category `服装`
  - variantAxes `["尺码"]`
  - variants `S`, `M`, `L`
- 独立 SKU `竹筐`
  - category `杂货`
- Add small demo inventory only to operational SKUs, never to GROUP rows.
- Add at least one used `ItemUnit` with `conditionGrade`, notes, and photos metadata to prove中古逻辑.

---

## Global Page And Navigation Adjustments

### Sidebar / Navigation

Files:

- Modify: `config/navigation.ts`
- Modify: `components/layout/sidebar.tsx`
- Modify tests: `tests/application/navigation.test.ts`

Plan:

- Keep current high-level group `商品与库存`.
- Under `商品档案`, use child entries:
  - `商品主档`
  - `商品情报`
- Product master text should consistently say:
  - `商品组`
  - `规格 SKU`
  - `独立 SKU`
- Remove old `父 SKU / 子 SKU` wording from visible UI.

---

## Product Master List Page

### Route

- Modify: `app/(dashboard)/inventory/skus/page.tsx`
- Modify: `components/inventory/sku-catalog-grid.tsx`
- Modify: `components/inventory/sku-management-table.tsx` if still used

### Layout

- Header title: `商品主档`
- Description: `管理商品组、规格 SKU 和独立 SKU；商品组只做规格容器，库存和交易进入具体规格 SKU。`
- Primary actions:
  - `新增商品组`
  - `新增独立 SKU`
  - `批量导入`
- Add filters:
  - 类型: `全部 / 商品组 / 规格 SKU / 独立 SKU`
  - 品类
  - 品牌
  - 状态
- Card/list behavior:
  - 商品组 card shows group name, manufacturerCode, variant count, aggregate stock/sales, and variant chips.
  - 规格 SKU card shows generated code, variant label, linked group, stock/sales metrics.
  - 独立 SKU card shows normal operational metrics.
- Group card click opens group detail.
- Variant chip click opens group detail with selected variant or direct SKU detail depending on final UI choice.

### SPU-like Display Rules

- Default list density should be group-first:
  - 商品组 appears as the main row/card.
  - Variants appear as compact chips, tabs, or expandable rows below the group.
  - Users should be able to scan `AJ1 芝加哥 2015` first, then see `41码 / 42码 / 43码`.
- Search should match across all identity layers:
  - group title: `AJ1 芝加哥 2015`
  - manufacturerCode: `555088-101`
  - variant label: `42码`
  - generated SKU code: `NIKE-555088-101-42`
- In compact selectors, display variants as:
  - primary: `AJ1 芝加哥 2015 · 42码`
  - secondary: `NIKE-555088-101-42 · Nike · 球鞋`
- A group with many variants should show the first few variant chips and a `+N` overflow affordance, not expand the page by default.
- A simple SKU should look like a normal product card without variant controls.

### Acceptance

- A 商品组 with zero inventory must not look broken.
- A 商品组 must not show an "入库" call to action directly.
- A 规格 SKU must be searchable by short variant label, full name, and generated code.
- The list must make it visually obvious that 商品组 is a container and 规格 SKU is the thing that enters business flows.

---

## New/Edit SKU Forms

### Route

- Modify: `app/(dashboard)/inventory/skus/new/page.tsx`
- Modify: `components/inventory/sku-form.tsx`
- Optional split:
  - Create: `components/inventory/sku-create-mode-selector.tsx`
  - Create: `components/inventory/sku-group-form-section.tsx`
  - Create: `components/inventory/sku-variant-form-section.tsx`
  - Create: `components/inventory/sku-identity-preview.tsx`

### New Page Modes

1. 新增商品组
   - Required: 商品组名称
   - Optional but prominent: 品牌, 品类, 品牌货号/款号, 规格维度
   - Optional: images, description, tags, reference fields
   - Submit can create group only.
   - Secondary action: `保存并继续添加规格`
2. 新增规格 SKU
   - Required: 选择商品组, short variant label or axis values
   - Inherit brand/category/manufacturerCode from group.
   - Show generated name/code preview.
   - Advanced area: override generated code/name.
3. 新增独立 SKU
   - Required: 商品名称
   - Optional: 品牌, 品类, 品牌货号/款号
   - Can directly enter inventory/purchase flows.

### Entry Points

- `/inventory/skus/new?mode=group`: direct 商品组 creation.
- `/inventory/skus/new?mode=simple`: direct 独立 SKU creation.
- `/inventory/skus/new?mode=variant&parentSkuId=...`: add a 规格 SKU under a known 商品组.
- 商品组 detail page should have primary action `添加规格`.
- Purchase/inventory quick-create should not dump users into a full master-data form; it should open a compact dialog that can:
  - create an independent SKU, or
  - pick/create a 商品组 and immediately add one variant.

### Edit Forms

- 商品组 edit:
  - Can edit group common fields and variant axes.
  - Shows warning: `商品组不承接库存和交易。`
  - Shows variant manager entry.
- 规格 SKU edit:
  - Can edit variant label/values.
  - Shows parent group readonly with link.
  - Shows generated name/code preview.
- 独立 SKU edit:
  - Similar to current form but simplified.

### Form Simplification

- Hide advanced catalog fields behind collapsible sections:
  - `价格参考`
  - `图片与说明`
  - `高级编码`
  - `中古默认字段`
- Default first screen should be lightweight:
  - Name/group
  - brand/category
  - manufacturerCode
  - variant axis or variant value
  - preview

---

## SKU Detail Pages

### Route

- Modify: `app/(dashboard)/inventory/skus/[id]/page.tsx`
- Modify: `components/inventory/sku-detail-actions.tsx`

### 商品组 Detail

- Header:
  - Title: group name
  - Badges: `商品组`, category, brand, manufacturerCode
  - No direct stock operation buttons.
- Sections:
  - Common product card
  - Variant matrix/chips
  - Aggregate metrics from operational child SKUs
  - `添加规格` action
  - `批量添加规格` action
- Detail should explain by layout, not long instructional text, that group is a shell.

### 规格 SKU Detail

- Header:
  - Title: parent group name
  - Variant badge: `42码`
  - Code: generated internal SKU code
- Sections:
  - Operational metrics
  - Inventory lots / item units
  - Purchase and sales history
  - Price charts
  - Link back to 商品组

### 独立 SKU Detail

- Same as operational SKU detail without group/variant panel.

---

## Procurement And Inventory Entry Points

### Purchase Wizard

Files:

- Modify: `components/procurement/purchase-wizard.tsx`
- Modify: `components/procurement/add-purchase-line-form.tsx`
- Tests: `tests/e2e/procurement-receive-flow.spec.ts`, `tests/application/purchase-to-profit-flow.test.ts`

Plan:

- SKU selector lists only operational SKUs by default.
- 商品组 rows may appear as disabled grouped headers: `请选择具体规格`.
- Quick-create should offer:
  - `创建独立 SKU`
  - `给已有商品组添加规格 SKU`
  - `先创建商品组再添加规格 SKU`
- Remove requirement that user manually fills SKU code in quick-create.
- Keep import format backward-compatible temporarily, but document operational SKU code only.

### Inventory Lots

Files:

- Modify: `components/inventory/inventory-lot-form.tsx`
- Modify: `components/inventory/item-unit-form.tsx`
- Modify: `app/actions/inventory-lots.ts`
- Modify: `app/actions/item-units.ts`

Plan:

- Selectors only allow `VARIANT` and `SIMPLE`.
- If user searches a group name, show child variants beneath it.
- Error copy uses `商品组/规格 SKU`, not `父 SKU/子 SKU`.
- Used condition entry stays on ItemUnit form.

---

## Listing, Supply, Sales, And Resale

### Files

- Modify: `app/actions/resale-listings.ts`
- Modify: `app/actions/supply-offers.ts`
- Modify: `app/actions/customer-orders.ts`
- Modify relevant components under:
  - `components/resale/`
  - `components/marketplace/`
  - `components/listing/`

### Rules

- Listings can target `VARIANT` or `SIMPLE`, not `GROUP`.
- Supply offer items can target operational SKUs only.
- Customer order lines can target operational SKUs only.
- UI selectors should show group context for variants:
  - `AJ1 芝加哥 2015 · 42码`
  - Code below: `NIKE-555088-101-42`

---

## Product Intelligence Alignment

### Files

- Modify: `app/(dashboard)/product-intelligence/page.tsx`
- Modify: `app/(dashboard)/product-intelligence/[id]/page.tsx`
- Modify: `components/product-intelligence/*`
- Modify: `app/actions/product-intelligence.ts`

### Rules

- 商品情报 remains public/reference data only, not inventory.
- Product Intelligence group/variant terms should align with 商品主档:
  - `商品组`
  - `变体`
  - `售价观察`
  - `成色/状态`
- Observations stay on variants; group only aggregates.
- Add future-ready action labels but keep disabled or hidden unless implemented:
  - `引用为我的商品组`
  - `引用为我的规格 SKU`
- Do not force Product Intelligence IDs to equal private SKU IDs.

---

## Imports And Bulk Operations

### Files

- Modify: `components/inventory/sku-import-button.tsx`
- Modify: `components/inventory/lot-import-button.tsx`
- Modify: `app/actions/import.ts`
- Modify: `lib/application/import-validation.ts`
- Tests: `tests/application/import-action.test.ts`, `tests/application/import-validation.test.ts`

### SKU Import Columns

- `type`: `GROUP`, `VARIANT`, `SIMPLE`
- `group_code`: required for variants if parent is referenced by code
- `name`: required for group/simple, optional for variant
- `variant_label`: required for variants when `variant_values` is empty
- `variant_values`: JSON or `尺码=42码;颜色=黑色`
- `manufacturer_code`
- `brand`
- `category`
- `code`: optional manual override

### Inventory Import

- Accept only operational SKU codes.
- If a row references a group code, fail with `商品组不能入库，请填写具体规格 SKU 编码`.

---

## Test Plan

### Unit / Application Tests

- `tests/application/sku-identity.test.ts`
  - role derivation
  - display name generation
  - code generation
  - uniqueness suffix behavior
- `tests/application/skus-action.test.ts`
  - create group with manufacturer code
  - create variant from short label
  - create simple SKU
  - reject invalid role transitions
  - reject duplicate generated code only after uniqueness suffix fails
- `tests/application/inventory-lots-action.test.ts`
  - explicit GROUP rejected even without child variants
  - VARIANT/SIMPLE accepted
- `tests/application/item-units-action.test.ts`
  - condition belongs to item unit, not SKU
- `tests/application/import-validation.test.ts`
  - import validates role-specific required fields

### UI Verification

- `npm run typecheck`
- `npx vitest run tests/application/sku-identity.test.ts tests/application/skus-action.test.ts tests/application/inventory-lots-action.test.ts`
- `npm run build`
- Start dev server and verify:
  - `/inventory/skus`
  - `/inventory/skus/new`
  - group detail page
  - variant detail page
  - purchase quick-create modal
  - inventory lot form

---

## Execution Order

### Phase 1: Lock The Model With Tests

- [ ] Add/finish failing tests for identity generation.
- [ ] Add/finish failing tests for SKU actions.
- [ ] Add/finish failing tests for operational SKU gate.

### Phase 2: Schema And Prisma

- [ ] Add SKU catalog identity fields.
- [ ] Create migration.
- [ ] Run `npm run db:generate`.
- [ ] Update TypeScript types and Prisma selects/includes.

### Phase 3: Identity Service

- [ ] Implement `lib/application/sku-identity.ts`.
- [ ] Wire generation into `app/actions/skus.ts`.
- [ ] Update `sku-operability.ts`.

### Phase 4: Seed Reset

- [ ] Replace old sample SKUs with the new examples.
- [ ] Clear local/dev business demo data as allowed by the user.
- [ ] Ensure seeded inventory only references `VARIANT` or `SIMPLE`.

### Phase 5: Product Master UI

- [ ] Update `/inventory/skus` list/cards and filters.
- [ ] Replace `/inventory/skus/new` with mode-based creation.
- [ ] Update detail pages for group/variant/simple.
- [ ] Update edit modal/forms.

### Phase 6: Business Entry Points

- [ ] Update procurement quick create and SKU selectors.
- [ ] Update inventory lot/item unit selectors.
- [ ] Update listing/supply/sales selectors and action validation.
- [ ] Update import templates and validation messages.

### Phase 7: Product Intelligence Terminology

- [ ] Align visible labels and helper text.
- [ ] Keep observations variant-level.
- [ ] Keep future "引用为我的 SKU" affordance out of active flows unless fully implemented.

### Phase 8: Verification

- [ ] Run focused tests.
- [ ] Run full typecheck.
- [ ] Run build.
- [ ] Verify key pages in browser.
- [ ] Fix regressions from renamed fields/messages.

---

## Completion Criteria

- Users can create 商品组 without entering SKU code manually.
- Users can add variants by entering short values like `42码` or `小南`.
- System generates stable internal SKU codes and full display names.
- 商品组 cannot be accidentally purchased, stocked, listed, or sold.
- 规格 SKU and 独立 SKU work in procurement, inventory, listing, and sales.
- Used condition is represented on ItemUnit or observations, not as separate SKU identity unless it truly changes the product specification.
- Old visible wording `父 SKU / 子 SKU` is replaced by `商品组 / 规格 SKU` across main UI.
- Local seed data demonstrates shoes, characters, length variants, clothing sizes, standalone items, and used item units.
- Typecheck, targeted tests, build, and browser verification pass.
