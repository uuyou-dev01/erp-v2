# 多人协作、账户权限、任务通知与人员统计设计

日期：2026-06-12

## 背景

当前系统已经形成较完整的跨境交易 ERP 主流程：

采购录入 -> 补物流 -> 到货检查 -> 上架 -> 售出登记 -> 通知发货 -> 结算

用户对当前流程方向基本满意，本轮设计不推翻现有工作台、采购、物流、上架、销售、发货和结算路径，而是在其上补齐多人协作能力。目标是让一个主体团队可以经营多个店铺和多个平台账号，并清楚记录谁被委托、谁收到通知、谁完成了上架/打包/发货/结算，以及每个人完成了多少工作。

已有测试报告指出当前系统仍有几个阻碍多人使用的问题：硬编码 `store_1`、缺少登录态和服务端授权、库存分配未锁库存、关键流程缺少自动化测试。因此实施顺序必须先稳定核心流程和身份边界，再叠加任务、通知和统计。

## 目标

1. 保留现有工作台主流程，不重做业务入口。
2. 建立主体团队、成员、店铺、平台账号之间的清晰关系。
3. 让系统所有关键操作都知道当前用户是谁、属于哪个团队、能操作哪些店铺。
4. 将上架、打包、发货、结算等协作行为沉淀为可指派、可通知、可统计的任务。
5. 在顶部通知入口和工作台中展示与当前用户相关的待办和通知。
6. 支持按人员、店铺、平台、时间范围统计上架数、发货数、打包数、结算数和任务完成效率。
7. 补齐最小测试体系，防止多人功能引入后破坏库存、订单和发货流程。

## 非目标

1. 第一阶段不接入微信、短信、邮件等外部通知。
2. 第一阶段不把系统改造成公开 SaaS 平台；设计保留多主体扩展能力，但默认服务于一个经营主体内部团队。
3. 第一阶段不替换当前 ERP 底座，也不大规模迁移到其他开源 ERP。
4. 第一阶段不做复杂排班、工时、薪资绩效，只做业务产出和任务效率统计。
5. 第一阶段不实现实时 WebSocket 推送，站内通知通过页面加载和手动刷新即可。

## 设计原则

1. 以当前工作台为中心：待办队列继续作为运营入口。
2. 任务是协作事实：人员统计优先从任务完成记录和操作日志推导，而不是从订单文本字段猜测。
3. 服务端权限优先：客户端传入的 `storeId`、`assigneeId` 只能作为请求参数，真实权限由服务端当前 session 和数据库关系判断。
4. 低耦合扩展：账户、任务、通知、统计可以逐步接入不同业务模块。
5. 审计可追溯：关键状态变化记录委托人、负责人、实际操作人、完成时间和关联业务对象。

## 领域模型

### 组织层级

```text
Organization
  User
  Store
    PlatformAccount
```

`Organization` 表示经营主体或公司。当前 `Store` 已存在，但更适合表达店铺或经营单元；新增主体层可以避免把“公司”和“店铺”混在一起。

`User` 属于一个主体，可以通过成员关系访问一个或多个店铺。

`Store` 表示具体店铺、业务线或销售主体。一个主体可以有多个店铺。

`PlatformAccount` 表示店铺绑定的平台账号，例如 Mercari A 账号、闲鱼 A 账号、eBay 店铺。现有 `Platform` 更像平台配置，后续可保留为平台类型/配置，也可扩展为平台账号。

### 用户与权限

推荐角色：

```text
OWNER        主体负责人，管理所有店铺、成员、权限和配置
ADMIN        管理员，管理指定范围内的业务数据和成员
MANAGER      运营负责人，分配任务、处理异常、查看统计
LISTING      上架人员，处理上架任务
FULFILLMENT  打包发货人员，处理打包、发货、物流凭证
FINANCE      财务人员，处理结算、费用、利润报表
VIEWER       只读成员
```

权限设计采用“全局角色 + 店铺授权 + 能力点”的组合：

