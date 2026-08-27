# 账号、企业与其他业务模块对接文档

> 文档日期：2026-08-15  
> 用途：供其他对话或模块负责人直接使用。本文只描述跨模块契约、已存在的连接点和需要由各业务模块完成的改造；账号模块自身待办见 `account-organization-follow-up.md`。

> 2026-08-28 状态修订：本文原列的派生权限回收、连接来源货盘可见性、服务协议有效连接及对方确认三项高风险缺口均已有代码和应用测试；服务协议已增加暂停、对方确认恢复、结束和追加式修订版本。当前仍需在隔离数据库完成 migration 与跨账号截图复验。企业连接已增加追加式事件历史，主要连接/协议/货盘/履约/结算/成员状态已接入站内通知基础设施。

## 1. 调查范围与结论

本次检查了 Prisma 数据模型、统一用户上下文、企业/成员/邀请/连接动作，以及店铺、库存、平台、合作方、采购、货盘、代卖、履约、协议、结算、通知和移动端的主要调用点。

结论：

- 大部分业务 Server Action 已通过 `requireUserContext()` 获取当前企业和店铺范围。
- 现有系统处于 `Store` 旧租户模型向 `Organization + Access` 新模型并存阶段。
- 企业连接当前只完成“身份关系确认”，没有自动打开业务权限，这个方向正确。
- 仍有三项跨模块高风险缺口：成员停用后的派生权限回收、连接解除后的定向货盘可见性、服务协议对未连接企业的枚举和创建。

## 2. 统一身份与授权契约

### 2.1 业务对象归属

| 概念                     | 唯一含义                     | 不能替代                   |
| ------------------------ | ---------------------------- | -------------------------- |
| `User`                   | 登录的人                     | 企业、供应商档案           |
| `Organization`           | 经营主体                     | 登录账号、店铺             |
| `Membership`             | 用户在企业中的角色和状态     | 具体对象访问授权           |
| `Store`                  | 企业下的业务操作空间         | 企业身份                   |
| `Partner`                | 某店铺维护的外部合作方档案   | 用户账号、已确认企业关系   |
| `OrganizationConnection` | 两个企业双方确认的身份连接   | 库存、订单、费用、结算权限 |
| `TradingRelationship`    | 店铺与合作方的业务规则       | 企业身份确认               |
| `ServiceAgreement`       | 两个企业的服务范围和结算约定 | 团队成员关系               |

邮箱只是联系人或账号标识，不是企业关系。企业协作码只是精确查找入口，不是权限凭证。

### 2.2 请求上下文

ERP 业务页面和动作应调用 `requireUserContext()`，并使用返回值：

- `userId`
- `organizationId`
- `organizationIds`
- `role`
- `activeStoreId`
- `storeIds`
- `inventoryPoolIds`
- `salesChannelAccountIds`
- `locationIds`
- `activeInventoryPoolId`

只有注册、登录、邀请接受、onboarding 等“已登录但尚无企业”的页面可以调用 `requireAuthenticatedUser()`。

强制规则：

1. 不信任客户端提交的 `organizationId`、`storeId` 或角色。
2. 写入前必须验证对象属于当前企业/授权范围。
3. 角色判断使用当前 `Membership.role`，不要使用历史 `User.role`。
4. 店铺范围使用 `StoreAccess`，不要使用历史 `User.storeId`。
5. 跨企业访问只能来自显式对象授权或有效业务协议，不能因为两个企业已连接就默认放行。
6. 后台任务、队列和 webhook 没有 Cookie，必须在任务载荷中携带并重新验证 `organizationId` 和对象归属。

### 2.3 企业切换

企业切换使用活动企业 Cookie，并清空活动店铺 Cookie。任何模块新增缓存、服务端缓存标签或客户端持久化状态时，键至少包含：

- `organizationId`
- 必要时包含 `storeId`
- 用户个性化结果再包含 `userId`

切换企业后不能复用上一个企业的列表、筛选项、表单默认值或乐观更新缓存。

## 3. 跨模块高优先级问题

### INT-P0-01：派生权限回收

影响模块：库存、平台/刊登、仓库/履约、移动端。

当前情况：店铺授权会通过数据库触发器创建库存池、渠道和仓库权限，但删除 `StoreAccess` 不会由触发器自动删除这些派生权限。成员主动退出已显式清理，管理员停用成员尚未完整清理。

各模块要求：

- 对象读取和写入仍要同时检查有效成员身份，不能只检查 Access 表中是否有记录。
- 账号模块修复权限回收前，库存/渠道/仓库动作不得把残留 Access 当成独立登录资格。
- 增加“用户在企业 A 被停用、仍是企业 B 成员”的跨租户测试。

