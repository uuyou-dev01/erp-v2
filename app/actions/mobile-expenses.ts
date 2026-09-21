"use server";
import { requireUserContext } from "@/lib/auth/user-context";
import { createChargeEventAction } from "@/app/actions/charges";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { revalidatePath } from "next/cache";
export async function saveMobileExpense(input: {
  categoryId: string;
  amount: string;
  currency: string;
  description: string;
  payee: string;
  key: string;
}) {
  try {
    const context = await requireUserContext();
    if (!input.description.trim() || !input.payee.trim()) throw new Error("请填写用途和收款方");
    if (!/^[0-9a-f-]{36}$/i.test(input.key)) throw new Error("登记标识无效，请刷新后重试");
    const key = `mobile-expense:${context.organizationId}:${context.userId}:${input.key}`;
    const existing = await prisma.chargeEvent.findFirst({
      where: { organizationId: context.organizationId, idempotencyKey: key },
      select: { id: true },
    });
    if (existing) return actionSuccess({ id: existing.id });
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { name: true },
    });
    const result = await createChargeEventAction({
      categoryId: input.categoryId,
      sourceType: "MOBILE_EXPENSE",
      sourceId: input.key,
      idempotencyKey: key,
      amount: input.amount,
      currency: input.currency,
      amountKind: "ACTUAL",
      description: input.description,
      parties: [
        {
          role: "PAYER",
          partyType: "ORGANIZATION",
          partyId: context.organizationId,
          organizationId: context.organizationId,
          name: organization.name,
        },
        { role: "PAYEE", partyType: "PARTNER", partyId: `manual:${input.key}`, name: input.payee },
      ],
      submit: false,
    });
    revalidatePath("/m/expenses");
    return result;
  } catch (error) {
    return toActionFailure(error, "费用保存失败");
  }
}
