# 货盘市场与代卖协作改造蓝图

## 目标

把当前系统从“只管理我自己的库存、上架、销售”升级为“既能管理自有库存，也能发布货盘给别人卖，并从别人的货盘中选择商品进行代卖”的多账号、多店铺、多合作方 ERP。

这次改造不推翻现有采购、库存、Listing、销售订单链路。现有系统中：

- `InventoryLot / ItemUnit / StockLedger` 继续作为自有库存和托管入库库存的真相源。
- `Listing` 继续表示“我把某个商品上到了某个平台”。
- `CustomerOrder / OrderLine / OrderAllocation` 继续表示我店铺内的销售订单和自有库存分配。

新增的是一层“供给/货盘”与一层“代卖/代发/结算”。

## 关键结论

当前 `/inventory/sellable` 承接的是“我有什么货”，它必须继续保持私有库存统计。未来“货盘市场”承接的是“我和别人有什么可卖的供给”，其中别人的货不能进入我的库存统计，只能进入我的可售来源或代卖记录。

KingCommerce 可以借鉴的是角色拆分：

- 商品/库存持有人
- 上架人
- 销售人
- 发货人
- 销售记录
- 发货请求
- 回款/结算状态

但不能照搬它把多条上架记录放在商品数组里的结构。`erp-v2` 应该使用关系表，每个环节都有独立 ID，避免后续出现同 SKU 多记录串单、委托人残留、扣错仓库的问题。

## 2026-08-02 库存、账号与经营主体口径

本节覆盖本文中更早的“店铺货盘”假设，是当前实现的正式口径。

### 归属边界

- `SupplyOffer` 属于 `Organization`（经营主体），不是仓库，也不是某一个销售账号。
- `InventoryPool` 是货盘所引用的库存池；`Location` 只在履约分配时决定从哪里发货。
- `SupplyOfferChannel` 表示某个内部销售账号或外部代卖合作方获得的销售授权。
- 一个经营主体下的多个店铺/账号可以共享同一货盘，不通过复制库存制造多份可售数。

### 默认共享库存

- 发布货盘、授权账号、创建代卖 Listing 都不占库存。
- 同一批 5 件库存可以授权给远多于 5 个账号上架，每个账号的曝光数量也可以高于 5。
- 混合 SKU 货盘的每条代卖记录必须绑定一条 `SupplyOfferItem`；预留和履约只会分配该明细对应的 SKU/单品，不能跨明细串货。
- 成交创建订单时，事务内锁定货盘与 SKU，并立即创建真实库存分配。
- 取消或拒绝履约时释放货盘预留和真实库存分配。
- 发货时写出库流水、减少货盘剩余量；耗尽后暂停货盘并把代卖 Listing 标记为售罄。

### 可选保证配额

- 渠道默认使用 `SHARED`，只消费未保护的共享余量。
- 需要承诺库存时可改为 `GUARANTEED` 并设置数量和到期时间。
- 保证配额的未下单余额会从直营可售库存以及其他共享渠道的可接单库存中隔离。
- 保证配额不是复制库存；保证订单已锁定的真实库存与尚未下单的配额余额之和，始终构成该渠道的总保护量。
- 为避免混合货盘无法判断配额属于哪一项，首版保证配额仅支持单一 SKU 的批量货盘。

### 费用与履约拆分

- 供货价、代卖佣金、代发服务费、运费分别记录和结算。
- 佣金支持比例、按件固定金额和混合方式，不再从“售价减供货价”的利润差额反推。
- `providerOrganizationId` 表示实际履约主体；跨主体代发必须存在有效 `ServiceAgreement`。
- 仓库不拥有货盘，只是由履约主体运营、在订单创建后被选择的出库节点。

## 术语边界

