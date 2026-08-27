# 阿里云单机生产部署手册

本文对应 10 人以内的首个生产版本，目标环境为阿里云 ECS 2 核 4 GB、x86_64 Linux、Docker Engine 与 Compose Plugin。PostgreSQL、应用和 Caddy 位于同一台 ECS，但数据库与应用端口不暴露公网。

## 1. 上线前硬门槛

- 实例至少 2 核 4 GB、40 GB 可用磁盘，并配置 2 GB swap。
- 域名已解析到 ECS；若实例在中国大陆，域名和网站备案必须完成。
- 安全组仅对公网开放 80/443；22 仅允许管理员固定 IP；不得开放 3000/5432。
- 发布代码必须来自已审核的干净提交，并确定 `APP_VERSION`、完整 `GIT_SHA` 与 UTC `BUILD_DATE`。
- 在隔离数据库完成全新迁移、生产构建、OCR/Chromium、上传和多账号截图验收。严禁把 Playwright 或 seed 指向本机业务库或生产库。
- 发布前完成一次备份，并在隔离环境验证该备份可恢复。

取得服务器只读 SSH 权限后，先保存主机盘点结果：

```bash
bash scripts/aliyun-preflight.sh | tee aliyun-preflight-v0.9.0.txt
```

脚本只读取系统、磁盘、监听端口、现有反向代理和容器状态。实例地域与
安全组规则仍需在阿里云控制台核对。盘点未经主 Agent 审核前不安装软件、
不停止现有服务，也不占用 80/443。

## 2. 主机目录与配置

将仓库放在固定目录，例如 `/opt/erp-v2`。复制 `.env.production.example` 为 `.env.production`，权限设置为仅部署用户可读。四个应用密钥必须分别随机生成，不能复用：

- `ERP_SESSION_SECRET`
- `AUTH_AUDIT_PEPPER`
- `MOBILE_CRON_SECRET`
- `FX_SYNC_TOKEN`

数据库密码放入 `POSTGRES_PASSWORD`，并在 `DATABASE_URL` 中使用 URL 编码后的同一密码。生产环境不得配置 `ERP_DEV_USER_EMAIL`、`ERP_DEMO_PASSWORD`，不得开启 `AUTH_SELF_SIGNUP_ENABLED`。

运行数据固定在仓库下的 `.runtime/`：

- `.runtime/postgres`：PostgreSQL 17 数据。
- `.runtime/assets`：公开商品图与私有业务凭证。
- `.runtime/caddy-data`、`.runtime/caddy-config`：证书和 Caddy 状态。
- `.runtime/backups`：本机备份暂存。

这些目录不进入 Git，也不能随应用镜像更新被覆盖。

首次启动前创建资产目录并交给容器内的非 root 用户：

```bash
install -d -m 0750 -o 1001 -g 1001 .runtime/assets
```

## 3. 首次发布顺序

以下命令仅供经授权的部署人员在 ECS 上执行；任何数据恢复事故处理期间不要执行。

```bash
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml up -d db
docker compose --env-file .env.production -f compose.production.yml run --rm migrate
docker compose --env-file .env.production -f compose.production.yml up -d app scheduler caddy
```

`migrate` 只允许执行 `prisma migrate deploy`。生产环境禁止 `prisma db push`、`prisma migrate dev` 和所有 seed 脚本。

验收：

```bash
curl --fail https://ERP域名/api/health/live
curl --fail https://ERP域名/api/health/ready
docker compose --env-file .env.production -f compose.production.yml ps
```

`ready` 只验证应用和数据库连通性，并返回 `appVersion` 与 `gitSha`。移动端业务健康、通知 outbox 与留存接口继续使用 Bearer secret，不对公网监控泄露密钥。

### 已有 Nginx 的公司服务器

Caddy 与宿主现有 Nginx 只能二选一，不得同时占用 80/443。若服务器已经由 Nginx 统一管理证书和域名，不启动 `caddy`，使用额外 Compose 文件只把应用发布到宿主回环地址：

