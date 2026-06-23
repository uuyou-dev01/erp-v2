## domain.md

### 核心抽象原则
1. SKU ≠ 库存
2. 库存只通过 Lot 或 ItemUnit 表示
3. 所有库存变化必须通过 StockLedger
4. 成本在库存形成时固化，不允许回写
5. 不为单一品类（如盲盒）设计特例
6. SKU 是商品与账务统计维度；Lot / ItemUnit 是库存与成本承载维度

### 关键领域对象
- SKU：商品抽象定义（父 SKU 表示系列/产品组；子 SKU 表示可交易规格）
- InventoryLot：全新商品批次（数量型，数量以 StockLedger 汇总为准）
- ItemUnit：二手/瑕疵/唯一件/需贴标拍照的单件库存（单件型，归属于子 SKU）
- StockLedger：库存流水真相源
- Order / OrderLine：销售订单与行
- Allocation：订单与库存的绑定
- InventorySplit：库存拆分事件（通用）
- RefPrice：参考价格档案（观察值）

### 设计哲学
- 拆分是事件，不是状态
- 分配先于确认
- 推荐结果必须可解释、可回溯

### SKU / 库存统计口径

- 父 SKU 统计 = 其所有子 SKU 的库存、上架、采购、销售汇总；父 SKU 本身不直接承载可售库存。
- 子 SKU 统计 = 自身 InventoryLot 数量 + 自身 ItemUnit 件数。
- 批次库存数量 = StockLedger 对 InventoryLot 的汇总，不直接信任 InventoryLot.status。
- 单件库存数量 = ItemUnit.status + Location.isSellableDefault 的聚合视图；ItemUnit 仍然属于 SKU 体系下的库存，不是独立商品主档。
- 上架数量 = 子 SKU 的 SKU Listing 与 ItemUnit Listing 聚合到父 SKU；ItemUnit Listing 用于定位具体单件，不改变商品归属。
- 账务维度 = OrderLine.skuId；成本来源由 OrderAllocation 决定，LOT 取批次成本，ITEM_UNIT 取单件成本。

### 当前产品主线

当前阶段优先回答五个问题：

1. 货在哪里？
2. 这件货能不能卖？
3. 卖在哪个平台？
4. 下单后能不能按时发？
5. 最后到底赚了多少钱？

本阶段暂不把班车目标重量、截止装箱时间、SKU 缺重量阻断利润计算作为核心约束；这些进入后续集运精细化阶段。

---