| 术语 | 含义 | 是否进入我的库存统计 |
| --- | --- | --- |
| 自有库存 | 我采购、入库、由我承担成本的 Lot/ItemUnit | 是 |
| 托管/寄售入库 | 货权可能属于别人，但实物由我保管并进入仓库管理 | 是，但必须标记货权方 |
| 货盘供给 | 被包装出来、可被别人看到和选择销售的商品供给 | 否，除非来源是我自己的库存 |
| 别人货盘 | 其他店铺/合作方发布出来的供给 | 否 |
| 我的代卖 | 我从别人货盘选择后，准备用自己的平台账号销售的记录 | 否 |
| 代发任务 | 成交后请求货主、仓库或代发方发货的协作任务 | 否 |
| 结算单 | 对供货款、佣金、代发费、平台费、汇率进行确认的财务凭证 | 否 |

## 推荐导航

### 工作台

保留：

- `/workbench`：今日待办。
- `/notifications`：通知。
- `/workbench?queue=exception`：异常中心。

新增队列：

- `offerDraft`：货盘草稿待发布。
- `resaleToList`：代卖草稿待上架。
- `supplyReservation`：代卖成交后待供货确认。
- `fulfillmentRequest`：代发任务待处理。
- `settlementPending`：结算待确认。

### 库存与商品

保留：

- `/inventory/sellable`：库存看板，只展示我的真实可售库存。
- `/inventory/skus`：商品主档。
- `/inventory/items`：单件库存。
- `/inventory/lots`：库存批次。
- `/inventory/stocktake`：库存盘点。

`/inventory/sellable` 页面文案从“货盘”统一改成“库存看板 / 我的可售库存”。该页面可以有“发布为货盘”的入口，但不展示别人货。

### 货盘与代卖

新增导航分组：

- `/marketplace`：货盘市场。
- `/marketplace/my-offers`：我发布的货盘。
- `/resale`：我的代卖。

### 上架与订单

保留：

- `/listing`：上架运营，第一阶段仍以自有 Listing 为主。
- `/sales`：销售订单。

第二阶段以后 `/listing` 增加来源筛选：

- 自有库存上架。
- 代卖上架。
- 寄售库存上架。

### 履约协作

新增：

- `/fulfillment/requests`：代发任务。

### 财务

新增：

- `/finance/settlements`：结算中心。

### 设置

新增：

- `/settings/partners`：合作方。

## 数据模型设计

### Partner

合作方档案。可以表示供货方、分销方、代发方、结算对象、外部公司或个人。

建议字段：

- `id`
- `organizationId`
- `storeId?`
- `name`
- `type`: `SUPPLIER | DISTRIBUTOR | FULFILLMENT | CUSTOMER | INTERNAL | OTHER`
- `contactName`
- `phone`
- `email`
- `wechat`
- `companyName`
- `defaultCurrency`
- `settlementMethod`
- `status`: `ACTIVE | INACTIVE`
- `notes`
- `createdAt`
- `updatedAt`

CRUD：

- 新增合作方。
- 编辑合作方。
- 停用合作方。
- 查看详情。
- 查看与该合作方相关的货盘、代卖、代发、结算。

### TradingRelationship

定义当前店铺与合作方之间的商业关系和默认规则。

建议字段：

- `id`
- `organizationId`
- `storeId`
- `partnerId`
- `relationshipType`: `SUPPLIER | RESELLER | DROPSHIPPER | FULFILLMENT_PARTNER | CONSIGNOR | CONSIGNEE`
- `visibilityScope`: `PRIVATE | ORGANIZATION | PARTNER_ONLY | PUBLIC`
- `canViewCost`
- `canViewStockQty`
- `canDownloadPhotos`
- `canCreateResaleListing`
- `canRequestFulfillment`
- `defaultCommissionType`: `NONE | FIXED | PERCENT | MARGIN_SPLIT`
- `defaultCommissionValue`
- `defaultSettlementCurrency`
- `defaultSettlementDays`
- `status`

CRUD：

- 给合作方新增关系。
- 修改权限。
- 修改默认佣金。
- 修改账期。
- 停用关系。

### SupplyOffer

货盘主表。表示“可以被别人看到、选择、代卖或询价的供给”。

建议字段：

