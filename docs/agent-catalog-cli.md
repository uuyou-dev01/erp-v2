# AI 商品调查与建档 CLI

本工具创建商品档案中的**商品组、规格 SKU 或独立 SKU**，对应目录里的一行系列及其下的各个款式。它还能保存图片、参考售价、目标进货价和有来源的价格调查记录。它不是只创建“盲盒 / 鞋服”这样的分类，也不会创建库存、采购单、销售单或实际成交。

## 1. 安装与首次连接

客户端只需要 Node.js 22+，不需要数据库连接或数据库密码。在仓库根目录运行：

```bash
node scripts/erp-cli.mjs help
# 等价入口（-s 避免 npm 前缀混入 JSON 输出）
npm run -s erp -- help
```

远程 ERP 需要先部署包含本功能的版本。CLI 可以在另一台有此仓库文件的电脑上运行；客户端只使用 HTTP API。不要把生产数据库连接提供给调查 agent。

首次由账号持有人登录，终端会隐藏密码输入：

```bash
node scripts/erp-cli.mjs auth login --url https://你的ERP域名 --email 你的邮箱
node scripts/erp-cli.mjs context
node scripts/erp-cli.mjs use --organization 企业ID --store 店铺ID
```

企业和店铺 ID 必须使用 `context` 的真实返回值。不要照抄占位值。本地开发地址允许 `http://localhost:3000`；远程地址要求 HTTPS。

自动化可通过密码管理器将密码送入 `auth login ... --password-stdin` 的标准输入，不能在命令参数、任务提示或日志里写明文密码。登录复用网页账号验证、登录限流及审计。密码不保存；会话保存在 `~/.config/erp-cli/config.json`，文件权限为 `0600`，有效期与网页登录相同（7 天）。这是该账号的登录会话，**不是只允许建档的专用令牌**，请使用仅有必要企业/店铺授权的账号。账号停用或会话版本变更后会失效。

`ERP_CLI_CONFIG=/绝对路径/config.json` 可为不同环境或 agent 设置独立配置，文件不要进入版本库。`auth logout` 仅删除本机会话文件，不撤销其他位置的会话副本。不得读取或输出配置中的会话值。

## 2. Agent 的最短工作流程

1. 调查前用 `product search` 查找已有商品，用 `categories` 获取分类 ID。
2. 调查过程中整理一份 JSON。使用稳定 `externalId`，统一名称、品牌和规格；保留来源、币种及调查时间。
3. 若有本地图片，先 `image upload`，将返回的 `url` 填入 `images`。可信的 HTTP(S) 图片直链也可以直接填写。
4. `product import --dry-run` 预检，通过后使用同一文件正式导入。
5. 返回创建结果中的 `href`（加上 ERP 根地址）以及商品/规格数量。超时后重试原文件，不要更换 `externalId`。

```bash
node scripts/erp-cli.mjs product search --query "POP MART 某系列"
node scripts/erp-cli.mjs categories --query "盲盒"
node scripts/erp-cli.mjs example > product.json
# agent 根据调查资料编辑 product.json
node scripts/erp-cli.mjs image upload --file ./cover.jpg
node scripts/erp-cli.mjs product import --file product.json --dry-run
node scripts/erp-cli.mjs product import --file product.json
```

也可以 `product import --file -` 从标准输入读 JSON。CLI 自动写入当前选中的 `storeId`；如果文件显式指定了不同店铺会拒绝，避免写错地方。搜索每页最多 20 个商品，下一页用返回的 `nextOffset`：`product search --query "名称" --offset 20`。完整资料：`product show --id 商品ID`。

## 3. 导入格式 v1

完整的可编辑模板见 [catalog-product.json](examples/catalog-product.json)。以下价格和网址**仅为格式示例，不是市场事实**：

