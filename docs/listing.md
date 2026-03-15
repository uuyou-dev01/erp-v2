## listing.md

### Listing 模块— 多平台上架与库存联动（v1）

#### 职责
- 记录商品在哪些平台上架
- 管理上架状态与时间
- 在库存变化时发出提醒

---

### 一、核心对象

#### Listing
- `id, storeId`
- `platformId`
- `skuId? / itemUnitId?`
- `listedQty`
- `status`：DRAFT / ACTIVE / SOLD_OUT / DELISTED
- `listedAt / delistedAt`

> Listing 是“展示状态”，不是库存真相源。

---

### 二、库存联动规则（你已选择提醒模式）

1. **ItemUnit 售出**
- 同 ItemUnit 的其它 ACTIVE listings → 生成 DELIST_REQUIRED 提醒

2. **Lot 库存下降**
- 若 `activeListedQty > availableQty` → 生成超卖风险提醒

> v1 不自动下架，只提醒（人工确认）

---

### 三、多平台场景
- 同一 SKU / ItemUnit 可在多个平台上架
- Listing 不锁库存
- 实际库存扣减以 OrderAllocation 为准

---

### 四、与销售模块的关系
- Order CONFIRMED → 触发 ListingAlert
- Listing 状态变化不影响订单与库存

---