- `id`
- `organizationId`
- `ownerStoreId`
- `publisherUserId`
- `sourceMode`: `OWN_INVENTORY | CONSIGNMENT_STOCK | EXTERNAL_SUPPLY | MANUAL`
- `title`
- `description`
- `category`
- `tags`
- `photos`
- `currency`
- `supplyPrice`
- `suggestedRetailPrice`
- `minRetailPrice`
- `minOrderQty`
- `availableQty`
- `reservedQty`
- `soldQty`
- `locationText`
- `fulfillmentType`: `OWNER_SHIPS | SELLER_SHIPS | THIRD_PARTY_SHIPS | CONTACT_ONLY`
- `defaultFulfillmentPartnerId?`
- `visibility`: `PRIVATE | ORGANIZATION | PARTNERS | PUBLIC`
- `status`: `DRAFT | ACTIVE | PAUSED | SOLD_OUT | DELISTED | EXPIRED`
- `publishedAt`
- `expiresAt`
- `createdAt`
- `updatedAt`

状态规则：

- `DRAFT` 可编辑、可删除。
- `ACTIVE` 可被授权用户看到和加入代卖。
- `PAUSED` 不再允许新增代卖，但保留历史记录。
- `SOLD_OUT` 不允许新增代卖，详情可见。
- `DELISTED` 下架，不出现在市场列表。
- `EXPIRED` 自动过期，不出现在市场列表。

### SupplyOfferItem

货盘明细。一个货盘可以关联一个或多个库存项，或仅记录外部供给信息。

建议字段：

- `id`
- `offerId`
- `sourceType`: `SKU | LOT | ITEM_UNIT | EXTERNAL`
- `skuId?`
- `lotId?`
- `itemUnitId?`
- `externalSkuText?`
- `quantity`
- `unitCostSnapshot?`
- `costCurrency?`
- `metadata`

规则：

- 自有库存来源必须校验 `storeId`。
- 外部供给不能进入 `InventoryLot / ItemUnit`。
- 货盘展示使用快照，避免后续 SKU 名称变化导致历史货盘失真。

### OfferVisibility

定义哪些人可以看到货盘，以及能看到多深。

建议字段：

- `id`
- `offerId`
- `scopeType`: `PUBLIC | ORGANIZATION | STORE | PARTNER | USER`
- `scopeId?`
- `canViewPrice`
- `canViewAvailableQty`
- `canDownloadPhotos`
- `canCreateResaleListing`
- `canContactOwner`
- `createdAt`

CRUD：

- 添加可见对象。
- 批量添加合作方。
- 修改可见权限。
- 移除可见对象。

### ResaleListing

我从别人的货盘选择后形成的代卖记录。它是“我准备上到我的销售平台”的记录，不是我的库存。

建议字段：

- `id`
- `organizationId`
- `storeId`
- `offerId`
- `sellerUserId`
- `platformId?`
- `platformAccountText?`
- `titleSnapshot`
- `descriptionSnapshot`
- `photosSnapshot`
- `currency`
- `listedPrice`
- `expectedPlatformFee`
- `expectedShippingFee`
- `expectedGrossProfit`
- `quantity`
- `status`: `DRAFT | READY_TO_LIST | LISTED | SOLD_PENDING | FULFILLMENT_REQUESTED | SHIPPED | COMPLETED | PAUSED | DELISTED | CANCELLED`
- `listedAt`
- `delistedAt`
- `createdAt`
- `updatedAt`

状态规则：

- `DRAFT` 可编辑、可删除。
- `READY_TO_LIST` 信息完整但尚未上平台。
- `LISTED` 已在外部平台上架。
- `SOLD_PENDING` 已登记售出，等待锁定供给或生成代发。
- `FULFILLMENT_REQUESTED` 已请求发货。
- `SHIPPED` 已发货。
- `COMPLETED` 订单完成。
- `PAUSED` 暂停代卖。
- `DELISTED` 下架。
- `CANCELLED` 取消。

### SupplyReservation

代卖成交后，对货盘数量的锁定记录。借鉴 KingCommerce 的 `locked_quantity`，但独立建表。

建议字段：

- `id`
- `offerId`
- `resaleListingId`
- `orderId`
- `orderLineId`
- `quantity`
- `status`: `PENDING | RESERVED | RELEASED | CONSUMED | CANCELLED`
- `reservedAt`
- `releasedAt`
- `consumedAt`

