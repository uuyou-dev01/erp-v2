# 首次登录与系统激活体验审计 / 编排计划

日期：2026-08-15  
审计范围：新账号注册、企业初始化、首次工作台、仓储位置、商品/SKU、库存、采购、上架、销售、共享供给、设置与侧边栏路由  
审计方法：全新账号真实走查 + 页面截图 + 路由/权限/数据依赖代码审查

## 1. 结论

用户提出的“页面不友好、侧边栏与隐性配置需要优化”方向是对的，但问题不能被归结为视觉或导航文案。

真正的 P0 问题是：系统在新企业只拥有企业、店铺和默认库存池时，就把用户送进成熟态工作台；仓库、销售平台、可运营 SKU、库存与上架前置均未完成，同时没有初始化清单、阻塞解释和修复后回跳。

因此本计划不主张给每个模块新增长教程，也不主张先全面改版。目标是建立一个“状态驱动、可跳过、可恢复”的激活闭环，并让所有缺失前置都能一键修复并返回原任务。

## 2. 已确认的事实

### P0：欢迎流程是死路

- 企业创建后跳转 /workbench?welcome=1。
- 工作台没有读取 welcome，新用户与成熟用户看到同一套任务队列。
- 零数据空状态只提示“使用快速录入添加商品”。
- 快速录入又可能在保存阶段才暴露“必须先有仓库位置”。

证据：

- app/actions/organization-onboarding.ts:55
- components/auth/onboarding-panel.tsx:34
- app/(dashboard)/workbench/page.tsx:20
- components/workbench/work-queue-list.tsx:123

### P0：库存侧栏的正式目录被动态货盘覆盖

config/navigation.ts 中已经定义：库存看板、单件库存、库存批次、期初库存、库存调整；但 components/layout/sidebar.tsx 遇到 /inventory/sellable 后只渲染动态市场货盘。零数据用户展开“库存管理”只看到“全部货盘”。

证据：

- config/navigation.ts:77
- components/layout/sidebar.tsx:274
- components/layout/sidebar.tsx:298

### P0：首次配置的关键修复链接存在断路

期初库存无仓库时跳 /inventory/locations/new，该页面立即重定向 /inventory/locations，不会自动打开“添加位置”，也不会在创建后返回期初库存。

证据：

- components/inventory/opening-stock-form.tsx:143
- app/(dashboard)/inventory/locations/new/page.tsx:5

### P0：菜单权限不等于路由权限

当前大部分角色差异只体现在侧边栏和命令面板过滤。Dashboard layout 主要校验登录、企业成员身份和店铺上下文，多个正式页面缺少路由级角色守卫；Header 与设置顶栏还会把企业/系统设置暴露给低权限角色。

这不是纯易用性问题，而是权限预期与数据暴露风险，必须与首次体验改造同批审计。

### P0：产品词汇“货盘”混指三类对象

1. 动态的“日本货盘/全部货盘”：实际是可售市场库存视图。
2. InventoryPool：实际是货权/租户隔离的技术库存池。
3. Marketplace SupplyOffer：实际是对外共享的供给单。

当前 Location 模型只有仓库、货代、个人、在途节点，没有“仓库 → 库区 → 货架 → 库位 → 实体托盘”层级。因此不能向用户暗示系统已经支持实体货盘/库位配置。

## 3. 产品原则

1. **先解释业务起点，再要求配置。** 新企业先选择“已有库存迁入”或“从零采购运营”。
2. **初始化清单来自真实数据状态。** 不依赖一次性布尔值；通过 hasLocation、hasOperationalSku、hasPlatform、hasInventory、hasListing 等状态计算。
3. **配置页复用正式业务页。** /setup 负责编排，不复制一套仓库、SKU、平台表单。
4. **所有阻塞都提供修复和回跳。** 使用统一 returnTo 合同，并保留原表单上下文。
5. **角色不可修复时明确说明。** 展示“联系管理员完成仓库配置”，而不是给无权限用户一个空下拉或隐藏入口。
6. **成熟用户不被新手流程打扰。** 初始化完成后侧栏只保留轻量“配置状态”，工作台恢复为当前任务队列。
7. **动态视图不能覆盖静态业务目录。** 市场库存是库存总览的筛选/子视图，不是批次、单件、期初、调整等模块的替代品。

