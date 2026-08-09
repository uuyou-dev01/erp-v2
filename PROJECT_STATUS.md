# 项目状态总览

## 最后更新
2026年8月9日 — ERP 业务闭环、商品情报采集、移动端与多组织业务整合版本

> 本文件下方保留历史阶段记录。当前可执行基线、关键约束、部署顺序与后续会话交接要求，以 [2026-08-09 版本交接](docs/handoffs/2026-08-09-erp-business-intelligence-handoff.md) 为准。

## 当前版本摘要（2026-08-09）

- 已建立两级商品分类基础资料、树状选择与统一分类 API。
- 已统一商品组与经营 SKU 边界，并把商品情报、采购、库存和上架串成业务闭环。
- 已落地 Web 单/多链接采集、Mercari/Atmos 适配、来源证据、价格变化和截图 OCR 兜底。
- 已提供 Apple/网页移动 PWA，覆盖采集、任务、通知、附件和设备能力。
- 已增强采购、物流、质检、退货、调拨、期初库存、集运和库存并发约束。
- 已建立多组织、共享库存、货盘代卖、履约、售后、费用、结算与钱包子账基础。
- 商品情报详情已提供采购、商品主档、库存和上架的真实业务入口。

后续开发不得绕过交接文档中的商品、库存、金额、权限、外部证据与幂等不变量。

## 项目信息

**项目名称**：跨境贸易ERP系统
**技术栈**：Next.js 15 + TypeScript + Prisma + PostgreSQL
**UI库**：shadcn/ui + Tailwind CSS
**图表库**：Recharts

## 最近升级（2026-05-24）：阶段化交易工作台

ERP 已升级为贴近 Excel 实操的阶段化业务流：
**采购录入 → 补物流 → 到货检查 → 上架 → 售出登记 → 通知发货 → 结算**

核心变化：

- **Prisma 模型扩展**：
  - `QuickEntry`：新增 `workflowStage / inspectionResult / inspectionNote / inspectedAt` 阶段字段
  - `CustomerOrder`：新增 `shippedAt / trackingNo / shippingProof / settledAt`
  - `InventoryLot`：新增 `batchLabel`（批次描述）
  - 新模型：`InboundShipment`、`ConsolidationBatch(+Line)`、`InspectionEvent`
- **新流程语义**：
  - 全新商品 → `InventoryLot`；中古/瑕疵/非统一 → `ItemUnit`（强制批次描述）
  - 售出登记仅创建 `OrderAllocation`（PENDING），**不立即扣库存**
  - 确认发货时才扣减库存并写入 `OUTBOUND_SALE` 流水
  - 结算时补录手续费/邮费，重算 `netRevenue`
- **服务层**：`lib/application/quick-entry.ts` 重写为分阶段处理（采购/物流/检查/上架/售出），并提供 `updateAndProcessQuickEntry`、`inspectQuickEntry` 用于续填和检查
- **新 server actions**：`markOrderShipped`、`settleCustomerOrder`、`updateQuickEntry`、`inspectQuickEntryAction`
- **UI**：
  - `/workbench`：4 个阶段 Tab（采购/补物流/上架/售出）+ 成色下拉 + 中古时批次描述必填 + 待补全队列（可续填 / 检查通过 / 检查失败）
  - 采购详情页：在途状态显示物流信息块；状态机支持 `SHIPPED`
  - 销售详情页：CONFIRMED 后挂载「确认已发货」按钮；SHIPPED 后挂载「结算订单」对话框
  - 上架页：新增「活跃上架 · 快捷售出」卡片，每条上架可直接 `售出`（走新流程）
  - 侧边栏：工作台置顶，"库存管理"改为"库存查看"避免误用旧入口

## 已完成模块

### ✅ 0. 全局基建（Phase 0）
- 蓝粉品牌色体系（CSS 变量 + Tailwind extend）
- 响应式骨架（可折叠侧边栏 + 移动端抽屉菜单）
- 简易中文 i18n（`lib/i18n.ts` 字典 + `t()` helper）
- Prisma 模型扩展：Platform 费率/国家/币种、CustomerOrder 平台费/发货费/净利、Listing 费率覆盖/到手价、FxRate 汇率、ImportJob 批量导入记录
- CSV 批量导入基建：papaparse + 通用 `csv-import-dialog.tsx` + `app/actions/import.ts`
- 通用组件抽离：StatCard、Stepper、ChartCard、ResponsiveTable