规则：

- 创建销售订单时先尝试锁定。
- 锁定失败必须回滚销售登记。
- 取消订单必须释放锁定。
- 发货完成后变成 `CONSUMED`。

### FulfillmentRequest

代发任务。用于“销售方卖出，货主/仓库/代发方发货”。

建议字段：

- `id`
- `organizationId`
- `requesterStoreId`
- `fulfillmentStoreId?`
- `fulfillmentPartnerId?`
- `offerId`
- `resaleListingId?`
- `orderId`
- `orderLineId`
- `reservationId?`
- `recipientName`
- `recipientPhone`
- `recipientAddress`
- `shippingMethod`
- `shippingCode`
- `proofPhotos`
- `trackingNo`
- `carrier`
- `status`: `REQUESTED | ACCEPTED | PROOF_UPLOADED | SHIPPED | DELIVERED | REJECTED | CANCELLED | EXCEPTION`
- `exceptionReason`
- `requestedAt`
- `acceptedAt`
- `shippedAt`
- `deliveredAt`

状态规则：

- `REQUESTED`：销售方发起。
- `ACCEPTED`：发货方接受。
- `PROOF_UPLOADED`：发货方上传凭证，等待销售方确认。
- `SHIPPED`：确认发出。
- `DELIVERED`：完成。
- `REJECTED`：发货方拒绝。
- `CANCELLED`：销售方取消。
- `EXCEPTION`：缺货、地址问题、平台取件码问题等异常。

### Settlement / SettlementLine

结算中心。用于供货款、佣金、代发费、平台费、多币种。

建议字段：

`Settlement`：

- `id`
- `organizationId`
- `storeId`
- `partnerId?`
- `orderId?`
- `resaleListingId?`
- `status`: `DRAFT | CONFIRMED | PARTIALLY_PAID | PAID | VOID`
- `settlementCurrency`
- `baseCurrency`
- `totalReceivable`
- `totalPayable`
- `createdAt`
- `confirmedAt`
- `paidAt`

`SettlementLine`：

- `id`
- `settlementId`
- `lineType`: `PLATFORM_RECEIVABLE | PLATFORM_FEE | SUPPLY_PAYABLE | COMMISSION | FULFILLMENT_FEE | SHIPPING_FEE | FX_GAIN_LOSS | ADJUSTMENT`
- `direction`: `RECEIVABLE | PAYABLE`
- `partyType`: `STORE | PARTNER | PLATFORM`
- `partyId?`
- `amount`
- `currency`
- `fxRate`
- `baseAmount`
- `baseCurrency`
- `description`

## 页面设计与跳转

### 1. 库存看板

路由：`/inventory/sellable`

定位：我的真实可售库存。

保留功能：

- 查看可发货库存。
- 查看已有平台上架记录。
- 从这里添加自有库存上架。
- 登记自有库存售出。

新增功能：

- 在 SKU / Lot / ItemUnit 卡片增加“发布为货盘”。
- 如果该库存已经发布过货盘，显示“已发布货盘 N 个”。
- 点击“发布为货盘”跳转到 `/marketplace/new?sourceType=...&sourceId=...`。
- 点击“已发布货盘”跳转到 `/marketplace/my-offers?sourceId=...`。

不能做：

- 不显示别人货盘。
- 不把别人货盘算入可售库存。
- 不把代卖草稿算入库存数量。

### 2. 发布货盘

路由：`/marketplace/new`

入口：

- `/inventory/sellable` 的“发布为货盘”。
- `/marketplace/my-offers` 的“新建货盘”。

页面步骤：

1. 来源选择
   - 从自有 SKU、Lot、ItemUnit 选择。
   - 从外部供给手工录入。
   - 显示“自有库存”和“外部供给”的区别。

2. 商品信息
   - 标题。
   - 描述。
   - 类目。
   - 标签。
   - 图片。
   - 商品快照预览。

3. 数量与价格
   - 发布数量。
   - 供货价。
   - 建议售价。
   - 最低售价。
   - 币种。
   - 最小起订量。