## 4. 目标激活旅程

    /register
      → /onboarding                         个人账号 → 企业/首店/默认币种
      → /setup                              可恢复的初始化清单
           ├─ 选择业务起点                  已有库存迁入 / 从零采购
           ├─ 仓储位置                      必做（首笔入库前）
           ├─ 商品模型                      必做（SKU 或商品组+规格）
           ├─ 销售渠道                      首次上架/销售前必做
           ├─ 首批库存或首张采购单          二选一
           ├─ 首次可售校验                  自动检查位置能力/线路/库存状态
           ├─ 首次上架                      可选但建议
           └─ 团队与权限                    可选
      → /workbench?setup=complete

不建议把全部步骤塞进一个不可退出的大 Wizard。/setup 应是可恢复的 Hub：每项有状态、必要性、预计时间、下一步和跳过原因；刷新或换设备后仍能继续。

## 5. 路由与 Link 合同

### 5.1 核心路由

| 场景 | 目标路由 | 完成后的路由 |
|---|---|---|
| 新企业创建完成 | /setup?welcome=1 | 保留在 /setup |
| 创建首个仓库 | /inventory/locations?create=1&returnTo=%2Fsetup | /setup?completed=warehouse |
| 创建商品/SKU | /inventory/skus/new?returnTo=%2Fsetup | /inventory/skus/:id/created?returnTo=%2Fsetup |
| 已有库存迁入 | /inventory/opening-stock/new?returnTo=%2Fsetup | /setup?completed=opening-stock |
| 从零采购 | /procurement/new?returnTo=%2Fsetup | /procurement/:id?created=1&returnTo=%2Fsetup |
| 配置平台 | /listing/platforms/new?returnTo=%2Fsetup | /setup?completed=platform |
| 首次上架 | /listing/new?returnTo=%2Fsetup | /listing/:id?created=1&returnTo=%2Fsetup |
| 邀请团队 | /settings/team?returnTo=%2Fsetup | /setup?completed=team |
| 完成初始化 | /workbench?setup=complete | /workbench |

### 5.2 统一的前置修复链接

所有依赖对象使用同一规则：

    <repair route>?create=1&returnTo=<encoded current url>

示例：

    /inventory/opening-stock/new
      → 缺仓库
      → /inventory/locations?create=1&returnTo=%2Finventory%2Fopening-stock%2Fnew
      → 创建成功
      → /inventory/opening-stock/new?createdLocationId=:id

    /listing/new
      → 缺平台
      → /listing/platforms/new?returnTo=%2Flisting%2Fnew
      → 创建成功
      → /listing/new?createdPlatformId=:id

    /marketplace/new
      → 缺合作方
      → /settings/partners?create=1&returnTo=%2Fmarketplace%2Fnew
      → 创建成功并预选 partnerId

returnTo 必须经过允许的内部路由白名单校验，禁止外部 URL 和 // 开头路径。

### 5.3 成功后下一步

| 模块 | 当前问题 | 成功态应提供 |
|---|---|---|
| SKU | 局部闭环较好，但只强调期初库存 | 录入期初库存 / 创建采购单 / 返回配置清单 |
| 采购收货 | 返回列表，丢失新库存上下文 | 查看新增库存 / 去质检分流 / 去上架 |
| 销售订单 | 第一步只建订单头 | 按钮写“创建订单草稿并添加商品”，或改为完整向导 |
| 平台 | 固定返回平台列表 | 返回原任务并自动预选新平台 |
| 仓库 | 创建后留在列表 | 返回原任务并自动预选新位置 |
| 共享供给 | 表单复杂且无修复入口 | 缺库存/合作方时提供分支修复；成功进入供给详情 |

