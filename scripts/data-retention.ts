import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  assertConfirmedDatabase,
  assertSafeTestDatabaseUrl,
  parsePostgresDatabaseUrl,
} from "../lib/database/database-url-guard";
import {
  assertValidManifest,
  childFirstDeleteOrder,
  DEFAULT_RETENTION_CUTOFF,
  deriveRetentionDecisions,
  manifestPlanHash,
  RETENTION_MANIFEST_VERSION,
  type ForeignKeyEdge,
  type RetentionManifest,
  type RetentionPolicy,
  type SnapshotRow,
  type TableSnapshot,
} from "../lib/data-retention/manifest";

type Args = Record<string, string | boolean | string[]>;

interface TableMetadata {
  name: string;
  columns: string[];
}

const MAX_ROWS_PER_TABLE = 100_000;

const INVARIANT_CHECKS = [
  {
    name: "validated-foreign-keys",
    sql: `SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.contype = 'f' AND n.nspname = 'public' AND NOT c.convalidated`,
    detail: "所有 public 外键必须处于 validated 状态",
    requires: {},
  },
  {
    name: "fee-polymorphic-orphans",
    sql: `SELECT count(*) FROM fees f WHERE (f."refType" = 'PURCHASE_ORDER' AND NOT EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = f."refId")) OR (f."refType" = 'CUSTOMER_ORDER' AND NOT EXISTS (SELECT 1 FROM customer_orders o WHERE o.id = f."refId")) OR (f."refType" = 'ORDER_LINE' AND NOT EXISTS (SELECT 1 FROM order_lines l WHERE l.id = f."refId"))`,
    detail: "费用的多态业务对象必须存在",
    requires: { fees: ["refType", "refId"], purchase_orders: ["id"], customer_orders: ["id"], order_lines: ["id"] },
  },
  {
    name: "stock-ledger-polymorphic-orphans",
    sql: `SELECT count(*) FROM stock_ledgers s WHERE (s."entityType" = 'LOT' AND NOT EXISTS (SELECT 1 FROM inventory_lots l WHERE l.id = s."entityId")) OR (s."entityType" = 'ITEM_UNIT' AND NOT EXISTS (SELECT 1 FROM item_units i WHERE i.id = s."entityId"))`,
    detail: "库存流水的 LOT/ITEM_UNIT 必须存在",
    requires: { stock_ledgers: ["entityType", "entityId"], inventory_lots: ["id"], item_units: ["id"] },
  },
  {
    name: "reservation-nonnegative",
    sql: `SELECT count(*) FROM supply_reservations r WHERE r.quantity < 0`,
    detail: "货盘预留数量不能为负数",
    requires: { supply_reservations: ["quantity"] },
  },
  {
    name: "wallet-currency-consistency",
    sql: `SELECT count(*) FROM wallet_ledger_entries l JOIN wallet_accounts a ON a.id = l."walletAccountId" WHERE l.currency <> a.currency`,
    detail: "钱包流水币种必须与钱包账户一致",
    requires: { wallet_ledger_entries: ["walletAccountId", "currency"], wallet_accounts: ["id", "currency"] },
  },
] as const;

function invariantSql(checks: ReadonlyArray<(typeof INVARIANT_CHECKS)[number]>) {
  return checks
    .map(
      (check) =>
        `-- ${check.name}\nDO $$ DECLARE violations bigint; BEGIN ${check.sql.replace(/^SELECT count\(\*\)/, "SELECT count(*) INTO violations")}; IF violations <> 0 THEN RAISE EXCEPTION '${check.name} failed: % violations', violations; END IF; END $$;`,
    )
    .join("\n");
}

function pgTool(name: "psql" | "pg_dump" | "pg_restore") {
  return process.env.PG_BIN ? join(process.env.PG_BIN, name) : name;
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  if (!command) throw new Error("缺少命令：backup | inspect | checksum | restore | plan | apply");
  const args: Args = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`无法识别参数：${token}`);
    const key = token.slice(2);
    const next = rest[index + 1];
    const value = next && !next.startsWith("--") ? (index += 1, next) : true;
    if (args[key] === undefined) args[key] = value;
    else args[key] = [...(Array.isArray(args[key]) ? args[key] : [args[key] as string]), value as string];
  }
  return { command, args };
}