4. 履约设置
   - 我发货。
   - 指定仓库/合作方发货。
   - 买家联系后线下确认。
   - 仅展示，不允许直接代卖。

5. 可见范围
   - 私密草稿。
   - 组织内。
   - 指定店铺。
   - 指定合作方。
   - 公开市场。

6. 结算规则
   - 固定供货价。
   - 差价归销售方。
   - 百分比佣金。
   - 固定佣金。
   - 代发服务费。
   - 默认结算币种。

提交动作：

- 保存草稿。
- 预览。
- 发布。
- 取消返回。

校验：

- 自有库存来源必须属于当前 store。
- 发布数量不能超过可用库存。
- 外部供给必须填写供货方或备注。
- 公开货盘必须有标题、图片、供货价、履约说明。

### 3. 我发布的货盘

路由：

- `/marketplace/my-offers`
- `/marketplace/my-offers/[id]`
- `/marketplace/my-offers/[id]/edit`

列表功能：

- 筛选：草稿、已发布、暂停、售罄、已下架、过期。
- 搜索：标题、SKU、类目、合作方。
- 统计：发布中数量、被代卖数量、已成交数量、待发货数量。

列表操作：

- 新建货盘。
- 编辑。
- 复制。
- 暂停。
- 恢复。
- 下架。
- 删除草稿。
- 查看代卖方。
- 查看成交订单。

详情功能：

- 基本信息。
- 来源库存。
- 可见范围。
- 价格规则。
- 履约规则。
- 结算规则。
- 被谁加入代卖。
- 哪些订单占用了货盘。
- 操作日志。

删除规则：

- `DRAFT` 可删除。
- `ACTIVE / PAUSED / SOLD_OUT / DELISTED` 不允许硬删除，只允许下架。
- 已有 `ResaleListing / SupplyReservation / Settlement` 的货盘不能删除。

### 4. 货盘市场

路由：

- `/marketplace`
- `/marketplace/[id]`

列表功能：

- 展示当前用户可见的货盘。
- 支持别人货盘和我的货盘混合显示。
- 卡片必须显示来源标签：
  - 我的货。
  - 别人货。
  - 可代卖。
  - 一件代发。
  - 仅询价。
  - 公开。
  - 指定合作。

筛选：

- 来源：我的、别人、公开、合作方。
- 类目。
- 地区。
- 币种。
- 价格区间。
- 履约方式。
- 是否可直接代卖。
- 是否有可见库存。

详情功能：

- 商品快照。
- 图片。
- 供货价和建议售价。
- 最小起订量。
- 履约方式。
- 货物所在地。
- 供货方公开信息。
- 可见库存。
- 结算说明。
- 下载图片。
- 收藏。
- 询价。
- 加入我的代卖。

权限：

- 无 `canViewPrice` 时不显示供货价。
- 无 `canViewAvailableQty` 时只显示“有货/需确认”。
- 无 `canDownloadPhotos` 时禁用下载。
- 无 `canCreateResaleListing` 时不显示“加入我的代卖”。

### 5. 加入我的代卖

入口：`/marketplace/[id]` 的“加入我的代卖”。

动作：

1. 创建 `ResaleListing` 草稿。
2. 跳转 `/resale/[id]/edit`。

创建时保存快照：

- 货盘标题。
- 图片。
- 描述。
- 供货价。
- 币种。
- 履约方式。
- 结算规则。

失败场景：

- 货盘下架。
- 没有代卖权限。
- 可见库存不足。
- 合作关系停用。

### 6. 我的代卖

路由：

- `/resale`
- `/resale/[id]`
- `/resale/[id]/edit`

列表功能：

- 状态筛选：草稿、待上架、已上架、已售待发、待代发、已发货、已完成、已下架。
- 平台筛选。
- 来源货盘筛选。
- 合作方筛选。

详情功能：

- 来源货盘。
- 我的平台上架信息。
- 售价和预计利润。
- 平台费用。
- 履约方。
- 订单关联。
- 结算状态。

操作：