### ✅ 1. 库存管理模块
- 仓库位置管理（CRUD）+ 仓库饱和度可视化
- 商品SKU管理（CRUD）+ 表单简化（历史下拉 + 属性预设）
- 库存批次管理（CRUD + StockLedger）
- 单品管理（CRUD + 成色追踪）+ 批次↔瑕疵单品转化 UI
- CSV 批量导入 SKU / 批次
- ResponsiveTable 适配 + 完整中文化

**文档**：`docs/modules/inventory.md`

### ✅ 2. 采购管理模块
- 采购订单分步 Wizard（基本信息→采购行→确认）
- 一键收货
- CSV 导入采购行
- 供应商信息 + 多货币支持
- **物流联动（v1.1）**：状态机扩展 SHIPPED（在途），表单加 `etaDate / trackingNo / carrier / shipmentNote`，详情页 4 段时间线
- **代发仓语义**：复用 `Location.isSellableDefault` 表达「代发型转运仓」，收货时按目的地仓显示可售/不可售提示
- ResponsiveTable + 完整中文化

**文档**：`docs/procurement.md`（含 v1.1 物流字段与代发仓语义补充）

### ✅ 3. 销售管理模块
- 多平台支持：平台必选 + 费率自动带出
- 平台费 / 发货费 / 净利润自动计算
- 平台 Tab 筛选
- 销售 CSV 导入 + 国家流向
- ResponsiveTable + 完整中文化

**文档**：`docs/modules/sales.md`

### ✅ 4. 商品上架模块
- 平台默认费率配置（国家/币种/抽成/运费）
- 到手价估算（选平台+填价格实时计算）
- 平台筛选 Tab + 到手价列
- 批量上架对话框（4 步 Stepper：选SKU→选平台→定价→确认）
- **可售库存联动（v1.2）**：列表/对话框/创建表单全面展示「可发货 / 转运中」库存状态，仅在转运中的 SKU 提示先调拨
- ResponsiveTable + 完整中文化

**文档**：`docs/listing.md`、`docs/procurement.md`（v1.2 联动章节）

### ✅ 5. 报表分析模块
- 时间范围切换（近7天/30天/90天/全部）
- 月度收入 / 支出 / 利润折线图
- 平台佣金 / 发货费明细
- 图表配色统一（蓝粉品牌色）
- CSV 导出
- 完整中文化

**文档**：`docs/modules/reports.md`

### ✅ 6. 仪表盘模块（Phase 2）
- 4 张统计卡片：本月销售额、库存总值、进行中采购、上架商品数（可点击跳转）
- 销售趋势图：近 6 个月收入 + 利润 AreaChart
- 平台销售分布：PieChart（品牌蓝粉配色）
- 最近采购订单表格（5 条，可跳转详情）
- 快捷操作区：新建采购/销售/SKU/上架
- 真实数据（无 mock）+ 完整中文化 + 响应式

## 待实施模块

### 📋 6. 智能推荐模块（Intelligence）
- 参考价格档案
- 定价建议
- 补货建议
- 促销策略

**文档**：`docs/modules/intelligence.md`
**状态**：设计完成，待开发

### 📋 7. 货盘分销系统（Marketplace）
- 公共货盘市场
- 货盘发布和浏览
- 联系方式展示
- 感兴趣标记和咨询

**文档**：`docs/modules/marketplace-distribution.md`
**差距分析**：`docs/MARKETPLACE_GAP_ANALYSIS.md`
**状态**：设计完成，待开发

### 📋 8. 财务模块（Finance）
- 账务管理
- 资金流
- 成本核算
- 利润分析

**状态**：后期规划

### 📋 9. 权限管理模块（Account & Permission）
- 用户管理
- 角色权限
- 多人协作
- 操作日志

**状态**：后期规划

## 核心功能统计

### 数据模型
- ✅ 17+ 核心数据表（含 FxRate、ImportJob）
- ✅ 多租户架构（storeId 隔离）
- ✅ 完整的关系定义
- ✅ Decimal.js 金额处理
- ✅ 平台费率 / 发货费 / 汇率建模

### Server Actions
- ✅ 7 个模块的 CRUD + 报表操作
- ✅ 40+ API 函数
- ✅ 事务处理 + 批量写入
- ✅ 数据验证 + CSV 导入

### 页面
- ✅ 28+ 页面
- ✅ 列表页（StatCard + 搜索 + ResponsiveTable）
- ✅ 详情页
- ✅ 表单页（Stepper wizard）
- ✅ 报表页（时间范围 + 图表）
- ✅ 仪表盘（真实数据 + 可跳转）

### 组件
- ✅ 30+ 业务组件
- ✅ 10+ UI 组件（shadcn/ui）
- ✅ 6+ 通用组件（StatCard/Stepper/ChartCard/ResponsiveTable/CsvImportDialog）
- ✅ 5+ 图表组件（Recharts：Area/Line/Pie/Bar）
- ✅ 表单组件 + 布局组件

