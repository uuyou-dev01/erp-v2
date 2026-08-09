# ERP Web 商品链接采集

状态：单链接、批量链接、可插拔平台适配与业务转化闭环已实现，待生产环境部署验证
最后更新：2026-08-09
首批验收来源：Mercari Shops、Mercari 个人商品、Atmos

## 1. 本轮方案结论

在浏览器扩展和 Apple 分享扩展之前，ERP 先提供一个不需要安装任何客户端的主入口：

> 在商品情报采集箱粘贴一个或多个公开商品链接，系统自动读取页面并生成预览；用户核对价格、图片和商品归属后保存。

这一入口解决“逐字段手工录入太慢”的问题，同时保留以下边界：

1. 外部页面先形成 `Capture / SourceListing / Snapshot`，不直接成为正式商品或 SKU。
2. 标题、描述、图片、成色和卖家声明属于来源证据，不覆盖 ERP 标准商品主档。
3. 用户可以关联已有 SKU；无法确认时先进入采集箱，不自动创建或合并 SKU。
4. 同一平台商品再次采集时按平台商品 ID、其次按规范化 URL 去重；内容或价格变化形成新快照。
5. Web、未来 Chrome/Safari 扩展和 Apple Share Extension 共用同一 Capture 服务。
6. 未知网站使用通用解析；常用平台通过独立、带版本的内容适配器提高准确度，不按单个商品页面开发。
7. Web 批量入口最多接受 12 条链接，以 3 个并发读取；先按原始链接去重，再按解析后的平台商品 ID 去重。
8. 手机端保留“一次处理一个商品”的轻操作：粘贴/分享链接后读取并回填，复杂批量整理放在 PC 采集箱完成。

## 2. 用户体验

入口：`/product-intelligence/captures`

```text
粘贴商品链接（可一行一个，也可粘贴整段分享文字）
https://jp.mercari.com/item/...
https://jp.mercari.com/item/...

[解析 2 条]
```

解析成功后内联展示，不使用阻断式弹窗：

- 来源平台和平台商品 ID
- 原始商品名称
- 当前价格与币种
- 页面状态（在售、售罄、不可用、未知）
- 品牌、来源店铺、来源类目
- 两层内部品类建议
- 来源描述
- 来源图片候选
- 正式 SKU 匹配候选

保存与业务转化动作：

- 批量预览页：勾选后批量创建来源/快照并进入采集箱，失败项不阻断其他商品。
- 审核页选择已有 SKU：把来源价格写入该 SKU 的商品情报时间线。
- 审核页选择新建：创建待完善商品主档/SKU，并写入来源价格。
- 审核页“登记采购”：复用当前来源信息，补数量、采购日期、运费后生成采购 Capture、QuickEntry 和采购单；采购价与市场观察分别留痕。
- 暂时无法确认商品归属：继续留在采集箱，不自动创建或合并 SKU。

## 3. 页面读取策略

系统按成本和风险从低到高执行：

1. 校验 URL，只允许公网 HTTP/HTTPS。
2. 使用匿名普通 HTTP 请求读取 Open Graph、JSON-LD 和基础 HTML。
3. 如果标题、价格或图片不足，启动匿名 Playwright 浏览器渲染页面。
4. 先执行通用解析，再执行平台适配器。
5. 返回预览，用户确认后才写入来源快照和价格事实。

页面读取结果先进入通用适配器，再由匹配的平台内容适配器覆盖更可靠的非空字段。平台适配失败不会让整次采集失败，而是降级到通用结果并提示用户重点核对。

这不是后台批量爬虫：解析由登录 ERP 的用户主动提交触发，受单批数量、并发、频率、超时、页面大小和租户权限限制。

### 3.2 批量接口

- `POST /api/v1/product-intelligence/captures/preview/batch`
- 输入上限：12 个商品链接 / 20,000 字符。
- 并发上限：3；返回结果保持输入顺序。
- 单条失败隔离；成功项仍可继续保存。
- 同一平台商品使用 `platform + externalListingId` 归并；没有外部 ID 时回退到规范化 URL。
- 保存阶段逐条使用独立幂等键，避免整批重试产生重复 Capture。

### 3.1 为什么需要浏览器渲染

动态商城、Mercari、闲鱼等页面常把价格和详情放在客户端渲染结果中。仅保存 Open Graph 通常只能获得标题和主图，无法可靠取得价格、库存状态和详情。

MVP 使用普通请求优先、浏览器兜底。生产环境必须提供可用 Chromium，或配置远程浏览器执行服务；没有浏览器时仍可返回普通请求能够取得的部分字段。

## 4. Mercari Shops 验收样例

样例 URL：

`https://jp.mercari.com/shops/product/PPGnk2WZvc2dY5eViefAJC`

预期解析：

| 字段         | 预期结果                                            |
| ------------ | --------------------------------------------------- |
| 平台         | Mercari                                             |
| 外部商品 ID  | `PPGnk2WZvc2dY5eViefAJC`                            |
| 价格         | `84678 JPY`                                         |
| 页面状态     | `SOLD_OUT`                                          |
| 品牌         | `CHROME HEARTS`                                     |
| 来源类目     | ファッション / メンズ / アクセサリー / ブレスレット |
| 建议内部品类 | 首饰配件 / 手链手镯                                 |
| 店铺         | LIFE                                                |
| 图片         | 6 张商品图                                          |

