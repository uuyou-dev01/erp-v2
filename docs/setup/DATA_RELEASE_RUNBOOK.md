# 上线数据备份、隔离测试与裁剪手册

本文适用于首个阿里云上线版本。所有命令都必须在代码冻结后的同一个 release commit 上执行。任何一步失败都停止，不跳过、不手工补删。

## 1. 不可突破的安全边界

- E2E 与 Vitest 只能使用 `TEST_DATABASE_URL`，数据库名必须以 `_test` 或 `_e2e` 结尾；测试工具不回退到 `.env` 的 `DATABASE_URL`。
- 裁剪工具只读取 `RETENTION_DATABASE_URL`，每个会接触数据库的命令都要求 `--confirm-db` 与 URL 中的数据库名完全相同。
- 如果 PostgreSQL 客户端不在 `PATH`，设置 `PG_BIN` 为同时包含 `psql`、`pg_dump`、`pg_restore` 的目录。
- `restore` 带 `--clean`，因此只允许恢复到 `_test/_e2e` 数据库。正式库恢复由 DBA 在空库上按阿里云恢复流程执行。
- 没有非空 custom-format dump、SHA-256 sidecar 与恢复演练，不允许生成或应用裁剪计划。
- 禁止运行 `prisma/seed.ts` 清理数据。它是开发 demo seed，不是保留一周工具。
- 默认固定截止时间为 `2026-08-21T00:00:00+08:00`，不会随实际执行日期漂移。业务记录使用 `createdAt` 判断“录入时间”，不是 `updatedAt` 或订单业务日期。

## 2. E2E 隔离环境

先建立专用数据库，例如 `erp_release_e2e`，再显式配置：

```bash
export TEST_DATABASE_URL='postgresql://.../erp_release_e2e?schema=public'
npm run test:e2e
```

Playwright 会在后缀 guard 通过后用 `prisma migrate reset --skip-seed` 清空隔离测试库、执行 `prisma migrate deploy` 和专用 `seed-e2e.ts`，随后用 `next build` / `next start` 启动生产构建。fixture 使用 `e2e-owner@example.invalid`，认证 setup 必须从登录 UI 获取真实签名会话；不使用 `ERP_DEV_USER_EMAIL`。这个 reset 是破坏性操作，因此 guard 不通过时脚本会在调用 Prisma 前终止。

测试截图、fixture 和测试账号只存在于 `_e2e` 数据库，不得把 UAT 数据写回待上线源库。自助注册在生产模式固定关闭；账号 onboarding 测试必须使用邀请注册流程。

Vitest 同样要求显式 `TEST_DATABASE_URL`。当前 setup 只覆盖环境变量，纯函数测试不会连接数据库；任何意外数据库访问都会被隔离到后缀受保护的测试库。

## 3. 创建并验证原始备份

停写应用，确认没有后台 cron、导入任务或测试进程，再执行：

```bash
export RETENTION_DATABASE_URL='postgresql://.../erp'
npm run data:retention -- backup \
  --output /secure-backups/erp-before-retention-20260828.dump \
  --confirm-db erp

npm run data:retention -- inspect \
  --backup /secure-backups/erp-before-retention-20260828.dump
```

`backup` 使用 `pg_dump --format=custom --no-owner --no-acl`，拒绝覆盖已有文件，并原子地创建 `.sha256` sidecar。`inspect` 同时检查非空文件、checksum 和 `pg_restore --list` 可读性。

备份必须保存在仓库外、权限受限的目录。不要上传到 Git、聊天或公开对象存储。

## 4. 恢复演练

创建空的演练数据库，名称必须以 `_test` 或 `_e2e` 结尾：

```bash
export RETENTION_DATABASE_URL='postgresql://.../erp_restore_test'
npm run data:retention -- restore \
  --backup /secure-backups/erp-before-retention-20260828.dump \
  --confirm-db erp_restore_test
```

恢复后在该库执行迁移状态检查、关键页面截图和账实核对。只有 dump 可恢复才算有效备份。

