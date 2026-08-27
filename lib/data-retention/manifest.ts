import { createHash } from "node:crypto";

export const DEFAULT_RETENTION_CUTOFF = "2026-08-21T00:00:00+08:00";
export const RETENTION_MANIFEST_VERSION = 1;

export interface ForeignKeyEdge {
  childTable: string;
  childColumns: string[];
  parentTable: string;
  parentColumns: string[];
}

export interface SnapshotRow {
  id: string;
  values: Record<string, string | null>;
}

export interface TableSnapshot {
  name: string;
  hasCreatedAt: boolean;
  rows: SnapshotRow[];
}

export interface RetentionPolicy {
  cutoff: string;
  ownerEmails: string[];
  organizationIds: string[];
  storeIds: string[];
}

export interface TableRetentionDecision {
  table: string;
  totalCount: number;
  keepCount: number;
  deleteCount: number;
  keepIdsSha256: string;
  deleteIdsSha256: string;
  deleteIds: string[];
}

export interface RetentionManifest {
  manifestVersion: number;
  createdAt: string;
  targetDatabase: string;
  cutoff: string;
  allowlists: {
    ownerEmails: string[];
    organizationIds: string[];
    storeIds: string[];
  };
  productionIdentity: {
    ownerEmail: string;
    organizationId: string;
    organizationName: string;
    storeId: string;
    storeName: string;
    membershipExists: boolean;
    storeAccessExists: boolean;
  };
  backup: {
    path: string;
    sizeBytes: number;
    sha256: string;
  };
  tables: TableRetentionDecision[];
  invariants: {
    sqlSha256: string;
    before: Array<{ name: string; status: "PASS" | "SKIP"; detail: string }>;
  };
  planSha256: string;
}

const SCOPED_MASTER_TABLES = new Set([
  "memberships",
  "store_accesses",
  "inventory_pool_accesses",
  "channel_accesses",
  "location_accesses",
  "product_categories",
  "locations",
  "location_capabilities",
  "shipping_lanes",
  "platforms",
  "inventory_pools",
  "sales_channel_accounts",
  "charge_categories",
  "charge_rules",
  "work_types",
  "notification_preferences",
]);

const CLOSURE_BOUNDARY_TABLES = new Set([
  "organizations",
  "stores",
  "users",
  "skus",
  "product_categories",
  "locations",
  "platforms",
  "inventory_pools",
  "sales_channel_accounts",
  "fx_rates",
  "charge_categories",
  "charge_rules",
  "work_types",
]);

export function normalizePolicy(input: RetentionPolicy): RetentionPolicy {
  const cutoff = new Date(input.cutoff);
  if (Number.isNaN(cutoff.valueOf())) throw new Error("cutoff 不是有效 ISO 时间");
  const unique = (items: string[]) =>
    [...new Set(items.map((item) => item.trim()).filter(Boolean))].sort();
  const policy = {
    cutoff: input.cutoff,
    ownerEmails: unique(input.ownerEmails.map((email) => email.toLowerCase())),
    organizationIds: unique(input.organizationIds),
    storeIds: unique(input.storeIds),
  };
  if (!policy.ownerEmails.length || !policy.organizationIds.length || !policy.storeIds.length) {
    throw new Error("owner/org/store allowlist 均不能为空");
  }
  if (
    policy.ownerEmails.length !== 1 ||
    policy.organizationIds.length !== 1 ||
    policy.storeIds.length !== 1
  ) {
    throw new Error("首发裁剪只允许一个 production owner、organization 和 store");
  }
  return policy;
}