```json
{
  "schemaVersion": 1,
  "externalId": "brand/series-stable-id",
  "product": {
    "name": "品牌 系列名称",
    "brand": "品牌",
    "categoryId": "从 categories 查询得到的 ID",
    "productKind": "NEW",
    "images": [],
    "sourceUrls": ["https://example.com/product"],
    "description": "已核实的系列介绍"
  },
  "variantAxis": "款式",
  "variants": [
    {
      "label": "款式 A",
      "referencePrice": { "amount": "1200", "currency": "JPY" },
      "referenceCost": { "amount": "50", "currency": "CNY" },
      "observations": [
        {
          "amount": "1200",
          "currency": "JPY",
          "priceType": "SALE",
          "sourceUrl": "https://example.com/listing",
          "sourceName": "调查平台名称",
          "observedAt": "2026-10-04T10:00:00+08:00",
          "confidence": "MEDIUM",
          "note": "示例：挂牌价格，非成交价；是否含运费需说明"
        }
      ]
    }
  ]
}
```

| 位置 / 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 必须为数字 `1` |
| `externalId` | 必填，1–150 字符；字母或数字开头，仅字母、数字、点、下划线、冒号、斜线、短横线。以品牌/系列的稳定标识命名，勿用每次变化的时间戳 |
| `storeId` | CLI 自动填入；直接调用 API 时必填 |
| `product.name`, `brand`, `categoryId` | 必填，非空字符串；名称建议“品牌 + 官方系列名”，不要混入价格、库存或平台营销词 |
| `product.manufacturerCode` | 可选，已核实的厂商货号。系统自动生成内部编码，不需要 agent 生成 PG/SKU 编码 |
| `product.series`, `tags` | 可选，系列名及标签，标签最多 20 个 |
| `product.productKind` | `NEW` 或 `USED`，默认 `NEW` |
| `variantAxis` | 单一规格维度，默认“款式”；如“尺码”也可。第一版不支持多轴组合 |
| `variants` | 0–100 个；非空时创建商品组及规格。为空或省略时创建独立 SKU |
| `variants[].label` | 必填且不可重复；只写款式名称，不重复品牌和系列。系统生成“商品组名 · 款式名” |
| `description`, `notes` | 商品组和每个规格都支持；分别最多 10000 / 4000 字符 |
| `images` | 商品组和每个规格都支持，最多 12 个；首张为封面。规格未提供图片时，封面使用商品组封面 |
| `referencePrice`, `referenceCost` | 商品组和规格都支持；结构为 `{amount, currency}`，分别表示参考售价、目标进货价；不会生成交易或改变库存成本 |
| `sourceUrls` | 商品组和规格都支持，最多 20 个 HTTP(S) 来源地址，保存在档案备注中 |
| `observations` | 商品组和规格都支持，最多各 30 条；保存到关联的商品情报，类型为 `MARKET_SEEN`，企业内可见 |

金额必须是十进制**字符串**，非负，最多 15 位整数和 4 位小数；支持 `CNY`、`JPY`、`USD`、`EUR`。不同币种分别填写，不自动换汇。不确定的价格省略，不用 `0` 代替未知。

每条 observation 必填 `amount`、`currency`、`sourceUrl`、`sourceName`、`observedAt`。时间用带时区的 ISO 8601。`priceType` 可选 `SALE`（默认）、`PURCHASE`、`WHOLESALE`、`RESALE`、`OFFER`；`confidence` 可选 `LOW`、`MEDIUM`（默认）、`HIGH`。调查所得价格不能写成实际成交；参考售价需要 agent 明确选择，不会自动将所有调查价格设成参考售价。组级价格不会自动复制到每个规格。

服务端拒绝未知字段，帮助及时发现拼写错误和不一致的数据格式。单次 JSON 上限 1MB，一次导入一个商品及其所有规格；多个系列分别提交。

## 4. 图片

`image upload --file 图片路径` 支持 JPEG、PNG、WebP、GIF，最大 8MB，复用系统的图片内容校验和存储，默认企业私有。确有公开展示需求时才加 `--public`。返回的 `/api/assets/.../content` 可直接填进 `images`，不必拼接域名。使用同一企业/店铺上传和导入。