## 6. 侧边栏目标信息架构

    开始使用（仅初始化未完成时置顶）
      配置清单 2/5                  /setup

    今日工作
      工作台                        /workbench
      异常中心                      /workbench?queue=exception
      通知                          /notifications

    采购入库
      采购单                        /procurement
      集运与转仓                    /logistics/consolidations
      代发履约                      /fulfillment/requests

    商品
      商品档案                      /inventory/skus
      商品情报                      /product-intelligence
      情报采集箱                    /product-intelligence/captures

    库存
      库存总览                      /inventory/sellable
      批次库存                      /inventory/lots
      单件库存                      /inventory/items
      期初库存                      /inventory/opening-stock
      盘点与调整                    /inventory/stocktake
      仓储位置                      /inventory/locations
      可售市场视图
        中国                        /inventory/sellable?market=CN
        日本                        /inventory/sellable?market=JP
        美国                        /inventory/sellable?market=US

    销售出库
      上架记录                      /listing
      销售订单                      /sales
      售后                          /sales/after-sales

    共享供给
      供给市场                      /marketplace
      我的供给                      /marketplace/my-offers
      代卖记录                      /resale

    报表
      经营报表                      /reports
      团队工作量                    /reports/team

    设置
      个人                          /settings/personal
      企业与成员                    /settings/company
      基础资料与渠道                /settings/system
      财务                          /finance/charges

实施要求：

- 恢复静态库存子菜单；动态市场项只追加在“可售市场视图”下。
- 修正默认展开键“库存看板”与父项“库存管理”不一致。
- 父级菜单应能进入默认首页；展开箭头单独负责开合，避免“点击名称只展开不跳转”。
- 设置页与侧边栏使用同一导航源，避免“系统设置”在两处代表不同内容。
- 按角色同时过滤侧栏、Header、设置顶栏、命令面板，并在服务端执行相同权限策略。

## 7. 模块审核与优先级

| 模块 | 健康度 | 主要问题 | 建议 |
|---|---|---|---|
| 登录/注册 | 中 | 文案清楚，但“内部测试”定位和 next 路由语义割裂 | 注册成功统一进入 onboarding/setup 分流 |
| 企业初始化 | 差 | 只建企业/店铺，假装已经“进入工作台” | 跳 /setup，组织名后续可编辑 |
| 工作台 | 差（新手）/好（成熟） | 零数据仍展示成熟任务队列 | 零数据主区域替换为初始化清单 |
| 快速录入 | 差（新手） | 一次暴露密集表格，仓库缺失在后段才出现 | 初始化完成前改为“创建第一笔采购/已有库存迁入”双入口 |
| 仓储位置 | 中 | 空状态好；首次表单同时要求地区、类型、能力、线路、可分配 | 提供自有仓/货代/个人/在途预设，高级能力折叠 |
| 商品/SKU | 好 | 创建和创建后下一步是当前最佳模式 | 扩展采购分支与 returnTo，作为其他模块范式 |
| 采购入库 | 中 | 目的仓可空；收货后上下文丢失 | 前置解释 + 收货成功任务卡 |
| 库存 | 差 | 入口被隐藏；四种录库存方式边界不清 | 恢复目录，用业务问题引导选择录入方式 |
| 上架/平台 | 中 | 平台缺失无一键修复；自定义平台可能保存后消失 | core template + returnTo；修复平台白名单逻辑 |
| 销售出库 | 中 | 建单只建订单头；缺库存无修复 CTA | 明确草稿语义或改向导，增加补库存入口 |
| 共享供给 | 差（新手） | 前置多、表单过重、货盘词义冲突 | 4 步渐进表单，改名“共享供给” |
| 设置 | 中 | 页面和侧栏分类不一致，基础配置隐蔽 | 统一 IA，显示配置完整度与权限 |
| 权限 | 高风险 | 菜单过滤未形成服务端路由/动作闭环 | 建立 route/action 权限矩阵并自动测试 |

## 8. 词汇重构

