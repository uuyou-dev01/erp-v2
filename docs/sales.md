销售模块（Sales）— 混合订单 / 库存分配 / 成本分摊设计（v1）

本文档定义新项目中 销售模块的完整业务规则，重点覆盖：

多 SKU / 批量购买 / 混合全新与中古

订单级优惠与费用分摊

库存分配（Allocation）机制

与库存 / Listing / 财务模块的联动

设计目标：订单结构清晰、库存扣减可追溯、利润计算可信。

一、销售模块的定位
销售模块负责什么

记录“卖了什么、卖给谁、卖了多少钱”

管理订单级优惠、平台手续费、运费等费用

决定订单如何消耗库存

作为 Listing 联动与财务入账的触发点

销售模块不负责什么

❌ 不负责库存聚合（由 StockLedger 负责）

❌ 不负责采购逻辑（由 Procurement 负责）

❌ 不直接计算最终财务利润（由 Finance 汇总）

二、订单结构设计（支持混合购买）
1️⃣ CustomerOrder（订单头）

订单头代表一次对外交易（平台订单/客户订单）：

id, storeId

platformId

externalOrderNo

currency

subtotal（订单行合计，缓存）

discountTotal（订单级优惠，允许负数）

shippingCharged（向客户收取的运费）

totalPaid（客户实付总额）

orderStatus：

DRAFT
PLACED
PAID
CONFIRMED
SHIPPED
DELIVERED
RETURNED
CANCELLED


createdAt / confirmedAt

⚠️ 订单头不记录利润，只记录交易事实。

2️⃣ OrderLine（订单行）

一行代表买家购买的一个 SKU（不区分全新/中古）：

orderId

skuId

quantity

unitPrice（成交单价，可为空）

lineAmount（缓存）

supplyType：

FROM_STOCK
PURCHASE_FOR_ORDER


supplyStatus：

UNFULFILLED
ALLOCATED_FROM_STOCK
PURCHASE_REQUESTED
PURCHASED_INBOUND
READY_TO_SHIP
CONSUMED


中古商品依然通过 OrderLine 表示，差异体现在库存分配阶段。

SKU 与 ItemUnit 的账务关系：

- OrderLine.skuId 始终是商品、收入、费用分摊和销售统计维度。
- 即使销售的是某个中古/瑕疵单件，也不把 ItemUnit 当成独立商品行。
- ItemUnit 只在 Allocation 阶段提供具体库存身份、冻结成本、照片/标签追踪和履约定位。
- SKU 详情页可展示利润参考；正式财务口径以 OrderAllocation 与报表中的成本换算为准。

三、库存分配（Allocation）—— 销售模块的核心
为什么必须有 Allocation？

支持：

全新 + 中古混合

多 SKU 批量购买

同一行从多个 Lot 扣

保证：

成本结转准确

退货/取消可回滚

Listing 联动可定位到具体库存

OrderAllocation（库存分配表）

orderLineId

allocationType：

LOT
ITEM_UNIT


lotId?

itemUnitId?

quantity（Lot 扣减数量；ItemUnit 固定 1）

unitCost（从 Lot / ItemUnit 固化成本带入）

costAmount（缓存：quantity * unitCost）

分配规则

订单确认（CONFIRMED）前，必须完成 Allocation

全新：

默认 FIFO 分配 Lot

允许手动调整

中古：

必须明确绑定 ItemUnit

ItemUnit 同一时间只允许被一个 Allocation 占用

四、批量购买 & 订单级优惠 / 费用分摊
适用场景

多 SKU 批量购买

混合全新/中古

平台只给总优惠（-100）

平台手续费按订单结算

Fee（销售侧费用模型）

统一使用 Fee 表（与采购一致）：

refType = CUSTOMER_ORDER | ORDER_LINE

feeType：

DISCOUNT
PLATFORM_FEE
SHIPPING_COST
PACKING_FEE
TAX


amount（Decimal，可正可负）

currency

allocationMethod：

PROPORTIONAL_BY_AMOUNT
MANUAL


allocationBasis（预留）：

AMOUNT
QTY
WEIGHT

分摊规则（已定稿）
默认规则（你已确认）

订单级优惠（DISCOUNT）：按订单行成交金额比例分摊（1A）

平台手续费（PLATFORM_FEE）：按订单行成交金额比例分摊（2A）

尾差处理：

归到成交金额最大的 OrderLine

保证总额精确一致

分摊结果落点

OrderLine.allocatedDiscount

OrderLine.allocatedFee

行级可得：

行收入 = lineAmount + allocatedDiscount
行成本 = sum(OrderAllocation.costAmount)
行利润 = 行收入 - 行成本 - allocatedFee

平台不给行价怎么办？

允许：

OrderLine.unitPrice = NULL

订单头先保存 totalPaid

后台提供“拆分工具”：

按 RefPrice 比例

按 Listing 价比例

或手动填写

拆分完成后再计算分摊

五、订单确认与库存扣减（强约束）
订单确认（CONFIRMED）前必须完成：

OrderLine 创建完成

所有 OrderLine 完成 Allocation

校验库存可用性

确认时系统行为（原子逻辑）

写入 OrderAllocation

写入 StockLedger（出库）

更新 OrderLine.supplyStatus

触发 ListingAlert（异步）

❗ 不允许：

已确认订单但未扣库存

已扣库存但订单未确认

六、Listing 联动规则（提醒模式）
售出触发点

Order 状态进入 CONFIRMED

或 OrderAllocation 写入成功

联动行为

中古 ItemUnit：

同 itemUnitId 的其它 active listings → 生成 DELIST_REQUIRED 提醒

全新 SKU：

可用库存下降

若 activeListedQty > availableQty → 生成超卖风险提醒

七、退货 / 取消（v1 最小规则）
订单取消（未 CONFIRMED）

直接删除 Order / OrderLine

不产生库存影响

已确认订单退货

标记 OrderStatus = RETURNED

对应 OrderAllocation：

Lot → qty 回滚

ItemUnit → 回到可售或“退货检验”状态

写入负向 LedgerEntry（财务模块处理）

八、与其他模块的联动
→ 库存模块

Allocation → StockLedger（唯一扣库存入口）

→ 采购模块

OrderLine.supplyType = PURCHASE_FOR_ORDER

触发采购并绑定 PurchaseLine

→ 财务模块

CONFIRMED → 生成应收账款

平台手续费 → 生成费用流水

回款/结汇 → 独立处理

→ 通知模块

ListingAlert

超卖风险提醒

九、系统硬约束（必须遵守）

订单 CONFIRMED 前必须完成 Allocation（你已选 3A）

ItemUnit 只能被一个 Allocation 占用

所有金额使用 Decimal

所有销售数据必须带 storeId

分摊结果一旦确认写缓存，历史不可漂移

十、第一阶段不做（明确排除）

自动对接平台 API 拉明细

按重量分摊销售运费

复杂 Bundle / 组合商品

自动重新上架（只提醒）

文档状态

模块：Sales

版本：v1（新项目基线）

用途：

Kiro Spec（Design）

数据模型 & API 设计

前端流程实现