描述、成色、是否有附件和真伪相关措辞必须保留原文，不把卖家声称自动升级为标准商品事实。

## 5. 数据落点

### ProductIntelligenceCapture

保存一次用户主动采集动作、原始 URL、解析方式、业务意图和结构化原始包。

### SourceListing

表示平台上的一个原始商品。首选身份：

```text
platformName + externalListingId
```

缺少平台商品 ID 时使用规范化 URL。

### SourceListingSnapshot

保存某个时间点的标题、描述、价格、币种、成色、页面状态和来源图片 URL。相同内容哈希不重复保存。

### ProductIntelligenceObservation

只有来源已经人工关联到标准 SKU 时，才写入正式价格时间线。未匹配来源留在采集箱。

## 6. AI 的位置

MVP 不依赖 AI。后续可在确定性解析之后使用小模型：

- 翻译和规范化多语言商品名。
- 从不完整标题/描述中提取品牌、款号、颜色、尺码、成色和瑕疵。
- 推荐两层内部品类。
- 对已有商品组/SKU 候选排序并解释原因。
- 总结同一来源前后快照的变化。

AI 不自动创建、合并 SKU，不覆盖标准描述和主图。

## 7. 安全与访问边界

- 禁止 localhost、内网 IP、链路本地地址、保留地址和带账号密码的 URL。
- 跳转后的 URL 重新校验；浏览器子请求也执行公网地址校验。
- 限制跳转次数、HTML 大小、普通请求和浏览器解析时间。
- 用户级限频；浏览器使用匿名上下文，不继承用户 Cookie。
- 不绕过登录、验证码、付费墙或平台限制。
- 登录后才能看的页面返回部分结果或失败提示，由用户补充截图。

生产环境应进一步使用网络隔离的 Browser Worker，并限制其访问 ERP 内网和云元数据地址。

## 8. 当前实现文件

- Web 入口：`components/product-intelligence/web-link-capture.tsx`
- 预览接口：`app/api/v1/product-intelligence/captures/preview/route.ts`
- 批量预览接口：`app/api/v1/product-intelligence/captures/preview/batch/route.ts`
- 批量拆分、去重与并发：`lib/capture/web-link-batch.ts`
- URL/浏览器读取：`lib/capture/web-link-reader.ts`
- 通用字段编排：`lib/capture/web-link-parser.ts`
- 平台身份解析：`lib/capture/platform-adapters.ts`
- 平台内容适配注册表：`lib/capture/web-platform-adapters/registry.ts`
- Mercari 内容适配器：`lib/capture/web-platform-adapters/mercari.ts`
- Atmos 内容适配器：`lib/capture/web-platform-adapters/atmos.ts`
- 闲鱼分享内容适配器：`lib/capture/web-platform-adapters/goofish.ts`
- 通用内容适配器：`lib/capture/web-platform-adapters/generic.ts`
- Mercari 回归 Fixture：`tests/fixtures/web-link/mercari-shops-sold-out.json`
- Mercari 个人售罄 Fixture：`tests/fixtures/web-link/mercari-personal-sold-out.json`
- Atmos 回归 Fixture：`tests/fixtures/web-link/atmos-item.json`
- 闲鱼分享文案回归 Fixture：`tests/fixtures/web-link/goofish-share.json`
- 确认保存：`app/actions/captures.ts`

## 9. MVP 已知边界

1. 来源图片会尝试转存到系统资产；部分平台 CDN 可能拒绝服务端直连。失败时保留原始 URL、在批量页和审核页提示，并可在创建商品主档时重试。生产长期留存仍需 Browser Worker、对象存储和重试队列。
2. 内部品类目前为规则建议，尚未自动绑定 `ProductCategory.categoryId`。
3. 浏览器每次按请求启动，后续应迁移到有并发、队列和健康检查的 Browser Worker。
4. 登录态页面不读取用户浏览器 Cookie。
5. 平台 DOM 变化可能导致字段缺失，需要适配器 Fixture 和解析失败率监控。
6. 当前 Mercari 与 Atmos 达到内容深度优化；闲鱼支持完整分享文案、短链展开、标题提取、商品 ID 去重和不可信字段清理。匿名闲鱼页面通常不提供可靠价格与商品图，因此仍需用户核对补充；Amazon、Yahoo 拍卖目前只做身份识别。

## 10. 下一阶段

1. 将来源图片转存迁移到隔离 Browser Worker 与对象存储，增加失败重试、哈希与保留策略。
2. 让品类建议返回真实 `categoryId`，在审核时一键确认。
3. 继续完善闲鱼用户可见证据采集（分享扩展、截图/OCR），并为 Yahoo 拍卖、Amazon 增加真实脱敏 Fixture 与内容适配器。
4. 将浏览器渲染迁移到隔离 Worker，并增加并发控制、队列、缓存和健康检查。
5. Chrome 与 Apple 入口复用同一个预览与确认协议。
6. 记录各平台的字段成功率、通用降级率和页面版本变化告警。
