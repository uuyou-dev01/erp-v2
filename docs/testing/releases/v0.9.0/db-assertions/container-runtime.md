# v0.9.0 容器运行时验收

- 验收时间：2026-08-27T17:08:42Z
- 验收提交：`12d4242cbe226cacd9dc179282aec9a75dcaaccc`
- 目标镜像：`erp-v2-app:v0.9.0-12d4242cbe22`
- 结论：**BLOCKED（镜像未构建，运行时验收未执行）**

## Docker 与 Compose

本地 Docker 引擎可用：

```text
Docker client: 28.0.1
Docker server: 28.0.1
Docker Compose: v2.33.1-desktop.1
BuildKit: v0.20.0
```

以下配置解析检查均通过，期间未启动任何服务：

```bash
docker compose --env-file .env.production.example \
  -f compose.production.yml config --no-interpolate --quiet

docker compose --env-file .env.production.example \
  -f compose.production.yml -f compose.nginx.yml \
  config --no-interpolate --quiet
```

使用示例环境解析出的镜像名称如下，app、scheduler 与 migrate 均同时包含版本号和 Git SHA：

```text
erp-v2-migrate:v0.9.0-rc.1-replace-with-full-git-sha
erp-v2-app:v0.9.0-rc.1-replace-with-full-git-sha
erp-v2-app:v0.9.0-rc.1-replace-with-full-git-sha
caddy:2.10-alpine
postgres:17-bookworm
```

## 生产镜像构建

执行了以下纯本地构建命令；未连接数据库，也未启动 app、PostgreSQL、scheduler 或反向代理：

```bash
docker build --progress=plain --target runner \
  --build-arg APP_VERSION=0.9.0 \
  --build-arg GIT_SHA=12d4242cbe226cacd9dc179282aec9a75dcaaccc \
  --build-arg BUILD_DATE=2026-08-27T17:08:42Z \
  -t erp-v2-app:v0.9.0-12d4242cbe22 .
```

构建在解析 Dockerfile frontend 时失败，尚未执行依赖安装、Prisma generate 或 Next.js build：

```text
failed to fetch anonymous token from https://auth.docker.io/token
dial tcp 69.171.229.73:443: i/o timeout
```

独立网络检查也确认 `auth.docker.io:443` 当前无法连接。本地仅缓存 `mysql:8.4`，没有 `docker/dockerfile:1.7`、`node:22-bookworm-slim` 或可复用的 ERP 镜像，因此无法离线继续构建。

## Chromium 与 Tesseract

`scripts/verify-container-runtime.mjs` 本轮未运行。以下项目均为 **未验证**，不能作为上线放行证据：

- Playwright Chromium 能否在最终非 root runner 中启动。
- Tesseract `chi_sim` 简体中文识别。
- Tesseract `jpn` 日文识别。
- Tesseract `eng` 英文识别。
- 三语数据包、worker 路径和字体在最终镜像中的实际可用性。

## 解除阻塞后的复验

恢复 Docker Hub 访问，或配置经审核的阿里云容器镜像代理后，重新执行上述构建。构建成功后，在临时目录准备脱敏的 `chi_sim.png`、`jpn.png`、`eng.png`，以只读卷运行：

```bash
docker run --rm \
  -e ERP_RUNTIME_FIXTURE_DIR=/runtime-fixtures \
  -v /absolute/path/to/runtime-fixtures:/runtime-fixtures:ro \
  erp-v2-app:v0.9.0-12d4242cbe22 \
  node scripts/verify-container-runtime.mjs
```

放行条件是三种 OCR 均返回非空文本，且日志包含 `chromium: ok`。复验成功前，本检查项保持阻塞。