```bash
docker compose --env-file .env.production -f compose.production.yml stop caddy
docker compose --env-file .env.production \
  -f compose.production.yml -f compose.nginx.yml \
  up -d db migrate app scheduler
```

将 `deploy/nginx/erp.conf.example` 合并到宿主 Nginx，替换域名和证书路径，确认上游只能通过 `127.0.0.1:3000` 访问。若服务器没有现成反向代理，则使用 Caddy 路线，不安装或启动 Nginx。

## 4. 更新与回滚

1. 更新前运行 `bash scripts/backup-production.sh`。
2. 构建带新版本号和 Git SHA 的镜像。
3. 先运行一次 `migrate`；成功后再替换 app 与 scheduler。
4. 检查 ready、登录、只读列表、文件读取和一笔受控业务烟测。
5. 应用回滚使用上一个镜像标签。数据库迁移必须保持向后兼容；无法向后兼容的迁移不得与应用同时直接上线。

初次上线后 24 小时重点观察容器重启次数、内存、磁盘、数据库慢查询、通知积压和浏览器/OCR 排队超时。日志通过 Docker stdout 收集，Caddy 输出 JSON 访问日志；宿主 Docker 日志驱动需设置大小和文件数上限。

数据库与资产备份通过宿主 cron 每 6 小时运行
`scripts/backup-production.sh`；详细的 OSS 保留、失败告警和每月恢复演练见
`docs/deployment/backup-restore.md`。该 cron 不放进应用 scheduler，避免应用容器重启或卡死时连带失去备份。

## 5. 资源与外部依赖

- App 限制约 2.25 GB，并给 Chromium 512 MB `/dev/shm`。
- PostgreSQL 限制 768 MB、50 个连接；应用连接池默认限制为 5。
- OCR 和 Chromium 各只允许 1 个并发，排队 60 秒后失败并提示重试。
- 容器时区固定 `Asia/Shanghai`；当前通知静默时间也按该时区解释。
- 汇率同步依赖外部 HTTPS API，必须确认 ECS 出站 DNS/443 可用。

### Chromium 与 OCR 镜像验收

Docker 镜像安装与 npm `playwright` 版本匹配的 Chromium、Noto CJK 字体，以及 npm 内置的简体中文、日文和英文 Tesseract 语言包。发布候选镜像必须实际启动浏览器并分别识别三张脱敏图片，不能只检查文件是否存在。

准备 `chi_sim.png`、`jpn.png`、`eng.png` 后执行：

```bash
docker compose --env-file .env.production -f compose.production.yml \
  cp .runtime/acceptance app:/tmp/erp-runtime-fixtures
docker compose --env-file .env.production -f compose.production.yml \
  exec -e ERP_RUNTIME_FIXTURE_DIR=/tmp/erp-runtime-fixtures app \
  node scripts/verify-container-runtime.mjs
```

三种 OCR 都必须返回非空文本，Chromium 必须输出 `chromium: ok`。再从实际页面完成一次商品链接采集和手机凭证 OCR，确认容器网络、字体、队列限制和业务鉴权一起生效。

## 6. 当前资产迁移边界

新桌面上传与移动上传会写入统一的 `mobile_assets` 记录和 `.runtime/assets` 宿主卷，使用魔数、大小、像素、SHA-256、UUID、企业和店铺归属校验。商品目录图可公开缓存；业务凭证默认私有。未绑定时只允许上传者或企业 OWNER/ADMIN 读取；绑定后按对应业务对象的店铺授权以及具体委托任务参与人授权读取，不能仅凭“同企业、同店铺”枚举其他凭证。

发货凭证、手机收货/到货/入库/退货检查凭证会绑定对应业务对象；提现打款若使用本系统资产 URL，会绑定提现申请。历史 `/public/uploads` 文件不会在部署时自动迁移。上线前应另行生成“数据库 URL → 原文件 → 新资产记录”的只读清单，经备份后再执行一次性迁移；未迁移的历史链接不得误判为已受新鉴权保护。
