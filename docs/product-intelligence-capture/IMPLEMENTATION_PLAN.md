# 商品情报采集实施计划

状态：Web 单/批量解析、采集箱审核、商品主档与采购转化、移动单链接读取均已落地
最后更新：2026-08-09

## 总体原则

- 先建设来源数据和采集箱，再开发客户端。
- 先跑通链接分享，再补截图/OCR。
- 先做确定性去重，再引入 AI。
- 每个阶段都必须能独立产生业务价值。
- Android 不进入本计划。

## Phase 0：协议与领域基础

目标：让系统能够安全接收采集草稿，不依赖 Chrome、Apple 或 AI。

### 数据库

- [ ] 新增 `CaptureDevice`
- [ ] 新增 `ProductIntelligenceCapture`
- [ ] 新增 `SourceListing`
- [ ] 新增 `SourceListingSnapshot`
- [ ] 新增 `SourceAsset`
- [ ] 新增 `ExtractedClaim`
- [ ] 新增 `MatchCandidate`
- [ ] 为 `ProductIntelligenceObservation` 增加来源关联
- [ ] 增加组织、店铺、状态、来源和时间索引

### 合约

- [ ] 创建 `packages/capture-contract/openapi.yaml`
- [ ] 定义 Capture v1 JSON Schema
- [ ] 生成 Web/Chrome TypeScript 类型
- [ ] 固定金额、时间、币种和枚举格式
- [ ] 定义版本不兼容策略

### 领域服务

- [ ] URL 规范化
- [ ] 平台/外部商品 ID 解析接口
- [ ] 内容哈希
- [ ] 请求幂等
- [ ] 来源快照 Diff
- [ ] 价格观察去重

### 验证

- [ ] 相同幂等键只产生一条 Capture
- [ ] 相同平台商品 ID 只产生一个 SourceListing
- [ ] 相同内容不产生重复 Snapshot
- [ ] 价格变化产生 Observation
- [ ] 描述变化产生 Snapshot

## Phase 1：ERP Web 采集箱与 Capture API

目标：通过 Web 粘贴链接即可完成端到端采集。

### API

- [ ] `POST /api/v1/product-intelligence/captures`
- [ ] `GET /api/v1/product-intelligence/captures`
- [ ] `GET /api/v1/product-intelligence/captures/:id`
- [ ] `POST /api/v1/product-intelligence/captures/:id/confirm`
- [ ] `POST /api/v1/product-intelligence/captures/:id/dismiss`
- [ ] `POST /api/v1/product-intelligence/captures/:id/retry`
- [ ] 资产上传/预签名接口
- [x] `POST /api/v1/product-intelligence/captures/preview` 单页解析预览
- [x] `POST /api/v1/product-intelligence/captures/preview/batch` 最多 12 条批量解析
- [x] 原始 URL 与解析后平台商品 ID 两阶段去重
- [x] 批量保存逐项幂等、逐项失败隔离
- [x] 公网 URL/跳转/页面大小/超时/用户限频校验
- [x] 普通 HTTP 优先、匿名浏览器渲染兜底

### Web UI

- [ ] 商品情报页增加“快速采集”
- [ ] 新增采集箱列表
- [ ] 新增采集审核页
- [ ] 展示原始来源与标准化结果对照
- [ ] 展示重复/变化类型
- [ ] 允许关联已有商品组/SKU
- [ ] 允许只保存来源、不立即匹配
- [x] 采集箱顶部粘贴链接并自动解析
- [x] 卡片表格式批量预览、勾选、编辑价格与批量保存
- [x] 内联核对标题、价格、图片、描述、平台身份和来源类目
- [x] 审核时归入已有商品主档，或创建待完善商品主档/SKU
- [x] 审核时直接登记采购并生成采购 Capture、QuickEntry 与采购单
- [x] 暂不匹配时保留在采集箱

### 设备

- [ ] 采集设备设置页
- [ ] 一次性配对码
- [ ] 设备列表、最后使用时间和撤销
- [ ] Scope 校验

### 验证

- [x] Web 粘贴单个或多个 URL 可创建 Capture
- [ ] 租户和店铺隔离
- [ ] 设备令牌只能访问 Capture API
- [x] 完成审核后生成来源商品和价格观察
- [x] 审核页登记采购生成采购链路并保留与原 Capture 的业务关联
- [x] Mercari Shops URL 可解析平台商品 ID
- [x] 闲鱼 `p.goofish.com` / `m.tb.cn` 完整分享文案可展开并解析商品 ID
- [x] 同一闲鱼商品的不同分享短链归并到同一规范 URL
- [x] Mercari Shops 真实页面端到端保存验收
- [x] Mercari 个人商品 6 链接批量验收：5 个唯一商品入采集箱、1 个重复自动忽略

## Phase 2：Chrome / Edge 扩展

目标：实现 Pinterest 式桌面快速采集。

### 仓库

- [ ] 创建 `clients/chrome-capture`
- [ ] 配置 Manifest V3
- [ ] 引入共享 Capture 合约
- [ ] 建立独立测试和构建命令

### 功能

- [ ] 工具栏按钮
- [ ] 侧栏预览
- [ ] 右键“采集到 ERP”
- [ ] 获取当前 URL/标题
- [ ] JSON-LD / Open Graph 解析
- [ ] 图片候选选择
- [ ] 用户点选价格/标题/图片
- [ ] 当前视口截图兜底
- [ ] 本地离线待上传队列
- [ ] 配对与设备撤销提示

### 权限

