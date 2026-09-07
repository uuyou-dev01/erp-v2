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

costAmount（缓存：quantity \* unitCost）

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

十、打包出售（一单一包）

适用场景

客户同时购买多条在售 Listing，平台侧只产生一笔成交和一个订单号，仓库把多件商品装入同一个物理包裹发出。

必须区分两个判断：

- 交易能否合成一张订单：同一销售渠道账号、同一平台、同一币种，并有明确收货目的地。
- 库存能否合成一个包裹：所有明细在同一个真实 `Location.id` 有足量可用库存；该仓具备 `DIRECT_FULFILLMENT` 能力和到目的地的有效配送线路。

货主、库存来源和是否代卖，不直接决定物理上能否装入同一个包裹。它们决定系统是否具备正确的预留与结算链路。

实现时将三个维度分开保存，不能用“是不是自己的货”推断另外两个维度：

- `SalesChannelAccount`：这笔客户交易归哪个销售账号，决定平台订单、收款和账号操作权限。
- `Location` 与 `operatorOrganizationId`：货现在实际在哪里、谁负责打包发货，决定能否共用一个包裹和发货任务。
- `InventoryPool` 与供货/代卖来源：货权属于谁、从哪条协议取得，决定库存预留、成本与组织间结算。

因此，“我的货放在对方仓”与“对方的货放在我方仓”都不能只按合作关系判断；系统必须逐条读取当前实物仓位，再独立核验账号权限、库存池权限和履约协议。

当前可执行边界

| 场景                                 | 物理上可合包 | 当前系统是否允许创建普通打包单 | 原因                                                                              |
| ------------------------------------ | ------------ | ------------------------------ | --------------------------------------------------------------------------------- |
| 销售主体自有库存，全部在本方运营仓   | 是           | 是                             | 可直接分配并生成一张发货任务                                                      |
| 销售主体自有库存，全部在合作方运营仓 | 是           | 条件允许                       | 需有效组织连接、在有效期内且覆盖库存池/仓位的履约协议，以及可领取任务的仓库协作者 |
| 合作方库存放在本方仓                 | 是           | 暂不允许                       | 必须按订单行记录供货方、预留和结算，不能误记为自有库存                            |
| 自有库存与代卖库存混合且同仓         | 是           | 暂不允许                       | 当前订单行缺少逐行代卖来源与结算快照                                              |
| 商品分别位于不同仓                   | 否           | 不允许作为“一单一包”           | 必须拆成多个包裹并分别计算邮费                                                    |

上表中的“条件允许”只表示系统会校验库存授权，并把发货任务派给合作仓。本阶段不会自动计算合作仓履约服务费、代垫运费或组织间结算；这些费用仍需线下确认并在结算时录入。

普通打包单的强校验顺序

1. 至少选择两条不同且在售的 Listing。
2. 每条 Listing 必须关联同一个明确、启用中的 `SalesChannelAccount`，当前用户必须具备该账号的 `ChannelAccess`。
3. 平台、币种和客户目的地必须明确且一致。
4. 所选仓必须是同一个真实 `Location.id`，具备直接履约能力和目的地配送线路。
5. 最终分配的每个 `InventoryLot` / `ItemUnit` 都必须属于销售账号组织的有效库存池，且当前操作人必须拥有该库存池的对象级权限。
6. 若仓库由另一组织运营，必须同时具备有效合作关系、履约协议和仓库执行人。
7. 同时扣除普通订单预留与代发履约预留，避免同一单件或批次库存被重复占用。
8. 订单、明细、库存分配和发货任务在同一数据库事务内创建；客户端请求号作为幂等订单号，重试不得重复销售。

弹窗中的“共同发货仓”不是前端按仓名做简单交集：选择目的地或修改数量后，必须调用服务端预检并返回当前真正可选的 `Location.id`。预检通过只代表此刻可行，提交事务仍需加锁并按上述规则再次校验，避免预检后库存或权限发生变化。

成交价入库

- 订单头保存本次打包最终成交总额。
- 每条 `OrderLine` 保存分摊成交额；默认按 Listing 参考金额比例分摊，也允许人工调整。
- 分摊金额先统一到数据库 4 位小数，再强制校验明细合计等于订单总额。
- 例如 A 上架价 3000、B 上架价 2000，打包成交 4500，按比例分摊为 A 2700、B 1800。库存成本仍从各自实际 `OrderAllocation` 读取，不会因为打包而混在一起。

邮费入库

- 不继承、相加或相减各 Listing 的默认邮费。合包后的尺寸、重量和承运方式可能变化。
- 创建订单时不填邮费：`shippingFee = 0`，`shippingFeeStatus = PENDING`，含义是“未知”，不是实际 0。
- 创建订单时填写邮费：`shippingFeeStatus = ESTIMATED`。
- 订单结算时必须录入或确认实际邮费，之后写为 `ACTUAL`；若原状态为 `PENDING`，实际为 0 也必须明确输入 0。
- 报表遇到 `PENDING` 或 `ESTIMATED` 邮费时必须提示利润尚未最终确认；只有 `ACTUAL` 才能表述为实际邮费。

后续完整模型

若下一阶段仍严格限定“同一账号、同一真实仓、同一仓库运营方、一个包裹、一个运单”，支持自有库存与多方代卖同仓合包暂时不必新增包裹表，但必须先补齐逐行来源关系：`OrderLine.listingId`、`OrderLine.resaleListingId`、`FulfillmentRequest.orderLineId`、`SupplyReservation.orderLineId`。自有行继续使用 `OrderAllocation`；代卖行分别创建 `SupplyReservation`、`FulfillmentRequest` 与 `FulfillmentInventoryAllocation`，但整单只生成一个仓库发货任务，并由订单级原子动作一次消费两类库存。

代卖行结算必须读取打包后 `OrderLine.lineAmount`，不能继续使用原 Listing 目标价；一个包裹的邮费只写一次 `CustomerOrder.shippingFee`，再按订单行/履约请求分摊，不得向每条代卖请求重复记整笔邮费。任一货主的预留、协议或仓库执行条件失效时，整包都不能发出。

只有要支持“一张客户订单、多仓多包裹、部分发货”时，才需要增加 `Shipment/FulfillmentGroup` 及包裹明细，记录每包的仓库、运营组织、承运商、运单号、尺寸、重量、预估/实际邮费和状态，并由全部包裹聚合订单状态。

十一、第一阶段不做（明确排除）

自动对接平台 API 拉明细

按重量分摊销售运费

一张订单拆为多仓多包裹

自有库存与代卖库存的混合打包结算

按包裹重量或体积分摊销售运费

自动重新上架（只提醒）

文档状态

模块：Sales

版本：v1（新项目基线）

用途：

Kiro Spec（Design）

数据模型 & API 设计

前端流程实现
