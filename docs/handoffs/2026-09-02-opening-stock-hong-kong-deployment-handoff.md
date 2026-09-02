# 期初库存与香港测试环境部署交接

> 日期：2026-09-02
> 分支：`codex/release-v0.9.0`
> 应用发布提交：`6e748cf11189a59fcccef2c7c3d9e837fe247d9d`
> 发布版本：`0.9.0-rc.2`
> 正式测试入口：<https://erp-test.lianyuapt.com>
> 用途：后续会话处理库存、发布、域名、证书、备份或服务器运维前必须先阅读本文。

## 1. 本次交付结论

`v0.9.0-rc.2` 已于 2026-09-02 部署到阿里云香港 ECS。仓库创建后可以立即进入期初库存盘点；无论仓库当前是否已有库存，都保留期初库存和现有库存盘点入口。期初库存支持按仓库、SKU 和批次录入数量、单位成本、币种和批次标签，以便把系统启用前已经存在的实物与成本带入库存台账。

公网域名、HTTP 到 HTTPS 跳转、TLS 证书、应用和数据库健康检查均已通过。杭州实例仍是酒店专用服务器，不承载 ERP。

## 2. 不得混淆的固定托管拓扑

| 服务 | 域名 | ECS 实例 | 地域 | 公网 IP |
| --- | --- | --- | --- | --- |
| ERP 测试环境 | `erp-test.lianyuapt.com` | `i-j6ca0c7fir70xwtdr9pt` | 中国香港 | `47.243.87.184` |
| 酒店系统 | `lianyu-test.lianyuapt.com` | `i-bp1ckvizcsym89272kyu` | 杭州 | `47.98.181.237` |

`lianyuapt.com` 属于公寓业务，本项目只是借用其子域名。ERP 因需要同时服务东京和中国内地用户，固定运行在香港实例。任何部署动作必须同时核对实例 ID、地域和公网 IP，不得只看域名或控制台实例名称。

详细约束见 `docs/deployment/hosting-topology.md`。

## 3. 期初库存能力

发布提交：`6e748cf feat: add warehouse opening stock workflow`

已经完成：

- 新建仓库后将期初库存设置作为下一项操作提示。
- 空仓和已有库存的仓库详情页都保留期初库存入口。
- 期初库存按仓库范围选择经营 SKU，不能把其他仓库的库存误作来源。
- 每一批可记录数量、单位成本、币种、批次标签和批次价值。
- 新迁移为 `StockLedger` 增加期初批次标签字段。

主要实现：

- `app/(dashboard)/inventory/locations/[id]/page.tsx`
- `app/(dashboard)/inventory/opening-stock/new/page.tsx`
- `app/(dashboard)/inventory/opening-stock/[id]/page.tsx`
- `components/inventory/opening-stock-form.tsx`
- `app/actions/opening-stock.ts`
- `prisma/migrations/20260901090000_opening_stock_batch_label/migration.sql`
- `tests/application/location-opening-stock-source.test.ts`

必须保持的库存不变量：期初库存是经过确认的库存入账动作，不是简单修改展示数量；数量与成本必须保留批次和台账追踪；后续调整不得绕过仓库范围、权限、事务或审计边界。

## 4. 香港 ECS 当前运行状态

- 操作系统：Ubuntu 26.04，约 2 vCPU / 4 GiB，已配置 2 GiB swap。
- 发布根目录：`/opt/erp-v2`。
- 当前版本链接：`/opt/erp-v2/current` → `/opt/erp-v2/releases/6e748cf11189a59fcccef2c7c3d9e837fe247d9d`。
- 共享配置：`/opt/erp-v2/shared/.env.production`，权限为 `0600`；不得把内容写入文档、日志或 Git。
- 持久化数据：`/opt/erp-v2/runtime`，包含 PostgreSQL、资产、Caddy 状态和备份。
- Compose 项目名：`erp-v2`。
- 当前服务：`db`、`app`、`scheduler`、`caddy`。
- App 镜像：`erp-v2-app:v0.9.0-rc.2-6e748cf11189a59fcccef2c7c3d9e837fe247d9d`。
- Migrate 镜像：`erp-v2-migrate:v0.9.0-rc.2-6e748cf11189a59fcccef2c7c3d9e837fe247d9d`。
- PostgreSQL 镜像：`postgres:17-bookworm`。
- Caddy 镜像：`caddy:2.10-alpine`。
- 应用端口只发布到宿主 `127.0.0.1:3000`；PostgreSQL 不对公网发布。
- Caddy 独占公网 80/443，宿主没有启用 Nginx。

直接 SSH 认证在本次会话不可用，实际运维通过阿里云 Cloud Assistant 执行。用于发布归档上传的临时 SSH 公钥已从服务器 `authorized_keys` 删除，本地临时私钥也已删除。

## 5. 域名、网络与证书

- DNS A 记录：`erp-test.lianyuapt.com` → `47.243.87.184`。
- 香港安全组：`sg-j6ca0c7fir70xwt8f8ts`。
- 用户已在控制台开放公网入方向 TCP 80 和 TCP 443。
- HTTP 返回 `308` 并跳转到 HTTPS。
- TLS 证书 CN：`erp-test.lianyuapt.com`。
- 签发方：Let's Encrypt `YE2`。
- 本次证书有效期：2026-09-02 至 2026-12-01；Caddy 负责自动续期。
- 旧 ngrok 入口 `https://skeletal-glaring-willow.ngrok-free.dev` 在交接时仍在运行，但正式测试应改用域名入口。确认团队不再依赖后才能停用 ngrok。

