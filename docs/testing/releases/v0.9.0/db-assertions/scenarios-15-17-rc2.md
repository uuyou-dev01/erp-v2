# v0.9.0 场景 15–17 RC2 验收

- 验收时间：2026-08-28 11:38 CST（Asia/Shanghai）
- 数据库：`erp_v090_notify_e2e`
- 服务：production build/start，端口 `3104`
- 浏览器：Chromium，`workers=1`，串行
- 结论：**本地范围通过；最终容器与真实 Web Push 仍阻塞**

## 最终定向运行

```text
Running 3 tests using 1 worker
✓ auth-setup
✓ 通知矩阵保持收件人、企业上下文、深链、去重、已读与处理状态一致
✓ 移动端真实完成任务、中文日文英文 OCR、网页读取与 Web Push 能力边界
3 passed (49.3s)
```

测试文件：`tests/e2e/release-scenarios-15-17-rc2.spec.ts`。
测试准备只重置明确命名的 `_e2e` 数据库；没有访问 `erp` 或恢复库。业务流程开始后
没有使用 Prisma 写入续接成功链，Prisma 仅用于结果读取和计数。

## 场景 15：通知矩阵

- 企业连接请求只发给目标企业 OWNER；同企业 WAREHOUSE 成员为 0 条。
- 请求通知只有 1 条，`dedupeKey` 唯一；每条运行时通知都有一条 outbox。
- 收件人在相邻企业上下文打开通知时，深链先切换到通知所属企业，再进入连接处理页。
- UI 标为已读后 `readAt` 非空；接受连接后重新进入通知页，原请求显示 `CONNECTION_ACCEPTED`。
- 定向货盘发布、连接接受、连接解除、成员停用均生成结果通知。
- 最终运行的 5 条运行时 outbox 全部为 `SKIPPED`，`lastError` 全部为
  `Web Push 尚未配置`；这证明本地降级路径，不代表真实 Push 已送达。

最终只读数据库摘要：

| 类型                               | 数量 | 处理状态                    |
| ---------------------------------- | ---: | --------------------------- |
| `ORGANIZATION_CONNECTION_REQUEST`  |    1 | 已读，`CONNECTION_ACCEPTED` |
| `ORGANIZATION_CONNECTION_ACCEPTED` |    1 | `INFORMATIONAL`             |
| `ORGANIZATION_CONNECTION_ENDED`    |    1 | `INFORMATIONAL`             |
| `SUPPLY_OFFER_STATUS_CHANGED`      |    1 | `INFORMATIONAL`             |
| `MEMBERSHIP_DEACTIVATED`           |    1 | `INFORMATIONAL`             |

## 场景 16：移动、OCR、抓取、Push

- 手机 UI 新建购入并进入待办，打开任务、填写物流单号和目的仓后提交；最终数据库有
  1 个采购单，状态 `SHIPPED`。
- 中文 OCR 通过真实手机 UI 上传私有 PNG 并识别，表单得到金额 `1288`。
- 日文 `jpn` worker 返回非空且包含 `円`；本轮不把日文数字候选精度作为通过声明。
- 英文 `eng` worker 识别 `39.99` 并返回金额候选。
- 三个证据文件均为 `READY`，并通过本地上传的实际 MIME、尺寸与哈希检查链。
- 商品页读取使用公开测试商品页，UI 得到标题 `A Light in the Attic`；页面无可靠价格时明确提示
  “价格仍需手动补充或从截图识别”。这是 HTTP 抓取路径的本地证据。
- `/m/me` 与 Push 配置 API 均显示 `enabled=false` / `待配置`。没有 VAPID 密钥、真实浏览器
  subscription 或外部终端，因此没有声称 Web Push 可达。
- 本轮发现 Tesseract.js 会把语言缓存写到工作目录；运行时现已显式使用
  `.data/tesseract-cache`，避免非 root 容器写 `/app` 根目录。

最终容器的 Chromium 与三语 OCR 仍因 Docker Hub 不可达而未验证，详见
`db-assertions/container-runtime.md`。本机 production-mode 结果不能替代容器结果。

## 场景 17：撤权与旧通知

- 企业连接有效时，目标企业可从通知进入定向货盘；解除连接后，同一通知深链最终为 404。
- 多企业普通成员在 B 有效时，可从 C 上下文的旧通知切换到 B 并读取 B 私有单件。
- B 所有者通过团队 UI 停用该成员后，B membership 为 `INACTIVE`、B 店铺授权被回收，C
  membership 保持 `ACTIVE`。
- 停用后的同一旧通知深链最终为 404；直接访问旧单件被中间件重定向为显式
  `access=denied`，未返回对象内容。
- 通知深链只在所属企业 membership 为 `ACTIVE` 时切换企业；存在但已停用的 membership
  直接拒绝旧业务对象通知。真正从未加入企业的外部仓协作者仍由对象自身的任务/roster
  授权判断。

## 截图与目检

新增 18 张：`15-01-*` 至 `15-07-*`、`16-01-*` 至 `16-03-*`、
`17-01-*` 至 `17-08-*`（均以 `-rc2.png` 结尾）。18 张均逐张打开检查；没有 Runtime
Error、空白失败页、真实密码、token 或私人地址。手机全页截图中的固定底部导航会覆盖部分
滚动区，这是截图合成表现，不影响交互断言。

## 仍未放行

- Docker Hub 恢复后，必须在最终非 root 镜像内运行
  `scripts/verify-container-runtime.mjs`，确认 Chromium 与中日英 OCR。
- 配置真实 VAPID、HTTPS 域名与测试终端后，补一次真实 Push 订阅和送达/撤销验证。
- 最终 2C4G 镜像仍需 10 会话 + OCR/抓取资源门槛测试。