function stringArg(args: Args, name: string, required = false) {
  const value = args[name];
  if (Array.isArray(value)) throw new Error(`--${name} 只能出现一次`);
  if (required && typeof value !== "string") throw new Error(`缺少 --${name}`);
  return typeof value === "string" ? value : undefined;
}

function listArg(args: Args, name: string) {
  const value = args[name];
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
}

function databaseUrl() {
  const value = process.env.RETENTION_DATABASE_URL;
  if (!value) throw new Error("必须显式配置 RETENTION_DATABASE_URL；不会回退到 DATABASE_URL");
  return value;
}

function run(command: string, args: string[], options?: { input?: string; env?: NodeJS.ProcessEnv }) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: options?.env ?? process.env,
    input: options?.input,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} 失败（exit ${result.status ?? "unknown"}）：${result.stderr.trim()}`);
  }
  return result.stdout;
}

function postgresEnv(url: string) {
  return { ...process.env, PGDATABASE: url };
}

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireBackup(rawPath: string) {
  const path = resolve(rawPath);
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
    throw new Error(`备份不存在或为空：${path}`);
  }
  return path;
}

function verifyBackupChecksum(path: string, expected?: string) {
  const sidecar = `${path}.sha256`;
  const recorded = expected ??
    (existsSync(sidecar) ? readFileSync(sidecar, "utf8").trim().split(/\s+/)[0] : undefined);
  if (!recorded) throw new Error(`缺少备份 checksum：${sidecar}`);
  const actual = sha256File(path);
  if (actual !== recorded) throw new Error(`备份 checksum 不一致：${path}`);
  return actual;
}

function psqlJson<T>(url: string, sql: string): T {
  const output = run(pgTool("psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-At"], {
    env: postgresEnv(url),
    input: sql,
  }).trim();
  if (!output) throw new Error("psql 未返回 JSON");
  return JSON.parse(output) as T;
}

function invariantReport(url: string, metadata: ReturnType<typeof loadMetadata>) {
  const columnsByTable = new Map(metadata.tables.map((table) => [table.name, new Set(table.columns)]));
  const before: Array<{ name: string; status: "PASS" | "SKIP"; detail: string }> = [];
  const executable: Array<(typeof INVARIANT_CHECKS)[number]> = [];
  for (const check of INVARIANT_CHECKS) {
    const requiredEntries = Object.entries(check.requires) as Array<
      [string, readonly string[]]
    >;
    const missing = requiredEntries.flatMap(([table, columns]) => {
      const available = columnsByTable.get(table);
      return columns.filter((column) => !available?.has(column)).map((column) => `${table}.${column}`);
    });
    if (missing.length) {
      before.push({ name: check.name, status: "SKIP", detail: `缺少表/列：${missing.join(", ")}` });
      continue;
    }
    const violations = Number(psqlJson<number>(url, `SELECT (${check.sql})::text::json;`));
    if (violations !== 0) throw new Error(`${check.name} 有 ${violations} 个不变量违规`);
    before.push({ name: check.name, status: "PASS", detail: check.detail });
    executable.push(check);
  }
  before.push(
    {
      name: "inventory-ledger-balance",
      status: "SKIP" as const,
      detail: "InventoryLot 不存数量快照，需在截图 UAT 中按 StockLedger 重算并与页面核对",
    },
    {
      name: "settlement-mixed-currency-total",
      status: "SKIP" as const,
      detail: "结算允许多币种与规则快照，需按业务币种专项核对，不能用无条件 SUM 断言",
    },
  );
  const sql = invariantSql(executable);
  return { report: { sqlSha256: createHash("sha256").update(sql).digest("hex"), before }, sql };
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function loadMetadata(url: string) {
  const tables = psqlJson<TableMetadata[]>(
    url,
    `SELECT COALESCE(json_agg(payload ORDER BY payload->>'name'), '[]'::json)::text
