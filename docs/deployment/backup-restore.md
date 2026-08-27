# 生产备份与恢复

## 备份目标

- RPO：日常最多 6 小时业务数据；每次发布、迁移和数据清理前另做即时备份。
- RTO：首个版本目标 2 小时内恢复单机服务。
- 每 6 小时生成 1 份 PostgreSQL custom dump 与资产压缩包，并同步到私有 OSS。
- 本机只作短期暂存；私有 OSS 的 `daily/` 前缀保留 14 天（14 份日备），`weekly/` 前缀保留 56 天（8 份周备），并开启服务端加密和版本保护。

## 备份

部署用户安装并配置 `ossutil`，使用只允许写入/读取指定备份前缀的独立 RAM 凭据。`.env.production` 中配置 `OSS_BACKUP_URI` 后运行：

```bash
bash scripts/backup-production.sh
```

每个备份集包含：

- `database.dump`
- `assets.tar.gz`
- `manifest.txt`
- `SHA256SUMS`

脚本每次上传一份到 `daily/`（该前缀名表示 14 天滚动保留，不表示每天只有一份），每个 UTC 周日再复制一份到 `weekly/`；本机自动删除超过 14 天且名称符合备份时间戳格式的暂存目录。OSS 删除不由主机脚本执行，必须在 Bucket 生命周期中配置两条独立规则：`daily/` 14 天过期、`weekly/` 56 天过期。规则启用后通过 OSS 控制台预览匹配对象，避免误匹配其他业务前缀。

宿主定时任务每 6 小时调用该脚本，例如：

```cron
17 */6 * * * cd /opt/erp-v2 && /usr/bin/flock -n .runtime/backup.lock bash scripts/backup-production.sh >> .runtime/backup.log 2>&1
```

任务非零退出、OSS 上传失败或 7 小时内没有新对象时必须告警。应用发布、迁移、数据裁剪前额外运行一次，不依赖周期备份。

## 恢复演练

每月至少在隔离 ECS 或隔离 Compose 项目做一次恢复。不要把演练连接到生产域名，也不要复用生产数据库卷。

生产恢复前必须：

1. 明确事故时间点和目标备份 ID。
2. 保存当前故障现场的数据库与资产副本。
3. 校验 `SHA256SUMS`、版本和 Git SHA。
4. 停止 app 与 scheduler，保留 db 和 Caddy 运维入口。
5. 由两人复核后执行带显式确认值的恢复脚本。

```bash
RESTORE_CONFIRM=restore-erp-production \
  bash scripts/restore-production.sh 20260828T120000Z
```

脚本会用 `pg_restore --clean --if-exists` 覆盖当前数据库对象，并把资产解压到持久化目录，因此属于破坏性操作。恢复后必须依次验证迁移状态、ready、版本、账号登录、最近业务单、库存余额、通知积压和私有凭证读取；确认无误后才恢复外部访问。

## OSS 注意事项

OSS Bucket 必须私有，不向浏览器公开备份前缀。备份 RAM 身份不得拥有删除整个 Bucket、修改 Bucket ACL 或访问其他业务前缀的权限。生命周期删除由 OSS 策略执行，不在应用脚本中递归删除宿主或 Bucket 内容。
