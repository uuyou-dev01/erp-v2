# ERP v2 系统性测试报告

测试日期：2026-06-04  
测试对象：跨境交易 ERP v2  
测试范围：工程基线、UI/交互、核心业务流程、系统设计、数据模型、可维护性  
测试方式：命令验证、数据库迁移状态检查、浏览器 smoke test、移动端视口验证、代码审计、业务流程推演

## 1. 总体结论

ERP v2 已经具备较完整的跨境交易 ERP 雏形，模块覆盖库存、采购、销售、Listing、物流、报表、工作台，数据模型也体现了成本不可变、库存账本、订单分配、多平台、多仓库等关键业务意识。

本次在数据库可访问、本地服务可启动的环境下，生产构建通过，17 个主要路由均能渲染出主内容，未出现 Next.js 错误 overlay。系统已经具备可演示和继续迭代的基础。

但当前系统仍处于「内部原型 / 早期业务系统」阶段，不建议直接作为多人协作或真实库存系统上线。主要原因是：

- 生产构建依赖可访问数据库；当前环境构建通过，但 CI/部署环境必须保证数据库策略清晰。
- 多租户和权限仍以硬编码 `store_1` 为主，缺少登录态与服务端授权边界。
- 销售库存分配没有真正锁库存，存在超卖和重复分配风险。
- 关键状态大量使用字符串字段，缺少 enum、状态机或数据库约束。
- 缺少自动化测试体系，当前没有 Vitest/Jest/Playwright 配置或业务回归测试脚本。
- UI 已有后台系统形态，桌面和移动端主流程可渲染；但仍存在 Recharts 容器警告、可访问性警告、表单反馈和状态可定位性问题。

建议按「先修库存与权限安全，再补测试体系，最后做 UI 和流程效率优化」推进。

## 2. 测试环境与命令结果

### 2.1 工程基线

执行命令：

```bash
npm run lint
npm run build
npx prisma validate
npx prisma migrate status
```

结果：

- `npm run lint`：通过，但有 8 个警告。
- `npm run build`：通过，退出码 0；构建过程中仍输出 lint 警告和 Browserslist 数据过期提示。
- `npx prisma validate`：通过，schema 有效。
- `npx prisma migrate status`：通过，数据库 `erp` 的 schema 与 2 个 migration 保持同步。

构建通过证据：

```text
✓ Compiled successfully
✓ Generating static pages (18/18)
Route (app) ... /dashboard, /inventory/skus, /workbench ...
Process exited with code 0
```

Prisma 校验结果：

```text
The schema at prisma/schema.prisma is valid
```

数据库迁移状态：

```text
Datasource "db": PostgreSQL database "erp", schema "public" at "localhost:5432"
2 migrations found in prisma/migrations
Database schema is up to date!
```

### 2.2 浏览器渲染与交互测试

本地服务启动命令：

```bash
npm run dev
```

结果：

```text
Local: http://localhost:3000
✓ Ready in 701ms
```

浏览器 smoke test 覆盖路由：

| 路由 | 结果 | 首屏标题 |
| --- | --- | --- |
| `/dashboard` | 通过 | 仪表盘 |
| `/workbench` | 通过 | 工作台 |
| `/inventory/sellable` | 通过 | 可售库存 |
| `/inventory/skus` | 通过 | 商品档案 |
| `/inventory/lots` | 通过 | 入库库存 |
| `/inventory/items` | 通过 | 单品管理 |
| `/inventory/locations` | 通过 | 仓库位置 |
| `/inventory/stocktake` | 通过 | 库存盘点 |
| `/procurement` | 通过 | 采购管理 |
| `/sales` | 通过 | 销售管理 |
| `/listing` | 通过 | Listing 分类 |
| `/listing/platforms` | 通过 | 销售平台 |
| `/reports` | 通过 | 报表分析 |
| `/sales/new` | 通过 | 新建销售订单 |
| `/procurement/new` | 通过 | 新建采购订单 |
| `/inventory/skus/new` | 通过 | 新增 SKU |
| `/listing/new` | 通过 | 添加上架记录 |

共同断言：

- 页面标题为 `跨境贸易 ERP`。
- DOM 包含 `main` 主内容。
- 未发现 `Runtime Error`、`Application error`、`Build Error` 或 Prisma 错误 overlay。
- 主路由均返回 200，dev server 日志未出现业务运行时 error。

关键交互：

- 顶部搜索/命令入口可点击并打开搜索/命令内容。
- `/workbench?action=quickEntry` 可打开快速录入抽屉。
- 移动端 390x844 视口下 `/workbench`、`/inventory/sellable` 可渲染主内容。
- 移动端左上角菜单按钮可打开导航抽屉。