```text
Membership
  userId
  organizationId
  role
  status

StoreAccess
  userId
  storeId
  role
  permissions
```

第一阶段可以先用角色映射权限，不需要做完整权限矩阵 UI；但服务端要预留 `permissions` 字段，方便后续细化。

### 任务

新增通用任务模型，用于承载多人协作：

```text
Task
  id
  organizationId
  storeId
  type
  status
  priority
  title
  description
  refType
  refId
  createdById
  assignedToId
  delegatedToId
  completedById
  assignedAt
  dueAt
  startedAt
  completedAt
  cancelledAt
  metadata
  createdAt
  updatedAt
```

`type` 建议值：

```text
LISTING_CREATE
LISTING_UPDATE
PACK_ORDER
SHIP_ORDER
CONFIRM_ARRIVAL
INSPECT_ITEM
SETTLE_ORDER
RESOLVE_EXCEPTION
```

`status` 建议值：

```text
OPEN
ASSIGNED
IN_PROGRESS
DONE
CANCELLED
OVERDUE
```

`assignedToId` 表示任务当前负责人。`createdById` 表示委托人或创建人。`completedById` 表示实际完成人。`delegatedToId` 用于明确“委托给谁发送/处理”的场景；第一阶段也可以和 `assignedToId` 保持一致。

### 通知

新增站内通知模型：

```text
Notification
  id
  organizationId
  storeId
  recipientId
  actorId
  taskId
  refType
  refId
  type
  title
  body
  readAt
  createdAt
```

通知触发规则：

1. 任务创建并指派给某人：通知负责人。
2. 任务转派：通知新负责人，必要时通知原负责人。
3. 任务完成：通知委托人和运营负责人。
4. 任务逾期：通知负责人和运营负责人。
5. 发货凭证暂存：通知发货负责人。
6. 发货确认完成：通知委托人、运营负责人和需要结算的人。
7. 订单进入待结算：通知财务或指定结算负责人。
8. 任务异常或取消：通知任务相关人。

第一阶段只做站内通知。顶部铃铛显示未读数量和最近通知列表，通知可点击跳转到工作台详情或业务详情页。

### 操作日志

新增轻量审计日志：

```text
ActivityLog
  id
  organizationId
  storeId
  actorId
  action
  refType
  refId
  taskId
  before
  after
  message
  createdAt
```

统计优先使用任务和业务表，操作日志用于追溯和补充。关键行为必须写日志：登录相关可后置，业务状态变化优先。

## 工作台改动

现有工作台保留。新增以下能力：

1. 待办项展示负责人、委托人、截止时间和任务状态。
2. 待办列表支持筛选：
   - 我的任务
   - 我委托的任务
   - 全部任务
   - 按店铺
   - 按平台
   - 按负责人
3. Action Drawer 中增加任务信息区：
   - 任务类型
   - 当前负责人
   - 委托人
   - 可转派给其他成员
   - 完成后记录实际操作人
4. 当前 `ShipOrderForm` 中的自由文本“发货人”保留为实际发货备注，但新增系统用户负责人选择。发货确认时写入：
   - 任务完成人 `completedById`
   - 订单发货操作人
   - 发货凭证里的实际发货说明
5. 上架动作完成时生成或完成 `LISTING_CREATE` 任务，用于统计上架人员产出。
6. 订单确认后自动生成 `PACK_ORDER` 或 `SHIP_ORDER` 任务。第一阶段可以合并为 `SHIP_ORDER`，后续再拆打包和发货。
7. 结算队列进入待结算时生成 `SETTLE_ORDER` 任务。

## 页面与导航

新增或调整页面：

1. `/settings/team`
   - 成员列表
   - 邀请成员
   - 修改角色
   - 启用/停用成员

2. `/settings/stores`
   - 店铺列表
   - 店铺基础信息
   - 店铺成员授权

3. `/listing/platforms`
   - 保留现有平台配置
   - 后续区分平台类型和平台账号

4. `/notifications`
   - 通知列表
   - 未读/已读筛选
   - 点击跳转业务对象

