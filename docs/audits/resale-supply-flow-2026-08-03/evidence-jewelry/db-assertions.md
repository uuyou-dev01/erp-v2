# 首饰跨境代卖案例：数据库断言

测试库：`erp_v2_audit_jewelry_20260803`（隔离库）

## 业务输入

- 供货单价：CNY 120
- Mercari 售价：JPY 4,000
- 平台费率：10%，系统计算 JPY 400
- 货盘返佣：成交价 50%，系统计算 JPY 2,000
- 用户预期代发服务费：JPY 240；货盘表单实际保存为 `dropshipFee = 240` 且随货盘币种解释为 CNY
- 测试汇率：CNY→JPY 20；JPY→CNY 0.05

## 锁库与出库

- 货盘发布后：`availableQty=5, reservedQty=0, fulfilledQty=0`
- 创建履约后：`availableQty=5, reservedQty=1, fulfilledQty=0`
- 标记发货后：`availableQty=4, reservedQty=0, fulfilledQty=1`
- 唯一履约分配：标准批次 `audit_jewelry_standard_lot`，数量 1，状态 `SHIPPED`
- 唯一库存流水：`OUTBOUND_SALE -1`，发货节点 `audit_jewelry_japan_home`
- UI 发货后不再提供“标记发货”，改为“标记送达”；本次请求仅产生 1 条出库流水，未重复扣减

## 跨币种利润

- 系统保存：`estimatedPlatformFee=400 JPY`
- 系统保存：`estimatedCommission=2000 JPY`
- 系统保存：`estimatedGrossProfit=1240 JPY`
- 该 1,240 由原值直接相减得到：`4000 - 120 - 400 - 2000 - 240`，其中 CNY 120 与无明确币种的 240 被当成 JPY 直接相减
- 按测试汇率换算，供货价应为 JPY 2,400；交易利润应为 `4000-2400-400=1200 JPY`，若纯利润五五分，代卖分成为 JPY 600，而不是成交额 50% 的 JPY 2,000

## 结算

- 结算头：`currency=CNY, totalAmount=2120, baseCurrency=CNY, baseAmount=2120`
- 结算头 2,120 的构成是“PAYABLE 原值相加”：CNY 120 供货货款 + JPY 2,000 代卖佣金；未做汇率换算，也未扣 JPY 400 平台费
- 结算行本位币金额实际为：供货 CNY 120 + 佣金 CNY 100 - 平台费 CNY 20 = CNY 200；与结算头 CNY 2,120 不一致
- 代发服务费结算行为 `JPY 0`；代发运费也为 `JPY 0`
- `charge_events=0`、`charge_allocations=0`：用户期望的 JPY 240 未进入独立费用事件
- 线下结清后仅生成 1 条收益：代卖佣金 JPY 2,000 按汇率转为 CNY 100，记入代卖账号钱包；未生成 JPY 240 代发收益

## 跨主体可见性

- 货主通过真实 UI 选择“指定店铺或合作方”并勾选“我的代卖主体”，货盘成功发布
- 代卖账号通过真实登录进入货盘市场，结果为“暂无可见货盘”
- 后续流程仅通过隔离库把该货盘改为 `PUBLIC` 后才可继续，证明定向合作方可见性是主链真实阻断