- 编辑草稿。
- 标记已上架。
- 暂停。
- 下架。
- 删除草稿。
- 登记售出。
- 查看来源货盘。
- 查看订单。
- 查看代发任务。
- 查看结算。

状态限制：

- `DRAFT` 可编辑、可删除。
- `LISTED` 可登记售出、暂停、下架。
- `SOLD_PENDING` 不能编辑核心价格，只能取消成交或继续履约。
- `FULFILLMENT_REQUESTED` 不能下架，只能取消订单或处理异常。
- `COMPLETED` 只读。

### 7. 上架运营

路由：`/listing`

第一阶段：

- 保持现有自有库存 Listing 功能。
- 不强行合并代卖，以避免破坏当前销售链路。

第二阶段：

- 增加来源筛选：
  - 自有库存。
  - 代卖货。
  - 寄售库存。
- `ListingOpsGrid` 显示来源标签。
- 代卖记录跳转到 `/resale/[id]`。
- 自有记录继续跳转到 `/listing/[id]`。

### 8. 代卖成交

入口：

- `/resale/[id]` 的“登记售出”。
- `/resale` 列表快捷操作。

流程：

1. 填写平台订单号、成交价、币种、买家信息、收货信息。
2. 创建 `CustomerOrder`。
3. 创建 `OrderLine`，`supplyType = FROM_SUPPLY_OFFER`。
4. 创建 `SupplyReservation`。
5. 如果履约方式是供货方/代发方发货，创建 `FulfillmentRequest`。
6. 如果履约方式是销售方发货，要求该货已经寄售入库或转成自有库存分配。
7. 跳转 `/sales/[orderId]`。

回滚规则：

- `SupplyReservation` 创建失败时，订单创建要回滚。
- `FulfillmentRequest` 创建失败时，订单保持草稿或进入异常，不得直接确认完成。
- 取消订单时释放 `SupplyReservation`。

### 9. 销售订单详情

路由：`/sales/[id]`

新增“供给来源”区域。

自有库存订单显示：

- SKU。
- Allocation。
- Lot / ItemUnit。
- 成本。
- 发货状态。

代卖订单显示：

- 来源货盘。
- 供货方。
- 销售方。
- 发货方。
- 锁定数量。
- 代发任务状态。
- 结算状态。

操作：

- 查看货盘。
- 查看代卖记录。
- 查看代发任务。
- 取消并释放锁定。
- 生成结算。
- 查看结算。

### 10. 代发任务

路由：

- `/fulfillment/requests`
- `/fulfillment/requests/[id]`

列表分组：

- 我需要发货。
- 别人帮我发货。
- 异常任务。
- 已完成。

详情内容：

- 商品信息。
- 来源货盘。
- 销售订单。
- 收件信息。
- 平台取件码/二维码。
- 发货要求。
- 图片凭证。
- 物流单号。
- 操作日志。

操作：

- 接受任务。
- 拒绝任务。
- 上传凭证。
- 确认发货。
- 标记异常。
- 取消。
- 完成。

状态流：

`REQUESTED -> ACCEPTED -> PROOF_UPLOADED -> SHIPPED -> DELIVERED`

异常状态：

- `REJECTED`
- `CANCELLED`
- `EXCEPTION`

### 11. 结算中心

路由：

- `/finance/settlements`
- `/finance/settlements/[id]`

列表功能：

- 按状态筛选：草稿、已确认、部分付款、已付款、作废。
- 按合作方筛选。
- 按币种筛选。
- 按订单筛选。

详情功能：

- 订单信息。
- 货盘信息。
- 代卖记录。
- 结算对象。
- 明细行。
- 汇率。
- 应收应付合计。

操作：

- 从订单生成结算。
- 编辑草稿。
- 确认结算。
- 标记付款。
- 作废。
- 导出。

结算明细类型：

- 平台应收。
- 平台手续费。
- 供货款。
- 分销佣金。
- 代发费。
- 运费。
- 汇兑损益。
- 手工调整。

多币种要求：

- 每行保存原币种金额。
- 每行保存本位币金额。
- 每行保存汇率。
- 每行保存汇率日期。
- 结算单保存结算币种。

## Server Actions 拆分

