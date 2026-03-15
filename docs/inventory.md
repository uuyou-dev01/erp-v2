库存/仓储模块（Inventory & Warehouse）— Lot / ItemUnit / StockLedger / Split 状态机（v1）

本文档定义新项目 库存/仓储模块 的完整业务规则与状态机，覆盖：

Location（仓库节点）

InventoryLot（全新批次）

ItemUnit（中古/瑕疵单件）

StockLedger（库存流水真相源）

InventorySplit（拆分事件：端盒拆单盒等）

设计目标：库存变化可追溯、成本不漂移、跨业务模式一致、支持多人协作与未来 SaaS。

一、核心原则（必须遵守）

库存变化只能通过 StockLedger 发生（任何入库/出库/调整/拆分/调拨都必须写流水）

全新用 Lot + qty 管理；中古/瑕疵用 ItemUnit 单件管理

成本（unitCost）在库存形成时固化，不允许后改（避免历史漂移）

Location 是事实位置；可售性由 “位置 + 状态 + 分配情况”共同决定

拆分（Split）是显式事件：父库存被消耗，子库存被生成（无隐式“变形”）

二、Location（仓库节点）模型
Location 定义

Location 是“货所在的节点”，不仅是仓库货架，也可以是集运仓/朋友仓/在途节点。

建议字段：

id, storeId

code（CN_STOCK / CN_FORWARDER / JP_STOCK / FRIEND_STOCK / TRANSIT 等）

name

type：

WAREHOUSE（可存放）

FORWARDER（集运仓）

PERSON（朋友/代卖人持有）

TRANSIT（在途逻辑节点，可选）

isSellableDefault（默认是否可售）

日本仓/朋友仓通常 true

集运仓/在途通常 false（可配置）

注：是否可售最终取决于库存对象的状态，但 Location 可提供默认策略。

三、库存对象：InventoryLot vs ItemUnit
1) InventoryLot（全新批次）

用途：完全一致的新品库存，按数量管理。

建议字段：

id, storeId

skuId

locationId

qtyOnHandSnapshot（可选缓存，真相源仍是 ledger 汇总）

unitCost（Decimal，固化）

costCurrency

fxRateId?（用于成本口径追溯）

sourceType/sourceId（通常来自 PurchaseLine 或 Split）

receivedAt

status（简化即可，见状态机）

Lot 适合：

鞋服全新同码同款

单盒盲盒（若你不需要追踪每一盒的差异）

2) ItemUnit（中古/瑕疵单件）

用途：需要“单件差异追踪”的库存（成色、瑕疵、编号、照片）。

建议字段：

id, storeId

skuId

locationId

unitCost（Decimal，固化）

costCurrency

fxRateId?

conditionGrade?（也可放属性体系）

photos[]

ownerId（货主）

holderId（当前持有/代卖）

status（简化即可，见状态机）

sourceType/sourceId（PurchaseLine 或 Split）

ItemUnit 适合：

中古球鞋、瑕疵品

单件有差异的收藏品/饰品

盲盒“已拆并确定款式”的单件（如果你要追踪每盒照片/成色）

四、库存真相源：StockLedger（库存流水）
1) 为什么必须用 StockLedger？

支持可追溯审计

支持并发与回滚（取消/退货）

支持拆分/调拨/分配等复杂操作，而不会靠 status 拼凑

2) StockLedger 设计（推荐）

字段建议：

id, storeId

occurredAt

entityType：

LOT

ITEM_UNIT

entityId（lotId 或 itemUnitId）

locationId（变化发生在哪个节点）

deltaQty（Lot 用：+/-；ItemUnit 可用 +1/-1 或固定规则）

reason（枚举，见下）

refType/refId（关联业务来源：PurchaseLine/OrderLine/Split/Adjustment/Transfer/Shipment）

meta（JSON）

3) Ledger Reason（建议枚举）

INBOUND_PURCHASE（采购入库）

OUTBOUND_SALE（售出出库）

ALLOCATE / DEALLOCATE（分配/释放）

ADJUST（盘点调整）

TRANSFER_OUT / TRANSFER_IN（调拨）

SPLIT_OUT / SPLIT_IN（拆分消耗/拆分生成）

RETURN_IN / RETURN_OUT（退货入库/退货出库）

HOLD / UNHOLD（锁定/解除锁定，可选）

