# v0.9.0 产品 UI / UX / 信息架构审计

- 审计日期：2026-08-28
- 审计版本：`0.9.0-rc.1`
- 审计身份：合成 OWNER，多经营主体、多店铺
- 验证环境：`NODE_ENV=production`，production build/start，Chrome，`workers=1`
- 隔离范围：仅 `erp_v090_ux_e2e`，端口 `3104`
- 证据：本轮独立生成的 16 张 before、16 张 after，以及主负责人独立操作生成的 6 张复核截图
- 结论：未发现阻止上线的 P0；本轮确认的 5 组 P1 和 2 组 P2 已修复并通过生产模式复验；仍有 3 项 P2 建议进入后续版本。

## 审计方法与覆盖流程

本轮先在未修改界面上采集证据并逐张检查，再实施最小修复，最后用相同数据和视口重新截图。未使用通用 seed、`db push` 或开发身份回退。

1. 工作台：登录后检查系统结构、侧边栏分组、任务入口和顶部全局入口。
2. 商品主数据：从「商品档案」列表点击商品，进入详情页。
3. 上下文动作：在详情页切换「库存与上架」，确认动作后的页面状态和返回路径。
4. 通知深链：从通知中心点击「商品资料已完成复核」，抵达对应 SKU 详情。
5. 设置入口：从账号菜单进入企业设置，确认设置层级和跨模块跳转。
6. 空态与错误态：检查无货盘空态、无效 SKU 的 404 恢复路径。
7. 窄屏桌面：检查账号工作空间、移动侧栏、关闭方式、键盘焦点。
8. 移动端：检查首页、我的、消息三页的企业 / 店铺上下文与缩放配置。

## 产品结构与信息架构判断

当前一级结构按用户任务而非技术实体分成「工作台」「采购与仓配」「商品与库存」「上架与订单」「货盘与代卖」「收益与报表」，方向正确。工作台承担待办聚合，商品详情承担跨库存、上架、采购、销售的关联入口，通知承担异步任务回流，账号菜单承担个人 / 企业 / 系统设置。对首批约 10 名用户，这套结构已经可以支撑日常运营。

明显做得好的部分：

- 工作台同时给出生命周期队列、责任归属和下一步动作，信息优先级清楚。
- 商品列表到详情再到「库存与上架」的路径短，详情页返回按钮、页内标签和关联入口一致。
- 企业设置以「成员、店铺、仓库协作、业务归属与协作、合作方」组织，适合多账号业务。
- 货盘市场空态说明原因并给出「发布货盘」行动，不是只有空白表格。
- 移动端首页将现场任务、快速采集与异常数量置于首屏，视觉密度和触控尺寸合理。

## P0

本轮未发现 P0。

## P1（已修复）

### P1-1 窄屏无法确认或切换企业 / 店铺

- 证据：修改前的[窄屏账号菜单](./product-ux-audit/screenshots/before/12-small-dashboard-account-menu.png)只显示企业名称，没有店铺，也没有切换控件；[移动首页](./product-ux-audit/screenshots/before/14-mobile-home.png)、[我的](./product-ux-audit/screenshots/before/15-mobile-me-context.png)和[消息](./product-ux-audit/screenshots/before/16-mobile-notifications.png)也缺少完整企业上下文。
- 用户影响：多经营主体用户可能在错误企业或店铺下录入采购、库存和履约数据，属于高频且难逆转的上下文误判。
- 修复：窄屏账号菜单新增「当前工作空间」及企业 / 店铺选择器；桌面顶部选择器增加可见「企业」「店铺」标签；账号摘要显示企业与店铺；移动首页、我的、消息均显示「企业 · 店铺」。
- 复验：[窄屏账号菜单](./product-ux-audit/screenshots/after/12-small-dashboard-account-menu.png)、[移动首页](./product-ux-audit/screenshots/after/14-mobile-home.png)、[我的](./product-ux-audit/screenshots/after/15-mobile-me-context.png)、[消息](./product-ux-audit/screenshots/after/16-mobile-notifications.png)。

### P1-2 移动侧栏被顶栏遮住，关闭与键盘路径不完整