| 当前词 | 问题 | 建议词 |
|---|---|---|
| 仓库位置 / 仓位 / 库位 / 节点 | 当前模型只有 Location，却暗示不同粒度 | UI 统一“仓储位置”；能力区称“履约节点能力” |
| 货盘（市场视图） | 不是可配置托盘 | “可售市场库存” |
| InventoryPool | 技术边界不应默认暴露 | “库存池”，只在高级业务归属设置出现 |
| 货盘市场 / SupplyOffer | 与物理货盘冲突 | “共享供给市场” / “供给单” |
| 上架运营 | 同时包含记录、渠道与可售覆盖 | 一级“上架记录”，设置中“销售平台” |

如果未来确实要管理实体库位/托盘，应新增独立领域模型与条码层级；不能通过改文案假装已有该能力。

## 9. 统一前置门组件

建议实现 PrerequisiteGate，由业务页提供缺失项数组：

    type Prerequisite = {
      key: "location" | "sku" | "platform" | "inventory" | "partner";
      title: string;
      reason: string;
      canFix: boolean;
      repairHref?: string;
      ownerRole?: string;
    };

显示规则：

- 可修复：添加仓储位置并返回。
- 无权限：需要企业管理员完成仓储位置配置 + 可复制的请求文案。
- 多解法：缺库存时提供“期初库存 / 创建采购单 / 库存调整”三个业务分支。
- 不允许只展示空下拉、提交后通用错误或不可点击说明文字。

## 10. 数据与状态

推荐由服务端统一返回：

    type SetupStatus = {
      organization: "complete";
      businessStart: "opening_stock" | "procurement" | null;
      warehouse: "required" | "complete" | "skipped";
      catalog: "required" | "complete" | "skipped";
      channel: "recommended" | "complete" | "skipped";
      firstInventory: "pending" | "complete" | "not_applicable";
      sellability: "unchecked" | "blocked" | "ready";
      firstListing: "optional" | "complete" | "skipped";
      team: "optional" | "complete" | "skipped";
    };

完成状态优先从真实业务数据推导；用户的“业务起点、跳过原因、最后访问步骤”才需要持久化。不要把 setup 完成简单绑定到 welcome=1 或一次性 cookie。

## 11. 实施编排

### 阶段 A：P0 断路与安全基线

1. 新建 /setup Hub；企业创建后改跳 /setup?welcome=1。
2. 工作台对未完成核心配置的 OWNER 展示配置卡，而不是零任务队列。
3. 修复库存侧栏静态目录被动态货盘覆盖、默认展开键错误。
4. 将 /inventory/locations/new 改为可工作的创建深链，或全部替换为 ?create=1。
5. 平台、仓库、SKU、库存等 Server Action 建立统一角色校验。
6. 修复 Header/SettingsNav 越权入口和自定义平台保存后消失。

交付门槛：新 OWNER 不会进入无解释空工作台；所有可见路由与动作权限一致。

### 阶段 B：可恢复的配置闭环

1. 实现 SetupStatus 查询和 setup checklist。
2. 实现内部安全 returnTo、createdXId 回填和返回时预选。
3. 实现统一 PrerequisiteGate。
4. 仓库表单增加场景预设并折叠高级能力。
5. SKU、期初库存、采购、平台复用正式页面接入 setup。

交付门槛：用户可以中途离开、刷新、切店铺后继续；任一缺失前置均有下一步。

### 阶段 C：模块成功态与词汇收口

1. 收货、SKU 创建、平台创建、仓库创建增加任务式成功卡。
2. 销售订单明确草稿语义；共享供给改为渐进式步骤。
3. 统一“仓储位置 / 可售市场库存 / 库存池 / 共享供给”词汇。
4. 设置页与侧边栏共用 IA 配置源。
5. 清理旧路由 /inventory/coverage*、/listing/pending 的业务引用。

### 阶段 D：验证与持续优化

