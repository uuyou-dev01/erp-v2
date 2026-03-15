## constraints.md

### 系统硬约束（必须遵守）

1. 所有库存变化必须写入 StockLedger
2. Order 在 CONFIRMED 前必须完成 Allocation
3. InventorySplit 必须完全消耗 source 库存
4. Lot / ItemUnit 的 unitCost 一旦生成不可修改
5. 订单级费用与优惠必须分摊到行级
6. 推荐结果必须带算法版本与输入快照
7. 所有业务数据必须带 storeId（SaaS 预留）
8. 拆分默认一次性完成（不存在拆一半）
9. Listing 只做提醒，不自动下架（v1）

---