MVP 至少要有：PURCHASE、SALE、ADJUST、TRANSFER、SPLIT、ALLOCATE

五、库存状态机（Lot / ItemUnit）

注意：状态机是“业务视图”，最终数量以 ledger 汇总为准。

1) Lot 状态（建议最小集合）
ACTIVE        可参与分配（是否可售由 Location & 分配决定）
RESERVED      已分配给订单（可通过 ledger ALLOCATE 表示，不一定需要字段）
CONSUMED      qty=0（可由汇总结果推导）


Lot 的“可售”计算：

availableQty = onHandQty - allocatedQty - heldQty

2) ItemUnit 状态（建议最小集合）
AVAILABLE      可售/可分配
ALLOCATED      已分配给订单（待发货）
CONSUMED       已售出
RETURN_CHECK   退货检验中（可选）


ItemUnit 的状态可以作为业务快捷字段，但仍应以 Allocation + ledger 作为真相校验。

六、库存分配（Allocation）与库存视图
分配的定位

分配不等于出库。分配是“把库存锁给某张订单”。

分配发生：订单确认前（你已选择 3A 必须先分配）

出库发生：订单 CONFIRMED 时写 OUTBOUND_SALE

建议做法：

Allocation 表在 Sales 模块中（OrderAllocation）

StockLedger 同步写入 ALLOCATE/DEALLOCATE（Lot 用 deltaQty；ItemUnit 用状态/标记）

库存视图需展示：

OnHand（在库）

Allocated（已分配）

Inbound（在途供给：来自采购/物流）

Available（可用）

七、拆分机制：InventorySplit（通用解决“端盒拆单盒”等）
1) 拆分不是盲盒特例

拆分是一种通用库存操作：

端盒 → 单盒

礼盒 → 单品

大包装 → 小包装

拆机 → 配件

2) 拆分事件模型（v1）
InventorySplit（拆分事件）

id, storeId

splitType：UNBOX / DISASSEMBLE / CUSTOM

sourceType：LOT | ITEM_UNIT

sourceId

occurredAt

totalSourceCost（从 source 成本带入）

allocationMethod（默认：按数量平均）

createdById

InventorySplitLine（拆分明细）

splitId

targetType：LOT | ITEM_UNIT

targetId

quantity（Lot 的 qty；ItemUnit 固定 1）

allocatedCost（分摊成本）

3) 拆端盒（一次性拆完）标准流程（你已明确业务规则）

父库存从 1 → 0，子库存一次性生成 12（不存在“拆一半”）

流程：

校验 source（端盒 Lot/ItemUnit）在指定 Location 且可操作

写 StockLedger: SPLIT_OUT（source delta 变为 -1 或 qty 清零）

创建 InventorySplit 记录

生成子库存：

方案 A：生成一个 Lot（sku=单盒，qty=12）【全新更推荐】

方案 B：生成 12 个 ItemUnit（sku=单盒）【需要单盒级追踪时用】

写 StockLedger: SPLIT_IN（子库存 +12 或 +1×12）

成本分摊：

默认：按数量平均分摊

子 unitCost = totalSourceCost / totalTargetQty

尾差归到最后一个 target（或最大 qty 的 target）

推荐默认：端盒 Lot -> 单盒 Lot qty=12（除非你需要给每盒拍照/记录差异）

八、调拨（Transfer）与多仓流转（最小规则）
1) 调拨的定义

货从一个 Location 到另一个 Location，不改变“库存身份”，只改变位置。

2) 推荐模型

Transfer（调拨单）

TransferLine（Lot qty 或 ItemUnit）

落 ledger：

TRANSFER_OUT（fromLocation）

TRANSFER_IN（toLocation）

在途可选：如果你想要“在途状态”，可以在 Transfer 上维护 IN_TRANSIT 状态，库存可用性取决于你是否把在途视为不可售。

九、Owner / Holder（多人协作基础）
概念

Owner：货主（谁的货）

Holder：当前持有/代卖者（谁在卖/谁手上）

适用对象：

ItemUnit 必须有 owner/holder（代卖最常见）

Lot 可选（如果你需要把一批货寄售给朋友）

规则建议（v1）：

holder 变化必须可追溯（写活动日志或 ledger meta）

默认：只有 holder 所在的用户/团队可操作 listing 和发货（权限模块细化）