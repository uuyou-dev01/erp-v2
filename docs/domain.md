## domain.md

### 核心抽象原则
1. SKU ≠ 库存
2. 库存只通过 Lot 或 ItemUnit 表示
3. 所有库存变化必须通过 StockLedger
4. 成本在库存形成时固化，不允许回写
5. 不为单一品类（如盲盒）设计特例

### 关键领域对象
- SKU：商品抽象定义（品类/属性）
- InventoryLot：全新商品批次（数量型）
- ItemUnit：二手/瑕疵单件（单件型）
- StockLedger：库存流水真相源
- Order / OrderLine：销售订单与行
- Allocation：订单与库存的绑定
- InventorySplit：库存拆分事件（通用）
- RefPrice：参考价格档案（观察值）

### 设计哲学
- 拆分是事件，不是状态
- 分配先于确认
- 推荐结果必须可解释、可回溯

---