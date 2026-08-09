"use server";

import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import {
  confirmPriceObservation,
  confirmPurchaseCapture,
  type ConfirmObservationInput,
  type ConfirmPurchaseInput,
} from "@/lib/capture/service";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";

export async function confirmMobilePriceAction(input: ConfirmObservationInput) {
  try {
    await requireActiveCompanionDevice();
    const result = await confirmPriceObservation(input);
    revalidatePath("/m/capture");
    revalidatePath("/product-intelligence");
    return actionSuccess(result);
  } catch (error) {
    return toActionFailure(error, "价格记录保存失败，请重试");
  }
}

export async function confirmMobilePurchaseAction(input: ConfirmPurchaseInput) {
  try {
    await requireActiveCompanionDevice();
    const result = await confirmPurchaseCapture(input);
    revalidatePath("/m");
    revalidatePath("/m/tasks");
    revalidatePath("/procurement");
    revalidatePath("/workbench");
    revalidatePath("/product-intelligence");
    return actionSuccess(result);
  } catch (error) {
    return toActionFailure(error, "购入登记失败，请重试");
  }
}
