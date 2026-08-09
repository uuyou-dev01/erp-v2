# ERP 业务闭环与商品情报版本交接

> 日期：2026-08-09
> 分支：`codex/stocking-decision-labels`
> 基线：以包含本文档的提交为准
> 用途：后续会话继续开发本版本涉及的功能前，必须先阅读本文档。

## 1. 版本结论

本版本已经不再是单一页面优化，而是一轮跨模块业务整合。核心闭环为：

`外部商品证据 → 采集箱 → 商品情报 → 商品组/经营 SKU → 采购 → 物流/到货质检 → 库存 → 上架/货盘 → 销售/履约 → 费用与结算`

同时补齐 Apple/网页移动采集入口、企业两级品类、多人和多组织边界、共享库存、财务子账、通知与审计能力。后续开发应沿现有闭环扩展，不能重新建立与商品情报、SKU、库存或平台重复的平行模型。

## 2. 已落实的主要能力

### 2.1 商品分类基础资料

- 分类采用两层结构：大类与子类；系统基础分类与企业自定义分类并存。
- 已提供鞋服、玩具/模型手办、首饰配件、生活用品等基础大类和常用子类。
- 分类选择器支持搜索、最近使用、树状路径和快速创建企业分类。
- 商品组承担统一分类；组内规格 SKU 默认继承商品组语义，不提供无必要的逐 SKU 分类修改入口。
- 分类通过统一服务和 `/api/v1/catalog/categories` 对 ERP 其他模块及未来开放接口提供数据。

相关实现：

- `components/inventory/product-category-picker.tsx`
- `components/inventory/product-category-manager.tsx`
- `lib/application/product-category-service.ts`
- `lib/application/product-category-defaults.ts`
- `app/api/v1/catalog/categories/route.ts`
- `prisma/migrations/20260731090000_add_product_category_master`

### 2.2 商品主档与 SKU 结构

- 商品组用于聚合相同商品的品牌、品类、图片与公共信息。
- `GROUP` 角色 SKU 只表达商品结构，不能直接采购、持有库存或上架。
- 具体规格 SKU 才是采购、库存、上架和成交的经营对象。
- 商品详情提供结构调整、快速编辑、库存、上架、采购和来源情报入口。
- 商品情报转主档时保留来源图片和来源关系；没有图片的主档会从可信来源证据回填展示图。

### 2.3 商品情报和网页链接采集

- Web 支持单链接和最多 12 条链接批量预解析、核对后进入采集箱。
- 平台适配器采用统一契约，已对 Mercari、Mercari Shops、Atmos 等页面做专门解析；未知站点仍可使用通用元数据解析。
- Mercari 链接支持标题、价格、币种、成色、描述与图片提取；售罄价格按页面真实价格保存。
- 重复 URL 会归一化并去重，同一商品的多次采集保留时间快照和价格变化，不重复污染主档。
- 原始标题、描述、图片、链接和解析证据保存在来源层；AI/OCR/规则输出均是待确认声明，不能自动覆盖标准商品事实。
- 商品情报先进入采集箱/情报层，不直接创建正式库存 SKU；确认后才关联已有 SKU 或生成商品组与规格 SKU。
- 闲鱼等登录后、App 内可见或强反爬来源，不尝试绕过保护。当前使用分享链接、截图/OCR和人工确认兜底。

相关文档：

- `docs/product-intelligence-capture/README.md`
- `docs/product-intelligence-capture/WEB_LINK_CAPTURE.md`
- `docs/product-intelligence-capture/PRODUCT_SPEC.md`
- `docs/product-intelligence-capture/TECHNICAL_ARCHITECTURE.md`

### 2.4 商品情报到后续业务

商品情报详情右侧“业务入口”已经接入真实流程：

- `登记采购`：进入采购向导并预选具体经营 SKU。
- `商品主档`：查看或完善正式商品资料。
- `查看库存`：进入 SKU 库存与经营表现。
- `创建上架记录`：衔接上架业务。
- 多规格商品组必须先选择具体 SKU；没有经营 SKU 时先补规格或关联主档。