新增文件建议：

- `app/actions/partners.ts`
- `app/actions/supply-offers.ts`
- `app/actions/offer-visibility.ts`
- `app/actions/resale-listings.ts`
- `app/actions/supply-reservations.ts`
- `app/actions/fulfillment-requests.ts`
- `app/actions/settlements.ts`

每个文件必须提供完整 CRUD 或状态动作。

### partners.ts

- `getPartners`
- `getPartnerById`
- `createPartnerAction`
- `updatePartnerAction`
- `deactivatePartnerAction`
- `createTradingRelationshipAction`
- `updateTradingRelationshipAction`
- `deactivateTradingRelationshipAction`

### supply-offers.ts

- `getVisibleSupplyOffers`
- `getMySupplyOffers`
- `getSupplyOfferById`
- `createSupplyOfferDraftAction`
- `updateSupplyOfferAction`
- `publishSupplyOfferAction`
- `pauseSupplyOfferAction`
- `resumeSupplyOfferAction`
- `delistSupplyOfferAction`
- `copySupplyOfferAction`
- `deleteSupplyOfferDraftAction`

### offer-visibility.ts

- `getOfferVisibilityRules`
- `addOfferVisibilityAction`
- `batchAddOfferVisibilityAction`
- `updateOfferVisibilityAction`
- `removeOfferVisibilityAction`

### resale-listings.ts

- `getResaleListings`
- `getResaleListingById`
- `createResaleListingFromOfferAction`
- `updateResaleListingAction`
- `markResaleListingListedAction`
- `pauseResaleListingAction`
- `delistResaleListingAction`
- `deleteResaleListingDraftAction`
- `registerResaleSaleAction`

### supply-reservations.ts

- `createSupplyReservation`
- `releaseSupplyReservation`
- `consumeSupplyReservation`
- `cancelSupplyReservation`

These functions should usually be called inside transactions from order/resale flows, not directly from UI.

### fulfillment-requests.ts

- `getFulfillmentRequests`
- `getFulfillmentRequestById`
- `createFulfillmentRequest`
- `acceptFulfillmentRequestAction`
- `rejectFulfillmentRequestAction`
- `uploadFulfillmentProofAction`
- `confirmFulfillmentShippedAction`
- `markFulfillmentDeliveredAction`
- `markFulfillmentExceptionAction`
- `cancelFulfillmentRequestAction`

### settlements.ts

- `getSettlements`
- `getSettlementById`
- `generateSettlementFromOrderAction`
- `updateSettlementDraftAction`
- `confirmSettlementAction`
- `markSettlementPaidAction`
- `voidSettlementAction`
- `exportSettlementCsvAction`

## 权限规则

私有数据：

- 采购成本。
- 真实库存。
- StockLedger。
- 内部利润。
- 客户信息。
- 平台账号。
- 财务明细。

合作可见数据：

- 授权货盘。
- 代卖记录必要字段。
- 代发任务必要字段。
- 结算摘要和对应明细。

公开/市场可见数据：

- 货盘标题。
- 图片。
- 描述。
- 供货规则。
- 可见价格。
- 可见库存。
- 履约方式。

权限必须在 server action 层校验，不能只靠前端隐藏按钮。

## 工作台接入

新增任务类型：

- `SUPPLY_OFFER_PUBLISH`
- `RESALE_LISTING_CREATE`
- `SUPPLY_RESERVATION_CONFIRM`
- `FULFILLMENT_REQUEST_HANDLE`
- `SETTLEMENT_CONFIRM`

新增通知类型：

- 货盘被加入代卖。
- 货盘被询价。
- 代卖成交。
- 需要发货。
- 发货方上传凭证。
- 发货异常。
- 结算待确认。

## 分阶段实施

### Phase 1：货盘基础闭环

目标：能发布货盘、浏览货盘、管理我发布的货盘。

范围：

- Partner 基础表。
- SupplyOffer。
- SupplyOfferItem。
- OfferVisibility。
- `/marketplace`
- `/marketplace/[id]`
- `/marketplace/new`
- `/marketplace/my-offers`
- `/marketplace/my-offers/[id]`
- `/marketplace/my-offers/[id]/edit`

