# 商品情报采集系统

状态：ERP Web 链接解析、可插拔平台适配、Web/PWA 采集、正式 SKU 匹配、来源快照与价格变化已实现
范围：ERP Web、Chrome/Edge 扩展、iPhone/iPad 分享入口、Safari Web Extension
明确不包含：后台批量爬虫、绕过登录/验证码/平台限制；原生 iOS 分享扩展为可选后续渠道

## 一句话定位

商品情报采集系统是一个类似 Pinterest Save Extension 的轻量采集入口。用户在网页或 Apple 设备中的 App 里看到商品后，通过分享链接、浏览器按钮或截图快速留下来源记录；系统再完成去重、字段提取、商品匹配和价格观察，而不是把外部页面直接创建成正式 SKU。

## 已确认的核心决策

1. **ERP Web 链接解析优先落地**：用户在采集箱粘贴公开页面，系统以普通请求优先、匿名浏览器兜底生成预览；插件不是第一阶段依赖。
2. **截图作为兜底**：宿主 App 没有提供链接或字段不完整时，允许分享截图并使用 Apple Vision OCR。
3. **只做用户主动的单页解析**：不做后台批量爬虫；公开页面解析必须限频、限时、匿名并遵守访问边界。
4. **来源记录不等于标准商品**：闲鱼、Mercari 等个人卖家的标题、描述、成色和图片保留在来源商品中，不直接覆盖商品组或 SKU。
5. **重复采集形成快照**：同一平台商品再次采集时更新 `lastSeenAt`，内容或价格变化才增加快照/观察记录。
6. **AI 只处理模糊问题**：确定性重复先用平台商品 ID、URL、文本哈希和图片哈希；小模型负责字段抽取、候选排序和变化总结。
7. **人工确认标准身份**：AI 可以推荐商品组/SKU，但不能自动合并标准 SKU。
8. **Apple 与 Chrome 共用一个采集协议**：所有客户端最终写入同一个 Capture API 和采集箱。
9. **平台适配分层而不是逐页开发**：未知网站走通用 JSON-LD/Open Graph 解析；常用平台使用带版本的内容适配器；没有深度适配的平台明确显示“请核对”，不能假装完整支持。

## 文档导航

- [产品需求文档](./PRODUCT_SPEC.md)
- [技术架构与技术栈](./TECHNICAL_ARCHITECTURE.md)
- [实施计划](./IMPLEMENTATION_PLAN.md)
- [ERP Web 商品链接采集](./WEB_LINK_CAPTURE.md)

## 是否并入当前仓库

建议并入当前 `erp-v2` 仓库，但各客户端保持独立构建边界。

当前 Next.js ERP 继续保留在仓库根目录，不立即搬迁。开始实现客户端时再增加：

```text
erp-v2/
├── app/                              # 现有 ERP Web / API
├── components/
├── lib/
├── prisma/
├── clients/
│   ├── chrome-capture/               # Manifest V3 扩展
│   └── apple-capture/                # Xcode 工程
│       ├── CaptureApp/                # 极简容器 App
│       ├── ShareExtension/            # iOS / iPadOS 分享扩展
│       └── SafariWebExtension/        # Safari 网页采集
├── packages/
│   ├── capture-contract/              # OpenAPI / JSON Schema / 生成类型
│   └── capture-web-core/              # Chrome 与 Safari 可共享的网页解析逻辑
└── docs/
    └── product-intelligence-capture/  # 本方案文档
```

### 放在同一仓库的原因

- 数据模型、API 合约和客户端必须同步演进。
- Chrome 与 Safari Web Extension 可以共享大部分 TypeScript 解析逻辑。
- 同一次变更可以同时更新 Prisma、API、Web UI、扩展和文档。
- 当前团队和产品仍处于快速迭代阶段，拆成多个仓库会增加版本协调成本。

### 何时再考虑拆仓库

- Apple、浏览器扩展由独立团队维护。
- 客户端发布节奏与 ERP 完全分离。
- 需要对外开放 SDK，形成独立产品。
- 仓库构建时间或权限边界已经造成实际问题。

## 与现有商品情报模块的关系

现有：

- `ProductIntelligenceItem`：商品组/具体 SKU 的标准情报身份。
- `ProductIntelligenceObservation`：价格、来源、成色和观察时间。

需要新增：

- Capture：一次用户采集动作。
- SourceListing：平台上的一个原始商品页面。
- SourceListingSnapshot：来源页面随时间发生的内容变化。
- SourceAsset：来源图片、截图和证据文件。
- ExtractedClaim：从标题、描述或 OCR 中抽取的声明。
- MatchCandidate：来源商品与标准商品/SKU 的匹配建议。

标准商品继续回答“它是什么”；来源商品回答“某个平台的某个卖家当时如何描述和定价”。

## 官方能力依据

- Chrome `activeTab`：用户主动点击后临时读取当前页面
  <https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- Apple Share Extension 输入：链接、文字、图片等由宿主 App 提供的附件
  <https://developer.apple.com/documentation/foundation/nsextensionitem>
- Safari Web Extension：可与 Chrome 等浏览器扩展共享 WebExtension 技术
  <https://developer.apple.com/documentation/safariservices/safari-web-extensions>
- Apple Vision OCR：从用户分享的截图中识别文字和位置
  <https://developer.apple.com/documentation/vision/recognizetextrequest>