### INT-P0-02：连接解除后的货盘授权

影响模块：Marketplace、货盘、代卖、履约。

当前情况：创建定向货盘规则时会把 `Partner.organizationId` 复制到 `OfferVisibility.viewerOrganizationId`。企业连接解除只会清空 `Partner.organizationId`，已经保存的 `viewerOrganizationId` 仍可能让目标企业继续看到货盘。

必须选择一种方案：

1. 推荐：`OfferVisibility` 保存 `organizationConnectionId`，读取时同时要求连接为 `ACTIVE`；或
2. 解除连接事务内撤销所有由该连接产生且仍有效的未来授权，并保证任何新授权都记录来源连接。

历史订单、履约和结算继续可见；只停止未来浏览、下单、预留和新履约。

### INT-P0-03：服务协议不能绕过企业连接

影响模块：业务归属、仓储、代发、费用、结算。

当前情况：`getMultiPartyManagementData()` 会列出全部企业；`createServiceAgreementAction()` 只要求当前企业是客户或服务方，没有要求双方存在有效连接；服务方可以单方激活草稿协议。

对接要求：

- 企业选择器只显示当前企业的 `ACTIVE OrganizationConnection` 对端。
- 创建协议时服务端再次校验有效连接，禁止依赖前端筛选。
- 明确协议是否需要双方确认；建议采用 `DRAFT -> PENDING_COUNTERPARTY -> ACTIVE`。
- 连接解除后禁止新建或激活协议，但已有协议应进入人工处理或按约定到期，不能直接删除。

## 4. 各模块对接清单

### 4.1 店铺与业务结构

当前连接点：

- 新企业会创建第一个 `Store`。
- 数据库触发器会为 Store 创建兼容的 `InventoryPool`。
- 创建 Store 后目前只自动给创建者建立 `StoreAccess`。

待对接：

- 明确新店铺是否默认授权所有 OWNER/ADMIN，还是必须逐成员授权。
- 店铺停用/删除前处理成员活动店铺 Cookie、库存池、平台、仓库和历史单据。
- 新店铺创建后刷新团队权限管理选项。
- 不允许 `Store.organizationId` 为空的新业务数据继续扩散；旧数据兼容应单独迁移。

主要代码：`app/actions/store-settings.ts`、`lib/application/multi-party-foundation.ts`。

### 4.2 库存、批次、单件与库位

当前连接点：

- `InventoryPool.organizationId` 表示库存所有主体。
- `Location.operatorOrganizationId` 表示仓库运营主体。
- 用户通过 `InventoryPoolAccess` 和 `LocationAccess` 获得对象范围。
- 多数库存动作同时检查店铺范围或显式对象权限。

待对接：

- 所有新增库存查询必须按 `inventoryPoolId`/`organizationId` 限定，不能只凭记录 ID。
- 成本字段继续使用 `canViewInventoryCost(context.role)`，跨企业仓储方默认不应看到货主成本。
- 协议授权仓库操作时，区分“可操作数量”和“可查看成本/结算”。
- 企业连接解除不自动删除库存或库存流水；只应阻止没有有效协议的新操作。

主要代码：`app/actions/skus.ts`、`app/actions/item-units.ts`、`app/actions/locations.ts`、`app/actions/stocktake.ts`。

### 4.3 平台账号、刊登与销售渠道

当前连接点：

- `SalesChannelAccount.organizationId` 表示渠道账号所属企业。
- `ChannelAccess` 限定用户可使用的销售账号。
- Store/Platform 旧模型通过双写触发器同步到新模型。

待对接：

- 新建刊登、订单和平台账单必须校验 `salesChannelAccountId` 在 `context.salesChannelAccountIds` 中。
- 成员角色或店铺范围变化时同步 ChannelAccess。
- 逐步停止只使用 `Platform.storeId` 的旧授权判断。
- 跨企业代卖只能使用显式 `SupplyOfferChannel`，不能因为企业连接而直接使用对方平台账号。

主要代码：`app/actions/platforms.ts`、`app/actions/listings.ts`、`app/actions/channel-statements.ts`。

### 4.4 合作方与采购

当前连接点：

- `Partner` 按店铺维护，可在没有账号、没有企业连接时正常使用。
- `PurchaseOrder.supplierId` 外键指向 Partner，创建采购单时已校验 Partner 属于当前店铺且有效。
- 联系人邮箱不会查找或创建 User。

待对接：

- 采购单和历史成本继续引用 Partner；连接解除时不能清除采购历史。
- UI 可显示“仅联系人 / 待确认 / 已连接 / 已拒绝 / 已解除”，但采购资格应由 TradingRelationship 决定，不由连接状态单独决定。
- 若同一目标企业在多个店铺有 Partner 档案，需要统一主数据或连接—Partner 关联表。
- 合作方合并时保留旧 Partner ID 到新档案的可追溯映射。