## 技术特性

### 前端
- ✅ Next.js 15 App Router
- ✅ TypeScript 类型安全
- ✅ Tailwind CSS + 蓝粉品牌色体系
- ✅ 响应式设计（桌面 / 平板 / 手机）
- ✅ 毛玻璃暗色主题
- ✅ 完整中文本地化（i18n 字典）
- ✅ CSV 批量导入 / 导出

### 后端
- ✅ Server Actions
- ✅ Prisma ORM
- ✅ PostgreSQL数据库
- ✅ 事务处理
- ✅ 数据验证

### 数据处理
- ✅ Decimal.js金额计算
- ✅ 日期格式化
- ✅ 数据聚合
- ✅ 状态管理

## 文档体系

### 核心设计文档
- ✅ `docs/overview.md` - 项目概述
- ✅ `docs/domain.md` - 领域模型
- ✅ `docs/constraints.md` - 系统约束
- ✅ `docs/tech-stack.md` - 技术栈
- ✅ `docs/ui.md` - UI规范

### 模块文档
- ✅ `docs/modules/` - 各模块设计和完成记录
- ✅ 6个模块文档
- ✅ 3个完成记录

### 安装文档
- ✅ `docs/setup/` - 安装配置指南
- ✅ 8个安装相关文档

### 开发记录
- ✅ `docs/phases/` - 开发阶段记录
- ✅ 6个阶段完成记录

### 文档索引
- ✅ `docs/README.md` - 文档目录和导航

## 构建状态

### 最新构建（2026-05-07）
- ✅ 构建成功，0 error
- 28 个路由（14 静态 + 14 动态）

### 包大小
- First Load JS: 102 kB（共享）
- 最大页面: ~240 kB (/reports, /dashboard)

## 数据库状态

### 表统计
- 15+ 核心业务表
- 完整的索引
- 外键约束
- 级联删除

### 迁移
- ✅ 初始迁移完成
- ✅ Schema同步
- ✅ 种子数据脚本

## 下一步计划

### 短期
1. 端到端联调（SKU→采购→库存→销售→上架→报表→仪表盘）
2. 搜索框功能完善
3. 数据缓存策略 + 大数据量分页
4. 详情页编辑功能
5. **库存调拨 UI（v1.3）**：把转运仓库存调拨到本土仓 / 代发仓的标准操作（当前需要手改 lot 的 location）
6. **多包裹拆单（v1.3）**：评估是否升级为 `PurchaseShipment` 子表（当前用 shipmentNote 兜底）
7. **在途库存 → 补货建议（Intelligence v0.1）**：把 SHIPPED 状态的采购量计入 SKU 的"在途供给"

### 中期
1. 完整 i18n 框架（多语言切换）
2. 用户认证 + 权限管理
3. 智能推荐模块
4. 货盘分销系统

### 长期
1. 财务模块（账务 / 资金流 / 成本核算）
2. API 开放平台
3. 自动化工作流（采购→入库→上架一条龙）

## 已知问题 / 待优化

1. 搜索框功能（目前部分页面只是占位）
2. 数据缓存策略 + 大数据量分页
3. 图片上传优化
4. storeId 硬编码为 "store_1"（需接入用户认证后动态获取）

## 团队协作

### 开发规范
- ✅ TypeScript严格模式
- ✅ ESLint代码检查
- ✅ Prettier代码格式化
- ✅ Git版本控制

### 文档规范
- ✅ 模块文档模板
- ✅ 完成记录模板
- ✅ 代码注释规范
- ✅ README维护

## 快速链接

### 开发
- [快速开始](docs/setup/QUICK_START.md)
- [技术栈](docs/tech-stack.md)
- [领域模型](docs/domain.md)

### 模块
- [库存管理](docs/modules/inventory.md)
- [采购管理](docs/modules/procurement.md)
- [销售管理](docs/modules/sales.md)
- [商品上架](docs/modules/listing.md)
- [报表分析](docs/modules/reports.md)

### 待实施
- [智能推荐](docs/modules/intelligence.md)
- [货盘分销](docs/modules/marketplace-distribution.md)

---

**项目进度**：核心业务功能已完成 85%（6 模块 + 仪表盘 + 全局基建）
**代码质量**：良好（build 0 error，ESLint 通过）
**文档完整度**：优秀
**可用性**：可投入使用

*最后更新：2026-05-07 — Phase 0~2 全部完成（主 agent + 5 子 agent 编排）*