采购预选通过 `/procurement/new?skuId=...` 和 `PurchaseWizard.initialSkuId` 完成。该动作只预填采购行，不会创建采购单或直接增加库存。

相关实现：

- `components/product-intelligence/intelligence-business-actions.tsx`
- `app/(dashboard)/product-intelligence/[id]/page.tsx`
- `app/(dashboard)/procurement/new/page.tsx`
- `components/procurement/purchase-wizard.tsx`

### 2.5 采购、物流、质检与库存

- 采购支持多行、外币、汇率、成本分摊、物流批次、到货检查、部分收货、退货和调拨。
- 采购、运输、到货与入库分阶段执行；采购创建或标记发货不能直接增加现货。
- 库存由台账与明确的入库/出库/调拨动作驱动，包含期初库存、批次库存、单件库存、盘点及维护动作。
- 集运和履约链路增加并发、幂等、库存锁定、收货和发货凭证约束。
- 商品情报价格观察与真实采购/销售记录分开统计，避免行情样本污染真实经营表现。

### 2.6 上架、平台覆盖与货盘

- 平台覆盖按具体 SKU 计算，而不是按商品组计算。
- 平台圆形标识在平台增加时采用可收缩展示：优先展示主要平台，其余使用数量聚合，不让平台数撑破表格。
- 未对接 API 的平台仍可作为内部渠道资料和人工上架记录使用；未来接入平台 API 时复用销售渠道账户与适配器边界。
- 货盘支持组织可见性、共享库存、目标渠道和履约范围，避免跨组织看到成本或越权占用库存。

### 2.7 Apple/网页移动端

- 已提供 `/m` PWA 移动入口，覆盖价格采集、采购记录、任务、通知、扫码/拍照、截图 OCR、附件和离线草稿。
- 手机一次处理一个链接；PC 采集箱负责多链接批量核对和集中整理。
- Web Share Target、设备注册、推送订阅、通知偏好、限流、幂等和附件权限已经建模。
- iPhone/iPad 当前通过 PWA 与分享链接工作；原生 SwiftUI/Share Extension 是后续增强，不是当前闭环的前置条件。

相关文档：

- `docs/mobile-companion/README.md`
- `docs/mobile-companion/ACCEPTANCE_REPORT.md`
- `docs/mobile-companion/FULL_DELIVERY_PLAN.md`

### 2.8 多组织、履约与财务

- 增加组织、库存池、销售渠道账户、服务协议与权限范围，逐步替换历史上单一 `storeId` 的边界。
- 货盘代卖、履约申请、仓库入站、销售、售后、费用、结算和钱包子账已经建立关联。
- 关键写入增加幂等、并发保护、协议版本与审计记录，避免重复结算、重复扣库和跨组织越权。
- 财务增加渠道账单、费用台账、结算与钱包展示；金额继续使用 Decimal，不能改用浮点数运算。

## 3. 必须保持的业务不变量

1. 商品情报是市场观察，不是正式 SKU，也不是库存。
2. 商品组只承载共性资料；具体经营 SKU 才能采购、持有库存、上架和成交。
3. 一个商品组内的规格属于同一商品语义，品类由商品组统一管理。
4. 采购单创建、付款或发货都不能直接增加现货；只有经过到货/入库动作才能写入库存。
5. 售出登记不能绕过分配与发货状态机直接扣库。
6. 外部解析、OCR 和 AI 结果必须可追溯、可人工确认，不能静默覆盖主档字段。
7. 同一 URL 的再次采集应形成新观察或价格变化，不应重复生成同一主档。
8. 平台商品文案不等于内部标准商品名称；来源信息与标准化信息必须分层保存。
9. 平台覆盖按 SKU 计算；平台数量增加时使用折叠/聚合，不在固定区域无限追加圆标。
10. 组织、库存池、仓库、销售渠道和服务协议的权限边界必须在服务端校验，不能只依赖前端隐藏。
11. 金额使用 `Decimal`；库存、结算和通知等高风险动作必须保持事务、幂等和审计记录。
12. 闲鱼等受保护平台不采用绕过登录、验证码或反爬机制的实现。