当前本地阿里云 RAM 凭据不能调用 AliDNS 或安全组读写 API；本次 DNS 和安全组变更由用户在控制台完成。后续自动化前应配置最小权限，不要在仓库中保存 AccessKey。

## 6. 数据迁移、备份与验证证据

部署前备份：

`/opt/erp-v2/runtime/backups/pre-0.9.0-rc.2-20260902T040256Z`

该备份包含 `database.dump`、`assets.tar.gz`、`manifest.txt` 和 `SHA256SUMS`，交接时校验通过。它目前是服务器本地备份；OSS 定时备份和恢复演练尚未在本次会话验证。

已应用迁移：

`20260901090000_opening_stock_batch_label`

独立验证结果：

- `/api/health/live`：HTTP 200，`appVersion=0.9.0-rc.2`，Git SHA 与发布提交一致。
- `/api/health/ready`：HTTP 200，`database=ok`。
- 公网 `https://erp-test.lianyuapt.com/api/health/ready`：HTTP 200。
- app 容器：`healthy`。
- scheduler 容器：`running`。
- 数据库迁移表：上述迁移状态为已完成且未回滚。
- rc.2 镜像在香港服务器完成生产构建；首次并行构建遇到 npm registry `ECONNRESET`，改为先构建 migrate、再构建 app 后成功，线上 rc.1 在构建阶段未受影响。

Prisma migrate 容器曾输出无法自动识别 OpenSSL 版本、回退到 `openssl-1.1.x` 的警告，但迁移实际成功。后续应在隔离环境确认 migrator 镜像的 OpenSSL 依赖并消除警告，不能仅因这次成功而长期忽略。

## 7. 后续发布方式

发布必须遵循：备份 → 上传不可变 release → 分开构建 migrate/app → 执行 `prisma migrate deploy` → 原子切换 `current` → 启动服务 → 内外网健康检查。禁止在生产数据库执行 `prisma db push`、`prisma migrate dev` 或 seed。

当前使用的 Compose 组合为：

```bash
docker compose --env-file /opt/erp-v2/shared/.env.production \
  -f compose.production.yml -f compose.nginx.yml
```

虽然额外文件名为 `compose.nginx.yml`，它在当前环境仅把 app 发布到宿主回环地址；公网代理仍是 Compose 内的 Caddy。后续不得安装或启动宿主 Nginx 与 Caddy 抢占 80/443。

常用只读验证：

```bash
curl --fail https://erp-test.lianyuapt.com/api/health/live
curl --fail https://erp-test.lianyuapt.com/api/health/ready
docker compose --env-file /opt/erp-v2/shared/.env.production \
  -f compose.production.yml -f compose.nginx.yml ps
```

数据库迁移必须向后兼容。应用回滚可以切回上一 release 和旧镜像，但数据库不得自动执行破坏性回滚；恢复数据库前必须走 `docs/deployment/backup-restore.md` 的双人复核流程。

## 8. 尚未完成和需要关注的事项

1. 在真实账号下完成一次受控浏览器验收：新建或选择测试仓库，录入两批不同数量/单位成本/币种/批次标签的期初库存，核对仓库统计、台账和批次价值；本次会话只完成了代码测试、迁移和运行健康验证，没有代替用户执行真实库存写入。
2. 配置每 6 小时备份、私有 OSS 同步、保留策略和失败告警，并做一次隔离恢复演练；当前仅确认发布前本地备份。
3. 配置阿里云监控：CPU、内存、磁盘、容器健康、HTTPS ready、备份新鲜度、数据库连接数和慢查询。
4. 确认安全组的 SSH 22 只允许管理员固定 IP；本次只验证并开放了 80/443，没有完成 22 来源范围审计。
5. 确认正式域名稳定使用后，再决定是否停用旧 ngrok 服务。
6. 杭州酒店实例此前曾留下未启动的 ERP 准备内容：Docker/Compose、2 GiB swap 和 `/opt/erp-v2` 发布文件。没有启动 ERP 容器，没有修改酒店 Nginx、域名或业务服务。清理会删除文件或改变系统环境，必须先取得用户明确授权并再次核对酒店服务，不能由后续会话自行删除。
7. `docs/releases/v0.9.0.md` 仍有正式 `v0.9.0` 的数据恢复、完整 UAT 和发布门槛；本次上线是测试环境 `rc.2`，不能据此宣称正式生产版本已经发布。

## 9. 后续会话启动清单

1. 阅读本文、`agent.md`、`docs/deployment/hosting-topology.md`、`docs/deployment/aliyun-production.md` 和 `docs/deployment/backup-restore.md`。
2. 执行 `git status --short`，保护用户或其他会话未提交的改动。
3. 访问正式测试入口并核对 `/api/health/ready` 返回的版本与 Git SHA。
4. 任何服务器动作前再次核对香港实例 ID、地域与 IP；杭州实例默认禁止触碰。
5. 不读取、输出或提交 `.env.production`、AccessKey、数据库密码、会话密钥或证书私钥。
6. 若继续期初库存功能，先核对仓库范围、批次成本、币种、台账和审计不变量，再做修改。

