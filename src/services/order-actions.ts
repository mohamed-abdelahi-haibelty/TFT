"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";
import type { ServiceResult } from "@/src/lib/errors";
import { currentMonthKey, dashboardMonthTag } from "@/src/services/dashboard";
import {
  addOrderItem,
  advanceOrderStatus,
  cancelOrder,
  confirmOrder,
  removeOrderItem,
  updateOrderItemQty,
  voidOrder,
} from "@/src/services/orders";

/**
 * Every order mutation can change stock (confirm/cancel/edit all touch it),
 * so the storefront's product/bundle caches are always invalidated alongside
 * the order routes — cheaper than conditioning it on which action actually
 * moved stock. Only the *current* month's dashboard tag is revalidated (task
 * 16): a mutation on an old order is rare and the historical months it would
 * touch stay cached until their own short revalidation window passes.
 */
async function revalidateOrder(orderId: string) {
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin/orders/${orderId}`);
  revalidatePath(`/${locale}/admin`);
  revalidateTag("products", "max");
  revalidateTag("bundles", "max");
  revalidateTag(dashboardMonthTag(currentMonthKey()), "max");
}

export async function confirmOrderAction(
  orderId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await confirmOrder(orderId, {
    paymentMethod: formData.get("paymentMethod") || undefined,
    paymentNote: formData.get("paymentNote") || undefined,
  });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function advanceOrderStatusAction(
  orderId: string,
  target: "preparing" | "shipped" | "ready" | "arrived" | "delivered",
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await advanceOrderStatus(orderId, {
    target,
    busCompany: formData.get("busCompany") || undefined,
    busNote: formData.get("busNote") || undefined,
  });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function cancelOrderAction(
  orderId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await cancelOrder(orderId, { reason: formData.get("reason") });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function voidOrderAction(
  orderId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await voidOrder(orderId, { reason: formData.get("reason") });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function addOrderItemAction(
  orderId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const locale = await getLocale();
  const result = await addOrderItem(
    orderId,
    {
      kind: formData.get("kind"),
      productId: formData.get("productId") || undefined,
      variantId: formData.get("variantId") || undefined,
      bundleId: formData.get("bundleId") || undefined,
      qty: Number(formData.get("qty")),
    },
    locale,
  );
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function updateOrderItemQtyAction(
  orderId: string,
  itemId: string,
  _prev: ServiceResult<null> | null,
  formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await updateOrderItemQty(orderId, itemId, { qty: Number(formData.get("qty")) });
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}

export async function removeOrderItemAction(
  orderId: string,
  itemId: string,
  _prev: ServiceResult<null> | null,
  _formData: FormData,
): Promise<ServiceResult<null>> {
  const result = await removeOrderItem(orderId, itemId);
  if (!result.ok) return result;

  await revalidateOrder(orderId);
  return { ok: true, data: null };
}