5. `/reports/team`
   - 人员工作量统计
   - 上架统计
   - 发货统计
   - 任务完成率和逾期统计

顶部 Header：

1. 铃铛显示未读数量。
2. 用户按钮显示当前用户、角色和当前店铺。
3. 后续可增加店铺切换器。

## 统计口径

### 上架统计

指标：

1. 上架任务完成数。
2. 创建 Listing 数。
3. 涉及 SKU 数。
4. 涉及平台账号数。

主口径：

```text
Task.type in (LISTING_CREATE, LISTING_UPDATE)
Task.status = DONE
Task.completedById = userId
Task.completedAt within range
```

辅助口径：

```text
Listing.createdAt within range
Listing.createdById = userId
```

如果第一阶段 `Listing` 暂未增加 `createdById`，以任务口径为准。

### 发货统计

指标：

1. 发货任务完成数。
2. 发货订单数。
3. 发货件数。
4. 平均从任务分配到完成的时长。
5. 按店铺、平台、国家流向拆分。

主口径：

```text
Task.type = SHIP_ORDER
Task.status = DONE
Task.completedById = userId
Task.completedAt within range
```

订单件数从 `CustomerOrder.lines.quantity` 汇总，店铺和平台从订单关联字段获取。

### 打包统计

第一阶段如果打包和发货不拆分，则打包统计暂时等同发货任务；页面上标注为“打包/发货”。当后续新增 `PACK_ORDER` 后独立统计。

### 结算统计

主口径：

```text
Task.type = SETTLE_ORDER
Task.status = DONE
Task.completedById = userId
Task.completedAt within range
```

辅助指标包括结算订单数、结算金额、平台手续费、实际邮费、利润确认金额。

### 任务效率

指标：

1. 完成任务数。
2. 未完成任务数。
3. 逾期任务数。
4. 平均处理时长：`completedAt - startedAt` 或 `completedAt - assignedAt`。
5. 完成率：完成任务数 / 分配任务数。

## 实施路线

### Milestone 1：现有流程体检与修复

目标：在多人能力进入前，保证库存、订单、发货和构建基线可靠。

范围：

1. 修复发货批次剩余量重复扣减。
2. 修复销售库存分配不锁库存的问题。
3. 明确 `OrderAllocation` 状态流转。
4. 将依赖数据库的 dashboard 页面设为动态渲染或改为运行时读取。
5. 增加基础错误页和 loading 状态。
6. 补最小业务回归测试：
   - 采购入库写账本
   - 销售分配锁定库存
   - 发货扣库存
   - 取消订单释放库存
   - 退货回补库存

验收：

1. `npm run build` 通过。
2. `npx prisma validate` 通过。
3. 业务回归测试覆盖库存分配和发货扣减。
4. 手工 smoke test 覆盖 `/workbench`、`/sales`、`/listing`、`/reports`。

### Milestone 2：账户、主体、店铺与权限

目标：系统能识别当前用户，并基于用户权限访问对应店铺。

范围：

1. 引入 `Organization`、`Membership`、`StoreAccess`。
2. 改造 `User` 与 `Store` 关系，兼容现有数据。
3. 建立 `requireUserContext()`，返回 `userId`、`organizationId`、`storeIds`、`activeStoreId`、`role`。
4. Server Actions 不再信任客户端传入的 `storeId`。
5. 替换核心页面和 action 中的硬编码 `store_1`。
6. 增加团队成员管理页。

验收：

1. 未登录访问 dashboard 被拦截或进入登录流程。
2. 当前用户只能读写授权店铺。
3. 核心 Server Actions 都通过 `requireUserContext()` 获取 store 范围。
4. 种子数据包含至少一个主体、两个用户、两个店铺和平台配置。

### Milestone 3：任务指派与站内通知

目标：工作台待办可以指派给人，相关人能收到通知。

范围：

