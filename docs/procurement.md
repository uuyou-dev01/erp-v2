采购模块（Procurement）— 状态机 & 为单采购设计（v1）

本文档定义新项目中 采购模块的完整业务规则，包括：

采购状态机

“为订单采购（先卖后买）”流程

成本分摊与汇率使用口径

本模块是库存、物流、财务的上游源头，设计目标是 成本可追溯、状态清晰、可扩展。

一、采购模块的定位（再次明确）
采购模块负责什么

记录采购行为本身

记录采购成本结构

决定库存如何形成（Lot / ItemUnit）或在途供给

为“先卖后买”提供供给承诺

采购模块不负责什么

❌ 不负责利润计算（交给财务）

❌ 不负责库存聚合逻辑（交给 StockLedger）

❌ 不直接处理物流轨迹（交给物流模块）

二、采购状态机（PurchaseOrder Status）
状态定义（v1 固定）
DRAFT        草稿（可反复修改）
ORDERED      已下单（成本口径确定）
INBOUND      在途（已采购但未到达节点）
RECEIVED     已到达指定节点（形成供给）
CLOSED       已关闭（成本锁定，不可再修改）
CANCELLED    已取消

各状态的业务含义
1️⃣ DRAFT

尚未确认给供应商

可修改：

商品

数量

基础价

折扣 / 补差 / 费用

汇率

不产生任何库存/供给

2️⃣ ORDERED（关键节点）

已确认下单

成本口径锁定点

使用 orderedAt 对应汇率（你已选 1A）

可以：

生成“在途供给”

绑定 OrderLine（为单采购）

仍允许：

小范围调整（可选，取决于实现）

不建议修改基础价（除非回到 DRAFT）

3️⃣ INBOUND

采购已发货/在途中

业务含义：

供给已存在，但不可售

对库存的影响：

不生成可售库存

仅作为“在途供给”参与补货/缺货判断

4️⃣ RECEIVED（供给形成节点）

这是最重要的业务分界点。

到达的“节点”由你配置决定，例如：

集运仓

中国仓

日本仓

一旦进入 RECEIVED：

必须执行以下之一：

全新 → 生成 InventoryLot

中古 → 生成 ItemUnit

使用已分摊、已确定的 finalUnitCost

写入 StockLedger（入库流水）

⚠️ 注意：
RECEIVED ≠ 一定是日本仓入库
它只是“供给已形成、可用于履约”的标志。

5️⃣ CLOSED

采购完成

成本完全锁定

不允许：

修改价格

修改分摊

修改汇率

用于历史报表与审计

三、为订单采购（先卖后买）流程
业务背景

在直发模式下，经常出现：

客户先下单

再去采购对应商品

采购专门用于履约该订单

核心设计原则

OrderLine 是需求

PurchaseLine 是供给

二者通过显式关联绑定

数据关联规则

PurchaseLine.linkedOrderLineId

一个 OrderLine：

可以绑定 1 条 PurchaseLine（最常见）

或多条（拆单采购，V2）

PurchaseLine 若绑定 OrderLine：

默认不进入“可售库存池”

直接作为该订单的履约供给

状态联动（OrderLine × PurchaseLine）
1️⃣ 客户下单

OrderLine.supplyStatus = UNFULFILLED

2️⃣ 创建采购单并绑定

PurchaseLine.linkedOrderLineId = OrderLine.id

OrderLine.supplyStatus → PURCHASE_REQUESTED

3️⃣ 采购进入 INBOUND

OrderLine.supplyStatus → PURCHASED_INBOUND

4️⃣ 采购 RECEIVED

供给形成（Lot 或 ItemUnit）

OrderLine.supplyStatus → READY_TO_SHIP

5️⃣ 发货完成

OrderLine.supplyStatus → CONSUMED

不进入通用库存（直发）

取消/异常处理（必须写清楚）
订单取消，但采购尚未 ORDERED

删除/解绑 PurchaseLine

无库存影响

订单取消，但采购已 ORDERED / INBOUND

选择策略（配置项）：

A. 转为通用库存（推荐）

B. 标记为异常供给（人工处理）

四、成本分摊规则（定稿）
成本组成

商品基础价（PurchaseLine.baseUnitPrice）

订单级调整（DISCOUNT / SURCHARGE）

订单级费用（PACKING / SERVICE / DOMESTIC_SHIPPING）

默认分摊方式

按金额比例分摊（PROPORTIONAL_BY_AMOUNT）

尾差规则：

归到 baseAmount 最大的 PurchaseLine

手动分摊

支持 MANUAL 覆盖

优先级高于自动分摊

五、汇率规则（定稿）
成本口径

使用 orderedAt 当天汇率

汇率引用固化到：

PurchaseOrder

InventoryLot / ItemUnit

财务口径

实际结算、换汇差异由 LedgerEntry 表示

不影响历史库存成本

六、必须遵守的系统约束（硬规则）

PurchaseOrder 一旦 CLOSED，不可再改任何成本相关字段

InventoryLot / ItemUnit 的 unitCost 一旦生成不可修改

为单采购必须显式绑定 OrderLine

RECEIVED 是供给形成的唯一合法节点

所有金额使用 Decimal，不允许 String

所有采购数据必须带 storeId（SaaS 预留）

七、第一阶段不做（明确写死）

按重量分摊（仅预留字段）

拆单采购（一个 OrderLine 多 PurchaseLine）

供应商账期管理

自动对接物流 API

八、后续模块联动说明

库存模块：监听 RECEIVED → 写 StockLedger

物流模块：INBOUND/RECEIVED 由 Shipment 状态驱动

销售模块：OrderLine.supplyStatus 只读，由采购/物流推进

财务模块：ORDERED/RECEIVED 生成应付账款流水

✅ 文档状态

版本：v1（新项目基线）

可直接用于：

Kiro Spec → Design

数据模型设计

API 设计

前端流程设计