## 5. 生成只读裁剪 manifest

先由负责人确认三个白名单，不能猜测：

- production owner 的完整邮箱；
- 唯一保留企业的数据库 ID；
- 唯一保留店铺的数据库 ID。

```bash
export RETENTION_DATABASE_URL='postgresql://.../erp_cleanup_rehearsal_test'
npm run data:retention -- plan \
  --backup /secure-backups/erp-before-retention-20260828.dump \
  --output /secure-backups/erp-retention-plan-v1.json \
  --confirm-db erp_cleanup_rehearsal_test \
  --owner-email owner@company.example \
  --organization-id org_xxx \
  --store-id store_xxx \
  --organization-name '正式企业名称' \
  --store-name '正式店铺名称' \
  --cutoff '2026-08-21T00:00:00+08:00'
```

`plan` 不删除数据。它记录备份 checksum、白名单、正式身份改绑、每张表的保留/删除计数、删除 ID 及双方摘要。近期根记录必须同时直接触达白名单 organization/store/owner；之后才通过真实外键闭包带入跨企业对手方、祖先和业务子记录。这样本周刚创建但完全属于测试企业的数据不会仅凭时间被保留。

人工审核 manifest 时至少确认：

1. owner、企业、店铺都在保留集合；
2. 最近一周的采购、SKU、入库、库存流水和快录数量符合预期；
3. 被近期记录引用的历史货盘、订单、库存、协议和结算没有进入删除集合；
4. 删除候选中没有真实客户、真实合作企业或仍有库存的记录；
5. 所有 `example.com` 测试账号逐项识别，不能按域名一刀切。

## 6. 演练 apply 与不变量

只在恢复演练库上先执行：

```bash
export RETENTION_DATABASE_URL='postgresql://.../erp_cleanup_rehearsal_test'
npm run data:retention -- apply \
  --manifest /secure-backups/erp-retention-plan-v1.json \
  --confirm-db erp_cleanup_rehearsal_test \
  --ack-polymorphic-review
```

`apply` 会再次验证 manifest、备份 checksum、数据库名和当前数据快照；任何漂移都要求重新备份和 plan。删除按外键子表优先顺序进行，并放在一个 `SERIALIZABLE` 事务内。同一事务还会把正式店铺绑定到正式企业、更新企业/店铺名称，并保证 production owner 拥有有效 `OWNER` Membership 与 StoreAccess。每张表的最终行数、真实外键、费用与库存流水多态引用、预留非负和钱包币种会在提交前核对；错误、锁等待、超时或计数不一致都会回滚整个事务。无法通用断言的库存余额与混币结算会在 manifest 中以 `SKIP` 和原因列出，必须由专项 UAT 补齐。

演练后必须重新执行完整 UI 截图验收，并核对：

- owner 可真实登录，其他测试账号不能登录；
- 企业、成员、店铺、库存池、仓库和渠道权限正确；
- 库存数量与库存流水一致，无负库存或孤立 allocation；
- 委托、货盘、代卖、履约、通知、结算、钱包和费用联动正确；
- 站内通知与 outbox 不重复、不串企业；
- 清理后的数据库可再次 dump 并恢复到另一个空 `_test` 数据库。

## 7. 当前框架限制与正式执行门槛

当前自动闭包覆盖 PostgreSQL 的真实外键。`Fee.refType/refId`、`StockLedger.entityType/entityId`、通知/活动日志的实体引用等多态关系没有数据库外键，必须在正式 apply 前补齐对应的多态关系注册表和专项不变量测试。未补齐前，只能用于备份、inspect、restore、plan 和演练库评估，不批准对唯一正式源库执行 apply。

正式上线还必须：

- 将 13 个未跟踪 migration 纳入 release commit，并从空库验证 `prisma migrate deploy`；
- 记录 release commit SHA、应用版本、manifest SHA 和备份 SHA；
- 阿里云部署后先只读 smoke，再开放写入；
- 原始备份与清理后备份至少保留 30 天，确认稳定后按公司数据政策销毁。