主要代码：`app/actions/partners.ts`、`app/actions/purchase-orders.ts`。

### 4.5 Marketplace 与定向货盘

当前连接点：

- 货盘归属使用 `SupplyOffer.organizationId` 和 `inventoryPoolId`。
- 定向可见性使用 `OfferVisibility`，可以指向 Partner、Store 或 Organization。
- 企业连接接受后，Partner 才会获得 `organizationId`，之后才能生成目标企业授权。
- 企业连接本身不会创建可见性规则。

待对接：

- 修复 `INT-P0-02`，使所有企业级可见性都有连接来源并在读取时校验状态。
- 发布定向货盘时，服务端要求目标 Partner 已绑定企业且对应连接为 `ACTIVE`。
- 连接结束后阻止新预留、新代卖刊登和新履约请求，已生成业务记录保持可读。
- PUBLIC 货盘不应因为连接结束被下架；只处理连接产生的定向授权。
- 避免以名称、联系人邮箱或内部 `Organization.code` 匹配目标企业。

主要代码：`app/actions/supply-offers.ts`、`app/actions/resale-listings.ts`、`prisma/schema.prisma` 中的 `OfferVisibility` 和 `SupplyOfferChannel`。

### 4.6 代卖、预留与履约

当前连接点：

- `ResaleListing.sellerOrganizationId` 标记代卖企业。
- `FulfillmentRequest` 已保存请求方、服务方、库存池和履约仓库范围。
- 代发主体选择依赖有效 `ServiceAgreement` 中的 `FULFILLMENT` 服务类型。

待对接：

- 创建代卖、预留或履约请求时校验货盘授权、连接和协议在“创建时”均有效。
- 请求创建后保存授权/协议版本快照，后续连接解除不应破坏履约历史。
- 解除连接时：未接受的新请求应停止或等待人工处理；已接受/已发货请求按既有协议继续。
- 服务方成员只能看到授权仓库和所需履约信息，不默认看到采购成本或其他渠道订单。

主要代码：`app/actions/resale-listings.ts`、`app/actions/fulfillment-requests.ts`、`app/actions/multi-party.ts`。

### 4.7 服务协议与费用规则

当前连接点：

- `ServiceAgreement` 连接客户企业、服务企业、库存池、仓库和结算币种。
- `ChargeRule`、`ChargeEvent` 可以引用企业和服务协议。

待对接：

- 修复 `INT-P0-03`。
- 协议需要稳定版本；重要修改创建新版本，不覆盖历史结算依据。
- 双方确认服务类型、库存归属、履约责任、收费规则、币种、账期和有效期。
- 协议暂停/结束只影响未来费用事件，不修改已确认费用。
- 显式用户授权应关联协议来源，便于协议结束时准确回收。

主要代码：`app/actions/multi-party.ts`、`app/actions/charges.ts`。

### 4.8 结算、钱包与财务

当前连接点：

- `Settlement` 可保存付款企业、收款企业、Partner、履约请求和协议条款快照。
- 费用和结算查询已有按当前企业作为付款方/收款方的可见性判断。

待对接：

- 新结算必须来源于有效业务记录或显式财务调整，不能仅凭企业连接创建。
- 连接解除后保留历史应收、应付、账单、提现和审计记录。
- 结算确认后使用协议/货盘版本快照，不能读取后来被覆盖的当前条款。
- 跨企业财务页面必须校验当前企业是付款方、收款方或被显式授权方。
- Partner 联系邮箱不能作为收款账号或钱包所有权凭证。

主要代码：`app/actions/settlements.ts`、`app/actions/charges.ts`、`app/actions/wallet.ts`。

### 4.9 任务、通知与审计

当前连接点：

- 企业连接请求会向目标企业的有效 OWNER/ADMIN 创建站内通知。
- `Task`、`Notification`、`ActivityLog` 均带 `organizationId`。

待对接：

- 接受、拒绝和解除连接后通知发起方管理员。
- 成员停用或退出时处理其未完成任务：重新分配、进入未分配队列或阻止停用并提示。
- 通知读取必须同时校验 `recipientId` 和企业范围。
- 账号、邀请、成员、连接和协议动作写入统一审计。
- 邮件通知后续复用 outbox，不在业务事务内同步调用 SMTP。

主要代码：`app/actions/notifications.ts`、`app/actions/tasks.ts`、`lib/application/activity-log.ts`。

### 4.10 工作台、报表与缓存

当前连接点：工作台和团队报表使用活动企业及店铺上下文。