1. 新 OWNER、受邀 ADMIN、LISTING、FULFILLMENT、VIEWER 五类角色 E2E。
2. 键盘、焦点、读屏名称、缩放与窄屏检查。
3. 新手可用性测试：至少 5 位未接触过系统的目标用户。
4. 根据埋点和录像优化步骤顺序，而不是继续堆帮助文案。

## 12. 分工建议

| 工作流 | 负责人类型 | 输出 |
|---|---|---|
| 激活模型与 SetupStatus | 后端/领域 | 状态查询、持久字段、权限策略 |
| Setup Hub 与零数据工作台 | 前端/产品 | 清单、分流、恢复、完成态 |
| 侧边栏与设置 IA | 前端/设计系统 | 单一导航源、动态市场追加、角色可见性 |
| 前置修复与 returnTo | 前端+后端 | 通用 Gate、安全回跳、自动预选 |
| 仓库/SKU/库存/平台接入 | 各模块 owner | 路由契约、成功态、空态 |
| 权限矩阵 | 后端/安全 | 页面和 Action 同策略、负向测试 |
| QA 与研究 | QA/产品 | E2E、可用性脚本、可访问性验证 |

## 13. 验收标准

### 核心体验

- 全新 OWNER 在 10 分钟内能够完成：企业 → 仓储位置 → SKU → 期初库存或首张采购单。
- 用户任何时刻都能回答“我为什么要做这一步、做完去哪里、可以稍后做吗”。
- 所有空下拉都配有新增/修复入口，或明确无权限原因。
- 配置页完成后自动返回原任务，并预选刚创建对象。
- 未完成初始化时离开，返回后能恢复到同一组织/店铺的进度。

### 路由与导航

- 库存侧栏始终出现总览、批次、单件、期初、调整、仓储位置。
- 市场库存动态项不会覆盖静态模块。
- 设置页、Header、侧栏、命令面板对同一角色显示一致。
- 所有旧兼容路由有明确重定向测试，业务代码不再把它们当主路径。

### 权限

- 低权限角色直接输入隐藏 URL 时得到明确拒绝或安全重定向。
- 页面、Server Action、查询采用同一权限矩阵。
- 无修复权限的用户不会看到可执行 CTA。

### 可访问性

- 所有图标按钮有可读名称；当前侧栏折叠按钮和部分弹窗关闭按钮需要补齐。
- 抽屉/弹窗打开后焦点进入、Tab 不逃逸、关闭后焦点返回触发器。
- 错误与成功状态不仅靠颜色表达，并通过语义状态区域通知。
- 200% 缩放和窄屏下表单不横向裁切；快速录入表需要替代的窄屏方案。

## 14. 指标

建议埋点：

- setup_started
- setup_step_viewed
- setup_step_completed
- setup_step_skipped
- prerequisite_blocked
- prerequisite_repaired
- first_location_created
- first_operational_sku_created
- first_inventory_created
- first_purchase_order_created
- first_listing_created
- setup_completed

核心指标：

- 注册到首个有效库存的中位时长。
- 新企业 24 小时内完成“仓库 + SKU + 库存/采购”的比例。
- 前置阻塞出现到修复完成的转化率。
- setup 第一步至核心配置完成率。
- 7 日内再次进入工作台并完成第二个业务动作的比例。

## 15. 证据与限制

截图保存在：.codex-audit/first-login-2026-08-15/

1. 01-login.png：登录页。
2. 02-register.png：注册页。
3. 03-organization-setup.png：企业/首店初始化。
4. 04-empty-workbench.png：新企业空工作台。
5. 05-first-quick-entry.png：首次快速录入抽屉。
6. 06-empty-locations.png：仓储位置空状态。
7. 07-location-form.png：首次仓库配置表单。
8. 08-inventory-sidebar-expanded.png：库存侧栏展开后只显示“全部货盘”。
9. 09-system-settings.png：隐藏在系统设置内的商品分类、平台、仓库入口。

本审计可确认页面结构、可发现性、路由、可见文案和部分语义结构；不能仅凭截图宣称完整 WCAG 合规。键盘焦点、读屏输出、缩放重排、真实仓库作业流程仍需专项验证。
