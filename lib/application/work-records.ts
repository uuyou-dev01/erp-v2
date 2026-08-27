import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";

type WorkRecordClient = Pick<Prisma.TransactionClient, "workType" | "workRecord">;

export interface RecordWorkInput {
  organizationId: string;
  storeId: string;
  userId: string;
  code: string;
  name: string;
  quantity: Decimal.Value;
  unit: string;
  sourceType: string;
  sourceId: string;
  dedupeKey: string;
  taskId?: string | null;
  relationshipType?:
    | "SELF"
    | "MEMBER"
    | "WAREHOUSE_COLLABORATOR"
    | "PARTNER_ORGANIZATION"
    | "UNKNOWN";
  locationId?: string | null;
  executorOrganizationId?: string | null;
  occurredAt?: Date;
  metadata?: Prisma.InputJsonValue;
}

function normalizeCode(value: string) {
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]+/g, "_");
  if (!code) throw new Error("工作类型代码不能为空");
  return code;
}

export async function recordWork(client: WorkRecordClient, input: RecordWorkInput) {
  const code = normalizeCode(input.code);
  const name = input.name.trim() || code;
  const unit = input.unit.trim();
  const quantity = new Decimal(input.quantity);
  if (!quantity.isFinite() || quantity.lte(0)) throw new Error("工作量必须大于 0");
  if (!unit) throw new Error("工作量单位不能为空");
  if (!input.dedupeKey.trim()) throw new Error("工作记录幂等键不能为空");

  const workType = await client.workType.upsert({
    where: { organizationId_code: { organizationId: input.organizationId, code } },
    update: {},
    create: {
      organizationId: input.organizationId,
      code,
      name,
      unit,
    },
  });

  return client.workRecord.upsert({
    where: {
      organizationId_dedupeKey: {
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey.trim(),
      },
    },
    update: {},
    create: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      userId: input.userId,
      workTypeId: workType.id,
      taskId: input.taskId || null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      workCode: code,
      workName: workType.name,
      quantity: quantity.toFixed(4),
      unit: workType.unit,
      relationshipType: input.relationshipType ?? "UNKNOWN",
      locationId: input.locationId ?? null,
      executorOrganizationId: input.executorOrganizationId ?? null,
      dedupeKey: input.dedupeKey.trim(),
      occurredAt: input.occurredAt ?? new Date(),
      metadata: input.metadata,
    },
  });
}