1. 新增 `Task`、`Notification`、`ActivityLog`。
2. 工作台查询合并业务待办和任务负责人信息。
3. 订单进入待发货时生成发货任务。
4. 上架流程生成/完成上架任务。
5. 结算流程生成/完成结算任务。
6. Action Drawer 支持指派、转派、完成任务。
7. 顶部铃铛展示未读通知数量和最近通知。
8. 通知列表页支持标记已读。

验收：

1. 委托某人发货后，该用户能在“我的任务”和铃铛中看到通知。
2. 发货人确认发货后，任务状态变为完成，并记录实际完成人。
3. 委托人能收到完成通知。
4. 转派任务会通知新负责人。

### Milestone 4：人员统计与运营报表

目标：能按人员、店铺、平台和时间范围看到产出。

范围：

1. 新增团队统计查询服务。
2. 新增 `/reports/team`。
3. 统计上架任务、发货任务、结算任务、逾期任务。
4. 发货统计关联订单件数、平台和国家流向。
5. 支持导出 CSV。

验收：

1. 可以查看某人在某时间段发了多少单、多少件。
2. 可以查看某人在某时间段上架了多少条 Listing。
3. 可以按店铺和平台过滤。
4. 统计数字能追溯到任务列表。

### Milestone 5：测试与持续质量

目标：把关键业务流程固化为自动化测试。

范围：

1. 引入 Vitest。
2. 建立业务单元测试：
   - 费用计算
   - 库存可用量
   - 任务统计口径
   - 通知触发规则
3. 建立集成测试：
   - 采购到入库
   - 售出到发货
   - 委托发货到通知完成
   - 人员统计汇总
4. 建立 Playwright smoke test：
   - dashboard
   - workbench
   - sales
   - listing
   - reports
   - notifications

验收：

1. 本地测试命令稳定通过。
2. 测试覆盖多人任务、通知和发货统计核心路径。
3. 主路由无空白页和明显 runtime error。

## 数据迁移策略

1. 保留现有 `Store` 数据，为每个现有店铺挂到默认 `Organization`。
2. 为现有 `User` 创建默认 `Membership` 和 `StoreAccess`。
3. 为历史订单、Listing、发货记录补空的操作人字段，不强行推断历史完成人。
4. 从新功能上线时间点开始，任务和通知作为统计事实来源。
5. 历史统计可以单独标注为“系统上线前数据，不含人员归属”。

## 开源 ERP 借鉴策略

可以参考开源 ERP 的模块边界和权限设计，但不建议当前阶段迁移底座。原因：

1. 当前系统已经贴近跨境倒买倒卖业务，有自定义的库存、Listing、代发和工作台流程。
2. 通用 ERP 通常偏采购、销售、财务，不一定覆盖平台 Listing、单品成色、代发凭证和跨境流向。
3. 迁移成本会高于在现有系统上补齐账户、任务和通知。

可借鉴方向：

1. 角色权限矩阵。
2. 审计日志。
3. 任务中心和通知中心。
4. 报表筛选和导出体验。

## 风险与缓解

1. 风险：权限改造范围大，容易遗漏 Server Action。
   缓解：先建立 `requireUserContext()` 和 action wrapper，再逐模块替换。

2. 风险：任务与现有工作台待办重复。
   缓解：任务作为协作层，业务队列仍由现有工作台查询派生；工作台展示时合并任务状态。

3. 风险：人员统计口径不一致。
   缓解：明确主口径来自 `Task.completedById/completedAt`，业务表操作人作为辅助校验。

4. 风险：通知噪音过多。
   缓解：第一阶段只通知指派、转派、完成、逾期、异常，不做每个小字段变更通知。

5. 风险：库存问题未修复前多人并发放大错误。
   缓解：Milestone 1 先修库存锁定和发货扣减，再实施多人任务。

## 推荐下一步

1. 先执行 Milestone 1，完成当前流程体检、库存修复和最小测试。
2. 同步准备 Milestone 2 的数据模型和认证方案。
3. Milestone 3 开始把当前“通知发货”升级为正式任务和站内通知。
4. Milestone 4 再基于任务事实做人员统计。

这个顺序能最大限度保留当前流程，同时把多人协作能力稳稳接入系统。