远程图片直链仅保存 URL，服务端不会下载归档；第三方防盗链、过期链接可能导致展示失败。需要长期保存时，先取得可使用的本地图片并上传。导入 JSON 不接受本地文件路径或 Base64。单独上传的图片不属于后续导入事务，取消导入不会自动删除已上传图片。

## 5. 预检、重复导入和错误处理

- `--dry-run` 使用相同业务逻辑执行校验并回滚商品/规格/情报写入；返回 `preview`，临时 ID 为 `(preview)`。登录和限流记录仍可能产生。正式导入时仍重新校验，预检编码不作占用保证。
- 商品、规格、情报和调查价格在一个数据库事务内创建，失败会整体回滚。
- 同一店铺、相同 `externalId`、相同规范化输入再次提交，返回 `existing`；不再增加商品或调查记录。JSON 对象键的顺序不影响判断，数组顺序和实际内容变化影响判断。
- 相同 `externalId` 但不同内容返回 `IMPORT_CONFLICT`。首版只负责新建，不覆盖已有资料，也不为已有商品追加规格/价格。需修改时使用网页编辑；不要为了绕过冲突换一个 ID。
- 同品牌同名或同品牌同厂商货号的已有商品返回 `PRODUCT_EXISTS`，防止另一任务换 ID 重建。名称不同、货号缺失的相似商品仍需 agent 在导入前搜索核对。
- CLI 导入按店铺串行防止并发重建。即使网络超时，重新提交原文件也能检查是否已经创建。
- 所有 API 请求使用登录账号的企业和店铺授权；导入不能自行指定创建者或越过组织边界。

成功时标准输出只有一行 JSON，默认包含 `status`、`product`、`variantCount`、`observationCount` 和正式商品的 `href`。加 `--details` 才返回 `variants` 中各规格的 ID、编码和名称，减少默认 token 开销。`observationCount` 是本次新写入的调查条数，`existing` 时为 0。`product show` 用于按需查看完整档案，避免每次把全部图片和调查资料返回给 AI。

错误格式：

```json
{"success":false,"error":{"code":"VALIDATION","message":"请修正输入字段","issues":[{"field":"variants.0.referencePrice.amount","message":"金额须为非负十进制字符串，最多四位小数"}]}}
```

退出码：`0` 成功，`1` 网络/服务端失败，`2` 输入或校验错误，`3` 登录/权限问题，`4` 重复商品或内容冲突。收到字段问题只修正对应字段，避免反复提交整套不同结构。CLI 不自动重试写操作；确认内容后可用原文件重试。帮助文本和 `example` 模板除外，命令输出均为 JSON。

## 6. 可直接交给调查 AI 的操作约定

> 使用本项目的 `node scripts/erp-cli.mjs` 调查建档。先阅读 `docs/agent-catalog-cli.md`，并用 `context` 核对当前店铺；不要显示登录配置或会话值。先搜索已有商品，再调查官方系列名、规格、图片和价格来源。按模板整理 JSON：只填已核实的资料，未知价格省略，保留原币种、来源地址和观察时间，挂牌价格不能说成成交价格。分类 ID 从 categories 查询，规格只填款式名，内部编码由系统生成。externalId 在同一商品的重试中保持不变。预检通过后导入，最终报告商品链接、规格数和调查条数。遇到已有商品或内容冲突，检查已有档案，不要换 ID 强行新建。

## 7. 服务端接口与开发维护

### 在香港服务器直接运行

线上地址为 `https://erp-test.lianyuapt.com`。外部调查 agent 在自己的运行环境调用 CLI，通过 HTTPS 写入同一线上 ERP，**不需要 SSH、Workbench 或数据库权限**；只需要 Node.js 22、CLI 文件和一次 ERP 账号登录。需要在 ECS 本机运行时，rc.28 镜像提供独立 `cli` 服务，无需在宿主机安装 Node.js，也不向 CLI 容器提供数据库或应用密钥。