export function hashStringList(values: string[]): string {
  return createHash("sha256").update([...values].sort().join("\n")).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function manifestPlanHash(manifest: Omit<RetentionManifest, "planSha256">): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

function rowKey(table: string, id: string) {
  return `${table}\0${id}`;
}

function isScopedMasterRow(row: SnapshotRow, policy: RetentionPolicy, ownerUserIds: Set<string>) {
  const values = row.values;
  return (
    (values.organizationId !== null && policy.organizationIds.includes(values.organizationId)) ||
    (values.storeId !== null && policy.storeIds.includes(values.storeId)) ||
    (values.legacyStoreId !== null && policy.storeIds.includes(values.legacyStoreId)) ||
    (values.userId !== null && ownerUserIds.has(values.userId)) ||
    values.organizationId === null
  );
}

function hasExplicitTestMarker(row: SnapshotRow) {
  return Object.values(row.values).some(
    (value) =>
      value !== null &&
      /(?:^|[-_\s])(e2e|test|demo|stress|fixture)(?:[-_\s]|$)|测试|审计|验收/i.test(
        value,
      ),
  );
}

export function deriveRetentionDecisions(
  snapshots: TableSnapshot[],
  foreignKeys: ForeignKeyEdge[],
  rawPolicy: RetentionPolicy,
): TableRetentionDecision[] {
  const policy = normalizePolicy(rawPolicy);
  const cutoffMs = new Date(policy.cutoff).valueOf();
  const tableMap = new Map(snapshots.map((table) => [table.name, table]));
  const keep = new Set<string>();
  const businessRoots = new Set<string>();

  const users = tableMap.get("users")?.rows ?? [];
  const ownerUserIds = new Set(
    users
      .filter((row) => policy.ownerEmails.includes(row.values.email?.toLowerCase() ?? ""))
      .map((row) => row.id),
  );
  if (ownerUserIds.size !== policy.ownerEmails.length) {
    throw new Error("至少一个 production owner email 在目标数据库中不存在");
  }

  for (const table of snapshots) {
    for (const row of table.rows) {
      const key = rowKey(table.name, row.id);
      let shouldKeep = table.name === "_prisma_migrations";
      if (table.name === "organizations") shouldKeep ||= policy.organizationIds.includes(row.id);
      else if (table.name === "stores") shouldKeep ||= policy.storeIds.includes(row.id);
      else if (table.name === "users") shouldKeep ||= ownerUserIds.has(row.id);
      else if (table.name === "memberships") {
        shouldKeep ||=
          ownerUserIds.has(row.values.userId ?? "") &&
          policy.organizationIds.includes(row.values.organizationId ?? "");
      } else if (table.name === "store_accesses") {
        shouldKeep ||=
          ownerUserIds.has(row.values.userId ?? "") &&
          policy.storeIds.includes(row.values.storeId ?? "");
      } else if (
        table.name === "inventory_pool_accesses" ||
        table.name === "channel_accesses" ||
        table.name === "location_accesses"
      ) {
        shouldKeep ||= ownerUserIds.has(row.values.userId ?? "");
      } else if (SCOPED_MASTER_TABLES.has(table.name)) {
        shouldKeep ||= isScopedMasterRow(row, policy, ownerUserIds);
      } else if (table.hasCreatedAt && row.values.createdAt) {
        const touchesProductionScope = Object.values(row.values).some(
          (value) =>
            value !== null &&
            (policy.organizationIds.includes(value) ||
              policy.storeIds.includes(value) ||
              ownerUserIds.has(value)),
        );
        shouldKeep ||=
          touchesProductionScope &&
          !hasExplicitTestMarker(row) &&
          new Date(row.values.createdAt).valueOf() >= cutoffMs;
      }
      if (shouldKeep) {
        keep.add(key);
        if (!CLOSURE_BOUNDARY_TABLES.has(table.name)) businessRoots.add(key);
      }
    }
  }

  const parentIndexes = new Map<string, Map<string, string>>();
  for (const fk of foreignKeys) {
    const parent = tableMap.get(fk.parentTable);
    if (!parent || fk.parentColumns.length !== 1 || fk.childColumns.length !== 1) continue;
    const indexKey = `${fk.parentTable}\0${fk.parentColumns[0]}`;
    if (!parentIndexes.has(indexKey)) {
      parentIndexes.set(
        indexKey,
        new Map(
          parent.rows
            .map((row) => [row.values[fk.parentColumns[0]] ?? (fk.parentColumns[0] === "id" ? row.id : null), row.id] as const)
            .filter((entry): entry is readonly [string, string] => entry[0] !== null),
        ),
      );
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    // Every kept row keeps its real FK ancestors.
    for (const fk of foreignKeys) {
      if (fk.parentColumns.length !== 1 || fk.childColumns.length !== 1) continue;
      const child = tableMap.get(fk.childTable);
      const parentIndex = parentIndexes.get(`${fk.parentTable}\0${fk.parentColumns[0]}`);
      if (!child || !parentIndex) continue;
      for (const row of child.rows) {
        const childKey = rowKey(fk.childTable, row.id);
        if (!keep.has(childKey)) continue;
        const value = row.values[fk.childColumns[0]];
        const parentId = value ? parentIndex.get(value) : undefined;
        if (!parentId) continue;
        const parentKey = rowKey(fk.parentTable, parentId);
        if (!keep.has(parentKey)) {
          keep.add(parentKey);
          if (!CLOSURE_BOUNDARY_TABLES.has(fk.parentTable)) businessRoots.add(parentKey);
          changed = true;
        }
      }
    }

    // Once a business root is retained, retain its relational children as one
    // auditable chain. Scope boundaries never fan out into all tenant data.
    for (const fk of foreignKeys) {
      if (fk.parentColumns.length !== 1 || fk.childColumns.length !== 1) continue;
      if (CLOSURE_BOUNDARY_TABLES.has(fk.parentTable)) continue;
      const child = tableMap.get(fk.childTable);
      const parent = tableMap.get(fk.parentTable);
      if (!child || !parent) continue;
      const retainedParentValues = new Set<string>();
      for (const row of parent.rows) {
        const key = rowKey(parent.name, row.id);
        if (!businessRoots.has(key)) continue;
        const value = row.values[fk.parentColumns[0]] ??
          (fk.parentColumns[0] === "id" ? row.id : null);
        if (value) retainedParentValues.add(value);
      }
      for (const row of child.rows) {
        const value = row.values[fk.childColumns[0]];
        const key = rowKey(child.name, row.id);
        if (value && retainedParentValues.has(value) && !keep.has(key)) {
          keep.add(key);
          if (!CLOSURE_BOUNDARY_TABLES.has(child.name)) businessRoots.add(key);
          changed = true;
        }
      }
    }
  }

  return snapshots
    .map((table) => {
      const keepIds = table.rows.filter((row) => keep.has(rowKey(table.name, row.id))).map((row) => row.id);
      const deleteIds = table.rows.filter((row) => !keep.has(rowKey(table.name, row.id))).map((row) => row.id).sort();
      return {
        table: table.name,
        totalCount: table.rows.length,
        keepCount: keepIds.length,
        deleteCount: deleteIds.length,
        keepIdsSha256: hashStringList(keepIds),
        deleteIdsSha256: hashStringList(deleteIds),
        deleteIds,
      };
    })
    .sort((a, b) => a.table.localeCompare(b.table));
}

export function assertValidManifest(manifest: RetentionManifest) {
  if (manifest.manifestVersion !== RETENTION_MANIFEST_VERSION) {
    throw new Error(`不支持 retention manifest v${manifest.manifestVersion}`);
  }
  normalizePolicy({ cutoff: manifest.cutoff, ...manifest.allowlists });
  if (
    manifest.productionIdentity.ownerEmail.toLowerCase() !==
      manifest.allowlists.ownerEmails[0]?.toLowerCase() ||
    manifest.productionIdentity.organizationId !== manifest.allowlists.organizationIds[0] ||
    manifest.productionIdentity.storeId !== manifest.allowlists.storeIds[0] ||
    !manifest.productionIdentity.organizationName.trim() ||
    !manifest.productionIdentity.storeName.trim()
  ) {
    throw new Error("manifest 的 production identity 与 allowlist 不一致");
  }
  if (!manifest.backup.path || !manifest.backup.sha256 || manifest.backup.sizeBytes <= 0) {
    throw new Error("manifest 缺少可验证备份");
  }
  const { planSha256, ...body } = manifest;
  if (manifestPlanHash(body) !== planSha256) throw new Error("manifest 内容或摘要已被修改");
  for (const table of manifest.tables) {
    if (table.totalCount !== table.keepCount + table.deleteCount) {
      throw new Error(`${table.table} 的保留/删除计数不一致`);
    }
    if (hashStringList(table.deleteIds) !== table.deleteIdsSha256) {
      throw new Error(`${table.table} 的删除 ID 摘要不一致`);
    }
  }
}

export function childFirstDeleteOrder(tables: string[], foreignKeys: ForeignKeyEdge[]): string[] {
  const selected = new Set(tables);
  const dependencies = new Map(tables.map((table) => [table, new Set<string>()]));
  for (const fk of foreignKeys) {
    if (fk.childTable === fk.parentTable) continue;
    if (selected.has(fk.childTable) && selected.has(fk.parentTable)) {
      dependencies.get(fk.parentTable)?.add(fk.childTable);
    }
  }
  const order: string[] = [];
  while (dependencies.size) {
    const ready = [...dependencies].filter(([, deps]) => deps.size === 0).map(([table]) => table).sort();
    if (!ready.length) throw new Error("外键图存在跨表循环，拒绝自动裁剪");
    for (const table of ready) {
      order.push(table);
      dependencies.delete(table);
      for (const deps of dependencies.values()) deps.delete(table);
    }
  }
  return order;
}