截图证据：

- `docs/testing/screenshots/dashboard-desktop.png`
- `docs/testing/screenshots/workbench-quick-entry-desktop.png`
- `docs/testing/screenshots/sellable-mobile.png`
- `docs/testing/screenshots/mobile-menu.png`

运行时警告：

```text
The width(-1) and height(-1) of chart should be greater than 0
```

该警告来自 Recharts，出现在 `/dashboard` 图表渲染阶段。截图显示图表可见，但警告说明图表容器在某个渲染瞬间宽高不可测，建议为图表容器增加稳定的 `min-height`/尺寸约束。

## 3. 高优先级问题

### P1-0：生产构建依赖数据库可用性

影响范围：部署、CI、生产发布。

证据：

- 在数据库可访问的当前环境，`npm run build` 通过。
- 但 `/inventory/skus/new` 等静态路由在预渲染时仍会调用 Prisma，例如 `/inventory/skus/new` 调用 `getSKUParentOptions(STORE_ID)`。
- `app/(dashboard)/inventory/skus/new/page.tsx:8-11` 使用硬编码 `STORE_ID` 并在页面渲染阶段访问 Prisma。

风险：

- CI 或 Vercel build 环境没有数据库连接时，构建可能失败。
- 即使数据库可用，构建阶段访问业务数据会让静态生成和运行时数据耦合。

建议：

- 对依赖数据库的 dashboard 页面统一声明 `export const dynamic = "force-dynamic"`，或改为运行时加载。
- 避免在构建阶段读取租户数据。
- 建立 CI 环境变量和测试数据库策略。

### P0-2：销售库存分配未锁库存，可能超卖

影响范围：销售、库存、报表、Listing 同步。

证据：

- `app/actions/customer-orders.ts:157-192` 的 `allocateInventory` 只创建 `OrderAllocation` 并更新 `OrderLine.supplyStatus`。
- 该函数没有写入 `StockLedger` 的负数或锁定记录，也没有把 `OrderAllocation.status` 设为 `ALLOCATED`。
- `getAvailableQuantity` 基于 `StockLedger.deltaQty` 汇总，因此已分配但未发货的库存仍会被视为可用。

风险：

- 多个订单可以分配同一批次库存。
- Listing 快速售出和手工销售分配可能互相抢库存。
- 发货时才扣库存，可能出现负库存或错误成本。

建议：

- 明确库存账本语义：分配时写 `ALLOCATE` 负数，取消时写 `DEALLOCATE` 正数；或建立独立 reserved quantity。
- 在事务内检查可用量并创建分配，避免并发读写。
- 为 `OrderAllocation` 增加状态流转：`PENDING -> ALLOCATED -> SHIPPED/RETURNED/CANCELLED`。

### P0-3：批次发货剩余量计算存在重复扣减风险

影响范围：库存批次状态。

证据：

- `app/actions/customer-orders.ts:676-698` 先写入负数出库账本。
- 随后 `tx.stockLedger.findMany` 已经能读到本次负数账本。
- 但 `remaining.minus(allocation.quantity).lte(0)` 又减了一次发货数量。

风险：

- 批次可能被过早标记为 `CONSUMED`。
- 剩余库存展示、可售库存和后续分配会异常。

建议：

- 写入出库账本后，直接用汇总后的 `remaining.lte(0)` 判断是否消耗完。
- 增加一个单元测试覆盖：入库 10，发货 3 后批次仍为 `ACTIVE` 且剩余 7。

### P1-1：权限和多租户边界缺失

影响范围：所有业务数据。

证据：

- 大量页面和组件使用 `const STORE_ID = "store_1"`，例如 `components/layout/sidebar.tsx:31`、`app/(dashboard)/inventory/skus/new/page.tsx:8`。
- schema 有 `User.role` 和 `Store`，但页面和 Server Actions 没有统一读取 session 或校验用户所属 store。
- `next-auth` 是依赖项，但未看到中间件、session 校验或 action 级授权。

风险：

- 无法支持多人协作和真实 SaaS 多租户。
- Server Action 如果被直接调用，可能越权读写其他 store 数据。

建议：

- 引入统一 `requireUserContext()`，返回 `{ userId, storeId, role }`。
- Server Actions 不再接收客户端传入的 `storeId` 作为信任来源。
- 所有 `findUnique/update/delete` 需要叠加 store 归属校验。

### P1-2：状态字段缺少强约束

影响范围：采购、销售、库存、Listing、物流。

证据：