待对接：

- 所有聚合必须带企业或店铺条件，不能对全表求和后在 UI 过滤。
- 缓存键和 revalidation tag 包含企业 ID；店铺级数据再包含店铺 ID。
- 企业切换后清除客户端查询缓存和持久化筛选器。
- 报表导出任务显式保存请求企业、店铺范围和发起用户。

主要代码：`app/actions/workbench.ts`、`app/actions/team-reports.ts` 和各报表查询。

### 4.11 移动端与 API

当前连接点：移动端任务和资产接口使用组织、用户、设备及幂等键。

待对接：

- 移动端明确当前企业选择，不复用桌面 Cookie 的隐含状态。
- 设备注册或令牌中绑定用户与活动企业，并允许安全切换。
- 企业成员停用后，移动端令牌和设备权限应即时或在短 TTL 内失效。
- 上传、OCR、任务批处理等接口必须重新校验对象企业和 StoreAccess。

主要代码：`app/actions/mobile.ts`、`app/api/v1/mobile/**`。

### 4.12 产品情报、分类与导入任务

当前连接点：产品情报和企业自定义分类使用 `organizationId`；部分系统分类允许 `organizationId = null`。

待对接：

- 明确 `null` 只代表系统级公共配置，不能代表“没有租户限制”。
- 捕获、确认、导入和重试任务携带企业 ID、店铺 ID 和发起用户。
- 外部平台 ID 的唯一键必须包含企业或店铺范围，避免不同企业互相覆盖。

主要代码：`app/actions/product-intelligence.ts`、`app/actions/categories.ts`、相关 API 和后台任务。

## 5. 推荐的跨模块服务契约

目前多个模块直接查询表。为减少权限规则重复，建议逐步提供以下服务函数：

```ts
requireUserContext({ storeId? })
assertActiveMembership(userId, organizationId)
assertStoreAccess(userId, storeId)
assertObjectAccess(userId, scopeType, scopeId, permission)
getActiveConnection(firstOrganizationId, secondOrganizationId)
assertActiveConnection(firstOrganizationId, secondOrganizationId)
assertActiveAgreement(clientOrganizationId, providerOrganizationId, serviceType)
```

建议的领域事件或 outbox 事件：

- `membership.activated`
- `membership.deactivated`
- `membership.scope_changed`
- `organization.connection_requested`
- `organization.connection_activated`
- `organization.connection_ended`
- `service_agreement.activated`
- `service_agreement.ended`

这些事件当前尚未形成统一事件总线。新增前先明确幂等键、事务边界和失败重试，不要直接在多个 Server Action 中散落副作用。

## 6. 分模块实施顺序

建议在其他对话中按以下顺序拆分：

1. **权限回收与统一授权服务**：修复停用成员残留 Access，补跨租户测试。
2. **企业连接 × Marketplace**：给定向授权增加连接来源，解除连接停止未来共享。
3. **企业连接 × 服务协议/履约**：限制对端企业列表，增加双方确认和版本。
4. **协议 × 费用/结算**：使用协议快照，保持解除后的历史财务可追溯。
5. **任务/通知/审计**：补状态通知、任务接管和统一审计。
6. **移动端/后台任务/缓存**：显式租户上下文和会话失效。

不要同时在一个任务中重写全部模块；每个任务都应包含数据迁移、服务端授权、UI 状态和端到端测试。

## 7. 跨模块验收矩阵

每个相关模块至少验证：

1. 企业 A 用户不能通过手工 ID 读取或修改企业 B 对象。
2. 同一用户切换企业后，列表、详情、表单选项和缓存全部切换。
3. 企业连接处于 `PENDING/REJECTED/ENDED` 时，不产生新的私有业务访问。
4. 企业连接变为 `ACTIVE` 后，仍然只有显式授权的数据可见。
5. 连接解除后，未来共享停止，历史订单、履约、协议和结算保留。
6. 成员被停用后，Store、Pool、Channel、Location 四类权限全部失效。
7. Partner 没有系统账号或企业连接时，仍可正常用于采购和历史对账。
8. 邮箱相同不会自动关联 User、Partner 或 Organization。
9. 后台任务、API 和移动端与网页端执行相同的租户检查。
10. 所有越权失败都由服务端拒绝，不能只依赖隐藏按钮。

## 8. 其他对话的使用方式

开始其他模块任务时，可直接给对方：

> 请先阅读 `docs/account-organization-module-integration.md`，只处理其中与你负责模块相关的小节。保持 `User / Membership / Partner / OrganizationConnection / ServiceAgreement` 的职责分离；企业连接不等于业务授权。实现后补跨企业、连接解除和成员停用测试。