- 证据：[修改前侧栏](./product-ux-audit/screenshots/before/13-small-dashboard-sidebar.png)顶部标题与关闭按钮被固定顶栏覆盖，只能依赖点击遮罩退出。
- 用户影响：触屏用户不容易发现关闭方式；键盘用户可能把焦点移动到遮罩后的页面。
- 修复：提高侧栏层级，增加可见关闭按钮和 dialog 语义；打开后聚焦关闭按钮，Tab / Shift+Tab 在对话框内环绕，Esc 关闭并把焦点交还菜单按钮。
- 复验：[修改后侧栏](./product-ux-audit/screenshots/after/13-small-dashboard-sidebar.png)，自动化同时断言初始焦点、Esc 关闭和焦点返回。

### P1-3 404 为英文死路且无恢复入口

- 证据：[修改前 404](./product-ux-audit/screenshots/before/11-desktop-error-404.png)使用 Next 默认英文文案，没有返回路径。
- 用户影响：通知或历史链接指向已删除记录时，中文用户无法判断原因，也无法快速回到业务上下文。
- 修复：新增中文 404，解释「删除、链接失效或权限」三种可能，并提供「返回工作台」「返回通知」。
- 复验：[修改后 404](./product-ux-audit/screenshots/after/11-desktop-error-404.png)。

### P1-4 全局搜索和移动缩放的基础可访问性不足

- 证据：[命令面板](./product-ux-audit/screenshots/before/03-desktop-command-palette.png)视觉上是模态层，但缺少 dialog 标题和关闭按钮名称；移动 viewport 禁止用户缩放。
- 用户影响：屏幕阅读器无法准确宣布面板用途；低视力用户无法放大移动页面。
- 修复：增加 `role="dialog"`、`aria-modal`、隐藏标题、输入与关闭按钮名称；移除 `maximum-scale=1`。
- 复验：[修改后命令面板](./product-ux-audit/screenshots/after/03-desktop-command-palette.png)，自动化断言 dialog 名称、关闭按钮名称及 viewport 不含 `maximum-scale`。

### P1-5 通知深链客户端跳转出现 host 不一致

- 证据：生产模式复验中，通知的客户端路由曾从 `127.0.0.1` 跳到 `localhost`，host-only 会话 cookie 不随请求发送，最终落到登录页。
- 用户影响：用户从通知进入业务记录时可能被误判为未登录，破坏「提醒 → 处理」闭环。
- 修复：通知业务链接改为同源的标准文档导航，并同时增加外链图标和明确的「标为已读」文字，避免图标含义不清。
- 复验：[通知列表](./product-ux-audit/screenshots/after/07-desktop-notifications.png)点击后到达[对应 SKU](./product-ux-audit/screenshots/after/08-desktop-notification-deep-link.png)；最终完整 production E2E 通过。

## P2（本轮继续关闭）

### P2-1 移动通知没有遵循通用业务目标

- 证据：移动通知列表原先把没有 `taskId` 的通知统一链接到任务页；商品、货盘、协议等通知无法进入真实业务对象。
- 用户影响：非任务类通知在移动端无法形成准确闭环。
- 修复：任务通知继续进入移动任务详情，其他通知统一先经过鉴权通知跳转入口，再按通知记录中的业务目标切换企业上下文并进入对象；失效对象落到中文恢复页。
- 复验：[移动消息页](./product-ux-audit/screenshots/after/16-mobile-notifications.png)已经持有通知专属目标，完整 production E2E 同时覆盖桌面深链和撤权后的拒绝路径。

### P2-2 通知类型缺少完整的人类可读映射

- 证据：桌面通知原先会在未知类型时显示原始代码 `PRODUCT_RECORD_READY`。
- 用户影响：新增通知类型若未同步 UI 映射，会泄漏内部术语。
- 修复：补齐商品、仓库、企业连接、服务协议、货盘、履约、结算和成员权限类型的人类可读中文标签。
- 复验：[桌面通知](./product-ux-audit/screenshots/after/07-desktop-notifications.png)显示「商品资料」，不再暴露内部枚举。

## P2（后续建议）

### P2-3 长侧栏可能把低频模块挤出首屏