必须完整：

- 新增。
- 编辑。
- 发布。
- 暂停。
- 恢复。
- 下架。
- 删除草稿。
- 复制。
- 详情。
- 列表筛选。
- 权限校验。

### Phase 2：我的代卖

目标：能从别人货盘加入我的代卖，并管理上架状态。

范围：

- ResaleListing。
- `/resale`
- `/resale/[id]`
- `/resale/[id]/edit`
- Marketplace 详情页“加入我的代卖”。

必须完整：

- 创建草稿。
- 编辑。
- 标记已上架。
- 暂停。
- 下架。
- 删除草稿。
- 查看来源货盘。
- 预估利润。
- 平台选择。

### Phase 3：代卖成交与代发任务

目标：代卖货成交后能锁定货盘、生成订单、生成代发任务。

范围：

- SupplyReservation。
- FulfillmentRequest。
- `OrderLine.supplyType = FROM_SUPPLY_OFFER`。
- `/sales/[id]` 供给来源面板。
- `/fulfillment/requests`
- `/fulfillment/requests/[id]`

必须完整：

- 登记售出。
- 锁定供给。
- 创建订单。
- 取消订单释放锁定。
- 创建代发任务。
- 接受/拒绝代发。
- 上传凭证。
- 确认发货。
- 异常处理。

### Phase 4：结算中心

目标：能从代卖订单生成结算，支持佣金、供货款、代发费、多币种。

范围：

- Settlement。
- SettlementLine。
- `/finance/settlements`
- `/finance/settlements/[id]`

必须完整：

- 自动生成草稿。
- 编辑草稿。
- 确认结算。
- 标记付款。
- 作废。
- 导出。
- 多币种字段。

### Phase 5：统一经营视图

目标：把自有库存上架和代卖上架统一到经营视图，但不混淆来源。

范围：

- `/listing` 增加来源筛选。
- `/sales` 增加来源筛选。
- `/reports` 增加自有/代卖/货盘供给维度。
- `/workbench` 增加完整队列统计。

## 风险和约束

1. 不要把别人货盘写入 `InventoryLot / ItemUnit`。
2. 不要把 `SupplyOffer` 当成 `Listing`。
3. 不要只按 SKU 查找代卖或发货记录，必须使用 `resaleListingId`、`orderLineId`、`fulfillmentRequestId`。
4. 不要允许已成交货盘硬删除。
5. 所有状态变更必须写 ActivityLog。
6. 订单取消必须释放 SupplyReservation。
7. 发货完成才可以 consume reservation。
8. 结算确认后不能随意修改金额，只能作废重开或追加调整行。

## 验收清单

Phase 1 完成时：

- 用户能从库存看板发布自有库存货盘。
- 用户能手工发布外部供给货盘。
- 用户能设置可见范围。
- 其他有权限的用户能在货盘市场看到该货盘。
- 无权限用户看不到该货盘。
- 草稿可删除，发布后只能下架。

Phase 2 完成时：

- 用户能从可见货盘创建代卖草稿。
- 代卖草稿不进入库存统计。
- 用户能为代卖选择平台、售价、图片和描述。
- 用户能标记已上架、暂停、下架。
- 用户能从代卖记录跳回来源货盘。

Phase 3 完成时：

- 代卖售出能创建订单。
- 代卖售出能锁定供给数量。
- 锁定失败能回滚订单。
- 取消订单能释放锁定。
- 需要代发时能生成代发任务。
- 发货方能上传凭证和确认发货。
- 销售订单详情能看到来源货盘和代发状态。

Phase 4 完成时：

- 代卖订单能生成结算草稿。
- 结算行能区分供货款、佣金、代发费、平台费。
- 多币种金额和汇率保存完整。
- 结算可确认、付款、作废、导出。

Phase 5 完成时：

- Listing 页面能区分自有和代卖。
- Sales 页面能按来源筛选。
- Reports 能区分自有利润、代卖利润、供货收入。
- Workbench 能显示货盘、代卖、代发、结算相关待办。