- `prisma/schema.prisma` 中大量状态字段是 `String`，例如 `OrderAllocation.status`、`Listing.status`、`PurchaseOrder.status`、`CustomerOrder.orderStatus`。
- 代码中出现 schema 注释之外的状态，例如 Listing schema 注释为 `ACTIVE, DELISTED`，但 `quickSellListing` 写入 `SOLD_OUT`。

风险：

- 容易出现拼写错误或孤立状态。
- 报表和筛选逻辑漏掉新状态。
- 后续多人开发难以维护状态流转。

建议：

- 将核心状态迁移为 Prisma enum。
- 建立状态机 helper，例如 `transitionPurchaseOrder(order, nextStatus)`。
- 把非法状态迁移和历史数据修复纳入 migration。

## 4. UI/交互审计

### 优点

- 采用左侧导航 + 顶部 header + 主内容区，符合 ERP 工具型产品。
- 模块导航按运营和设置分组，信息架构基本清晰。
- 使用 lucide 图标、卡片、表格、Badge，有一致的后台系统基础。
- 主色、灰阶和破坏色 token 基本完整，适合业务系统长期维护。

### 主要问题

#### P1：缺少真实错误页和异常兜底

本次在数据库可访问时页面可正常渲染；但页面和预渲染流程仍直接依赖 Prisma 数据读取。业务系统需要在数据库不可达或数据加载失败时给出可恢复 UI，例如“数据库连接失败 / 请检查服务 / 重试”。

建议：

- 为 dashboard 路由组增加 `error.tsx` 和 `loading.tsx`。
- Server Actions 返回结构化错误，不只依赖 `throw new Error`。

#### P2：图表容器存在运行时尺寸警告

浏览器和 dev server 均捕获到 Recharts 警告：

```text
The width(-1) and height(-1) of chart should be greater than 0
```

截图中图表最终可见，但该警告说明图表容器初始化时宽高不可测，可能在慢设备、隐藏容器、移动端切换或首次加载时产生闪烁或空白。

建议：

- 为图表卡片内的 `ResponsiveContainer` 外层设置稳定的高度和 `min-w-0`。
- 对空数据状态提供固定高度占位，避免图表组件在 0 尺寸容器中初始化。

#### P2：表单失败反馈不够专业

证据：

- `components/sales/allocate-inventory-form.tsx` 出错时使用 `alert("分配库存失败，请重试")`。

建议：

- 改为 toast 或 inline error。
- 提供明确错误原因，例如库存不足、批次已消耗、订单状态不允许分配。

#### P2：可访问性和图片优化警告

lint 警告：

- `app/(dashboard)/inventory/items/[id]/page.tsx` 图片缺少 `alt`。
- 多处使用 `<img>`，Next.js 建议改用 `next/image` 或统一图片组件。

建议：

- 商品图统一使用 `components/ui/product-image.tsx` 并支持 `alt`。
- 对装饰性图片使用空 alt，对商品图片使用 SKU 名称或商品名。

#### P2：导航分组有信息架构混杂

当前“库存”下包含 `Listing 分类`，设置区又包含 `销售平台配置`。对运营人员来说，“Listing 作业”和“库存设置”边界容易混。

建议：

- 将 Listing 独立为一级模块，下面包含 Listing 分类、待上架、平台配置。
- 设置区只保留仓库、平台、基础资料等低频配置。

## 5. 核心业务流程审计

### 采购入库

现状：

- `receivePurchaseOrder` 使用事务更新采购单、创建 `InventoryLot` 或 `ItemUnit`，并写入 `StockLedger`。
- 新货和二手/特殊品按 `isUsedCondition` 分流，设计方向正确。

风险：

- `updatePurchaseOrderStatus` 可直接更新状态，缺少状态流转校验。
- `addPurchaseLine` 和 `recalculateOrderTotals` 不在一个事务内，极端情况下可能行创建成功但总额未刷新。

建议：

- 所有采购状态变化收敛到状态机。
- 创建/删除采购行与重算总额放进同一事务。

### 销售分配与发货

现状：

- 有订单、订单行、分配、发货、妥投、退货、结算等路径。
- 发货时会写库存出库账本。

风险：

- 分配阶段不锁库存。
- 手工分配只支持 lot，表单未覆盖 `ITEM_UNIT`。
- 批次发货剩余量判断有重复扣减风险。

建议：

- 优先修复库存锁定。
- 手工分配支持 lot 和 item unit。
- 增加销售流程回归测试。

### Listing 快速售出

现状：

- `quickSellListing` 在事务内创建销售订单、订单行、库存分配，并计算费用。
- 能按 FIFO 找批次，也能 fallback 到单件库存。

风险：

- 快速售出创建分配但不立即扣库存，仍依赖发货动作。
- `ITEM_UNIT` listing 售出后把 Listing 标为 `SOLD_OUT`，但 schema 注释和部分逻辑只描述 `ACTIVE/DELISTED`。

