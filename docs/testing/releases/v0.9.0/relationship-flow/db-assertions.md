# 任务协作成长链路数据库断言

日期：2026-09-09

## 环境隔离

- 验收库：`erp_relationship_e2e`
- 开发库：未写入、未重置
- 准备方式：`scripts/e2e-prepare.ts`
- migration：63/63 应用成功
- 固定 seed：成功

## 主链路断言

1. 邀请接受后存在 `LocationFulfiller(status=ACTIVE, role=MANAGER)`。
2. 同一个被邀请人对邀请方企业的 `Membership` 数量为 0。
3. 生命周期事件顺序为 `INVITED → ACCEPTED`。
4. 任务负责人指派后 `Task.assignedToId` 等于目标任务协作者。
5. 协作者创建自己的企业后，恰有一个首店和一个默认库存池，库存流水为 0。
6. 企业连接建立后没有自动产生库存或成本读取授权。
7. 定向货盘规则保存 `viewerOrganizationId` 和 `organizationConnectionId`，`partnerId=null`。
8. 连接有效时，对端可见货盘但看不到内部成本。
9. 连接解除后，同一详情请求返回 404，未来访问立即撤销。

## 自动化结果

```text
relationship-foundation.test.ts                         passed
collaboration-protocol-foundation.test.ts               passed
location-fulfillment-collaboration.test.ts              passed
shipping-dispatch-lifecycle.test.ts                     passed
supply-offer-organization-visibility.test.ts            passed
5 files passed, 22 tests passed

warehouse-relationship-growth-flow.spec.ts              passed
auth setup + main flow: 2 tests passed

complete Vitest regression                              passed
131 files passed, 558 tests passed
```