- [ ] 只申请 `activeTab`
- [ ] `scripting`
- [ ] `sidePanel`
- [ ] `contextMenus`
- [ ] `storage`
- [ ] 不申请长期 `<all_urls>`，除非有经过评审的必要性

### 验证

- [ ] 普通商品页
- [ ] 动态渲染页面
- [ ] 页面无 JSON-LD
- [ ] 禁止右键图片
- [ ] CSS 背景图/懒加载
- [ ] 登录页与敏感页面提示
- [ ] 相同页面重复采集

## Phase 3：Apple Capture

目标：在 iPhone/iPad 的系统分享菜单中快速保存链接、文字、图片和截图。

### 仓库与签名

- [ ] 创建 `clients/apple-capture` Xcode 工程
- [ ] SwiftUI 容器 App
- [ ] Share Extension target
- [ ] Safari Web Extension target
- [ ] App Group
- [ ] Keychain
- [ ] 开发、测试、生产 Bundle ID
- [ ] TestFlight 流程

### Share Extension

- [ ] 接收 URL
- [ ] 接收 plain text
- [ ] 接收单图/多图
- [ ] 接收截图
- [ ] 最小确认表单
- [ ] 快速保存并返回宿主 App
- [ ] 离线队列
- [ ] 令牌过期处理

### OCR

- [ ] Apple Vision `RecognizeTextRequest`
- [ ] 中文/日文/英文识别配置
- [ ] 保留文字坐标和置信度
- [ ] 价格/币种候选
- [ ] 用户点选正确价格

### Safari

- [ ] 复用 `capture-web-core`
- [ ] URL/标题/Open Graph/JSON-LD
- [ ] 图片候选
- [ ] 与容器 App/Share Extension 共享账号和配置

### 验证

- [ ] Safari 分享 URL
- [ ] 第三方 App 分享 URL
- [ ] 只分享文字
- [ ] 只分享图片
- [ ] 截图 OCR
- [ ] iPhone 与 iPad 布局
- [ ] 网络断开后恢复

## Phase 4：AI 辅助整理

目标：减少人工整理，不改变标准商品的人工确认边界。

### 规则优先

- [ ] 平台商品 ID
- [ ] URL 规范化
- [ ] 内容哈希
- [ ] 图片 SHA-256
- [ ] 感知哈希
- [ ] 款号/条码精确匹配

### 小模型

- [ ] 品牌、款号、尺码、颜色抽取
- [ ] 成色、瑕疵、缺件抽取
- [ ] 多语言名称标准化
- [ ] 来源变化总结
- [ ] 输出证据片段与置信度

### 向量检索

- [ ] 评估 pgvector
- [ ] 文本向量候选
- [ ] 图片向量候选
- [ ] 品牌/品类/规格过滤
- [ ] 小模型候选重排

### 人工反馈

- [ ] 接受候选
- [ ] 拒绝候选
- [ ] 修改字段
- [ ] 保存 matcher/model/version
- [ ] 建立离线评估数据集

### 验证

- [ ] AI 失败时仍可人工处理
- [ ] 低置信度不自动合并
- [ ] 所有建议有证据
- [ ] 同一输入可按版本重算

## Phase 5：平台适配器与 SaaS 能力

目标：提高常用来源的准确度，而不让系统依赖固定平台名单。

- [x] 通用解析器与平台内容适配器注册表
- [x] 身份版本、内容版本、解析等级和能力状态 API
- [x] Mercari Shops 脱敏 Fixture 与适配器契约测试
- [x] Mercari 个人售罄页结构化售价优先，排除运费等正文金额
- [x] Mercari 内容适配从通用解析器拆分
- [x] Atmos 官方商品页内容适配、商品 ID 修正与商品图过滤 Fixture
- [x] 闲鱼分享文案适配器与 Fixture：提取标题、清除匿名落地页误识别价格和图片
- [x] Amazon、Yahoo 拍卖平台身份识别
- [ ] 闲鱼登录后可见证据的用户授权采集（分享扩展或截图/OCR）
- [ ] Yahoo 拍卖、Amazon 内容适配器与 Fixture
- [ ] 解析失败率监控
- [ ] 组织级匹配规则
- [ ] 组织级私有来源
- [ ] 采集数据导出 API
- [ ] Webhook
- [ ] 价格变化/售出提醒
- [ ] 商品来源可信度

## 建议的首个可交付版本

首个版本不要同时做全部能力，范围建议锁定为：

1. Capture/SourceListing/Snapshot 数据模型
2. Capture API
3. ERP 采集箱
4. Web 粘贴 URL
5. Chrome 扩展链接采集
6. 确定性重复判断
7. 人工关联商品组/SKU

Apple Share Extension 放在第二个可交付版本；AI 放在已经积累真实采集数据之后。

## 发布与回滚

- 所有功能通过组织级 feature flag 开启。
- Capture 合约保留版本号。
- 新解析器只影响新任务，历史原始数据不修改。
- AI/匹配结果可重算，人工确认结果不可被后台任务静默覆盖。
- 客户端版本过旧时 API 返回明确升级提示。

## 待确认决策

- [ ] 生产对象存储供应商
- [ ] Apple Developer Account / Bundle ID
- [ ] Chrome Web Store 发布主体
- [ ] 是否首期支持 Edge Store
- [ ] 设备令牌有效期和轮换策略
- [ ] 首期支持的币种和可见范围
- [ ] AI 服务部署方式（托管/自建/混合）
- [ ] 是否在第一期启用 pgvector