管理员首次发布时创建持久目录，并设置容器用户的数字 UID/GID：

```bash
mkdir -p /opt/erp-v2/runtime/cli
chown 1001:1001 /opt/erp-v2/runtime/cli
chmod 0700 /opt/erp-v2/runtime/cli
```

后续更新无需重建目录。

```bash
cd /opt/erp-v2/current
# 以下命令复用当前发布版本和企业账号权限
docker compose --env-file .env.production -f compose.production.yml --profile tools run --rm cli help
docker compose --env-file .env.production -f compose.production.yml --profile tools run --rm cli auth login --url https://erp-test.lianyuapt.com --email 你的邮箱
docker compose --env-file .env.production -f compose.production.yml --profile tools run --rm cli context
docker compose --env-file .env.production -f compose.production.yml --profile tools run --rm cli use --organization 企业ID --store 店铺ID

# 自动化从宿主文件读入，无需把文件复制到容器
docker compose --env-file .env.production -f compose.production.yml --profile tools run --rm -T cli product import --file - --dry-run < /路径/product.json
docker compose --env-file .env.production -f compose.production.yml --profile tools run --rm -T cli product import --file - < /路径/product.json
```

登录配置位于宿主 `/opt/erp-v2/runtime/cli/config.json`，容器内为 `/app/.cli/config.json`，重建应用和临时 CLI 容器不会丢失。多个 agent 可在每次 `run` 后加 `-e ERP_CLI_CONFIG=/app/.cli/agent-name.json` 使用独立会话。登录仍为 7 天有效，并非永久授权。

宿主图片先放到 `/opt/erp-v2/runtime/cli/` 下并保证 UID 1001 可读，再执行 `... run --rm -T cli image upload --file /app/.cli/cover.jpg`。外部 agent 可在自己的机器直接上传图片，无需传到服务器目录。服务器端 CLI 默认按需启动并退出，不会自动启动一个持续调查的 AI；调查 agent 负责调用它。

### 接口与验证

| 方法 / 路径 | 用途 |
| --- | --- |
| `POST /api/v1/catalog/session` | JSON 邮箱和密码，返回登录 cookie；复用网页登录逻辑 |
| `GET /api/v1/catalog/context` | 当前账号可访问的企业和店铺 |
| `GET /api/v1/catalog/categories` | 已有分类目录 |
| `GET /api/v1/catalog/products?storeId=...&query=...&offset=0` | 简短搜索结果 |
| `GET /api/v1/catalog/products?storeId=...&id=...` | 单个商品完整资料与规格 |
| `POST /api/v1/catalog/products/import?dryRun=1` | 预检；去掉参数即正式创建 |
| `POST /api/upload` | Multipart 图片上传，含 file、purpose、visibility、storeId、organizationId |

契约：`lib/catalog/import-contract.ts`；导入事务：`lib/catalog/import-service.ts`；网页与 CLI 共用的创建规则：`lib/application/sku-create-service.ts`。无需新增数据库表或迁移；导入标识和指纹存于商品 `attributes.agentImport`，调查记录存于现有商品情报表。修改 JSON 契约时同步更新模板、文档和契约/集成测试。

验证：`npm run typecheck` 和 `npm run build`。应用测试使用名称以 `_test` 或 `_e2e` 结尾的专用 `TEST_DATABASE_URL`，运行 `npx vitest run tests/application/catalog-import.test.ts tests/application/catalog-http.test.ts tests/application/skus-action.test.ts tests/application/sku-catalog-meta.test.ts`。`npm run test:cli` 默认验证客户端地址限制；提供 `ERP_CLI_E2E_URL` 与 `TEST_DATABASE_URL` 后，还会运行真实登录、图片上传、预检、导入、重试和权限测试。该端到端测试只允许本机服务和 `_test` 数据库；服务端必须连接同一测试数据库，且禁用 `ERP_DEV_USER_EMAIL` 登录回退。不要连接业务数据库运行测试。