建议：

- 明确快速售出是否等同“确认订单”还是“已售待发货”。
- Listing 状态统一为 enum，并补 `SOLD_OUT` 的筛选和展示策略。

## 6. 系统设计审计

### 数据模型

优点：

- `Store` 维度贯穿主要模型，具备多租户扩展基础。
- `StockLedger` 作为库存事实账本，方向正确。
- Decimal 精度设置为 `Decimal(19,4)` 或费率 `Decimal(8,4)`，适合金额和数量。

风险：

- 账本没有数据库层面的实体外键，因为 `entityType/entityId` 是多态引用。
- 状态和类型大量使用字符串，缺少数据库约束。
- `Fee` 没有 storeId，跨租户审计和查询不方便。

建议：

- 对多态账本增加应用层完整性测试。
- 关键状态改 enum。
- 为财务相关表增加 storeId、createdAt、updatedAt。

### 应用架构

优点：

- Server Actions + Prisma 的实现路径直接，适合早期快速迭代。
- 部分复杂逻辑已放入 `lib/application/*`，有领域服务雏形。

风险：

- 页面、组件、action 都可能直接持有业务规则。
- 缺少统一 action wrapper、权限校验、错误转换、审计日志。
- 构建阶段和运行时数据读取边界不清。

建议：

- 建立 `lib/application/*` 作为业务服务层，Server Actions 只做参数校验、权限和 revalidate。
- 引入 zod schema 校验所有 action 输入。
- 建立统一错误类型：业务错误、权限错误、数据错误、系统错误。

## 7. 测试体系建议

当前项目缺少自动化测试配置。建议分三层补齐：

### 第一层：业务单元测试

工具建议：Vitest。

优先覆盖：

- 订单费用计算 `lib/application/order-fees.ts`。
- 库存可用量计算。
- 发货后批次剩余量。
- 退货财务调整。
- SKU reference price 选择逻辑。

### 第二层：集成测试

工具建议：Vitest + 测试数据库，或 Prisma + Docker Postgres。

优先流程：

1. 创建 SKU -> 创建采购单 -> 添加采购行 -> 入库 -> 生成库存账本。
2. 创建销售订单 -> 添加订单行 -> 分配库存 -> 确认 -> 发货 -> 库存扣减。
3. 取消订单 -> 释放已分配库存。
4. 退货 -> 库存回补 -> 财务调整。
5. Listing 快速售出 -> 生成订单和分配。

### 第三层：端到端测试

工具建议：Playwright。

优先页面：

- `/dashboard`
- `/workbench`
- `/inventory/skus`
- `/inventory/sellable`
- `/procurement`
- `/sales`
- `/listing`
- `/reports`

必测断言：

- 页面不空白。
- 无 Next.js error overlay。
- 无关键 console error。
- 主要按钮可点击。
- 表单校验和提交反馈可见。
- 移动端导航可打开/关闭。

## 8. 改进路线图

### 立即修复，1-3 天

- 修复 `markOrderShipped` 批次剩余量重复扣减问题。
- 修复销售分配不锁库存问题。
- 数据库依赖页面统一动态化，保证 `next build` 可在 CI 中通过。
- 增加 dashboard 路由组 `error.tsx`。
- 修复 lint 警告中的图片 alt 和未使用变量。

### 短期增强，1-2 周

- 引入 Vitest，覆盖库存、订单、费用计算。
- 引入统一 `requireUserContext()`，替代硬编码 `store_1`。
- Server Actions 增加 zod 输入校验。
- 采购、销售、Listing 状态改为集中常量或 enum。
- 手工销售分配支持 `ITEM_UNIT`。

### 中期建设，3-6 周

- 建立测试数据库和 CI 流程。
- Playwright 覆盖主流程。
- 状态机化核心流程：采购、销售、物流、Listing。
- 增加审计日志和操作人字段。
- 报表指标增加数据口径文档和测试样例。

### 长期架构，6 周以上

- 完成 next-auth 登录、角色权限和多租户隔离。
- 建立库存预留系统或库存快照表，减少全量账本聚合成本。
- 将财务费用、汇率、利润计算沉淀为独立领域服务。
- 对 Listing 和库存同步建立异步任务/事件机制。

## 9. 测试结论

当前系统适合继续作为内部 ERP 原型迭代，业务覆盖面较好，但真实上线前必须先解决库存一致性、权限边界、构建稳定性和自动化测试缺失这四类问题。

推荐上线评级：暂不建议生产上线。  
推荐下一步：先修 P0 问题，并补最小业务回归测试，再继续 UI 和流程优化。
