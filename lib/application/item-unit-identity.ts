import { Prisma } from "@prisma/client";

type ItemUnitIdentityReader = Pick<Prisma.TransactionClient, "$executeRaw" | "itemUnit">;
type ItemUnitCreateData = Prisma.ItemUnitUncheckedCreateInput;

const DEFAULT_IDENTITY_RETRIES = 5;

function formatDateSegment(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function buildItemUnitCodePrefix(input: { storeId: string; date?: Date }) {
  const dateSegment = formatDateSegment(input.date ?? new Date());

  return {
    dateSegment,
    prefix: `IU-${dateSegment}-`,
    lockKey: `item-unit:${input.storeId}:${dateSegment}`,
  };
}

async function lockItemUnitCodePrefix(tx: ItemUnitIdentityReader, lockKey: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}

export async function generateItemUnitDisplayCode(
  tx: ItemUnitIdentityReader,
  input: { storeId: string; date?: Date }
) {
  const { prefix } = buildItemUnitCodePrefix(input);
  const latest = await tx.itemUnit.findFirst({
    where: {
      storeId: input.storeId,
      unitCode: { startsWith: prefix },
    },
    select: { unitCode: true },
    orderBy: { unitCode: "desc" },
  });

  const latestSequence = latest?.unitCode
    ? Number(latest.unitCode.slice(prefix.length))
    : 0;
  const nextSequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1;

  return `${prefix}${String(nextSequence).padStart(6, "0")}`;
}

function isItemUnitIdentityConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target : [target];

  return fields.some((field) => field === "unitCode" || field === "labelCode");
}

export async function createItemUnitWithIdentity(
  tx: ItemUnitIdentityReader,
  input: {
    storeId: string;
    date?: Date;
    data: Omit<ItemUnitCreateData, "unitCode" | "labelCode" | "labelStatus">;
    maxRetries?: number;
  }
) {
  const maxRetries = input.maxRetries ?? DEFAULT_IDENTITY_RETRIES;
  const codePrefix = buildItemUnitCodePrefix(input);

  await lockItemUnitCodePrefix(tx, codePrefix.lockKey);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const unitCode = await generateItemUnitDisplayCode(tx, {
      storeId: input.storeId,
      date: input.date,
    });

    try {
      return await tx.itemUnit.create({
        data: {
          ...input.data,
          unitCode,
          labelCode: unitCode,
          labelStatus: "PENDING",
        },
      });
    } catch (error) {
      if (!isItemUnitIdentityConflict(error)) {
        throw error;
      }
      if (attempt === maxRetries) {
        throw new Error("生成单品编码冲突，请重试");
      }
    }
  }

  throw new Error("生成单品编码失败，请重试");
}