- 证据：[桌面侧栏](./product-ux-audit/screenshots/after/01-desktop-workbench-navigation.png)在 720px 高度已需要滚动；动态可售货盘项会继续增加高度。
- 用户影响：收益、报表和设置类入口的发现成本随业务增长上升。
- 建议：保留现有分组，但限制动态市场视图默认展开数量，并考虑记忆分组展开状态；不建议当前版本大改导航。

### P2-4 商品列表操作列在标准桌面宽度下需要横向滚动

- 证据：[商品列表](./product-ux-audit/screenshots/after/04-desktop-inventory-list.png)在 1280px 视口主要展示经营指标，右侧操作列位于横向滚动区域。
- 用户影响：低频编辑 / 停用动作不易发现；但商品名称本身可进入详情，主流程未中断。
- 建议：后续评估将唯一主要动作固定在首列或改为行点击；不要同时保留多个竞争性入口。

### P2-5 账号弹层的 ARIA 模式仍可收敛

- 证据：账号弹层既包含导航项，又在窄屏包含表单选择器，目前沿用 `menu` 语义。
- 用户影响：部分屏幕阅读器可能按菜单模式解释其中的表单控件。
- 建议：后续将其统一成带标题的 popover / dialog，并完成方向键或焦点模型；本轮优先保证多主体切换可用。

## 视觉与响应式复验

- 桌面：页面标题、主行动、筛选、内容区层级稳定；未引入新的视觉风格。
- 窄屏桌面：工作台内容保持可滚动，账号弹层在 390×844 内完整显示，侧栏覆盖和遮罩关系正确。
- 移动：390×844 下首页、我的、消息均无横向溢出，底部导航和安全区布局正常；企业 / 店铺上下文已经进入首屏。
- 空态：货盘空态有说明与行动；商品库存页的空上架状态能说明当前无记录。
- 错误态：无效记录已由英文框架页改成中文可恢复页面。

## 验证结果与限制

- 完整命令：`TEST_DATABASE_URL=<erp_v090_ux_e2e> DATABASE_URL=<erp_v090_ux_e2e> E2E_PORT=3104 npx playwright test tests/e2e/product-ux-audit.spec.ts --project=chrome --workers=1`
- 最终结果：产品审计 `7 passed (41.0s)`；全量 production E2E `54/54 passed (2.6m)`。
- 静态检查：`npm run typecheck`、122 个测试文件 / 503 个 Vitest 用例、production build、`git diff --check` 均通过。
- 所有截图均已人工打开检查；before 与 after 各 16 张；主负责人另通过真实浏览器操作生成并检查 6 张独立复核图。
- 未覆盖：真实 iOS / Android 设备、真实屏幕阅读器、弱网恢复、最终非 root 容器中的 Chromium / 三语 OCR，以及真实 Web Push 投递。

## 主负责人独立复核

主负责人没有只依赖子任务结论，而是在 production build 上重新通过登录 UI 建立合成 OWNER 会话，实际操作并截图确认：

1. [工作台上下文](./product-ux-audit/screenshots/main-review/01-workbench-context.png)：企业 / 店铺在顶部可见，一级模块分组与待办工作台同时成立。
2. [账号与工作空间菜单](./product-ux-audit/screenshots/main-review/02-account-context-menu.png)：当前主体、店铺与设置入口可在同一处确认。
3. [切换经营主体](./product-ux-audit/screenshots/main-review/03-switched-organization.png)：切换后页面、导航和企业上下文同步更新。
4. [另一企业的通知列表](./product-ux-audit/screenshots/main-review/04-notifications-other-org.png)：通知仍保留对象所属企业信息。
5. [通知深链自动切回对象企业](./product-ux-audit/screenshots/main-review/05-notification-deep-link-context.png)：从另一企业点击通知后，企业 / 店铺与 SKU 详情一致，没有串租户或回到登录页。
6. [中文 404 恢复路径](./product-ux-audit/screenshots/main-review/06-localized-404.png)：无效或撤权对象不会泄露内容，并可回工作台或通知中心。

## 上线建议

UI / UX 与信息架构可进入 v0.9.0 RC 上线候选。当前仍建议在下一小版本处理长侧栏、商品表格操作可发现性和账号弹层 ARIA 模式；生产放行仍取决于数据恢复、最终容器、负载和阿里云环境门禁，而不是本报告中的 UI 阻断项。
