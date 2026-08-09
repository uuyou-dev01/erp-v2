# ERP 随身助手完整交付计划

状态：Web/PWA 全链路已实现，进入生产环境配置与真机试运行
最后更新：2026-08-01

## 1. 最终产品边界

手机端不是响应式 ERP，只承担两类短动作：

1. 价格与购入：保存来源证据、匹配正式 SKU、记录市场价或真实购入。
2. 日常执行：查看本人节点，补物流、到货、分流、入库、发货、妥投、委托和异常确认。

PC 端继续承担 SKU 主档维护、复杂采购/库存处理、财务、配置和大规模数据分析。

## 2. 已完成阶段

| 阶段 | 价格与购入主线 | 日常执行主线 | 状态 |
| --- | --- | --- | --- |
| P0 领域底座 | Capture、SourceListing、Snapshot、Observation、采购草稿 | Task、Notification、ActivityLog、动作策略 | 完成 |
| P1 移动 MVP | 手动记录价格与购入 | 今天、待办、委托、物流、到货、发货 | 完成 |
| P2 降低录入 | 图片、OCR、平台字段提取、多行采购 | 扫码、凭证、分流、入库、退货 | 完成 |
| P3 商品身份 | 正式 SKU 搜索、评分、理由、别名学习、PC 审核 | 业务节点引用同一正式 SKU | 完成 |
| P4 变化与规模 | 来源价格变化、移动/PC 变化列表、平台适配器 | 1–20 条批量执行、连续发货 | 完成 |
| P5 生产化 | S3 兼容存储、保留策略、功能开关 | 数据库限流、通知 outbox、静默/汇总、健康指标 | 完成 |

## 3. 商品匹配闭环

匹配对象始终是正式 `SKU`，不是商品情报子表的临时选项。

```text
手机输入 / OCR / 平台适配器
→ 正式 SKU 候选检索
→ 条码/款号/编码/别名/名称规格评分
→ 手机明确选择，或标记“创建待整理 SKU”
→ skuId 原样进入 Capture 与 QuickEntry
→ PC 可接受、拒绝、重新匹配
→ 接受结果沉淀为 SkuAlias
```

系统不会因为标题相似就静默创建或合并 SKU。采购行必须选择正式 SKU，或明确选择“创建待整理 SKU”；价格记录可以暂不匹配。

## 4. 平台与价格闭环

- 已内置闲鱼、千岛、Mercari、微信和通用适配器。
- 适配器保存名称、版本、字段置信度和原始证据。
- 同一来源先按平台商品 ID、再按规范化 URL 去重。
- 同一内容哈希不重复创建快照。
- 金额变化时创建 `SourcePriceChange`，记录前值、现值、差额和变化率。
- PC `/product-intelligence/price-changes` 与手机 `/m/prices` 均可查看。

## 5. 移动执行闭环

- 单任务：读取 `expectedVersion`，展示当前唯一主动作，成功后完成业务节点与 Task。
- 批量：同类动作每次 1–20 条，逐条幂等并返回部分成功结果。
- 连续发货：一次只显示一个订单，扫码、凭证和影响确认后自动前进。
- SLA：统计 30 天完成量、平均启动/周期、24 小时内到期、冲突和失败。
- 高风险动作仍要求凭证、二次确认或跳转 PC。

## 6. 通知与降噪

- 站内通知先落库，不依赖系统推送成功。
- `dedupeKey` 阻止同一业务事件重复提醒。
- outbox 支持领取、失败重试和最大尝试次数。
- 用户可关闭推送，设置跨午夜静默时段，以及即时/每小时/每日汇总。
- 每小时和每日模式把到期通知合并为一条系统推送，站内明细仍完整保留。

## 7. 生产部署清单

1. 执行 `npx prisma migrate deploy`。
2. 对象存储：设置 `MOBILE_ASSET_DRIVER=s3` 和对应 S3/R2/MinIO 参数；本地开发保持 `local`。
3. 推送：配置 VAPID 公私钥和 `WEB_PUSH_SUBJECT`。
4. 调度：设置 `MOBILE_CRON_SECRET`，每分钟调用通知 outbox，每日调用 retention。
5. 监控：轮询 `/api/v1/internal/mobile/health`；非 200 时告警。
6. 保留期：确认 `MOBILE_EVIDENCE_RETENTION_DAYS`，默认 180 天后清理已忽略采集的证据并脱敏。
7. 灰度：通过 `MOBILE_FEATURE_*` 按能力开关，不需要回滚数据库。

建议调度：

```text
* * * * *   POST /api/v1/internal/mobile/notification-outbox
20 3 * * *  POST /api/v1/internal/mobile/retention
*/5 * * * * GET  /api/v1/internal/mobile/health
```

三个内部接口均要求 `Authorization: Bearer <MOBILE_CRON_SECRET>`。

## 8. 发布与回滚

- 数据迁移只新增字段、表和索引；旧 PC 流程不依赖移动表。
- 出现问题时先关闭对应 `MOBILE_FEATURE_*`，保留已落库 Capture、任务和站内通知。
- 对象存储切换不改变数据库 `storageKey`；切换前必须迁移已有本地文件。
- 通知调度暂停不会丢通知，outbox 会在恢复后继续处理。
- 移动业务动作依赖幂等键和版本校验，客户端重试不会重复推进状态。

## 9. 需要外部环境才能完成的事项

- 真实 S3/R2/MinIO 凭据与桶策略。
- 正式域名、HTTPS、VAPID 密钥和 iPhone/Android 推送授权。
- 真实角色、仓位、订单和采购单的真机 UAT。
- 若需要从第三方 App 分享后立即回到原 App，再单独建设 iOS Share Extension；它复用现有 Capture API，不改变领域模型。

这些是部署和渠道工作，不是当前 Web/PWA 业务闭环的代码缺口。
