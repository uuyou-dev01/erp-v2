### 智能策略模块（Intelligence）— 参考价 / 定价 / 补货 / 促销（v1）

#### 职责
- RefPrice 参考价档案（自动沉淀 / 手动录入 / 市场抓取预留）
- 定价建议（按平台 / 市场）
- 补货建议（ROP、安全库存、采购价上限）
- 促销策略（周转天数、降价阶梯）

---

### 一、设计原则
1. **离线批处理为主**：推荐结果先计算、落表，再被前端读取
2. **可解释、可回溯**：所有推荐必须带输入快照与算法版本
3. **规则优先于 ML**：v1 使用统计与规则即可产生 80% 价值
4. **结果不可漂移**：历史推荐结果不因算法升级而变化

---

### 二、RefPrice（参考价档案）

#### 2.1 主键设计（两步走）
- 全新：`SKU + market (+ platform)`
- 中古：`SKU + conditionGrade + defectTags? (+ market)`

#### 2.2 数据来源
- A. 自动沉淀：历史成交价（OrderLine）
- B. 人工录入：采购/谈价时参考
- C. 市场抓取（后期）：第三方平台价格

#### 2.3 RefPriceSnapshot（推荐落表）
- `skuId`
- `market / platform`
- `conditionKey`
- `p25 / p50 / p75`
- `sampleCount`
- `lastUpdatedAt`
- `sourceMix`（SELF / MANUAL / MARKET）

> 说明：Snapshot 是 RefPrice 的对外读取接口，原始记录不直接用于推荐。

---

### 三、定价建议（Pricing Recommendation）

#### 输入
- RefPriceSnapshot
- 平台费率 / 运费模板
- 目标利润率（可配置）
- 库存状态（在库 / 在途）

#### 输出
- `suggestedPrice`
- `minPrice`（保本）
- `confidence`
- `reasonCodes`（LOW_STOCK / HIGH_DEMAND / PRICE_GAP）

#### 规则示例（v1）
- 建议价 = p50 RefPrice
- 最低价 = unitCost + 平台费 + 运费 + 最低利润

---

### 四、补货建议（Replenishment）

#### 核心指标
- 日均销量（7/14/30 天）
- 采购/物流 Lead Time
- 安全库存（Safety Stock）

#### 规则（v1）
- ROP = 日均销量 × Lead Time + Safety Stock
- 若 Available < ROP → 生成补货建议

#### 输出
- `recommendedQty`
- `maxPurchasePrice`
- `urgencyLevel`
- `reasonCodes`

---

### 五、促销策略（Promotion）

#### 触发条件
- 周转天数 > 阈值
- RefPrice 下行趋势

#### v1 规则
- T+30 天：-5%
- T+60 天：-10%
- T+90 天：人工确认

---

### 六、任务调度与队列
- Redis + BullMQ
- 每日全量跑（夜间）
- 订单 CONFIRMED 后触发 SKU 增量刷新

---

### 七、SaaS / API 预留
- 推荐结果与 RefPrice 可通过 API 暴露
- 支持采购商 / 分销商只读访问
- 所有请求基于 storeId 隔离

---