FROM (
  SELECT json_build_object(
    'name', t.table_name,
    'columns', (
      SELECT json_agg(c.column_name ORDER BY c.ordinal_position)
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.table_name
    )
  ) AS payload
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
) q;`,
  );
  const foreignKeys = psqlJson<ForeignKeyEdge[]>(
    url,
    `SELECT COALESCE(json_agg(payload), '[]'::json)::text
FROM (
  SELECT json_build_object(
    'childTable', child.relname,
    'childColumns', (
      SELECT json_agg(a.attname ORDER BY u.ord)
      FROM unnest(con.conkey) WITH ORDINALITY u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = u.attnum
    ),
    'parentTable', parent.relname,
    'parentColumns', (
      SELECT json_agg(a.attname ORDER BY u.ord)
      FROM unnest(con.confkey) WITH ORDINALITY u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = u.attnum
    )
  ) AS payload
  FROM pg_constraint con
  JOIN pg_class child ON child.oid = con.conrelid
  JOIN pg_class parent ON parent.oid = con.confrelid
  JOIN pg_namespace ns ON ns.oid = child.relnamespace
  WHERE con.contype = 'f' AND ns.nspname = 'public'
) q;`,
  );
  const missingIds = tables.filter((table) => !table.columns.includes("id"));
  if (missingIds.length) {
    throw new Error(`存在无法安全裁剪的无 id 表：${missingIds.map((table) => table.name).join(", ")}`);
  }
  return { tables, foreignKeys };
}

function loadSnapshot(url: string, metadata: ReturnType<typeof loadMetadata>) {
  const fkColumns = new Map<string, Set<string>>();
  for (const fk of metadata.foreignKeys) {
    const child = fkColumns.get(fk.childTable) ?? new Set<string>();
    fk.childColumns.forEach((column) => child.add(column));
    fkColumns.set(fk.childTable, child);
    const parent = fkColumns.get(fk.parentTable) ?? new Set<string>();
    fk.parentColumns.forEach((column) => parent.add(column));
    fkColumns.set(fk.parentTable, parent);
  }

  return metadata.tables.map<TableSnapshot>((table) => {
    const count = Number(
      psqlJson<number>(url, `SELECT count(*)::text::json FROM ${quoteIdentifier(table.name)};`),
    );
    if (count > MAX_ROWS_PER_TABLE) {
      throw new Error(`${table.name} 有 ${count} 行，超过安全上限 ${MAX_ROWS_PER_TABLE}；请人工分批`);
    }
    const desired = new Set([
      "id",
      "createdAt",
      "email",
      "organizationId",
      "storeId",
      "legacyStoreId",
      "userId",
      "code",
      "name",
      "email",
      "sourceType",
      "refType",
      "entityType",
      "orderNo",
      "orderNumber",
      "rawProductName",
      "batchLabel",
      ...(fkColumns.get(table.name) ?? []),
    ]);
    const selected = table.columns.filter((column) => desired.has(column));
    const sql = `SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json)::text FROM (SELECT ${selected
      .map(quoteIdentifier)
      .join(", ")} FROM ${quoteIdentifier(table.name)} ORDER BY "id") q;`;
    const rawRows = psqlJson<Record<string, unknown>[]>(url, sql);
    const rows: SnapshotRow[] = rawRows.map((raw) => ({
      id: String(raw.id),
      values: Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [key, value === null ? null : String(value)]),
      ),
    }));
    return { name: table.name, hasCreatedAt: table.columns.includes("createdAt"), rows };
  });
}

function policyFromArgs(args: Args): RetentionPolicy {
  return {
    cutoff: stringArg(args, "cutoff") ?? DEFAULT_RETENTION_CUTOFF,
    ownerEmails: listArg(args, "owner-email"),
    organizationIds: listArg(args, "organization-id"),
    storeIds: listArg(args, "store-id"),
  };
}

function createManifest(input: {
  url: string;
  backupPath: string;
  policy: RetentionPolicy;
  organizationName: string;
  storeName: string;
  createdAt?: string;
}) {
  const identity = parsePostgresDatabaseUrl(input.url);
  const checksum = verifyBackupChecksum(input.backupPath);
  const metadata = loadMetadata(input.url);
  const snapshot = loadSnapshot(input.url, metadata);
  const owner = snapshot
    .find((table) => table.name === "users")
    ?.rows.find(
      (row) => row.values.email?.toLowerCase() === input.policy.ownerEmails[0]?.toLowerCase(),
    );
  const membershipExists = Boolean(
    owner &&
      snapshot
        .find((table) => table.name === "memberships")
        ?.rows.some(
          (row) =>
            row.values.userId === owner.id &&
            row.values.organizationId === input.policy.organizationIds[0],
        ),
  );
  const storeAccessExists = Boolean(
    owner &&
      snapshot
        .find((table) => table.name === "store_accesses")
        ?.rows.some(
          (row) =>
            row.values.userId === owner.id && row.values.storeId === input.policy.storeIds[0],
        ),
  );
  const invariants = invariantReport(input.url, metadata);
  const body: Omit<RetentionManifest, "planSha256"> = {
    manifestVersion: RETENTION_MANIFEST_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    targetDatabase: identity.databaseName,
    cutoff: input.policy.cutoff,
    allowlists: {
      ownerEmails: input.policy.ownerEmails,
      organizationIds: input.policy.organizationIds,
      storeIds: input.policy.storeIds,
    },
    productionIdentity: {
      ownerEmail: input.policy.ownerEmails[0],
      organizationId: input.policy.organizationIds[0],
      organizationName: input.organizationName,
      storeId: input.policy.storeIds[0],
      storeName: input.storeName,
      membershipExists,
      storeAccessExists,
    },
    backup: {
      path: input.backupPath,
      sizeBytes: statSync(input.backupPath).size,
      sha256: checksum,
    },
    tables: deriveRetentionDecisions(snapshot, metadata.foreignKeys, input.policy),
    invariants: invariants.report,
  };
  return { manifest: { ...body, planSha256: manifestPlanHash(body) }, metadata, invariantSql: invariants.sql };
}

function commandBackup(args: Args) {
  const url = databaseUrl();
  const identity = assertConfirmedDatabase(url, stringArg(args, "confirm-db"));
  const output = resolve(stringArg(args, "output", true)!);
  if (existsSync(output)) throw new Error(`拒绝覆盖现有备份：${output}`);
  run(pgTool("pg_dump"), ["--format=custom", "--no-owner", "--no-acl", "--file", output], {
    env: postgresEnv(url),
  });
  const checksum = sha256File(output);
  writeFileSync(`${output}.sha256`, `${checksum}  ${output}\n`, { flag: "wx" });
  console.log(`备份完成：${identity.safeLabel}\n${output}\nsha256 ${checksum}`);
}

function commandChecksum(args: Args) {
  const backup = requireBackup(stringArg(args, "backup", true)!);
  const checksum = sha256File(backup);
  if (args.write === true) writeFileSync(`${backup}.sha256`, `${checksum}  ${backup}\n`, { flag: "wx" });
  console.log(checksum);
}

function commandInspect(args: Args) {
  const backup = requireBackup(stringArg(args, "backup", true)!);
  const checksum = verifyBackupChecksum(backup);
  const listing = run(pgTool("pg_restore"), ["--list", backup]);
  const entries = listing.split("\n").filter((line) => line && !line.startsWith(";")).length;
  console.log(JSON.stringify({ backup, sizeBytes: statSync(backup).size, sha256: checksum, archiveEntries: entries }, null, 2));
}

function commandRestore(args: Args) {
  const url = databaseUrl();
  const identity = assertSafeTestDatabaseUrl(url, "RETENTION_DATABASE_URL");
  assertConfirmedDatabase(url, stringArg(args, "confirm-db"));
  const backup = requireBackup(stringArg(args, "backup", true)!);
  verifyBackupChecksum(backup);
  run(pgTool("pg_restore"), ["--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error", backup], {
    env: postgresEnv(url),
  });
  console.log(`恢复演练完成：${identity.safeLabel}`);
}

function commandPlan(args: Args) {
  const url = databaseUrl();
  assertConfirmedDatabase(url, stringArg(args, "confirm-db"));
  const backup = requireBackup(stringArg(args, "backup", true)!);
  const output = resolve(stringArg(args, "output", true)!);
  if (existsSync(output)) throw new Error(`拒绝覆盖现有 manifest：${output}`);
  const { manifest } = createManifest({
    url,
    backupPath: backup,
    policy: policyFromArgs(args),
    organizationName: stringArg(args, "organization-name", true)!,
    storeName: stringArg(args, "store-name", true)!,
  });
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const totals = manifest.tables.reduce(
    (sum, table) => ({ keep: sum.keep + table.keepCount, delete: sum.delete + table.deleteCount }),
    { keep: 0, delete: 0 },
  );
  console.log(`裁剪计划已生成（只读）：${output}\n保留 ${totals.keep} 行，候选删除 ${totals.delete} 行`);
}

function buildApplySql(
  manifest: RetentionManifest,
  foreignKeys: ForeignKeyEdge[],
  executableInvariantSql: string,
) {
  const tables = manifest.tables.filter((table) => table.deleteCount > 0).map((table) => table.table);
  const order = childFirstDeleteOrder(tables, foreignKeys);
  const decisions = new Map(manifest.tables.map((table) => [table.table, table]));
  const statements = [
    "BEGIN ISOLATION LEVEL SERIALIZABLE;",
    "SET LOCAL lock_timeout = '10s';",
    "SET LOCAL statement_timeout = '15min';",
    executableInvariantSql,
  ];
  for (const table of order) {
    const decision = decisions.get(table)!;
    for (let offset = 0; offset < decision.deleteIds.length; offset += 1_000) {
      const ids = decision.deleteIds.slice(offset, offset + 1_000).map(quoteLiteral).join(", ");
      statements.push(`DELETE FROM ${quoteIdentifier(table)} WHERE "id" IN (${ids});`);
    }
  }
  const identity = manifest.productionIdentity;
  statements.push(
    `UPDATE organizations SET name = ${quoteLiteral(identity.organizationName)} WHERE id = ${quoteLiteral(identity.organizationId)};`,
    `UPDATE stores SET "organizationId" = ${quoteLiteral(identity.organizationId)}, name = ${quoteLiteral(identity.storeName)} WHERE id = ${quoteLiteral(identity.storeId)};`,
    `UPDATE users SET "storeId" = ${quoteLiteral(identity.storeId)}, role = 'OWNER' WHERE lower(email) = lower(${quoteLiteral(identity.ownerEmail)});`,
    `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt") SELECT concat('release_', md5(random()::text || clock_timestamp()::text)), ${quoteLiteral(identity.organizationId)}, id, 'OWNER', 'ACTIVE', now(), now() FROM users WHERE lower(email) = lower(${quoteLiteral(identity.ownerEmail)}) ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = 'OWNER', status = 'ACTIVE', "updatedAt" = now();`,
    `INSERT INTO store_accesses (id, "storeId", "userId", role, "createdAt", "updatedAt") SELECT concat('release_', md5(random()::text || clock_timestamp()::text)), ${quoteLiteral(identity.storeId)}, id, 'OWNER', now(), now() FROM users WHERE lower(email) = lower(${quoteLiteral(identity.ownerEmail)}) ON CONFLICT ("storeId", "userId") DO UPDATE SET role = 'OWNER', "updatedAt" = now();`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM users u JOIN memberships m ON m."userId" = u.id AND m."organizationId" = ${quoteLiteral(identity.organizationId)} AND m.role = 'OWNER' AND m.status = 'ACTIVE' JOIN store_accesses sa ON sa."userId" = u.id AND sa."storeId" = ${quoteLiteral(identity.storeId)} AND sa.role = 'OWNER' WHERE lower(u.email) = lower(${quoteLiteral(identity.ownerEmail)})) THEN RAISE EXCEPTION 'production identity rebind failed'; END IF; END $$;`,
    executableInvariantSql,
  );
  for (const table of manifest.tables) {
    const identityDelta =
      table.table === "memberships" && !identity.membershipExists
        ? 1
        : table.table === "store_accesses" && !identity.storeAccessExists
          ? 1
          : 0;
    const expected = table.keepCount + identityDelta;
    statements.push(`DO $$ DECLARE actual bigint; BEGIN SELECT count(*) INTO actual FROM ${quoteIdentifier(table.table)}; IF actual <> ${expected} THEN RAISE EXCEPTION 'retention invariant failed for ${table.table}: expected ${expected}, got %', actual; END IF; END $$;`);
  }
  statements.push("COMMIT;");
  return statements.join("\n");
}

function commandApply(args: Args) {
  if (args["ack-polymorphic-review"] !== true) {
    throw new Error("缺少 --ack-polymorphic-review；多态关系人工审核未确认");
  }
  const url = databaseUrl();
  const identity = assertConfirmedDatabase(url, stringArg(args, "confirm-db"));
  const manifestPath = resolve(stringArg(args, "manifest", true)!);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RetentionManifest;
  assertValidManifest(manifest);
  if (manifest.targetDatabase !== identity.databaseName) throw new Error("manifest 的目标数据库不匹配");
  const backup = requireBackup(manifest.backup.path);
  if (statSync(backup).size !== manifest.backup.sizeBytes) throw new Error("备份大小与 manifest 不一致");
  verifyBackupChecksum(backup, manifest.backup.sha256);

  const policy: RetentionPolicy = { cutoff: manifest.cutoff, ...manifest.allowlists };
  const current = createManifest({
    url,
    backupPath: backup,
    policy,
    organizationName: manifest.productionIdentity.organizationName,
    storeName: manifest.productionIdentity.storeName,
    createdAt: manifest.createdAt,
  });
  if (current.manifest.planSha256 !== manifest.planSha256) {
    throw new Error("数据库自 plan 后已变化，拒绝 apply；请重新备份并生成 manifest");
  }
  const invariantSqlSha256 = createHash("sha256").update(current.invariantSql).digest("hex");
  if (manifest.invariants.sqlSha256 !== invariantSqlSha256) {
    throw new Error("manifest 的不变量 SQL 与当前 release 代码不一致");
  }

  const sql = buildApplySql(manifest, current.metadata.foreignKeys, current.invariantSql);
  run(pgTool("psql"), ["-X", "-v", "ON_ERROR_STOP=1"], { env: postgresEnv(url), input: sql });
  console.log(`裁剪完成并通过事务内计数不变量：${identity.safeLabel}`);
}

function usage() {
  console.log(`
数据安全 CLI（RETENTION_DATABASE_URL 必填）

  backup   --output <dump> --confirm-db <db>
  checksum --backup <dump> [--write]
  inspect  --backup <dump>
  restore  --backup <dump> --confirm-db <db>       # 仅 _test/_e2e
  plan     --backup <dump> --output <json> --confirm-db <db>
           --owner-email <email> --organization-id <id> --store-id <id>
           --organization-name <name> --store-name <name>
           [--cutoff ${DEFAULT_RETENTION_CUTOFF}]
  apply    --manifest <json> --confirm-db <db> --ack-polymorphic-review
`);
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (command === "backup") commandBackup(args);
  else if (command === "checksum") commandChecksum(args);
  else if (command === "inspect") commandInspect(args);
  else if (command === "restore") commandRestore(args);
  else if (command === "plan") commandPlan(args);
  else if (command === "apply") commandApply(args);
  else if (command === "help" || command === "--help") usage();
  else throw new Error(`未知命令：${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  usage();
  process.exitCode = 1;
});
