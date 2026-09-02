# rc.3 导航与库存录入香港测试环境部署交接

> 日期：2026-09-02
> 分支：`codex/release-v0.9.0`
> 应用发布提交：`ba8861888093a9bb713d33ca5907c67b855da072`
> 发布版本：`0.9.0-rc.3`
> 测试入口：<https://erp-test.lianyuapt.com>

## 1. 发布结论

`0.9.0-rc.3` 已部署到阿里云香港 ECS `i-j6ca0c7fir70xwtdr9pt`（公网 IP `47.243.87.184`）。本次发布合并了同一工作区中多个会话已经落盘的改动，主要收口首次使用导航、商品资料工作区、库存明细结构和已有库存录入流程。

杭州 ECS `i-bp1ckvizcsym89272kyu` 未被访问或修改。

## 2. 本次能力范围

- 侧边栏按“今日工作、商品与采购、库存与仓配、销售与履约、货盘协作、财务与分析”重组；设置固定在底部。
- OWNER 在核心初始化未完成时，侧边栏显示“开始使用”进度入口。
- 商品资料、待整理采集、市场参考形成同一商品工作区；商品情报相关用词改为更明确的市场参考与外部价格记录。
- 批次库存和单件库存合并为“库存明细”的两个视图。
- “期初盘点/开账”改为“录入已有库存”，并增加仓库和商品前置条件提示。
- 已有库存录入支持缺少 SKU 时快速创建，或进入完整商品创建流程后返回并自动回填；未提交草稿通过当前浏览器会话恢复。
- 库存看板移除销售平台筛选及对应后台过滤；旧 `platformId` 参数不再影响库存结果。
- 库存确认前增加不可逆结果说明，继续保留批次、成本、币种、台账和审计约束。

## 3. 验证结果

本地发布门槛：

- `npm run typecheck`：通过。
- `npm run build`：通过。
- Vitest：125 个测试文件、514 项测试全部通过。
- 全新 PostgreSQL 17 隔离库：61 条 migration 从零执行成功。
- `git diff --check`：通过。

服务器验证：

- 运行时归档 SHA-256：`20434be7145c587de008c5e3c694008a36188731dbcb7ca7f198920703771d0e`。
- migrator 镜像：`sha256:47f81ea6d34a62c2f9550fcb0c1913298eab5211d66e5d4ff9d1de5cbd881eb4`。
- app 镜像：`sha256:ee71d449324f38f618a494ffebedda13befd1da487ba8c6be90cd513c3008f5e`。
- 线上 `prisma migrate deploy`：61 条 migration，无待执行项，migrate 容器退出码为 0。
- app 与 db：`healthy`；scheduler：运行中；Caddy 未重启。
- 公网 `/api/health/live` 与 `/api/health/ready`：HTTP 200，版本与完整 Git SHA 正确，数据库为 `ok`。
- HTTP 自动跳转 HTTPS：308；HTTPS 登录页：200。

## 4. 备份与回滚

发布前仅在香港 ECS 本机创建备份，未向外部 OSS 传输：

`/opt/erp-v2/runtime/backups/pre-0.9.0-rc.3-20260902T083702Z`

包含 `database.dump`、`assets.tar.gz`、`manifest.txt` 和 `SHA256SUMS`。

当前 release：

`/opt/erp-v2/current` → `/opt/erp-v2/releases/ba8861888093a9bb713d33ca5907c67b855da072`

上一应用 release 保留为：

`/opt/erp-v2/releases/6e748cf11189a59fcccef2c7c3d9e837fe247d9d`

切换前的共享环境文件备份：

`/opt/erp-v2/shared/.env.production.pre-0.9.0-rc.3-20260902T090321Z`

应用需要回滚时恢复上述环境文件、原子切回上一 release，并重建 app 与 scheduler。数据库没有新增 migration，不执行数据库回滚。

## 5. 已知事项

- migrator 仍输出 Prisma 无法自动识别 OpenSSL 版本并回退到 `openssl-1.1.x` 的警告；本次迁移退出码为 0，但后续应在 Dockerfile 的 migrator 层显式安装兼容 OpenSSL。
- Docker 构建报告依赖审计存在 7 项漏洞（1 low、1 moderate、5 high）；本次没有自动执行会改变依赖树的 `npm audit fix`，应单独评估并升级。
- Cloud Assistant RAM 身份允许 `RunCommand`，不允许 `SendFile`；本次归档通过受控小分片写入新 incoming 目录后在服务器端合并并校验。
- GitHub SSH 凭据不可用；应用发布提交已在本地 Git 中创建，服务器按该不可变 SHA 部署，但本次没有把分支或标签推送到 GitHub。
- OSS 定时备份、保留策略、告警和隔离恢复演练仍未验证，不能把本次本地备份视为完整灾备闭环。
