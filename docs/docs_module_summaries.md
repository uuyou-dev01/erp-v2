# 核心业务模块总结（Module Summaries）

> 本文档用于**补齐与统一总结**核心业务模块的定位、职责、边界与联动关系。
> 适合作为：
> - docs 的索引说明
> - AI / Kiro 的模块级上下文
> - 新成员快速理解系统用

---

## procurement.md｜采购模块（Procurement）

### 模块定位
采购模块负责**形成库存成本与供给来源**，是库存、物流、财务的上游模块。

### 核心职责
- 记录采购单（PurchaseOrder / PurchaseLine）
- 管理采购成本结构（商品价、打包价、费用、折扣）
- 支持“为订单采购（先卖后买）”
- 管理采购币种、汇率与支付方式
- 在 RECEIVED 节点生成库存（Lot / ItemUnit）

### 关键设计点
- 成本口径：使用 `orderedAt` 当天汇率固化
- 打包采购：按金额比例分摊（默认）
- RECEIVED 是库存形成的唯一合法节点
- 为单采购必须显式绑定 OrderLine

### 不负责的内容
- 不计算利润
- 不管理库存数量（只触发生成）
- 不追踪物流轨迹细节

### 下游联动
- Inventory：生成 Lot / ItemUnit + StockLedger
- Sales：为订单采购供给
- Finance：应付账款、采购成本

---

## inventory.md｜库存 / 仓储模块（Inventory & Warehouse）

### 模块定位
库存模块是**系统的事实中心（Single Source of Truth）**，回答：
> 我有什么货？在哪里？是否可售？

### 核心职责
- 管理库存形态：Lot（全新） / ItemUnit（中古）
- 管理 Location（中国仓 / 集运仓 / 日本仓 / 朋友仓）
- 通过 StockLedger 记录所有库存变化
- 支持库存拆分（InventorySplit）
- 支持多人协作（Owner / Holder）

### 关键设计点
- 所有库存变化必须写 StockLedger
- 成本在库存形成时固化
- 拆分是显式事件，且一次性完成（无“拆一半”）
- Listing 不锁库存，仅做提醒

### 不负责的内容
- 不计算销售利润
- 不做平台上下架操作

### 上下游联动
- Procurement：RECEIVED → 入库
- Sales：Allocation / 出库
- Listing：库存变化 → 提醒

---

## sales.md｜销售模块（Sales）

### 模块定位
销售模块负责**交易事实 + 库存消耗**，是收入与库存出库的入口。

### 核心职责
- 管理订单（Order / OrderLine）
- 支持多 SKU / 批量 / 混合全新与中古销售
- 通过 Allocation 绑定库存
- 处理订单级优惠与费用分摊

### 关键设计点
- CONFIRMED 前必须完成 Allocation
- 优惠与平台费按金额比例分摊
- ItemUnit 只能被一个订单占用

### 不负责的内容
- 不自动上下架
- 不管理参考价

### 上下游联动
- Inventory：Allocation / OUTBOUND_SALE
- Listing：触发下架或风险提醒
- Finance：应收账款、销售收入

---

## intelligence.md｜智能策略模块（Intelligence）

### 模块定位
智能策略模块提供**决策辅助，而非事实数据**。

### 核心职责
- RefPrice 参考价档案（A 自动 / B 手动 / C 抓取预留）
- 定价建议（按 SKU / 平台）
- 补货建议（ROP / 安全库存）
- 促销建议（周转天数 / 降价阶梯）

### 关键设计点
- 离线批处理为主（每日 + 事件触发）
- 推荐结果必须落表
- 推荐必须可解释、可回溯

### 不负责的内容
- 不直接修改售价
- 不自动下采购单

### 上下游联动
- Sales：成交数据输入
- Inventory：库存状态输入
- Procurement：采购价上限建议

---

## listing.md｜Listing / 多平台上架模块

### 模块定位
Listing 模块负责**记录“在哪里卖”而非“卖了多少”**。

### 核心职责
- 记录 SKU / ItemUnit 在各平台的上架状态
- 管理上架时间、下架时间
- 在库存变化时生成提醒

### 关键设计点
- Listing 不锁库存
- 售出后仅提醒下架（v1）
- 多平台并存，以风险提醒为主

### 不负责的内容
- 不扣库存
- 不同步平台 API（v1）

### 上下游联动
- Sales：CONFIRMED → 提醒
- Inventory：库存不足 → 风险提醒

---

## finance.md｜财务 / 账务模块（Finance）

### 模块定位
财务模块负责**资金流与利润核算**，而非库存或业务流程控制。

### 核心职责
- 记录应付 / 应收账款
- 记录平台手续费、运费、税费等
- 支持多币种与汇率差
- 按月 / 类目 / 国家统计利润

### 关键设计点
- 基于 LedgerEntry（或 FinanceRecord）记账
- 库存成本不回写
- 利润来自销售收入 − 成本 − 费用

### 不负责的内容
- 不生成库存
- 不参与订单确认逻辑

### 上下游联动
- Procurement：应付账款
- Sales：应收账款
- Intelligence：利润分析输入

---

> 本文档用于补齐模块级总结，避免“每个 md 都写得很细，但整体缺乏模块全景”的问题。