## 4. 关键入口与接口

### Web 页面

- `/product-intelligence`：商品情报。
- `/product-intelligence/captures`：采集箱与批量链接解析。
- `/product-intelligence/price-changes`：来源价格变化。
- `/inventory/skus`、`/inventory/skus/[id]`：商品主档和经营 SKU。
- `/settings/categories`：两级品类管理。
- `/procurement/new`：采购向导，支持 `skuId` 预选。
- `/inventory/sellable`：可售库存看板。
- `/listing`、`/listing/new`：上架运营。
- `/m`：移动端入口。

### 主要 API

- `/api/v1/catalog/categories`
- `/api/v1/product-intelligence/adapters`
- `/api/v1/product-intelligence/captures`
- `/api/v1/product-intelligence/captures/preview`
- `/api/v1/product-intelligence/captures/preview/batch`
- `/api/v1/product-intelligence/price-changes`
- `/api/v1/mobile/*`

## 5. 数据库与部署顺序

本版本包含从 `20260727110000_wallet_commission_idempotency` 到 `20260804130000_standardize_item_unit_grading` 的一组新迁移，覆盖期初库存、物流基础、品类、移动采集、来源价格、多组织子账、履约、售后、采购成本与单件成色标准化。

部署顺序：

1. 备份 PostgreSQL。
2. 配置 `.env.example` 中新增的移动、对象存储、通知与安全参数。
3. 安装依赖：`npm ci`。
4. 生成 Prisma Client：`npm run db:generate`。
5. 按生产流程执行 Prisma migrations。
6. 运行必要的种子/基础分类初始化。
7. 执行 `npm run typecheck`、`npm test` 和 `npm run build`。
8. 再启动 Web、通知 outbox 与 retention 任务。

不要把 `.codex/` 数据库备份、浏览器审计临时文件或根目录 `eng.traineddata` 提交到仓库；OCR 语言包已经由 npm 依赖提供。

## 6. 本次交付验证

- `npm run typecheck`：通过。
- 商品分类、导航、导入、SKU 详情相关 Vitest：24 项通过。
- 完整 Vitest（单 Worker）：89 个测试文件、353 项测试全部通过。
- `npm run build`：通过，Next.js 生产构建成功。
- 浏览器验收：商品情报详情业务入口正常，采购向导成功预选经营 SKU。
- 验收过程中没有创建采购单，也没有修改库存。

本地 PostgreSQL 连接数较低时，并行执行完整测试可能触发 `too many clients`；此时使用 `npm test -- --maxWorkers=1`。串行完整测试已通过，这属于测试运行资源限制，不是业务断言失败。

## 7. 已知限制与下一步

- 不同平台仍需要在统一适配器契约下做逐站优化，不能假设一个解析器覆盖所有网页。
- 闲鱼 App 内完整字段仍主要依赖用户分享的链接、截图/OCR与人工确认。
- Mercari 等站点页面结构变化后，应使用脱敏 Fixture 更新适配器测试。
- 原生 Apple Share Extension 尚未作为生产依赖；当前以 PWA/Web Share Target 为主。
- 大数据量下仍需继续完善分页、异步任务、采集队列重试、图片对象存储和监控指标。
- 部署前应在临时数据库从零跑完整迁移，并在脱敏生产副本验证历史数据回填。
- 未来 AI 首先用于字段候选、近重复判断、标题归一和图片相似度；AI 结论必须显示置信度并允许人工纠正。

## 8. 后续会话交接要求

任何后续会话只要改动本文件涉及的模块，必须：

1. 开始前阅读本文档和对应模块文档。
2. 明确本次改动影响的是来源证据、商品情报、商品组还是具体 SKU。
3. 核对是否影响采购、库存、上架、结算或组织权限的不变量。
4. 对新增平台使用现有适配器契约，并添加脱敏 Fixture 与解析测试。
5. 对跨模块流程做浏览器或 E2E 验收，不只验证单个组件。
6. 完成后更新模块文档；若改变数据模型或业务边界，再新增下一份交接记录并更新 `docs/handoffs/README.md`。
